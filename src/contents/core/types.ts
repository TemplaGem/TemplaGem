import type { ResolvedPlatformTheme } from "../../services/manifest/theme-utils"
import type { PlatformRule } from "../../services/manifest/types"
import type { TemplateVariableLocation } from "../TemplateHighlighter"

export interface ChatInputAdapter {
  readonly platformId: string
  readonly rule: PlatformRule | null

  getThemeTokens(isDark?: boolean): ResolvedPlatformTheme

  findInput(target?: EventTarget | null): HTMLElement | null
  findContainer(input?: HTMLElement | null): HTMLElement | null
  findSubmitButton(input?: HTMLElement | null): HTMLElement | null

  getText(input?: HTMLElement | null): string
  setText(text: string, input?: HTMLElement | null): void
  insertText(text: string, input?: HTMLElement | null): void

  getSelectionOffsets(input?: HTMLElement | null): { start: number; end: number } | null
  setCursorOffset(offset: number, input?: HTMLElement | null): void

  applyVariableHighlights(
    variables: TemplateVariableLocation[],
    input?: HTMLElement | null
  ): void
  clearVariableHighlights(input?: HTMLElement | null): void
}

