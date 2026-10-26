import { describe, expect, it } from "vitest"

import {
  extractTemplateVariables,
  fillTemplate,
  hasTemplateVariables,
  parseTemplateSegments,
  stripTemplateBrackets
} from "../utils/template"

describe("template utility", () => {
  describe("hasTemplateVariables", () => {
    it("returns false for empty or non-template strings", () => {
      expect(hasTemplateVariables("")).toBe(false)
      expect(hasTemplateVariables("Just normal prompt text")).toBe(false)
      expect(hasTemplateVariables("Single {brace} is not template")).toBe(false)
    })

    it("returns true when {{...}} is present", () => {
      expect(hasTemplateVariables("Hello {{name}}!")).toBe(true)
      expect(hasTemplateVariables("Code in {{ language }}")).toBe(true)
      expect(hasTemplateVariables("{{first}} and {{second}}")).toBe(true)
    })
  })

  describe("extractTemplateVariables", () => {
    it("returns empty array for text with no variables", () => {
      expect(extractTemplateVariables("")).toEqual([])
      expect(extractTemplateVariables("no variables")).toEqual([])
    })

    it("extracts unique variables in order, trimming whitespace", () => {
      const text =
        "Write a {{ tone }} essay about {{ topic }} in {{ language }}. Keep it {{ tone }}."
      expect(extractTemplateVariables(text)).toEqual([
        "tone",
        "topic",
        "language"
      ])
    })
  })

  describe("parseTemplateSegments", () => {
    it("returns empty array for empty string", () => {
      expect(parseTemplateSegments("")).toEqual([])
    })

    it("parses text with leading, middle, and trailing segments", () => {
      const text = "Start {{a}} mid {{b}} end"
      const segments = parseTemplateSegments(text)

      expect(segments).toEqual([
        { type: "text", value: "Start ", raw: "Start ", index: 0 },
        {
          type: "variable",
          value: "a",
          raw: "{{a}}",
          index: 1,
          variableIndex: 0
        },
        { type: "text", value: " mid ", raw: " mid ", index: 2 },
        {
          type: "variable",
          value: "b",
          raw: "{{b}}",
          index: 3,
          variableIndex: 1
        },
        { type: "text", value: " end", raw: " end", index: 4 }
      ])
    })

    it("handles text that begins or ends directly with a variable", () => {
      const text = "{{var1}}{{var2}}"
      const segments = parseTemplateSegments(text)

      expect(segments).toEqual([
        {
          type: "variable",
          value: "var1",
          raw: "{{var1}}",
          index: 0,
          variableIndex: 0
        },
        {
          type: "variable",
          value: "var2",
          raw: "{{var2}}",
          index: 1,
          variableIndex: 1
        }
      ])
    })
  })

  describe("fillTemplate", () => {
    it("handles empty string", () => {
      expect(fillTemplate("", {})).toBe("")
    })

    it("substitutes provided values and falls back to variable name if not provided or empty string", () => {
      const template = "Refactor {{code}} to {{language}} using {{framework}}"
      const filled = fillTemplate(template, {
        code: "const x = 1",
        language: "TypeScript",
        framework: ""
      })

      expect(filled).toBe("Refactor const x = 1 to TypeScript using framework")
    })
  })

  describe("stripTemplateBrackets", () => {
    it("handles empty string", () => {
      expect(stripTemplateBrackets("")).toBe("")
    })

    it("removes brackets leaving inner content", () => {
      expect(
        stripTemplateBrackets("Write a {{humorous}} essay about {{cats}}")
      ).toBe("Write a humorous essay about cats")
      expect(stripTemplateBrackets("{{first}} and {{ second }}")).toBe(
        "first and second"
      )
      expect(stripTemplateBrackets("Plain prompt text")).toBe(
        "Plain prompt text"
      )
    })
  })
})
