import type {
  ApiMessageResponse,
  CreatePromptRequest,
  DeletePromptRequest,
  IPrompt,
  SyncPromptsPayloadDto,
  SyncPromptsResultDto,
  UpdatePromptBodyRequest,
  UpdatePromptIconRequest,
  UpdatePromptTagsRequest,
  UpdatePromptTitleRequest
} from "./types"
import { apiRequest, DEFAULT_API_BASE_URL } from "./utils/api-request"
import {
  createPromptSchema,
  deletePromptSchema,
  updatePromptBodySchema,
  updatePromptIconSchema,
  updatePromptTagsSchema,
  updatePromptTitleSchema
} from "./validation/prompt-validation"

export const PROMPTS_CACHE_STORAGE_KEY = "templagem_prompts_cache"
export const LEGACY_PROMPTS_CACHE_STORAGE_KEY = "prompthub_prompts_cache"

let promptsCache: IPrompt[] | null = null
const cacheInvalidationListeners = new Set<() => void>()

export function getCachedPrompts(): IPrompt[] | null {
  if (promptsCache !== null) {
    return promptsCache
  }
  if (typeof window !== "undefined" && window.localStorage) {
    const raw =
      window.localStorage.getItem(PROMPTS_CACHE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_PROMPTS_CACHE_STORAGE_KEY)
    if (raw) {
      try {
        promptsCache = JSON.parse(raw) as IPrompt[]
        window.localStorage.setItem(
          PROMPTS_CACHE_STORAGE_KEY,
          JSON.stringify(promptsCache)
        )
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          void chrome.storage.local.set({
            [PROMPTS_CACHE_STORAGE_KEY]: promptsCache
          })
        }
        return promptsCache
      } catch {
        window.localStorage.removeItem(PROMPTS_CACHE_STORAGE_KEY)
        window.localStorage.removeItem(LEGACY_PROMPTS_CACHE_STORAGE_KEY)
      }
    }
  }
  return null
}

export function setCachedPrompts(prompts: IPrompt[]): void {
  promptsCache = prompts
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(
      PROMPTS_CACHE_STORAGE_KEY,
      JSON.stringify(prompts)
    )
  }
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    void chrome.storage.local.set({ [PROMPTS_CACHE_STORAGE_KEY]: prompts })
  }
}

export function invalidatePromptsCache(): void {
  promptsCache = null
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(PROMPTS_CACHE_STORAGE_KEY)
  }
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    void chrome.storage.local.remove(PROMPTS_CACHE_STORAGE_KEY)
  }
  cacheInvalidationListeners.forEach((listener) => listener())
}

export function subscribePromptsCache(listener: () => void): () => void {
  cacheInvalidationListeners.add(listener)
  return () => {
    cacheInvalidationListeners.delete(listener)
  }
}

export class PromptsApi {
  private readonly baseUrl: string

  constructor(baseUrl: string = DEFAULT_API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async fetchPrompts(
    accessToken?: string,
    forceRefresh: boolean = false
  ): Promise<IPrompt[]> {
    if (!forceRefresh) {
      const cached = getCachedPrompts()
      if (cached !== null) {
        return cached
      }
    }

    try {
      const response = await apiRequest<IPrompt[] | { prompts: IPrompt[] }>(
        `${this.baseUrl}/prompts`,
        {
          method: "GET"
        },
        accessToken
      )
      const prompts = Array.isArray(response)
        ? response
        : response.prompts ?? []
      setCachedPrompts(prompts)
      return prompts
    } catch (error) {
      console.error("Failed to fetch prompts:", error)
      return getCachedPrompts() ?? []
    }
  }

  async createPrompt(
    data: CreatePromptRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = createPromptSchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/create`,
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async updatePromptTitle(
    data: UpdatePromptTitleRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = updatePromptTitleSchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/change/title`,
      {
        method: "PATCH",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async updatePromptBody(
    data: UpdatePromptBodyRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = updatePromptBodySchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/change/body`,
      {
        method: "PATCH",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async updatePromptTags(
    data: UpdatePromptTagsRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = updatePromptTagsSchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/change/tags`,
      {
        method: "PATCH",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async updatePromptIcon(
    data: UpdatePromptIconRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = updatePromptIconSchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/change/icon`,
      {
        method: "PATCH",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async deletePrompt(
    data: DeletePromptRequest,
    accessToken?: string
  ): Promise<ApiMessageResponse> {
    const validated = deletePromptSchema.parse(data)
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/delete`,
      {
        method: "DELETE",
        body: JSON.stringify(validated)
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async deleteAllPrompts(accessToken?: string): Promise<ApiMessageResponse> {
    const response = await apiRequest<ApiMessageResponse>(
      `${this.baseUrl}/prompts/delete/all`,
      {
        method: "DELETE"
      },
      accessToken
    )
    invalidatePromptsCache()
    return response
  }

  async syncPrompts(
    payload: SyncPromptsPayloadDto,
    accessToken?: string
  ): Promise<SyncPromptsResultDto> {
    return apiRequest<SyncPromptsResultDto>(
      `${this.baseUrl}/prompts/sync`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      accessToken
    )
  }
}

export const promptsApi = new PromptsApi()

export async function syncPromptsApi(
  payload: SyncPromptsPayloadDto,
  accessToken?: string
): Promise<SyncPromptsResultDto> {
  return promptsApi.syncPrompts(payload, accessToken)
}

export async function fetchPrompts(
  accessToken?: string,
  forceRefresh: boolean = false
): Promise<IPrompt[]> {
  return promptsApi.fetchPrompts(accessToken, forceRefresh)
}

export async function createPrompt(
  data: CreatePromptRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.createPrompt(data, accessToken)
}

export async function updatePromptTitle(
  data: UpdatePromptTitleRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.updatePromptTitle(data, accessToken)
}

export async function updatePromptBody(
  data: UpdatePromptBodyRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.updatePromptBody(data, accessToken)
}

export async function updatePromptTags(
  data: UpdatePromptTagsRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.updatePromptTags(data, accessToken)
}

export async function updatePromptIcon(
  data: UpdatePromptIconRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.updatePromptIcon(data, accessToken)
}

export async function deletePrompt(
  data: DeletePromptRequest,
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.deletePrompt(data, accessToken)
}

export async function deleteAllPrompts(
  accessToken?: string
): Promise<ApiMessageResponse> {
  return promptsApi.deleteAllPrompts(accessToken)
}
