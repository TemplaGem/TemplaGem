import { beforeEach, describe, expect, it } from "vitest"

import { AdapterFactory } from "../contents/core/adapters/AdapterFactory"
import { ChatGPTAdapter } from "../contents/core/adapters/ChatGPTAdapter"
import { ClaudeAdapter } from "../contents/core/adapters/ClaudeAdapter"
import { DeepSeekAdapter } from "../contents/core/adapters/DeepSeekAdapter"
import { GeminiAdapter } from "../contents/core/adapters/GeminiAdapter"
import { DEFAULT_EMBEDDED_MANIFEST } from "../services/manifest/manifest-service"

describe("Platform Adapters & AdapterFactory", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  describe("AdapterFactory", () => {
    it("instantiates correct adapter by URL or rule ID", () => {
      const geminiAdapter = AdapterFactory.createAdapter("https://gemini.google.com/app")
      expect(geminiAdapter).toBeInstanceOf(GeminiAdapter)
      expect(geminiAdapter.platformId).toBe("gemini")

      const chatgptAdapter = AdapterFactory.createAdapter("https://chatgpt.com/c/123")
      expect(chatgptAdapter).toBeInstanceOf(ChatGPTAdapter)
      expect(chatgptAdapter.platformId).toBe("chatgpt")

      const claudeAdapter = AdapterFactory.createAdapter("https://claude.ai/chat")
      expect(claudeAdapter).toBeInstanceOf(ClaudeAdapter)
      expect(claudeAdapter.platformId).toBe("claude")

      const deepseekAdapter = AdapterFactory.createAdapter("https://chat.deepseek.com/")
      expect(deepseekAdapter).toBeInstanceOf(DeepSeekAdapter)
      expect(deepseekAdapter.platformId).toBe("deepseek")
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
    })
  })
})
