import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { invalidatePromptsCache } from "../prompts-api"
import { enqueueCreatePrompt } from "../services/sync-queue"
import {
  clearSyncQueue,
  getLastSyncTimestamp,
  getSyncQueue,
  getSyncStatus,
  saveLastSyncTimestamp,
  saveStoredPrompts,
  saveSyncStatus
} from "../services/sync-storage"
import { scheduleSync, syncPrompts } from "../services/sync.service"
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

describe("Offline-First Sync Engine - Service Execution", () => {
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

  afterEach(async () => {
    vi.restoreAllMocks()
    await clearSyncQueue()
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

    it("handles generic 500 error, non-error throw, and scheduleSync debounce", async () => {
      vi.useFakeTimers()
      setAccessToken(makeJwt())

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Server exploded" }), {
          status: 500
        })
      )

      const res = await syncPrompts()
      expect(res.ok).toBe(false)
      expect(res.status).toBe("error")

      // Non-error throw
      vi.spyOn(global, "fetch").mockImplementationOnce(() => {
        throw "String error"
      })
      const res2 = await syncPrompts()
      expect(res2.ok).toBe(false)
      expect(res2.status).toBe("error")

      // scheduleSync debounce test
      scheduleSync(100)
      scheduleSync(100)
      vi.advanceTimersByTime(150)
      vi.useRealTimers()
    })
  })
})
