import type { PlatformRule } from "../../services/manifest/types"

export const TEMPLAGEM_ROOT_CONTAINER_ID = "templagem-gemini-root"

/**
 * Checks whether an element or event target belongs to the TemplaGem UI overlay.
 */
export function isTemplaGemRoot(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.id === TEMPLAGEM_ROOT_CONTAINER_ID ||
    Boolean(target.closest(`#${TEMPLAGEM_ROOT_CONTAINER_ID}`)) ||
    target.classList.contains("templagem-overlay")
  )
}

/**
 * Checks if an element is visible in the viewport or layout.
 * In JSDOM environments, getClientRects / offsetParent may be 0,
 * so we account for standard DOM properties and computed styles.
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  if (isTemplaGemRoot(el)) return false

  if (typeof window !== "undefined") {
    const style = window.getComputedStyle(el)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false
    }
  }

  // If in browser environment with layout, check bounding rect
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    // If offsetParent is null and not body/html/fixed, it's hidden (unless jsdom)
    if (el.offsetParent === null && el.style.position !== "fixed") {
      // In JSDOM offsetParent is always null, so check if display isn't none
      return el.style.display !== "none"
    }
  }

  return true
}

export class DiscoveryEngine {
  private static lastActiveInput: HTMLElement | null = null
  private static isListenerInitialized = false

  static initFocusListener(): void {
    if (this.isListenerInitialized || typeof window === "undefined") {
      return
    }

    window.addEventListener(
      "focusin",
      (event: FocusEvent) => {
        const target = event.target
        if (target instanceof HTMLElement && this.isCandidateInput(target)) {
          this.lastActiveInput = target
        }
      },
      true
    )

    this.isListenerInitialized = true
  }

  /**
   * Evaluates if a given node is an editable candidate element.
   */
  static isCandidateInput(el: HTMLElement): boolean {
    if (isTemplaGemRoot(el)) return false
    if (
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLInputElement
    ) {
      return el.type === "textarea" || el.type === "text" || !el.type
    }
    const isContentEditable =
      el.isContentEditable ||
      el.getAttribute("contenteditable") === "true" ||
      el.getAttribute("role") === "textbox"
    return isContentEditable
  }

  /**
   * Finds the chat input element using the 3-tier discovery pipeline:
   * 
   * When `target` is provided (e.g. from click/focus event):
   * Strictly verifies whether `target` IS or is INSIDE the chat input.
   * NEVER searches the document globally for a target click, returning null for clicks elsewhere!
   * 
   * When `target` is omitted/null:
   * Performs a global document query (rule selectors -> heuristic scoring -> last focus).
   */
  static findInput(
    target?: EventTarget | null,
    rule?: PlatformRule | null
  ): HTMLElement | null {
    // Ensure focus tracking is active
    this.initFocusListener()

    if (target && isTemplaGemRoot(target)) {
      return null
    }

    // --- CASE A: Checking a specific event target (click or focus) ---
    if (target instanceof HTMLElement) {
      // 1. Target direct or closest ancestor match from rule selectors
      if (rule?.selectors.input) {
        for (const selector of rule.selectors.input) {
          const matched = target.closest<HTMLElement>(selector)
          if (matched && isElementVisible(matched) && !isTemplaGemRoot(matched)) {
            return matched
          }
        }
      }

      // 2. Target is an input wrapper container (e.g. rich-textarea, .chat-input-container)
      if (
        target.matches(
          "rich-textarea, .chat-input-container, .input-area, .composer, .chat-input-wrapper"
        )
      ) {
        const editable = target.querySelector<HTMLElement>(
          '[contenteditable="true"], textarea, [role="textbox"]'
        )
        if (editable && isElementVisible(editable) && !isTemplaGemRoot(editable)) {
          return editable
        }
      }

      // 3. Target itself is an editable input candidate
      if (this.isCandidateInput(target) && isElementVisible(target)) {
        return target
      }

      // 4. Target is inside an editable input candidate
      const closestEditable = target.closest<HTMLElement>(
        '[contenteditable="true"], [role="textbox"], textarea'
      )
      if (
        closestEditable &&
        isElementVisible(closestEditable) &&
        !isTemplaGemRoot(closestEditable)
      ) {
        return closestEditable
      }

      // Target was clicked, and it is NOT an input. Return null to avoid false triggers!
      return null
    }

    // --- CASE B: Global document search when target is omitted / null ---
    // 1. Query selectors from active platform rule
    if (rule?.selectors.input) {
      for (const selector of rule.selectors.input) {
        const found = document.querySelector<HTMLElement>(selector)
        if (found && isElementVisible(found)) {
          return found
        }
      }
    }

    // 2. Heuristic geometric & a11y scoring across document
    const bestScored = this.scoreCandidateInputs()
    if (bestScored) {
      return bestScored
    }

    // 3. Focusin capture fallback
    if (
      this.lastActiveInput &&
      this.lastActiveInput.isConnected &&
      isElementVisible(this.lastActiveInput)
    ) {
      return this.lastActiveInput
    }

    return null
  }

  /**
   * Finds the container surrounding the input element (for anchoring popovers).
   */
  static findContainer(
    input: HTMLElement | null,
    rule?: PlatformRule | null
  ): HTMLElement | null {
    if (!input) return null

    if (rule?.selectors.container) {
      for (const selector of rule.selectors.container) {
        const matched = input.closest<HTMLElement>(selector)
        if (matched) return matched
      }
    }

    // Universal heuristics for prompt container
    const parentContainer = input.closest<HTMLElement>(
      "form, fieldset, [class*='composer'], [class*='input-container'], [class*='input-area']"
    )
    if (parentContainer) return parentContainer

    return input.parentElement || input
  }

  /**
   * Finds the submit / send prompt button near the input.
   */
  static findSubmitButton(
    input: HTMLElement | null,
    rule?: PlatformRule | null
  ): HTMLElement | null {
    const container = this.findContainer(input, rule) || document.body

    if (rule?.selectors.submitButton) {
      for (const selector of rule.selectors.submitButton) {
        const btn = container.querySelector<HTMLElement>(selector)
        if (btn) return btn
      }
    }

    // Generic heuristic search for submit buttons
    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button[type="submit"], button[data-testid*="send" i], button[aria-label*="Send" i], button[aria-label*="Отправить" i], [role="button"][aria-label*="Send" i]'
      )
    )

    return candidates[0] || null
  }

  /**
   * Autonomous scoring of candidate inputs based on viewport position,
   * dimensions, a11y attributes, and submit button proximity.
   */
  static scoreCandidateInputs(): HTMLElement | null {
    if (typeof document === "undefined") return null

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[contenteditable="true"], [role="textbox"], textarea, rich-textarea'
      )
    ).filter((el) => {
      if (el.tagName.toLowerCase() === "rich-textarea") {
        const inner = el.querySelector<HTMLElement>('[contenteditable="true"]')
        return Boolean(inner && isElementVisible(inner))
      }
      return this.isCandidateInput(el) && isElementVisible(el)
    })

    if (candidates.length === 0) return null

    const viewportHeight =
      typeof window !== "undefined" && window.innerHeight > 0
        ? window.innerHeight
        : 1000

    let bestElement: HTMLElement | null = null
    let maxScore = -1

    for (let el of candidates) {
      if (el.tagName.toLowerCase() === "rich-textarea") {
        const inner = el.querySelector<HTMLElement>('[contenteditable="true"]')
        if (inner) el = inner
      }

      const rect = el.getBoundingClientRect()
      let score = 0

      // Geometry: prompt input is in bottom 35% of viewport
      if (rect.height > 0 && rect.bottom > 0) {
        const distFromBottomRatio =
          (viewportHeight - rect.bottom) / viewportHeight
        if (distFromBottomRatio >= -0.1 && distFromBottomRatio <= 0.35) {
          score += 50
        }
      } else {
        // Fallback for tests/jsdom where rects may be 0
        score += 20
      }

      // Dimensions
      if (rect.width > 250) score += 20
      if (rect.height >= 20 && rect.height <= 400) score += 15

      // Semantic / a11y tags
      if (el.getAttribute("role") === "textbox") score += 10
      if (
        el.getAttribute("contenteditable") === "true" ||
        el.isContentEditable
      ) {
        score += 10
      }
      if (el.tagName.toLowerCase() === "textarea") score += 10
      if (el.getAttribute("aria-multiline") === "true") score += 5

      // Form context and nearby submit button
      const formParent = el.closest("form, fieldset, [class*='composer']")
      if (formParent) {
        score += 15
        const submitBtn = formParent.querySelector(
          'button[type="submit"], button[aria-label*="Send" i], [data-testid*="send" i], svg'
        )
        if (submitBtn) score += 25
      }

      if (score > maxScore) {
        maxScore = score
        bestElement = el
      }
    }

    return maxScore >= 40 ? bestElement : null
  }

  /**
   * Resets internal state for test isolation.
   */
  static reset(): void {
    this.lastActiveInput = null
  }
}

