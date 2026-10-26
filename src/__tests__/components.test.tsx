import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import AddNewBtn from "~src/components/AddNewBtn/AddNewBtn"
import AuthForm from "~src/components/AuthForm/AuthForm"
import Header from "~src/components/Header/Header"
import PromptCard from "~src/components/PromptCard/PromptCard"
import SortSelect from "~src/components/SortSelect/SortSelect"
import TemplaGemLogo from "~src/components/TemplaGemLogo/TemplaGemLogo"
import PromptIcon, {
  resolvePromptIconType
} from "~src/components/PromptIcon/PromptIcon"
import SearchField from "~src/components/SearchField/SearchField"
import Btn from "~src/components/ui/Btn/Btn"
import BackendBadge from "~src/components/BackendBadge/BackendBadge"
import * as authModule from "~src/utils/auth"

describe("UI & Presentational Components", () => {
  it("renders Header with TemplaGem title and settings button", () => {
    render(<Header />)
    expect(
      screen.getByRole("heading", { name: "TemplaGem" })
    ).toBeInTheDocument()
    expect(screen.queryByTestId("backend-badge")).not.toBeInTheDocument()
    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("renders BackendBadge with custom and default apiUrl", () => {
    const { rerender } = render(<BackendBadge />)
    expect(screen.getByTestId("backend-badge")).toBeInTheDocument()
    expect(screen.getByText("Backend:")).toBeInTheDocument()

    rerender(<BackendBadge apiUrl="http://custom-api:9000/api" />)
    expect(screen.getByText("http://custom-api:9000/api")).toBeInTheDocument()
  })

  it("renders Btn in primary and secondary variants and handles click", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(
      <Btn
        styleType="primary"
        onClick={onClick}>
        Primary Action
      </Btn>
    )

    await user.click(screen.getByRole("button", { name: "Primary Action" }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Btn
        styleType="secondary"
        onClick={onClick}>
        Secondary Action
      </Btn>
    )
    expect(
      screen.getByRole("button", { name: "Secondary Action" })
    ).toBeInTheDocument()
  })

  it("renders AddNewBtn and triggers callback", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<AddNewBtn onClick={onClick} />)

    await user.click(screen.getByRole("button", { name: /create new prompt/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("renders SearchField, emits query changes, and clears via button or Escape", async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchField onSearch={onSearch} />)

    const input = screen.getByRole("textbox", { name: /search prompts/i })
    await user.type(input, "react")
    expect(onSearch).toHaveBeenLastCalledWith("react")

    // Clear button resets query
    await user.click(screen.getByRole("button", { name: /clear search/i }))
    expect(onSearch).toHaveBeenLastCalledWith("")
    expect(input).toHaveValue("")

    // Escape key resets query
    await user.type(input, "typescript{Escape}")
    expect(onSearch).toHaveBeenLastCalledWith("")
    expect(input).toHaveValue("")
  })

  it("renders PromptIcon for all preset types, aliases, tags and fallback", () => {
    const types = [
      "development",
      "daily",
      "education",
      "entertainment",
      "other",
      "unknown-tag"
    ]
    for (const type of types) {
      const { container, unmount } = render(<PromptIcon type={type} />)
      expect(container.querySelector("svg")).toBeInTheDocument()
      unmount()
    }

    // Resolves alias tags
    expect(resolvePromptIconType(undefined, ["code"])).toBe("development")
    expect(resolvePromptIconType(undefined, ["routine"])).toBe("daily")
    expect(resolvePromptIconType(undefined, ["study"])).toBe("education")
    expect(resolvePromptIconType(undefined, ["movie"])).toBe("entertainment")
    expect(resolvePromptIconType(undefined, ["custom-random"])).toBe("other")
    expect(resolvePromptIconType()).toBe("other")

    // Renders with className
    const { container: withClass } = render(
      <PromptIcon
        type="development"
        className="custom-icon-class"
      />
    )
    expect(withClass.querySelector(".custom-icon-class")).toBeInTheDocument()

    // Renders with tags prop resolving alias
    const { container: withTags } = render(
      <PromptIcon tags={["random", "programming"]} />
    )
    expect(withTags.querySelector("svg")).toBeInTheDocument()
  })

  it("renders TemplaGemLogo with default, number and string sizes", () => {
    const { rerender } = render(<TemplaGemLogo />)
    const logoEl = screen.getByTestId("templagem-logo")
    expect(logoEl).toBeInTheDocument()
    expect(logoEl.querySelector("svg")).toBeInTheDocument()

    rerender(
      <TemplaGemLogo
        size={32}
        className="test-logo"
      />
    )
    expect(logoEl).toHaveClass("test-logo")
    expect(logoEl).toHaveStyle({ width: "32px", height: "32px" })

    rerender(
      <TemplaGemLogo
        size="24px"
        className="test-logo-str"
      />
    )
    expect(logoEl).toHaveStyle({ width: "24px", height: "24px" })
  })

  it("renders PromptCard, handles card click, copies description without bubbling and resets copied state", async () => {
    const user = userEvent.setup()
    const onCardClick = vi.fn()
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <PromptCard
        name="TS Assistant"
        description="Review TypeScript code"
        type="development"
        tags={["typescript", "code"]}
        onClick={onCardClick}
      />
    )

    expect(screen.getByText("TS Assistant")).toBeInTheDocument()
    expect(screen.getByText("Review TypeScript code")).toBeInTheDocument()
    expect(screen.getByText("#typescript")).toBeInTheDocument()
    expect(screen.getByText("#code")).toBeInTheDocument()

    // Click copy button -> should NOT trigger onCardClick
    const copyBtn = screen.getByRole("button", { name: /copy prompt/i })
    await user.click(copyBtn)
    expect(writeTextSpy).toHaveBeenCalledWith("Review TypeScript code")
    expect(onCardClick).not.toHaveBeenCalled()

    // Click card -> triggers onCardClick
    await user.click(screen.getByText("TS Assistant"))
    expect(onCardClick).toHaveBeenCalledTimes(1)

    // Keyboard navigation on card (Enter and Space keys)
    const cardItem = screen.getByRole("listitem")
    cardItem.focus()
    await user.keyboard("{Enter}")
    expect(onCardClick).toHaveBeenCalledTimes(2)
    await user.keyboard(" ")
    expect(onCardClick).toHaveBeenCalledTimes(3)
    await user.keyboard("{ArrowDown}")
    expect(onCardClick).toHaveBeenCalledTimes(3)

    // Advance timer to trigger setCopied(false)
    vi.useFakeTimers()
    const { container: timerContainer } = render(
      <PromptCard
        name="Timer Prompt"
        description="Timer prompt desc"
        type="development"
      />
    )
    const btn = timerContainer.querySelector("button")!
    btn.click()
    vi.advanceTimersByTime(1600)
    vi.useRealTimers()
  })

  it("renders SortSelect, handles opening, closing on Escape/outside, and option selection", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    const { unmount } = render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <SortSelect value="created-desc" onChange={onChange} />
      </div>
    )

    const trigger = screen.getByRole("button", { name: "Sort prompts" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")

    // Open dropdown
    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    // Keydown other than Escape does not close
    fireEvent.keyDown(document, { key: "Enter" })
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    // Press Escape to close
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    // Open and click inside container does not close
    await user.click(trigger)
    fireEvent.mouseDown(trigger)
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    // Click outside to close
    fireEvent.mouseDown(screen.getByTestId("outside-element"))
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    // Open and select an option
    await user.click(trigger)
    const titleAscBtn = screen.getByRole("button", { name: /alphabetical \(a → z\)/i })
    await user.click(titleAscBtn)
    expect(onChange).toHaveBeenCalledWith("title-asc")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    unmount()
  })
})

describe("AuthForm Component", () => {
  it("switches between Sign Up and Sign In modes and handles validation/API errors and success", async () => {
    const user = userEvent.setup()
    const onAuthSuccess = vi.fn()

    const registerSpy = vi.spyOn(authModule, "register")
    const loginSpy = vi.spyOn(authModule, "login")

    render(<AuthForm onAuthSuccess={onAuthSuccess} />)

    // Default is register mode
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument()

    // Submit empty form -> shows Zod validation error
    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument()

    // Switch to Sign In mode
    await user.click(screen.getByRole("button", { name: "Sign In" }))
    expect(screen.queryByText(/invalid email/i)).not.toBeInTheDocument()

    // Fill valid credentials and test login error
    await user.type(screen.getByLabelText(/email/i), "user@example.com")
    await user.type(screen.getByLabelText(/^password$/i), "Password1!")

    loginSpy.mockRejectedValueOnce(new Error("Invalid credentials"))
    const submitButtons = screen.getAllByRole("button", { name: "Sign In" })
    await user.click(submitButtons[submitButtons.length - 1])
    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument()

    // Test show/hide password toggle button
    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute("type", "password")

    const togglePasswordBtn = screen.getByRole("button", {
      name: /show password/i
    })
    expect(togglePasswordBtn).toBeInTheDocument()

    await user.click(togglePasswordBtn)
    expect(passwordInput).toHaveAttribute("type", "text")
    expect(
      screen.getByRole("button", { name: /hide password/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute("type", "password")

    // Switch back to Sign Up and succeed
    await user.click(screen.getByRole("button", { name: "Sign Up" }))
    registerSpy.mockResolvedValueOnce({ message: "Registered" })
    loginSpy.mockResolvedValueOnce({
      accessToken: "acc",
      refreshToken: "ref"
    })

    await user.click(screen.getByRole("button", { name: /create account/i }))
    expect(registerSpy).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1!"
    })
    expect(loginSpy).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1!"
    })
    expect(onAuthSuccess).toHaveBeenCalledTimes(1)
  })

  it("renders AddNewBtn without onClick prop and handles click", async () => {
    const user = userEvent.setup()
    render(<AddNewBtn />)
    const btn = screen.getByRole("button", { name: "Create new prompt" })
    expect(btn).toBeInTheDocument()
    await user.click(btn)
  })
})
