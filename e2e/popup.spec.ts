import { expect, openPopupPage, test } from "./fixtures"

test.describe("Popup Extension Interface (E2E)", () => {
  test("displays AuthForm when unauthenticated and supports switching modes", async ({
    context,
    extensionId
  }) => {
    const page = await openPopupPage(context, extensionId, {
      authenticated: false
    })

    // Verify AuthForm is visible
    const authForm = page.locator("form")
    await expect(authForm).toBeVisible()
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()

    // Switch to Sign Up tab
    const signUpTab = page.getByRole("button", { name: "Sign Up" })
    await signUpTab.click()
    await expect(
      page.getByRole("button", { name: "Create Account" })
    ).toBeVisible()

    await page.close()
  })

  test("renders prompt list, search field, and tag filters in authenticated state", async ({
    context,
    extensionId
  }) => {
    const page = await openPopupPage(context, extensionId, {
      authenticated: true
    })

    // Verify TemplaGem header
    await expect(page.locator("header h1")).toHaveText("TemplaGem")

    // Verify prompt cards rendered with title and tags
    await expect(page.getByText("Code Review Assistant")).toBeVisible()
    await expect(page.getByText("Bug Triage Summary")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "#development" })
    ).toBeVisible()

    // Test Search filtering
    const searchInput = page.getByRole("textbox", { name: /search prompts/i })
    await searchInput.fill("Review")
    await expect(page.getByText("Code Review Assistant")).toBeVisible()
    await expect(page.getByText("Bug Triage Summary")).not.toBeVisible()

    // Clear search
    await page.getByRole("button", { name: /clear search/i }).click()
    await expect(page.getByText("Bug Triage Summary")).toBeVisible()

    // Test Tag filtering
    await page.getByRole("button", { name: "#routine" }).click()
    await expect(page.getByText("Bug Triage Summary")).toBeVisible()
    await expect(page.getByText("Code Review Assistant")).not.toBeVisible()

    // Reset tag filter to All
    await page.getByRole("button", { name: "All" }).click()
    await expect(page.getByText("Code Review Assistant")).toBeVisible()
    await expect(page.getByText("Bug Triage Summary")).toBeVisible()

    // Test Sort dropdown
    const sortButton = page.getByRole("button", { name: /sort prompts/i })
    await expect(sortButton).toBeVisible()
    await page.screenshot({ path: "playwright_sort_button_closed.png" })
    await sortButton.click()

    // Verify sort options menu is open
    const sortMenu = page.getByRole("listbox", { name: /sort options/i })
    await expect(sortMenu).toBeVisible()
    await page.screenshot({ path: "playwright_sort_dropdown_open.png" })
    await expect(
      sortMenu.getByRole("button", { name: /alphabetical \(a → z\)/i })
    ).toBeVisible()

    // Select Alphabetical (A → Z)
    await sortMenu
      .getByRole("button", { name: /alphabetical \(a → z\)/i })
      .click()
    await expect(sortMenu).not.toBeVisible()

    // Verify order: "Bug Triage Summary" comes before "Code Review Assistant"
    const titles = page.locator("h3[class*='promptCardTitle']")
    await expect(titles.first()).toHaveText("Bug Triage Summary")
    await expect(titles.nth(1)).toHaveText("Code Review Assistant")

    await page.close()
  })

  test("supports icon selection via IconPicker in CreatePromptModal", async ({
    context,
    extensionId
  }) => {
    const page = await openPopupPage(context, extensionId, {
      authenticated: true
    })

    // Click Add New Prompt button
    const addBtn = page.getByRole("button", { name: /create new prompt/i })
    await addBtn.click()

    // Modal dialog is open
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible()
    await expect(
      modal.getByRole("heading", { name: "New Prompt" })
    ).toBeVisible()

    // Open IconPicker
    const iconTrigger = modal.getByTestId("icon-picker-trigger")
    await iconTrigger.click()

    // Verify IconPicker modal
    const iconModal = page.getByTestId("icon-picker-modal")
    await expect(iconModal).toBeVisible()
    await expect(iconModal.getByText("Choose an icon")).toBeVisible()

    // Search and select "rocket" icon
    const searchIcons = iconModal.getByRole("textbox", {
      name: /search icons/i
    })
    await searchIcons.fill("rocket")
    const rocketTile = iconModal.getByTestId("icon-tile-rocket")
    await expect(rocketTile).toBeVisible()
    await rocketTile.click()

    // IconPicker modal closes and trigger reflects selection
    await expect(iconModal).not.toBeVisible()
    await expect(iconTrigger).toContainText("Rocket")

    // Fill title and template body with variable
    await modal.getByLabel("Title").fill("Deploy Service")
    await modal
      .getByLabel("Prompt text")
      .fill("Deploy {{service}} to {{environment}}.")

    // Verify template preview box renders with variable badge
    const previewBox = modal.getByTestId("template-preview-box")
    await expect(previewBox).toBeVisible()
    await expect(
      previewBox.getByTestId("template-variable-service")
    ).toBeVisible()

    // Close modal via Close button
    await modal.getByRole("button", { name: /close modal/i }).click()
    await expect(modal).not.toBeVisible()

    await page.close()
  })

  test("opens PromptDetailsModal, displays description with relaxed line spacing, and changes icon", async ({
    context,
    extensionId
  }) => {
    const page = await openPopupPage(context, extensionId, {
      authenticated: true
    })

    // Click first prompt card to view details
    await page.getByText("Code Review Assistant").click()

    const detailsModal = page.getByRole("dialog")
    await expect(detailsModal).toBeVisible()
    await expect(
      detailsModal.getByRole("heading", { name: "Code Review Assistant" })
    ).toBeVisible()

    // Verify description body box line-height and content
    const bodyBox = detailsModal.locator("[class*='bodyBox']")
    await expect(bodyBox).toBeVisible()
    const lineHeight = await bodyBox.evaluate(
      (el) => window.getComputedStyle(el).lineHeight
    )
    expect(parseInt(lineHeight, 10)).toBeGreaterThanOrEqual(24)

    // Interactive icon picker in header (compact mode)
    const compactIconTrigger = detailsModal.getByTestId("icon-picker-trigger")
    await expect(compactIconTrigger).toBeVisible()
    await compactIconTrigger.click()

    const iconModal = page.getByTestId("icon-picker-modal")
    await expect(iconModal).toBeVisible()
    await iconModal.getByTestId("icon-tile-zap").click()
    await expect(iconModal).not.toBeVisible()

    // Copy prompt text
    const copyBtn = detailsModal.getByRole("button", { name: /copy/i })
    await copyBtn.click()
    await expect(detailsModal.getByText("Copied!")).toBeVisible()

    // Close modal
    await detailsModal
      .getByRole("button", { name: "Close", exact: true })
      .click()
    await expect(detailsModal).not.toBeVisible()

    await page.close()
  })

  test("switches theme automatically in Auto mode and supports manual Dark/Light selection in Settings", async ({
    context,
    extensionId
  }) => {
    // 1. Open popup page
    const page = await openPopupPage(context, extensionId, {
      authenticated: true
    })
    const popupRoot = page.locator(".popup")
    await expect(popupRoot).toBeVisible()

    // 2. Open SettingsPage
    const settingsBtn = page.getByRole("button", { name: /settings/i })
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()

    const settingsHeading = page.getByRole("heading", { name: "Settings" })
    await expect(settingsHeading).toBeVisible()

    // Verify Backend connection info is hidden by default on SettingsPage
    await expect(page.getByTestId("backend-badge")).not.toBeVisible()
    await expect(page.getByText("Server Connection")).not.toBeVisible()

    // 5 quick clicks on Settings heading reveal Backend connection info
    for (let i = 0; i < 5; i++) {
      await settingsHeading.click()
    }
    await expect(page.getByTestId("backend-badge")).toBeVisible()
    await expect(page.getByText("Server Connection")).toBeVisible()

    // 3. Verify Theme mode segment buttons are visible
    const autoBtn = page.getByRole("button", { name: "Auto" })
    const lightBtn = page.getByRole("button", { name: "Light" })
    const darkBtn = page.getByRole("button", { name: "Dark" })

    await expect(autoBtn).toBeVisible()
    await expect(lightBtn).toBeVisible()
    await expect(darkBtn).toBeVisible()

    // Auto is initially selected
    await expect(autoBtn).toHaveAttribute("aria-pressed", "true")

    // 4. Switch manually to Light
    await lightBtn.click()
    await expect(lightBtn).toHaveAttribute("aria-pressed", "true")
    await expect(popupRoot).toHaveAttribute("data-theme", "light")

    // 5. Switch manually to Dark
    await darkBtn.click()
    await expect(darkBtn).toHaveAttribute("aria-pressed", "true")
    await expect(popupRoot).toHaveAttribute("data-theme", "dark")

    // 6. Return to Auto and emulate dark system theme
    await autoBtn.click()
    await expect(autoBtn).toHaveAttribute("aria-pressed", "true")

    await page.emulateMedia({ colorScheme: "dark" })
    await expect(popupRoot).toHaveAttribute("data-theme", "dark")

    await page.emulateMedia({ colorScheme: "light" })
    await expect(popupRoot).toHaveAttribute("data-theme", "light")

    await page.close()
  })
})

