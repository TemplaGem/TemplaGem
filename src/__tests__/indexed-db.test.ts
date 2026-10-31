import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearPromptsDB,
  DB_NAME,
  DB_VERSION,
  deleteMetaDB,
  deletePromptDB,
  getAllPromptsDB,
  getMetaDB,
  getPromptDB,
  isIndexedDBAvailable,
  META_STORE,
  openDB,
  PROMPTS_STORE,
  putPromptDB,
  putPromptsDB,
  replacePromptsDB,
  resetFallbackDB,
  setMetaDB
} from "../services/indexed-db"
import {
  generateTempId,
  clearSyncQueue,
  getLastSyncTimestamp,
  getStoredPrompts,
  getSyncQueue,
  getSyncStatus,
  saveLastSyncTimestamp,
  saveStoredPrompts,
  saveSyncQueue,
  saveSyncStatus,
  subscribeSyncStatus
} from "../services/sync-storage"
import { setCachedPrompts } from "../prompts-api"
import type { IPrompt } from "../types"

describe("IndexedDB Storage Layer (templagem_db)", () => {
  beforeEach(async () => {
    await resetFallbackDB()
    await clearSyncQueue()
  })

  afterEach(async () => {
    await resetFallbackDB()
  })

  describe("Fallback In-Memory DB (Node / Test Environment)", () => {
    it("reports availability based on global/window indexedDB", () => {
      // In JSDOM without fake-indexeddb, global.indexedDB is undefined
      const available = isIndexedDBAvailable()
      expect(typeof available).toBe("boolean")
    })

    it("puts, gets, and lists prompts in fallback mode", async () => {
      const promptA: IPrompt = {
        _id: "prompt-1",
        title: "Prompt One",
        body: "Body 1",
        tags: ["tagA"],
        icon: "icon-1",
        access: "private"
      }
      const promptB: IPrompt = {
        _id: "prompt-2",
        title: "Prompt Two",
        body: "Body 2",
        tags: ["tagB"],
        icon: "icon-2",
        access: "public"
      }

      await putPromptDB(promptA)
      await putPromptDB(promptB)

      const all = await getAllPromptsDB()
      expect(all).toHaveLength(2)
      expect(all.map((p) => p._id)).toEqual(
        expect.arrayContaining(["prompt-1", "prompt-2"])
      )

      const fetchedA = await getPromptDB("prompt-1")
      expect(fetchedA).toEqual(promptA)

      const notFound = await getPromptDB("non-existent")
      expect(notFound).toBeNull()
    })

    it("batches multiple prompts with putPromptsDB", async () => {
      const prompts: IPrompt[] = [
        {
          _id: "batch-1",
          title: "B1",
          body: "Body 1",
          tags: [],
          access: "private"
        },
        {
          _id: "batch-2",
          title: "B2",
          body: "Body 2",
          tags: [],
          access: "public"
        }
      ]

      await putPromptsDB(prompts)
      const list = await getAllPromptsDB()
      expect(list).toHaveLength(2)

      // Test empty batch returns early
      await putPromptsDB([])
      expect(await getAllPromptsDB()).toHaveLength(2)
    })

    it("deletes a prompt and clears all prompts", async () => {
      const prompt: IPrompt = {
        _id: "to-delete",
        title: "Delete Me",
        body: "Body",
        tags: [],
        access: "private"
      }
      await putPromptDB(prompt)
      expect(await getPromptDB("to-delete")).not.toBeNull()

      await deletePromptDB("to-delete")
      expect(await getPromptDB("to-delete")).toBeNull()

      await putPromptDB({
        _id: "stay",
        title: "Stay",
        body: "B",
        tags: [],
        access: "private"
      })
      await clearPromptsDB()
      expect(await getAllPromptsDB()).toHaveLength(0)
    })

    it("handles sync_meta store operations (getMetaDB, setMetaDB, deleteMetaDB)", async () => {
      expect(await getMetaDB("test_key")).toBeNull()

      await setMetaDB("test_key", { lastSync: "2026-10-25T16:00:00.000Z" })
      const val = await getMetaDB<{ lastSync: string }>("test_key")
      expect(val).toEqual({ lastSync: "2026-10-25T16:00:00.000Z" })

      await deleteMetaDB("test_key")
      expect(await getMetaDB("test_key")).toBeNull()
    })

    it("normalizes prompts lacking _id using id or clientTempId in putPromptDB", async () => {
      const withOnlyClientTempId: IPrompt = {
        clientTempId: "temp-uuid-123",
        title: "Offline Draft",
        body: "Draft body",
        tags: [],
        access: "private"
      }
      await putPromptDB(withOnlyClientTempId)
      const retrieved = await getPromptDB("temp-uuid-123")
      expect(retrieved).not.toBeNull()
      expect(retrieved?._id).toBe("temp-uuid-123")
    })
  })

  describe("Integration with sync-storage", () => {
    it("covers sync-storage chrome and localStorage fallback branches", async () => {
      const mockStorage: Record<string, unknown> = {}
      const stub = {
        storage: {
          local: {
            get: vi.fn(async (keys: string | string[]) => {
              if (typeof keys === "string") {
                return { [keys]: mockStorage[keys] }
              }
              const res: Record<string, unknown> = {}
              for (const k of keys) res[k] = mockStorage[k]
              return res
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
              Object.assign(mockStorage, items)
            }),
            remove: vi.fn(async (key: string) => {
              delete mockStorage[key]
            })
          }
        }
      }
      vi.stubGlobal("chrome", stub)

      // Test status
      await saveSyncStatus("syncing")
      expect(await getSyncStatus()).toBe("syncing")

      const listener = vi.fn()
      const unsub = subscribeSyncStatus(listener)
      await saveSyncStatus("idle")
      expect(listener).toHaveBeenCalledWith("idle")
      unsub()

      // Test timestamp
      await saveLastSyncTimestamp("2026-10-26T15:00:00.000Z")
      expect(await getLastSyncTimestamp()).toBe("2026-10-26T15:00:00.000Z")

      // Test stored prompts via chrome and localStorage
      await saveStoredPrompts([
        { _id: "p1", title: "P1", body: "B1", tags: [] }
      ])
      const stored = await getStoredPrompts()
      expect(stored).toHaveLength(1)

      // Test localStorage branch directly
      await deleteMetaDB("syncStatus")
      await deleteMetaDB("lastSyncTimestamp")
      delete (mockStorage as Record<string, unknown>)["templagem_sync_status"]
      delete (mockStorage as Record<string, unknown>)["templagem_last_sync_timestamp"]
      delete (mockStorage as Record<string, unknown>)["templagem_prompts_cache"]

      window.localStorage.setItem("templagem_sync_status", "error")
      window.localStorage.setItem("templagem_last_sync_timestamp", "2026-10-26T16:00:00.000Z")
      window.localStorage.setItem(
        "templagem_prompts_cache",
        JSON.stringify([{ _id: "p2", title: "P2", body: "B2", tags: [] }])
      )

      // Mock chrome throws to force fallback to localStorage
      vi.spyOn(stub.storage.local, "get").mockRejectedValue(new Error("Chrome down"))

      expect(await getSyncStatus()).toBe("error")
      expect(await getLastSyncTimestamp()).toBe("2026-10-26T16:00:00.000Z")
      const stored2 = await getStoredPrompts()
      expect(stored2.length).toBeGreaterThanOrEqual(1)

      // Test chrome.storage.local branch in getStoredPrompts
      await clearPromptsDB()
      await deleteMetaDB("prompts_initialized")
      setCachedPrompts([])
      window.localStorage.clear()
      vi.spyOn(stub.storage.local, "get").mockResolvedValue({
        templagem_prompts_cache: [{ _id: "chrome-p", title: "Chrome P", body: "B", tags: [] }]
      })
      const storedFromChrome = await getStoredPrompts()
      expect(storedFromChrome).toHaveLength(1)
      expect(storedFromChrome[0]._id).toBe("chrome-p")

      // Test chrome.storage.local branch in getLastSyncTimestamp
      await deleteMetaDB("lastSyncTimestamp")
      vi.spyOn(stub.storage.local, "get").mockResolvedValue({
        templagem_last_sync_timestamp: "2026-10-26T20:00:00.000Z"
      })
      expect(await getLastSyncTimestamp()).toBe("2026-10-26T20:00:00.000Z")

      // Test chrome.storage.local branch in getSyncStatus
      await deleteMetaDB("syncStatus")
      vi.spyOn(stub.storage.local, "get").mockResolvedValue({
        templagem_sync_status: "offline"
      })
      expect(await getSyncStatus()).toBe("offline")

      // Test saveStoredPrompts with empty array
      await saveStoredPrompts([])
      expect(await getStoredPrompts()).toEqual([])

      // Test getStoredPrompts with non-empty cached prompts when DB not initialized
      await clearPromptsDB()
      await deleteMetaDB("prompts_initialized")
      setCachedPrompts([{ _id: "cached-1", title: "Cached", body: "B", tags: [] }])
      const fromCached = await getStoredPrompts()
      expect(fromCached).toHaveLength(1)
      expect(fromCached[0]._id).toBe("cached-1")

      vi.unstubAllGlobals()
    })

    it("covers getStoredPrompts fallback when idb has prompts but isInit is false, and empty array returns", async () => {
      // 1. Prompts in DB but prompts_initialized is not set
      await clearPromptsDB()
      await deleteMetaDB("prompts_initialized")
      await putPromptsDB([{ _id: "init-p1", title: "Init P1", body: "B", tags: [] }])
      const fromDB = await getStoredPrompts()
      expect(fromDB).toHaveLength(1)
      expect(fromDB[0]._id).toBe("init-p1")

      // 2. chrome.storage.local empty or not array
      await clearPromptsDB()
      await deleteMetaDB("prompts_initialized")
      setCachedPrompts([])
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn(async () => ({ templagem_prompts_cache: null })),
            set: vi.fn(),
            remove: vi.fn()
          }
        }
      })
      const fallbackEmpty = await getStoredPrompts()
      expect(fallbackEmpty).toBeDefined()
      vi.unstubAllGlobals()
    })

    it("covers sync-storage queue fallback branches, corrupted data, and inMemorySyncQueue", async () => {
      // 1. In-memory queue fallback
      await saveSyncQueue({
        created: [{ clientTempId: "mem-1", title: "Mem 1", body: "B1" }],
        updated: [],
        deletedIds: []
      })
      await deleteMetaDB("syncQueue")
      const fromMem = await getSyncQueue()
      expect(fromMem.created).toHaveLength(1)

      // 2. Corrupted localStorage queue
      window.localStorage.setItem("templagem_sync_queue", "{corrupted json")
      const fallbackQueue = await getSyncQueue()
      expect(fallbackQueue).toBeDefined()

      // 3. Queue from chrome.storage
      const mockStorage: Record<string, unknown> = {
        templagem_sync_queue: {
          created: [{ clientTempId: "chr-1", title: "Chr 1", body: "B" }],
          updated: [],
          deletedIds: []
        }
      }
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
            set: vi.fn(),
            remove: vi.fn()
          }
        }
      })
      await deleteMetaDB("syncQueue")
      const fromChrome = await getSyncQueue()
      expect(fromChrome.created).toHaveLength(1)

      // 4. Test generateTempId
      const id1 = generateTempId()
      expect(id1).toBeDefined()
      const origUUID = globalThis.crypto?.randomUUID
      if (globalThis.crypto) {
        ;(globalThis.crypto as { randomUUID?: unknown }).randomUUID = undefined
      }
      const id2 = generateTempId()
      expect(id2).toBeDefined()
      if (globalThis.crypto && origUUID) {
        globalThis.crypto.randomUUID = origUUID
      }

      vi.unstubAllGlobals()
    })

    it("getStoredPrompts and saveStoredPrompts persist and retrieve from IndexedDB", async () => {
      const prompts: IPrompt[] = [
        {
          _id: "p-100",
          title: "Stored 1",
          body: "B 1",
          tags: ["t1"],
          access: "private"
        },
        {
          _id: "p-200",
          title: "Stored 2",
          body: "B 2",
          tags: ["t2"],
          access: "public"
        }
      ]

      await saveStoredPrompts(prompts)
      const loaded = await getStoredPrompts()
      expect(loaded).toHaveLength(2)
      expect(loaded.map((p) => p._id)).toEqual(["p-100", "p-200"])
    })
  })

  describe("Simulated Browser IndexedDB Mock", () => {
    it("handles IDB open, upgrade, transactions, and store operations", async () => {
      const memoryStores: Record<string, Map<string, unknown>> = {
        [PROMPTS_STORE]: new Map(),
        [META_STORE]: new Map()
      }

      const mockIndex = {
        name: "",
        keyPath: "",
        unique: false
      }

      interface MockRequest<T = unknown> {
        result?: T
        error?: unknown
        onsuccess: ((ev: { target: MockRequest<T> }) => void) | null
        onerror: ((ev: { target: MockRequest<T> }) => void) | null
        onupgradeneeded?: ((ev: { target: MockRequest<T> }) => void) | null
      }

      const mockObjectStore = (storeName: string) => ({
        createIndex: vi.fn((name: string, keyPath: string, opts?: unknown) => {
          return { ...mockIndex, name, keyPath, ...((opts as object) || {}) }
        }),
        put: vi.fn((val: unknown) => {
          const prompt = val as IPrompt & { key?: string }
          const key = storeName === PROMPTS_STORE ? prompt._id : prompt.key
          if (key) {
            memoryStores[storeName].set(key, val)
          }
          const req: MockRequest = { onsuccess: null, onerror: null }
          setTimeout(() => req.onsuccess?.({ target: req }), 0)
          return req
        }),
        get: vi.fn((key: string) => {
          const result = memoryStores[storeName].get(key)
          const req: MockRequest = { onsuccess: null, onerror: null, result }
          setTimeout(() => req.onsuccess?.({ target: req }), 0)
          return req
        }),
        getAll: vi.fn(() => {
          const result = Array.from(memoryStores[storeName].values())
          const req: MockRequest = { onsuccess: null, onerror: null, result }
          setTimeout(() => req.onsuccess?.({ target: req }), 0)
          return req
        }),
        delete: vi.fn((key: string) => {
          memoryStores[storeName].delete(key)
          const req: MockRequest = { onsuccess: null, onerror: null }
          setTimeout(() => req.onsuccess?.({ target: req }), 0)
          return req
        }),
        clear: vi.fn(() => {
          memoryStores[storeName].clear()
          const req: MockRequest = { onsuccess: null, onerror: null }
          setTimeout(() => req.onsuccess?.({ target: req }), 0)
          return req
        })
      })

      const mockDb = {
        objectStoreNames: {
          contains: vi.fn(() => false)
        },
        createObjectStore: vi.fn((name: string) => mockObjectStore(name)),
        transaction: vi.fn(() => {
          const tx: {
            objectStore: (s: string) => ReturnType<typeof mockObjectStore>
            oncomplete: (() => void) | null
            onerror: (() => void) | null
          } = {
            objectStore: vi.fn((s: string) => mockObjectStore(s)),
            oncomplete: null,
            onerror: null
          }
          setTimeout(() => tx.oncomplete?.(), 0)
          return tx
        }),
        close: vi.fn(),
        onversionchange: null
      }

      const mockFactory = {
        open: vi.fn(() => {
          const req: MockRequest<typeof mockDb> = {
            result: mockDb,
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null
          }
          setTimeout(() => {
            req.onupgradeneeded?.({ target: req })
            req.onsuccess?.({ target: req })
          }, 0)
          return req
        })
      }

      // Temporarily mock globalThis.indexedDB
      const originalIDB = globalThis.indexedDB
      try {
        // @ts-expect-error Mocking global IDB
        globalThis.indexedDB = mockFactory

        await resetFallbackDB()
        const db = await openDB()
        expect(db).toBe(mockDb)
        expect(mockFactory.open).toHaveBeenCalledWith(DB_NAME, DB_VERSION)
        expect(mockDb.createObjectStore).toHaveBeenCalledWith(
          PROMPTS_STORE,
          { keyPath: "_id" }
        )
        expect(mockDb.createObjectStore).toHaveBeenCalledWith(
          META_STORE,
          { keyPath: "key" }
        )

        // Test DB operations with simulated IDB
        const testPrompt: IPrompt = {
          _id: "idb-test-1",
          title: "Browser IDB Prompt",
          body: "Simulated IDB body",
          tags: ["idb"],
          access: "private"
        }

        await putPromptDB(testPrompt)
        const allPrompts = await getAllPromptsDB()
        expect(allPrompts).toContainEqual(testPrompt)

        const single = await getPromptDB("idb-test-1")
        expect(single).toEqual(testPrompt)

        await deletePromptDB("idb-test-1")
        expect(await getPromptDB("idb-test-1")).toBeNull()

        // Test metadata
        await setMetaDB("status", "synced")
        const metaVal = await getMetaDB<string>("status")
        expect(metaVal).toBe("synced")

        await deleteMetaDB("status")
        expect(await getMetaDB("status")).toBeNull()

        // Test putPromptsDB and prompts with id / clientTempId or without key
        await putPromptsDB([
          { id: "with-id-only", title: "With ID", body: "B", tags: [] },
          { clientTempId: "with-clientTempId", title: "With TempId", body: "B", tags: [] },
          { title: "No Key", body: "B", tags: [] }
        ])
        expect(await getPromptDB("with-id-only")).not.toBeNull()
        expect(await getPromptDB("with-clientTempId")).not.toBeNull()

        // Test putPromptDB with invalid key
        await putPromptDB({ title: "No key", body: "B", tags: [] })
      } finally {
        // Restore
        globalThis.indexedDB = originalIDB
        await resetFallbackDB()
      }
    })

    it("handles putPromptsDB in fallback mode with different key formats or missing keys", async () => {
      await putPromptsDB([
        { id: "fallback-id", title: "Fallback ID", body: "B", tags: [] },
        { clientTempId: "fallback-temp", title: "Fallback Temp", body: "B", tags: [] },
        { title: "No key", body: "B", tags: [] }
      ])
      expect(await getPromptDB("fallback-id")).not.toBeNull()
      expect(await getPromptDB("fallback-temp")).not.toBeNull()
      await putPromptDB({ title: "No key fallback", body: "B", tags: [] })
    })
    it("replaces all prompts atomically with replacePromptsDB in IDB and fallback modes", async () => {
      await putPromptsDB([
        { _id: "old-1", title: "Old 1", body: "B", tags: [] },
        { _id: "old-2", title: "Old 2", body: "B", tags: [] }
      ])
      expect(await getAllPromptsDB()).toHaveLength(2)

      await replacePromptsDB([
        { _id: "new-1", title: "New 1", body: "B", tags: [] }
      ])
      const prompts = await getAllPromptsDB()
      expect(prompts).toHaveLength(1)
      expect(prompts[0]._id).toBe("new-1")
    })

  })
})
