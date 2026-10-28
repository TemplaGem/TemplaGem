import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DiscoveryEngine,
  isTemplaGemRoot,
  TEMPLAGEM_ROOT_CONTAINER_ID
} from "../contents/core/discovery-engine"
import { DEFAULT_EMBEDDED_MANIFEST } from "../services/manifest/manifest-service"
import type { PlatformRule } from "../services/manifest/types"

describe("DiscoveryEngine (Cascading Input Discovery)", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    DiscoveryEngine.reset()
  })

  afterEach(() => {
    document.body.innerHTML = ""
    DiscoveryEngine.reset()
  })

  describe("Tier 1: Manifest selectors discovery", () => {
    it("finds ChatGPT input by #prompt-textarea", () => {
      const form = document.createElement("form")
      form.className = "stretch"
      const editor = document.createElement("div")
      editor.id = "prompt-textarea"
      editor.setAttribute("contenteditable", "true")
      form.appendChild(editor)
      document.body.appendChild(form)

      const chatgptRule = DEFAULT_EMBEDDED_MANIFEST.platforms.find(
        (p) => p.id === "chatgpt"
      ) as PlatformRule

      const found = DiscoveryEngine.findInput(null, chatgptRule)
      expect(found).toBe(editor)
      expect(DiscoveryEngine.findContainer(found, chatgptRule)).toBe(form)
    })

    it("finds Claude input by div.ProseMirror", () => {
      const fieldset = document.createElement("fieldset")
      const editor = document.createElement("div")
      editor.className = "ProseMirror"
      editor.setAttribute("contenteditable", "true")
      fieldset.appendChild(editor)
      document.body.appendChild(fieldset)

      const claudeRule = DEFAULT_EMBEDDED_MANIFEST.platforms.find(
        (p) => p.id === "claude"
      ) as PlatformRule

      const found = DiscoveryEngine.findInput(null, claudeRule)
      expect(found).toBe(editor)
    })

    it("finds DeepSeek input by textarea#chat-input", () => {
      const container = document.createElement("div")
      container.className = "chat-input-wrapper"
      const textarea = document.createElement("textarea")
      textarea.id = "chat-input"
      container.appendChild(textarea)
      document.body.appendChild(container)

      const deepseekRule = DEFAULT_EMBEDDED_MANIFEST.platforms.find(
        (p) => p.id === "deepseek"
      ) as PlatformRule

      const found = DiscoveryEngine.findInput(null, deepseekRule)
      expect(found).toBe(textarea)
    })
  })

  describe("Tier 2: Autonomous Heuristic & a11y scoring", () => {
    it("finds chat input with completely changed/unknown classes", () => {
      // Simulating a redesigned page where classes changed
      const form = document.createElement("form")
      form.className = "some-random-composer-box"

      const sendBtn = document.createElement("button")
      sendBtn.type = "submit"
      sendBtn.setAttribute("aria-label", "Send prompt")
      form.appendChild(sendBtn)

      const unknownInput = document.createElement("div")
      unknownInput.className = "random-hash-class-9821"
      unknownInput.setAttribute("contenteditable", "true")
      unknownInput.setAttribute("role", "textbox")
      unknownInput.setAttribute("aria-multiline", "true")
      form.appendChild(unknownInput)

      document.body.appendChild(form)

      // Query without any matching rule selectors
      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(unknownInput)
    })
  })

  describe("Tier 3: Focusin capture", () => {
    it("captures dynamic element when user focuses it", () => {
      DiscoveryEngine.initFocusListener()

      const dynamicInput = document.createElement("textarea")
      dynamicInput.name = "dynamic_message"
      document.body.appendChild(dynamicInput)

      // Dispatch focusin
      dynamicInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))

      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(dynamicInput)
    })
  })

  describe("Safety & Exclusion", () => {
    it("returns null when clicking unrelated elements even if chat input is on the page", () => {
      const pageHeader = document.createElement("header")
      const title = document.createElement("h1")
      title.textContent = "ChatGPT or Gemini Page"
      pageHeader.appendChild(title)
      document.body.appendChild(pageHeader)

      const form = document.createElement("form")
      const editor = document.createElement("div")
      editor.id = "prompt-textarea"
      editor.setAttribute("contenteditable", "true")
      form.appendChild(editor)
      document.body.appendChild(form)

      const chatgptRule = DEFAULT_EMBEDDED_MANIFEST.platforms.find(
        (p) => p.id === "chatgpt"
      ) as PlatformRule

      // Clicks on title, header, or body MUST NOT return the editor!
      expect(DiscoveryEngine.findInput(title, chatgptRule)).toBeNull()
      expect(DiscoveryEngine.findInput(pageHeader, chatgptRule)).toBeNull()
      expect(DiscoveryEngine.findInput(document.body, chatgptRule)).toBeNull()

      // Click ON the editor or inside it returns the editor
      expect(DiscoveryEngine.findInput(editor, chatgptRule)).toBe(editor)
    })

    it("ignores elements inside TemplaGem root popover", () => {
      const overlayRoot = document.createElement("div")
      overlayRoot.id = TEMPLAGEM_ROOT_CONTAINER_ID
      const searchBox = document.createElement("input")
      searchBox.type = "text"
      overlayRoot.appendChild(searchBox)
      document.body.appendChild(overlayRoot)

      expect(isTemplaGemRoot(searchBox)).toBe(true)
      expect(DiscoveryEngine.findInput(searchBox, null)).toBeNull()
    })
  })
})
