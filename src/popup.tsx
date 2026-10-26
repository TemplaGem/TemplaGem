import { QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import AddNewBtn from "~src/components/AddNewBtn/AddNewBtn"
import AuthForm from "~src/components/AuthForm/AuthForm"
import CreatePromptModal from "~src/components/CreatePromptModal/CreatePromptModal"
import Header from "~src/components/Header/Header"
import ListSection from "~src/components/ListSection/ListSection"
import SearchField from "~src/components/SearchField/SearchField"
import SettingsPage from "~src/components/SettingsPage/SettingsPage"
import { createDefaultQueryClient } from "~src/contents/gemini-query-client"
import { syncPrompts } from "~src/services/sync.service"
import {
  ACCESS_TOKEN_STORAGE_KEY,
  getAccessToken,
  getRefreshToken,
  isTokenExpired,
  LEGACY_ACCESS_TOKEN_STORAGE_KEY,
  LEGACY_REFRESH_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  setAccessToken,
  setRefreshToken,
  subscribeAuthChange
} from "~src/utils/auth"
import {
  getTheme,
  subscribeThemeChange,
  type ThemeMode
} from "~src/utils/theme"

import "./popup.scss"

export const GUEST_MODE_STORAGE_KEY = "templagem_guest_mode"

export default function Popup() {
  const [queryClient] = useState(() => createDefaultQueryClient())
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const access = getAccessToken()
    const refresh = getRefreshToken()
    return Boolean(access || refresh)
  })
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true"
    }
    return false
  })
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    setThemeState(getTheme())
    const unsubTheme = subscribeThemeChange((nextTheme) => {
      setThemeState(nextTheme)
    })
    const unsubAuth = subscribeAuthChange((authenticated) => {
      setIsAuthenticated(authenticated)
    })

    // Ensure localStorage and chrome.storage.local tokens are synchronized
    const localAccess = getAccessToken()
    const localRefresh = getRefreshToken()
    if (localRefresh) {
      setRefreshToken(localRefresh)
    }
    if (localAccess) {
      setAccessToken(localAccess)
    }
    if (
      !localAccess &&
      !localRefresh &&
      typeof chrome !== "undefined" &&
      chrome.storage?.local
    ) {
      void chrome.storage.local
        .get([
          ACCESS_TOKEN_STORAGE_KEY,
          LEGACY_ACCESS_TOKEN_STORAGE_KEY,
          REFRESH_TOKEN_STORAGE_KEY,
          LEGACY_REFRESH_TOKEN_STORAGE_KEY,
          GUEST_MODE_STORAGE_KEY
        ])
        .then((stored) => {
          if (stored?.[GUEST_MODE_STORAGE_KEY] === true) {
            setIsGuestMode(true)
          }
          const rawAccess =
            stored?.[ACCESS_TOKEN_STORAGE_KEY] ??
            stored?.[LEGACY_ACCESS_TOKEN_STORAGE_KEY]
          const storedAccess =
            typeof rawAccess === "string" && !isTokenExpired(rawAccess)
              ? rawAccess
              : null
          const rawRefresh =
            stored?.[REFRESH_TOKEN_STORAGE_KEY] ??
            stored?.[LEGACY_REFRESH_TOKEN_STORAGE_KEY]
          const storedRefresh =
            typeof rawRefresh === "string" && !isTokenExpired(rawRefresh)
              ? rawRefresh
              : null
          if (storedRefresh) {
            setRefreshToken(storedRefresh)
          }
          if (storedAccess) {
            setAccessToken(storedAccess)
          }
          if (storedAccess || storedRefresh) {
            setIsAuthenticated(true)
          }
        })
        .catch(() => {
          // Ignore storage read errors
        })
    }

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (
        ACCESS_TOKEN_STORAGE_KEY in changes ||
        REFRESH_TOKEN_STORAGE_KEY in changes
      ) {
        const nextAccess = changes[ACCESS_TOKEN_STORAGE_KEY]?.newValue
        const nextRefresh = changes[REFRESH_TOKEN_STORAGE_KEY]?.newValue
        if (typeof nextAccess === "string" && !isTokenExpired(nextAccess)) {
          setIsAuthenticated(true)
        } else if (
          typeof nextRefresh === "string" &&
          !isTokenExpired(nextRefresh)
        ) {
          setIsAuthenticated(true)
        } else if (
          nextAccess === undefined &&
          nextRefresh === undefined &&
          !getAccessToken() &&
          !getRefreshToken()
        ) {
          setIsAuthenticated(false)
        }
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChanged)
    }

    return () => {
      unsubTheme()
      unsubAuth()
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChanged)
      }
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      void syncPrompts({ queryClient }).catch(() => null)
    }

    const handleOnline = () => {
      if (isAuthenticated) {
        void syncPrompts({ queryClient }).catch(() => null)
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
      return () => {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [isAuthenticated, queryClient])

  const handleClearFilters = () => {
    setSearchQuery("")
  }

  const handleContinueOffline = () => {
    setIsGuestMode(true)
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true")
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      void chrome.storage.local.set({ [GUEST_MODE_STORAGE_KEY]: true })
    }
  }

  const handleAuthSuccess = () => {
    setIsAuthenticated(true)
    setIsGuestMode(false)
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY)
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      void chrome.storage.local.remove(GUEST_MODE_STORAGE_KEY)
    }
  }

  const isUnlocked = isAuthenticated || isGuestMode

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={"popup"}
        data-theme={theme}>
        <Header
          isSettingsOpen={isSettingsOpen}
          onSettingsClick={() => setIsSettingsOpen((prev) => !prev)}
        />
        {isSettingsOpen ? (
          <SettingsPage
            isAuthenticated={isAuthenticated}
            onBack={() => setIsSettingsOpen(false)}
            onOpenAuth={() => {
              setIsGuestMode(false)
              if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY)
              }
              if (typeof chrome !== "undefined" && chrome.storage?.local) {
                void chrome.storage.local.remove(GUEST_MODE_STORAGE_KEY)
              }
              setIsSettingsOpen(false)
            }}
          />
        ) : isUnlocked ? (
          <>
            {!isAuthenticated && isGuestMode && (
              <div
                className="offlineNoticeBanner"
                data-testid="offline-notice-banner">
                <span className="offlineNoticeText">
                  Offline Mode (local prompts)
                </span>
                <button
                  type="button"
                  className="offlineSignInLink"
                  onClick={() => {
                    setIsGuestMode(false)
                    if (typeof window !== "undefined" && window.localStorage) {
                      window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY)
                    }
                    if (typeof chrome !== "undefined" && chrome.storage?.local) {
                      void chrome.storage.local.remove(GUEST_MODE_STORAGE_KEY)
                    }
                  }}>
                  Sign In / Register
                </button>
              </div>
            )}
            <SearchField
              value={searchQuery}
              onSearch={(query) => setSearchQuery(query)}
            />
            <ListSection
              searchQuery={searchQuery}
              onClearFilters={handleClearFilters}
            />
            <AddNewBtn onClick={() => setIsCreateModalOpen(true)} />
            <CreatePromptModal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
            />
          </>
        ) : (
          <AuthForm
            onAuthSuccess={handleAuthSuccess}
            onContinueOffline={handleContinueOffline}
          />
        )}
      </div>
    </QueryClientProvider>
  )
}
