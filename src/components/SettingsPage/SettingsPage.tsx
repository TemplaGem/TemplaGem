import React, { useEffect, useRef, useState } from "react"
import {
  MdArrowBack,
  MdClose,
  MdDarkMode,
  MdDeleteForever,
  MdLightMode,
  MdLogout,
  MdPersonRemove,
  MdWarningAmber
} from "react-icons/md"
import * as z from "zod"

import Btn from "~src/components/ui/Btn/Btn"
import { deleteAllPrompts, invalidatePromptsCache } from "~src/prompts-api"
import { deleteUser } from "~src/user-api"
import { logout } from "~src/utils/auth"
import {
  getTheme,
  getThemePreference,
  setThemePreference,
  subscribeThemeChange,
  type ThemeMode,
  type ThemePreference
} from "~src/utils/theme"

import BackendBadge from "../BackendBadge/BackendBadge"
import css from "./SettingsPage.module.scss"

interface SettingsPageProps {
  onBack: () => void
  isAuthenticated?: boolean
}

export default function SettingsPage({
  onBack,
  isAuthenticated = false
}: SettingsPageProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(
    () => getThemePreference()
  )
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)
  const [deleteAllSuccess, setDeleteAllSuccess] = useState<string | null>(null)

  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false)
  const [deleteUserPassword, setDeleteUserPassword] = useState("")
  const [isDeletingUser, setIsDeletingUser] = useState(false)
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null)
  const [showBackendInfo, setShowBackendInfo] = useState(false)
  const titleClickCountRef = useRef(0)
  const titleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (titleClickTimeoutRef.current) {
        clearTimeout(titleClickTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setThemePreferenceState(getThemePreference())
    return subscribeThemeChange((nextTheme) => {
      setThemeState(nextTheme)
      setThemePreferenceState(getThemePreference())
    })
  }, [])

  const isDark = theme === "dark"
  const isBusy = isLoggingOut || isDeletingAll || isDeletingUser

  const handleTitleClick = () => {
    if (showBackendInfo) return

    if (titleClickTimeoutRef.current) {
      clearTimeout(titleClickTimeoutRef.current)
    }

    titleClickCountRef.current += 1
    if (titleClickCountRef.current >= 5) {
      setShowBackendInfo(true)
      titleClickCountRef.current = 0
    } else {
      titleClickTimeoutRef.current = setTimeout(() => {
        titleClickCountRef.current = 0
      }, 1500)
    }
  }

  const handleSelectPreference = (pref: ThemePreference) => {
    setThemePreference(pref)
    setThemePreferenceState(pref)
    setThemeState(getTheme())
  }

  const handleLogout = async () => {
    if (isBusy) return
    setIsLoggingOut(true)
    try {
      await logout()
      onBack()
    } finally {
      setIsLoggingOut(false)
    }
  }

  const openConfirmDeleteAllModal = () => {
    setDeleteAllError(null)
    setDeleteAllSuccess(null)
    setIsConfirmModalOpen(true)
  }

  const closeConfirmDeleteAllModal = () => {
    if (isDeletingAll) return
    setDeleteAllError(null)
    setIsConfirmModalOpen(false)
  }

  const handleConfirmDeleteAll = async () => {
    if (isDeletingAll) return
    setDeleteAllError(null)
    setIsDeletingAll(true)
    try {
      await deleteAllPrompts()
      setIsConfirmModalOpen(false)
      setDeleteAllSuccess("All prompts have been deleted.")
    } catch (err) {
      setDeleteAllError(
        err instanceof Error ? err.message : "Failed to delete all prompts"
      )
    } finally {
      setIsDeletingAll(false)
    }
  }

  const openConfirmDeleteUserModal = () => {
    setDeleteUserPassword("")
    setDeleteUserError(null)
    setIsDeleteUserModalOpen(true)
  }

  const closeConfirmDeleteUserModal = () => {
    if (isDeletingUser) return
    setDeleteUserPassword("")
    setDeleteUserError(null)
    setIsDeleteUserModalOpen(false)
  }

  const handleConfirmDeleteUser = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isDeletingUser) return
    setDeleteUserError(null)
    setIsDeletingUser(true)
    try {
      await deleteUser({ password: deleteUserPassword })
      invalidatePromptsCache()
      setIsDeleteUserModalOpen(false)
      onBack()
    } catch (err) {
      if (err instanceof z.ZodError) {
        setDeleteUserError(err.issues[0]?.message || "Invalid password")
      } else {
        setDeleteUserError(
          err instanceof Error ? err.message : "Failed to delete account"
        )
      }
    } finally {
      setIsDeletingUser(false)
    }
  }

  return (
    <section
      className={css.settingsPage}
      aria-label="Settings">
      <div className={css.topBar}>
        <h2
          className={css.pageTitle}
          onClick={handleTitleClick}
          title="Settings">
          Settings
        </h2>
        <button
          type="button"
          className={css.backBtn}
          onClick={onBack}>
          <MdArrowBack size={15} />
          <span>Back</span>
        </button>
      </div>

      <div className={css.card}>
        <span className={css.sectionLabel}>Appearance</span>
        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <div className={css.themeIconWrapper}>
              {isDark ? <MdDarkMode size={18} /> : <MdLightMode size={18} />}
            </div>
            <div className={css.settingTextGroup}>
              <span className={css.settingTitle}>Theme</span>
              <span className={css.settingSubtitle}>
                {themePreference === "system"
                  ? `System (${isDark ? "Dark" : "Light"})`
                  : isDark
                    ? "Dark mode is enabled"
                    : "Light mode is enabled"}
              </span>
            </div>
          </div>

          <div
            className={css.themeSegmentControl}
            role="group"
            aria-label="Theme selection">
            <button
              type="button"
              className={`${css.themeSegmentBtn} ${themePreference === "system" ? css.themeSegmentBtnActive : ""}`}
              onClick={() => handleSelectPreference("system")}
              aria-pressed={themePreference === "system"}>
              Auto
            </button>
            <button
              type="button"
              className={`${css.themeSegmentBtn} ${themePreference === "light" ? css.themeSegmentBtnActive : ""}`}
              onClick={() => handleSelectPreference("light")}
              aria-pressed={themePreference === "light"}>
              Light
            </button>
            <button
              type="button"
              className={`${css.themeSegmentBtn} ${themePreference === "dark" ? css.themeSegmentBtnActive : ""}`}
              onClick={() => handleSelectPreference("dark")}
              aria-pressed={themePreference === "dark"}>
              Dark
            </button>
          </div>
        </div>
      </div>

      {showBackendInfo && (
        <div className={css.card}>
          <span className={css.sectionLabel}>Server Connection</span>
          <div className={css.backendRow}>
            <div className={css.settingTextGroup}>
              <span className={css.settingTitle}>API Backend</span>
              <span className={css.settingSubtitle}>
                Connected server URL and health status
              </span>
            </div>
            <BackendBadge />
          </div>
        </div>
      )}

      {isAuthenticated && (
        <>
          <div className={css.card}>
            <span className={css.sectionLabel}>Danger Zone</span>
            {deleteAllSuccess && (
              <div className={css.successBox}>{deleteAllSuccess}</div>
            )}
            <button
              type="button"
              className={css.deleteAllBtn}
              onClick={openConfirmDeleteAllModal}
              disabled={isBusy}>
              <MdDeleteForever size={17} />
              <span>Delete all prompts</span>
            </button>
            <button
              type="button"
              className={css.deleteAllBtn}
              onClick={openConfirmDeleteUserModal}
              disabled={isBusy}>
              <MdPersonRemove size={17} />
              <span>Delete account</span>
            </button>
          </div>

          <div className={css.card}>
            <span className={css.sectionLabel}>Account</span>
            <button
              type="button"
              className={css.logoutBtn}
              onClick={() => void handleLogout()}
              disabled={isBusy}>
              <MdLogout size={16} />
              <span>{isLoggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        </>
      )}

      {isConfirmModalOpen && (
        <div
          className={css.modalOverlay}
          onClick={closeConfirmDeleteAllModal}>
          <div
            className={css.confirmModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-all-modal-title">
            <div className={css.confirmModalHeader}>
              <div className={css.confirmTitleGroup}>
                <div className={css.warningIconWrapper}>
                  <MdWarningAmber size={20} />
                </div>
                <h3
                  id="delete-all-modal-title"
                  className={css.confirmModalTitle}>
                  Delete all prompts?
                </h3>
              </div>
              <button
                type="button"
                className={css.closeModalBtn}
                onClick={closeConfirmDeleteAllModal}
                disabled={isDeletingAll}
                aria-label="Close confirmation modal">
                <MdClose size={16} />
              </button>
            </div>

            <p className={css.confirmModalText}>
              Are you sure you want to delete all your prompts? This action is
              permanent and cannot be undone.
            </p>

            {deleteAllError && (
              <div className={css.errorBox}>{deleteAllError}</div>
            )}

            <div className={css.confirmModalActions}>
              <Btn
                type="button"
                styleType="secondary"
                className={css.modalActionBtn}
                onClick={closeConfirmDeleteAllModal}
                disabled={isDeletingAll}>
                <MdClose size={15} />
                <span>Cancel</span>
              </Btn>
              <button
                type="button"
                className={css.confirmDeleteBtn}
                onClick={() => void handleConfirmDeleteAll()}
                disabled={isDeletingAll}>
                <MdDeleteForever size={17} />
                <span>
                  {isDeletingAll ? "Deleting..." : "Confirm delete all"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteUserModalOpen && (
        <div
          className={css.modalOverlay}
          onClick={closeConfirmDeleteUserModal}>
          <form
            className={css.confirmModal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleConfirmDeleteUser(e)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-modal-title"
            noValidate>
            <div className={css.confirmModalHeader}>
              <div className={css.confirmTitleGroup}>
                <div className={css.warningIconWrapper}>
                  <MdPersonRemove size={20} />
                </div>
                <h3
                  id="delete-user-modal-title"
                  className={css.confirmModalTitle}>
                  Delete account?
                </h3>
              </div>
              <button
                type="button"
                className={css.closeModalBtn}
                onClick={closeConfirmDeleteUserModal}
                disabled={isDeletingUser}
                aria-label="Close delete account modal">
                <MdClose size={16} />
              </button>
            </div>

            <p className={css.confirmModalText}>
              Enter your password to permanently delete your account and all
              associated prompts. This action cannot be undone.
            </p>

            <div className={css.fieldGroup}>
              <label
                htmlFor="delete-user-password"
                className={css.fieldLabel}>
                Password
              </label>
              <input
                id="delete-user-password"
                type="password"
                className={css.passwordInput}
                value={deleteUserPassword}
                onChange={(e) => setDeleteUserPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isDeletingUser}
                autoFocus
              />
            </div>

            {deleteUserError && (
              <div className={css.errorBox}>{deleteUserError}</div>
            )}

            <div className={css.confirmModalActions}>
              <Btn
                type="button"
                styleType="secondary"
                className={css.modalActionBtn}
                onClick={closeConfirmDeleteUserModal}
                disabled={isDeletingUser}>
                <MdClose size={15} />
                <span>Cancel</span>
              </Btn>
              <button
                type="submit"
                className={css.confirmDeleteBtn}
                disabled={isDeletingUser}>
                <MdPersonRemove size={17} />
                <span>
                  {isDeletingUser ? "Deleting..." : "Confirm delete account"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
