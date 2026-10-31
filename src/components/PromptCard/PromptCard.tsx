import React, { useState } from "react"
import { MdCheck } from "react-icons/md"

import PromptIcon from "../PromptIcon/PromptIcon"
import css from "./PromptCard.module.scss"

interface PromptCardProps {
  name: string
  description: string
  type: string
  tags?: string[]
  icon?: string
  onClick?: () => void
}

export default function PromptCard({
  name,
  type,
  description,
  tags,
  icon,
  onClick
}: PromptCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    void navigator.clipboard?.writeText(description)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <li
      className={css.promptCard}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}>
      <PromptIcon
        icon={icon}
        type={type}
        tags={tags}
      />
      <div className={css.promptCardContent}>
        <div className={css.promptCardTitleWrapper}>
          <h3 className={css.promptCardTitle}>{name}</h3>
          <button
            type={"button"}
            className={`${css.copyBtn} ${copied ? css.copyBtnCopied : ""}`}
            onClick={handleCopyClick}
            title={copied ? "Copied!" : "Copy prompt"}
            aria-label={copied ? "Copied!" : "Copy prompt"}>
            {copied ? (
              <MdCheck size={15} />
            ) : (
              <svg
                width="13"
                height="15"
                viewBox="0 0 13 15"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                className={css.copyBtnIcon}>
                <path
                  d="M4.5 12C4.0875 12 3.73438 11.8531 3.44062 11.5594C3.14687 11.2656 3 10.9125 3 10.5V1.5C3 1.0875 3.14687 0.734375 3.44062 0.440625C3.73438 0.146875 4.0875 0 4.5 0H11.25C11.6625 0 12.0156 0.146875 12.3094 0.440625C12.6031 0.734375 12.75 1.0875 12.75 1.5V10.5C12.75 10.9125 12.6031 11.2656 12.3094 11.5594C12.0156 11.8531 11.6625 12 11.25 12H4.5ZM4.5 10.5H11.25V1.5H4.5V10.5ZM1.5 15C1.0875 15 0.734375 14.8531 0.440625 14.5594C0.146875 14.2656 0 13.9125 0 13.5V3H1.5V13.5H9.75V15H1.5ZM4.5 10.5V1.5V10.5Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        </div>
        <p className={css.promptCardDescription}>{description}</p>
        {tags && tags.length > 0 && (
          <div className={css.tagsRow}>
            {tags.map((tag) => (
              <span
                key={tag}
                className={css.tagBadge}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
