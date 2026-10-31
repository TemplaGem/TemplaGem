import type { AccessType, IPrompt } from "./prompt.types"

export type { AccessType }

export interface SyncPromptItemDto {
  clientTempId?: string
  promptId?: string
  title: string
  body: string
  tags?: string[]
  icon?: string
  access?: AccessType
  likes?: number
  downloads?: number
  createdAt?: string
  updatedAt?: string
}

export interface SyncPromptsPayloadDto {
  lastSyncTimestamp?: string | null
  created?: SyncPromptItemDto[]
  updated?: SyncPromptItemDto[]
  deletedIds?: string[]
}

export interface AppliedCreatedItemDto {
  clientTempId?: string
  serverId: string
  createdAt: string
  updatedAt: string
}

export interface SyncPromptsResultDto {
  applied: {
    created: AppliedCreatedItemDto[]
    updated: string[]
    deleted: string[]
  }
  serverChanges: {
    prompts: IPrompt[]
    deletedIds: string[]
  }
  syncTimestamp: string
}

export interface SyncQueue {
  created: SyncPromptItemDto[]
  updated: SyncPromptItemDto[]
  deletedIds: string[]
}

export type SyncStatus =
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "local_only"

export interface SyncState {
  status: SyncStatus
  lastSyncTimestamp: string | null
  isSyncing: boolean
  error?: string | null
  pendingCount: number
}
