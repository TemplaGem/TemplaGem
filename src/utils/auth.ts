import type {
  ApiMessageResponse,
  AuthLoginResponse,
  AuthRefreshResponse,
  CreateUserBody,
  Payload
} from "../types"
import { userSchema } from "../validation/user-validation"
import { apiRequest, DEFAULT_API_BASE_URL } from "./api-request"

export const ACCESS_TOKEN_STORAGE_KEY = "templagem_access_token"
export const REFRESH_TOKEN_STORAGE_KEY = "templagem_refresh_token"
export const LEGACY_ACCESS_TOKEN_STORAGE_KEY = "prompthub_access_token"
export const LEGACY_REFRESH_TOKEN_STORAGE_KEY = "prompthub_refresh_token"
export const GUEST_MODE_STORAGE_KEY = "templagem_guest_mode"

let inMemoryAccessToken: string | null = null
let inMemoryRefreshToken: string | null = null
const authListeners = new Set<(isAuthenticated: boolean) => void>()

function syncChromeStorage(key: string, value: string | null): void {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    if (value) {
      void chrome.storage.local.set({ [key]: value })
    } else {
      void chrome.storage.local.remove(key)
    }
  }
}

function notifyAuthListeners(isAuthenticated: boolean): void {
  authListeners.forEach((listener) => listener(isAuthenticated))
}

export function subscribeAuthChange(
  listener: (isAuthenticated: boolean) => void
): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".")
    if (parts.length !== 3 || !parts[1]) {
      return true
    }

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    )
    const payload = JSON.parse(atob(padded)) as Payload

    if (typeof payload.exp !== "number") {
      return false
    }

    return Date.now() >= payload.exp * 1000
  } catch {
    return true
  }
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token
  if (typeof window !== "undefined" && window.localStorage) {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    }
  }
  syncChromeStorage(ACCESS_TOKEN_STORAGE_KEY, token)
  notifyAuthListeners(Boolean(token || inMemoryRefreshToken))
}

export function clearAccessToken(): void {
  setAccessToken(null)
}

export function getAccessToken(): string | null {
  let token = inMemoryAccessToken
  if (!token && typeof window !== "undefined" && window.localStorage) {
    token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  }

  if (!token) {
    return null
  }

  if (isTokenExpired(token)) {
    clearAccessToken()
    return null
  }

  return token
}

export function setRefreshToken(token: string | null): void {
  inMemoryRefreshToken = token
  if (typeof window !== "undefined" && window.localStorage) {
    if (token) {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    }
  }
  syncChromeStorage(REFRESH_TOKEN_STORAGE_KEY, token)
  notifyAuthListeners(Boolean(inMemoryAccessToken || token))
}

export function clearRefreshToken(): void {
  setRefreshToken(null)
}

export function getRefreshToken(): string | null {
  let token = inMemoryRefreshToken
  if (!token && typeof window !== "undefined" && window.localStorage) {
    token = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  }

  if (!token) {
    return null
  }

  if (isTokenExpired(token)) {
    clearRefreshToken()
    clearAccessToken()
    return null
  }

  return token
}

export async function invalidateRefreshToken(
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<void> {
  clearRefreshToken()
  clearAccessToken()
  notifyAuthListeners(false)
  try {
    await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include"
    })
  } catch {
    // Ignore network errors during local + cookie invalidation
  }
}

export async function register(
  data: CreateUserBody,
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<ApiMessageResponse> {
  const validated = userSchema.parse(data)
  return apiRequest<ApiMessageResponse>(`${baseUrl}/auth/register`, {
    method: "POST",
    body: JSON.stringify(validated)
  })
}

export async function login(
  data: CreateUserBody,
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<AuthLoginResponse> {
  const validated = userSchema.parse(data)
  const response = await apiRequest<AuthLoginResponse>(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      body: JSON.stringify(validated)
    }
  )
  setRefreshToken(response.refreshToken)
  setAccessToken(response.accessToken)
  return response
}

export async function refresh(
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<AuthRefreshResponse> {
  const refreshToken = getRefreshToken()
  try {
    const response = await apiRequest<AuthRefreshResponse>(
      `${baseUrl}/auth/refresh`,
      {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined
      }
    )
    setAccessToken(response.accessToken)
    return response
  } catch (error) {
    await invalidateRefreshToken(baseUrl)
    throw error
  }
}

export async function logout(
  baseUrl: string = DEFAULT_API_BASE_URL
): Promise<ApiMessageResponse> {
  try {
    const response = await apiRequest<ApiMessageResponse>(
      `${baseUrl}/auth/logout`,
      {
        method: "POST"
      }
    )
    return response
  } finally {
    clearRefreshToken()
    clearAccessToken()
  }
}
