import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { invalidatePromptsCache } from "../prompts-api"
import {
  enqueueCreatePrompt,
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  generateTempId,
  reconcileSyncResult
} from "../services/sync-queue"
import {
  saveSyncQueue,
  clearSyncQueue,
  getLastSyncTimestamp,
  getStoredPrompts,
  getSyncQueue,
  saveLastSyncTimestamp,
  saveStoredPrompts,
  saveSyncStatus
} from "../services/sync-storage"
import type { IPrompt, SyncPromptsResultDto } from "../types"
import {
  clearAccessToken,
  clearRefreshToken
} from "../utils/auth"

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
    it("covers edge branches in sync-queue (reconcile with createdAt/updatedAt, tempId deletion, and unmapped items)", async () => {
      // 1. Reconcile with createdAt and updatedAt
      const tempId = "t-meta-1"
      await enqueueCreatePrompt({ clientTempId: tempId, title: "Meta", body: "B" })
      await reconcileSyncResult({
        applied: {
          created: [
            {
              clientTempId: tempId,
              serverId: "s-meta-1",
              createdAt: "2026-10-26T12:00:00.000Z",
              updatedAt: "2026-10-26T12:00:00.000Z"
            }
          ],
          updated: [],
          deleted: []
        },
        serverChanges: { prompts: [], deletedIds: [] },
        syncTimestamp: "2026-10-26T12:00:00.000Z"
      })
      const prompts = await getStoredPrompts()
      expect(prompts.find(p => p._id === "s-meta-1")?.createdAt).toBe("2026-10-26T12:00:00.000Z")

      // 2. Delete item with tempId that also existed in updated
      const tempItem = await enqueueCreatePrompt({ title: "Temp Del", body: "B" })
      const qWithTemp = await getSyncQueue()
      qWithTemp.updated.push({ clientTempId: tempItem.clientTempId, title: "Updated in temp", body: "B" })
      await saveSyncQueue(qWithTemp)
      await enqueueDeletePrompt(tempItem.clientTempId!)
      const qFinal = await getSyncQueue()
      expect(qFinal.updated.find(u => u.clientTempId === tempItem.clientTempId)).toBeUndefined()

      // 3. Reconcile with item in queue.updated matching clientTempId
      const qAfter = await getSyncQueue()
      qAfter.updated.push({ promptId: "reconcile-temp-id", title: "Needs remapping", body: "B" })
      await saveSyncQueue(qAfter)
      await reconcileSyncResult({
        applied: {
          created: [
            {
              clientTempId: "reconcile-temp-id",
              serverId: "server-mapped-id",
              createdAt: "2026-10-25T12:00:00.000Z",
              updatedAt: "2026-10-25T12:00:00.000Z"
            }
          ],
          updated: [],
          deleted: []
        },
        serverChanges: { prompts: [], deletedIds: [] },
        syncTimestamp: "2026-10-25T12:00:00.000Z"
      })
      const qRemapped = await getSyncQueue()
      expect(qRemapped.updated.find(u => u.promptId === "server-mapped-id")).toBeDefined()
    })

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

})
