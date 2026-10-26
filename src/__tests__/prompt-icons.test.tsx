import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CreatePromptModal from "~src/components/CreatePromptModal/CreatePromptModal"
import IconPicker from "~src/components/IconPicker/IconPicker"
import PromptDetailsModal from "~src/components/PromptDetailsModal/PromptDetailsModal"
import PromptIcon from "~src/components/PromptIcon/PromptIcon"
import * as promptsApiModule from "~src/prompts-api"
import type { IPrompt } from "~src/types"
import {
  DEFAULT_PROMPT_ICON_ID,
  getPromptIconDescriptor,
  getStoredPromptIcons,
  PROMPT_ICON_CATEGORIES,
  PROMPT_ICONS,
  PROMPT_ICONS_STORAGE_KEY,
  resolvePromptIcon,
  setPromptIcon,
  subscribePromptIcons
} from "~src/utils/prompt-icons"

describe("Prompt Icons Utility (prompt-icons.ts)", () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset in-memory map by triggering setPromptIcon or clear
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.clear?.()
    }
  })

  it("exports valid icon descriptors and categories list", () => {
    expect(PROMPT_ICONS.length).toBeGreaterThan(20)
    expect(PROMPT_ICON_CATEGORIES).toContain("All")
    expect(PROMPT_ICON_CATEGORIES).toContain("AI & Tech")

    const sparkles = getPromptIconDescriptor("sparkles")
    expect(sparkles).toBeDefined()
    expect(sparkles?.name).toBe("Sparkles")
    expect(sparkles?.color).toBe("blue")

    expect(getPromptIconDescriptor("non_existent_icon_xyz")).toBeUndefined()
    expect(getPromptIconDescriptor(undefined)).toBeUndefined()
  })

  it("handles stored prompt icons and falls back gracefully on corrupted storage", () => {
    localStorage.setItem("templagem_prompt_icons", "{ invalid json")
    const icons = getStoredPromptIcons()
    expect(icons).toEqual({})
  })

  it("stores and subscribes to prompt icon changes across storage and memory", async () => {
    const listener = vi.fn()
    const unsubscribe = subscribePromptIcons(listener)

    await setPromptIcon("prompt-123", "terminal")
    expect(listener).toHaveBeenCalled()
    expect(getStoredPromptIcons()["prompt-123"]).toBe("terminal")

    unsubscribe()
    await setPromptIcon("prompt-456", "rocket")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("resolves prompt icons by icon property, id, title, tags and fallback", async () => {
    expect(resolvePromptIcon(null)).toBe(DEFAULT_PROMPT_ICON_ID)
    expect(resolvePromptIcon(undefined)).toBe(DEFAULT_PROMPT_ICON_ID)

    // 1. Direct prompt.icon
    expect(resolvePromptIcon({ icon: "terminal" })).toBe("terminal")
    expect(resolvePromptIcon({ icon: "INVALID_ICON" })).toBe(
      DEFAULT_PROMPT_ICON_ID
    )

    // 2. Storage lookup by _id / id / promptId
    await setPromptIcon("id-1", "rocket")
    expect(resolvePromptIcon({ _id: "id-1" } as IPrompt)).toBe("rocket")
    expect(
      resolvePromptIcon({ id: "id-1" } as unknown as Partial<IPrompt>)
    ).toBe("rocket")
    expect(
      resolvePromptIcon({ promptId: "id-1" } as unknown as Partial<IPrompt>)
    ).toBe("rocket")

    // 3. Storage lookup by title
    await setPromptIcon("My Custom Title", "zap")
    expect(resolvePromptIcon({ title: "My Custom Title" })).toBe("zap")

    // 4. Tags with "icon:<id>" or direct icon names
    expect(resolvePromptIcon({ tags: ["icon:code"] })).toBe("code")
    expect(resolvePromptIcon({ tags: ["flame"] })).toBe("flame")
    expect(resolvePromptIcon({ tags: ["unknown-tag", "icon:invalid"] })).toBe(
      DEFAULT_PROMPT_ICON_ID
    )

    // Test invalid JSON in localStorage for getStoredPromptIcons
    localStorage.setItem(PROMPT_ICONS_STORAGE_KEY, "invalid-json")
    await setPromptIcon("test", "code")
    expect(resolvePromptIcon({ _id: "test" } as IPrompt)).toBe("code")
  })
})

describe("PromptIcon Component", () => {
  it("renders Lucide icons directly by icon prop, type, or tags", () => {
    const { container: c1 } = render(<PromptIcon icon="terminal" />)
    expect(screen.getByTestId("prompt-icon-terminal")).toBeInTheDocument()
    expect(c1.querySelector("svg")).toBeInTheDocument()

    const { unmount: u2 } = render(<PromptIcon type="bot" />)
    expect(screen.getByTestId("prompt-icon-bot")).toBeInTheDocument()
    u2()

    const { unmount: u3 } = render(<PromptIcon tags={["icon:zap"]} />)
    expect(screen.getByTestId("prompt-icon-zap")).toBeInTheDocument()
    u3()

    // With custom className and size
    const { container: c4 } = render(
      <PromptIcon
        icon="rocket"
        className="wrapper-class"
        size={24}
      />
    )
    expect(c4.querySelector(".wrapper-class")).toBeInTheDocument()
  })

  it("renders legacy types and fallback when icon not in Lucide set", () => {
    const { container: legacy } = render(<PromptIcon type="daily" />)
    expect(legacy.querySelector("svg")).toBeInTheDocument()

    const { container: fallback } = render(
      <PromptIcon
        type="other"
        className="legacy-wrapper"
      />
    )
    expect(fallback.querySelector(".legacy-wrapper")).toBeInTheDocument()
  })
})

describe("IconPicker Component", () => {
  it("renders in standard and compact modes and toggles modal", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    const { rerender } = render(
      <IconPicker
        value="sparkles"
        onChange={onChange}
        label="Select Prompt Icon"
      />
    )

    expect(screen.getByText("Select Prompt Icon")).toBeInTheDocument()
    expect(screen.getByText("Sparkles")).toBeInTheDocument()

    // Compact mode
    rerender(
      <IconPicker
        value="sparkles"
        onChange={onChange}
        compact
      />
    )
    expect(screen.queryByText("Select Prompt Icon")).not.toBeInTheDocument()

    // Open modal
    const trigger = screen.getByTestId("icon-picker-trigger")
    await user.click(trigger)
    expect(screen.getByTestId("icon-picker-modal")).toBeInTheDocument()

    // Close modal via close button
    const closeBtn = screen.getByRole("button", { name: /close icon picker/i })
    await user.click(closeBtn)
    expect(screen.queryByTestId("icon-picker-modal")).not.toBeInTheDocument()

    // Reopen and close via overlay
    await user.click(trigger)
    expect(screen.getByTestId("icon-picker-modal")).toBeInTheDocument()
    const overlay = screen.getByRole("presentation")
    fireEvent.click(overlay)
    expect(screen.queryByTestId("icon-picker-modal")).not.toBeInTheDocument()
  })

  it("filters icons by category tabs and search input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <IconPicker
        value="sparkles"
        onChange={onChange}
      />
    )

    await user.click(screen.getByTestId("icon-picker-trigger"))
    expect(screen.getByTestId("icon-picker-modal")).toBeInTheDocument()

    // Click category tab "AI & Tech"
    const aiCategoryTab = screen.getByRole("button", { name: "AI & Tech" })
    await user.click(aiCategoryTab)
    expect(screen.getByTestId("icon-tile-bot")).toBeInTheDocument()

    // Search input
    const searchInput = screen.getByRole("textbox", { name: /search icons/i })
    await user.type(searchInput, "terminal")
    expect(screen.getByTestId("icon-tile-terminal")).toBeInTheDocument()

    // Clear search button
    const clearBtn = screen.getByRole("button", { name: /clear search/i })
    await user.click(clearBtn)
    expect(searchInput).toHaveValue("")

    // Search with non-matching query -> empty state
    await user.type(searchInput, "nonexistent9999999")
    expect(screen.getByText("No icons found")).toBeInTheDocument()
  })

  it("selects an icon and triggers onChange callback", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <IconPicker
        value="sparkles"
        onChange={onChange}
      />
    )

    await user.click(screen.getByTestId("icon-picker-trigger"))
    const rocketTile = screen.getByTestId("icon-tile-rocket")
    await user.click(rocketTile)

    expect(onChange).toHaveBeenCalledWith("rocket")
    expect(screen.queryByTestId("icon-picker-modal")).not.toBeInTheDocument()
  })
})

describe("Icon Selection in Modals", () => {
  it("allows selecting an icon when creating a prompt in CreatePromptModal", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const createPromptSpy = vi
      .spyOn(promptsApiModule, "createPrompt")
      .mockResolvedValueOnce({
        message: "Prompt created successfully"
      })

    render(
      <CreatePromptModal
        isOpen={true}
        onClose={onClose}
        onCreated={onCreated}
      />
    )

    // Open icon picker and select "rocket"
    await user.click(screen.getByTestId("icon-picker-trigger"))
    await user.click(screen.getByTestId("icon-tile-rocket"))

    // Fill title and body
    await user.type(screen.getByLabelText("Title"), "Icon Assistant")
    await user.type(screen.getByLabelText("Prompt text"), "Prompt text")

    // Submit form
    await user.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(createPromptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Icon Assistant",
          body: "Prompt text",
          icon: "rocket"
        })
      )
    })
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("allows changing an icon in PromptDetailsModal and triggers onUpdated", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onUpdated = vi.fn()
    const updateIconSpy = vi
      .spyOn(promptsApiModule, "updatePromptIcon")
      .mockResolvedValueOnce({ message: "Icon updated" })

    const samplePrompt: IPrompt = {
      _id: "65f1a2b3c4d5e6f7a8b9c0d1",
      title: "Detail Prompt",
      body: "Some prompt body",
      tags: ["general"],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    render(
      <PromptDetailsModal
        prompt={samplePrompt}
        isOpen={true}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    )

    // Click compact icon trigger in header
    const iconTrigger = screen.getByTestId("icon-picker-trigger")
    await user.click(iconTrigger)
    expect(screen.getByTestId("icon-picker-modal")).toBeInTheDocument()

    // Select "zap"
    await user.click(screen.getByTestId("icon-tile-zap"))

    await waitFor(() => {
      expect(updateIconSpy).toHaveBeenCalledWith({
        promptId: "65f1a2b3c4d5e6f7a8b9c0d1",
        icon: "zap"
      })
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "65f1a2b3c4d5e6f7a8b9c0d1",
          icon: "zap"
        })
      )
    })
  })
})
