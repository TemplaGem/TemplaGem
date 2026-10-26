import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildTemplateHtml,
  cleanTemplateBracketsInInput,
  computeGeminiPopoverPosition,
  detectGeminiPageTheme,
  findGeminiInput,
  findGeminiInputContainer,
  findTemplateVariablesInText,
  getContentEditableSelectionOffsets,
  getInputSelectionOffsets,
  getOrCreateGeminiRootContainer,
  handleGeminiSendTrigger,
  handleGeminiTemplateKeyDown,
  handleGeminiTemplatePaste,
  highlightActiveVariableElement,
  injectTemplateVariableStyles,
  insertTextIntoGeminiInput,
  isGeminiSendButton,
  isVariableModified,
  jumpToNextTemplateVariable,
  modifiedVariableIndices,
  POPOVER_ESTIMATED_HEIGHT_PX,
  POPOVER_OFFSET_PX,
  TEMPLAGEM_GEMINI_ROOT_ID,
  TEMPLAGEM_TEMPLATE_STYLE_ID,
  resetModifiedTemplateVariables,
  setCollapsedInputCursor,
  setContentEditableSelection,
  TemplateHighlighter
} from "../contents/gemini-dom"

describe("gemini-dom module", () => {
  beforeEach(() => {
    resetModifiedTemplateVariables()
  })
  describe("getOrCreateGeminiRootContainer", () => {
    it("creates container if missing and reuses existing one", () => {
      document.body.innerHTML = ""
      const created = getOrCreateGeminiRootContainer()
      expect(created.id).toBe(TEMPLAGEM_GEMINI_ROOT_ID)
      expect(document.getElementById(TEMPLAGEM_GEMINI_ROOT_ID)).toBe(created)

      const reused = getOrCreateGeminiRootContainer()
      expect(reused).toBe(created)
    })
  })

  describe("findGeminiInput", () => {
    it("returns null for non-elements or when target is inside excludeContainer", () => {
      expect(findGeminiInput(null)).toBeNull()

      const popover = document.createElement("div")
      const childBtn = document.createElement("button")
      popover.appendChild(childBtn)
      document.body.appendChild(popover)

      expect(findGeminiInput(childBtn, popover)).toBeNull()
    })

    it("matches .ql-editor and rich-textarea inputs", () => {
      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      editor.appendChild(p)
      document.body.appendChild(editor)

      expect(findGeminiInput(p)).toBe(editor)
    })

    it("matches textarea elements", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      expect(findGeminiInput(textarea)).toBe(textarea)
    })
  })

  describe("findGeminiInputContainer", () => {
    it("returns null if input element is null", () => {
      expect(findGeminiInputContainer(null)).toBeNull()
    })

    it("finds ancestor rich-textarea or input-area container", () => {
      const parent = document.createElement("div")
      vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
        width: 450,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 450,
        x: 0,
        y: 0,
        toJSON: () => {}
      })
      const rich = document.createElement("rich-textarea")
      parent.appendChild(rich)
      const input = document.createElement("div")
      input.setAttribute("contenteditable", "true")
      rich.appendChild(input)
      document.body.appendChild(parent)

      expect(findGeminiInputContainer(input)).toBe(parent)
    })

    it("falls back to rich-textarea when parent width is less than 320", () => {
      const parent = document.createElement("div")
      vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
        width: 250,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 250,
        x: 0,
        y: 0,
        toJSON: () => {}
      })
      const rich = document.createElement("rich-textarea")
      parent.appendChild(rich)
      const input = document.createElement("div")
      input.setAttribute("contenteditable", "true")
      rich.appendChild(input)
      document.body.appendChild(parent)

      expect(findGeminiInputContainer(input)).toBe(rich)
    })

    it("falls back to input element if no special container exists", () => {
      const standalone = document.createElement("textarea")
      document.body.appendChild(standalone)
      expect(findGeminiInputContainer(standalone)).toBe(standalone)
    })
  })

  describe("computeGeminiPopoverPosition", () => {
    it("places popover above input when there is sufficient room", () => {
      const pos = computeGeminiPopoverPosition({
        top: 600,
        bottom: 660,
        left: 200,
        right: 700,
        width: 500,
        height: 60,
        x: 200,
        y: 600,
        toJSON: () => ({})
      })

      expect(pos.top).toBe(
        600 - POPOVER_ESTIMATED_HEIGHT_PX - POPOVER_OFFSET_PX
      )
      expect(pos.left).toBe(200)
    })

    it("flips below input when near the top of the viewport", () => {
      const pos = computeGeminiPopoverPosition({
        top: 80,
        bottom: 140,
        left: 10,
        right: 400,
        width: 390,
        height: 60,
        x: 10,
        y: 80,
        toJSON: () => ({})
      })

      expect(pos.top).toBe(140 + POPOVER_OFFSET_PX)
      expect(pos.left).toBe(12)
    })

    it("computes docked position matching container width and flush bottom", () => {
      const inputRect = {
        top: 620,
        bottom: 660,
        left: 250,
        right: 650,
        width: 400,
        height: 40,
        x: 250,
        y: 620,
        toJSON: () => ({})
      }
      const containerRect = {
        top: 600,
        bottom: 680,
        left: 200,
        right: 850,
        width: 650,
        height: 80,
        x: 200,
        y: 600,
        toJSON: () => ({})
      }

      const pos = computeGeminiPopoverPosition(inputRect, containerRect)
      expect(pos.dockedAbove).toBe(true)
      expect(pos.width).toBe(650)
      expect(pos.left).toBe(200)
      expect(pos.bottom).toBeDefined()
    })
  })

  describe("insertTextIntoGeminiInput", () => {
    it("inserts into contenteditable with existing p tag and dispatches InputEvent", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      editor.appendChild(p)
      document.body.appendChild(editor)

      let dispatchedEvent: Event | null = null
      editor.addEventListener("input", (e) => {
        dispatchedEvent = e
      })

      insertTextIntoGeminiInput(editor, "Custom prompt text")

      expect(p.textContent).toBe("Custom prompt text")
      expect(dispatchedEvent).not.toBeNull()
      expect((dispatchedEvent as InputEvent).data).toBe("Custom prompt text")
    })

    it("inserts into contenteditable without child p tag", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      insertTextIntoGeminiInput(editor, "Direct prompt")
      expect(editor.textContent).toBe("Direct prompt")
    })

    it("inserts template text into contenteditable without child p tag", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      insertTextIntoGeminiInput(editor, "Direct {{template}}")
      expect(editor.querySelector(".ph-template-variable")).not.toBeNull()
    })

    it("inserts plain text into textarea without template variables", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      insertTextIntoGeminiInput(textarea, "Plain prompt")
      expect(textarea.value).toBe("Plain prompt")
    })

    it("inserts into textarea and dispatches input and change events", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      let inputFired = false
      let changeFired = false
      textarea.addEventListener("input", () => {
        inputFired = true
      })
      textarea.addEventListener("change", () => {
        changeFired = true
      })

      insertTextIntoGeminiInput(textarea, "Textarea prompt")

      expect(textarea.value).toBe("Textarea prompt")
      expect(inputFired).toBe(true)
      expect(changeFired).toBe(true)
    })

    it("handles rich-textarea parent and throwing quill.setText gracefully", () => {
      const richTextarea = document.createElement("rich-textarea")
      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      richTextarea.appendChild(editor)
      document.body.appendChild(richTextarea)
      ;(
        richTextarea as unknown as {
          quill?: { setText?: (t: string) => void }
        }
      ).quill = {
        setText: () => {
          throw new Error("Quill error")
        }
      }

      insertTextIntoGeminiInput(editor, "Plain prompt with throwing quill")
      expect(editor.textContent).toBe("Plain prompt with throwing quill")

      insertTextIntoGeminiInput(editor, "Hello {{user}} with rich-textarea")
      expect(editor.querySelector(".ph-template-variable")).not.toBeNull()
    })

    it("inserts template text into textarea and sets cursor", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
      insertTextIntoGeminiInput(textarea, "Hello {{friend}}!")
      expect(textarea.value).toBe("Hello {{friend}}!")
      expect(textarea.selectionEnd).toBe(14)
    })
  })

  describe("detectGeminiPageTheme", () => {
    it("detects dark mode from document body class, data-theme attribute, or prefers-color-scheme", () => {
      document.body.className = "dark-theme"
      expect(detectGeminiPageTheme()).toBe("dark")

      document.body.className = ""
      document.documentElement.classList.add("dark")
      expect(detectGeminiPageTheme()).toBe("dark")
      document.documentElement.classList.remove("dark")

      document.body.className = ""
      document.documentElement.setAttribute("data-theme", "dark")
      expect(detectGeminiPageTheme()).toBe("dark")

      document.documentElement.removeAttribute("data-theme")
      document.documentElement.className = "dark"
      expect(detectGeminiPageTheme()).toBe("dark")

      document.documentElement.className = ""
      expect(detectGeminiPageTheme()).toBe("light")

      // Media query prefers-color-scheme: dark
      const originalMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-color-scheme: dark"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })) as unknown as typeof window.matchMedia

      expect(detectGeminiPageTheme()).toBe("dark")
      window.matchMedia = originalMatchMedia
    })
  })

  describe("template variable DOM helpers", () => {
    it("findTemplateVariablesInText locates variables with exact character boundaries", () => {
      const text = "Write a {{tone}} essay about {{topic}}"
      const vars = findTemplateVariablesInText(text)

      expect(vars).toHaveLength(2)
      expect(vars[0]).toEqual({
        index: 0,
        name: "tone",
        raw: "{{tone}}",
        fullStart: 8,
        fullEnd: 16,
        innerStart: 10,
        innerEnd: 14
      })
      expect(vars[1]).toEqual({
        index: 1,
        name: "topic",
        raw: "{{topic}}",
        fullStart: 29,
        fullEnd: 38,
        innerStart: 31,
        innerEnd: 36
      })
    })

    it("buildTemplateHtml wraps variables in .ph-template-variable spans without inline styles", () => {
      const html = buildTemplateHtml("Hello {{name}}!")
      expect(html).toContain('class="ph-template-variable"')
      expect(html).toContain('data-ph-var="name"')
      expect(html).toContain("{{name}}</span>")
      expect(html).not.toContain("style=")
    })

    it("TemplateHighlighter applies and removes highlight classes and highlights active elements", () => {
      const inputEl = document.createElement("div")
      document.body.appendChild(inputEl)

      // Apply classes via class method and injectTemplateVariableStyles
      TemplateHighlighter.applyHighlightClasses(inputEl)
      expect(
        inputEl.classList.contains(TemplateHighlighter.CONTAINER_CLASS)
      ).toBe(true)
      expect(
        document.body.classList.contains(TemplateHighlighter.ROOT_CLASS)
      ).toBe(true)

      // Remove classes
      TemplateHighlighter.removeHighlightClasses(inputEl)
      expect(
        inputEl.classList.contains(TemplateHighlighter.CONTAINER_CLASS)
      ).toBe(false)

      // Test with null / undefined inputs
      TemplateHighlighter.applyHighlightClasses(null)
      TemplateHighlighter.removeHighlightClasses(null)

      // Test injectTemplateVariableStyles helper and constants
      expect(TEMPLAGEM_TEMPLATE_STYLE_ID).toBe(
        "templagem-template-variable-styles"
      )
      injectTemplateVariableStyles(inputEl)
      expect(
        inputEl.classList.contains(TemplateHighlighter.CONTAINER_CLASS)
      ).toBe(true)

      // Test highlightActive
      const container = document.createElement("div")
      container.innerHTML = `
        <span class="${TemplateHighlighter.VARIABLE_CLASS}">1</span>
        <span class="${TemplateHighlighter.VARIABLE_CLASS}">2</span>
      `
      TemplateHighlighter.highlightActive(container, 1)
      const spans = container.querySelectorAll(
        `.${TemplateHighlighter.VARIABLE_CLASS}`
      )
      expect(
        spans[0].classList.contains(TemplateHighlighter.ACTIVE_CLASS)
      ).toBe(false)
      expect(
        spans[1].classList.contains(TemplateHighlighter.ACTIVE_CLASS)
      ).toBe(true)

      // Test escapeHtml and special characters in buildTemplateHtml
      expect(TemplateHighlighter.escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;")
      const escapedHtml = TemplateHighlighter.buildTemplateHtml(
        "<b>{{foo & <bar>}}</b>"
      )
      expect(escapedHtml).toContain("&amp;")
      expect(escapedHtml).toContain("&lt;")
      expect(escapedHtml).toContain("&gt;")

      // Test buildTemplateHtml with no variables and variables at end
      expect(TemplateHighlighter.buildTemplateHtml("Plain text")).toBe(
        "Plain text"
      )
      expect(TemplateHighlighter.buildTemplateHtml("End {{last}}")).toContain(
        "{{last}}</span>"
      )
    })

    it("jumpToNextTemplateVariable cycles through variables forward and backward in textarea with collapsed cursor", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
      textarea.value = "Start {{a}} mid {{b}} end {{c}}"

      // Jump forward from nothing positions caret at innerEnd of first variable "a" (no range selection)
      const jumped1 = jumpToNextTemplateVariable(textarea, false)
      expect(jumped1).toBe(true)
      expect(textarea.selectionStart).toBe(9)
      expect(textarea.selectionEnd).toBe(9) // collapsed!

      // Jump forward positions caret at second variable "b"
      jumpToNextTemplateVariable(textarea, false)
      expect(textarea.selectionStart).toBe(19)
      expect(textarea.selectionEnd).toBe(19) // collapsed!

      // Jump forward positions caret at third variable "c"
      jumpToNextTemplateVariable(textarea, false)
      expect(textarea.selectionStart).toBe(29)
      expect(textarea.selectionEnd).toBe(29) // collapsed!

      // Jump backward positions caret at innerStart of second variable "b"
      jumpToNextTemplateVariable(textarea, true)
      expect(textarea.selectionStart).toBe(18)
      expect(textarea.selectionEnd).toBe(18) // collapsed!

      // Jump backward positions caret at innerStart of first variable "a"
      jumpToNextTemplateVariable(textarea, true)
      expect(textarea.selectionStart).toBe(8)
      expect(textarea.selectionEnd).toBe(8) // collapsed!
    })

    it("handleGeminiTemplateKeyDown handles ArrowRight, ArrowLeft, Tab, Shift+Tab navigation", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Code in {{language}} using {{framework}}"
      document.body.appendChild(textarea)

      // Initial position at end of "language" (innerEnd: 18)
      textarea.setSelectionRange(18, 18)

      const arrowRightEvt = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(arrowRightEvt, "target", { value: textarea })

      const handled = handleGeminiTemplateKeyDown(arrowRightEvt)
      expect(handled).toBe(true)
      expect(arrowRightEvt.defaultPrevented).toBe(true)
      // Jumps forward to "framework" (innerEnd: 38, collapsed)
      expect(textarea.selectionStart).toBe(38)
      expect(textarea.selectionEnd).toBe(38)

      // Position at start of "framework" (innerStart: 29) to navigate backward
      textarea.setSelectionRange(29, 29)

      const arrowLeftEvt = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(arrowLeftEvt, "target", { value: textarea })

      const handledLeft = handleGeminiTemplateKeyDown(arrowLeftEvt)
      expect(handledLeft).toBe(true)
      expect(arrowLeftEvt.defaultPrevented).toBe(true)
      // Jumps backward to "language" (innerStart: 10, collapsed)
      expect(textarea.selectionStart).toBe(10)
      expect(textarea.selectionEnd).toBe(10)
    })

    it("cleanTemplateBracketsInInput strips brackets and dispatches input event", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Write a {{humorous}} essay about {{cats}}"
      document.body.appendChild(textarea)

      let inputDispatched = false
      textarea.addEventListener("input", () => {
        inputDispatched = true
      })

      const cleaned = cleanTemplateBracketsInInput(textarea)
      expect(cleaned).toBe(true)
      expect(textarea.value).toBe("Write a humorous essay about cats")
      expect(inputDispatched).toBe(true)

      // Contenteditable
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      p.innerHTML =
        '<span class="ph-template-variable">{{tone}}</span> and {{topic}}'
      editor.appendChild(p)
      document.body.appendChild(editor)

      const cleanedEd = cleanTemplateBracketsInInput(editor)
      expect(cleanedEd).toBe(true)
      expect(p.textContent).toBe("tone and topic")
    })

    it("handleGeminiTemplateKeyDown strips brackets on plain Enter without preventing default", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Explain {{topic}} in simple terms"
      document.body.appendChild(textarea)

      const enterEvt = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(enterEvt, "target", { value: textarea })

      const handled = handleGeminiTemplateKeyDown(enterEvt)
      // Returns false so Gemini native enter handling proceeds with sending
      expect(handled).toBe(false)
      expect(enterEvt.defaultPrevented).toBe(false)
      // But brackets are stripped!
      expect(textarea.value).toBe("Explain topic in simple terms")
    })

    it("isGeminiSendButton recognizes send buttons and handleGeminiSendTrigger cleans brackets", () => {
      document.body.innerHTML = ""
      const sendBtn = document.createElement("button")
      sendBtn.setAttribute("aria-label", "Send message")
      document.body.appendChild(sendBtn)

      expect(isGeminiSendButton(sendBtn)).toBe(true)

      const textarea = document.createElement("textarea")
      textarea.value = "Translate {{text}}"
      document.body.appendChild(textarea)

      const clickEvt = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(clickEvt, "target", { value: sendBtn })

      const handled = handleGeminiSendTrigger(clickEvt, textarea)
      expect(handled).toBe(true)
      expect(textarea.value).toBe("Translate text")
    })

    it("erases placeholder name as soon as user types inside an unmodified variable in textarea", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Code in {{language}} for {{task}}"
      document.body.appendChild(textarea)

      // Cursor inside {{language}}
      textarea.setSelectionRange(15, 15)

      // User types 'P'
      const keyEvt = new KeyboardEvent("keydown", {
        key: "P",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(keyEvt, "target", { value: textarea })

      const handled = handleGeminiTemplateKeyDown(keyEvt)
      expect(handled).toBe(true)
      expect(keyEvt.defaultPrevented).toBe(true)
      // "language" was erased and replaced with "P"
      expect(textarea.value).toBe("Code in {{P}} for {{task}}")
      expect(textarea.selectionStart).toBe(11) // right after 'P'
      expect(textarea.selectionEnd).toBe(11)

      // Second keystroke 'y' is not intercepted as it's already modified
      const keyEvt2 = new KeyboardEvent("keydown", {
        key: "y",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(keyEvt2, "target", { value: textarea })
      const handled2 = handleGeminiTemplateKeyDown(keyEvt2)
      expect(handled2).toBe(false)
    })

    it("erases placeholder name on Backspace inside an unmodified variable", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Format: {{data}}"
      document.body.appendChild(textarea)

      // Cursor inside {{data}}
      textarea.setSelectionRange(12, 12)

      const backspaceEvt = new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(backspaceEvt, "target", { value: textarea })

      const handled = handleGeminiTemplateKeyDown(backspaceEvt)
      expect(handled).toBe(true)
      expect(backspaceEvt.defaultPrevented).toBe(true)
      // "data" was erased to empty brackets
      expect(textarea.value).toBe("Format: {{}}")
      expect(textarea.selectionStart).toBe(10) // inside {{}}
      expect(textarea.selectionEnd).toBe(10)
    })

    it("erases placeholder name inside contenteditable span on first keystroke", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      editor.className = "ql-editor"
      const p = document.createElement("p")
      p.innerHTML =
        'Prefix <span class="ph-template-variable" data-ph-var="city" data-ph-original="city">{{city}}</span> Suffix'
      editor.appendChild(p)
      document.body.appendChild(editor)

      const span = p.querySelector<HTMLElement>(".ph-template-variable")!
      const textNode = span.firstChild!

      const range = document.createRange()
      range.setStart(textNode, 4) // inside "city"
      range.setEnd(textNode, 4)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const keyEvt = new KeyboardEvent("keydown", {
        key: "L",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(keyEvt, "target", { value: editor })

      const handled = handleGeminiTemplateKeyDown(keyEvt)
      expect(handled).toBe(true)
      expect(keyEvt.defaultPrevented).toBe(true)
      expect(span.textContent).toBe("{{L}}")
      expect(span.getAttribute("data-ph-modified")).toBe("true")
    })

    it("handles contenteditable selection offsets and setting ranges", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      p.textContent = "Hello world from test"
      editor.appendChild(p)
      document.body.appendChild(editor)

      // Null when selection is not in element
      expect(getContentEditableSelectionOffsets(editor)).toBeNull()

      // Set selection
      const success = setContentEditableSelection(editor, 6, 11)
      expect(success).toBe(true)

      const offsets = getContentEditableSelectionOffsets(editor)
      expect(offsets).toEqual({ start: 6, end: 11 })

      // setCollapsedInputCursor on contenteditable
      setCollapsedInputCursor(editor, 11)
      const collapsedOffsets = getInputSelectionOffsets(editor)
      expect(collapsedOffsets).toEqual({ start: 11, end: 11 })
    })

    it("cycles jumpToNextTemplateVariable inside contenteditable element", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      editor.innerHTML =
        '<p>Review <span class="ph-template-variable">{{lang}}</span> with <span class="ph-template-variable">{{level}}</span></p>'
      document.body.appendChild(editor)

      // Forward jump
      const jumped1 = jumpToNextTemplateVariable(editor, false)
      expect(jumped1).toBe(true)

      // Backward jump
      const jumped2 = jumpToNextTemplateVariable(editor, true)
      expect(jumped2).toBe(true)

      // Returns false when no variables
      const plain = document.createElement("div")
      plain.textContent = "No vars"
      document.body.appendChild(plain)
      expect(jumpToNextTemplateVariable(plain)).toBe(false)
    })

    it("handles highlightActiveVariableElement and isVariableModified", () => {
      const container = document.createElement("div")
      container.innerHTML =
        '<span class="ph-template-variable">v1</span><span class="ph-template-variable">v2</span>'
      document.body.appendChild(container)

      highlightActiveVariableElement(container, 1)
      const spans = container.querySelectorAll(".ph-template-variable")
      expect(spans[0].classList.contains("ph-template-variable-active")).toBe(
        false
      )
      expect(spans[1].classList.contains("ph-template-variable-active")).toBe(
        true
      )

      const vLoc = {
        index: 0,
        name: "test",
        raw: "{{test}}",
        fullStart: 0,
        fullEnd: 8,
        innerStart: 2,
        innerEnd: 6
      }
      expect(isVariableModified(container, vLoc)).toBe(false)
      spans[0].setAttribute("data-ph-modified", "true")
      expect(isVariableModified(container, vLoc)).toBe(true)
    })

    it("handles handleGeminiTemplatePaste in contenteditable and textarea", () => {
      // 1. ContentEditable span paste
      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      const span = document.createElement("span")
      span.className = "ph-template-variable"
      span.textContent = "{{city}}"
      editor.appendChild(span)
      document.body.appendChild(editor)

      const range = document.createRange()
      range.selectNodeContents(span)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const pasteEvent = new Event("paste", {
        bubbles: true,
        cancelable: true
      }) as ClipboardEvent
      Object.defineProperty(pasteEvent, "target", { value: editor })
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: { getData: () => "Kyiv" }
      })

      const handled = handleGeminiTemplatePaste(pasteEvent)
      expect(handled).toBe(true)
      expect(span.textContent).toBe("{{Kyiv}}")
      expect(span.getAttribute("data-ph-modified")).toBe("true")

      // 2. Textarea paste
      const textarea = document.createElement("textarea")
      textarea.value = "Hello {{target}}!"
      textarea.setSelectionRange(8, 14) // inside target
      document.body.appendChild(textarea)

      const pasteEventTx = new Event("paste", {
        bubbles: true,
        cancelable: true
      }) as ClipboardEvent
      Object.defineProperty(pasteEventTx, "target", { value: textarea })
      Object.defineProperty(pasteEventTx, "clipboardData", {
        value: { getData: () => "World" }
      })

      const handledTx = handleGeminiTemplatePaste(pasteEventTx)
      expect(handledTx).toBe(true)
      expect(textarea.value).toBe("Hello {{World}}!")
    })

    it("handles isGeminiSendButton keywords and excludes mic/attachment buttons", () => {
      const sendBtn = document.createElement("button")
      sendBtn.setAttribute("aria-label", "Отправить сообщение")
      document.body.appendChild(sendBtn)
      expect(isGeminiSendButton(sendBtn)).toBe(true)

      const micBtn = document.createElement("button")
      micBtn.setAttribute("aria-label", "Голосовой ввод (микрофон)")
      document.body.appendChild(micBtn)
      expect(isGeminiSendButton(micBtn)).toBe(false)

      const attachBtn = document.createElement("button")
      attachBtn.setAttribute("aria-label", "Прикрепить файл")
      document.body.appendChild(attachBtn)
      expect(isGeminiSendButton(attachBtn)).toBe(false)

      expect(isGeminiSendButton(null)).toBe(false)
    })

    it("handles cleanTemplateBracketsInInput with Quill instance and when no brackets exist", () => {
      const plainDiv = document.createElement("div")
      plainDiv.textContent = "Plain text without variables"
      document.body.appendChild(plainDiv)
      expect(cleanTemplateBracketsInInput(plainDiv)).toBe(false)

      const quillEditor = document.createElement("div")
      quillEditor.textContent = "Text with {{val}}"
      const setTextMock = vi.fn()
      ;(
        quillEditor as unknown as { __quill: { setText: (t: string) => void } }
      ).__quill = {
        setText: setTextMock
      }
      document.body.appendChild(quillEditor)

      const cleaned = cleanTemplateBracketsInInput(quillEditor)
      expect(cleaned).toBe(true)
      expect(setTextMock).toHaveBeenCalledWith("Text with val")
    })

    it("jumps when ArrowRight is pressed with Alt or Ctrl key", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Prefix {{var}} suffix"
      textarea.setSelectionRange(0, 0)
      document.body.appendChild(textarea)

      const altEvt = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        altKey: true,
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(altEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(altEvt)).toBe(true)
    })

    it("handles arrow navigation when variable is already modified", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Prefix {{val}} suffix"
      document.body.appendChild(textarea)

      const currentVar = findTemplateVariablesInText(textarea.value)[0]
      modifiedVariableIndices.add(currentVar.index)

      // At end of modified variable
      textarea.setSelectionRange(currentVar.innerEnd, currentVar.innerEnd)
      const rightEvt = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(rightEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(rightEvt)).toBe(true)

      // At start of modified variable
      textarea.setSelectionRange(currentVar.innerStart, currentVar.innerStart)
      const leftEvt = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(leftEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(leftEvt)).toBe(true)

      // In middle of modified variable -> returns false
      textarea.setSelectionRange(
        currentVar.innerStart + 1,
        currentVar.innerStart + 1
      )
      const midRightEvt = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(midRightEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(midRightEvt)).toBe(false)

      const midLeftEvt = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(midLeftEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(midLeftEvt)).toBe(false)

      // Outside variable -> returns false
      textarea.setSelectionRange(0, 0)
      const outsideEvt = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(outsideEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(outsideEvt)).toBe(false)
    })

    it("returns false if target is not editable or input element is missing", () => {
      const div = document.createElement("div")
      const evt = new KeyboardEvent("keydown", { key: "ArrowRight" })
      Object.defineProperty(evt, "target", { value: div })
      expect(handleGeminiTemplateKeyDown(evt)).toBe(false)
    })

    it("recognizes send button with mattooltip or svg icon", () => {
      const btn = document.createElement("button")
      btn.setAttribute("mattooltip", "Send prompt")
      const container = document.createElement("div")
      container.className = "input-area"
      container.appendChild(btn)
      document.body.appendChild(container)
      expect(isGeminiSendButton(btn)).toBe(true)
    })

    it("handles Tab and Shift+Tab jumping between template variables", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Test {{first}} middle {{second}} end"
      document.body.appendChild(textarea)

      const tabEvt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(tabEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(tabEvt)).toBe(true)

      const shiftTabEvt = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(shiftTabEvt, "target", { value: textarea })
      expect(handleGeminiTemplateKeyDown(shiftTabEvt)).toBe(true)
    })

    it("handles isGeminiSendButton edge cases including TemplaGem containment and arrow icons", () => {
      expect(isGeminiSendButton(null)).toBe(false)
      const nonBtn = document.createElement("div")
      expect(isGeminiSendButton(nonBtn)).toBe(false)

      // Button inside TemplaGem overlay
      const root = document.createElement("div")
      root.id = TEMPLAGEM_GEMINI_ROOT_ID
      const hubBtn = document.createElement("button")
      hubBtn.setAttribute("aria-label", "Send prompt")
      root.appendChild(hubBtn)
      document.body.appendChild(root)
      expect(isGeminiSendButton(hubBtn)).toBe(false)

      // Button with arrow_upward inside input-area
      const area = document.createElement("div")
      area.className = "input-area"
      const arrowBtn = document.createElement("button")
      arrowBtn.innerHTML = "<span>arrow_upward</span>"
      area.appendChild(arrowBtn)
      document.body.appendChild(area)
      expect(isGeminiSendButton(arrowBtn)).toBe(true)

      // Button with className send-chat-button
      const classBtn = document.createElement("button")
      classBtn.className = "send-chat-button"
      document.body.appendChild(classBtn)
      expect(isGeminiSendButton(classBtn)).toBe(true)
    })

    it("handles contenteditable insertion without p child elements", () => {
      const div = document.createElement("div")
      div.contentEditable = "true"
      document.body.appendChild(div)

      insertTextIntoGeminiInput(div, "Write {{poem}} for me")
      expect(div.innerHTML).toContain("ph-template-variable")

      insertTextIntoGeminiInput(div, "Simple text without variables")
      expect(div.textContent).toBe("Simple text without variables")

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
      insertTextIntoGeminiInput(textarea, "Plain textarea message")
      expect(textarea.value).toBe("Plain textarea message")
    })

    it("returns false for inputs without template variables in cleanTemplateBracketsInInput", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "No brackets here"
      document.body.appendChild(textarea)
      expect(cleanTemplateBracketsInInput(textarea)).toBe(false)
    })

    it("cleans template brackets in textarea and contenteditable with cleanTemplateBracketsInInput", () => {
      const textarea = document.createElement("textarea")
      textarea.value = "Hello {{name}}, welcome to {{place}}!"
      document.body.appendChild(textarea)
      const res = cleanTemplateBracketsInInput(textarea)
      expect(res).toBe(true)
      expect(textarea.value).toBe("Hello name, welcome to place!")

      const div = document.createElement("div")
      div.contentEditable = "true"
      div.innerHTML = "<p>Hello {{role}}!</p>"
      document.body.appendChild(div)
      const resDiv = cleanTemplateBracketsInInput(div)
      expect(resDiv).toBe(true)
      expect(div.textContent).toContain("Hello role!")
    })
  })
})
