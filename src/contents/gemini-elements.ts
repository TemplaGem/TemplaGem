import type { ThemeMode } from "../utils/theme"
import { DiscoveryEngine } from "./core/discovery-engine"

export const GEMINI_INPUT_SELECTORS = [
  '.ql-editor[contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
  "textarea"
] as const

export const GEMINI_INPUT_SELECTOR = GEMINI_INPUT_SELECTORS.join(", ")

export const TEMPLAGEM_GEMINI_ROOT_ID = "templagem-gemini-root"

export const GEMINI_CONTAINER_SELECTORS = [
  ".input-area-container",
  ".chat-input-container",
  ".input-area",
  ".text-input-field",
  '[class*="input-area"]',
  '[class*="chat-input"]',
  '[class*="text-input-field"]',
  "form"
] as const

export const GEMINI_CONTAINER_SELECTOR = GEMINI_CONTAINER_SELECTORS.join(", ")

/**
 * Returns the Gemini-specific root container for mounting UI overlays.
 * Creates it if not already present on the page.
 */
export function getOrCreateGeminiRootContainer(): HTMLElement {
  const existing = document.getElementById(TEMPLAGEM_GEMINI_ROOT_ID)
  if (existing) {
    return existing
  }
  const container = document.createElement("div")
  container.id = TEMPLAGEM_GEMINI_ROOT_ID
  document.body.appendChild(container)
  return container
}

/**
 * Validates whether an element is TemplaGem's root container.
 */
export function isGeminiRootContainer(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return element.id === TEMPLAGEM_GEMINI_ROOT_ID
}

/**
 * Finds the editable Gemini input element from an event target or container.
 * Ignores clicks inside the TemplaGem popover itself.
 */
export function findGeminiInput(
  target: EventTarget | null,
  excludeElement: HTMLElement | null = null
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }
  if (excludeElement && excludeElement.contains(target)) {
    return null
  }
  const matched = target.closest<HTMLElement>(GEMINI_INPUT_SELECTOR)
  if (matched) return matched

  if (target.matches("rich-textarea, .chat-input-container, .input-area")) {
    const editable = target.querySelector<HTMLElement>(
      '[contenteditable="true"], textarea'
    )
    if (editable) return editable
  }

  // Fallback to DiscoveryEngine (resilient 3-tier discovery)
  const fallback = DiscoveryEngine.findInput(target)
  if (fallback && (!excludeElement || !excludeElement.contains(fallback))) {
    return fallback
  }

  return null
}

/**
 * Finds all active Gemini input elements currently present in the document or container.
 */
export function findAllGeminiInputs(
  root: ParentNode = document
): HTMLElement[] {
  if (!root || typeof root.querySelectorAll !== "function") {
    return []
  }
  return Array.from(root.querySelectorAll<HTMLElement>(GEMINI_INPUT_SELECTOR))
}

/**
 * Validates whether a given target/element is a Gemini input element.
 */
export function isGeminiInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.matches(GEMINI_INPUT_SELECTOR) ||
      target.closest(GEMINI_INPUT_SELECTOR)
  )
}

/**
 * Finds the parent container of the Gemini input (e.g. rich-textarea, .input-area)
 * so TemplaGem can dock directly to the full width of the prompt bar.
 */
export function findGeminiInputContainer(
  inputEl: HTMLElement | null
): HTMLElement | null {
  if (!inputEl) return null

  // 1. Check known Gemini outer containers FIRST (so we don't prematurely stop at inner rich-textarea)
  const outer = inputEl.closest<HTMLElement>(GEMINI_CONTAINER_SELECTOR)
  if (outer && outer !== document.body && outer !== document.documentElement) {
    return outer
  }

  // 2. Check if rich-textarea is wrapped by an input card
  const rich = inputEl.closest<HTMLElement>("rich-textarea")
  if (rich && rich.parentElement && rich.parentElement !== document.body) {
    const parent = rich.parentElement
    const parentRect = parent.getBoundingClientRect()
    if (parentRect.width >= 320) {
      return parent
    }
    return rich
  }

  // 3. Fallback to DiscoveryEngine universal container heuristic (forms, composers, wrappers)
  const discovered = DiscoveryEngine.findContainer(inputEl)
  if (
    discovered &&
    discovered !== document.body &&
    discovered !== document.documentElement
  ) {
    return discovered
  }

  return rich || inputEl
}

/**
 * Validates whether an element matches a Gemini input container selector.
 */
export function isGeminiInputContainer(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return (
    element.matches(GEMINI_CONTAINER_SELECTOR) ||
    element.tagName.toLowerCase() === "rich-textarea"
  )
}

/**
 * Checks if the target element corresponds to Gemini's Send / Submit button.
 * Supports English and Russian interfaces, Angular Material buttons, SVG icons, and custom classes.
 */
export function isGeminiSendButton(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const btn = target.closest<HTMLElement>(
    'button, [role="button"], .send-button'
  )
  if (!btn) return false

  // Ignore TemplaGem's own buttons
  if (btn.closest(`#${TEMPLAGEM_GEMINI_ROOT_ID}`)) return false

  const ariaLabel = (btn.getAttribute("aria-label") ?? "").toLowerCase()
  const matTooltip = (btn.getAttribute("mattooltip") ?? "").toLowerCase()
  const dataTooltip = (btn.getAttribute("data-tooltip") ?? "").toLowerCase()
  const title = (btn.getAttribute("title") ?? "").toLowerCase()
  const testId = (btn.getAttribute("data-testid") ?? "").toLowerCase()
  const cls = (
    typeof btn.className === "string"
      ? btn.className
      : btn.getAttribute("class") ?? ""
  ).toLowerCase()

  // Exclude microphone, voice, audio, and upload/attachment buttons
  const isExcluded =
    ariaLabel.includes("mic") ||
    ariaLabel.includes("микрофон") ||
    ariaLabel.includes("voice") ||
    ariaLabel.includes("голос") ||
    ariaLabel.includes("upload") ||
    ariaLabel.includes("загруз") ||
    ariaLabel.includes("file") ||
    ariaLabel.includes("файл") ||
    ariaLabel.includes("attach") ||
    ariaLabel.includes("прикреп")

  if (isExcluded) return false

  // Match send keywords in English and Russian ("отправ" covers отправить, отправка, отправить запрос)
  if (
    ariaLabel.includes("send") ||
    ariaLabel.includes("отправ") ||
    ariaLabel.includes("submit") ||
    matTooltip.includes("send") ||
    matTooltip.includes("отправ") ||
    dataTooltip.includes("send") ||
    dataTooltip.includes("отправ") ||
    title.includes("send") ||
    title.includes("отправ") ||
    testId.includes("send") ||
    cls.includes("send")
  ) {
    return true
  }

  // Detect send / upward-arrow icon in chat input area
  const hasSendIcon =
    Boolean(
      btn.querySelector(
        'svg, mat-icon, [data-icon="send"], i.google-material-icons'
      )
    ) ||
    btn.innerHTML.includes("send") ||
    btn.innerHTML.includes("arrow_upward")

  const isInInputArea = Boolean(
    btn.closest(
      "rich-textarea, .input-area, .chat-input, .text-input-field, form, main, footer"
    )
  )

  if (hasSendIcon && isInInputArea) {
    return true
  }

  return false
}

/**
 * Finds Gemini's Send / Submit button inside a container or entire document.
 */
export function findGeminiSendButton(
  container: ParentNode = document
): HTMLElement | null {
  if (!container || typeof container.querySelectorAll !== "function") {
    return null
  }
  const candidates = container.querySelectorAll<HTMLElement>(
    'button, [role="button"], .send-button'
  )
  for (const btn of candidates) {
    if (isGeminiSendButton(btn)) {
      return btn
    }
  }
  return null
}

/**
 * Detects whether the current Gemini page is rendered in dark mode
 * by checking body classes, data attributes, or media queries.
 */
export function detectGeminiPageTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    if (
      document.body?.classList.contains("dark-theme") ||
      document.documentElement?.getAttribute("data-theme") === "dark" ||
      document.documentElement?.classList.contains("dark")
    ) {
      return "dark"
    }
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark"
  }
  return "light"
}
