import * as z from "zod"

import defaultManifestJson from "./default-manifest.json"
import type { PlatformRulesManifest } from "./types"

export const platformSelectorsSchema = z.object({
  input: z
    .array(z.string().min(1))
    .min(1, "At least one input selector is required"),
  container: z.array(z.string().min(1)),
  submitButton: z.array(z.string().min(1)).optional()
})

export const platformEditorConfigSchema = z.object({
  type: z.enum(["quill", "prosemirror", "textarea", "contenteditable"]),
  insertStrategy: z.enum(["execCommand", "inputEvent", "directValue"])
})

export const platformPopoverConfigSchema = z.object({
  attachTo: z.enum(["container", "input", "body"]),
  offset: z.object({
    x: z.number(),
    y: z.number()
  })
})

export const platformThemeConfigSchema = z
  .object({
    accentColor: z.string().min(1),
    accentColorDark: z.string().optional(),
    accentSoft: z.string().optional(),
    accentBorder: z.string().optional(),
    accentContrast: z.string().optional()
  })
  .optional()

export const platformRuleSchema = z.object({
  id: z.string().min(1, "Platform id is required"),
  name: z.string().min(1, "Platform name is required"),
  enabled: z.boolean(),
  matches: z
    .array(z.string().min(1))
    .min(1, "At least one URL match pattern is required"),
  selectors: platformSelectorsSchema,
  editor: platformEditorConfigSchema,
  popover: platformPopoverConfigSchema,
  theme: platformThemeConfigSchema,
  accentColor: z.string().optional(),
  accentColorDark: z.string().optional()
})

export const platformRulesManifestSchema = z.object({
  version: z.number().int().min(1, "Manifest version must be at least 1"),
  updatedAt: z.string().optional().default(() => new Date().toISOString()),
  ttlMinutes: z.number().positive().optional().default(60),
  platforms: z
    .array(platformRuleSchema)
    .min(1, "Manifest must contain at least one platform rule")
})

/**
 * Validates whether the given data conforms to the PlatformRulesManifest schema.
 */
export function isPlatformRulesManifest(
  data: unknown
): data is PlatformRulesManifest {
  return platformRulesManifestSchema.safeParse(data).success
}

/**
 * Validates raw JSON string or parsed object against PlatformRulesManifest schema.
 * If data is valid, returns the typed manifest.
 * If invalid or parsing fails, returns the default embedded manifest as fallback.
 */
export function validateAndSanitizeManifest(
  raw: unknown,
  fallbackManifest: PlatformRulesManifest = defaultManifestJson as PlatformRulesManifest
): PlatformRulesManifest {
  if (raw === null || raw === undefined) {
    return fallbackManifest
  }

  let parsedData = raw
  if (typeof raw === "string") {
    try {
      parsedData = JSON.parse(raw)
    } catch (parseError) {
      console.warn(
        "[TemplaGem] Failed to parse manifest JSON string, using standard manifest fallback.",
        parseError
      )
      return fallbackManifest
    }
  }

  if (typeof parsedData !== "object" || parsedData === null) {
    console.warn(
      "[TemplaGem] Manifest payload must be an object, using standard manifest fallback."
    )
    return fallbackManifest
  }

  const result = platformRulesManifestSchema.safeParse(parsedData)
  if (result.success) {
    return result.data as PlatformRulesManifest
  }

  console.warn(
    "[TemplaGem] Manifest failed schema validation, using standard manifest fallback.",
    result.error.issues
  )
  return fallbackManifest
}
