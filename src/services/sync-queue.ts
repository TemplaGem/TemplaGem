import type {
  IPrompt,
  SyncPromptItemDto,
  SyncPromptsPayloadDto,
  SyncPromptsResultDto
} from "../types"
import {
  getStoredPrompts,
  getSyncQueue,
  saveLastSyncTimestamp,
  saveStoredPrompts,
  saveSyncQueue
} from "./sync-storage"

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

export interface EnqueueCreatePromptInput {
  title: string
  body: string
  tags?: string[]
  icon?: string
  access?: "public" | "private" | "link"
  clientTempId?: string
}

export interface EnqueueUpdatePromptInput {
  promptId?: string
  clientTempId?: string
  title?: string
  body?: string
  tags?: string[]
  icon?: string
  access?: "public" | "private" | "link"
}

export async function enqueueCreatePrompt(
  input: EnqueueCreatePromptInput
): Promise<IPrompt> {
  const clientTempId = input.clientTempId || generateTempId()
  const now = new Date().toISOString()

  const newPrompt: IPrompt = {
    _id: clientTempId,
    id: clientTempId,
    clientTempId,
    title: input.title.trim(),
    body: input.body,
    tags: input.tags ?? [],
    icon: input.icon ?? "default",
    access: input.access ?? "private",
    createdAt: now,
    updatedAt: now
  }

  const prompts = await getStoredPrompts()
  const updatedPrompts = [
    newPrompt,
    ...prompts.filter(
      (p) =>
        p._id !== clientTempId &&
        p.id !== clientTempId &&
        p.clientTempId !== clientTempId
    )
  ]
  await saveStoredPrompts(updatedPrompts)

  const queue = await getSyncQueue()
  const syncItem: SyncPromptItemDto = {
    clientTempId,
    title: newPrompt.title,
    body: newPrompt.body,
    tags: newPrompt.tags,
    icon: newPrompt.icon,
    access: newPrompt.access,
    createdAt: now,
    updatedAt: now
  }
  queue.created.push(syncItem)
  await saveSyncQueue(queue)

  return newPrompt
}

export async function enqueueUpdatePrompt(
  update: EnqueueUpdatePromptInput
): Promise<IPrompt | null> {
  const targetId = update.promptId || update.clientTempId
  if (!targetId) return null

  const prompts = await getStoredPrompts()
  const index = prompts.findIndex(
    (p) =>
      p._id === targetId || p.id === targetId || p.clientTempId === targetId
  )

  const now = new Date().toISOString()
  const existing = index !== -1 ? prompts[index] : null

  const updatedPrompt: IPrompt = {
    ...existing,
    _id: existing?._id || targetId,
    id: existing?.id || targetId,
    clientTempId: existing?.clientTempId || update.clientTempId,
    title: update.title !== undefined ? update.title.trim() : (existing?.title ?? ""),
    body: update.body !== undefined ? update.body : (existing?.body ?? ""),
    tags: update.tags !== undefined ? update.tags : (existing?.tags ?? []),
    icon: update.icon !== undefined ? update.icon : existing?.icon,
    access: update.access !== undefined ? update.access : existing?.access,
    updatedAt: now,
    createdAt: existing?.createdAt || now
  }

  if (index !== -1) {
    prompts[index] = updatedPrompt
  } else {
    prompts.unshift(updatedPrompt)
  }
  await saveStoredPrompts(prompts)

  const queue = await getSyncQueue()
  const clientTempId = updatedPrompt.clientTempId || (existing?.clientTempId)

  // Check if this prompt is still pending creation
  const createdIndex = queue.created.findIndex(
    (item) =>
      (clientTempId && item.clientTempId === clientTempId) ||
      item.clientTempId === targetId
  )

  if (createdIndex !== -1) {
    // Update directly in syncQueue.created
    queue.created[createdIndex] = {
      ...queue.created[createdIndex],
      title: updatedPrompt.title,
      body: updatedPrompt.body,
      tags: updatedPrompt.tags,
      icon: updatedPrompt.icon,
      access: updatedPrompt.access,
      updatedAt: now
    }
  } else {
    // It has a real server promptId
    const serverId = update.promptId || existing?._id || targetId
    const updatedIndex = queue.updated.findIndex(
      (item) => item.promptId === serverId
    )

    const syncItem: SyncPromptItemDto = {
      promptId: serverId,
      title: updatedPrompt.title,
      body: updatedPrompt.body,
      tags: updatedPrompt.tags,
      icon: updatedPrompt.icon,
      access: updatedPrompt.access,
      createdAt:
        typeof updatedPrompt.createdAt === "string"
          ? updatedPrompt.createdAt
          : updatedPrompt.createdAt?.toISOString?.(),
      updatedAt: now
    }

    if (updatedIndex !== -1) {
      queue.updated[updatedIndex] = syncItem
    } else {
      queue.updated.push(syncItem)
    }
  }

  await saveSyncQueue(queue)
  return updatedPrompt
}

export async function enqueueDeletePrompt(id: string): Promise<boolean> {
  const prompts = await getStoredPrompts()
  const filteredPrompts = prompts.filter(
    (p) => p._id !== id && p.id !== id && p.clientTempId !== id
  )
  await saveStoredPrompts(filteredPrompts)

  const queue = await getSyncQueue()

  // Check if it was in syncQueue.created (local-only prompt)
  const createdIndex = queue.created.findIndex(
    (item) => item.clientTempId === id
  )

  if (createdIndex !== -1) {
    // Simply remove from syncQueue.created — nothing to send to server
    queue.created.splice(createdIndex, 1)
    queue.updated = queue.updated.filter(
      (item) => item.promptId !== id && item.clientTempId !== id
    )
  } else {
    // Has server promptId
    queue.updated = queue.updated.filter((item) => item.promptId !== id)
    if (!queue.deletedIds.includes(id)) {
      queue.deletedIds.push(id)
    }
  }

  await saveSyncQueue(queue)
  return true
}

export async function reconcileSyncResult(
  result: SyncPromptsResultDto,
  sentPayload?: SyncPromptsPayloadDto
): Promise<IPrompt[]> {
  const prompts = await getStoredPrompts()
  const queue = await getSyncQueue()

  // 1. Reconcile applied.created (clientTempId -> serverId mapping)
  if (Array.isArray(result.applied?.created)) {
    for (const applied of result.applied.created) {
      const { clientTempId, serverId, createdAt, updatedAt } = applied
      if (!clientTempId) continue

      const prompt = prompts.find(
        (p) =>
          p.clientTempId === clientTempId ||
          p._id === clientTempId ||
          p.id === clientTempId
      )

      if (prompt) {
        prompt._id = serverId
        prompt.id = serverId
        prompt.clientTempId = undefined
        if (createdAt) prompt.createdAt = createdAt
        if (updatedAt) prompt.updatedAt = updatedAt
      }

      queue.created = queue.created.filter(
        (item) => item.clientTempId !== clientTempId
      )

      for (const item of queue.updated) {
        if (item.promptId === clientTempId) {
          item.promptId = serverId
        }
      }
    }
  }

  // 2. Clear applied.updated (preserving newer in-flight local modifications)
  if (Array.isArray(result.applied?.updated)) {
    const appliedUpdatedSet = new Set(result.applied.updated)
    const sentMap = new Map<string, string | undefined>()
    if (sentPayload?.updated) {
      for (const s of sentPayload.updated) {
        if (s.promptId) sentMap.set(s.promptId, s.updatedAt)
      }
    }

    queue.updated = queue.updated.filter((item) => {
      if (!item.promptId || !appliedUpdatedSet.has(item.promptId)) {
        return true
      }
      if (sentMap.has(item.promptId)) {
        const sentTs = sentMap.get(item.promptId)
        if (item.updatedAt && sentTs && item.updatedAt > sentTs) {
          return true
        }
      }
      return false
    })
  }

  // 3. Clear applied.deleted
  if (Array.isArray(result.applied?.deleted)) {
    const appliedDeletedSet = new Set(result.applied.deleted)
    queue.deletedIds = queue.deletedIds.filter(
      (id) => !appliedDeletedSet.has(id)
    )
  }

  // 4. Apply serverChanges.deletedIds
  if (Array.isArray(result.serverChanges?.deletedIds)) {
    const serverDeletedSet = new Set(result.serverChanges.deletedIds)
    const remainingPrompts = prompts.filter(
      (p) =>
        (!p._id || !serverDeletedSet.has(p._id)) &&
        (!p.id || !serverDeletedSet.has(p.id))
    )
    prompts.length = 0
    prompts.push(...remainingPrompts)

    queue.updated = queue.updated.filter(
      (item) => !item.promptId || !serverDeletedSet.has(item.promptId)
    )
    queue.deletedIds = queue.deletedIds.filter(
      (id) => !serverDeletedSet.has(id)
    )
  }

  // 5. Apply serverChanges.prompts
  if (Array.isArray(result.serverChanges?.prompts)) {
    const pendingDeletedSet = new Set(queue.deletedIds)
    const pendingUpdatedSet = new Set(
      queue.updated.map((item) => item.promptId).filter(Boolean)
    )

    for (const serverPrompt of result.serverChanges.prompts) {
      const serverId = serverPrompt._id || serverPrompt.id
      if (!serverId) continue

      // If pending local deletion, keep local deletion
      if (pendingDeletedSet.has(serverId)) {
        continue
      }

      // If pending local updates, avoid clobbering uncommitted local changes
      if (pendingUpdatedSet.has(serverId)) {
        continue
      }

      const existingIndex = prompts.findIndex(
        (p) => p._id === serverId || p.id === serverId
      )

      if (existingIndex !== -1) {
        prompts[existingIndex] = {
          ...prompts[existingIndex],
          ...serverPrompt,
          _id: serverId,
          id: serverId
        }
      } else {
        prompts.push({
          ...serverPrompt,
          _id: serverId,
          id: serverId
        })
      }
    }
  }

  // 6. Update lastSyncTimestamp
  if (result.syncTimestamp) {
    await saveLastSyncTimestamp(result.syncTimestamp)
  }

  // 7. Persist changes
  await saveStoredPrompts(prompts)
  await saveSyncQueue(queue)

  return prompts
}
