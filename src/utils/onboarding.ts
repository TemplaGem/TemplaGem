export const ONBOARDING_STORAGE_KEY = "templagem_onboarding_completed"

export function isOnboardingCompleted(): boolean {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true"
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return false
}

export async function checkOnboardingCompleted(): Promise<boolean> {
  const localVal = isOnboardingCompleted()
  if (localVal) return true

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const data = await chrome.storage.local.get([ONBOARDING_STORAGE_KEY])
      return data?.[ONBOARDING_STORAGE_KEY] === true
    } catch {
      // Ignore chrome.storage errors
    }
  }

  return false
}

export async function setOnboardingCompleted(completed = true): Promise<void> {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (completed) {
        window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true")
      } else {
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY)
      }
    }
  } catch {
    // Ignore localStorage write errors
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: completed })
    } catch {
      // Ignore chrome.storage errors
    }
  }
}

export async function resetOnboarding(): Promise<void> {
  await setOnboardingCompleted(false)
}
