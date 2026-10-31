import type { PlatformRule } from "./types"

export interface ResolvedPlatformTheme {
  accentColor: string
  accentSoft: string
  accentBorder: string
  accentContrast: string
}

/**
 * Converts a 3 or 6 digit hex color code to rgba(...) string with given alpha.
 * If the input is already rgb/rgba, adjusts or preserves it safely.
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || typeof hex !== "string") {
    return `rgba(11, 87, 208, ${alpha})`
  }

  const trimmed = hex.trim()

  if (trimmed.startsWith("rgba")) {
    return trimmed
  }

  if (trimmed.startsWith("rgb(")) {
    return trimmed.replace("rgb(", "rgba(").replace(")", `, ${alpha})`)
  }

  const cleanHex = trimmed.replace(/^#/, "")

  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16)
    const g = parseInt(cleanHex[1] + cleanHex[1], 16)
    const b = parseInt(cleanHex[2] + cleanHex[2], 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }

  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16)
    const g = parseInt(cleanHex.slice(2, 4), 16)
    const b = parseInt(cleanHex.slice(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }

  return trimmed
}

/**
 * Calculates a high-contrast foreground color (dark or white) based on background brightness (YIQ).
 */
export function getContrastColor(color: string): string {
  if (!color || typeof color !== "string") {
    return "#ffffff"
  }

  const trimmed = color.trim()
  let r = 255
  let g = 255
  let b = 255

  const cleanHex = trimmed.replace(/^#/, "")
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16)
    g = parseInt(cleanHex[1] + cleanHex[1], 16)
    b = parseInt(cleanHex[2] + cleanHex[2], 16)
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16)
    g = parseInt(cleanHex.slice(2, 4), 16)
    b = parseInt(cleanHex.slice(4, 6), 16)
  } else if (trimmed.startsWith("rgb")) {
    const parts = trimmed.match(/\d+/g)
    if (parts && parts.length >= 3) {
      r = Number(parts[0])
      g = Number(parts[1])
      b = Number(parts[2])
    }
  }

  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? "#111827" : "#ffffff"
}

/**
 * Known default branding colors as tier-3 fallback if rule has no color properties.
 */
const KNOWN_PLATFORM_COLORS: Record<
  string,
  { light: string; dark: string }
> = {
  gemini: { light: "#0b57d0", dark: "#a8c7fa" },
  chatgpt: { light: "#000000", dark: "#ffffff" },
  claude: { light: "#d97706", dark: "#f59e0b" },
  deepseek: { light: "#4d6bfe", dark: "#6b88fe" }
}

/**
 * Extracts the primary accent color from a PlatformRule with backward-compatibility for
 * multiple schema formats that backend manifests might send.
 */
export function extractPlatformAccentColor(
  rule?: PlatformRule | null,
  isDark: boolean = false
): string {
  if (!rule) {
    return isDark ? "#a8c7fa" : "#0b57d0"
  }

  const ruleAny = rule as unknown as Record<string, unknown>
  const themeObj = (rule.theme ?? ruleAny.theme) as Record<string, unknown> | undefined
  const colorsObj = ruleAny.colors as Record<string, unknown> | undefined

  if (isDark) {
    const darkCandidate =
      themeObj?.accentColorDark ??
      rule.accentColorDark ??
      ruleAny.accentColorDark ??
      colorsObj?.accentDark ??
      colorsObj?.dark

    if (typeof darkCandidate === "string" && darkCandidate.trim()) {
      return darkCandidate.trim()
    }
  }

  const candidate =
    themeObj?.accentColor ??
    rule.accentColor ??
    ruleAny.accentColor ??
    colorsObj?.accent ??
    ruleAny.color

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim()
  }

  if (rule.id && KNOWN_PLATFORM_COLORS[rule.id]) {
    const known = KNOWN_PLATFORM_COLORS[rule.id]
    return isDark ? known.dark : known.light
  }

  return isDark ? "#a8c7fa" : "#0b57d0"
}

/**
 * Resolves full CSS variable color tokens for the given platform rule and color mode.
 */
export function resolvePlatformTheme(
  rule?: PlatformRule | null,
  isDark: boolean = false
): ResolvedPlatformTheme {
  const accentColor = extractPlatformAccentColor(rule, isDark)

  const themeObj = rule?.theme as unknown as
    | Record<string, unknown>
    | undefined

  const softAlpha = isDark ? 0.16 : 0.1
  const borderAlpha = isDark ? 0.32 : 0.28

  const accentSoft =
    typeof themeObj?.accentSoft === "string" && themeObj.accentSoft.trim()
      ? themeObj.accentSoft.trim()
      : hexToRgba(accentColor, softAlpha)

  const accentBorder =
    typeof themeObj?.accentBorder === "string" && themeObj.accentBorder.trim()
      ? themeObj.accentBorder.trim()
      : hexToRgba(accentColor, borderAlpha)

  const accentContrast =
    typeof themeObj?.accentContrast === "string" &&
    themeObj.accentContrast.trim()
      ? themeObj.accentContrast.trim()
      : getContrastColor(accentColor)

  return {
    accentColor,
    accentSoft,
    accentBorder,
    accentContrast
  }
}
