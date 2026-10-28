export interface TemplateVariableLocation {
  index: number
  name: string
  raw: string
  fullStart: number
  fullEnd: number
  innerStart: number
  innerEnd: number
}

/**
 * Class managing template variable parsing, HTML generation, and active element highlighting.
 * Replaces dynamic <style> injection with clean CSS classes and DOM class application.
 */
export class TemplateHighlighter {
  public static readonly VARIABLE_CLASS = "ph-template-variable"
  public static readonly ACTIVE_CLASS = "ph-template-variable-active"
  public static readonly CONTAINER_CLASS = "ph-template-container"
  public static readonly ROOT_CLASS = "ph-templates-enabled"

  public static readonly STYLE_ELEMENT_ID = "templagem-template-variable-styles"

  /**
   * Applies highlight container and root classes and injects global styles into document.head
   * so that light DOM elements (like Gemini Quill editor) receive template variable styling.
   */
  public static applyHighlightClasses(
    element?: HTMLElement | HTMLTextAreaElement | null
  ): void {
    if (element && "classList" in element) {
      element.classList.add(TemplateHighlighter.CONTAINER_CLASS)
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.add(TemplateHighlighter.ROOT_CLASS)

      if (!document.getElementById(TemplateHighlighter.STYLE_ELEMENT_ID)) {
        const style = document.createElement("style")
        style.id = TemplateHighlighter.STYLE_ELEMENT_ID
        style.textContent = `
          .ph-template-container {
            position: relative;
          }
          .ph-template-variable {
            color: var(--accent-color, #2563eb) !important;
            background-color: var(--accent-soft, rgba(37, 99, 235, 0.12)) !important;
            border: 1px solid var(--accent-border, rgba(37, 99, 235, 0.25)) !important;
            border-radius: 4px !important;
            padding: 0 4px !important;
            font-weight: 600 !important;
            display: inline !important;
            transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
          }
          .ph-template-variable-active {
            color: var(--accent-color, #1d4ed8) !important;
            background-color: var(--accent-soft, rgba(37, 99, 235, 0.26)) !important;
            border-color: var(--accent-color, #2563eb) !important;
            box-shadow: 0 0 0 2px var(--accent-border, rgba(37, 99, 235, 0.38)) !important;
          }
          [data-theme="dark"] .ph-template-variable,
          body.dark-theme .ph-template-variable,
          html[data-theme="dark"] .ph-template-variable,
          html.dark .ph-template-variable {
            color: var(--accent-color, #60a5fa) !important;
            background-color: var(--accent-soft, rgba(59, 130, 246, 0.2)) !important;
            border-color: var(--accent-border, rgba(59, 130, 246, 0.35)) !important;
          }
          [data-theme="dark"] .ph-template-variable-active,
          body.dark-theme .ph-template-variable-active,
          html[data-theme="dark"] .ph-template-variable-active,
          html.dark .ph-template-variable-active {
            color: var(--accent-color, #93c5fd) !important;
            background-color: var(--accent-soft, rgba(59, 130, 246, 0.36)) !important;
            border-color: var(--accent-color, #60a5fa) !important;
            box-shadow: 0 0 0 2px var(--accent-border, rgba(59, 130, 246, 0.48)) !important;
          }

          /* CSS Custom Highlight API support (non-destructive highlights) */
          ::highlight(templagem-variable) {
            background-color: var(--accent-soft, rgba(37, 99, 235, 0.2)) !important;
            color: var(--accent-color, #2563eb) !important;
          }
          ::highlight(templagem-variable-active) {
            background-color: var(--accent-border, rgba(37, 99, 235, 0.45)) !important;
            color: var(--accent-color, #1d4ed8) !important;
          }
          [data-theme="dark"]::highlight(templagem-variable),
          html[data-theme="dark"]::highlight(templagem-variable),
          body.dark-theme::highlight(templagem-variable) {
            background-color: rgba(59, 130, 246, 0.28) !important;
            color: #93c5fd !important;
          }
          [data-theme="dark"]::highlight(templagem-variable-active),
          html[data-theme="dark"]::highlight(templagem-variable-active),
          body.dark-theme::highlight(templagem-variable-active) {
            background-color: rgba(59, 130, 246, 0.5) !important;
            color: #bfdbfe !important;
          }
        `
        document.head.appendChild(style)
      }
    }
  }

  /**
   * Removes highlight container classes from an element.
   */
  public static removeHighlightClasses(
    element?: HTMLElement | HTMLTextAreaElement | null
  ): void {
    if (element && "classList" in element) {
      element.classList.remove(TemplateHighlighter.CONTAINER_CLASS)
    }
  }

  /**
   * Finds all {{variable}} positions in a given text string.
   */
  public static findVariablesInText(text: string): TemplateVariableLocation[] {
    const regex = /\{\{\s*([^}]+?)\s*\}\}/g
    const results: TemplateVariableLocation[] = []
    let match: RegExpExecArray | null
    let idx = 0

    while ((match = regex.exec(text)) !== null) {
      const fullStart = match.index
      const fullEnd = fullStart + match[0].length
      const raw = match[0]
      const captured = match[1] ?? ""
      const name = captured.trim()
      const openLen = raw.indexOf(captured)
      const innerStart = fullStart + (openLen >= 0 ? openLen : 2)
      const innerEnd = innerStart + captured.length

      results.push({
        index: idx++,
        name,
        raw,
        fullStart,
        fullEnd,
        innerStart,
        innerEnd
      })
    }

    return results
  }

  /**
   * Builds HTML string where all {{variable}} expressions are wrapped in spans
   * with the template variable CSS class (no inline styles).
   */
  public static buildTemplateHtml(text: string): string {
    const regex = /\{\{\s*([^}]+?)\s*\}\}/g
    let lastIndex = 0
    let html = ""
    let varIdx = 0

    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const raw = match[0]
      const captured = match[1] ?? ""
      const varName = captured.trim()

      if (start > lastIndex) {
        html += TemplateHighlighter.escapeHtml(text.slice(lastIndex, start))
      }

      html += `<span class="${TemplateHighlighter.VARIABLE_CLASS}" data-ph-var="${TemplateHighlighter.escapeHtml(varName)}" data-ph-original="${TemplateHighlighter.escapeHtml(varName)}" data-ph-index="${varIdx++}">${TemplateHighlighter.escapeHtml(raw)}</span>`
      lastIndex = start + raw.length
    }

    if (lastIndex < text.length) {
      html += TemplateHighlighter.escapeHtml(text.slice(lastIndex))
    }

    return html
  }

  /**
   * Appends template content as real DOM Nodes into a target element.
   * Completely avoids `element.innerHTML = ...` to prevent TrustedHTML policy violations
   * on pages like gemini.google.com that enforce Trusted Types.
   */
  public static appendTemplateNodes(target: HTMLElement, text: string): void {
    while (target.firstChild) {
      target.removeChild(target.firstChild)
    }

    const regex = /\{\{\s*([^}]+?)\s*\}\}/g
    let lastIndex = 0
    let varIdx = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const raw = match[0]
      const captured = match[1] ?? ""
      const varName = captured.trim()

      if (start > lastIndex) {
        target.appendChild(
          document.createTextNode(text.slice(lastIndex, start))
        )
      }

      const span = document.createElement("span")
      span.className = TemplateHighlighter.VARIABLE_CLASS
      span.setAttribute("data-ph-var", varName)
      span.setAttribute("data-ph-original", varName)
      span.setAttribute("data-ph-index", String(varIdx++))
      span.style.color = "#2563eb"
      span.style.backgroundColor = "rgba(37, 99, 235, 0.15)"
      span.style.borderRadius = "4px"
      span.style.padding = "0 4px"
      span.style.fontWeight = "600"
      span.textContent = raw
      target.appendChild(span)

      lastIndex = start + raw.length
    }

    if (lastIndex < text.length) {
      target.appendChild(document.createTextNode(text.slice(lastIndex)))
    }
  }

  /**
   * Highlights template variables via non-destructive CSS Custom Highlight API without modifying DOM nodes.
   * Prevents desynchronization and crashes in ProseMirror (ChatGPT, Claude) and React Fiber.
   */
  public static applyCustomHighlights(
    container: HTMLElement,
    variables: TemplateVariableLocation[],
    activeIndex: number = -1
  ): boolean {
    if (
      typeof window === "undefined" ||
      !("Highlight" in window) ||
      !("highlights" in CSS)
    ) {
      return false
    }

    try {
      this.applyHighlightClasses(container)

      const textNodes: Text[] = []
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      )
      let currentTextNode: Node | null = walker.nextNode()
      while (currentTextNode) {
        if (currentTextNode instanceof Text) {
          textNodes.push(currentTextNode)
        }
        currentTextNode = walker.nextNode()
      }

      const normalRanges: Range[] = []
      const activeRanges: Range[] = []

      for (let i = 0; i < variables.length; i++) {
        const v = variables[i]
        const range = this.createRangeAcrossTextNodes(
          textNodes,
          v.fullStart,
          v.fullEnd
        )
        if (range) {
          if (i === activeIndex) {
            activeRanges.push(range)
          } else {
            normalRanges.push(range)
          }
        }
      }

      const windowWithHighlight = window as unknown as {
        Highlight?: new (...ranges: Range[]) => unknown
      }
      const cssWithHighlights = CSS as unknown as {
        highlights?: {
          set(name: string, highlight: unknown): void
          delete(name: string): void
        }
      }

      const HighlightCtor = windowWithHighlight.Highlight
      const cssHighlights = cssWithHighlights.highlights
      if (normalRanges.length > 0 && HighlightCtor && cssHighlights) {
        cssHighlights.set("templagem-variable", new HighlightCtor(...normalRanges))
      } else {
        cssHighlights?.delete("templagem-variable")
      }

      if (activeRanges.length > 0 && HighlightCtor && cssHighlights) {
        cssHighlights.set(
          "templagem-variable-active",
          new HighlightCtor(...activeRanges)
        )
      } else {
        cssHighlights?.delete("templagem-variable-active")
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Clears all registered CSS highlights.
   */
  public static clearCustomHighlights(): void {
    if (typeof window !== "undefined" && "highlights" in CSS) {
      const cssWithHighlights = CSS as unknown as {
        highlights?: {
          delete(name: string): void
        }
      }
      cssWithHighlights.highlights?.delete("templagem-variable")
      cssWithHighlights.highlights?.delete("templagem-variable-active")
    }
  }

  private static createRangeAcrossTextNodes(
    nodes: Text[],
    startOffset: number,
    endOffset: number
  ): Range | null {
    if (nodes.length === 0 || startOffset >= endOffset) return null

    let current = 0
    let startNode: Text | null = null
    let startNodeOffset = 0
    let endNode: Text | null = null
    let endNodeOffset = 0

    for (const node of nodes) {
      const len = node.textContent?.length ?? 0
      const next = current + len

      if (!startNode && startOffset >= current && startOffset <= next) {
        startNode = node
        startNodeOffset = startOffset - current
      }
      if (!endNode && endOffset >= current && endOffset <= next) {
        endNode = node
        endNodeOffset = endOffset - current
        break
      }
      current = next
    }

    if (!startNode || !endNode) return null

    try {
      const range = document.createRange()
      range.setStart(startNode, startNodeOffset)
      range.setEnd(endNode, endNodeOffset)
      return range
    } catch {
      return null
    }
  }

  /**
   * Highlights the active template variable element visually with ACTIVE_CLASS
   * while removing it from other variable elements.
   */
  public static highlightActive(
    container: HTMLElement,
    activeIdx: number
  ): void {
    const spans = container.querySelectorAll<HTMLElement>(
      `.${TemplateHighlighter.VARIABLE_CLASS}`
    )
    spans.forEach((span, i) => {
      if (i === activeIdx) {
        span.classList.add(TemplateHighlighter.ACTIVE_CLASS)
        span.style.backgroundColor = "rgba(37, 99, 235, 0.28)"
        span.style.outline = "2px solid rgba(37, 99, 235, 0.5)"
      } else {
        span.classList.remove(TemplateHighlighter.ACTIVE_CLASS)
        span.style.backgroundColor = "rgba(37, 99, 235, 0.15)"
        span.style.outline = "none"
      }
    })
  }

  /**
   * Escapes HTML special characters.
   */
  public static escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }
}
