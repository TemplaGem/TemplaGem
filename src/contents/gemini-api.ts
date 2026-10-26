import {
  TEMPLAGEM_GET_PROMPTS_MESSAGE,
  type GetPromptsResponse
} from "../background"
import {
  fetchPrompts,
  LEGACY_PROMPTS_CACHE_STORAGE_KEY,
  PROMPTS_CACHE_STORAGE_KEY
} from "../prompts-api"
import type { IPrompt } from "../types"
import {
  ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_REFRESH_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  setAccessToken,
  setRefreshToken
} from "../utils/auth"
import {
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePreference
} from "../utils/theme"

export async function loadPromptsForContentScript(
  forceRefresh: boolean = false
): Promise<GetPromptsResponse> {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: TEMPLAGEM_GET_PROMPTS_MESSAGE,
        forceRefresh
      })) as GetPromptsResponse | undefined

      if (response && Array.isArray(response.prompts)) {
        return response
      }
    } catch {
      // Fallback to storage or direct fetch below
    }
  }

  let storedAccessToken: string | undefined
  let storedTheme: ThemeMode | ThemePreference | undefined

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const stored = await chrome.storage.local.get([
      ACCESS_TOKEN_STORAGE_KEY,
      LEGACY_ACCESS_TOKEN_STORAGE_KEY,
      REFRESH_TOKEN_STORAGE_KEY,
      LEGACY_REFRESH_TOKEN_STORAGE_KEY,
      PROMPTS_CACHE_STORAGE_KEY,
      LEGACY_PROMPTS_CACHE_STORAGE_KEY,
      THEME_STORAGE_KEY
    ])
    const rawRefresh =
      stored[REFRESH_TOKEN_STORAGE_KEY] ??
      stored[LEGACY_REFRESH_TOKEN_STORAGE_KEY]
    if (typeof rawRefresh === "string") {
      setRefreshToken(rawRefresh)
    }
    const rawAccess =
      stored[ACCESS_TOKEN_STORAGE_KEY] ??
      stored[LEGACY_ACCESS_TOKEN_STORAGE_KEY]
    if (typeof rawAccess === "string") {
      storedAccessToken = rawAccess
      setAccessToken(storedAccessToken)
    }
    const cachedPrompts =
      stored[PROMPTS_CACHE_STORAGE_KEY] ??
      stored[LEGACY_PROMPTS_CACHE_STORAGE_KEY]
    storedTheme =
      stored[THEME_STORAGE_KEY] === "dark" ||
      stored[THEME_STORAGE_KEY] === "light" ||
      stored[THEME_STORAGE_KEY] === "system"
        ? (stored[THEME_STORAGE_KEY] as ThemeMode | ThemePreference)
        : undefined
    if (!forceRefresh && Array.isArray(cachedPrompts)) {
      return {
        ok: true,
        prompts: cachedPrompts as IPrompt[],
        isAuthenticated: true,
        theme: storedTheme
      }
    }
  }

  const prompts = await fetchPrompts(storedAccessToken, forceRefresh)
  return {
    ok: true,
    prompts,
    isAuthenticated: true,
    theme: storedTheme
  }
}
