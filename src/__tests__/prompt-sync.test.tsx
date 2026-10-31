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
import { clearSyncQueue, saveStoredPrompts } from "../services/sync-storage"
import type { IPrompt } from "../types"
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

describe("Offline-First Sync Engine - Background & Hooks", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    clearAccessToken()
    clearRefreshToken()
    await clearSyncQueue()
    invalidatePromptsCache()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await clearSyncQueue()
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
      vi.useRealTimers()
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
