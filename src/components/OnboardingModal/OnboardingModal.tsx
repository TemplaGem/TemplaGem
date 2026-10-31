import React, { useEffect, useState } from "react"
import { HiSparkles } from "react-icons/hi2"
import {
  MdArrowBack,
  MdArrowForward,
  MdCloudSync,
  MdComputer,
  MdDns,
  MdDone,
  MdFlashOn,
  MdKeyboardDoubleArrowDown,
  MdOutlineOfflinePin,
  MdSync
} from "react-icons/md"

import { setOnboardingCompleted } from "~src/utils/onboarding"

import MotionScreenRecording from "./MotionScreenRecording"
import css from "./OnboardingModal.module.scss"

export interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

export default function OnboardingModal({
  isOpen,
  onClose,
  onComplete
}: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = 3

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleSkip()
      } else if (e.key === "ArrowRight") {
        handleNext()
      } else if (e.key === "ArrowLeft") {
        handleBack()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, currentStep])

  if (!isOpen) return null

  const handleFinish = async () => {
    await setOnboardingCompleted(true)
    onComplete?.()
    onClose()
  }

  const handleSkip = async () => {
    await handleFinish()
  }

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      void handleFinish()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  return (
    <div
      className={css.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          void handleSkip()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="TemplaGem Onboarding Guide">
      <div className={css.modal}>
        {/* Top Header */}
        <div className={css.header}>
          <div className={css.stepBadge}>
            <HiSparkles size={13} />
            <span>
              Step {currentStep + 1} of {totalSteps}
            </span>
          </div>
          <button
            type="button"
            className={css.skipBtn}
            onClick={() => void handleSkip()}
            aria-label="Skip onboarding">
            Skip
          </button>
        </div>

        {/* Dynamic Content Slide */}
        <div className={css.content}>
          {currentStep === 0 && (
            <div
              key="step-0"
              className={css.slideWrapper}>
              <div className={css.illustrationBox}>
                <MotionScreenRecording />
              </div>
              <h2 className={css.title}>TemplaGem in Action</h2>
              <p className={css.description}>
                Insert prompts directly into the Gemini input bar and fill
                dynamic variables in-line with highlighted focus.
              </p>
              <div className={css.featureList}>
                <div className={css.featureItem}>
                  <MdFlashOn className={css.featureIcon} />
                  <span>One-click template insertion straight into Gemini input bar</span>
                </div>
                <div className={css.featureItem}>
                  <HiSparkles className={css.featureIcon} />
                  <span>In-line highlighted variables with automatic caret positioning</span>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div
              key="step-1"
              className={css.slideWrapper}>
              <div className={css.illustrationBox}>
                <div className={css.variablesShowcase}>
                  <div className={css.codeSnippet}>
                    Generate a{" "}
                    <span className={css.varPillInteractive}>
                      {"{{tone}}"}
                    </span>{" "}
                    review of{" "}
                    <span className={css.varPillInteractive}>
                      {"{{topic}}"}
                    </span>
                  </div>
                  <div className={css.variableArrow}>
                    <MdKeyboardDoubleArrowDown />
                  </div>
                  <div className={css.searchBarMock}>
                    <span className={css.searchBarPrefix}>
                      Inserted directly into Gemini input bar:
                    </span>
                    <div className={css.searchBarInner}>
                      <span>Generate a </span>
                      <span className={css.inlineActiveTag}>Professional</span>
                      <span> review of </span>
                      <span className={css.inlineNextTag}>{"{{topic}}"}</span>
                    </div>
                  </div>
                </div>
              </div>
              <h2 className={css.title}>In-Line Dynamic Variables</h2>
              <p className={css.description}>
                Variables in <code>{"{{double_braces}}"}</code> are styled directly
                in Gemini&apos;s search &amp; input bar. Simply type your replacement
                and brackets strip on send.
              </p>
              <div className={css.featureList}>
                <div className={css.featureItem}>
                  <HiSparkles className={css.featureIcon} />
                  <span>Type directly inside variables right in the search line</span>
                </div>
                <div className={css.featureItem}>
                  <MdFlashOn className={css.featureIcon} />
                  <span>Brackets strip automatically when sending prompt</span>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div
              key="step-2"
              className={css.slideWrapper}>
              <div className={css.illustrationBox}>
                <div className={css.offlineShowcase}>
                  <div className={css.nodeBox}>
                    <div className={css.nodeIconWrapper}>
                      <MdDns />
                    </div>
                    <span className={css.nodeLabel}>IndexedDB</span>
                    <span className={css.nodeSub}>Local cache</span>
                  </div>
                  <div className={css.syncLine}>
                    <MdSync className={css.syncArrows} />
                    <span className={css.syncBadge}>2-Way Sync</span>
                  </div>
                  <div className={css.nodeBox}>
                    <div className={css.nodeIconWrapper}>
                      <MdCloudSync />
                    </div>
                    <span className={css.nodeLabel}>Cloud API</span>
                    <span className={css.nodeSub}>MongoDB Cloud</span>
                  </div>
                </div>
              </div>
              <h2 className={css.title}>Offline-First & Cloud Sync</h2>
              <p className={css.description}>
                Enjoy lightning-fast access locally in IndexedDB. Prompts work
                completely offline and seamlessly sync when you are back online.
              </p>
              <div className={css.featureList}>
                <div className={css.featureItem}>
                  <MdOutlineOfflinePin className={css.featureIcon} />
                  <span>100% offline capability with local guest mode</span>
                </div>
                <div className={css.featureItem}>
                  <MdComputer className={css.featureIcon} />
                  <span>Bi-directional conflict resolution (LWW)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className={css.footer}>
          <div className={css.dots}>
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`${css.dotBtn} ${
                  idx === currentStep ? css.activeDot : ""
                }`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className={css.navActions}>
            {currentStep > 0 && (
              <button
                type="button"
                className={css.backBtn}
                onClick={handleBack}
                aria-label="Previous step">
                <MdArrowBack size={14} />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              className={css.nextBtn}
              onClick={handleNext}
              aria-label={
                currentStep === totalSteps - 1 ? "Get Started" : "Next step"
              }>
              <span>
                {currentStep === totalSteps - 1 ? "Get Started" : "Next"}
              </span>
              {currentStep === totalSteps - 1 ? (
                <MdDone size={14} />
              ) : (
                <MdArrowForward size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
