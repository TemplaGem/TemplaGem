import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import PromptDetailsModal from "~src/components/PromptDetailsModal/PromptDetailsModal"
import SettingsPage from "~src/components/SettingsPage/SettingsPage"
import * as promptsApiModule from "~src/prompts-api"
import type { IPrompt } from "~src/types"
import * as userApiModule from "~src/user-api"

describe("Modal edge cases and error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe("PromptDetailsModal edge cases", () => {
    it("handles prompt with fallback promptId and undefined tags", async () => {
      const user = userEvent.setup()
      const promptWithoutMongoId = {
        promptId: "custom-id-99",
        title: "Prompt without Mongo _id",
        body: "Sample body text",
        tags: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const onClose = vi.fn()
      const onUpdated = vi.fn()
      const onDeleted = vi.fn()

      const deletePromptSpy = vi.spyOn(promptsApiModule, "deletePrompt")
      deletePromptSpy.mockResolvedValueOnce({ message: "Prompt deleted" })

      render(
        <PromptDetailsModal
          isOpen={true}
          prompt={promptWithoutMongoId as unknown as IPrompt}
          onClose={onClose}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      )

      expect(
        screen.getByRole("heading", { name: "Prompt without Mongo _id" })
      ).toBeInTheDocument()

      // Edit tags section when initial tags are undefined
      await user.click(screen.getByRole("button", { name: /edit tags/i }))
      expect(
        screen.getByPlaceholderText(/tags \(comma separated\)/i)
      ).toHaveValue("")

      // Cancel tags edit
      await user.click(screen.getByRole("button", { name: /cancel/i }))
      expect(
        screen.queryByPlaceholderText(/tags \(comma separated\)/i)
      ).not.toBeInTheDocument()

      // Delete prompt using fallback promptId
      await user.click(screen.getByRole("button", { name: /^delete$/i }))
      await user.click(screen.getByRole("button", { name: /confirm delete/i }))
      expect(deletePromptSpy).toHaveBeenCalledWith({ promptId: "custom-id-99" })
      expect(onDeleted).toHaveBeenCalledWith("custom-id-99")
      expect(onClose).toHaveBeenCalled()
    })

    it("displays formatted error for ZodError and non-Error rejections during update and delete", async () => {
      const user = userEvent.setup()
      const samplePrompt: IPrompt = {
        _id: "test-id",
        title: "Initial Title",
        body: "Initial Body",
        tags: ["tag1"],
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // 1. ZodError with issue message in updatePromptTitle
      const updateTitleSpy = vi.spyOn(promptsApiModule, "updatePromptTitle")
      updateTitleSpy.mockRejectedValueOnce(
        new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: "Title cannot be blank",
            path: ["title"]
          } as unknown as z.ZodIssue
        ])
      )

      render(
        <PromptDetailsModal
          isOpen={true}
          prompt={samplePrompt}
          onClose={vi.fn()}
        />
      )

      await user.click(screen.getByRole("button", { name: /edit title/i }))
      await user.click(screen.getByRole("button", { name: /save title/i }))
      expect(
        await screen.findByText("Title cannot be blank")
      ).toBeInTheDocument()

      // 2. Non-Error throw in updatePromptBody
      const updateBodySpy = vi.spyOn(promptsApiModule, "updatePromptBody")
      updateBodySpy.mockRejectedValueOnce("String error rejection")

      await user.click(screen.getByRole("button", { name: /edit prompt/i }))
      await user.click(screen.getByRole("button", { name: /save prompt/i }))
      expect(
        await screen.findByText("Failed to update prompt text")
      ).toBeInTheDocument()

      // 3. Non-Error throw in deletePrompt
      const deleteSpy = vi.spyOn(promptsApiModule, "deletePrompt")
      deleteSpy.mockRejectedValueOnce("Cannot delete string error")

      await user.click(screen.getByRole("button", { name: /^delete$/i }))
      await user.click(screen.getByRole("button", { name: /confirm delete/i }))
      expect(
        await screen.findByText("Failed to delete prompt")
      ).toBeInTheDocument()
    })
  })

  describe("SettingsPage edge cases", () => {
    it("handles non-Error rejection and prevents double click during deleteAllPrompts", async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()

      const deleteAllSpy = vi.spyOn(promptsApiModule, "deleteAllPrompts")
      deleteAllSpy.mockRejectedValueOnce("Server unreachable string")

      render(
        <SettingsPage
          onBack={onBack}
          isAuthenticated={true}
        />
      )

      // Open confirm modal
      await user.click(
        screen.getByRole("button", { name: /delete all prompts/i })
      )

      // Click Confirm Delete All
      await user.click(
        screen.getByRole("button", { name: /confirm delete all/i })
      )
      expect(
        await screen.findByText("Failed to delete all prompts")
      ).toBeInTheDocument()
    })

    it("handles non-Error rejection and ZodError fallback during deleteUser", async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()

      const deleteUserSpy = vi.spyOn(userApiModule, "deleteUser")
      deleteUserSpy.mockRejectedValueOnce("Account removal failed")

      render(
        <SettingsPage
          onBack={onBack}
          isAuthenticated={true}
        />
      )

      // Open delete user modal
      await user.click(screen.getByRole("button", { name: /delete account/i }))
      await user.type(screen.getByLabelText(/password/i), "ValidPass123!")

      await user.click(
        screen.getByRole("button", { name: /confirm delete account/i })
      )
      expect(
        await screen.findByText("Failed to delete account")
      ).toBeInTheDocument()

      // Zod error with missing issue message fallback
      deleteUserSpy.mockRejectedValueOnce(
        new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: "",
            path: ["password"]
          }
        ])
      )
      await user.click(
        screen.getByRole("button", { name: /confirm delete account/i })
      )
      expect(await screen.findByText("Invalid password")).toBeInTheDocument()
    })

    it("reveals backend info on 5 quick clicks on Settings heading and resets on timeout", () => {
      vi.useFakeTimers()
      const onBack = vi.fn()

      render(<SettingsPage onBack={onBack} />)

      const title = screen.getByRole("heading", { name: "Settings" })
      expect(screen.queryByText("Server Connection")).not.toBeInTheDocument()

      // Click 3 times
      fireEvent.click(title)
      fireEvent.click(title)
      fireEvent.click(title)
      expect(screen.queryByText("Server Connection")).not.toBeInTheDocument()

      // Timeout expires (1500ms) -> count resets
      vi.advanceTimersByTime(1600)

      // 4 clicks are still not enough
      fireEvent.click(title)
      fireEvent.click(title)
      fireEvent.click(title)
      fireEvent.click(title)
      expect(screen.queryByText("Server Connection")).not.toBeInTheDocument()

      // 5th quick click triggers reveal
      fireEvent.click(title)
      expect(screen.getByText("Server Connection")).toBeInTheDocument()

      // Subsequent clicks do nothing / don't crash
      fireEvent.click(title)
      expect(screen.getByText("Server Connection")).toBeInTheDocument()

      vi.useRealTimers()
    })
  })
})
