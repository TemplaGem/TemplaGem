import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_EMBEDDED_MANIFEST,
  ManifestService,
  matchUrlPattern,
  PLATFORMS_MANIFEST_LAST_FETCH_KEY,
  PLATFORMS_MANIFEST_STORAGE_KEY,
  resolveActivePlatformRule
} from "../services/manifest/manifest-service"
import type { PlatformRulesManifest } from "../services/manifest/types"

describe("ManifestService & URL Matching", () => {
  beforeEach(() => {
    ManifestService.clearMemoryCache()
    vi.unstubAllGlobals()
  })

  describe("matchUrlPattern", () => {
    it("matches wildcards and exact URLs correctly", () => {
      expect(
        matchUrlPattern("https://gemini.google.com/app/123", "https://gemini.google.com/*")
      ).toBe(true)
      expect(
        matchUrlPattern("https://chatgpt.com/c/abc", "https://chatgpt.com/*")
      ).toBe(true)
      expect(
        matchUrlPattern("https://chat.deepseek.com/", "https://chat.deepseek.com/*")
      ).toBe(true)
      expect(
        matchUrlPattern("https://claude.ai/chat/1", "https://claude.ai/*")
      ).toBe(true)
      expect(
        matchUrlPattern("https://other-site.com", "https://claude.ai/*")
      ).toBe(false)
    })
  })

  describe("resolveActivePlatformRule", () => {
    it("resolves default embedded rules for Gemini, ChatGPT, Claude, and DeepSeek", () => {
      const geminiRule = resolveActivePlatformRule(
        "https://gemini.google.com/app",
        DEFAULT_EMBEDDED_MANIFEST
      )
      expect(geminiRule).not.toBeNull()
      expect(geminiRule?.id).toBe("gemini")
      expect(geminiRule?.editor.type).toBe("quill")
      expect(geminiRule?.theme?.accentColor).toBe("#0b57d0")

      const chatgptRule = resolveActivePlatformRule(
        "https://chatgpt.com/c/123",
        DEFAULT_EMBEDDED_MANIFEST
      )
      expect(chatgptRule).not.toBeNull()
      expect(chatgptRule?.id).toBe("chatgpt")
      expect(chatgptRule?.editor.type).toBe("prosemirror")
      expect(chatgptRule?.theme?.accentColor).toBe("#000000")

      const claudeRule = resolveActivePlatformRule(
        "https://claude.ai/chat/new",
        DEFAULT_EMBEDDED_MANIFEST
      )
      expect(claudeRule).not.toBeNull()
      expect(claudeRule?.id).toBe("claude")
      expect(claudeRule?.theme?.accentColor).toBe("#d97706")

      const deepseekRule = resolveActivePlatformRule(
        "https://chat.deepseek.com/",
        DEFAULT_EMBEDDED_MANIFEST
      )
      expect(deepseekRule).not.toBeNull()
      expect(deepseekRule?.id).toBe("deepseek")
      expect(deepseekRule?.editor.type).toBe("textarea")
      expect(deepseekRule?.theme?.accentColor).toBe("#4d6bfe")
    })

    it("returns null for unsupported domains", () => {
      const rule = resolveActivePlatformRule(
        "https://random-forum.org/threads",
        DEFAULT_EMBEDDED_MANIFEST
      )
      expect(rule).toBeNull()
    })
  })

  describe("ManifestService.getManifest", () => {
    it("fetches fresh manifest from backend and saves to chrome.storage.local", async () => {
      const mockManifest: PlatformRulesManifest = {
        version: 2,
        updatedAt: "2026-10-27T14:00:00Z",
        ttlMinutes: 60,
        platforms: [
          {
            id: "chatgpt",
            name: "ChatGPT Updated",
            enabled: true,
            matches: ["https://chatgpt.com/*"],
            selectors: {
              input: ["#custom-input-selector"],
              container: ["form.custom"]
            },
            editor: { type: "prosemirror", insertStrategy: "inputEvent" },
            popover: { attachTo: "container", offset: { x: 0, y: 10 } }
          }
        ]
      }

      const mockStorage: Record<string, unknown> = {}
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockImplementation((keys: string[]) => {
              const res: Record<string, unknown> = {}
              keys.forEach((k) => {
                if (mockStorage[k]) res[k] = mockStorage[k]
              })
              return Promise.resolve(res)
            }),
            set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
              Object.assign(mockStorage, data)
              return Promise.resolve()
            })
          }
        }
      })

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockManifest
        })
      )

      const manifest = await ManifestService.getManifest()
      expect(manifest.version).toBe(2)
      expect(manifest.platforms[0].name).toBe("ChatGPT Updated")
      expect(mockStorage[PLATFORMS_MANIFEST_STORAGE_KEY]).toEqual(mockManifest)
      expect(typeof mockStorage[PLATFORMS_MANIFEST_LAST_FETCH_KEY]).toBe("number")
    })

    it("falls back to cached or embedded default when network fails", async () => {
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined)
          }
        }
      })

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network offline"))
      )

      const manifest = await ManifestService.getManifest()
      expect(manifest.version).toBe(DEFAULT_EMBEDDED_MANIFEST.version)
      expect(manifest.platforms.length).toBe(DEFAULT_EMBEDDED_MANIFEST.platforms.length)
    })
  })
})

