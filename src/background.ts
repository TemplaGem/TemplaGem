import { fetchPrompts, PROMPTS_CACHE_STORAGE_KEY } from "./prompts-api"
import { ManifestService } from "./services/manifest/manifest-service"
import type { PlatformRulesManifest } from "./services/manifest/types"
import type { IPrompt } from "./types"
import {
  ACCESS_TOKEN_STORAGE_KEY,
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
export const TEMPLAGEM_GET_MANIFEST_MESSAGE = "TEMPLAGEM_GET_PLATFORMS_MANIFEST"

export interface GetPromptsMessage {
  type: typeof TEMPLAGEM_GET_PROMPTS_MESSAGE
  forceRefresh?: boolean
}

export interface GetManifestMessage {
  type: typeof TEMPLAGEM_GET_MANIFEST_MESSAGE
  forceRefresh?: boolean
}

export interface GetManifestResponse {
  ok: boolean
  manifest: PlatformRulesManifest
  error?: string
}

export interface GetPromptsResponse {
  ok: boolean
  prompts: IPrompt[]
  isAuthenticated: boolean
  theme?: ThemeMode | ThemePreference
  error?: string
}

export async function handleGetManifestMessage(
  forceRefresh: boolean = false
): Promise<GetManifestResponse> {
  try {
    const manifest = await ManifestService.getManifest(forceRefresh)
    return {
      ok: true,
      manifest
    }
  } catch (error) {
    return {
      ok: false,
      manifest: await ManifestService.getManifest(false),
      error: error instanceof Error ? error.message : "Failed to load manifest"
    }
  }
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
      REFRESH_TOKEN_STORAGE_KEY,
      PROMPTS_CACHE_STORAGE_KEY,
      THEME_STORAGE_KEY
    ])
    if (typeof data[ACCESS_TOKEN_STORAGE_KEY] === "string") {
      storedAccessToken = data[ACCESS_TOKEN_STORAGE_KEY]
    }
    if (typeof data[REFRESH_TOKEN_STORAGE_KEY] === "string") {
      storedRefreshToken = data[REFRESH_TOKEN_STORAGE_KEY]
    }
    if (Array.isArray(data[PROMPTS_CACHE_STORAGE_KEY])) {
      storedCache = data[PROMPTS_CACHE_STORAGE_KEY] as IPrompt[]
    }
    if (
      data[THEME_STORAGE_KEY] === "dark" ||
      data[THEME_STORAGE_KEY] === "light" ||
      data[THEME_STORAGE_KEY] === "system"
    ) {
      storedTheme = data[THEME_STORAGE_KEY]
    }
  }

  setAccessToken(storedAccessToken)
  setRefreshToken(storedRefreshToken)

  const isAuthenticated = Boolean(storedAccessToken || storedRefreshToken)

  if (!isAuthenticated) {
    return {
      ok: true,
      prompts: [],
      isAuthenticated: false,
      theme: storedTheme
    }
  }

  if (!forceRefresh && storedCache !== null) {
    return {
      ok: true,
      prompts: storedCache,
      isAuthenticated: true,
      theme: storedTheme
    }
  }

  try {
    const prompts = await fetchPrompts(storedAccessToken ?? undefined, true)
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

export function registerBackgroundMessageListener(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return
  }

  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as Partial<GetPromptsMessage>).type ===
          TEMPLAGEM_GET_PROMPTS_MESSAGE
      ) {
        const forceRefresh = Boolean(
          (message as Partial<GetPromptsMessage>).forceRefresh
        )
        void handleGetPromptsMessage(forceRefresh).then(sendResponse)
        return true
      }

      if (
        typeof message === "object" &&
        message !== null &&
        (message as Partial<GetManifestMessage>).type ===
          TEMPLAGEM_GET_MANIFEST_MESSAGE
      ) {
        const forceRefresh = Boolean(
          (message as Partial<GetManifestMessage>).forceRefresh
        )
        void handleGetManifestMessage(forceRefresh).then(sendResponse)
        return true
      }
      return false
    }
  )
}

registerBackgroundMessageListener()
