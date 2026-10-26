import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  registerBackgroundAlarmListener,
  registerBackgroundMessageListener,
  setupBackgroundSyncAlarm,
  SYNC_PROMPTS_ALARM,
  TEMPLAGEM_SYNC_PROMPTS_MESSAGE
} from "../background"
import {
  PROMPTS_QUERY_KEY,
  useCreatePromptMutation,
  useDeletePromptMutation,
  usePromptsQuery,
  usePromptSync,
  useUpdatePromptMutation
} from "../hooks/usePromptSync"
import { invalidatePromptsCache } from "../prompts-api"
import {
  enqueueCreatePrompt,
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  generateTempId,
  reconcileSyncResult
} from "../services/sync-queue"
import {
  clearSyncQueue,
  getLastSyncTimestamp,
  getStoredPrompts,
  getSyncQueue,
  getSyncStatus,
  saveLastSyncTimestamp,
  saveStoredPrompts,
  saveSyncStatus
} from "../services/sync-storage"
import { syncPrompts } from "../services/sync.service"
import type { IPrompt, SyncPromptsResultDto } from "../types"
import {
  clearAccessToken,
  clearRefreshToken,
  setAccessToken
} from "../utils/auth"

function makeJwt(expOffsetSeconds: number = 3600): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = btoa(
    JSON.stringify({
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + expOffsetSeconds
    })
  )
  return `${header}.${payload}.sig`
}

describe("Offline-First Sync Engine", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAccessToken()
    clearRefreshToken()
    invalidatePromptsCache()
    await clearSyncQueue()
    await saveLastSyncTimestamp(null)
    await saveSyncStatus("idle")
    await saveStoredPrompts([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("ID generation & Queue Mutations", () => {
    it("generates valid UUID v4", () => {
      const id1 = generateTempId()
      const id2 = generateTempId()
      expect(id1).toBeDefined()
      expect(typeof id1).toBe("string")
      expect(id1).not.toBe(id2)
      // Standard UUID regex
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it("enqueueCreatePrompt adds prompt locally and enqueues to syncQueue.created", async () => {
      const prompt = await enqueueCreatePrompt({
        title: "Offline Prompt",
        body: "Prompt content",
        tags: ["offline", "test"],
        icon: "sparkles"
      })

      expect(prompt._id).toBeDefined()
      expect(prompt.clientTempId).toBe(prompt._id)
      expect(prompt.title).toBe("Offline Prompt")

      const stored = await getStoredPrompts()
      expect(stored).toHaveLength(1)
      expect(stored[0]._id).toBe(prompt._id)

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(1)
      expect(queue.created[0].clientTempId).toBe(prompt.clientTempId)
      expect(queue.created[0].title).toBe("Offline Prompt")
      expect(queue.updated).toHaveLength(0)
      expect(queue.deletedIds).toHaveLength(0)
    })

    it("enqueueUpdatePrompt updates prompt in syncQueue.created directly if not synced yet", async () => {
      const created = await enqueueCreatePrompt({
        title: "Initial Title",
        body: "Initial Body"
      })

      const updated = await enqueueUpdatePrompt({
        clientTempId: created.clientTempId,
        title: "Updated While Offline",
        body: "Updated Body Offline"
      })

      expect(updated).not.toBeNull()
      expect(updated?.title).toBe("Updated While Offline")

      const stored = await getStoredPrompts()
      expect(stored[0].title).toBe("Updated While Offline")

      const queue = await getSyncQueue()
      // Should update inside created, NOT added to updated
      expect(queue.created).toHaveLength(1)
      expect(queue.created[0].title).toBe("Updated While Offline")
      expect(queue.created[0].body).toBe("Updated Body Offline")
      expect(queue.updated).toHaveLength(0)
    })

    it("enqueueUpdatePrompt adds to syncQueue.updated if prompt has server ID", async () => {
      const serverPrompt: IPrompt = {
        _id: "65f1a2b3c4d5e6f7a8b9c0d1",
        title: "Server Prompt",
        body: "Server Body",
        tags: ["server"],
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01")
      }
      await saveStoredPrompts([serverPrompt])

      const updated = await enqueueUpdatePrompt({
        promptId: "65f1a2b3c4d5e6f7a8b9c0d1",
        title: "Modified Server Prompt"
      })

      expect(updated?.title).toBe("Modified Server Prompt")

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(0)
      expect(queue.updated).toHaveLength(1)
      expect(queue.updated[0].promptId).toBe("65f1a2b3c4d5e6f7a8b9c0d1")
      expect(queue.updated[0].title).toBe("Modified Server Prompt")

      // Multiple updates modify the existing entry in queue.updated
      await enqueueUpdatePrompt({
        promptId: "65f1a2b3c4d5e6f7a8b9c0d1",
        body: "Modified Server Body"
      })

      const queueAfterSecondUpdate = await getSyncQueue()
      expect(queueAfterSecondUpdate.updated).toHaveLength(1)
      expect(queueAfterSecondUpdate.updated[0].body).toBe("Modified Server Body")
      expect(queueAfterSecondUpdate.updated[0].title).toBe(
        "Modified Server Prompt"
      )
    })

    it("enqueueDeletePrompt removes offline-created prompt from syncQueue.created without adding to deletedIds", async () => {
      const created = await enqueueCreatePrompt({
        title: "To Be Deleted",
        body: "Body"
      })

      const success = await enqueueDeletePrompt(created.clientTempId!)
      expect(success).toBe(true)

      const stored = await getStoredPrompts()
      expect(stored).toHaveLength(0)

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(0)
      expect(queue.updated).toHaveLength(0)
      expect(queue.deletedIds).toHaveLength(0)
    })

    it("enqueueDeletePrompt adds server ID to syncQueue.deletedIds and removes from syncQueue.updated", async () => {
      const serverId = "65f1a2b3c4d5e6f7a8b9c0d2"
      const serverPrompt: IPrompt = {
        _id: serverId,
        title: "Prompt to delete",
        body: "Body",
        tags: []
      }
      await saveStoredPrompts([serverPrompt])
      await enqueueUpdatePrompt({ promptId: serverId, title: "Updated first" })

      let queue = await getSyncQueue()
      expect(queue.updated).toHaveLength(1)

      const deleted = await enqueueDeletePrompt(serverId)
      expect(deleted).toBe(true)

      const stored = await getStoredPrompts()
      expect(stored).toHaveLength(0)

      queue = await getSyncQueue()
      expect(queue.updated).toHaveLength(0)
      expect(queue.deletedIds).toEqual([serverId])

      // Calling delete again does not duplicate ID
      await enqueueDeletePrompt(serverId)
      queue = await getSyncQueue()
      expect(queue.deletedIds).toEqual([serverId])
    })
  })

  describe("Reconciliation (ID mapping, Server Changes, Timestamps)", () => {
    it("maps clientTempId to serverId in stored prompts and cleans syncQueue.created", async () => {
      const tempId = "temp-uuid-12345"
      await enqueueCreatePrompt({
        clientTempId: tempId,
        title: "Created Offline",
        body: "Body"
      })

      const syncResult: SyncPromptsResultDto = {
        applied: {
          created: [
            {
              clientTempId: tempId,
              serverId: "65f1a2b3c4d5e6f7a8b9c0d9",
              createdAt: "2026-10-25T12:00:00.000Z",
              updatedAt: "2026-10-25T12:00:00.000Z"
            }
          ],
          updated: [],
          deleted: []
        },
        serverChanges: {
          prompts: [],
          deletedIds: []
        },
        syncTimestamp: "2026-10-25T12:00:00.000Z"
      }

      const reconciled = await reconcileSyncResult(syncResult)
      expect(reconciled).toHaveLength(1)
      expect(reconciled[0]._id).toBe("65f1a2b3c4d5e6f7a8b9c0d9")
      expect(reconciled[0].clientTempId).toBeUndefined()

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(0)

      const lastTimestamp = await getLastSyncTimestamp()
      expect(lastTimestamp).toBe("2026-10-25T12:00:00.000Z")
    })

    it("clears confirmed updated and deleted IDs from queue", async () => {
      const serverId1 = "65f1a2b3c4d5e6f7a8b9c011"
      const serverId2 = "65f1a2b3c4d5e6f7a8b9c012"

      await saveStoredPrompts([
        { _id: serverId1, title: "P1", body: "B1", tags: [] }
      ])
      await enqueueUpdatePrompt({ promptId: serverId1, title: "P1 Edited" })
      await enqueueDeletePrompt(serverId2)

      let queue = await getSyncQueue()
      expect(queue.updated).toHaveLength(1)
      expect(queue.deletedIds).toEqual([serverId2])

      const syncResult: SyncPromptsResultDto = {
        applied: {
          created: [],
          updated: [serverId1],
          deleted: [serverId2]
        },
        serverChanges: {
          prompts: [],
          deletedIds: []
        },
        syncTimestamp: "2026-10-25T13:00:00.000Z"
      }

      await reconcileSyncResult(syncResult)

      queue = await getSyncQueue()
      expect(queue.updated).toHaveLength(0)
      expect(queue.deletedIds).toHaveLength(0)
    })

    it("applies serverChanges (adds new prompts, updates existing, removes deleted)", async () => {
      const existingId = "65f1a2b3c4d5e6f7a8b9c021"
      const toDeleteId = "65f1a2b3c4d5e6f7a8b9c022"
      const newServerId = "65f1a2b3c4d5e6f7a8b9c023"

      await saveStoredPrompts([
        { _id: existingId, title: "Old Title", body: "Old Body", tags: [] },
        { _id: toDeleteId, title: "Will Be Deleted", body: "Body", tags: [] }
      ])

      const syncResult: SyncPromptsResultDto = {
        applied: { created: [], updated: [], deleted: [] },
        serverChanges: {
          prompts: [
            {
              _id: existingId,
              title: "New Title From Cloud",
              body: "Updated Body",
              tags: ["cloud"]
            },
            {
              _id: newServerId,
              title: "Brand New From Cloud",
              body: "New Body",
              tags: ["new"]
            }
          ],
          deletedIds: [toDeleteId]
        },
        syncTimestamp: "2026-10-25T14:00:00.000Z"
      }

      const reconciled = await reconcileSyncResult(syncResult)

      expect(reconciled).toHaveLength(2)
      const existingPrompt = reconciled.find((p) => p._id === existingId)
      expect(existingPrompt?.title).toBe("New Title From Cloud")

      const newPrompt = reconciled.find((p) => p._id === newServerId)
      expect(newPrompt?.title).toBe("Brand New From Cloud")

      const deletedPrompt = reconciled.find((p) => p._id === toDeleteId)
      expect(deletedPrompt).toBeUndefined()
    })

    it("reconcileSyncResult skips serverChanges for prompts pending local deletion or local update", async () => {
      const pendingDeleteServerId = "65f1a2b3c4d5e6f7a8b9c031"
      const pendingUpdateServerId = "65f1a2b3c4d5e6f7a8b9c032"

      await saveStoredPrompts([
        { _id: pendingUpdateServerId, title: "Local Draft Update", body: "B", tags: [] }
      ])
      await enqueueDeletePrompt(pendingDeleteServerId)
      await enqueueUpdatePrompt({ promptId: pendingUpdateServerId, title: "Local Draft Update 2" })

      const syncResult: SyncPromptsResultDto = {
        applied: {
          created: [
            {
              clientTempId: "",
              serverId: "ignored",
              createdAt: "2026-10-25T15:00:00.000Z",
              updatedAt: "2026-10-25T15:00:00.000Z"
            }
          ],
          updated: [],
          deleted: []
        },
        serverChanges: {
          prompts: [
            { _id: "", title: "Empty ID", body: "", tags: [] },
            {
              _id: pendingDeleteServerId,
              title: "Server resurrect attempt",
              body: "B",
              tags: []
            },
            {
              _id: pendingUpdateServerId,
              title: "Server overwrite attempt",
              body: "B",
              tags: []
            }
          ],
          deletedIds: []
        },
        syncTimestamp: "2026-10-25T15:00:00.000Z"
      }

      const reconciled = await reconcileSyncResult(syncResult)
      expect(reconciled.find((p) => p._id === pendingDeleteServerId)).toBeUndefined()
      const updatePrompt = reconciled.find((p) => p._id === pendingUpdateServerId)
      expect(updatePrompt?.title).toBe("Local Draft Update 2")
    })

    it("enqueueUpdatePrompt handles unlisted prompt and returns null without targetId", async () => {
      expect(await enqueueUpdatePrompt({})).toBeNull()

      // Update a prompt not currently in stored prompts list
      const updated = await enqueueUpdatePrompt({
        promptId: "non-existent-id",
        title: "Unlisted Prompt",
        body: "Unlisted Body"
      })
      expect(updated).not.toBeNull()
      expect(updated?._id).toBe("non-existent-id")
    })
  })

  describe("Sync Service Execution & Error Handling", () => {
    it("calls sync API with correct payload and updates lastSyncTimestamp", async () => {
      setAccessToken(makeJwt())

      const tempId = "temp-111"
      await enqueueCreatePrompt({
        clientTempId: tempId,
        title: "Payload Check",
        body: "Body"
      })
      await saveLastSyncTimestamp("2026-10-20T00:00:00.000Z")

      let sentPayload: unknown = null
      vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
        if (init?.body) {
          sentPayload = JSON.parse(init.body as string)
        }
        return new Response(
          JSON.stringify({
            applied: {
              created: [
                {
                  clientTempId: tempId,
                  serverId: "65f1a2b3c4d5e6f7a8b9c999",
                  createdAt: "2026-10-25T15:00:00.000Z",
                  updatedAt: "2026-10-25T15:00:00.000Z"
                }
              ],
              updated: [],
              deleted: []
            },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T15:00:00.000Z"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      })

      const res = await syncPrompts()
      expect(res.ok).toBe(true)
      expect(res.status).toBe("idle")

      expect(sentPayload).toEqual({
        lastSyncTimestamp: "2026-10-20T00:00:00.000Z",
        created: [
          expect.objectContaining({
            clientTempId: tempId,
            title: "Payload Check"
          })
        ],
        updated: [],
        deletedIds: []
      })

      const lastTimestamp = await getLastSyncTimestamp()
      expect(lastTimestamp).toBe("2026-10-25T15:00:00.000Z")
    })

    it("prevents race conditions with single in-flight sync promise", async () => {
      setAccessToken(makeJwt())

      let fetchCallCount = 0
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        fetchCallCount++
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new Response(
          JSON.stringify({
            applied: { created: [], updated: [], deleted: [] },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T15:30:00.000Z"
          }),
          { status: 200 }
        )
      })

      const [res1, res2, res3] = await Promise.all([
        syncPrompts(),
        syncPrompts(),
        syncPrompts()
      ])

      expect(fetchCallCount).toBe(1)
      expect(res1.ok).toBe(true)
      expect(res2.ok).toBe(true)
      expect(res3.ok).toBe(true)
    })

    it("handles FEATURE_CLOUD_SYNC disabled (403 Forbidden) by setting status to local_only without UI error", async () => {
      setAccessToken(makeJwt())

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Cloud sync is temporarily disabled on the server"
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )

      const res = await syncPrompts()
      expect(res.ok).toBe(true)
      expect(res.status).toBe("local_only")
      const status = await getSyncStatus()
      expect(status).toBe("local_only")
    })

    it("handles offline network gracefully without throwing and leaves syncQueue intact", async () => {
      setAccessToken(makeJwt())

      await enqueueCreatePrompt({ title: "Offline item", body: "Offline body" })

      // Mock offline via navigator.onLine
      const originalOnLine = navigator.onLine
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true
      })

      const res = await syncPrompts()
      expect(res.ok).toBe(false)
      expect(res.status).toBe("offline")

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(1)

      Object.defineProperty(navigator, "onLine", {
        value: originalOnLine,
        configurable: true
      })
    })

    it("handles fetch network failure gracefully", async () => {
      setAccessToken(makeJwt())

      vi.spyOn(global, "fetch").mockRejectedValueOnce(
        new Error("Network down")
      )

      const res = await syncPrompts()
      expect(res.ok).toBe(false)
      expect(res.status).toBe("offline")
    })

    it("handles 401 Unauthorized by setting status to error", async () => {
      setAccessToken(makeJwt())

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401
        })
      )

      const res = await syncPrompts()
      expect(res.ok).toBe(false)
      expect(res.status).toBe("error")
    })
  })

  describe("Background Alarms & Messages", () => {
    it("setupBackgroundSyncAlarm creates sync-prompts alarm with 10 min period", () => {
      const createAlarmMock = vi.fn()
      const getAlarmMock = vi.fn((_name, cb) => cb(null))

      vi.stubGlobal("chrome", {
        alarms: {
          get: getAlarmMock,
          create: createAlarmMock
        }
      })

      setupBackgroundSyncAlarm()
      expect(getAlarmMock).toHaveBeenCalledWith(
        SYNC_PROMPTS_ALARM,
        expect.any(Function)
      )
      expect(createAlarmMock).toHaveBeenCalledWith(SYNC_PROMPTS_ALARM, {
        periodInMinutes: 10
      })
    })

    it("registerBackgroundAlarmListener runs sync on sync-prompts alarm", async () => {
      let alarmCallback: ((alarm: { name: string }) => void) | null = null
      vi.stubGlobal("chrome", {
        alarms: {
          onAlarm: {
            addListener: vi.fn((cb) => {
              alarmCallback = cb
            })
          }
        }
      })

      registerBackgroundAlarmListener()
      expect(alarmCallback).not.toBeNull()

      setAccessToken(makeJwt())
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applied: { created: [], updated: [], deleted: [] },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T16:00:00.000Z"
          }),
          { status: 200 }
        )
      )

      alarmCallback!({ name: SYNC_PROMPTS_ALARM })
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled()
      })
    })

    it("handles TEMPLAGEM_SYNC_PROMPTS message in background message listener", async () => {
      let messageCallback:
        | ((
            msg: unknown,
            sender: unknown,
            sendResponse: (res: unknown) => void
          ) => boolean)
        | null = null
      vi.stubGlobal("chrome", {
        runtime: {
          onMessage: {
            addListener: vi.fn((cb) => {
              messageCallback = cb
            })
          }
        }
      })

      registerBackgroundMessageListener()
      expect(messageCallback).not.toBeNull()

      setAccessToken(makeJwt())
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applied: { created: [], updated: [], deleted: [] },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T16:00:00.000Z"
          }),
          { status: 200 }
        )
      )

      const sendResponse = vi.fn()
      const handled = messageCallback!(
        { type: TEMPLAGEM_SYNC_PROMPTS_MESSAGE },
        {},
        sendResponse
      )
      expect(handled).toBe(true)

      await waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ ok: true, status: "idle" })
        )
      })
    })
  })

  describe("TanStack Query Hooks Integration", () => {
    let queryClient: QueryClient

    beforeEach(() => {
      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false }
        }
      })
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    it("usePromptsQuery returns stored prompts and triggers background sync", async () => {
      await saveStoredPrompts([
        {
          _id: "p-1",
          title: "Stored Prompt",
          body: "Stored Body",
          tags: ["stored"]
        }
      ])

      const { result } = renderHook(() => usePromptsQuery(), { wrapper })

      await waitFor(() => {
        expect(result.current.data).toBeDefined()
      })

      expect(result.current.data?.[0].title).toBe("Stored Prompt")
    })

    it("useCreatePromptMutation enqueues prompt, updates TanStack Query cache, and triggers debounced sync", async () => {
      setAccessToken(makeJwt())
      vi.useFakeTimers()

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            applied: { created: [], updated: [], deleted: [] },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T17:00:00.000Z"
          }),
          { status: 200 }
        )
      )

      const { result } = renderHook(() => useCreatePromptMutation(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync({
          title: "TanStack Prompt",
          body: "TanStack Body",
          tags: ["tanstack"]
        })
      })

      // Query cache updated
      const cached = queryClient.getQueryData<IPrompt[]>(PROMPTS_QUERY_KEY)
      expect(cached).toBeDefined()
      expect(cached?.[0].title).toBe("TanStack Prompt")

      // Fast forward debounce timer (1500ms)
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })

      expect(fetchSpy).toHaveBeenCalled()
    })

    it("useUpdatePromptMutation and useDeletePromptMutation update query cache correctly", async () => {
      const serverId = "65f1a2b3c4d5e6f7a8b9c033"
      await saveStoredPrompts([
        {
          _id: serverId,
          title: "Original",
          body: "Body",
          tags: []
        }
      ])
      queryClient.setQueryData<IPrompt[]>(PROMPTS_QUERY_KEY, [
        { _id: serverId, title: "Original", body: "Body", tags: [] }
      ])

      const { result: updateHook } = renderHook(
        () => useUpdatePromptMutation(),
        { wrapper }
      )

      await act(async () => {
        await updateHook.current.mutateAsync({
          promptId: serverId,
          title: "Title Changed"
        })
      })

      let cached = queryClient.getQueryData<IPrompt[]>(PROMPTS_QUERY_KEY)
      expect(cached?.[0].title).toBe("Title Changed")

      const { result: deleteHook } = renderHook(
        () => useDeletePromptMutation(),
        { wrapper }
      )

      await act(async () => {
        await deleteHook.current.mutateAsync(serverId)
      })

      cached = queryClient.getQueryData<IPrompt[]>(PROMPTS_QUERY_KEY)
      expect(cached).toHaveLength(0)
    })

    it("usePromptSync exposes syncNow, status, and lastSyncTimestamp", async () => {
      setAccessToken(makeJwt())
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            applied: { created: [], updated: [], deleted: [] },
            serverChanges: { prompts: [], deletedIds: [] },
            syncTimestamp: "2026-10-25T18:00:00.000Z"
          }),
          { status: 200 }
        )
      )

      const { result } = renderHook(() => usePromptSync(), { wrapper })

      await act(async () => {
        await result.current.syncNow()
      })

      expect(result.current.status).toBe("idle")
      expect(result.current.lastSyncTimestamp).toBe("2026-10-25T18:00:00.000Z")
    })

    it("handles storage changes and online events for usePromptsQuery and usePromptSync", async () => {
      let storageListener:
        | ((changes: Record<string, chrome.storage.StorageChange>) => void)
        | undefined
      const addListener = vi.fn((fn) => {
        storageListener = fn
      })
      const removeListener = vi.fn()

      const stub = {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          },
          onChanged: {
            addListener,
            removeListener
          }
        }
      }
      vi.stubGlobal("chrome", stub)

      // Test usePromptsQuery when enabled=false
      const { unmount: unmountQueryDisabled } = renderHook(
        () => usePromptsQuery({ enabled: false }),
        { wrapper }
      )
      unmountQueryDisabled()

      // Test usePromptsQuery when enabled=true
      const { unmount: unmountQuery } = renderHook(
        () => usePromptsQuery({ enabled: true }),
        { wrapper }
      )

      // Trigger onChanged for PROMPTS_CACHE_STORAGE_KEY
      act(() => {
        storageListener?.({
          templagem_prompts_cache: {
            newValue: []
          }
        })
      })

      // Trigger online event on window
      act(() => {
        window.dispatchEvent(new Event("online"))
      })

      unmountQuery()

      // Test mutations with tempId and matches
      queryClient.setQueryData<IPrompt[]>(PROMPTS_QUERY_KEY, [
        { _id: "existing-1", id: "existing-1", title: "Existing", body: "B", tags: [] }
      ])

      const { result: createHook } = renderHook(
        () => useCreatePromptMutation(),
        { wrapper }
      )
      await act(async () => {
        await createHook.current.mutateAsync({
          title: "Temporary",
          body: "Temp body",
          clientTempId: "temp-unique-123"
        })
      })

      const { result: updateHook } = renderHook(
        () => useUpdatePromptMutation(),
        { wrapper }
      )
      await act(async () => {
        await updateHook.current.mutateAsync({
          clientTempId: "temp-unique-123",
          title: "Temporary Updated"
        })
      })

      await act(async () => {
        await updateHook.current.mutateAsync({
          promptId: "existing-1",
          title: "Existing Updated"
        })
      })

      const { result: deleteHook } = renderHook(
        () => useDeletePromptMutation(),
        { wrapper }
      )
      await act(async () => {
        await deleteHook.current.mutateAsync("temp-unique-123")
      })
      await act(async () => {
        await deleteHook.current.mutateAsync("existing-1")
      })

      // Test usePromptSync storage listener for status and timestamp
      const { result: syncHook, unmount: unmountSync } = renderHook(
        () => usePromptSync(),
        { wrapper }
      )

      act(() => {
        storageListener?.({
          templagem_sync_status: { newValue: "syncing" },
          templagem_last_sync_timestamp: { newValue: "2026-10-26T12:00:00.000Z" }
        })
      })

      await waitFor(() => {
        expect(syncHook.current.status).toBe("syncing")
        expect(syncHook.current.lastSyncTimestamp).toBe("2026-10-26T12:00:00.000Z")
      })

      act(() => {
        window.dispatchEvent(new Event("online"))
      })

      unmountSync()
      vi.unstubAllGlobals()
    })
  })
})
