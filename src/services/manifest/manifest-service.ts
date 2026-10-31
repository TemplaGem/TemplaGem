
import defaultManifestJson from "./default-manifest.json"
import {
  isPlatformRulesManifest,
  validateAndSanitizeManifest
} from "./manifest-validation"
import type { PlatformRule, PlatformRulesManifest } from "./types"

export { isPlatformRulesManifest, validateAndSanitizeManifest }

export const PLATFORMS_MANIFEST_STORAGE_KEY = "templagem_platforms_manifest"
export const PLATFORMS_MANIFEST_LAST_FETCH_KEY = "templagem_manifest_last_fetch"
export const DEFAULT_MANIFEST_TTL_MINUTES = 60

export const DEFAULT_EMBEDDED_MANIFEST: PlatformRulesManifest =
  defaultManifestJson as PlatformRulesManifest

/**
 * Checks whether a given URL matches a glob-style Chrome match pattern.
 * Supports patterns like "https://gemini.google.com/*", "https://chatgpt.com/*", etc.
 */
export function matchUrlPattern(url: string, pattern: string): boolean {
  if (pattern === "<all_urls>") {
    return true
  }

  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
    const regex = new RegExp(`^${escaped}$`, "i")
    return regex.test(url)
  } catch {
    return false
  }
}

/**
 * Resolves the active PlatformRule for a given URL against the provided manifest.
 */
export function resolveActivePlatformRule(
  url: string,
  manifest: PlatformRulesManifest = DEFAULT_EMBEDDED_MANIFEST
): PlatformRule | null {
  if (!manifest?.platforms || !Array.isArray(manifest.platforms)) {
    return null
  }

  for (const platform of manifest.platforms) {
    if (!platform.enabled) continue
    const isMatched = platform.matches.some((pattern) =>
      matchUrlPattern(url, pattern)
    )
    if (isMatched) {
      return platform
    }
  }

  return null
}

export class ManifestService {
  private static cachedManifest: PlatformRulesManifest | null = null

  /**
   * Returns the base URL for the manifest endpoint.
   */
  static getEndpointUrl(): string {
    const baseUrl =
      process.env.PLASMO_PUBLIC_API_URL || "http://localhost:4300/api"
    // Handle both http://localhost:4300/api and root domains
    const root = baseUrl.replace(/\/api\/?$/, "")
    return `${root}/api/v1/platforms/manifest`
  }

  /**
   * Loads the platforms manifest:
   * 1. Checks memory cache or chrome.storage.local
   * 2. If fresh (within TTL), returns cached version
   * 3. If expired or forceRefresh is true, fetches from backend
   * 4. Gracefully falls back to cached or embedded default manifest on error
   */
  static async getManifest(
    forceRefresh: boolean = false
  ): Promise<PlatformRulesManifest> {
    if (!forceRefresh && this.cachedManifest) {
      return this.cachedManifest
    }

    let storedManifest: PlatformRulesManifest | null = null
    let lastFetchTimestamp: number = 0

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      try {
        const data = await chrome.storage.local.get([
          PLATFORMS_MANIFEST_STORAGE_KEY,
          PLATFORMS_MANIFEST_LAST_FETCH_KEY
        ])
        if (data[PLATFORMS_MANIFEST_STORAGE_KEY]) {
          const candidate = data[PLATFORMS_MANIFEST_STORAGE_KEY]
          if (isPlatformRulesManifest(candidate)) {
            storedManifest = candidate
          }
        }
        if (typeof data[PLATFORMS_MANIFEST_LAST_FETCH_KEY] === "number") {
          lastFetchTimestamp = data[PLATFORMS_MANIFEST_LAST_FETCH_KEY]
        }
      } catch {
        // Fallback gracefully
      }
    }

    const ttlMinutes = storedManifest?.ttlMinutes ?? DEFAULT_MANIFEST_TTL_MINUTES
    const ttlMs = ttlMinutes * 60 * 1000
    const isCacheExpired = Date.now() - lastFetchTimestamp > ttlMs

    if (!forceRefresh && storedManifest && !isCacheExpired) {
      this.cachedManifest = storedManifest
      return storedManifest
    }

    try {
      const endpoint = this.getEndpointUrl()
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" }
      })

      if (response.ok) {
        const rawJson: unknown = await response.json()
        if (isPlatformRulesManifest(rawJson)) {
          const validatedManifest = validateAndSanitizeManifest(
            rawJson,
            DEFAULT_EMBEDDED_MANIFEST
          )
          this.cachedManifest = validatedManifest

          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            await chrome.storage.local.set({
              [PLATFORMS_MANIFEST_STORAGE_KEY]: validatedManifest,
              [PLATFORMS_MANIFEST_LAST_FETCH_KEY]: Date.now()
            })
          }

          return validatedManifest
        } else {
          console.warn(
            "[TemplaGem] Incoming manifest from backend is invalid; substituting standard manifest."
          )
        }
      }
    } catch {
      // Backend unavailable or network error
    }

    const fallback =
      storedManifest && isPlatformRulesManifest(storedManifest)
        ? storedManifest
        : DEFAULT_EMBEDDED_MANIFEST
    this.cachedManifest = fallback
    return fallback
  }

  /**
   * Validates and sanitizes a raw manifest JSON object or string,
   * returning the default manifest if validation fails.
   */
  static validateManifest(raw: unknown): PlatformRulesManifest {
    return validateAndSanitizeManifest(raw, DEFAULT_EMBEDDED_MANIFEST)
  }

  /**
   * Resolves the active rule for a specific URL using the latest manifest.
   */
  static async getActiveRuleForUrl(
    url: string,
    forceRefresh: boolean = false
  ): Promise<PlatformRule | null> {
    const manifest = await this.getManifest(forceRefresh)
    return resolveActivePlatformRule(url, manifest)
  }

  /**
   * Resets in-memory cached instance (useful for unit testing).
   */
  static clearMemoryCache(): void {
    this.cachedManifest = null
  }
}

