import type { PlatformRule } from "../../../services/manifest/types"
import { insertTextIntoGeminiInput } from "../../gemini-input-sync"
import { BaseAdapter } from "./BaseAdapter"

export class GeminiAdapter extends BaseAdapter {
  readonly platformId = "gemini"

  constructor(rule: PlatformRule | null = null) {
    super(rule)
  }

  insertText(text: string, input?: HTMLElement | null): void {
    const el = input || this.findInput()
    if (!el) return
    insertTextIntoGeminiInput(el, text)
  }
}

