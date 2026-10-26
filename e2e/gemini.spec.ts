import {
  DEFAULT_MOCK_PROMPTS,
  expect,
  makeJwt,
  openPopupPage,
  seedStorage,
  test
} from "./fixtures"

test.describe("Gemini Page Content Script Integration (E2E)", () => {
  test("mounts Shadow DOM root, opens overlay on editor focus, and displays prompts", async ({
    context,
    geminiPage
  }) => {
    // Seed authenticated state and prompts
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    // Focus the Gemini input editor
    const editor = geminiPage
      .locator(".ql-editor, rich-textarea, div[contenteditable='true']")
      .first()
    await expect(editor).toBeVisible()

    // Focus the input to trigger TemplaGem overlay
    await editor.click()

    // Locate TemplaGem root inside the page
    const rootContainer = geminiPage.locator("#templagem-gemini-root")
    await expect(rootContainer).toBeAttached({ timeout: 10000 })

    // Verify shadow root contains overlay dialog (Playwright automatically pierces shadow roots)
    const overlayDialog = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    // Check that prompt items are displayed inside shadow DOM
    await expect(geminiPage.getByText("Code Review Assistant")).toBeVisible()
  })

  test("automatically detects login from extension popup and supports Reset search in Gemini overlay", async ({
    context,
    extensionId,
    geminiPage
  }) => {
    // 1. Start unauthenticated
    await seedStorage(context, {
      token: null,
      prompts: []
    })

    const editor = geminiPage.locator(".ql-editor").first()
    await expect(editor).toBeVisible()
    await editor.click()

    const overlayDialog = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })
    await expect(
      overlayDialog.getByText(
        /please sign in via the templagem extension popup/i
      )
    ).toBeVisible()

    // 2. Open extension popup, switch to Sign In tab, and sign in via AuthForm
    const popupPage = await openPopupPage(context, extensionId, {
      authenticated: false
    })
    await popupPage.getByRole("button", { name: "Sign In" }).click()
    await popupPage.getByLabel("Email").fill("user@example.com")
    await popupPage
      .getByLabel("Password", { exact: true })
      .fill("ValidPass123!")
    await popupPage
      .locator("form")
      .getByRole("button", { name: /^sign in$/i })
      .click()

    // Verify popup transitions to authenticated prompt list
    await expect(popupPage.getByText("Code Review Assistant")).toBeVisible()
    await popupPage.close()

    // 3. Verify Gemini overlay automatically detects login without page reload
    await expect(overlayDialog.getByText("Code Review Assistant")).toBeVisible({
      timeout: 10000
    })

    // 4. Test empty search state and "Reset search" recovery button in Gemini overlay
    const searchInput = overlayDialog.getByRole("textbox", {
      name: /search gemini prompts/i
    })
    await searchInput.fill("NonExistentPromptQuery")
    await expect(
      overlayDialog.getByText("No prompts match your search.")
    ).toBeVisible()

    const resetBtn = overlayDialog.getByRole("button", { name: "Reset search" })
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()

    await expect(overlayDialog.getByText("Code Review Assistant")).toBeVisible()
  })

  test("sees login on Gemini when Popup has expired accessToken + valid refreshToken or legacy prompthub_* keys", async ({
    context,
    extensionId,
    geminiPage
  }) => {
    const expiredAccess = makeJwt(-60)
    const validRefresh = makeJwt(86400)

    // Simulate user who logged in earlier: Popup localStorage has expired accessToken + valid refreshToken under legacy key, while chrome.storage.local was empty
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)
    await popupPage.evaluate(
      ({ access, refresh, prompts }) => {
        window.localStorage.clear()
        window.localStorage.setItem("prompthub_access_token", access)
        window.localStorage.setItem("prompthub_refresh_token", refresh)
        window.localStorage.setItem(
          "prompthub_prompts_cache",
          JSON.stringify(prompts)
        )
        return new Promise<void>((resolve) => {
          chrome.storage.local.clear(() => resolve())
        })
      },
      {
        access: expiredAccess,
        refresh: validRefresh,
        prompts: DEFAULT_MOCK_PROMPTS
      }
    )

    // Reload Popup so it initializes from localStorage and syncs to chrome.storage.local
    await popupPage.reload({ waitUntil: "domcontentloaded" })
    await expect(popupPage.getByText("Code Review Assistant")).toBeVisible()
    await popupPage.close()

    // Focus the Gemini editor and verify the Gemini overlay sees the login and shows prompts
    const editor = geminiPage.locator(".ql-editor").first()
    await expect(editor).toBeVisible()
    await editor.click()

    const overlayDialog = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })
    await expect(overlayDialog.getByText("Code Review Assistant")).toBeVisible({
      timeout: 10000
    })
    await expect(
      overlayDialog.getByText(/please sign in/i)
    ).not.toBeVisible()
  })

  test("inserts prompt template, highlights variables, and supports Tab navigation", async ({
    context,
    geminiPage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    const editor = geminiPage.locator(".ql-editor").first()
    await expect(editor).toBeVisible()
    await editor.click()

    // Wait for overlay to appear
    const overlayDialog = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    // Wait for prompt items to be loaded and click first prompt
    const promptItem = geminiPage.getByText("Code Review Assistant")
    await expect(promptItem).toBeVisible({ timeout: 10000 })
    await promptItem.click()

    // Overlay closes
    await expect(overlayDialog).not.toBeVisible()

    // Verify template text inserted and variables highlighted
    await geminiPage.waitForFunction(() => {
      const el = document.querySelector(".ql-editor")
      const vars = el?.querySelectorAll(".ph-template-variable")
      return vars && vars.length >= 2
    })

    const editorState = await geminiPage.evaluate(() => {
      const el = document.querySelector(".ql-editor")
      const vars = Array.from(
        el?.querySelectorAll(".ph-template-variable") || []
      )
      return {
        text: el?.textContent || "",
        varCount: vars.length,
        firstActive: vars[0]?.classList.contains("ph-template-variable-active")
      }
    })

    expect(editorState.varCount).toBe(2)
    expect(editorState.firstActive).toBe(true)

    // Allow initial caret to settle before typing
    await geminiPage.waitForTimeout(100)

    // Type into first variable
    await geminiPage.keyboard.type("TypeScript", { delay: 20 })

    // Press Tab to jump to the second variable
    await geminiPage.keyboard.press("Tab")

    const secondVarActive = await geminiPage.evaluate(() => {
      const vars = document.querySelectorAll(".ph-template-variable")
      return vars[1]?.classList.contains("ph-template-variable-active")
    })
    expect(secondVarActive).toBe(true)

    // Allow caret and DOM to settle after Tab before typing
    await geminiPage.waitForTimeout(100)

    // Type into second variable
    await geminiPage.keyboard.type("Security", { delay: 20 })

    // Press Enter to clean up brackets before prompt submission
    await geminiPage.keyboard.press("Enter")

    const finalEditorText = await geminiPage.evaluate(() => {
      return document.querySelector(".ql-editor")?.textContent || ""
    })
    expect(finalEditorText).toContain("TypeScript")
    expect(finalEditorText).toContain("Security")
    expect(finalEditorText).not.toContain("{{")
    expect(finalEditorText).not.toContain("}}")
  })
})
