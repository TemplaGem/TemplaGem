import { useEffect, useState } from "react"

import AddNewBtn from "~src/components/AddNewBtn/AddNewBtn"
import AuthForm from "~src/components/AuthForm/AuthForm"
import CreatePromptModal from "~src/components/CreatePromptModal/CreatePromptModal"
import Header from "~src/components/Header/Header"
import ListSection from "~src/components/ListSection/ListSection"
import SearchField from "~src/components/SearchField/SearchField"
import SettingsPage from "~src/components/SettingsPage/SettingsPage"
import {
  getAccessToken,
  getRefreshToken,
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

export default function Popup() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    Boolean(getAccessToken() || getRefreshToken())
  )
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

    // Synchronize localStorage and chrome.storage.local tokens on mount
    const localAccess = getAccessToken()
    const localRefresh = getRefreshToken()
    if (localRefresh) {
      setRefreshToken(localRefresh)
    }
    if (localAccess) {
      setAccessToken(localAccess)
    }

    return () => {
      unsubTheme()
      unsubAuth()
    }
  }, [])

  const handleClearFilters = () => {
    setSearchQuery("")
  }

  return (
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
        />
      ) : isAuthenticated ? (
        <>
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
        <AuthForm onAuthSuccess={() => setIsAuthenticated(true)} />
      )}
    </div>
  )
}
