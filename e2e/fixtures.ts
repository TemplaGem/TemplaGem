import path from "node:path"
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page
} from "@playwright/test"

export const pathToExtension = path.resolve(
  process.cwd(),
  "build/chrome-mv3-prod"
)

export interface MockPrompt {
  _id: string
  title: string
  body: string
  tags: string[]
  icon?: string
  createdAt?: string
  updatedAt?: string
}

export function makeJwt(expOffsetSeconds: number = 3600): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64")
  const payloadObj: Record<string, unknown> = {
    email: "user@example.com",
    exp: Math.floor(Date.now() / 1000) + expOffsetSeconds
  }
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64")
  return `${header}.${payload}.mockSignature`
}

export const DEFAULT_MOCK_PROMPTS: MockPrompt[] = [
  {
    _id: "65f1a2b3c4d5e6f7a8b9c0d1",
    title: "Code Review Assistant",
    body: "Please review this {{language}} code for {{focus_area}} issues.",
    tags: ["development", "code"],
    icon: "code",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    _id: "65f1a2b3c4d5e6f7a8b9c0d2",
    title: "Bug Triage Summary",
    body: "Summarize bug report for {{service_name}} with severity {{severity}}.",
    tags: ["routine", "daily"],
    icon: "bot",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
  geminiPage: Page
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage"
      ]
    })

    // Route backend API requests so tests execute 100% hermetically and instantly
    await context.route("http://localhost:4300/**", async (route) => {
      const url = route.request().url()
      if (url.includes("/api/auth/login")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accessToken: makeJwt(3600),
            refreshToken: makeJwt(7200)
          })
        })
        return
      }

      if (
        url.includes("/api/prompts/create") ||
        url.includes("/api/prompts/delete") ||
        url.includes("/api/prompts/update") ||
        url.includes("/api/prompts/change")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Success" })
        })
        return
      }

      if (url.includes("/api/prompts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEFAULT_MOCK_PROMPTS)
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({})
      })
    })

    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context
        .waitForEvent("serviceworker", { timeout: 15000 })
        .catch(() => null as any)
    }

    if (!background) {
      for (let i = 0; i < 20; i++) {
        const sw = context.serviceWorkers()
        if (sw.length > 0) {
          background = sw[0]
          break
        }
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    if (!background) {
      throw new Error("Extension service worker was not registered in time")
    }

    const extensionId = background.url().split("/")[2]
    await use(extensionId)
  },

  geminiPage: async ({ context }, use) => {
    const page = await context.newPage()

    // Route Gemini domain to local mock DOM fixture to ensure 100% hermetic, offline-resilient execution
    await page.route("https://gemini.google.com/**", async (route) => {
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Google Gemini Test Environment</title>
          <style>
            body { font-family: "Google Sans", Roboto, sans-serif; padding: 40px; margin: 0; background: #ffffff; }
            .input-area-container { margin-top: 60px; max-width: 720px; }
            rich-textarea { display: block; border: 1px solid #c4c7c5; padding: 12px; border-radius: 12px; }
            .ql-editor { min-height: 80px; outline: none; font-size: 15px; line-height: 22px; color: #1f1f1f; }
            .ql-editor p { margin: 0; }
          </style>
        </head>
        <body>
          <div class="input-area-container">
            <rich-textarea>
              <div class="ql-editor" contenteditable="true" role="textbox" aria-label="Input prompt"></div>
            </rich-textarea>
          </div>
        </body>
        </html>
      `
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: mockHtml
      })
    })

    await page.goto("https://gemini.google.com/app", {
      waitUntil: "domcontentloaded"
    })
    await use(page)
    await page.close()
  }
})

export async function seedStorage(
  context: BrowserContext,
  data: {
    token?: string | null
    prompts?: MockPrompt[]
    icons?: Record<string, string>
  }
) {
  let [background] = context.serviceWorkers()
  if (!background) {
    background = await context
      .waitForEvent("serviceworker", { timeout: 15000 })
      .catch(() => null as any)
  }

  if (background) {
    await background.evaluate(
      async (payload) => {
        if (payload.token === null) {
          await chrome.storage.local.remove([
            "templagem_access_token",
            "templagem_refresh_token",
            "templagem_prompts_cache"
          ])
          return
        }
        const toSet: Record<string, unknown> = {}
        if (payload.token !== undefined) {
          toSet.templagem_access_token = payload.token
          toSet.templagem_refresh_token = payload.refreshToken
        }
        if (payload.prompts !== undefined) {
          toSet.templagem_prompts_cache = payload.prompts
        }
        if (payload.icons !== undefined) {
          toSet.templagem_prompt_icons = payload.icons
        }
        await chrome.storage.local.set(toSet)
      },
      {
        ...data,
        refreshToken: data.token ? makeJwt(7200) : null
      }
    )
  }
}

export async function openPopupPage(
  context: BrowserContext,
  extensionId: string,
  options: {
    authenticated?: boolean
    prompts?: MockPrompt[]
  } = {}
): Promise<Page> {
  const { authenticated = true, prompts = DEFAULT_MOCK_PROMPTS } = options
  const token = authenticated ? makeJwt(3600) : null
  const refreshToken = authenticated ? makeJwt(7200) : null

  await seedStorage(context, {
    token,
    prompts: authenticated ? prompts : undefined
  })

  const page = await context.newPage()

  if (authenticated) {
    await page.addInitScript(
      ({ authToken, refreshTok, cachedPrompts }) => {
        localStorage.setItem("templagem_access_token", authToken)
        localStorage.setItem("templagem_refresh_token", refreshTok)
        localStorage.setItem(
          "templagem_prompts_cache",
          JSON.stringify(cachedPrompts)
        )
      },
      { authToken: token, refreshTok: refreshToken, cachedPrompts: prompts }
    )
  } else {
    await page.addInitScript(() => {
      localStorage.clear()
    })
  }

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  return page
}

export { expect } from "@playwright/test"
