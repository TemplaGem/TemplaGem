import {
  resolvePlatformTheme,
  type ResolvedPlatformTheme
} from "../../../services/manifest/theme-utils"
import type { PlatformRule } from "../../../services/manifest/types"
import {
  getContentEditableSelectionOffsets,
  setContentEditableSelection
} from "../../gemini-selection"
import {
  TemplateHighlighter,
  type TemplateVariableLocation
} from "../../TemplateHighlighter"
import { DiscoveryEngine } from "../discovery-engine"
import type { ChatInputAdapter } from "../types"

export abstract class BaseAdapter implements ChatInputAdapter {
  abstract readonly platformId: string
  readonly rule: PlatformRule | null

  constructor(rule: PlatformRule | null = null) {
    this.rule = rule
  }

  getThemeTokens(isDark: boolean = false): ResolvedPlatformTheme {
    return resolvePlatformTheme(this.rule, isDark)
  }

  findInput(target?: EventTarget | null): HTMLElement | null {
    return DiscoveryEngine.findInput(target, this.rule)
  }

  findContainer(input?: HTMLElement | null): HTMLElement | null {
    const el = input || this.findInput()
    return DiscoveryEngine.findContainer(el, this.rule)
  }

  findSubmitButton(input?: HTMLElement | null): HTMLElement | null {
    const el = input || this.findInput()
    return DiscoveryEngine.findSubmitButton(el, this.rule)
  }

  getText(input?: HTMLElement | null): string {
    const el = input || this.findInput()
    if (!el) return ""
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value
    }
    return el.innerText ?? el.textContent ?? ""
  }

  setText(text: string, input?: HTMLElement | null): void {
    const el = input || this.findInput()
    if (!el) return
    this.insertText(text, el)
  }

  abstract insertText(text: string, input?: HTMLElement | null): void

  getSelectionOffsets(
    input?: HTMLElement | null
  ): { start: number; end: number } | null {
    const el = input || this.findInput()
    if (!el) return null

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      return { start, end }
    }

    return getContentEditableSelectionOffsets(el)
  }

  setCursorOffset(offset: number, input?: HTMLElement | null): void {
    const el = input || this.findInput()
    if (!el) return

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus()
      el.setSelectionRange(offset, offset)
      return
    }

    setContentEditableSelection(el, offset, offset)
  }

  applyVariableHighlights(
    variables: TemplateVariableLocation[],
    input?: HTMLElement | null
  ): void {
    const el = input || this.findInput()
    if (!el) return

    // Prefer non-destructive CSS Custom Highlight API
    const applied = TemplateHighlighter.applyCustomHighlights(el, variables)
    if (!applied && el.isContentEditable) {
      // Fallback for environments lacking CSS.highlights
      TemplateHighlighter.applyHighlightClasses(el)
    }
  }

  clearVariableHighlights(input?: HTMLElement | null): void {
    TemplateHighlighter.clearCustomHighlights()
    const el = input || this.findInput()
    if (el) {
      TemplateHighlighter.removeHighlightClasses(el)
    }
  }
}

