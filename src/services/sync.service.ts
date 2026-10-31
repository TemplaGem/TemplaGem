import type { QueryClient } from "@tanstack/react-query"

import { invalidatePromptsCache } from "../prompts-api"
import type {
  SyncPromptsPayloadDto,
  SyncPromptsResultDto,
  SyncStatus
} from "../types"
import { apiRequest, DEFAULT_API_BASE_URL } from "../utils/api-request"
import { getAccessToken, getRefreshToken } from "../utils/auth"
import {
  enqueueCreatePrompt,
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  generateTempId,
  reconcileSyncResult
} from "./sync-queue"
import {
  getLastSyncTimestamp,
  getSyncQueue,
  saveSyncStatus
} from "./sync-storage"

export interface SyncExecutionResult {
  ok: boolean
  skipped?: boolean
  status: SyncStatus
  result?: SyncPromptsResultDto
  error?: string
}

export async function syncPromptsApi(
  payload: SyncPromptsPayloadDto,
  accessToken?: string
): Promise<SyncPromptsResultDto> {
  return await apiRequest<SyncPromptsResultDto>(
    `${DEFAULT_API_BASE_URL}/prompts/sync`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    accessToken
  )
}

let activeSyncPromise: Promise<SyncExecutionResult> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export async function syncPrompts(options?: {
  force?: boolean
  accessToken?: string
  queryClient?: QueryClient
}): Promise<SyncExecutionResult> {
  if (activeSyncPromise) {
    return activeSyncPromise
  }

  activeSyncPromise = (async () => {
    try {
      return await executeSync(options)
    } finally {
      activeSyncPromise = null
    }
  })()

  return activeSyncPromise
}

async function executeSync(options?: {
  force?: boolean
  accessToken?: string
  queryClient?: QueryClient
}): Promise<SyncExecutionResult> {
  // 1. Network check
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await saveSyncStatus("offline")
    return {
      ok: false,
      status: "offline",
      error: "Device is offline"
    }
  }

  // 2. Authentication check
  const access = options?.accessToken || getAccessToken()
  const refresh = getRefreshToken()
  if (!access && !refresh) {
    return {
      ok: false,
      skipped: true,
      status: "idle",
      error: "Not authenticated"
    }
  }

  // 3. Mark syncing
  await saveSyncStatus("syncing")

  // 4. Gather payload
  const queue = await getSyncQueue()
  const lastSyncTimestamp = await getLastSyncTimestamp()

  const payload: SyncPromptsPayloadDto = {
    lastSyncTimestamp,
    created: queue.created,
    updated: queue.updated,
    deletedIds: queue.deletedIds
  }

  // 5. Send API request
  try {
    const result = await syncPromptsApi(payload, options?.accessToken)

    // 6. Reconciliation
    await reconcileSyncResult(result, payload)
    await saveSyncStatus("idle")

    // 7. Invalidate caches and queries
    invalidatePromptsCache()
    if (options?.queryClient) {
      void options.queryClient.invalidateQueries({ queryKey: ["prompts"] })
      void options.queryClient.invalidateQueries({
        queryKey: ["gemini-prompts"]
      })
    }

    return {
      ok: true,
      status: "idle",
      result
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = (error as { status?: number })?.status

    // Feature Flag: 403 Forbidden ("Cloud sync is temporarily disabled...")
    if (
      status === 403 ||
      message.includes("403") ||
      message.toLowerCase().includes("cloud sync is temporarily disabled")
    ) {
      await saveSyncStatus("local_only")
      return {
        ok: true,
        status: "local_only",
        error: message
      }
    }

    // 401 Unauthorized
    if (
      status === 401 ||
      message.includes("401") ||
      message.toLowerCase().includes("unauthorized")
    ) {
      await saveSyncStatus("error")
      return {
        ok: false,
        status: "error",
        error: "Authentication required"
      }
    }

    // Network / connectivity errors
    if (
      message.includes("Network down") ||
      message.includes("NetworkError") ||
      message.includes("Failed to fetch") ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    ) {
      await saveSyncStatus("offline")
      return {
        ok: false,
        status: "offline",
        error: "Network unavailable"
      }
    }

    await saveSyncStatus("error")
    return {
      ok: false,
      status: "error",
      error: message
    }
  }
}

export function scheduleSync(
  delayMs: number = 1500,
  queryClient?: QueryClient
): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncPrompts({ queryClient }).catch(() => null)
  }, delayMs)
}

// Re-export queue operations for convenience
export {
  enqueueCreatePrompt,
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  generateTempId,
  reconcileSyncResult
}
