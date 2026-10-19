import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CreatePromptModal from "~src/components/CreatePromptModal/CreatePromptModal"
import ListSection from "~src/components/ListSection/ListSection"
import PromptDetailsModal from "~src/components/PromptDetailsModal/PromptDetailsModal"
import Popup from "~src/popup"
import * as promptsApiModule from "~src/prompts-api"
import type { IPrompt } from "~src/types"
import * as userApiModule from "~src/user-api"
import * as authModule from "~src/utils/auth"

const SAMPLE_PROMPT: IPrompt = {
  _id: "65f1a2b3c4d5e6f7a8b9c0d1",
  title: "TypeScript Refactoring",
  body: "Review and refactor this TypeScript code.",
  tags: ["development", "typescript"],
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-10T10:00:00.000Z")
}

describe("CreatePromptModal", () => {
  it("does not render when closed, creates prompt with preset & custom tags, handles cancel and form submit", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const createPromptSpy = vi.spyOn(promptsApiModule, "createPrompt")

    const { rerender } = render(
      <CreatePromptModal
        isOpen={false}
        onClose={onClose}
      />
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    rerender(
      <CreatePromptModal
        isOpen={true}
        onClose={onClose}
        onCreated={onCreated}
      />
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    // Validation error when submitting empty form via form submit event
    const form = screen.getByRole("dialog").querySelector("form")!
    fireEvent.submit(form)
    expect(await screen.findByText("Title is required")).toBeInTheDocument()

    // Fill title, body, add custom tags
    await user.type(screen.getByLabelText("Title"), "My Prompt")
    await user.type(
      screen.getByLabelText("Prompt text"),
      "Prompt template content"
    )
    await user.type(
      screen.getByPlaceholderText(/tags \(comma separated\)/i),
      "custom1, custom2"
    )

    // API Error handling (Error instance and non-Error fallback)
    createPromptSpy.mockRejectedValueOnce(new Error("Server error"))
    await user.click(screen.getByRole("button", { name: "Create" }))
    expect(await screen.findByText("Server error")).toBeInTheDocument()

    createPromptSpy.mockRejectedValueOnce("raw failure")
    await user.click(screen.getByRole("button", { name: "Create" }))
    expect(
      await screen.findByText("Failed to create prompt")
    ).toBeInTheDocument()

    // Click Cancel button -> calls handleClose
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)

    // Re-fill and succeed
    await user.type(screen.getByLabelText("Title"), "My Prompt")
    await user.type(
      screen.getByLabelText("Prompt text"),
      "Prompt template content"
    )
    await user.type(
      screen.getByPlaceholderText(/tags \(comma separated\)/i),
      "typescript, frontend"
    )
    createPromptSpy.mockResolvedValueOnce({ message: "Created" })
    await user.click(screen.getByRole("button", { name: "Create" }))

    expect(createPromptSpy).toHaveBeenLastCalledWith({
      title: "My Prompt",
      body: "Prompt template content",
      tags: ["typescript", "frontend"],
      icon: "sparkles"
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it("displays template preview box when body contains template variables", () => {
    render(
      <CreatePromptModal
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByTestId("template-preview-box")).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Prompt text"), {
      target: { value: "Generate {{lang}} code for {{task}}" }
    })

    expect(screen.getByTestId("template-preview-box")).toBeInTheDocument()
    expect(screen.getByTestId("template-variable-lang")).toBeInTheDocument()
    expect(screen.getByTestId("template-variable-task")).toBeInTheDocument()
  })
})

describe("PromptDetailsModal", () => {
  it("displays prompt details, copies body, and edits title, tags, and body individually", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onUpdated = vi.fn()
    const onDeleted = vi.fn()

    const updateTitleSpy = vi
      .spyOn(promptsApiModule, "updatePromptTitle")
      .mockResolvedValue({ message: "Updated title" })
    const updateTagsSpy = vi
      .spyOn(promptsApiModule, "updatePromptTags")
      .mockResolvedValue({ message: "Updated tags" })
    const updateBodySpy = vi
      .spyOn(promptsApiModule, "updatePromptBody")
      .mockResolvedValue({ message: "Updated body" })
    const deletePromptSpy = vi
      .spyOn(promptsApiModule, "deletePrompt")
      .mockResolvedValue({ message: "Deleted" })
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <PromptDetailsModal
        prompt={SAMPLE_PROMPT}
        isOpen={true}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    )

    expect(screen.getByText("TypeScript Refactoring")).toBeInTheDocument()
    expect(
      screen.getByText("Review and refactor this TypeScript code.")
    ).toBeInTheDocument()
    expect(screen.getByText("development")).toBeInTheDocument()
    expect(screen.getByText("typescript")).toBeInTheDocument()

    // Copy prompt body
    await user.click(screen.getByRole("button", { name: /copy/i }))
    expect(writeTextSpy).toHaveBeenCalledWith(
      "Review and refactor this TypeScript code."
    )
    expect(await screen.findByText("Copied!")).toBeInTheDocument()

    // Edit title
    await user.click(screen.getByRole("button", { name: /edit title/i }))
    const titleInput = screen.getByPlaceholderText("Prompt title")
    await user.clear(titleInput)
    await user.type(titleInput, "Updated TS Prompt")
    await user.click(screen.getByRole("button", { name: /save title/i }))

    expect(updateTitleSpy).toHaveBeenCalledWith({
      promptId: SAMPLE_PROMPT._id,
      title: "Updated TS Prompt"
    })
    expect(await screen.findByText("Updated TS Prompt")).toBeInTheDocument()

    // Edit tags via custom tags input
    await user.click(screen.getByRole("button", { name: /edit tags/i }))
    const customTagsInput = screen.getByPlaceholderText(
      /tags \(comma separated\)/i
    )
    await user.clear(customTagsInput)
    await user.type(customTagsInput, "architecture, clean-code")
    await user.click(screen.getByRole("button", { name: /save tags/i }))

    expect(updateTagsSpy).toHaveBeenCalledWith({
      promptId: SAMPLE_PROMPT._id,
      tags: ["architecture", "clean-code"]
    })
    expect(await screen.findByText("clean-code")).toBeInTheDocument()

    // Edit prompt body
    await user.click(screen.getByRole("button", { name: /edit prompt/i }))
    const bodyTextarea = screen.getByPlaceholderText(
      /write your prompt template/i
    )
    await user.clear(bodyTextarea)
    await user.type(bodyTextarea, "New prompt body instructions")
    await user.click(screen.getByRole("button", { name: /save prompt/i }))

    expect(updateBodySpy).toHaveBeenCalledWith({
      promptId: SAMPLE_PROMPT._id,
      body: "New prompt body instructions"
    })
    expect(
      await screen.findByText("New prompt body instructions")
    ).toBeInTheDocument()

    // Open delete confirmation, cancel it first, then confirm delete
    await user.click(screen.getByRole("button", { name: /^delete$/i }))
    expect(
      screen.getByText(/are you sure you want to delete this prompt/i)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(
      screen.queryByText(/are you sure you want to delete this prompt/i)
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^delete$/i }))
    await user.click(screen.getByRole("button", { name: /confirm delete/i }))

    expect(deletePromptSpy).toHaveBeenCalledWith({
      promptId: SAMPLE_PROMPT._id
    })
    expect(onDeleted).toHaveBeenCalledWith(SAMPLE_PROMPT._id)
    expect(onClose).toHaveBeenCalled()
  })

  it("supports cancelling all edit sections, saving multiple open edits, and handling errors", async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()

    const updateTitleSpy = vi
      .spyOn(promptsApiModule, "updatePromptTitle")
      .mockResolvedValue({ message: "OK" })
    const updateTagsSpy = vi
      .spyOn(promptsApiModule, "updatePromptTags")
      .mockResolvedValue({ message: "OK" })
    const updateBodySpy = vi
      .spyOn(promptsApiModule, "updatePromptBody")
      .mockResolvedValue({ message: "OK" })

    render(
      <PromptDetailsModal
        prompt={{ ...SAMPLE_PROMPT, tags: [] }}
        isOpen={true}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    expect(screen.getByText("No tags")).toBeInTheDocument()

    // Open and cancel Title, Tags, and Body edits
    await user.click(screen.getByRole("button", { name: /edit title/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await user.click(screen.getByRole("button", { name: /edit tags/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    await user.click(screen.getByRole("button", { name: /edit prompt/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    // Error handling when saving title fails
    updateTitleSpy.mockRejectedValueOnce(new Error("Title update failed"))
    await user.click(screen.getByRole("button", { name: /edit title/i }))
    await user.click(screen.getByRole("button", { name: /save title/i }))
    expect(await screen.findByText("Title update failed")).toBeInTheDocument()

    // Open all 3 edit sections and click footer "Save changes"
    await user.click(screen.getByRole("button", { name: /edit tags/i }))
    await user.click(screen.getByRole("button", { name: /edit prompt/i }))

    await user.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => {
      expect(updateTitleSpy).toHaveBeenCalled()
      expect(updateTagsSpy).toHaveBeenCalled()
      expect(updateBodySpy).toHaveBeenCalled()
      expect(onUpdated).toHaveBeenCalled()
    })
  })

  it("renders template variable highlights in details view and edit mode preview", async () => {
    const user = userEvent.setup()
    const templatePrompt: IPrompt = {
      ...SAMPLE_PROMPT,
      body: "Refactor this {{component}} in {{framework}}"
    }

    render(
      <PromptDetailsModal
        prompt={templatePrompt}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(
      screen.getByTestId("template-variable-component")
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("template-variable-framework")
    ).toBeInTheDocument()

    // Switch to editing body
    await user.click(screen.getByRole("button", { name: /edit prompt/i }))
    expect(screen.getByTestId("template-preview-box")).toBeInTheDocument()
  })
})

describe("ListSection & Popup Integration", () => {
  beforeEach(() => {
    authModule.clearAccessToken()
    authModule.clearRefreshToken()
    promptsApiModule.invalidatePromptsCache()
    window.localStorage.clear()
  })

  it("renders ListSection, filters by searchQuery, opens details modal, and updates/deletes item", async () => {
    const user = userEvent.setup()
    vi.spyOn(promptsApiModule, "updatePromptTitle").mockResolvedValue({
      message: "Updated"
    })
    vi.spyOn(promptsApiModule, "deletePrompt").mockResolvedValue({
      message: "Deleted"
    })

    const prompts: IPrompt[] = [
      SAMPLE_PROMPT,
      {
        _id: "65f1a2b3c4d5e6f7a8b9c0d2",
        title: "Daily Planner",
        body: "Plan my day",
        tags: ["daily"]
      }
    ]

    const { rerender } = render(
      <ListSection
        prompts={prompts}
        searchQuery=""
      />
    )

    expect(screen.getByText("TypeScript Refactoring")).toBeInTheDocument()
    expect(screen.getByText("Daily Planner")).toBeInTheDocument()

    // Filter by search query (including #tag syntax)
    rerender(
      <ListSection
        prompts={prompts}
        searchQuery="#daily planner"
      />
    )
    expect(screen.queryByText("TypeScript Refactoring")).not.toBeInTheDocument()
    expect(screen.getByText("Daily Planner")).toBeInTheDocument()

    // Empty state when no match
    const onClearFiltersMock = vi.fn()
    rerender(
      <ListSection
        prompts={prompts}
        searchQuery="non-existent-query"
        onClearFilters={onClearFiltersMock}
      />
    )
    expect(
      screen.getByText("No prompts match your search.")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /reset search/i }))
    expect(onClearFiltersMock).toHaveBeenCalled()

    // Test prompt with no tags and no _id
    const promptWithoutTags = {
      title: "Untagged Prompt",
      body: "Body without tags"
    } as unknown as IPrompt
    rerender(
      <ListSection
        prompts={[...prompts, promptWithoutTags]}
        searchQuery=""
      />
    )
    expect(screen.getByText("Untagged Prompt")).toBeInTheDocument()

    // Filter by clicking tag chip
    rerender(
      <ListSection
        prompts={prompts}
        searchQuery=""
      />
    )
    await user.click(screen.getByRole("button", { name: "#daily" }))
    expect(screen.queryByText("TypeScript Refactoring")).not.toBeInTheDocument()
    // Reset via All button
    await user.click(screen.getByRole("button", { name: "All" }))
    expect(screen.getByText("TypeScript Refactoring")).toBeInTheDocument()
    expect(screen.getByText("Daily Planner")).toBeInTheDocument()

    // Test sorting dropdown interactions
    const sortButton = screen.getByRole("button", { name: /sort prompts/i })
    expect(sortButton).toBeInTheDocument()
    await user.click(sortButton)
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    // Test Escape key closes dropdown
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    // Test outside click closes dropdown
    await user.click(sortButton)
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    // Reopen and select Alphabetical (A → Z)
    await user.click(sortButton)
    await user.click(screen.getByRole("button", { name: /alphabetical \(a → z\)/i }))
    const cardHeadings = screen.getAllByRole("heading", { level: 3 })
    expect(cardHeadings[0]).toHaveTextContent("Daily Planner")
    expect(cardHeadings[1]).toHaveTextContent("TypeScript Refactoring")

    // Open details modal, update title, then delete
    rerender(
      <ListSection
        prompts={prompts}
        searchQuery=""
      />
    )
    await user.click(screen.getByText("TypeScript Refactoring"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /edit title/i }))
    const titleInput = screen.getByPlaceholderText("Prompt title")
    await user.clear(titleInput)
    await user.type(titleInput, "Renamed TS Prompt")
    await user.click(screen.getByRole("button", { name: /save title/i }))

    await waitFor(() => {
      expect(screen.getAllByText("Renamed TS Prompt").length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole("button", { name: /^delete$/i }))
    await user.click(screen.getByRole("button", { name: /confirm delete/i }))

    await waitFor(() => {
      expect(screen.queryByText("Renamed TS Prompt")).not.toBeInTheDocument()
    })
  })

  it("renders Popup in unauthenticated and authenticated states and handles modals", async () => {
    const user = userEvent.setup()
    vi.spyOn(promptsApiModule, "fetchPrompts").mockResolvedValue([
      SAMPLE_PROMPT
    ])

    render(<Popup />)

    // Unauthenticated initially -> shows AuthForm
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument()

    // Authenticate via token change wrapped in act
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    const payload = btoa(
      JSON.stringify({
        email: "user@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    )
    act(() => {
      authModule.setAccessToken(`${header}.${payload}.sig`)
    })

    expect(
      await screen.findByText("TypeScript Refactoring")
    ).toBeInTheDocument()

    // Trigger cache invalidation subscription in ListSection
    act(() => {
      promptsApiModule.invalidatePromptsCache()
    })

    // Search prompts from Popup SearchField and reset via Reset search button
    const searchInput = screen.getByRole("textbox", { name: /search prompts/i })
    await user.type(searchInput, "NoMatchingPrompt")
    expect(
      screen.getByText("No prompts match your search.")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /reset search/i }))
    expect(screen.getByText("TypeScript Refactoring")).toBeInTheDocument()
    expect(searchInput).toHaveValue("")

    // Open and close CreatePromptModal from AddNewBtn
    await user.click(screen.getByRole("button", { name: /create new prompt/i }))
    expect(
      screen.getByRole("heading", { name: "New Prompt" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /close modal/i }))
    expect(
      screen.queryByRole("heading", { name: "New Prompt" })
    ).not.toBeInTheDocument()

    // Open SettingsPage via Header settings button, test theme segment control and backend connection
    await user.click(screen.getByRole("button", { name: /settings/i }))
    const settingsHeading = screen.getByRole("heading", { name: "Settings" })
    expect(settingsHeading).toBeInTheDocument()
    expect(screen.queryByText("Server Connection")).not.toBeInTheDocument()
    expect(screen.queryByTestId("backend-badge")).not.toBeInTheDocument()

    // 5 clicks on Settings heading reveal Server Connection and BackendBadge
    for (let i = 0; i < 5; i++) {
      await user.click(settingsHeading)
    }
    expect(screen.getByText("Server Connection")).toBeInTheDocument()
    expect(screen.getByTestId("backend-badge")).toBeInTheDocument()

    // Test Auto / Dark / Light segment buttons
    const darkSegmentBtn = screen.getByRole("button", { name: "Dark" })
    await user.click(darkSegmentBtn)
    expect(darkSegmentBtn).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Dark mode is enabled")).toBeInTheDocument()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(window.localStorage.getItem("templagem_theme")).toBe("dark")

    const lightSegmentBtn = screen.getByRole("button", { name: "Light" })
    await user.click(lightSegmentBtn)
    expect(lightSegmentBtn).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Light mode is enabled")).toBeInTheDocument()
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(window.localStorage.getItem("templagem_theme")).toBe("light")

    const autoSegmentBtn = screen.getByRole("button", { name: "Auto" })
    await user.click(autoSegmentBtn)
    expect(autoSegmentBtn).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/System \(/)).toBeInTheDocument()

    // Open Delete all prompts confirmation modal, cancel, then re-open, handle error, and confirm
    await user.click(
      screen.getByRole("button", { name: /delete all prompts/i })
    )
    expect(
      screen.getByRole("dialog", { name: /delete all prompts\?/i })
    ).toBeInTheDocument()

    // Cancel modal
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(
      screen.queryByRole("dialog", { name: /delete all prompts\?/i })
    ).not.toBeInTheDocument()

    // Re-open modal and test error handling then success
    await user.click(
      screen.getByRole("button", { name: /delete all prompts/i })
    )
    const deleteAllSpy = vi.spyOn(promptsApiModule, "deleteAllPrompts")
    deleteAllSpy.mockRejectedValueOnce(new Error("Delete all failed"))

    await user.click(
      screen.getByRole("button", { name: /confirm delete all/i })
    )
    expect(await screen.findByText("Delete all failed")).toBeInTheDocument()

    deleteAllSpy.mockResolvedValueOnce({ message: "All prompts deleted" })
    await user.click(
      screen.getByRole("button", { name: /confirm delete all/i })
    )
    expect(
      await screen.findByText("All prompts have been deleted.")
    ).toBeInTheDocument()
    expect(deleteAllSpy).toHaveBeenCalledTimes(2)

    // Open Delete account modal, cancel, then re-open, test validation error, API error, and success
    await user.click(screen.getByRole("button", { name: /delete account/i }))
    expect(
      screen.getByRole("dialog", { name: /delete account\?/i })
    ).toBeInTheDocument()

    // Cancel Delete account modal
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(
      screen.queryByRole("dialog", { name: /delete account\?/i })
    ).not.toBeInTheDocument()

    // Re-open Delete account modal
    await user.click(screen.getByRole("button", { name: /delete account/i }))

    // Submit with invalid password -> triggers ZodError via deleteUser
    await user.type(screen.getByLabelText(/password/i), "short")
    await user.click(
      screen.getByRole("button", { name: /confirm delete account/i })
    )
    expect(
      await screen.findByText(/password must be at least 8 characters/i)
    ).toBeInTheDocument()

    // Enter valid password, test API error, then success
    const deleteUserSpy = vi.spyOn(userApiModule, "deleteUser")
    deleteUserSpy.mockRejectedValueOnce(new Error("Incorrect password"))

    const passwordInput = screen.getByLabelText(/password/i)
    await user.clear(passwordInput)
    await user.type(passwordInput, "ValidPass1!")
    await user.click(
      screen.getByRole("button", { name: /confirm delete account/i })
    )
    expect(await screen.findByText("Incorrect password")).toBeInTheDocument()

    // Succeed deleting account -> closes SettingsPage
    deleteUserSpy.mockResolvedValueOnce({ message: "Account deleted" })
    await user.click(
      screen.getByRole("button", { name: /confirm delete account/i })
    )
    expect(deleteUserSpy).toHaveBeenLastCalledWith({ password: "ValidPass1!" })

    // Re-open SettingsPage and sign out
    await user.click(screen.getByRole("button", { name: /settings/i }))
    vi.spyOn(authModule, "logout").mockImplementation(async () => {
      authModule.clearAccessToken()
      authModule.clearRefreshToken()
      return { message: "Logged out" }
    })
    await user.click(screen.getByRole("button", { name: /sign out/i }))
    expect(
      await screen.findByRole("button", { name: /create account/i })
    ).toBeInTheDocument()
  })
})
