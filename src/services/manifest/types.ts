export type EditorType = "quill" | "prosemirror" | "textarea" | "contenteditable"

export type InsertStrategy = "execCommand" | "inputEvent" | "directValue"

export interface PlatformSelectors {
  input: string[]
  container: string[]
  submitButton?: string[]
}

export interface PlatformEditorConfig {
  type: EditorType
  insertStrategy: InsertStrategy
}

export interface PlatformPopoverConfig {
  attachTo: "container" | "input" | "body"
  offset: {
    x: number
    y: number
  }
}

export interface PlatformThemeConfig {
  accentColor: string
  accentColorDark?: string
  accentSoft?: string
  accentBorder?: string
  accentContrast?: string
}

export interface PlatformRule {
  id: "gemini" | "chatgpt" | "claude" | "deepseek" | string
  name: string
  enabled: boolean
  matches: string[]
  selectors: PlatformSelectors
  editor: PlatformEditorConfig
  popover: PlatformPopoverConfig
  theme?: PlatformThemeConfig
  accentColor?: string
  accentColorDark?: string
}

export interface PlatformRulesManifest {
  version: number
  updatedAt: string
  ttlMinutes: number
  platforms: PlatformRule[]
}

