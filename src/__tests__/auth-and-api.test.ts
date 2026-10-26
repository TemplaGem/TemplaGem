import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createPrompt,
  deleteAllPrompts,
  deletePrompt,
  fetchPrompts,
  getCachedPrompts,
  invalidatePromptsCache,
  subscribePromptsCache,
  updatePromptBody,
  updatePromptIcon,
  updatePromptTags,
  updatePromptTitle
} from "~src/prompts-api"
import { deleteUser, updateEmail, updatePassword } from "~src/user-api"
import { apiRequest } from "~src/utils/api-request"
import {
  clearAccessToken,
  clearRefreshToken,
  getAccessToken,
  getRefreshToken,
  invalidateRefreshToken,
  isTokenExpired,
  login,
  logout,
  refresh,
  register,
  setAccessToken,
  setRefreshToken,
  subscribeAuthChange
} from "~src/utils/auth"

const VALID_OBJECT_ID = "65f1a2b3c4d5e6f7a8b9c0d1"

function makeJwt(expOffsetSeconds?: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payloadObj: Record<string, unknown> = { email: "user@example.com" }
  if (typeof expOffsetSeconds === "number") {
    payloadObj.exp = Math.floor(Date.now() / 1000) + expOffsetSeconds
  }
  const payload = btoa(JSON.stringify(payloadObj))
  return `${header}.${payload}.sig`
}

describe("auth utilities & apiRequest", () => {
  beforeEach(() => {
    clearAccessToken()
    clearRefreshToken()
    invalidatePromptsCache()
    window.localStorage.clear()
  })

  it("checks token expiration accurately", () => {
    expect(isTokenExpired("invalid-token")).toBe(true)
    expect(isTokenExpired("a.invalid-base64.c")).toBe(true)
    expect(isTokenExpired(makeJwt(-60))).toBe(true)
    expect(isTokenExpired(makeJwt(3600))).toBe(false)
    expect(isTokenExpired(makeJwt(undefined))).toBe(false)
  })

  it("manages access & refresh tokens and notifies auth listeners", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAuthChange(listener)

    const validAccess = makeJwt(3600)
    setAccessToken(validAccess)
    expect(getAccessToken()).toBe(validAccess)
    expect(listener).toHaveBeenCalledWith(true)

    // Reads from localStorage when inMemory is cleared via expired token
    const expiredAccess = makeJwt(-10)
    setAccessToken(expiredAccess)
    expect(getAccessToken()).toBeNull()

    const validRefresh = makeJwt(3600)
    setRefreshToken(validRefresh)
    expect(getRefreshToken()).toBe(validRefresh)

    // Test reading token from localStorage when inMemory is null
    setAccessToken(null)
    localStorage.setItem("templagem_access_token", validAccess)
    expect(getAccessToken()).toBe(validAccess)

    setRefreshToken(null)
    localStorage.setItem("templagem_refresh_token", validRefresh)
    expect(getRefreshToken()).toBe(validRefresh)

    const expiredRefresh = makeJwt(-10)
    setRefreshToken(expiredRefresh)
    expect(getRefreshToken()).toBeNull()

    // Test expired token in localStorage
    setAccessToken(null)
    localStorage.setItem("templagem_access_token", expiredAccess)
    expect(getAccessToken()).toBeNull()

    setRefreshToken(null)
    localStorage.setItem("templagem_refresh_token", expiredRefresh)
    expect(getRefreshToken()).toBeNull()

    unsubscribe()
  })

  it("registers, logs in, refreshes, and logs out user", async () => {
    const accessToken = makeJwt(3600)
    const refreshToken = makeJwt(7200)

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ message: "Registered" })
    })

    const regRes = await register({
      email: "user@example.com",
      password: "Password1!"
    })
    expect(regRes.message).toBe("Registered")

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accessToken, refreshToken })
    })

    const loginRes = await login({
      email: "user@example.com",
      password: "Password1!"
    })
    expect(loginRes.accessToken).toBe(accessToken)
    expect(getAccessToken()).toBe(accessToken)
    expect(getRefreshToken()).toBe(refreshToken)

    const refreshedAccess = makeJwt(3600)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: refreshedAccess })
    })
    const refreshRes = await refresh()
    expect(refreshRes.accessToken).toBe(refreshedAccess)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Logged out" })
    })
    const logoutRes = await logout()
    expect(logoutRes.message).toBe("Logged out")
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it("retries request on 401 by refreshing token, and invalidates on failure", async () => {
    const refreshToken = makeJwt(7200)
    const newAccessToken = makeJwt(3600)
    setRefreshToken(refreshToken)

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    // Auto-refresh before request when accessToken is missing, then succeed
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: newAccessToken })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: "OK" })
      })

    const res = await apiRequest<{ message: string }>(
      "http://localhost:4300/api/test"
    )
    expect(res.message).toBe("OK")

    // Now simulate 401 on protected endpoint followed by successful refresh retry
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: newAccessToken })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: "Retried OK" })
      })

    const retried = await apiRequest<{ message: string }>(
      "http://localhost:4300/api/protected"
    )
    expect(retried.message).toBe("Retried OK")

    // Simulate non-OK error response
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Bad request payload" })
    })
    await expect(
      apiRequest("http://localhost:4300/api/protected")
    ).rejects.toThrow("Bad request payload")

    // Simulate 401 when refresh fails
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Invalid refresh" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })

    await expect(
      apiRequest("http://localhost:4300/api/protected")
    ).rejects.toThrow("Request failed with status 401")

    await invalidateRefreshToken()
    expect(getAccessToken()).toBeNull()
  })
})

describe("PromptsApi & UserApi", () => {
  beforeEach(() => {
    clearAccessToken()
    clearRefreshToken()
    invalidatePromptsCache()
    window.localStorage.clear()
    setAccessToken(makeJwt(3600))
  })

  it("fetches, caches, creates, updates (title, body, tags), and deletes prompts", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const cacheListener = vi.fn()
    const unsub = subscribePromptsCache(cacheListener)

    const samplePrompts = [
      {
        _id: VALID_OBJECT_ID,
        title: "Sample",
        body: "Body text",
        tags: ["development"]
      }
    ]

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ prompts: samplePrompts })
    })

    const fetched = await fetchPrompts(undefined, true)
    expect(fetched).toEqual(samplePrompts)
    expect(getCachedPrompts()).toEqual(samplePrompts)

    // Subsequent call without forceRefresh returns cached prompts without network call
    const fromCache = await fetchPrompts(undefined, false)
    expect(fromCache).toEqual(samplePrompts)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Corrupt localStorage cache fallback
    invalidatePromptsCache()
    window.localStorage.setItem("templagem_prompts_cache", "{invalid-json")
    expect(getCachedPrompts()).toBeNull()

    // Fallback to empty array when fetch fails
    fetchMock.mockRejectedValueOnce(new Error("Network down"))
    const fallback = await fetchPrompts(undefined, true)
    expect(fallback).toEqual([])

    // createPrompt
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ message: "Created" })
    })
    expect(
      await createPrompt({
        title: "Title",
        body: "Body",
        tags: ["development"],
        icon: "sparkles"
      })
    ).toEqual({ message: "Created" })
    expect(cacheListener).toHaveBeenCalled()

    // updatePromptTitle
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Title updated" })
    })
    expect(
      await updatePromptTitle({
        promptId: VALID_OBJECT_ID,
        title: "Updated Title"
      })
    ).toEqual({ message: "Title updated" })

    // updatePromptBody
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Body updated" })
    })
    expect(
      await updatePromptBody({
        promptId: VALID_OBJECT_ID,
        body: "Updated Body"
      })
    ).toEqual({ message: "Body updated" })

    // updatePromptTags
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Tags updated" })
    })
    expect(
      await updatePromptTags({
        promptId: VALID_OBJECT_ID,
        tags: ["daily"]
      })
    ).toEqual({ message: "Tags updated" })

    // updatePromptIcon
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Icon updated" })
    })
    expect(
      await updatePromptIcon({
        promptId: VALID_OBJECT_ID,
        icon: "bot"
      })
    ).toEqual({ message: "Icon updated" })
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:4300/api/prompts/change/icon",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          promptId: VALID_OBJECT_ID,
          icon: "bot"
        })
      })
    )

    // deletePrompt
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Deleted" })
    })
    expect(
      await deletePrompt({
        promptId: VALID_OBJECT_ID
      })
    ).toEqual({ message: "Deleted" })

    // deleteAllPrompts
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "All prompts deleted" })
    })
    expect(await deleteAllPrompts()).toEqual({
      message: "All prompts deleted"
    })

    unsub()
  })

  it("updates email, updates password, and deletes user via UserApi", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Email updated" })
    })
    expect(await updateEmail({ newEmail: "next@example.com" })).toEqual({
      message: "Email updated"
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Password updated" })
    })
    expect(await updatePassword({ newPassword: "NextPassword1!" })).toEqual({
      message: "Password updated"
    })

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: "User deleted" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })
    expect(await deleteUser({ password: "Password1!" })).toEqual({
      message: "User deleted"
    })

    // deleteUser with token as first argument
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: "User deleted directly" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })
    expect(await deleteUser("direct-access-token")).toEqual({
      message: "User deleted directly"
    })
  })

  it("syncs prompts cache and theme to chrome.storage.local when available", async () => {
    const chromeSet = vi.fn()
    const chromeRemove = vi.fn()
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          set: chromeSet,
          remove: chromeRemove
        }
      }
    })

    invalidatePromptsCache()
    expect(chromeRemove).toHaveBeenCalled()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { _id: "p1", title: "Test", body: "Body", tags: ["t1"] }
      ]
    })
    vi.stubGlobal("fetch", fetchMock)

    await fetchPrompts(undefined, true)
    expect(chromeSet).toHaveBeenCalled()
  })
})
