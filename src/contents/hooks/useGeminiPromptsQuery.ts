import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"

import type { GetPromptsResponse } from "../../background"
import { PROMPTS_CACHE_STORAGE_KEY } from "../../prompts-api"
import {
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY
} from "../../utils/auth"
import { loadPromptsForContentScript } from "../gemini-api"

export const GEMINI_PROMPTS_QUERY_KEY = ["gemini-prompts"] as const

export function useGeminiPromptsQuery(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const enabled = options?.enabled ?? true

  const query = useQuery<GetPromptsResponse>({
    queryKey: GEMINI_PROMPTS_QUERY_KEY,
    queryFn: () => loadPromptsForContentScript(false),
    enabled,
    staleTime: (q) =>
      q.state.data?.isAuthenticated === false ? 0 : 1000 * 60 * 5
  })

  useEffect(() => {
    if (enabled && query.data?.isAuthenticated === false && !query.isFetching) {
      void query.refetch()
    }
  }, [enabled, query])

  useEffect(() => {
    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (
        ACCESS_TOKEN_STORAGE_KEY in changes ||
        REFRESH_TOKEN_STORAGE_KEY in changes ||
        PROMPTS_CACHE_STORAGE_KEY in changes
      ) {
        void queryClient.invalidateQueries({
          queryKey: GEMINI_PROMPTS_QUERY_KEY
        })
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChanged)
    }

    return () => {
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChanged)
      }
    }
  }, [queryClient])

  const refreshPrompts = useCallback(async () => {
    try {
      return await queryClient.fetchQuery<GetPromptsResponse>({
        queryKey: GEMINI_PROMPTS_QUERY_KEY,
        queryFn: () => loadPromptsForContentScript(true)
      })
    } catch {
      return undefined
    }
  }, [queryClient])

  const result = query.data
  const prompts = result?.prompts ?? []
  const isAuthenticated = result?.isAuthenticated ?? true
  const errorMessage = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "Failed to load prompts"
    : result && !result.ok && result.error
      ? result.error
      : null

  return {
    ...query,
    prompts,
    isAuthenticated,
    errorMessage,
    theme: result?.theme,
    refreshPrompts,
    isLoading: query.isLoading || (query.isFetching && !query.data)
  }
}
