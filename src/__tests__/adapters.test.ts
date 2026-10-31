import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdapterFactory } from "../contents/core/adapters/AdapterFactory"
import { BaseAdapter } from "../contents/core/adapters/BaseAdapter"
import { ChatGPTAdapter } from "../contents/core/adapters/ChatGPTAdapter"
import { ClaudeAdapter } from "../contents/core/adapters/ClaudeAdapter"
import { DeepSeekAdapter } from "../contents/core/adapters/DeepSeekAdapter"
import { GeminiAdapter } from "../contents/core/adapters/GeminiAdapter"
import { GenericAdapter } from "../contents/core/adapters/GenericAdapter"
import { DEFAULT_EMBEDDED_MANIFEST } from "../services/manifest/manifest-service"
import type { PlatformRule } from "../services/manifest/types"

describe("Platform Adapters & AdapterFactory", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  describe("AdapterFactory", () => {
    it("instantiates correct adapter by URL or rule ID", () => {
      const geminiAdapter = AdapterFactory.createAdapter("https://gemini.google.com/app")
      expect(geminiAdapter).toBeInstanceOf(GeminiAdapter)
      expect(geminiAdapter.platformId).toBe("gemini")

      const chatgptAdapter = AdapterFactory.createAdapter("https://chatgpt.com/c/123")
      expect(chatgptAdapter).toBeInstanceOf(ChatGPTAdapter)
      expect(chatgptAdapter.platformId).toBe("chatgpt")

      const chatgptOldAdapter = AdapterFactory.createAdapter("https://chat.openai.com/chat")
      expect(chatgptOldAdapter).toBeInstanceOf(ChatGPTAdapter)

      const claudeAdapter = AdapterFactory.createAdapter("https://claude.ai/chat")
      expect(claudeAdapter).toBeInstanceOf(ClaudeAdapter)
      expect(claudeAdapter.platformId).toBe("claude")

      const deepseekAdapter = AdapterFactory.createAdapter("https://chat.deepseek.com/")
      expect(deepseekAdapter).toBeInstanceOf(DeepSeekAdapter)
      expect(deepseekAdapter.platformId).toBe("deepseek")

      // Custom rule fallback to GenericAdapter
      const customRule: PlatformRule = {
        id: "custom-ai",
        name: "Custom AI",
        enabled: true,
        matches: ["https://custom.ai/*"],
        selectors: { input: ["textarea"], container: ["form"] },
        editor: { type: "textarea", insertStrategy: "directValue" },
        popover: { attachTo: "container", offset: { x: 0, y: 0 } }
      }
      const generic = AdapterFactory.createAdapter(undefined, customRule)
      expect(generic).toBeInstanceOf(GenericAdapter)
      expect(generic.platformId).toBe("generic")
    })

    it("identifies platform by inspecting DOM element features when URL is unknown", () => {
      // 1. Rich-textarea / ql-editor -> Gemini
      const richText = document.createElement("rich-textarea")
      const qlDiv = document.createElement("div")
      qlDiv.className = "ql-editor"
      richText.appendChild(qlDiv)
      document.body.appendChild(richText)
      expect(AdapterFactory.createAdapter("https://unknown.ai", null, qlDiv)).toBeInstanceOf(
        GeminiAdapter
      )

      // 2. prompt-textarea -> ChatGPT
      const gptInput = document.createElement("div")
      gptInput.id = "prompt-textarea"
      document.body.appendChild(gptInput)
      expect(AdapterFactory.createAdapter("https://unknown.ai", null, gptInput)).toBeInstanceOf(
        ChatGPTAdapter
      )

      // 3. chat-input -> DeepSeek
      const dsInput = document.createElement("textarea")
      dsInput.id = "chat-input"
      document.body.appendChild(dsInput)
      expect(AdapterFactory.createAdapter("https://unknown.ai", null, dsInput)).toBeInstanceOf(
        DeepSeekAdapter
      )

      // 4. ProseMirror in fieldset -> Claude
      const fieldset = document.createElement("fieldset")
      const claudeEditor = document.createElement("div")
      claudeEditor.className = "ProseMirror"
      fieldset.appendChild(claudeEditor)
      document.body.appendChild(fieldset)
      expect(AdapterFactory.createAdapter("https://unknown.ai", null, claudeEditor)).toBeInstanceOf(
        ClaudeAdapter
      )

      // 5. Unrecognized element -> defaults to GeminiAdapter
      const randomEl = document.createElement("div")
      expect(AdapterFactory.createAdapter("https://unknown.ai", null, randomEl)).toBeInstanceOf(
        GeminiAdapter
      )
    })
  })

  describe("BaseAdapter & GenericAdapter", () => {
    class TestAdapter extends BaseAdapter {
      readonly platformId = "test"
      insertText(text: string, input?: HTMLElement | null): void {
        const el = input || this.findInput()
        if (!el) return
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          el.value = text
        } else {
          el.textContent = text
        }
      }
    }

    it("gets and sets text across textarea and contenteditable elements", () => {
      const adapter = new TestAdapter()

      // Null handling
      expect(adapter.getText(null)).toBe("")
      adapter.setText("hello", null)

      // Textarea
      const textarea = document.createElement("textarea")
      textarea.value = "initial textarea"
      expect(adapter.getText(textarea)).toBe("initial textarea")
      adapter.setText("updated textarea", textarea)
      expect(textarea.value).toBe("updated textarea")

      // Contenteditable
      const editable = document.createElement("div")
      editable.textContent = "content editable text"
      expect(adapter.getText(editable)).toBe("content editable text")
      adapter.setText("new content", editable)
      expect(editable.textContent).toBe("new content")
    })

    it("finds container and submit button near input", () => {
      const form = document.createElement("form")
      form.className = "chat-input-container"
      const input = document.createElement("textarea")
      input.className = "ql-editor"
      const button = document.createElement("button")
      button.type = "submit"
      button.setAttribute("aria-label", "Send message")

      form.appendChild(input)
      form.appendChild(button)
      document.body.appendChild(form)

      const rule = DEFAULT_EMBEDDED_MANIFEST.platforms.find((p) => p.id === "gemini")!
      const adapter = new GeminiAdapter(rule)

      expect(adapter.findInput(input)).toBe(input)
      expect(adapter.findContainer(input)).toBe(form)
      expect(adapter.findSubmitButton(input)).toBe(button)
    })

    it("handles cursor offsets and selections in textarea and contenteditable", () => {
      const adapter = new TestAdapter()

      expect(adapter.getSelectionOffsets(null)).toBeNull()

      const textarea = document.createElement("textarea")
      textarea.value = "abcdef"
      document.body.appendChild(textarea)
      textarea.selectionStart = 2
      textarea.selectionEnd = 4

      const offsets = adapter.getSelectionOffsets(textarea)
      expect(offsets).toEqual({ start: 2, end: 4 })

      adapter.setCursorOffset(5, textarea)
      expect(textarea.selectionStart).toBe(5)
      expect(textarea.selectionEnd).toBe(5)

      // Contenteditable cursor offset
      const editable = document.createElement("div")
      editable.textContent = "editable text"
      document.body.appendChild(editable)
      adapter.setCursorOffset(3, editable)
    })

    it("applies and clears variable highlights on BaseAdapter and GenericAdapter", () => {
      const generic = new GenericAdapter()
      const div = document.createElement("div")
      document.body.appendChild(div)

      expect(() => {
        generic.applyVariableHighlights(
          [
            {
              index: 0,
              name: "variable",
              raw: "{{variable}}",
              fullStart: 0,
              fullEnd: 12,
              innerStart: 2,
              innerEnd: 10
            }
          ],
          div
        )
      }).not.toThrow()

      expect(() => {
        generic.clearVariableHighlights(div)
      }).not.toThrow()

      // Null element handling
      expect(() => generic.applyVariableHighlights([], null)).not.toThrow()
      expect(() => generic.clearVariableHighlights(null)).not.toThrow()

      // GenericAdapter insertion on contenteditable
      generic.insertText("Generic text with {{var}}", div)
      expect(div.textContent).toContain("Generic text")

      // GenericAdapter insertion on textarea
      const genTextarea = document.createElement("textarea")
      document.body.appendChild(genTextarea)
      generic.insertText("Generic textarea with {{val}}", genTextarea)
      expect(genTextarea.value).toBe("Generic textarea with {{val}}")

      // GenericAdapter when execCommand throws
      const throwingDiv = document.createElement("div")
      document.body.appendChild(throwingDiv)
      const origExec = document.execCommand
      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockImplementation(() => {
          throw new Error("fail")
        }),
        configurable: true,
        writable: true
      })
      generic.insertText("ExecCommand failed fallback", throwingDiv)
      expect(throwingDiv.textContent).toBe("ExecCommand failed fallback")
      Object.defineProperty(document, "execCommand", {
        value: origExec,
        configurable: true,
        writable: true
      })

      // GenericAdapter when nativeSetter is undefined
      const spyDesc = vi.spyOn(Object, "getOwnPropertyDescriptor").mockReturnValue(undefined)
      const fallbackTextarea = document.createElement("textarea")
      document.body.appendChild(fallbackTextarea)
      generic.insertText("Fallback value direct assignment", fallbackTextarea)
      expect(fallbackTextarea.value).toBe("Fallback value direct assignment")
      spyDesc.mockRestore()
    })
  })

  describe("ChatGPTAdapter", () => {
    it("inserts text, triggers input events, and highlights variables without crashing", () => {
      const editor = document.createElement("div")
      editor.id = "prompt-textarea"
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      const rule = DEFAULT_EMBEDDED_MANIFEST.platforms.find((p) => p.id === "chatgpt")!
      const adapter = new ChatGPTAdapter(rule)

      let inputDispatched = false
      editor.addEventListener("input", () => {
        inputDispatched = true
      })

      adapter.insertText("Hello {{name}}, welcome to {{project}}!", editor)

      expect(inputDispatched).toBe(true)
      expect(editor.textContent).toContain("Hello {{name}}, welcome to {{project}}!")

      // Highlights
      adapter.applyVariableHighlights([], editor)
      adapter.clearVariableHighlights(editor)

      // Null handling
      adapter.insertText("text", null)

      // Textarea input path
      const textarea = document.createElement("textarea")
      textarea.id = "prompt-textarea"
      document.body.appendChild(textarea)
      adapter.insertText("Prompt in textarea {{name}}", textarea)
      expect(textarea.value).toBe("Prompt in textarea {{name}}")
    })

    it("falls back to textContent if execCommand fails", () => {
      const editor = document.createElement("div")
      editor.id = "prompt-textarea"
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockReturnValue(false),
        configurable: true,
        writable: true
      })

      const adapter = new ChatGPTAdapter()
      adapter.insertText("Fallback text", editor)
      expect(editor.textContent).toBe("Fallback text")

      // Catch block when an exception is thrown during insertion
      const crashEditor = document.createElement("div")
      crashEditor.id = "prompt-textarea"
      crashEditor.setAttribute("contenteditable", "true")
      document.body.appendChild(crashEditor)

      const origGetSelection = window.getSelection
      window.getSelection = () => {
        throw new Error("Selection failure")
      }
      adapter.insertText("Recovered from error", crashEditor)
      expect(crashEditor.textContent).toBe("Recovered from error")
      window.getSelection = origGetSelection

      // Plain text without variables
      adapter.insertText("Plain text no variables", editor)
      expect(editor.textContent).toBe("Plain text no variables")
    })
  })

  describe("DeepSeekAdapter", () => {
    it("updates React-controlled textarea via native setter and dispatches input/change", () => {
      const textarea = document.createElement("textarea")
      textarea.id = "chat-input"
      document.body.appendChild(textarea)

      const rule = DEFAULT_EMBEDDED_MANIFEST.platforms.find((p) => p.id === "deepseek")!
      const adapter = new DeepSeekAdapter(rule)

      const events: string[] = []
      textarea.addEventListener("input", () => events.push("input"))
      textarea.addEventListener("change", () => events.push("change"))

      adapter.insertText("DeepSeek prompt with {{query}}", textarea)

      expect(textarea.value).toBe("DeepSeek prompt with {{query}}")
      expect(events).toContain("input")
      expect(events).toContain("change")

      // Highlights
      adapter.applyVariableHighlights([], textarea)
      adapter.clearVariableHighlights(textarea)

      // Null handling
      adapter.insertText("text", null)

      // ContentEditable fallback path
      const editableDiv = document.createElement("div")
      editableDiv.id = "chat-input"
      document.body.appendChild(editableDiv)
      adapter.insertText("DeepSeek in contenteditable", editableDiv)
      expect(editableDiv.textContent).toBe("DeepSeek in contenteditable")

      // Plain text without variables
      adapter.insertText("No variables text", textarea)
      expect(textarea.value).toBe("No variables text")
    })
  })

  describe("ClaudeAdapter", () => {
    it("inserts text into ProseMirror element and dispatches events", () => {
      const editor = document.createElement("div")
      editor.className = "ProseMirror"
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      const rule = DEFAULT_EMBEDDED_MANIFEST.platforms.find((p) => p.id === "claude")!
      const adapter = new ClaudeAdapter(rule)

      adapter.insertText("Claude prompt template for {{topic}}", editor)
      expect(editor.textContent).toContain("Claude prompt template for {{topic}}")

      // Highlights
      adapter.applyVariableHighlights([], editor)
      adapter.clearVariableHighlights(editor)

      // Null handling
      adapter.insertText("text", null)

      // Plain text without variables
      adapter.insertText("Claude plain text", editor)
      expect(editor.textContent).toContain("Claude plain text")
    })

    it("falls back to textContent if execCommand throws or fails", () => {
      const editor = document.createElement("div")
      editor.className = "ProseMirror"
      document.body.appendChild(editor)

      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockImplementation(() => {
          throw new Error("execCommand unsupported")
        }),
        configurable: true,
        writable: true
      })

      const adapter = new ClaudeAdapter()
      adapter.insertText("Fallback Claude text", editor)
      expect(editor.textContent).toBe("Fallback Claude text")
    })
  })

  describe("GeminiAdapter", () => {
    it("inserts text into Gemini editor", () => {
      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      const adapter = new GeminiAdapter()
      adapter.insertText("Gemini test prompt", editor)
      expect(editor.textContent).toContain("Gemini test prompt")

      adapter.insertText("null text", null)
    })
  })
})
