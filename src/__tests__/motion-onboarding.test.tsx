import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MotionScreenRecording from "~src/components/OnboardingModal/MotionScreenRecording"
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

  it("handles chrome.storage fallback when localStorage is empty", async () => {
    localStorage.clear()
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ [ONBOARDING_STORAGE_KEY]: true }),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    })

    expect(await checkOnboardingCompleted()).toBe(true)

    // Tests error branch in chrome.storage get & set
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error("Storage unavailable")),
          set: vi.fn().mockRejectedValue(new Error("Storage unavailable"))
        }
      }
    })
    expect(await checkOnboardingCompleted()).toBe(false)
    await setOnboardingCompleted(true)

    vi.unstubAllGlobals()
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

