import { MdHelpOutline, MdSettings } from "react-icons/md"

import TemplaGemLogo from "../TemplaGemLogo/TemplaGemLogo"
import css from "./Header.module.scss"

interface HeaderProps {
  onSettingsClick?: () => void
  isSettingsOpen?: boolean
  onHelpClick?: () => void
}

export default function Header({
  onSettingsClick,
  isSettingsOpen = false,
  onHelpClick
}: HeaderProps) {
  return (
    <header className={css.header}>
      <div className={css.logoContainer}>
        <TemplaGemLogo />
        <h1 className={css.logoText}>TemplaGem</h1>
      </div>
      <div className={css.actions}>
        {onHelpClick && (
          <button
            type="button"
            className={css.helpBtn}
            onClick={onHelpClick}
            aria-label="Tutorial & Guide"
            title="Tutorial & Guide">
            <MdHelpOutline size={18} />
          </button>
        )}
        <button
          type="button"
          className={`${css.settingsBtn} ${isSettingsOpen ? css.settingsBtnActive : ""}`}
          onClick={onSettingsClick}
          aria-label="Settings"
          aria-pressed={isSettingsOpen}>
          <MdSettings size={18} />
        </button>
      </div>
    </header>
  )
}
