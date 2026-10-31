export function generateTempId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
import {
  getCachedPrompts,
  PROMPTS_CACHE_STORAGE_KEY,
  setCachedPrompts
} from "../prompts-api"
import type { IPrompt, SyncQueue, SyncStatus } from "../types"
import {
  getAllPromptsDB,
  getMetaDB,
  putPromptsDB,
  replacePromptsDB,
  setMetaDB
} from "./indexed-db"
import { seedInitialPrompts } from "./seed-prompts"

export const SYNC_QUEUE_STORAGE_KEY = "templagem_sync_queue"
export const LAST_SYNC_TIMESTAMP_STORAGE_KEY = "templagem_last_sync_timestamp"
export const SYNC_STATUS_STORAGE_KEY = "templagem_sync_status"

export const EMPTY_SYNC_QUEUE: SyncQueue = {
  created: [],
  updated: [],
  deletedIds: []
}

let inMemorySyncQueue: SyncQueue | null = null
let inMemoryLastSyncTimestamp: string | null = null
let inMemorySyncStatus: SyncStatus = "idle"
const syncStatusListeners = new Set<(status: SyncStatus) => void>()

export function subscribeSyncStatus(
  listener: (status: SyncStatus) => void
): () => void {
  syncStatusListeners.add(listener)
  return () => {
    syncStatusListeners.delete(listener)
  }
}

function notifySyncStatusListeners(status: SyncStatus): void {
  inMemorySyncStatus = status
  syncStatusListeners.forEach((listener) => listener(status))
}

export async function getSyncQueue(): Promise<SyncQueue> {
  // 1. Try to read from IndexedDB
  try {
    const metaQueue = await getMetaDB<SyncQueue>("syncQueue")
    if (metaQueue && typeof metaQueue === "object") {
      const queue: SyncQueue = {
        created: Array.isArray(metaQueue.created) ? metaQueue.created : [],
        updated: Array.isArray(metaQueue.updated) ? metaQueue.updated : [],
        deletedIds: Array.isArray(metaQueue.deletedIds)
          ? metaQueue.deletedIds
          : []
      }
      inMemorySyncQueue = queue
      return queue
    }
  } catch {
    // fallback
  }

  // 2. Try chrome.storage.local
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(SYNC_QUEUE_STORAGE_KEY)
      const raw = stored?.[SYNC_QUEUE_STORAGE_KEY]
      if (raw && typeof raw === "object") {
        const queue: SyncQueue = {
          created: Array.isArray(raw.created) ? raw.created : [],
          updated: Array.isArray(raw.updated) ? raw.updated : [],
          deletedIds: Array.isArray(raw.deletedIds) ? raw.deletedIds : []
        }
        inMemorySyncQueue = queue
        void setMetaDB("syncQueue", queue).catch(() => null)
        return queue
      }
    } catch {
      // fallback
    }
  }

  // 3. Try localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(SYNC_QUEUE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SyncQueue>
        const queue: SyncQueue = {
          created: Array.isArray(parsed.created) ? parsed.created : [],
          updated: Array.isArray(parsed.updated) ? parsed.updated : [],
          deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : []
        }
        inMemorySyncQueue = queue
        void setMetaDB("syncQueue", queue).catch(() => null)
        return queue
      }
    } catch {
      // fallback
    }
  }

  if (inMemorySyncQueue) {
    return {
      created: [...inMemorySyncQueue.created],
      updated: [...inMemorySyncQueue.updated],
      deletedIds: [...inMemorySyncQueue.deletedIds]
    }
  }

  return { created: [], updated: [], deletedIds: [] }
}

export async function saveSyncQueue(queue: SyncQueue): Promise<void> {
  const normalized: SyncQueue = {
    created: Array.isArray(queue.created) ? queue.created : [],
    updated: Array.isArray(queue.updated) ? queue.updated : [],
    deletedIds: Array.isArray(queue.deletedIds) ? queue.deletedIds : []
  }
  inMemorySyncQueue = normalized

  // Persist to IndexedDB
  void setMetaDB("syncQueue", normalized).catch(() => null)

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        SYNC_QUEUE_STORAGE_KEY,
        JSON.stringify(normalized)
      )
    } catch {
      // ignore
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [SYNC_QUEUE_STORAGE_KEY]: normalized })
    } catch {
      // ignore
    }
  }
}

export async function clearSyncQueue(): Promise<void> {
  await saveSyncQueue({ created: [], updated: [], deletedIds: [] })
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  // 1. Try IndexedDB
  try {
    const metaTs = await getMetaDB<string>("lastSyncTimestamp")
    if (typeof metaTs === "string") {
      inMemoryLastSyncTimestamp = metaTs
      return metaTs
    }
  } catch {
    // fallback
  }

  // 2. Try chrome.storage.local
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(
        LAST_SYNC_TIMESTAMP_STORAGE_KEY
      )
      const raw = stored?.[LAST_SYNC_TIMESTAMP_STORAGE_KEY]
      if (typeof raw === "string") {
        inMemoryLastSyncTimestamp = raw
        void setMetaDB("lastSyncTimestamp", raw).catch(() => null)
        return raw
      }
    } catch {
      // fallback
    }
  }

  // 3. Try localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(LAST_SYNC_TIMESTAMP_STORAGE_KEY)
    if (raw) {
      inMemoryLastSyncTimestamp = raw
      void setMetaDB("lastSyncTimestamp", raw).catch(() => null)
      return raw
    }
  }

  return inMemoryLastSyncTimestamp
}

export async function saveLastSyncTimestamp(
  timestamp: string | null
): Promise<void> {
  inMemoryLastSyncTimestamp = timestamp

  // Persist to IndexedDB
  if (timestamp) {
    void setMetaDB("lastSyncTimestamp", timestamp).catch(() => null)
  } else {
    void setMetaDB("lastSyncTimestamp", null).catch(() => null)
  }

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      if (timestamp) {
        window.localStorage.setItem(LAST_SYNC_TIMESTAMP_STORAGE_KEY, timestamp)
      } else {
        window.localStorage.removeItem(LAST_SYNC_TIMESTAMP_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      if (timestamp) {
        await chrome.storage.local.set({
          [LAST_SYNC_TIMESTAMP_STORAGE_KEY]: timestamp
        })
      } else {
        await chrome.storage.local.remove(LAST_SYNC_TIMESTAMP_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }
}

export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const status = await getMetaDB<SyncStatus>("syncStatus")
    if (status) {
      inMemorySyncStatus = status
      return status
    }
  } catch {
    // ignore
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(SYNC_STATUS_STORAGE_KEY)
      const raw = stored?.[SYNC_STATUS_STORAGE_KEY]
      if (typeof raw === "string") {
        inMemorySyncStatus = raw as SyncStatus
        return raw as SyncStatus
      }
    } catch {
      // fallback
    }
  }

  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(SYNC_STATUS_STORAGE_KEY)
    if (raw) {
      inMemorySyncStatus = raw as SyncStatus
      return raw as SyncStatus
    }
  }

  return inMemorySyncStatus
}

export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  notifySyncStatusListeners(status)
  void setMetaDB("syncStatus", status).catch(() => null)

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(SYNC_STATUS_STORAGE_KEY, status)
    } catch {
      // ignore
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [SYNC_STATUS_STORAGE_KEY]: status })
    } catch {
      // ignore
    }
  }
}

export async function getStoredPrompts(): Promise<IPrompt[]> {
  // 1. Local-First: Check IndexedDB
  try {
    const isInit = await getMetaDB<boolean>("prompts_initialized")
    const idbPrompts = await getAllPromptsDB()
    if (isInit) {
      setCachedPrompts(idbPrompts)
      return idbPrompts
    }
    if (Array.isArray(idbPrompts) && idbPrompts.length > 0) {
      await setMetaDB("prompts_initialized", true).catch(() => null)
      setCachedPrompts(idbPrompts)
      return idbPrompts
    }
  } catch {
    // fallback
  }

  // 2. Migration from legacy cache if DB was not yet initialized
  const cached = getCachedPrompts()
  if (cached !== null && cached.length > 0) {
    void putPromptsDB(cached).catch(() => null)
    void setMetaDB("prompts_initialized", true).catch(() => null)
    return cached
  }

  // 3. Check chrome.storage.local
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(PROMPTS_CACHE_STORAGE_KEY)
      const storedList = stored?.[PROMPTS_CACHE_STORAGE_KEY]
      if (Array.isArray(storedList) && storedList.length > 0) {
        setCachedPrompts(storedList as IPrompt[])
        void putPromptsDB(storedList as IPrompt[]).catch(() => null)
        void setMetaDB("prompts_initialized", true).catch(() => null)
        return storedList as IPrompt[]
      }
    } catch {
      // ignore
    }
  }

  // 4. Seed initial test prompts on frontend if uninitialized
  try {
    const seeded = await seedInitialPrompts()
    if (Array.isArray(seeded) && seeded.length > 0) {
      return seeded
    }
  } catch {
    // ignore
  }

  return cached ?? []
}

export async function saveStoredPrompts(prompts: IPrompt[]): Promise<void> {
  // 1. Sync to memory cache & chrome.storage.local
  setCachedPrompts(prompts)

  // 2. Persist directly to IndexedDB in an atomic transaction
  try {
    await replacePromptsDB(prompts)
    await setMetaDB("prompts_initialized", true)
  } catch {
    // ignore
  }
}
