import {
  fetchPrompts,
  LEGACY_PROMPTS_CACHE_STORAGE_KEY,
  PROMPTS_CACHE_STORAGE_KEY
} from "./prompts-api"
import { syncPrompts, type SyncExecutionResult } from "./services/sync.service"
import type { IPrompt } from "./types"
import {
  ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_REFRESH_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  setAccessToken,
  setRefreshToken
} from "./utils/auth"
import {
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePreference
} from "./utils/theme"

export const TEMPLAGEM_GET_PROMPTS_MESSAGE = "TEMPLAGEM_GET_PROMPTS"
const LEGACY_GET_PROMPTS_MESSAGE = "PROMPTHUB_GET_PROMPTS"
export const TEMPLAGEM_SYNC_PROMPTS_MESSAGE = "TEMPLAGEM_SYNC_PROMPTS"
export const SYNC_PROMPTS_ALARM = "sync-prompts"

export interface GetPromptsMessage {
  type:
    | typeof TEMPLAGEM_GET_PROMPTS_MESSAGE
    | typeof LEGACY_GET_PROMPTS_MESSAGE
    | typeof TEMPLAGEM_SYNC_PROMPTS_MESSAGE
  forceRefresh?: boolean
}

export interface GetPromptsResponse {
  ok: boolean
  prompts: IPrompt[]
  isAuthenticated: boolean
  theme?: ThemeMode | ThemePreference
  error?: string
}

export async function handleGetPromptsMessage(
  forceRefresh: boolean = false
): Promise<GetPromptsResponse> {
  let storedAccessToken: string | null = null
  let storedRefreshToken: string | null = null
  let storedCache: IPrompt[] | null = null
  let storedTheme: ThemeMode | ThemePreference | undefined

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const data = await chrome.storage.local.get([
      ACCESS_TOKEN_STORAGE_KEY,
      LEGACY_ACCESS_TOKEN_STORAGE_KEY,
      REFRESH_TOKEN_STORAGE_KEY,
      LEGACY_REFRESH_TOKEN_STORAGE_KEY,
      PROMPTS_CACHE_STORAGE_KEY,
      LEGACY_PROMPTS_CACHE_STORAGE_KEY,
      THEME_STORAGE_KEY
    ])
    const rawAccess =
      data[ACCESS_TOKEN_STORAGE_KEY] ?? data[LEGACY_ACCESS_TOKEN_STORAGE_KEY]
    if (typeof rawAccess === "string") {
      storedAccessToken = rawAccess
    }
    const rawRefresh =
      data[REFRESH_TOKEN_STORAGE_KEY] ?? data[LEGACY_REFRESH_TOKEN_STORAGE_KEY]
    if (typeof rawRefresh === "string") {
      storedRefreshToken = rawRefresh
    }
    const rawCache =
      data[PROMPTS_CACHE_STORAGE_KEY] ?? data[LEGACY_PROMPTS_CACHE_STORAGE_KEY]
    if (Array.isArray(rawCache)) {
      storedCache = rawCache as IPrompt[]
    }
    if (
      data[THEME_STORAGE_KEY] === "dark" ||
      data[THEME_STORAGE_KEY] === "light" ||
      data[THEME_STORAGE_KEY] === "system"
    ) {
      storedTheme = data[THEME_STORAGE_KEY]
    }
  }

  if (storedRefreshToken) {
    setRefreshToken(storedRefreshToken)
  }
  if (storedAccessToken) {
    setAccessToken(storedAccessToken)
  }

  const isAuthenticated = Boolean(
    storedAccessToken ||
      storedRefreshToken ||
      (storedCache && storedCache.length > 0)
  )

  if (!isAuthenticated) {
    return {
      ok: true,
      prompts: [],
      isAuthenticated: false,
      theme: storedTheme
    }
  }

  // If we have cached prompts and not forcing refresh, return immediately (offline-first)
  // and trigger incremental sync in the background
  if (!forceRefresh && storedCache !== null) {
    void syncPrompts().catch(() => null)
    return {
      ok: true,
      prompts: storedCache,
      isAuthenticated: true,
      theme: storedTheme
    }
  }

  try {
    const prompts = await fetchPrompts(storedAccessToken ?? undefined, true)
    void syncPrompts().catch(() => null)
    return {
      ok: true,
      prompts,
      isAuthenticated: true,
      theme: storedTheme
    }
  } catch (error) {
    return {
      ok: false,
      prompts: storedCache ?? [],
      isAuthenticated,
      theme: storedTheme,
      error: error instanceof Error ? error.message : "Failed to load prompts"
    }
  }
}

export function setupBackgroundSyncAlarm(): void {
  if (typeof chrome !== "undefined" && chrome.alarms) {
    chrome.alarms.get(SYNC_PROMPTS_ALARM, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(SYNC_PROMPTS_ALARM, { periodInMinutes: 10 })
      }
    })
  }
}

export function registerBackgroundAlarmListener(): void {
  if (typeof chrome !== "undefined" && chrome.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === SYNC_PROMPTS_ALARM) {
        void syncPrompts()
      }
    })
  }
}

export function registerBackgroundMessageListener(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return
  }

  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: GetPromptsResponse | SyncExecutionResult) => void
    ) => {
      const msgType =
        typeof message === "object" && message !== null
          ? (message as Partial<GetPromptsMessage>).type
          : undefined

      if (
        msgType === TEMPLAGEM_GET_PROMPTS_MESSAGE ||
        msgType === LEGACY_GET_PROMPTS_MESSAGE
      ) {
        const forceRefresh = Boolean(
          (message as Partial<GetPromptsMessage>).forceRefresh
        )
        void handleGetPromptsMessage(forceRefresh).then(sendResponse)
        return true
      }

      if (msgType === TEMPLAGEM_SYNC_PROMPTS_MESSAGE) {
        void syncPrompts().then(sendResponse)
        return true
      }

      return false
    }
  )
}

if (typeof window === "undefined") {
  setupBackgroundSyncAlarm()
  registerBackgroundAlarmListener()
  registerBackgroundMessageListener()
}
