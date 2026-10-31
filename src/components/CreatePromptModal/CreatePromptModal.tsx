import React, { useState } from "react"
import { MdClose } from "react-icons/md"
import * as z from "zod"

import IconPicker from "~src/components/IconPicker/IconPicker"
import TemplateHighlight from "~src/components/TemplateHighlight/TemplateHighlight"
import Btn from "~src/components/ui/Btn/Btn"
import { createPrompt, invalidatePromptsCache } from "~src/prompts-api"
import { enqueueCreatePrompt, generateTempId, scheduleSync } from "~src/services/sync.service"
import { getStoredPrompts, saveStoredPrompts } from "~src/services/sync-storage"
import type { IPrompt } from "~src/types"
import { GUEST_MODE_STORAGE_KEY } from "~src/utils/auth"
import { DEFAULT_PROMPT_ICON_ID, setPromptIcon } from "~src/utils/prompt-icons"
import { hasTemplateVariables } from "~src/utils/template"
import { createPromptSchema } from "~src/validation/prompt-validation"

import css from "./CreatePromptModal.module.scss"

interface CreatePromptModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export default function CreatePromptModal({
  isOpen,
  onClose,
  onCreated
}: CreatePromptModalProps) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [customTagsInput, setCustomTagsInput] = useState("")
  const [selectedIcon, setSelectedIcon] = useState<string>(DEFAULT_PROMPT_ICON_ID)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) {
    return null
  }

  const resetForm = () => {
    setTitle("")
    setBody("")
    setCustomTagsInput("")
    setSelectedIcon(DEFAULT_PROMPT_ICON_ID)
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleCreatePrompt = async () => {
    if (isSubmitting) {
      return
    }
    setError(null)
    setIsSubmitting(true)

    const tags = Array.from(
      new Set(
        customTagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    )

    try {
      const iconToSave = selectedIcon || DEFAULT_PROMPT_ICON_ID
      const isGuest =
        typeof window !== "undefined" &&
        window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true"

      // Always validate via schema so empty title/body errors display
      createPromptSchema.parse({
        title,
        body,
        tags,
        icon: iconToSave
      })

      let createdViaRest = false
      if (!isGuest) {
        try {
          await createPrompt({
            title,
            body,
            tags,
            icon: iconToSave
          })
          createdViaRest = true
        } catch (apiErr) {
          if (apiErr instanceof z.ZodError) {
            throw apiErr
          }
          const msg = apiErr instanceof Error ? apiErr.message : String(apiErr)
          const isNetworkError =
            msg.includes("Network down") ||
            msg.includes("NetworkError") ||
            msg.includes("Failed to fetch") ||
            msg.toLowerCase().includes("offline") ||
            (typeof navigator !== "undefined" && !navigator.onLine)
          if (!isNetworkError) {
            throw apiErr
          }
        }
      }

      if (!createdViaRest) {
        await enqueueCreatePrompt({
          title,
          body,
          tags,
          icon: iconToSave
        })
        scheduleSync(1500)
      } else {
        const tempId = generateTempId()
        const now = new Date().toISOString()
        const newPrompt: IPrompt = {
          _id: tempId,
          id: tempId,
          clientTempId: tempId,
          title: title.trim(),
          body,
          tags,
          icon: iconToSave,
          access: "private",
          createdAt: now,
          updatedAt: now
        }
        const existing = await getStoredPrompts()
        await saveStoredPrompts([newPrompt, ...existing])
      }
      await setPromptIcon(title.trim(), iconToSave)
      invalidatePromptsCache()
      resetForm()
      onCreated?.()
      onClose()
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message || "Validation error")
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to create prompt")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await handleCreatePrompt()
  }

  return (
    <div
      className={css.overlay}
      onClick={handleClose}>
      <div
        className={css.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-prompt-title">
        <div className={css.modalHeader}>
          <h2
            id="create-prompt-title"
            className={css.modalTitle}>
            New Prompt
          </h2>
          <button
            type="button"
            className={css.closeBtn}
            onClick={handleClose}
            aria-label="Close modal">
            <MdClose size={16} />
          </button>
        </div>

        <form
          className={css.form}
          onSubmit={handleSubmit}
          noValidate>
          <div className={css.fieldGroup}>
            <label
              htmlFor="prompt-title"
              className={css.label}>
              Title
            </label>
            <input
              id="prompt-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Code Review Assistant"
              className={css.input}
              maxLength={100}
              required
            />
          </div>

          <div className={css.fieldGroup}>
            <IconPicker
              value={selectedIcon}
              onChange={setSelectedIcon}
              label="Icon"
              disabled={isSubmitting}
            />
          </div>

          <div className={css.fieldGroup}>
            <label
              htmlFor="prompt-body"
              className={css.label}>
              Prompt text
            </label>
            <textarea
              id="prompt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your prompt template here (use {{variable}} for templates)..."
              className={css.textarea}
              maxLength={10000}
              required
            />
            {hasTemplateVariables(body) && (
              <div
                className={css.templatePreviewBox}
                data-testid="template-preview-box">
                <span className={css.templatePreviewLabel}>
                  Template preview:
                </span>
                <TemplateHighlight text={body} />
              </div>
            )}
          </div>

          <div className={css.fieldGroup}>
            <label
              htmlFor="prompt-custom-tags"
              className={css.label}>
              Tags
            </label>
            <input
              id="prompt-custom-tags"
              type="text"
              value={customTagsInput}
              onChange={(e) => setCustomTagsInput(e.target.value)}
              placeholder="Tags (comma separated)"
              className={css.input}
            />
          </div>

          {error && <div className={css.errorBox}>{error}</div>}

          <div className={css.actions}>
            <Btn
              type="button"
              styleType="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
              className={css.actionBtn}>
              Cancel
            </Btn>
            <Btn
              type="submit"
              styleType="primary"
              onClick={() => {}}
              disabled={isSubmitting}
              className={css.actionBtn}>
              {isSubmitting ? "Creating..." : "Create"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
