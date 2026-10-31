import { beforeEach, describe, expect, it, vi } from "vitest"

import defaultManifestJson from "../services/manifest/default-manifest.json"
import {
  DEFAULT_EMBEDDED_MANIFEST,
  ManifestService,
  PLATFORMS_MANIFEST_LAST_FETCH_KEY,
  PLATFORMS_MANIFEST_STORAGE_KEY
} from "../services/manifest/manifest-service"
import {
  isPlatformRulesManifest,
  validateAndSanitizeManifest
} from "../services/manifest/manifest-validation"
import type { PlatformRulesManifest } from "../services/manifest/types"

describe("Manifest Validation & Fallback", () => {
  beforeEach(() => {
    ManifestService.clearMemoryCache()
    vi.unstubAllGlobals()
  })

  describe("validateAndSanitizeManifest", () => {
    it("validates the embedded default-manifest.json successfully", () => {
      expect(isPlatformRulesManifest(defaultManifestJson)).toBe(true)
      const sanitized = validateAndSanitizeManifest(defaultManifestJson)
      expect(sanitized.version).toBe(defaultManifestJson.version)
      expect(sanitized.platforms.length).toBe(defaultManifestJson.platforms.length)
    })

    it("parses and validates a valid JSON string", () => {
      const validJsonString = JSON.stringify(defaultManifestJson)
      const result = validateAndSanitizeManifest(validJsonString)
      expect(result.platforms).toHaveLength(defaultManifestJson.platforms.length)
      expect(result.platforms[0].id).toBe("gemini")
    })

    it("falls back to standard manifest on malformed JSON string syntax", () => {
      const malformedJson = '{"version": 1, "platforms": [ incomplete...'
      const result = validateAndSanitizeManifest(malformedJson)

      expect(result).toEqual(DEFAULT_EMBEDDED_MANIFEST)
      expect(result.platforms[0].id).toBe("gemini")
    })

    it("falls back to standard manifest if input is null, undefined, or primitive", () => {
      expect(validateAndSanitizeManifest(null)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
      expect(validateAndSanitizeManifest(undefined)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
      expect(validateAndSanitizeManifest(12345)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
      expect(validateAndSanitizeManifest("just a string")).toEqual(DEFAULT_EMBEDDED_MANIFEST)
      expect(validateAndSanitizeManifest([])).toEqual(DEFAULT_EMBEDDED_MANIFEST)
    })

    it("falls back to standard manifest if version is invalid or missing", () => {
      const badVersion = {
        ...defaultManifestJson,
        version: "not-a-number"
      }
      expect(validateAndSanitizeManifest(badVersion)).toEqual(DEFAULT_EMBEDDED_MANIFEST)

      const negativeVersion = {
        ...defaultManifestJson,
        version: -1
      }
      expect(validateAndSanitizeManifest(negativeVersion)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
    })

    it("falls back to standard manifest if platforms array is empty or missing", () => {
      const emptyPlatforms = {
        version: 1,
        platforms: []
      }
      expect(validateAndSanitizeManifest(emptyPlatforms)).toEqual(DEFAULT_EMBEDDED_MANIFEST)

      const nonArrayPlatforms = {
        version: 1,
        platforms: "should-be-array"
      }
      expect(validateAndSanitizeManifest(nonArrayPlatforms)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
    })

    it("falls back to standard manifest if a platform rule has invalid fields", () => {
      const missingSelectors = {
        version: 1,
        platforms: [
          {
            id: "broken",
            name: "Broken Platform",
            enabled: true,
            matches: ["https://broken.ai/*"]
            // Missing selectors, editor, popover
          }
        ]
      }
      expect(validateAndSanitizeManifest(missingSelectors)).toEqual(DEFAULT_EMBEDDED_MANIFEST)

      const emptyInputSelectors = {
        version: 1,
        platforms: [
          {
            id: "broken",
            name: "Broken Platform",
            enabled: true,
            matches: ["https://broken.ai/*"],
            selectors: {
              input: [], // Must have at least one input selector
              container: [".container"]
            },
            editor: { type: "textarea", insertStrategy: "directValue" },
            popover: { attachTo: "container", offset: { x: 0, y: 0 } }
          }
        ]
      }
      expect(validateAndSanitizeManifest(emptyInputSelectors)).toEqual(DEFAULT_EMBEDDED_MANIFEST)
    })
  })

  describe("ManifestService backend fallback behavior", () => {
    it("substitutes standard manifest when backend returns invalid JSON", async () => {
      // Mock fetch returning invalid manifest schema
      const invalidBackendResponse = {
        randomGarbageField: 123,
        broken: true
      }

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => invalidBackendResponse
        })
      )

      const manifest = await ManifestService.getManifest(true)
      expect(manifest).toBeDefined()
      expect(manifest.version).toBe(DEFAULT_EMBEDDED_MANIFEST.version)
      expect(manifest.platforms.map((p) => p.id)).toEqual([
        "gemini",
        "chatgpt",
        "claude",
        "deepseek"
      ])
    })

    it("substitutes standard manifest when chrome.storage contains corrupted data", async () => {
      // Mock chrome.storage.local with corrupted manifest
      const mockStorage: Record<string, unknown> = {
        [PLATFORMS_MANIFEST_STORAGE_KEY]: { corrupted: "yes", version: "bad" },
        [PLATFORMS_MANIFEST_LAST_FETCH_KEY]: Date.now()
      }

      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn((keys: string[]) => {
              const res: Record<string, unknown> = {}
              keys.forEach((k) => (res[k] = mockStorage[k]))
              return Promise.resolve(res)
            }),
            set: vi.fn()
          }
        }
      })

      // Backend fails
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))

      const manifest = await ManifestService.getManifest(false)
      expect(manifest).toBeDefined()
      expect(manifest.platforms.length).toBe(4)
      expect(manifest.platforms[0].id).toBe("gemini")
    })

    it("accepts and stores valid manifest from backend", async () => {
      const validBackendManifest: PlatformRulesManifest = {
        version: 2,
        updatedAt: "2026-10-27T18:00:00Z",
        ttlMinutes: 120,
        platforms: [
          {
            id: "gemini",
            name: "Google Gemini Custom",
            enabled: true,
            matches: ["https://gemini.google.com/*"],
            selectors: {
              input: [".ql-editor"],
              container: [".input-area"]
            },
            editor: { type: "quill", insertStrategy: "execCommand" },
            popover: { attachTo: "container", offset: { x: 0, y: 8 } },
            accentColor: "#0b57d0"
          }
        ]
      }

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => validBackendManifest
        })
      )

      const manifest = await ManifestService.getManifest(true)
      expect(manifest.version).toBe(2)
      expect(manifest.platforms[0].name).toBe("Google Gemini Custom")
    })
  })
})

