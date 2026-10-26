import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import TemplaGemLogo from "../components/TemplaGemLogo/TemplaGemLogo"
import TagFilter from "../components/TagFilter/TagFilter"
import { GeminiHeader } from "../contents/components/GeminiHeader"
import {
  CloseIcon,
  EnterIcon,
  GEMINI_ICON_SIZES,
  RefreshIcon,
  SearchIcon,
  SparkleIcon
} from "../contents/components/GeminiIcons"
import { GeminiPromptItem } from "../contents/components/GeminiPromptItem"
import { GeminiPromptList } from "../contents/components/GeminiPromptList"
import { GeminiStateView } from "../contents/components/GeminiStateView"
import { useGeminiPromptsQuery } from "../contents/hooks/useGeminiPromptsQuery"
import { useThemeStorage } from "../contents/hooks/useThemeStorage"
import type { IPrompt } from "../types"
import { THEME_STORAGE_KEY } from "../utils/theme"

describe("Gemini decomposed components & hooks", () => {
  describe("GeminiIcons", () => {
    it("renders icons with default and custom size parameters", () => {
      const { container } = render(
        <div>
          <SparkleIcon
            size={24}
            className="custom-sparkle"
          />
          <SearchIcon
            size={20}
            strokeWidth={3}
            color="red"
          />
          <RefreshIcon
            size={18}
            strokeWidth={2.5}
            color="blue"
          />
          <CloseIcon
            size={22}
            strokeWidth={1.5}
            color="green"
          />
          <EnterIcon
            size={14}
            strokeWidth={2}
          />
        </div>
      )

      const svgs = container.querySelectorAll("svg")
      expect(svgs).toHaveLength(5)
      expect(svgs[0].getAttribute("width")).toBe("24")
      expect(svgs[1].getAttribute("width")).toBe("20")
      expect(svgs[2].getAttribute("width")).toBe("18")
      expect(svgs[3].getAttribute("width")).toBe("22")
      expect(svgs[4].getAttribute("width")).toBe("14")
    })

    it("renders icons with default GEMINI_ICON_SIZES when no props provided", () => {
      const { container } = render(
        <div>
          <SparkleIcon />
          <SearchIcon />
          <RefreshIcon />
          <CloseIcon />
          <EnterIcon />
        </div>
      )

      const svgs = container.querySelectorAll("svg")
      expect(svgs[0].getAttribute("width")).toBe(
        String(GEMINI_ICON_SIZES.sparkle)
      )
      expect(svgs[1].getAttribute("width")).toBe(
        String(GEMINI_ICON_SIZES.search)
      )
      expect(svgs[2].getAttribute("width")).toBe(
        String(GEMINI_ICON_SIZES.refresh)
      )
      expect(svgs[3].getAttribute("width")).toBe(
        String(GEMINI_ICON_SIZES.close)
      )
      expect(svgs[4].getAttribute("width")).toBe(
        String(GEMINI_ICON_SIZES.enter)
      )
    })
  })

  describe("TemplaGemLogo", () => {
    it("renders with default and custom size", () => {
      const { rerender } = render(<TemplaGemLogo />)
      const logo = screen.getByTestId("templagem-logo")
      expect(logo).toBeInTheDocument()

      rerender(
        <TemplaGemLogo
          size={24}
          className="custom-logo"
        />
      )
      expect(logo).toHaveStyle({ width: "24px", height: "24px" })
    })
  })

  describe("TagFilter", () => {
    it("renders null when tags array is empty", () => {
      const { container } = render(
        <TagFilter
          tags={[]}
          selectedTag={null}
          onSelectTag={vi.fn()}
        />
      )
      expect(container.firstChild).toBeNull()
    })

    it("renders All and tag chips, handles select and toggle deselect", () => {
      const onSelect = vi.fn()
      const { rerender } = render(
        <TagFilter
          tags={["coding", "review"]}
          selectedTag={null}
          onSelectTag={onSelect}
        />
      )

      expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
      expect(screen.getByRole("button", { name: "#coding" })).toHaveAttribute(
        "aria-pressed",
        "false"
      )

      fireEvent.click(screen.getByRole("button", { name: "#coding" }))
      expect(onSelect).toHaveBeenCalledWith("coding")

      // Clicking active tag toggles to null
      rerender(
        <TagFilter
          tags={["coding", "review"]}
          selectedTag="coding"
          onSelectTag={onSelect}
        />
      )
      expect(screen.getByRole("button", { name: "#coding" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
      fireEvent.click(screen.getByRole("button", { name: "#coding" }))
      expect(onSelect).toHaveBeenCalledWith(null)
    })
  })

  describe("GeminiHeader", () => {
    it("handles search input, refresh click, and close click", () => {
      const onSearchChange = vi.fn()
      const onRefresh = vi.fn()
      const onClose = vi.fn()

      render(
        <GeminiHeader
          searchQuery="test"
          onSearchChange={onSearchChange}
          onRefresh={onRefresh}
          onClose={onClose}
          isLoading={false}
        />
      )

      const input = screen.getByLabelText(/search gemini prompts/i)
      fireEvent.change(input, { target: { value: "new query" } })
      expect(onSearchChange).toHaveBeenCalledWith("new query")

      const refreshBtn = screen.getByRole("button", {
        name: /refresh prompts/i
      })
      fireEvent.click(refreshBtn)
      expect(onRefresh).toHaveBeenCalledTimes(1)

      const closeBtn = screen.getByRole("button", {
        name: /close prompts popover/i
      })
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("disables refresh button when isLoading is true", () => {
      render(
        <GeminiHeader
          searchQuery=""
          onSearchChange={vi.fn()}
          onRefresh={vi.fn()}
          onClose={vi.fn()}
          isLoading={true}
        />
      )

      const refreshBtn = screen.getByRole("button", {
        name: /refresh prompts/i
      })
      expect(refreshBtn).toBeDisabled()
    })
  })

  describe("GeminiPromptItem & GeminiPromptList", () => {
    const mockItem: IPrompt = {
      _id: "test-1",
      title: "Helper Prompt",
      body: "Generate a {{topic}} guide",
      tags: ["guide", "helper"]
    }

    it("renders item with tags and triggers callbacks", () => {
      const onSelect = vi.fn()
      const onMouseEnter = vi.fn()

      render(
        <GeminiPromptItem
          prompt={mockItem}
          isSelected={true}
          onSelect={onSelect}
          onMouseEnter={onMouseEnter}
        />
      )

      expect(screen.getByText("Helper Prompt")).toBeInTheDocument()
      expect(screen.getByText("#guide")).toBeInTheDocument()
      expect(screen.getByText("#helper")).toBeInTheDocument()

      const btn = screen.getByRole("button")
      fireEvent.click(btn)
      expect(onSelect).toHaveBeenCalledWith(mockItem)

      fireEvent.mouseEnter(btn)
      expect(onMouseEnter).toHaveBeenCalledTimes(1)
    })

    it("renders list and delegates selection and hover", () => {
      const onSelect = vi.fn()
      const onHover = vi.fn()
      const listRef = { current: document.createElement("ul") }

      const { rerender } = render(
        <GeminiPromptList
          prompts={[mockItem]}
          selectedIndex={0}
          onSelectPrompt={onSelect}
          onHoverIndex={onHover}
          listRef={listRef}
        />
      )

      expect(screen.getByText("Helper Prompt")).toBeInTheDocument()
      fireEvent.mouseEnter(screen.getByRole("button"))
      expect(onHover).toHaveBeenCalledWith(0)

      // Rerender with selectedIndex out of bounds
      rerender(
        <GeminiPromptList
          prompts={[mockItem]}
          selectedIndex={-1}
          onSelectPrompt={onSelect}
          onHoverIndex={onHover}
          listRef={listRef}
        />
      )

      // Rerender without listRef
      rerender(
        <GeminiPromptList
          prompts={[mockItem]}
          selectedIndex={0}
          onSelectPrompt={onSelect}
          onHoverIndex={onHover}
        />
      )
    })
  })

  describe("GeminiStateView", () => {
    it("renders loading, unauthenticated, error, and empty states", () => {
      const onRetry = vi.fn()
      const onResetFilters = vi.fn()

      const { rerender } = render(
        <GeminiStateView
          isLoading={true}
          isAuthenticated={true}
          errorMessage={null}
          totalPromptsCount={5}
        />
      )
      expect(screen.getByText("Loading prompts...")).toBeInTheDocument()

      rerender(
        <GeminiStateView
          isLoading={false}
          isAuthenticated={false}
          errorMessage={null}
          totalPromptsCount={5}
        />
      )
      expect(
        screen.getByText(/please sign in via the templagem extension popup/i)
      ).toBeInTheDocument()

      rerender(
        <GeminiStateView
          isLoading={false}
          isAuthenticated={true}
          errorMessage="Custom error occurred"
          totalPromptsCount={5}
          onRetry={onRetry}
        />
      )
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Custom error occurred"
      )
      fireEvent.click(screen.getByRole("button", { name: "Try again" }))
      expect(onRetry).toHaveBeenCalledTimes(1)

      rerender(
        <GeminiStateView
          isLoading={false}
          isAuthenticated={true}
          errorMessage={null}
          totalPromptsCount={0}
        />
      )
      expect(screen.getByText("No prompts saved yet.")).toBeInTheDocument()

      rerender(
        <GeminiStateView
          isLoading={false}
          isAuthenticated={true}
          errorMessage={null}
          totalPromptsCount={3}
          onResetFilters={onResetFilters}
        />
      )
      expect(
        screen.getByText("No prompts match your search.")
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Reset search" }))
      expect(onResetFilters).toHaveBeenCalledTimes(1)
    })
  })

  describe("useThemeStorage hook", () => {
    it("synchronizes with chrome.storage.onChanged and cleans up on unmount", () => {
      let listener:
        | ((changes: Record<string, chrome.storage.StorageChange>) => void)
        | undefined
      const addListener = vi.fn((fn) => {
        listener = fn
      })
      const removeListener = vi.fn()

      vi.stubGlobal("chrome", {
        storage: {
          onChanged: {
            addListener,
            removeListener
          }
        }
      })

      const { result, unmount } = renderHook(() => useThemeStorage("light"))
      expect(result.current[0]).toBe("light")

      act(() => {
        listener?.({
          [THEME_STORAGE_KEY]: { oldValue: "light", newValue: "dark" }
        })
      })

      expect(result.current[0]).toBe("dark")

      unmount()
      expect(removeListener).toHaveBeenCalledTimes(1)
    })
  })

  describe("useGeminiPromptsQuery hook", () => {
    it("fetches prompts via TanStack Query and allows refreshPrompts", async () => {
      vi.stubGlobal("chrome", {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({
            ok: true,
            prompts: [
              {
                _id: "q1",
                title: "Query Prompt",
                body: "Hello from query",
                tags: []
              }
            ],
            isAuthenticated: true,
            theme: "dark"
          })
        }
      })

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } }
      })
      const wrapper: React.FC<{ children: React.ReactNode }> = ({
        children
      }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(
        () => useGeminiPromptsQuery({ enabled: true }),
        {
          wrapper
        }
      )

      await waitFor(() => {
        expect(result.current.prompts).toHaveLength(1)
      })

      expect(result.current.prompts[0].title).toBe("Query Prompt")
      expect(result.current.isAuthenticated).toBe(true)

      // Test refreshPrompts
      await act(async () => {
        await result.current.refreshPrompts()
      })

      expect(result.current.prompts).toHaveLength(1)
    })
  })
})
