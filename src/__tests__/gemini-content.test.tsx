import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleGetPromptsMessage,
  registerBackgroundMessageListener,
  TEMPLAGEM_GET_PROMPTS_MESSAGE
} from "../background"
import { POPOVER_OFFSET_PX } from "../contents/gemini-dom"
import { loadPromptsForContentScript } from "../contents/gemini-api"
import GeminiPromptsOverlay, {
  computePopoverPosition,
  detectPageTheme,
  findGeminiInputTarget,
  getRootContainer,
  insertPromptIntoElement
} from "../contents/gemini-prompts"
import * as promptsApiModule from "../prompts-api"
import type { IPrompt } from "../types"
import {
  ACCESS_TOKEN_STORAGE_KEY,
  clearAccessToken,
  clearRefreshToken,
  REFRESH_TOKEN_STORAGE_KEY
} from "../utils/auth"
import { THEME_STORAGE_KEY } from "../utils/theme"

const mockPrompts: IPrompt[] = [
  {
    _id: "p1",
    title: "Code Review Assistant",
    body: "Please review the following TypeScript code for bugs.",
    tags: ["typescript", "review"]
  },
  {
    _id: "p2",
    title: "Summarize Article",
    body: "Summarize this article in 5 bullet points.",
    tags: ["summary"]
  },
  {
    _id: "p3",
    title: "Draft Email",
    body: "Write a polite follow-up email.",
    tags: undefined
  }
]

describe("Background script & Gemini content script", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    clearAccessToken()
    clearRefreshToken()
    promptsApiModule.invalidatePromptsCache()
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("background.ts", () => {
    it("returns unauthenticated state when no tokens exist in chrome.storage.local", async () => {
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        }
      })

      const res = await handleGetPromptsMessage(false)
      expect(res).toEqual({
        ok: true,
        prompts: [],
        isAuthenticated: false
      })
    })

    it("returns cached prompts from chrome.storage.local when not force-refreshing", async () => {
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              [ACCESS_TOKEN_STORAGE_KEY]: "header.eyJleHAiOjk5OTk5OTk5OTl9.sig",
              [promptsApiModule.PROMPTS_CACHE_STORAGE_KEY]: mockPrompts
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        }
      })

      const res = await handleGetPromptsMessage(false)
      expect(res.ok).toBe(true)
      expect(res.isAuthenticated).toBe(true)
      expect(res.prompts).toEqual(mockPrompts)
    })

    it("fetches fresh prompts when forceRefresh is true or cache is empty", async () => {
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              [REFRESH_TOKEN_STORAGE_KEY]: "header.eyJleHAiOjk5OTk5OTk5OTl9.sig"
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        }
      })
      vi.spyOn(promptsApiModule, "fetchPrompts").mockResolvedValue(mockPrompts)

      const res = await handleGetPromptsMessage(true)
      expect(res.ok).toBe(true)
      expect(res.prompts).toEqual(mockPrompts)
    })

    it("handles fetchPrompts error gracefully in background handler", async () => {
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              [ACCESS_TOKEN_STORAGE_KEY]: "header.eyJleHAiOjk5OTk5OTk5OTl9.sig"
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        }
      })
      vi.spyOn(promptsApiModule, "fetchPrompts").mockRejectedValue(
        new Error("Backend unreachable")
      )

      const res = await handleGetPromptsMessage(true)
      expect(res.ok).toBe(false)
      expect(res.error).toBe("Backend unreachable")
    })

    it("registers chrome.runtime.onMessage listener and responds to TEMPLAGEM_GET_PROMPTS", async () => {
      let registeredListener:
        | ((
            msg: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (res: unknown) => void
          ) => boolean)
        | undefined

      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              [ACCESS_TOKEN_STORAGE_KEY]: "header.eyJleHAiOjk5OTk5OTk5OTl9.sig",
              [promptsApiModule.PROMPTS_CACHE_STORAGE_KEY]: mockPrompts
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        },
        runtime: {
          onMessage: {
            addListener: vi.fn((fn) => {
              registeredListener = fn
            })
          }
        }
      })

      registerBackgroundMessageListener()
      expect(registeredListener).toBeDefined()

      // Ignore unrelated messages
      const ignored = registeredListener!(
        { type: "OTHER" },
        {} as chrome.runtime.MessageSender,
        vi.fn()
      )
      expect(ignored).toBe(false)

      // Handle TEMPLAGEM_GET_PROMPTS
      const sendResponse = vi.fn()
      const handled = registeredListener!(
        { type: TEMPLAGEM_GET_PROMPTS_MESSAGE, forceRefresh: false },
        {} as chrome.runtime.MessageSender,
        sendResponse
      )
      expect(handled).toBe(true)
      await waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith({
          ok: true,
          prompts: mockPrompts,
          isAuthenticated: true
        })
      })
    })
  })

  describe("gemini-prompts helpers", () => {
    it("creates and reuses #templagem-gemini-root container", () => {
      const first = getRootContainer()
      const second = getRootContainer()
      expect(first).toBe(second)
      expect(first.id).toBe("templagem-gemini-root")
    })

    it("identifies Gemini input elements and ignores clicks inside popover", () => {
      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      const innerP = document.createElement("p")
      editor.appendChild(innerP)
      document.body.appendChild(editor)

      const popover = document.createElement("div")
      const popoverBtn = document.createElement("button")
      popover.appendChild(popoverBtn)
      document.body.appendChild(popover)

      expect(findGeminiInputTarget(innerP, popover)).toBe(editor)
      expect(findGeminiInputTarget(popoverBtn, popover)).toBeNull()
      expect(findGeminiInputTarget(null, popover)).toBeNull()
    })

    it("computes popover position above and below the target rect", () => {
      const abovePos = computePopoverPosition({
        top: 500,
        bottom: 560,
        left: 100,
        right: 600,
        width: 500,
        height: 60,
        x: 100,
        y: 500,
        toJSON: () => ({})
      })
      expect(abovePos.top).toBeLessThan(500)
      expect(abovePos.left).toBe(100)

      const belowPos = computePopoverPosition({
        top: 50,
        bottom: 100,
        left: 5,
        right: 300,
        width: 295,
        height: 50,
        x: 5,
        y: 50,
        toJSON: () => ({})
      })
      expect(belowPos.top).toBe(100 + POPOVER_OFFSET_PX)
      expect(belowPos.left).toBe(12)
    })

    it("inserts prompt text into contenteditable and textarea elements", () => {
      const editorWithP = document.createElement("div")
      editorWithP.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      editorWithP.appendChild(p)
      document.body.appendChild(editorWithP)

      insertPromptIntoElement(editorWithP, "Hello Gemini")
      expect(p.textContent).toBe("Hello Gemini")

      const editorPlain = document.createElement("div")
      editorPlain.setAttribute("contenteditable", "true")
      document.body.appendChild(editorPlain)

      insertPromptIntoElement(editorPlain, "Direct content")
      expect(editorPlain.textContent).toBe("Direct content")

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      insertPromptIntoElement(textarea, "Textarea prompt")
      expect(textarea.value).toBe("Textarea prompt")
    })
  })

  describe("GeminiPromptsOverlay component", () => {
    it("opens on clicking Gemini input, filters prompts, and inserts selected prompt", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const geminiInput = document.createElement("div")
      geminiInput.className = "ql-editor"
      geminiInput.setAttribute("contenteditable", "true")
      const paragraph = document.createElement("p")
      geminiInput.appendChild(paragraph)
      document.body.appendChild(geminiInput)

      render(<GeminiPromptsOverlay />)

      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()

      // Click on Gemini input
      fireEvent.click(paragraph)

      expect(
        await screen.findByRole("dialog", { name: /templagem gemini prompts/i })
      ).toBeInTheDocument()

      expect(
        await screen.findByText("Code Review Assistant")
      ).toBeInTheDocument()
      expect(screen.getByText("Summarize Article")).toBeInTheDocument()

      // Filter by #tag
      const searchInput = screen.getByLabelText("Search Gemini prompts")
      fireEvent.change(searchInput, { target: { value: "#review" } })

      expect(screen.getByText("Code Review Assistant")).toBeInTheDocument()
      expect(screen.queryByText("Summarize Article")).not.toBeInTheDocument()

      // Clear search query
      fireEvent.change(searchInput, { target: { value: "" } })
      expect(screen.getByText("Summarize Article")).toBeInTheDocument()

      // Filter by clicking tag chip
      const reviewTagBtn = screen.getByRole("button", { name: "#review" })
      fireEvent.click(reviewTagBtn)
      expect(screen.getByText("Code Review Assistant")).toBeInTheDocument()
      expect(screen.queryByText("Summarize Article")).not.toBeInTheDocument()

      // Deselect tag chip by clicking it again
      fireEvent.click(reviewTagBtn)
      expect(screen.getByText("Summarize Article")).toBeInTheDocument()

      // Filter by text with no match
      fireEvent.change(searchInput, { target: { value: "nonexistent" } })
      expect(
        screen.getByText("No prompts match your search.")
      ).toBeInTheDocument()

      // Clear search and click a prompt to insert
      fireEvent.change(searchInput, { target: { value: "" } })
      fireEvent.click(screen.getByText("Code Review Assistant"))

      expect(paragraph.textContent).toBe(
        "Please review the following TypeScript code for bugs."
      )
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()
    })

    it("supports refresh, Escape key, close button, and outside click", async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({
        ok: true,
        prompts: mockPrompts,
        isAuthenticated: true
      })
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: sendMessageMock
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)

      // Focus Gemini input
      fireEvent.focusIn(textarea)
      expect(
        await screen.findByText("Code Review Assistant")
      ).toBeInTheDocument()

      // Mousedown inside popover or inside active input does not close
      fireEvent.mouseDown(screen.getByText("TemplaGem"))
      fireEvent.mouseDown(textarea)
      fireEvent.keyDown(document, { key: "Enter" })
      expect(
        screen.getByRole("dialog", { name: /templagem gemini prompts/i })
      ).toBeInTheDocument()

      // Click refresh button
      fireEvent.click(screen.getByRole("button", { name: /refresh prompts/i }))
      await waitFor(() => {
        expect(sendMessageMock).toHaveBeenCalledWith({
          type: TEMPLAGEM_GET_PROMPTS_MESSAGE,
          forceRefresh: true
        })
      })

      // Close with Escape
      fireEvent.keyDown(document, { key: "Escape" })
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()

      // Reopen and close via outside mousedown
      fireEvent.click(textarea)
      expect(
        await screen.findByRole("dialog", { name: /templagem gemini prompts/i })
      ).toBeInTheDocument()

      fireEvent.mouseDown(document.body)
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()

      // Reopen and close via close button
      fireEvent.click(textarea)
      expect(
        await screen.findByRole("dialog", { name: /templagem gemini prompts/i })
      ).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole("button", { name: /close prompts popover/i })
      )
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()
    })

    it("inserts template prompt directly into Gemini input with blue highlight and supports in-input arrow jumping", async () => {
      const templatePrompt: IPrompt = {
        _id: "tpl1",
        title: "Translate & Polish",
        body: "Translate this text to {{language}} in a {{tone}} style: {{text}}",
        tags: ["translation"]
      }

      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: [templatePrompt],
            isAuthenticated: true
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)

      // Open popover by focusing textarea
      fireEvent.click(textarea)
      expect(await screen.findByText("Translate & Polish")).toBeInTheDocument()

      // Click on template prompt -> inserts directly into Gemini input and closes popover
      fireEvent.click(screen.getByText("Translate & Polish"))
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()

      expect(textarea.value).toBe(
        "Translate this text to {{language}} in a {{tone}} style: {{text}}"
      )

      // First variable ("language") has collapsed caret at innerEnd (no standard selection highlight)
      expect(textarea.selectionStart).toBe(33)
      expect(textarea.selectionEnd).toBe(33) // collapsed!

      // Press ArrowRight to jump to next variable ("tone")
      fireEvent.keyDown(textarea, { key: "ArrowRight" })
      expect(textarea.selectionStart).toBe(47) // innerEnd of "tone"
      expect(textarea.selectionEnd).toBe(47)

      // Press ArrowRight to jump to next variable ("text")
      fireEvent.keyDown(textarea, { key: "ArrowRight" })
      expect(textarea.selectionStart).toBe(63) // innerEnd of "text"
      expect(textarea.selectionEnd).toBe(63)

      // Press ArrowLeft to jump back to previous variable ("tone")
      fireEvent.keyDown(textarea, { key: "ArrowLeft" })
      expect(textarea.selectionStart).toBe(43) // innerStart of "tone"
      expect(textarea.selectionEnd).toBe(43)

      // Pressing Enter to submit strips all brackets
      fireEvent.keyDown(textarea, { key: "Enter" })
      expect(textarea.value).toBe(
        "Translate this text to language in a tone style: text"
      )
    })

    it("inserts template prompt into contenteditable with blue highlighted spans", async () => {
      const templatePrompt: IPrompt = {
        _id: "tpl2",
        title: "Code Generator",
        body: "Generate a {{framework}} component for {{feature}}",
        tags: ["code"]
      }

      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: [templatePrompt],
            isAuthenticated: true
          })
        }
      })

      const editor = document.createElement("div")
      editor.className = "ql-editor"
      editor.setAttribute("contenteditable", "true")
      const p = document.createElement("p")
      editor.appendChild(p)
      document.body.appendChild(editor)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(p)
      expect(await screen.findByText("Code Generator")).toBeInTheDocument()

      fireEvent.click(screen.getByText("Code Generator"))
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()

      // Contenteditable p contains spans with .ph-template-variable and blue styling
      const spans = p.querySelectorAll(".ph-template-variable")
      expect(spans).toHaveLength(2)
      expect(spans[0].textContent).toBe("{{framework}}")
      expect(spans[0]).toHaveAttribute("data-ph-var", "framework")
      expect(spans[1].textContent).toBe("{{feature}}")
      expect(spans[1]).toHaveAttribute("data-ph-var", "feature")

      // Template highlight classes are applied
      expect(editor.classList.contains("ph-template-container")).toBe(true)
      expect(document.body.classList.contains("ph-templates-enabled")).toBe(
        true
      )

      // Pressing Enter strips brackets in contenteditable
      fireEvent.keyDown(editor, { key: "Enter" })
      expect(p.textContent).toBe("Generate a framework component for feature")
      expect(p.querySelectorAll(".ph-template-variable")).toHaveLength(0)
    })

    it("renders unauthenticated and error states and falls back to storage or fetchPrompts", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: [],
            isAuthenticated: false
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      const { unmount } = render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      expect(
        await screen.findByText(
          /please sign in via the templagem extension popup/i
        )
      ).toBeInTheDocument()
      unmount()

      // Error state from background response
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: false,
            prompts: [],
            isAuthenticated: true,
            error: "Service unavailable"
          })
        }
      })

      const { unmount: unmountError } = render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Service unavailable"
      )
      unmountError()

      // Fallback when chrome.runtime.sendMessage rejects -> storage cache
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockRejectedValue(new Error("No SW"))
        },
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              [promptsApiModule.PROMPTS_CACHE_STORAGE_KEY]: []
            })
          }
        }
      })

      const { unmount: unmountStorage } = render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)
      expect(
        await screen.findByText("No prompts saved yet.")
      ).toBeInTheDocument()
      unmountStorage()

      // Fallback when neither runtime nor storage has cached array -> fetchPrompts
      vi.stubGlobal("chrome", undefined)
      vi.spyOn(promptsApiModule, "fetchPrompts").mockResolvedValue(mockPrompts)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)
      expect(
        await screen.findByText("Code Review Assistant")
      ).toBeInTheDocument()
    })

    it("adapts popover data-theme to stored dark theme, page dark-theme class, and storage changes", async () => {
      document.body.classList.add("dark-theme")
      expect(detectPageTheme()).toBe("dark")
      document.body.classList.remove("dark-theme")

      let storageListener:
        | ((changes: Record<string, chrome.storage.StorageChange>) => void)
        | undefined

      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true,
            theme: "dark"
          })
        },
        storage: {
          onChanged: {
            addListener: vi.fn((fn) => {
              storageListener = fn
            }),
            removeListener: vi.fn()
          }
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      const { unmount } = render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      const dialog = await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      await waitFor(() => {
        expect(dialog).toHaveAttribute("data-theme", "dark")
      })

      storageListener?.({
        [THEME_STORAGE_KEY]: { oldValue: "dark", newValue: "light" }
      })
      await waitFor(() => {
        expect(dialog).toHaveAttribute("data-theme", "light")
      })

      unmount()
    })

    it("supports keyboard navigation with ArrowDown, ArrowUp, and Enter", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      await screen.findByText("Code Review Assistant")
      const searchInput = screen.getByLabelText("Search Gemini prompts")

      // ArrowDown to move to second prompt
      fireEvent.keyDown(searchInput, { key: "ArrowDown" })
      // ArrowUp to move back up
      fireEvent.keyDown(searchInput, { key: "ArrowUp" })
      // ArrowDown again to move to second prompt ("Summarize Article")
      fireEvent.keyDown(searchInput, { key: "ArrowDown" })
      // Press Enter to insert selected prompt
      fireEvent.keyDown(searchInput, { key: "Enter" })

      expect(textarea.value).toBe("Summarize this article in 5 bullet points.")
      expect(
        screen.queryByRole("dialog", { name: /templagem gemini prompts/i })
      ).not.toBeInTheDocument()
    })

    it("displays generic error message when prompt fetching rejects with non-Error", async () => {
      vi.spyOn(promptsApiModule, "fetchPrompts").mockRejectedValueOnce(
        "String network rejection"
      )

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      expect(
        await screen.findByText("Failed to load prompts")
      ).toBeInTheDocument()
    })

    it("docks on parent rich-textarea container when available", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const richTextarea = document.createElement("rich-textarea")
      richTextarea.getBoundingClientRect = vi.fn().mockReturnValue({
        top: 500,
        bottom: 560,
        left: 150,
        right: 850,
        width: 700,
        height: 60,
        x: 150,
        y: 500,
        toJSON: () => ({})
      })

      const input = document.createElement("div")
      input.className = "ql-editor"
      input.setAttribute("contenteditable", "true")
      input.getBoundingClientRect = vi.fn().mockReturnValue({
        top: 510,
        bottom: 550,
        left: 170,
        right: 830,
        width: 660,
        height: 40,
        x: 170,
        y: 510,
        toJSON: () => ({})
      })
      richTextarea.appendChild(input)
      document.body.appendChild(richTextarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(input)

      const dialog = await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      expect(dialog).toBeInTheDocument()
      expect(dialog.style.width).toBe("700px")
      expect(dialog.style.left).toBe("150px")

      // Window resize and scroll re-computes position
      fireEvent(window, new Event("resize"))
      fireEvent(window, new Event("scroll"))
      expect(dialog).toBeInTheDocument()
    })

    it("supports keyboard navigation from the Gemini input element", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.focusIn(textarea)

      const dialog = await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      expect(dialog).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText("Code Review Assistant")).toBeInTheDocument()
      })

      // ArrowDown navigates to second item
      fireEvent.keyDown(textarea, { key: "ArrowDown" })
      // ArrowUp navigates back to first item
      fireEvent.keyDown(textarea, { key: "ArrowUp" })
      // ArrowDown again
      fireEvent.keyDown(textarea, { key: "ArrowDown" })

      // Press Enter to select the prompt (second item: mockPrompts[1])
      fireEvent.keyDown(textarea, { key: "Enter" })

      // Dialog should close and prompt body should be inserted
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(textarea.value).toBe(mockPrompts[1].body)
    })

    it("supports selecting prompt with Tab key and closing with Escape from Gemini input", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })

      await waitFor(() => {
        expect(screen.getByText("Code Review Assistant")).toBeInTheDocument()
      })

      // Press Tab to select currently active item (mockPrompts[0])
      fireEvent.keyDown(textarea, { key: "Tab" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(textarea.value).toBe(mockPrompts[0].body)

      // Re-open and close with Escape
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.keyDown(textarea, { key: "Escape" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes popover when user starts typing, presses Backspace/Delete, or pastes in Gemini input", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: mockPrompts,
            isAuthenticated: true
          })
        }
      })

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      render(<GeminiPromptsOverlay />)
      fireEvent.click(textarea)

      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })

      // 1. Typing in search field inside popover does NOT close popover
      const searchInput = screen.getByLabelText("Search Gemini prompts")
      fireEvent.keyDown(searchInput, { key: "a" })
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      // 2. Typing printable character in Gemini textarea closes popover
      fireEvent.keyDown(textarea, { key: "h" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // Trailing focusin from contenteditable/Quill does NOT reopen popover while user is in input
      fireEvent.focusIn(textarea)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 3. Re-open and test Backspace
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.keyDown(textarea, { key: "Backspace" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 4. Re-open and test Delete
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.keyDown(textarea, { key: "Delete" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 5. Re-open and test paste
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.paste(textarea, { clipboardData: { getData: () => "pasted" } })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 6. Re-open and test input event
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.input(textarea, { target: { value: "typing" } })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 7. Re-open and test IME compositionstart event
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.compositionStart(textarea)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 8. Non-typing modifier keys like Shift do not close popover
      fireEvent.click(textarea)
      await screen.findByRole("dialog", {
        name: /templagem gemini prompts/i
      })
      fireEvent.keyDown(textarea, { key: "Shift" })
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
  })

  describe("loadPromptsForContentScript", () => {
    it("falls back to storage when runtime.sendMessage fails or returns invalid response", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockRejectedValue(new Error("No background"))
        },
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({
              templagem_refresh_token: "refresh-token-123",
              templagem_access_token: "access-token-123",
              templagem_prompts_cache: mockPrompts,
              templagem_theme: "dark"
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
          }
        }
      })

      const res = await loadPromptsForContentScript(false)
      expect(res.ok).toBe(true)
      expect(res.prompts).toHaveLength(3)
      expect(res.theme).toBe("dark")
      expect(res.isAuthenticated).toBe(true)
    })
  })
})
