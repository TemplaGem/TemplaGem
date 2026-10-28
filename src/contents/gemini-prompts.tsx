import { QueryClientProvider } from "@tanstack/react-query"
import type { PlasmoCSConfig } from "plasmo"
import React, { useRef, useState } from "react"

import TagFilter from "../components/TagFilter/TagFilter"
import type { IPrompt } from "../types"
import { GeminiHeader } from "./components/GeminiHeader"
import { GeminiPromptList } from "./components/GeminiPromptList"
import { GeminiStateView } from "./components/GeminiStateView"
import { loadPromptsForContentScript } from "./gemini-api"
import {
  cleanTemplateBracketsInInput,
  computeGeminiPopoverPosition,
  handleGeminiSendTrigger,
  handleGeminiTemplateKeyDown,
  handleGeminiTemplatePaste,
  handleTemplateVariableTyping,
  insertTextIntoGeminiInput,
  jumpToNextTemplateVariable,
  type GeminiPopoverPosition
} from "./gemini-dom"
import {
  detectGeminiPageTheme,
  findGeminiInput,
  findGeminiInputContainer,
  GEMINI_INPUT_SELECTOR,
  getOrCreateGeminiRootContainer
} from "./gemini-elements"
import { AdapterFactory } from "./core/adapters/AdapterFactory"
import { DiscoveryEngine } from "./core/discovery-engine"
import css from "./gemini-prompts.module.scss"
import { createDefaultQueryClient } from "./gemini-query-client"
import { useGeminiOverlayEvents } from "./hooks/useGeminiOverlayEvents"
import { useGeminiPopoverPosition } from "./hooks/useGeminiPopoverPosition"
import { useGeminiPromptFilters } from "./hooks/useGeminiPromptFilters"
import { useGeminiPromptsQuery } from "./hooks/useGeminiPromptsQuery"
import { usePlatformTheme } from "./hooks/usePlatformTheme"
import { useThemeStorage } from "./hooks/useThemeStorage"
import { TemplateHighlighter } from "./TemplateHighlighter"

import "./template-variables.scss"

export const config: PlasmoCSConfig = {
  matches: [
    "https://gemini.google.com/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://chat.deepseek.com/*"
  ]
}

// Re-export DOM helpers, query client, & API for backwards-compatibility with tests
export const getRootContainer = getOrCreateGeminiRootContainer
export const findGeminiInputTarget = findGeminiInput
export const computePopoverPosition = computeGeminiPopoverPosition
export const insertPromptIntoElement = insertTextIntoGeminiInput
export const detectPageTheme = detectGeminiPageTheme
export {
  cleanTemplateBracketsInInput,
  createDefaultQueryClient,
  findGeminiInputContainer,
  handleGeminiSendTrigger,
  handleGeminiTemplateKeyDown,
  handleGeminiTemplatePaste,
  handleTemplateVariableTyping,
  jumpToNextTemplateVariable,
  loadPromptsForContentScript,
  useThemeStorage,
  useGeminiPromptsQuery,
  useGeminiPromptFilters,
  useGeminiPopoverPosition,
  useGeminiOverlayEvents,
  usePlatformTheme,
  TemplateHighlighter,
  type GeminiPopoverPosition
}

export const GeminiPromptsOverlayContent: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  // TanStack Query handles fetching, caching, loading, error, and refresh states
  const {
    prompts,
    isLoading,
    isAuthenticated,
    errorMessage,
    theme: apiTheme,
    refreshPrompts
  } = useGeminiPromptsQuery({ enabled: isOpen })

  // Dedicated custom hook for storage-backed theme changes
  const [theme] = useThemeStorage(apiTheme)
  const isDark = theme === "dark"

  // Dedicated custom hook for platform-specific dynamic accent colors from manifest
  const { cssVariables: platformCssVariables } = usePlatformTheme(isDark)

  // Dedicated custom hook for popover coordinates and resize/scroll listeners
  const { position, activeInputRef, updatePositionForTarget } =
    useGeminiPopoverPosition(isOpen, popoverRef)

  // Dedicated custom hook for search query, tag filtering, and index tracking
  const {
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedIndex,
    setSelectedIndex,
    selectedIndexRef,
    availableTags,
    filteredPrompts,
    filteredPromptsRef
  } = useGeminiPromptFilters(prompts, isOpen)

  const handleSelectPrompt = (prompt: IPrompt) => {
    const input =
      activeInputRef.current ??
      findGeminiInput(document.activeElement) ??
      DiscoveryEngine.findInput(null, null) ??
      document.querySelector<HTMLElement>(GEMINI_INPUT_SELECTOR)
    if (input) {
      activeInputRef.current = input
      const adapter = AdapterFactory.createAdapter(undefined, null, input)
      adapter.insertText(prompt.body, input)
    }
    setIsOpen(false)
  }

  // Dedicated custom hook for global DOM events (Esc, typing dismissal, arrows, click outside, submit)
  useGeminiOverlayEvents({
    isOpen,
    setIsOpen,
    popoverRef,
    activeInputRef,
    filteredPromptsRef,
    selectedIndexRef,
    setSelectedIndex,
    handleSelectPrompt,
    updatePositionForTarget
  })

  if (!isOpen) {
    return null
  }

  const isDockedAbove = position.dockedAbove && position.bottom !== undefined
  const hasStateContent =
    isLoading ||
    !isAuthenticated ||
    Boolean(errorMessage) ||
    filteredPrompts.length === 0

  return (
    <div
      ref={popoverRef}
      className={`${css.popover} ${
        position.dockedAbove ? css.dockedAbove : css.dockedBelow
      }`}
      data-theme={theme}
      style={{
        left: `${position.left}px`,
        width: `${position.width}px`,
        ...(isDockedAbove
          ? { bottom: `${position.bottom}px` }
          : { top: `${position.top}px` }),
        ...platformCssVariables
      } as React.CSSProperties}
      role="dialog"
      aria-label="TemplaGem Gemini Prompts">
      <GeminiHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={() => void refreshPrompts()}
        onClose={() => setIsOpen(false)}
        isLoading={isLoading}
      />

      {availableTags.length > 0 && (
        <div className={css.geminiTagFilterWrapper}>
          <TagFilter
            tags={availableTags}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
        </div>
      )}

      {hasStateContent ? (
        <GeminiStateView
          isLoading={isLoading}
          isAuthenticated={isAuthenticated}
          errorMessage={errorMessage}
          totalPromptsCount={prompts.length}
        />
      ) : (
        <GeminiPromptList
          prompts={filteredPrompts}
          selectedIndex={selectedIndex}
          onSelectPrompt={handleSelectPrompt}
          onHoverIndex={setSelectedIndex}
          listRef={listRef}
        />
      )}
    </div>
  )
}

export const GeminiPromptsOverlay: React.FC = () => {
  const [queryClient] = useState(() => createDefaultQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <GeminiPromptsOverlayContent />
    </QueryClientProvider>
  )
}

export default GeminiPromptsOverlay
