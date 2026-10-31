import type { ApiErrorResponse } from "../types"
import {
  getAccessToken,
  getRefreshToken,
  invalidateRefreshToken,
  isTokenExpired,
  refresh
} from "./auth"

export const DEFAULT_API_BASE_URL =
  process.env.PLASMO_PUBLIC_API_URL || "http://localhost:4300/api"

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const isAuthEndpoint =
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/logout")

  let resolvedToken =
    accessToken && !isTokenExpired(accessToken) ? accessToken : getAccessToken()

  if (!resolvedToken && !isAuthEndpoint && getRefreshToken()) {
    try {
      const refreshed = await refresh()
      resolvedToken = refreshed.accessToken
    } catch {
      await invalidateRefreshToken()
    }
  }

  const buildHeaders = (token: string | null) => {
    const headers = new Headers(options.headers)
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    return headers
  }

  let response = await fetch(url, {
    ...options,
    headers: buildHeaders(resolvedToken),
    credentials: options.credentials ?? "include"
  })

  if (response.status === 401 && !isAuthEndpoint) {
    try {
      const refreshed = await refresh()
      response = await fetch(url, {
        ...options,
        headers: buildHeaders(refreshed.accessToken),
        credentials: options.credentials ?? "include"
      })
    } catch {
      await invalidateRefreshToken()
    }
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorResponse

  if (!response.ok) {
    const error = new Error(
      data.error ||
        data.message ||
        `Request failed with status ${response.status}`
    )
    ;(error as Error & { status: number; data: ApiErrorResponse }).status =
      response.status
    ;(error as Error & { status: number; data: ApiErrorResponse }).data = data
    throw error
  }

  return data
}
