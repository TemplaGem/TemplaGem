import { useEffect, useState } from "react"

import {
  ManifestService,
  resolveActivePlatformRule
} from "../../services/manifest/manifest-service"
import {
  resolvePlatformTheme,
  type ResolvedPlatformTheme
} from "../../services/manifest/theme-utils"
import type { PlatformRule } from "../../services/manifest/types"
import { TEMPLAGEM_GEMINI_ROOT_ID } from "../gemini-elements"

export interface PlatformThemeHookResult {
  rule: PlatformRule | null
  tokens: ResolvedPlatformTheme
  cssVariables: Record<string, string>
}

/**
 * Hook providing dynamic platform theme tokens and CSS variables based on the active website.
 * Reads platform colors from backend manifest with embedded fallbacks and updates DOM styles.
 */
export function usePlatformTheme(isDark: boolean = false): PlatformThemeHookResult {
  const [rule, setRule] = useState<PlatformRule | null>(() => {
    if (typeof window === "undefined") return null
    return resolveActivePlatformRule(window.location.href)
  })

  // Try to load any updated manifest from cache or backend
  useEffect(() => {
    let isMounted = true

    const loadRule = async () => {
      try {
        const manifest = await ManifestService.getManifest(false)
        if (isMounted && manifest && typeof window !== "undefined") {
          const matched = resolveActivePlatformRule(
            window.location.href,
            manifest
          )
          if (matched) {
            setRule(matched)
          }
        }
      } catch {
        // Embedded default rule remains active
      }
    }

    void loadRule()

    return () => {
      isMounted = false
    }
  }, [])

  const tokens = resolvePlatformTheme(rule, isDark)

  const cssVariables: Record<string, string> = {
    "--accent-color": tokens.accentColor,
    "--accent-soft": tokens.accentSoft,
    "--accent-border": tokens.accentBorder,
    "--accent-contrast": tokens.accentContrast
  }

  // Synchronize CSS custom properties to root container and document
  useEffect(() => {
    if (typeof document === "undefined") return

    const rootContainer = document.getElementById(TEMPLAGEM_GEMINI_ROOT_ID)
    if (rootContainer) {
      rootContainer.style.setProperty("--accent-color", tokens.accentColor)
      rootContainer.style.setProperty("--accent-soft", tokens.accentSoft)
      rootContainer.style.setProperty("--accent-border", tokens.accentBorder)
      rootContainer.style.setProperty("--accent-contrast", tokens.accentContrast)
    }

    const docEl = document.documentElement
    if (docEl) {
      docEl.style.setProperty("--accent-color", tokens.accentColor)
      docEl.style.setProperty("--accent-soft", tokens.accentSoft)
      docEl.style.setProperty("--accent-border", tokens.accentBorder)
      docEl.style.setProperty("--accent-contrast", tokens.accentContrast)
    }
  }, [tokens.accentColor, tokens.accentSoft, tokens.accentBorder, tokens.accentContrast])

  return {
    rule,
    tokens,
    cssVariables
  }
}

