import React, { useEffect, useState } from "react"
import {
  MdCheck,
  MdClose,
  MdContentCopy,
  MdDeleteOutline,
  MdEdit
} from "react-icons/md"
import * as z from "zod"

import IconPicker from "~src/components/IconPicker/IconPicker"
import TemplateHighlight from "~src/components/TemplateHighlight/TemplateHighlight"
import Btn from "~src/components/ui/Btn/Btn"
import {
  deletePrompt,
  updatePromptBody,
  updatePromptIcon,
  updatePromptTags,
  updatePromptTitle
} from "~src/prompts-api"
import {
  enqueueDeletePrompt,
  enqueueUpdatePrompt,
  scheduleSync
} from "~src/services/sync.service"
import type { IPrompt } from "~src/types"
import { resolvePromptIcon, setPromptIcon } from "~src/utils/prompt-icons"
import { hasTemplateVariables } from "~src/utils/template"

import css from "./PromptDetailsModal.module.scss"

interface PromptDetailsModalProps {
  prompt: IPrompt | null
  isOpen: boolean
  onClose: () => void
  onUpdated?: (updatedPrompt: IPrompt) => void
  onDeleted?: (promptId: string) => void
}

function getPromptId(prompt: IPrompt): string {
  const anyPrompt = prompt as unknown as Record<string, unknown>
  const rawId = anyPrompt._id ?? anyPrompt.id ?? anyPrompt.promptId
  if (rawId !== undefined && rawId !== null) {
    if (
      typeof rawId === "object" &&
      rawId !== null &&
      "$oid" in (rawId as Record<string, unknown>)
    ) {
      return String((rawId as { $oid: string }).$oid)
    }
    return String(rawId).trim()
  }
  return ""
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof z.ZodError) return false
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes("Network down") ||
    msg.includes("NetworkError") ||
    msg.includes("Failed to fetch") ||
    msg.toLowerCase().includes("offline") ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  )
}

export default function PromptDetailsModal({
  prompt,
  isOpen,
  onClose,
  onUpdated,
  onDeleted
}: PromptDetailsModalProps) {
  const [currentPrompt, setCurrentPrompt] = useState<IPrompt | null>(prompt)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [customTagsInput, setCustomTagsInput] = useState("")

  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isSavingIcon, setIsSavingIcon] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCurrentPrompt(prompt)
    if (prompt) {
      setTitle(prompt.title)
      setBody(prompt.body)
      setCustomTagsInput((prompt.tags ?? []).join(", "))
    }
    setIsEditing(false)
    setIsConfirmingDelete(false)
    setError(null)
    setCopied(false)
  }, [prompt])

  if (!isOpen || !currentPrompt) {
    return null
  }

  const promptId = getPromptId(currentPrompt)
  const isBusy = isSaving || isSavingIcon || isDeleting

  const formatError = (err: unknown, fallback: string): string => {
    if (err instanceof z.ZodError) {
      return err.issues[0]?.message || "Validation error"
    }
    if (err instanceof Error) {
      return err.message
    }
    return fallback
  }

  const buildCombinedTags = (): string[] => {
    const customTags = customTagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
    return Array.from(new Set(customTags))
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(currentPrompt.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError("Failed to copy prompt to clipboard")
    }
  }

  const handleSaveChanges = async () => {
    if (isBusy) return
    setError(null)
    setIsSaving(true)

    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()
    const nextTags = buildCombinedTags()
    const prevTags = currentPrompt.tags ?? []

    const titleChanged = trimmedTitle !== currentPrompt.title
    const tagsChanged =
      nextTags.length !== prevTags.length ||
      nextTags.some((t, idx) => t !== prevTags[idx])
    const bodyChanged = trimmedBody !== currentPrompt.body

    let updated: IPrompt = { ...currentPrompt }

    try {
      try {
        if (titleChanged || (!tagsChanged && !bodyChanged)) {
          await updatePromptTitle({ promptId, title: trimmedTitle })
        }
        if (tagsChanged) {
          await updatePromptTags({ promptId, tags: nextTags })
        }
        if (bodyChanged) {
          await updatePromptBody({ promptId, body: trimmedBody })
        }
      } catch (networkErr) {
        if (!isNetworkError(networkErr)) {
          throw networkErr
        }
      }

      await enqueueUpdatePrompt({
        promptId,
        clientTempId: currentPrompt.clientTempId,
        title: trimmedTitle,
        body: trimmedBody,
        tags: nextTags
      }).catch(() => null)
      scheduleSync(1500)

      updated = {
        ...updated,
        title: trimmedTitle,
        body: trimmedBody,
        tags: nextTags,
        updatedAt: new Date()
      }
      setTitle(trimmedTitle)
      setBody(trimmedBody)
      setCustomTagsInput(nextTags.join(", "))
      setCurrentPrompt(updated)
      setIsEditing(false)
      onUpdated?.(updated)
    } catch (err) {
      setError(formatError(err, "Failed to save changes"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeletePrompt = async () => {
    if (isBusy) return
    setError(null)
    setIsDeleting(true)
    try {
      try {
        await deletePrompt({ promptId })
      } catch (networkErr) {
        if (!isNetworkError(networkErr)) {
          throw networkErr
        }
      }
      await enqueueDeletePrompt(promptId).catch(() => null)
      scheduleSync(1500)
      onDeleted?.(promptId)
      onClose()
    } catch (err) {
      setError(formatError(err, "Failed to delete prompt"))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancelEdit = () => {
    setTitle(currentPrompt.title)
    setBody(currentPrompt.body)
    setCustomTagsInput((currentPrompt.tags ?? []).join(", "))
    setIsEditing(false)
    setError(null)
  }

  const handleIconChange = async (newIcon: string) => {
    if (!currentPrompt || isBusy) return
    setError(null)
    setIsSavingIcon(true)
    const id = getPromptId(currentPrompt)
    try {
      if (!id) {
        throw new Error("Prompt ID is missing")
      }
      await updatePromptIcon({ promptId: id, icon: newIcon })
      await enqueueUpdatePrompt({ promptId: id, icon: newIcon }).catch(() => null)
      scheduleSync(1500)
      await setPromptIcon(id, newIcon)
      if (currentPrompt.title) {
        await setPromptIcon(currentPrompt.title, newIcon)
      }
      const updated = {
        ...currentPrompt,
        icon: newIcon,
        updatedAt: new Date()
      }
      setCurrentPrompt(updated)
      onUpdated?.(updated)
    } catch (err) {
      console.error("Failed to update icon:", err)
      setError(formatError(err, "Failed to update icon"))
    } finally {
      setIsSavingIcon(false)
    }
  }

  return (
    <div
      className={css.overlay}
      onClick={onClose}>
      <div
        className={css.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-details-title">
        {/* Header + Title Section */}
        <div className={css.modalHeader}>
          <div className={css.headerMain}>
            <IconPicker
              compact
              value={currentPrompt.icon ?? resolvePromptIcon(currentPrompt)}
              onChange={handleIconChange}
              disabled={isBusy}
            />
            <div className={css.titleDisplayRow}>
              <h2
                id="prompt-details-title"
                className={css.modalTitle}>
                {currentPrompt.title}
              </h2>
            </div>
          </div>
          <div className={css.headerRightActions}>
            {!isEditing && (
              <button
                type="button"
                className={`${css.iconActionBtn} ${css.editBtn}`}
                onClick={() => setIsEditing(true)}
                disabled={isBusy}>
                <MdEdit size={14} />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              className={css.closeBtn}
              onClick={onClose}
              aria-label="Close modal">
              <MdClose size={16} />
            </button>
          </div>
        </div>

        {/* Title Editor (when in Edit mode) */}
        {isEditing && (
          <div className={css.section}>
            <label
              htmlFor="edit-prompt-title"
              className={css.label}>
              Title
            </label>
            <input
              id="edit-prompt-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prompt title"
              className={css.input}
              maxLength={100}
              autoFocus
            />
          </div>
        )}

        {/* Tags Section */}
        <div className={css.section}>
          <div className={css.sectionHeader}>
            <label
              htmlFor={isEditing ? "edit-prompt-tags" : undefined}
              className={css.label}>
              Tags
            </label>
          </div>

          {isEditing ? (
            <input
              id="edit-prompt-tags"
              type="text"
              value={customTagsInput}
              onChange={(e) => setCustomTagsInput(e.target.value)}
              placeholder="Tags (comma separated)"
              className={css.input}
            />
          ) : (
            <div className={css.tagsList}>
              {currentPrompt.tags && currentPrompt.tags.length > 0 ? (
                currentPrompt.tags.map((tag) => (
                  <span
                    key={tag}
                    className={css.tagBadge}>
                    {tag}
                  </span>
                ))
              ) : (
                <span className={css.emptyTags}>No tags</span>
              )}
            </div>
          )}
        </div>

        {/* Prompt Body Section */}
        <div className={css.section}>
          <div className={css.sectionHeader}>
            <label
              htmlFor={isEditing ? "edit-prompt-body" : undefined}
              className={css.label}>
              Prompt Text
            </label>
            {!isEditing && (
              <div className={css.inlineActions}>
                <button
                  type="button"
                  className={`${css.iconActionBtn} ${css.copyActionBtn}`}
                  onClick={() => void handleCopyPrompt()}>
                  {copied ? <MdCheck size={14} /> : <MdContentCopy size={13} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <>
              <textarea
                id="edit-prompt-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your prompt template here..."
                className={css.textarea}
                maxLength={10000}
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
            </>
          ) : (
            <div className={css.bodyBox}>
              <TemplateHighlight text={currentPrompt.body} />
            </div>
          )}
        </div>

        {(currentPrompt.createdAt || currentPrompt.updatedAt) && (
          <div className={css.metaInfo}>
            {currentPrompt.createdAt && (
              <span>
                Created:{" "}
                {new Date(currentPrompt.createdAt).toLocaleDateString()}
              </span>
            )}
            {currentPrompt.updatedAt && (
              <span>
                Updated:{" "}
                {new Date(currentPrompt.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {error && <div className={css.errorBox}>{error}</div>}

        {isConfirmingDelete ? (
          <div className={css.deleteConfirmBox}>
            <span className={css.deleteConfirmText}>
              Are you sure you want to delete this prompt?
            </span>
            <div className={css.deleteConfirmActions}>
              <Btn
                type="button"
                styleType="secondary"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isBusy}
                className={css.actionBtn}>
                <MdClose size={15} />
                <span>Cancel</span>
              </Btn>
              <button
                type="button"
                className={css.deleteBtn}
                onClick={() => void handleDeletePrompt()}
                disabled={isBusy}>
                <MdDeleteOutline size={16} />
                <span>{isDeleting ? "Deleting..." : "Confirm Delete"}</span>
              </button>
            </div>
          </div>
        ) : isEditing ? (
          <div className={css.footerActions}>
            <Btn
              type="button"
              styleType="secondary"
              onClick={handleCancelEdit}
              disabled={isBusy}
              className={css.actionBtn}>
              <MdClose size={15} />
              <span>Cancel</span>
            </Btn>
            <Btn
              type="button"
              styleType="primary"
              onClick={() => void handleSaveChanges()}
              disabled={isBusy}
              className={css.actionBtn}>
              <MdCheck size={16} />
              <span>{isSaving ? "Saving..." : "Save changes"}</span>
            </Btn>
          </div>
        ) : (
          <div className={css.footerActions}>
            <button
              type="button"
              className={css.deleteBtn}
              onClick={() => setIsConfirmingDelete(true)}
              disabled={isBusy}>
              <MdDeleteOutline size={16} />
              <span>Delete</span>
            </button>
            <Btn
              type="button"
              styleType="secondary"
              onClick={onClose}
              disabled={isBusy}
              className={css.actionBtn}>
              <MdClose size={15} />
              <span>Close</span>
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}
