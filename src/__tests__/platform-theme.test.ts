import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AdapterFactory } from "../contents/core/adapters/AdapterFactory"
import { ChatGPTAdapter } from "../contents/core/adapters/ChatGPTAdapter"
import { ClaudeAdapter } from "../contents/core/adapters/ClaudeAdapter"
import { DeepSeekAdapter } from "../contents/core/adapters/DeepSeekAdapter"
import { GeminiAdapter } from "../contents/core/adapters/GeminiAdapter"
import { TEMPLAGEM_GEMINI_ROOT_ID } from "../contents/gemini-elements"
import { usePlatformTheme } from "../contents/hooks/usePlatformTheme"
import {
  ManifestService,
  resolveActivePlatformRule
} from "../services/manifest/manifest-service"
import {
  extractPlatformAccentColor,
  getContrastColor,
  hexToRgba,
  resolvePlatformTheme
} from "../services/manifest/theme-utils"
import type { PlatformRule } from "../services/manifest/types"

describe("Platform Dynamic Accent Color & Theme", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("hexToRgba", () => {
    it("converts 6-digit hex colors to rgba with alpha", () => {
      expect(hexToRgba("#d97706", 0.1)).toBe("rgba(217, 119, 6, 0.1)")
      expect(hexToRgba("#000000", 0.25)).toBe("rgba(0, 0, 0, 0.25)")
      expect(hexToRgba("#ffffff", 0.5)).toBe("rgba(255, 255, 255, 0.5)")
    })

    it("converts 3-digit hex colors to rgba with alpha", () => {
      expect(hexToRgba("#000", 0.1)).toBe("rgba(0, 0, 0, 0.1)")
      expect(hexToRgba("#fff", 0.8)).toBe("rgba(255, 255, 255, 0.8)")
    })

    it("handles rgb and rgba strings gracefully", () => {
      expect(hexToRgba("rgb(10, 20, 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)")
      expect(hexToRgba("rgba(10, 20, 30, 0.4)", 0.2)).toBe(
        "rgba(10, 20, 30, 0.4)"
      )
    })

    it("falls back gracefully for invalid or empty values", () => {
      expect(hexToRgba("", 0.1)).toBe("rgba(11, 87, 208, 0.1)")
      expect(hexToRgba("invalid", 0.1)).toBe("invalid")
    })
  })

  describe("getContrastColor", () => {
    it("returns dark text for light or pastel backgrounds", () => {
      expect(getContrastColor("#ffffff")).toBe("#111827")
      expect(getContrastColor("#a8c7fa")).toBe("#111827")
      expect(getContrastColor("#ffff00")).toBe("#111827")
      expect(getContrastColor("rgb(255, 255, 255)")).toBe("#111827")
    })

    it("returns white text for dark or vibrant backgrounds", () => {
      expect(getContrastColor("#000000")).toBe("#ffffff")
      expect(getContrastColor("#0b57d0")).toBe("#ffffff")
      expect(getContrastColor("#d97706")).toBe("#ffffff")
      expect(getContrastColor("#4d6bfe")).toBe("#ffffff")
      expect(getContrastColor("rgb(0, 0, 0)")).toBe("#ffffff")
      expect(getContrastColor("")).toBe("#ffffff")
    })
  })

  describe("extractPlatformAccentColor & resolvePlatformTheme", () => {
    it("extracts Claude orange (#d97706) from default manifest", () => {
      const claudeRule = resolveActivePlatformRule("https://claude.ai/chat")
      expect(claudeRule).toBeDefined()
      expect(claudeRule?.id).toBe("claude")

      const lightTheme = resolvePlatformTheme(claudeRule, false)
      expect(lightTheme.accentColor).toBe("#d97706")
      expect(lightTheme.accentSoft).toBe("rgba(217, 119, 6, 0.1)")
      expect(lightTheme.accentBorder).toBe("rgba(217, 119, 6, 0.28)")
      expect(lightTheme.accentContrast).toBe("#ffffff")

      const darkTheme = resolvePlatformTheme(claudeRule, true)
      expect(darkTheme.accentColor).toBe("#f59e0b")
      expect(darkTheme.accentContrast).toBe("#111827")
    })

    it("extracts ChatGPT black (#000000 in light, #ffffff in dark) from default manifest", () => {
      const gptRule = resolveActivePlatformRule("https://chatgpt.com/")
      expect(gptRule).toBeDefined()
      expect(gptRule?.id).toBe("chatgpt")

      const lightTheme = resolvePlatformTheme(gptRule, false)
      expect(lightTheme.accentColor).toBe("#000000")
      expect(lightTheme.accentSoft).toBe("rgba(0, 0, 0, 0.1)")
      expect(lightTheme.accentBorder).toBe("rgba(0, 0, 0, 0.28)")
      expect(lightTheme.accentContrast).toBe("#ffffff")

      const darkTheme = resolvePlatformTheme(gptRule, true)
      expect(darkTheme.accentColor).toBe("#ffffff")
      expect(darkTheme.accentContrast).toBe("#111827")
    })

    it("extracts DeepSeek blue (#4d6bfe) from default manifest", () => {
      const dsRule = resolveActivePlatformRule("https://chat.deepseek.com/")
      expect(dsRule).toBeDefined()
      expect(dsRule?.id).toBe("deepseek")

      const theme = resolvePlatformTheme(dsRule, false)
      expect(theme.accentColor).toBe("#4d6bfe")
      expect(theme.accentSoft).toBe("rgba(77, 107, 254, 0.1)")
    })

    it("supports various backend manifest schema structures for accent colors", () => {
      // Backend format 1: Flat accentColor
      const flatRule: PlatformRule = {
        id: "custom-site",
        name: "Custom Site",
        enabled: true,
        matches: ["https://custom.ai/*"],
        accentColor: "#ec4899",
        accentColorDark: "#f472b6",
        selectors: { input: ["textarea"], container: ["form"] },
        editor: { type: "textarea", insertStrategy: "directValue" },
        popover: { attachTo: "container", offset: { x: 0, y: 0 } }
      }
      expect(extractPlatformAccentColor(flatRule, false)).toBe("#ec4899")
      expect(extractPlatformAccentColor(flatRule, true)).toBe("#f472b6")

      // Backend format 2: Nested theme object with custom borders
      const customBorderRule: PlatformRule = {
        ...flatRule,
        theme: {
          accentColor: "#10b981",
          accentSoft: "rgba(16, 185, 129, 0.15)",
          accentBorder: "rgba(16, 185, 129, 0.35)",
          accentContrast: "#000000"
        }
      }
      const resolved = resolvePlatformTheme(customBorderRule, false)
      expect(resolved.accentColor).toBe("#10b981")
      expect(resolved.accentSoft).toBe("rgba(16, 185, 129, 0.15)")
      expect(resolved.accentBorder).toBe("rgba(16, 185, 129, 0.35)")
      expect(resolved.accentContrast).toBe("#000000")

      // Backend format 3: Nested colors object
      const colorsObjRule = {
        ...flatRule,
        theme: undefined,
        accentColor: undefined,
        accentColorDark: undefined,
        colors: { accent: "#8b5cf6", accentDark: "#a78bfa" }
      } as unknown as PlatformRule
      expect(extractPlatformAccentColor(colorsObjRule, false)).toBe("#8b5cf6")
      expect(extractPlatformAccentColor(colorsObjRule, true)).toBe("#a78bfa")

      // Known platform fallback without theme properties
      const bareGeminiRule: PlatformRule = {
        id: "gemini",
        name: "Bare Gemini",
        enabled: true,
        matches: ["https://gemini.google.com/*"],
        selectors: { input: ["textarea"], container: ["form"] },
        editor: { type: "textarea", insertStrategy: "directValue" },
        popover: { attachTo: "container", offset: { x: 0, y: 0 } }
      }
      expect(extractPlatformAccentColor(bareGeminiRule, false)).toBe("#0b57d0")
      expect(extractPlatformAccentColor(bareGeminiRule, true)).toBe("#a8c7fa")
    })

    it("falls back safely to default TemplaGem colors when rule is null", () => {
      const themeLight = resolvePlatformTheme(null, false)
      expect(themeLight.accentColor).toBe("#0b57d0")

      const themeDark = resolvePlatformTheme(null, true)
      expect(themeDark.accentColor).toBe("#a8c7fa")
    })
  })

  describe("Adapters & AdapterFactory with dynamic platform themes", () => {
    it("AdapterFactory automatically resolves rule and theme tokens from URL", () => {
      const claudeAdapter = AdapterFactory.createAdapter("https://claude.ai/chat")
      expect(claudeAdapter).toBeInstanceOf(ClaudeAdapter)
      expect(claudeAdapter.rule?.id).toBe("claude")
      expect(claudeAdapter.getThemeTokens(false).accentColor).toBe("#d97706")

      const chatgptAdapter = AdapterFactory.createAdapter("https://chatgpt.com/")
      expect(chatgptAdapter).toBeInstanceOf(ChatGPTAdapter)
      expect(chatgptAdapter.rule?.id).toBe("chatgpt")
      expect(chatgptAdapter.getThemeTokens(false).accentColor).toBe("#000000")

      const geminiAdapter = AdapterFactory.createAdapter("https://gemini.google.com/app")
      expect(geminiAdapter).toBeInstanceOf(GeminiAdapter)
      expect(geminiAdapter.getThemeTokens(false).accentColor).toBe("#0b57d0")

      const deepseekAdapter = AdapterFactory.createAdapter("https://chat.deepseek.com/")
      expect(deepseekAdapter).toBeInstanceOf(DeepSeekAdapter)
      expect(deepseekAdapter.getThemeTokens(false).accentColor).toBe("#4d6bfe")
    })
  })

  describe("usePlatformTheme hook", () => {
    it("synchronizes CSS variables to root container and document", async () => {
      const root = document.createElement("div")
      root.id = TEMPLAGEM_GEMINI_ROOT_ID
      document.body.appendChild(root)

      const { result, rerender } = renderHook(
        ({ isDark }) => usePlatformTheme(isDark),
        { initialProps: { isDark: false } }
      )

      expect(result.current.cssVariables["--accent-color"]).toBeDefined()
      expect(root.style.getPropertyValue("--accent-color")).toBe(
        result.current.tokens.accentColor
      )
      expect(document.documentElement.style.getPropertyValue("--accent-color")).toBe(
        result.current.tokens.accentColor
      )

      // Toggle dark mode
      rerender({ isDark: true })
      expect(result.current.tokens.accentColor).toBeDefined()

      // When ManifestService updates
      vi.spyOn(ManifestService, "getManifest").mockResolvedValue({
        version: 1,
        updatedAt: new Date().toISOString(),
        ttlMinutes: 60,
        platforms: [
          {
            id: "gemini",
            name: "Updated Gemini",
            enabled: true,
            matches: ["<all_urls>"],
            selectors: { input: ["textarea"], container: ["form"] },
            editor: { type: "quill", insertStrategy: "execCommand" },
            popover: { attachTo: "container", offset: { x: 0, y: 0 } },
            accentColor: "#2563eb"
          }
        ]
      })

      const { result: updatedResult } = renderHook(() => usePlatformTheme(false))
      await waitFor(() => {
        expect(updatedResult.current.tokens.accentColor).toBe("#2563eb")
      })
    })

    it("handles getManifest rejection and missing rootContainer gracefully", async () => {
      document.body.innerHTML = "" // no rootContainer
      vi.spyOn(ManifestService, "getManifest").mockRejectedValue(new Error("Network offline"))

      const { result } = renderHook(() => usePlatformTheme(false))
      expect(result.current.tokens.accentColor).toBeDefined()
    })
  })
})
