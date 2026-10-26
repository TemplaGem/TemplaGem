import React, { useState } from "react"
import { HiSparkles } from "react-icons/hi2"
import { MdLock, MdReplay, MdSend } from "react-icons/md"

import css from "./MotionScreenRecording.module.scss"

interface MotionScreenRecordingProps {
  className?: string
}

export default function MotionScreenRecording({
  className = ""
}: MotionScreenRecordingProps) {
  const [animKey, setAnimKey] = useState(0)

  const handleReplay = () => {
    setAnimKey((prev) => prev + 1)
  }

  return (
    <div
      key={animKey}
      className={`${css.screenContainer} ${className}`}
      data-testid="motion-screen-recording">
      {/* Mini browser chrome */}
      <div className={css.browserHeader}>
        <div className={css.windowDots}>
          <span className={`${css.dot} ${css.dotClose}`} />
          <span className={`${css.dot} ${css.dotMin}`} />
          <span className={`${css.dot} ${css.dotMax}`} />
        </div>
        <div className={css.addressBar}>
          <MdLock className={css.lockIcon} />
          <span>gemini.google.com</span>
        </div>
      </div>

      {/* Screen stage area */}
      <div className={css.stage}>
        {/* Gemini Chat Messages Area */}
        <div className={css.chatFeed}>
          <div className={css.geminiHeader}>
            <div className={css.geminiBadge}>
              <HiSparkles className={css.sparkleIcon} />
              <span>Gemini 3.8 flash</span>
            </div>
          </div>

          <div className={css.chatBubble}>
            Hello! What prompt template would you like to use today?
          </div>

          <div className={css.userSentMessage}>
            Review this TypeScript code for performance & bugs
          </div>
        </div>

        {/* Docked TemplaGem Popover directly ABOVE search & input bar */}
        <div
          className={css.dockedPopover}
          data-testid="docked-gemini-popover">
          <div className={css.widgetHeader}>
            <div className={css.widgetLogo}>
              <span className={css.gemIcon} />
              <span>TemplaGem</span>
            </div>
            <span className={css.widgetBadge}>Prompts</span>
          </div>
          <div
            className={css.promptCardMock}
            title="Click to insert prompt">
            <div className={css.promptTitle}>
              <span>⚡</span> Code Review
            </div>
            <span className={css.promptTag}>{"{{language}}"}</span>
          </div>
        </div>

        {/* Animated Mouse Cursor with Ripple */}
        <div className={css.cursorWrapper}>
          <div className={css.cursorRipple} />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))"
            }}>
            <path
              d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
              fill="#1f1f1f"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Gemini Search & Prompt Input Bar at bottom */}
        <div className={css.geminiInputArea}>
          <span className={css.inputPlaceholder}>Ask Gemini anything...</span>

          {/* Template inserted directly into input bar with inline variable */}
          <div className={css.inlinePromptContainer}>
            <span>Review this</span>
            <span className={css.phTemplateVariable}>
              {"{{"}
              <span className={css.variableText}>TypeScript</span>
              <span className={css.typingCaret} />
              {"}}"}
            </span>
            <span>code for bugs</span>
          </div>

          <div className={css.sendBtn}>
            <MdSend />
          </div>
        </div>

        {/* Replay action */}
        <button
          type="button"
          className={css.replayBtn}
          onClick={handleReplay}
          title="Replay animation"
          aria-label="Replay animation">
          <MdReplay size={11} />
          <span>Replay</span>
        </button>
      </div>
    </div>
  )
}
