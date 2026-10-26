import React from "react"

import css from "../gemini-prompts.module.scss"

export interface GeminiStateViewProps {
  isLoading: boolean
  isAuthenticated: boolean
  errorMessage: string | null
  totalPromptsCount: number
  onResetFilters?: () => void
  onRetry?: () => void
}

export const GeminiStateView: React.FC<GeminiStateViewProps> = ({
  isLoading,
  isAuthenticated,
  errorMessage,
  totalPromptsCount,
  onResetFilters,
  onRetry
}) => {
  if (isLoading) {
    return <div className={css.stateBox}>Loading prompts...</div>
  }

  if (!isAuthenticated) {
    return (
      <div className={css.stateBox}>
        Please sign in via the TemplaGem extension popup to see your prompts.
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        className={css.errorBox}
        role="alert">
        <span>{errorMessage}</span>
        {onRetry && (
          <button
            type="button"
            className={css.stateActionBtn}
            onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={css.stateBox}>
      <span>
        {totalPromptsCount === 0
          ? "No prompts saved yet."
          : "No prompts match your search."}
      </span>
      {totalPromptsCount > 0 && onResetFilters && (
        <button
          type="button"
          className={css.stateActionBtn}
          onClick={onResetFilters}>
          Reset search
        </button>
      )}
    </div>
  )
}
