import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DiscoveryEngine,
  isElementVisible,
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

      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(unknownInput)
    })

    it("filters out password, hidden, search, and non-editable inputs", () => {
      const form = document.createElement("form")

      const password = document.createElement("input")
      password.type = "password"
      form.appendChild(password)

      const hidden = document.createElement("input")
      hidden.type = "hidden"
      form.appendChild(hidden)

      const search = document.createElement("input")
      search.type = "search"
      form.appendChild(search)

      const validTextarea = document.createElement("textarea")
      validTextarea.placeholder = "Ask me anything..."
      form.appendChild(validTextarea)

      document.body.appendChild(form)

      expect(DiscoveryEngine.findInput(null, null)).toBe(validTextarea)
    })

    it("scores rich-textarea elements in autonomous candidate scoring", () => {
      const richText = document.createElement("rich-textarea")
      const inner = document.createElement("div")
      inner.setAttribute("contenteditable", "true")
      inner.setAttribute("role", "textbox")
      richText.appendChild(inner)
      document.body.appendChild(richText)

      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(inner)
    })
  })

  describe("Tier 3: Focusin capture", () => {
    it("captures dynamic element when user focuses it", () => {
      DiscoveryEngine.initFocusListener()

      const dynamicInput = document.createElement("textarea")
      dynamicInput.name = "dynamic_message"
      document.body.appendChild(dynamicInput)

      dynamicInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))

      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(dynamicInput)
    })
  })

  describe("Safety, Visibility & Exclusion", () => {
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

      expect(DiscoveryEngine.findInput(title, chatgptRule)).toBeNull()
      expect(DiscoveryEngine.findInput(pageHeader, chatgptRule)).toBeNull()
      expect(DiscoveryEngine.findInput(document.body, chatgptRule)).toBeNull()
      expect(DiscoveryEngine.findInput(editor, chatgptRule)).toBe(editor)
    })

    it("ignores elements inside TemplaGem root popover", () => {
      const overlayRoot = document.createElement("div")
      overlayRoot.id = TEMPLAGEM_ROOT_CONTAINER_ID
      const searchBox = document.createElement("input")
      searchBox.type = "text"
      overlayRoot.appendChild(searchBox)
      document.body.appendChild(overlayRoot)

      const overlayClassEl = document.createElement("div")
      overlayClassEl.className = "templagem-overlay"
      document.body.appendChild(overlayClassEl)

      expect(isTemplaGemRoot(searchBox)).toBe(true)
      expect(isTemplaGemRoot(overlayClassEl)).toBe(true)
      expect(isTemplaGemRoot(document.body)).toBe(false)
      expect(isTemplaGemRoot(null)).toBe(false)
      expect(DiscoveryEngine.findInput(searchBox, null)).toBeNull()
    })

    it("detects hidden and invisible elements correctly via isElementVisible", () => {
      const visibleEl = document.createElement("div")
      document.body.appendChild(visibleEl)
      expect(isElementVisible(visibleEl)).toBe(true)

      // Not connected
      const detachedEl = document.createElement("div")
      expect(isElementVisible(detachedEl)).toBe(false)

      // Display none
      const hiddenEl = document.createElement("div")
      hiddenEl.style.display = "none"
      document.body.appendChild(hiddenEl)
      expect(isElementVisible(hiddenEl)).toBe(false)

      // Visibility hidden
      const invisibleEl = document.createElement("div")
      invisibleEl.style.visibility = "hidden"
      document.body.appendChild(invisibleEl)
      expect(isElementVisible(invisibleEl)).toBe(false)

      // Opacity 0
      const transparentEl = document.createElement("div")
      transparentEl.style.opacity = "0"
      document.body.appendChild(transparentEl)
      expect(isElementVisible(transparentEl)).toBe(false)
    })

    it("finds submit button near input or returns null when absent", () => {
      const form = document.createElement("form")
      const input = document.createElement("textarea")
      form.appendChild(input)

      const btn = document.createElement("button")
      btn.type = "submit"
      btn.setAttribute("aria-label", "Send")
      form.appendChild(btn)
      document.body.appendChild(form)

      expect(DiscoveryEngine.findSubmitButton(input)).toBe(btn)

      document.body.innerHTML = ""
      const standalone = document.createElement("input")
      document.body.appendChild(standalone)
      expect(DiscoveryEngine.findSubmitButton(standalone)).toBeNull()
      expect(DiscoveryEngine.findSubmitButton(null)).toBeNull()
    })

    it("finds container with fallback heuristics when rule has no container selectors", () => {
      const wrapper = document.createElement("div")
      wrapper.className = "chat-input"
      const input = document.createElement("textarea")
      wrapper.appendChild(input)
      document.body.appendChild(wrapper)

      expect(DiscoveryEngine.findContainer(input, null)).toBe(wrapper)
      expect(DiscoveryEngine.findContainer(null, null)).toBeNull()
    })

    it("resolves target when target is container or child of editable", () => {
      const container = document.createElement("div")
      container.className = "chat-input-container"
      const textarea = document.createElement("textarea")
      container.appendChild(textarea)
      document.body.appendChild(container)

      // Target is container itself
      expect(DiscoveryEngine.findInput(container, null)).toBe(textarea)

      // Target is a child span inside contenteditable
      const editable = document.createElement("div")
      editable.setAttribute("contenteditable", "true")
      const span = document.createElement("span")
      span.textContent = "placeholder"
      editable.appendChild(span)
      document.body.appendChild(editable)

      expect(DiscoveryEngine.findInput(span, null)).toBe(editable)
    })

    it("scores candidates based on geometric position and dimensions", () => {
      const elNearBottom = document.createElement("div")
      elNearBottom.setAttribute("contenteditable", "true")
      elNearBottom.setAttribute("role", "textbox")
      document.body.appendChild(elNearBottom)

      const originalInnerHeight = window.innerHeight
      Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true, writable: true })

      elNearBottom.getBoundingClientRect = () => ({
        top: 700,
        bottom: 800,
        left: 50,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 700,
        toJSON: () => {}
      })

      const found = DiscoveryEngine.findInput(null, null)
      expect(found).toBe(elNearBottom)

      // Test element outside viewport bottom threshold (distFromBottomRatio < -0.1)
      const elTooLow = document.createElement("div")
      elTooLow.setAttribute("contenteditable", "true")
      document.body.appendChild(elTooLow)
      elTooLow.getBoundingClientRect = () => ({
        top: 1100,
        bottom: 1200,
        left: 50,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 1100,
        toJSON: () => {}
      })

      Object.defineProperty(window, "innerHeight", { value: originalInnerHeight, configurable: true, writable: true })
    })
  })
})
