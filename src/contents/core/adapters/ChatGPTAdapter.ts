import type { PlatformRule } from "../../../services/manifest/types"
import { TemplateHighlighter } from "../../TemplateHighlighter"
import { BaseAdapter } from "./BaseAdapter"

export class ChatGPTAdapter extends BaseAdapter {
  readonly platformId = "chatgpt"

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
      // ContentEditable / ProseMirror editor
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
          const beforeInputEvt =
            typeof InputEvent === "function"
              ? new InputEvent("beforeinput", {
                  bubbles: true,
                  cancelable: true,
                  inputType: "insertText",
                  data: text
                })
              : new Event("beforeinput", { bubbles: true })
          el.dispatchEvent(beforeInputEvt)

          // Direct text node fallback if execCommand was not handled
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
    }

    // Handle template variable highlighting
    const variables = TemplateHighlighter.findVariablesInText(text)
    if (variables.length > 0) {
      this.applyVariableHighlights(variables, el)
      // Focus the first variable if present
      const firstVar = variables[0]
      this.setCursorOffset(firstVar.innerStart, el)
    }
  }
}

