import {
  DEFAULT_MOCK_PROMPTS,
  expect,
  makeJwt,
  seedStorage,
  test
} from "./fixtures"

test.describe("Multi-Platform Chat Input Discovery & Integration (E2E)", () => {
  test("Gemini: mounts overlay on .ql-editor focus and inserts prompt template", async ({
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

    const overlayDialog = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    const geminiAccent = await overlayDialog.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--accent-color").trim()
    )
    expect(geminiAccent).toBe("#0b57d0")

    const promptItem = geminiPage.getByText("Code Review Assistant")
    await expect(promptItem).toBeVisible({ timeout: 10000 })
    await promptItem.click()

    await expect(overlayDialog).not.toBeVisible()
    await expect(editor).toContainText("Please review this")
  })

  test("ChatGPT: mounts overlay on #prompt-textarea focus and inserts prompt", async ({
    context,
    chatgptPage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    const editor = chatgptPage.locator("#prompt-textarea").first()
    await expect(editor).toBeVisible()
    await editor.click()

    const overlayDialog = chatgptPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    const chatgptAccent = await overlayDialog.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--accent-color").trim()
    )
    expect(chatgptAccent).toBe("#000000")

    const promptItem = chatgptPage.getByText("Bug Triage Summary")
    await expect(promptItem).toBeVisible()
    await promptItem.click()

    await expect(overlayDialog).not.toBeVisible()
    await expect(editor).toContainText("Summarize bug report for")
  })

  test("Claude: mounts overlay on div.ProseMirror focus and inserts prompt", async ({
    context,
    claudePage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    const editor = claudePage.locator("div.ProseMirror").first()
    await expect(editor).toBeVisible()
    await editor.click()

    const overlayDialog = claudePage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    const claudeAccent = await overlayDialog.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--accent-color").trim()
    )
    expect(claudeAccent).toBe("#d97706")

    const promptItem = claudePage.getByText("Code Review Assistant")
    await expect(promptItem).toBeVisible()
    await promptItem.click()

    await expect(overlayDialog).not.toBeVisible()
    await expect(editor).toContainText("Please review this")
  })

  test("DeepSeek: mounts overlay on textarea#chat-input focus and updates value", async ({
    context,
    deepseekPage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    const textarea = deepseekPage.locator("textarea#chat-input").first()
    await expect(textarea).toBeVisible()
    await textarea.click()

    const overlayDialog = deepseekPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    const deepseekAccent = await overlayDialog.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--accent-color").trim()
    )
    expect(deepseekAccent).toBe("#4d6bfe")

    const promptItem = deepseekPage.getByText("Bug Triage Summary")
    await expect(promptItem).toBeVisible()
    await promptItem.click()

    await expect(overlayDialog).not.toBeVisible()
    await expect(textarea).toHaveValue(/Summarize bug report for/)
  })

  test("Chaos/Drift Resilience: autonomous scoring finds input with completely unknown classes", async ({
    context,
    chaosAiPage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    const unknownInput = chaosAiPage.locator(".x782jk9").first()
    await expect(unknownInput).toBeVisible()
    await unknownInput.click()

    const overlayDialog = chaosAiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    // Heuristic discovery identifies this editable container near submit button
    await expect(overlayDialog).toBeVisible({ timeout: 10000 })

    const promptItem = chaosAiPage.getByText("Code Review Assistant")
    await expect(promptItem).toBeVisible()
    await promptItem.click()

    await expect(overlayDialog).not.toBeVisible()
    await expect(unknownInput).toContainText("Please review this")
  })

  test("Clicks outside input (background, header, empty space) do NOT open overlay", async ({
    context,
    chatgptPage,
    geminiPage
  }) => {
    await seedStorage(context, {
      token: makeJwt(3600),
      prompts: DEFAULT_MOCK_PROMPTS
    })

    // Click background on ChatGPT page
    await chatgptPage.locator("body").click({ position: { x: 50, y: 50 } })
    await chatgptPage.waitForTimeout(500)
    const chatgptOverlay = chatgptPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(chatgptOverlay).not.toBeVisible()

    // Click background on Gemini page
    await geminiPage.locator("body").click({ position: { x: 50, y: 50 } })
    await geminiPage.waitForTimeout(500)
    const geminiOverlay = geminiPage.getByRole("dialog", {
      name: "TemplaGem Gemini Prompts"
    })
    await expect(geminiOverlay).not.toBeVisible()
  })
})

