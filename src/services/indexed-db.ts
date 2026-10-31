import type { IPrompt } from "../types"

export const DB_NAME = "templagem_db"
export const DB_VERSION = 1
export const PROMPTS_STORE = "prompts"
export const META_STORE = "sync_meta"

function getIDBFactory(): IDBFactory | undefined {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return globalThis.indexedDB
  }
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB
  }
  if (typeof self !== "undefined" && self.indexedDB) {
    return self.indexedDB
  }
  return undefined
}

let dbInstance: IDBDatabase | null = null

// Fallback in-memory map when IndexedDB is not available (e.g. node / tests)
const fallbackPromptsMap = new Map<string, IPrompt>()
const fallbackMetaMap = new Map<string, unknown>()

export function isIndexedDBAvailable(): boolean {
  return typeof getIDBFactory() !== "undefined"
}

export async function openDB(): Promise<IDBDatabase | null> {
  const factory = getIDBFactory()
  if (!factory) {
    return null
  }

  if (dbInstance) {
    return dbInstance
  }

  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(PROMPTS_STORE)) {
        const promptStore = db.createObjectStore(PROMPTS_STORE, {
          keyPath: "_id"
        })
        promptStore.createIndex("clientTempId", "clientTempId", {
          unique: false
        })
        promptStore.createIndex("updatedAt", "updatedAt", { unique: false })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      dbInstance.onversionchange = () => {
        dbInstance?.close()
        dbInstance = null
      }
      resolve(dbInstance)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function getAllPromptsDB(): Promise<IPrompt[]> {
  const db = await openDB().catch(() => null)
  if (!db) {
    return Array.from(fallbackPromptsMap.values())
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readonly")
      const store = tx.objectStore(PROMPTS_STORE)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result as IPrompt[])
      }

      request.onerror = () => {
        reject(request.error)
      }
    } catch (e) {
      reject(e)
    }
  })
}

export async function getPromptDB(id: string): Promise<IPrompt | null> {
  const db = await openDB().catch(() => null)
  if (!db) {
    return fallbackPromptsMap.get(id) ?? null
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readonly")
      const store = tx.objectStore(PROMPTS_STORE)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve((request.result as IPrompt) ?? null)
      }

      request.onerror = () => {
        reject(request.error)
      }
    } catch (e) {
      reject(e)
    }
  })
}

export async function putPromptDB(prompt: IPrompt): Promise<void> {
  const key = prompt._id || prompt.id || prompt.clientTempId
  if (!key) return

  const normalized: IPrompt = {
    ...prompt,
    _id: key
  }

  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackPromptsMap.set(key, normalized)
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readwrite")
      const store = tx.objectStore(PROMPTS_STORE)
      const request = store.put(normalized)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function putPromptsDB(prompts: IPrompt[]): Promise<void> {
  if (!prompts.length) return

  const db = await openDB().catch(() => null)
  if (!db) {
    for (const p of prompts) {
      const key = p._id || p.id || p.clientTempId
      if (key) {
        fallbackPromptsMap.set(key, { ...p, _id: key })
      }
    }
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readwrite")
      const store = tx.objectStore(PROMPTS_STORE)

      for (const prompt of prompts) {
        const key = prompt._id || prompt.id || prompt.clientTempId
        if (key) {
          store.put({ ...prompt, _id: key })
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function replacePromptsDB(prompts: IPrompt[]): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackPromptsMap.clear()
    for (const p of prompts) {
      const key = p._id || p.id || p.clientTempId
      if (key) {
        fallbackPromptsMap.set(key, { ...p, _id: key })
      }
    }
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readwrite")
      const store = tx.objectStore(PROMPTS_STORE)

      store.clear()
      for (const prompt of prompts) {
        const key = prompt._id || prompt.id || prompt.clientTempId
        if (key) {
          store.put({ ...prompt, _id: key })
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function deletePromptDB(id: string): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackPromptsMap.delete(id)
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readwrite")
      const store = tx.objectStore(PROMPTS_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function clearPromptsDB(): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackPromptsMap.clear()
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PROMPTS_STORE, "readwrite")
      const store = tx.objectStore(PROMPTS_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function getMetaDB<T>(key: string): Promise<T | null> {
  const db = await openDB().catch(() => null)
  if (!db) {
    return (fallbackMetaMap.get(key) as T) ?? null
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(META_STORE, "readonly")
      const store = tx.objectStore(META_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const item = request.result as { key: string; value: T } | undefined
        resolve(item?.value ?? null)
      }

      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function setMetaDB<T>(key: string, value: T): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackMetaMap.set(key, value)
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(META_STORE, "readwrite")
      const store = tx.objectStore(META_STORE)
      const request = store.put({ key, value })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function deleteMetaDB(key: string): Promise<void> {
  const db = await openDB().catch(() => null)
  if (!db) {
    fallbackMetaMap.delete(key)
    return
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(META_STORE, "readwrite")
      const store = tx.objectStore(META_STORE)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function resetFallbackDB(): Promise<void> {
  fallbackPromptsMap.clear()
  fallbackMetaMap.clear()
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
