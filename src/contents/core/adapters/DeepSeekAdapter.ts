import type { PlatformRule } from "../../../services/manifest/types"
import { TemplateHighlighter } from "../../TemplateHighlighter"
import { BaseAdapter } from "./BaseAdapter"

export class DeepSeekAdapter extends BaseAdapter {
  readonly platformId = "deepseek"

  constructor(rule: PlatformRule | null = null) {
    super(rule)
  }

  insertText(text: string, input?: HTMLElement | null): void {
    const el = input || this.findInput()
    if (!el) return

    el.focus()

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set

      if (nativeSetter) {
        nativeSetter.call(el, text)
      } else {
        el.value = text
      }

      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    } else {
      // ContentEditable fallback
      el.textContent = text
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }

    const variables = TemplateHighlighter.findVariablesInText(text)
    if (variables.length > 0) {
      this.applyVariableHighlights(variables, el)
      const firstVar = variables[0]
      this.setCursorOffset(firstVar.innerStart, el)
    }
  }
}

