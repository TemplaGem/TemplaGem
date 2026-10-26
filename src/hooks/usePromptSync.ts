import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"

import { PROMPTS_CACHE_STORAGE_KEY } from "../prompts-api"
import {
  enqueueCreatePrompt,
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  scheduleSync,
  syncPrompts,
  type SyncExecutionResult
} from "../services/sync.service"
import {
  getLastSyncTimestamp,
  getStoredPrompts,
  getSyncStatus,
  LAST_SYNC_TIMESTAMP_STORAGE_KEY,
  subscribeSyncStatus,
  SYNC_STATUS_STORAGE_KEY
} from "../services/sync-storage"
import type { IPrompt, SyncStatus } from "../types"

export const PROMPTS_QUERY_KEY = ["prompts"] as const
export const GEMINI_PROMPTS_QUERY_KEY = ["gemini-prompts"] as const

export function usePromptsQuery(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const enabled = options?.enabled ?? true

  const query = useQuery<IPrompt[]>({
    queryKey: PROMPTS_QUERY_KEY,
    queryFn: async () => {
      return await getStoredPrompts()
    },
    enabled,
    staleTime: 1000 * 60 * 5
  })

  // Background sync on mount and network online event
  useEffect(() => {
    if (!enabled) return

    void syncPrompts({ queryClient }).catch(() => null)

    const handleOnline = () => {
      void syncPrompts({ queryClient }).catch(() => null)
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
    }

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (PROMPTS_CACHE_STORAGE_KEY in changes) {
        void queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY })
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChanged)
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline)
      }
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChanged)
      }
    }
  }, [enabled, queryClient])

  return query
}

export function useCreatePromptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      title: string
      body: string
      tags?: string[]
      icon?: string
      access?: "public" | "private" | "link"
      clientTempId?: string
    }) => {
      return await enqueueCreatePrompt(input)
    },
    onSuccess: (newPrompt) => {
      queryClient.setQueryData<IPrompt[]>(PROMPTS_QUERY_KEY, (old = []) => [
        newPrompt,
        ...old.filter(
          (p) =>
            p._id !== newPrompt._id &&
            p.id !== newPrompt._id &&
            (!newPrompt.clientTempId || p.clientTempId !== newPrompt.clientTempId)
        )
      ])
      void queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: GEMINI_PROMPTS_QUERY_KEY })
      scheduleSync(1500, queryClient)
    }
  })
}

export function useUpdatePromptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      promptId?: string
      clientTempId?: string
      title?: string
      body?: string
      tags?: string[]
      icon?: string
      access?: "public" | "private" | "link"
    }) => {
      return await enqueueUpdatePrompt(input)
    },
    onSuccess: (updatedPrompt) => {
      if (updatedPrompt) {
        queryClient.setQueryData<IPrompt[]>(PROMPTS_QUERY_KEY, (old = []) =>
          old.map((p) => {
            const matches =
              (updatedPrompt._id && (p._id === updatedPrompt._id || p.id === updatedPrompt._id)) ||
              (updatedPrompt.clientTempId && p.clientTempId === updatedPrompt.clientTempId)
            return matches ? updatedPrompt : p
          })
        )
      }
      void queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: GEMINI_PROMPTS_QUERY_KEY })
      scheduleSync(1500, queryClient)
    }
  })
}

export function useDeletePromptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (promptId: string) => {
      return await enqueueDeletePrompt(promptId)
    },
    onSuccess: (_success, deletedId) => {
      queryClient.setQueryData<IPrompt[]>(PROMPTS_QUERY_KEY, (old = []) =>
        old.filter(
          (p) =>
            p._id !== deletedId &&
            p.id !== deletedId &&
            p.clientTempId !== deletedId
        )
      )
      void queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: GEMINI_PROMPTS_QUERY_KEY })
      scheduleSync(1500, queryClient)
    }
  })
}

export function usePromptSync() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string | null>(null)

  useEffect(() => {
    void getLastSyncTimestamp().then(setLastSyncTimestamp)
    void getSyncStatus().then(setStatus)

    const unsubStatus = subscribeSyncStatus((newStatus) => {
      setStatus(newStatus)
      setIsSyncing(newStatus === "syncing")
    })

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (SYNC_STATUS_STORAGE_KEY in changes) {
        const nextStatus = changes[SYNC_STATUS_STORAGE_KEY]?.newValue as
          | SyncStatus
          | undefined
        if (nextStatus) {
          setStatus(nextStatus)
          setIsSyncing(nextStatus === "syncing")
        }
      }
      if (LAST_SYNC_TIMESTAMP_STORAGE_KEY in changes) {
        const nextTs = changes[LAST_SYNC_TIMESTAMP_STORAGE_KEY]?.newValue as
          | string
          | undefined
        setLastSyncTimestamp(nextTs ?? null)
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChanged)
    }

    const handleOnline = () => {
      void syncNow()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
    }

    return () => {
      unsubStatus()
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChanged)
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [])

  const syncNow = useCallback(async (): Promise<SyncExecutionResult> => {
    setIsSyncing(true)
    try {
      const res = await syncPrompts({ queryClient })
      setStatus(res.status)
      const ts = await getLastSyncTimestamp()
      setLastSyncTimestamp(ts)
      return res
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  return {
    status,
    isSyncing,
    lastSyncTimestamp,
    syncNow
  }
}
