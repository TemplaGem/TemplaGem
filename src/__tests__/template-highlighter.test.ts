import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TemplateHighlighter } from "../contents/TemplateHighlighter"

describe("TemplateHighlighter", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("HTML wrapping & variable parsing", () => {
    it("parses variable locations accurately via findVariablesInText", () => {
      const text = "Hello {{name}}, welcome to {{city}}!"
      const locations = TemplateHighlighter.findVariablesInText(text)

      expect(locations).toHaveLength(2)
      expect(locations[0].name).toBe("name")
      expect(locations[0].fullStart).toBe(6)
      expect(locations[0].fullEnd).toBe(14)
      expect(locations[1].name).toBe("city")
    })

    it("wraps variables in HTML via buildTemplateHtml and appends nodes", () => {
      const text = "Write {{adjective}} story for {{audience}}"
      const wrapped = TemplateHighlighter.buildTemplateHtml(text)

      expect(wrapped).toContain('class="ph-template-variable"')
      expect(wrapped).toContain('data-ph-var="adjective"')
      expect(wrapped).toContain('data-ph-var="audience"')

      const target = document.createElement("div")
      TemplateHighlighter.appendTemplateNodes(target, text)
      expect(target.querySelectorAll(".ph-template-variable")).toHaveLength(2)
    })

    it("applies and removes highlight classes to element and document body", () => {
      const el = document.createElement("div")
      document.body.appendChild(el)

      TemplateHighlighter.applyHighlightClasses(el)
      expect(el.classList.contains(TemplateHighlighter.CONTAINER_CLASS)).toBe(true)
      expect(document.body.classList.contains(TemplateHighlighter.ROOT_CLASS)).toBe(true)

      // Repeated call reuses style tag
      TemplateHighlighter.applyHighlightClasses(el)
      const styles = document.querySelectorAll(
        `#${TemplateHighlighter.STYLE_ELEMENT_ID}`
      )
      expect(styles.length).toBe(1)

      // Remove classes
      TemplateHighlighter.removeHighlightClasses(el)
      expect(el.classList.contains(TemplateHighlighter.CONTAINER_CLASS)).toBe(false)
    })

    it("escapes HTML safely", () => {
      const escaped = TemplateHighlighter.escapeHtml(`<script>alert("xss")</script>`)
      expect(escaped).not.toContain("<script>")
      expect(escaped).toContain("&lt;script&gt;")
    })
  })

  describe("CSS Custom Highlight API", () => {
    it("gracefully returns false when CSS.highlights is unsupported", () => {
      const container = document.createElement("div")
      container.textContent = "Hello {{user}}"
      document.body.appendChild(container)

      const supported = TemplateHighlighter.applyCustomHighlights(
        container,
        [{
          index: 0,
          name: "user",
          raw: "{{user}}",
          fullStart: 6,
          fullEnd: 14,
          innerStart: 8,
          innerEnd: 12
        }],
        0
      )
      expect(supported).toBe(false)

      expect(() => {
        TemplateHighlighter.clearCustomHighlights()
      }).not.toThrow()
    })

    it("registers active and normal ranges in CSS.highlights when API is available", () => {
      const highlightsMap = new Map<string, unknown>()
      class MockHighlight {
        ranges: Range[]
        constructor(...ranges: Range[]) {
          this.ranges = ranges
        }
      }

      // Mock CSS.highlights and window.Highlight
      const cssMock = {
        ...CSS,
        highlights: {
          set: (name: string, highlight: unknown) => highlightsMap.set(name, highlight),
          delete: (name: string) => highlightsMap.delete(name)
        }
      }
      vi.stubGlobal("CSS", cssMock)
      vi.stubGlobal("Highlight", MockHighlight)

      const container = document.createElement("div")
      const textNode1 = document.createTextNode("Start ")
      const textNode2 = document.createTextNode("{{name}} middle ")
      const textNode3 = document.createTextNode("{{action}} end.")
      container.appendChild(textNode1)
      container.appendChild(textNode2)
      container.appendChild(textNode3)
      document.body.appendChild(container)

      const text = container.textContent || ""
      const vars = TemplateHighlighter.findVariablesInText(text)

      // Apply with first variable active
      const result = TemplateHighlighter.applyCustomHighlights(
        container,
        vars,
        0
      )
      expect(result).toBe(true)
      expect(highlightsMap.has("templagem-variable-active")).toBe(true)
      expect(highlightsMap.has("templagem-variable")).toBe(true)

      // Clear highlights
      TemplateHighlighter.clearCustomHighlights()
      expect(highlightsMap.size).toBe(0)
    })

    it("handles empty variables or out-of-range offsets cleanly", () => {
      const highlightsMap = new Map<string, unknown>()
      class MockHighlight {
        ranges: Range[]
        constructor(...ranges: Range[]) {
          this.ranges = ranges
        }
      }
      vi.stubGlobal("CSS", {
        ...CSS,
        highlights: {
          set: (name: string, highlight: unknown) => highlightsMap.set(name, highlight),
          delete: (name: string) => highlightsMap.delete(name)
        }
      })
      vi.stubGlobal("Highlight", MockHighlight)

      const container = document.createElement("div")
      container.textContent = "Short"
      document.body.appendChild(container)

      const invalidVar = [{
        index: 0,
        name: "none",
        raw: "{{none}}",
        fullStart: 100,
        fullEnd: 200,
        innerStart: 102,
        innerEnd: 198
      }]

      const result = TemplateHighlighter.applyCustomHighlights(
        container,
        invalidVar,
        0
      )
      expect(result).toBe(true)
      expect(highlightsMap.has("templagem-variable-active")).toBe(false)
    })
  })
})
