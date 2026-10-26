import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MotionScreenRecording from "~src/components/OnboardingModal/MotionScreenRecording"
import OnboardingModal from "~src/components/OnboardingModal/OnboardingModal"
import Popup from "~src/popup"
import {
  checkOnboardingCompleted,
  isOnboardingCompleted,
  ONBOARDING_STORAGE_KEY,
  resetOnboarding,
  setOnboardingCompleted
} from "~src/utils/onboarding"

describe("Onboarding Utils", () => {
  beforeEach(() => {
    localStorage.clear()
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.clear()
    }
  })

  it("checks, sets and resets onboarding completed state across localStorage and chrome.storage", async () => {
    expect(isOnboardingCompleted()).toBe(false)
    expect(await checkOnboardingCompleted()).toBe(false)

    await setOnboardingCompleted(true)
    expect(isOnboardingCompleted()).toBe(true)
    expect(await checkOnboardingCompleted()).toBe(true)
    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true")

    await resetOnboarding()
    expect(isOnboardingCompleted()).toBe(false)
    expect(await checkOnboardingCompleted()).toBe(false)
  })
})

describe("MotionScreenRecording", () => {
  it("renders screen recording mockup with Gemini chrome, widget and replay button", async () => {
    const user = userEvent.setup()
    render(<MotionScreenRecording />)

    expect(screen.getByTestId("motion-screen-recording")).toBeInTheDocument()
    expect(screen.getByText("gemini.google.com")).toBeInTheDocument()
    expect(screen.getByText("Gemini 1.5 Pro")).toBeInTheDocument()
    expect(screen.getByText("Code Review")).toBeInTheDocument()
    expect(screen.getByText("Ask Gemini anything...")).toBeInTheDocument()
    expect(screen.getAllByText(/TypeScript/i).length).toBeGreaterThanOrEqual(1)

    const replayBtn = screen.getByRole("button", { name: /replay/i })
    expect(replayBtn).toBeInTheDocument()
    await user.click(replayBtn)
    expect(screen.getByTestId("motion-screen-recording")).toBeInTheDocument()
  })
})

describe("OnboardingModal", () => {
  beforeEach(() => {
    localStorage.clear()
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.clear()
    }
  })

  it("does not render when closed", () => {
    render(
      <OnboardingModal
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("steps through slides, navigates back and finishes with Get Started", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onComplete = vi.fn()

    render(
      <OnboardingModal
        isOpen={true}
        onClose={onClose}
        onComplete={onComplete}
      />
    )

    // Slide 1
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()
    expect(screen.getByText("TemplaGem in Action")).toBeInTheDocument()
    expect(screen.getByTestId("motion-screen-recording")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Previous step" })
    ).not.toBeInTheDocument()

    // Next -> Slide 2
    await user.click(screen.getByRole("button", { name: "Next step" }))
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument()
    expect(screen.getByText("In-Line Dynamic Variables")).toBeInTheDocument()

    // Back -> Slide 1
    await user.click(screen.getByRole("button", { name: "Previous step" }))
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()

    // Dot click -> Slide 3 (index 2)
    const dots = screen.getAllByRole("button", { name: /go to step/i })
    expect(dots).toHaveLength(3)
    await user.click(dots[2]!)
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument()
    expect(screen.getByText("Offline-First & Cloud Sync")).toBeInTheDocument()

    // Get Started -> finishes onboarding
    const getStartedBtn = screen.getByRole("button", { name: "Get Started" })
    await user.click(getStartedBtn)

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(isOnboardingCompleted()).toBe(true)
  })

  it("supports skipping directly via Skip button and keyboard shortcuts", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { unmount } = render(
      <OnboardingModal
        isOpen={true}
        onClose={onClose}
      />
    )

    const skipBtn = screen.getByRole("button", { name: /skip onboarding/i })
    await user.click(skipBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(isOnboardingCompleted()).toBe(true)

    unmount()
    await resetOnboarding()

    // Re-render and test Escape key
    render(
      <OnboardingModal
        isOpen={true}
        onClose={onClose}
      />
    )
    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => {
      expect(isOnboardingCompleted()).toBe(true)
    })
  })

  it("supports keyboard navigation with ArrowRight and ArrowLeft", async () => {
    render(
      <OnboardingModal
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()
  })
})

describe("Popup Onboarding Integration", () => {
  beforeEach(() => {
    localStorage.clear()
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.clear()
    }
  })

  it("opens onboarding automatically for new users and allows re-opening via Header help button", async () => {
    const user = userEvent.setup()

    render(<Popup />)

    // Automatically shows onboarding guide
    expect(await screen.findByRole("dialog", { name: /templagem onboarding guide/i })).toBeInTheDocument()

    // Skip onboarding
    await user.click(screen.getByRole("button", { name: /skip onboarding/i }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /templagem onboarding guide/i })).not.toBeInTheDocument()
    })

    // Click Tutorial & Guide button in header to re-open
    const helpBtn = screen.getByRole("button", { name: /tutorial & guide/i })
    await user.click(helpBtn)

    expect(await screen.findByRole("dialog", { name: /templagem onboarding guide/i })).toBeInTheDocument()
  })
})
