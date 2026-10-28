import type { PlatformRule } from "../../../services/manifest/types"
import { TemplateHighlighter } from "../../TemplateHighlighter"
import { BaseAdapter } from "./BaseAdapter"

export class ClaudeAdapter extends BaseAdapter {
  readonly platformId = "claude"

  constructor(rule: PlatformRule | null = null) {
    super(rule)
  }

  insertText(text: string, input?: HTMLElement | null): void {
    const el = input || this.findInput()
    if (!el) return

    el.focus()

    try {
      if (typeof window !== "undefined" && window.getSelection) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(el)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }

      let inserted = false
      if (typeof document !== "undefined" && document.execCommand) {
        inserted = document.execCommand("insertText", false, text)
      }

      if (!inserted) {
        const beforeInput =
          typeof InputEvent === "function"
            ? new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: text
              })
            : new Event("beforeinput", { bubbles: true })
        el.dispatchEvent(beforeInput)
        el.textContent = text
      }

      const inputEvt =
        typeof InputEvent === "function"
          ? new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: text
            })
          : new Event("input", { bubbles: true })
      el.dispatchEvent(inputEvt)
      el.dispatchEvent(new Event("change", { bubbles: true }))
    } catch {
      el.textContent = text
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }

    const variables = TemplateHighlighter.findVariablesInText(text)
    if (variables.length > 0) {
      this.applyVariableHighlights(variables, el)
      const firstVar = variables[0]
      this.setCursorOffset(firstVar.innerStart, el)
    }
  }
}

