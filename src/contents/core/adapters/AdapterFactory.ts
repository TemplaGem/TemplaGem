import {
  matchUrlPattern,
  resolveActivePlatformRule
} from "../../../services/manifest/manifest-service"
import type { PlatformRule } from "../../../services/manifest/types"
import type { ChatInputAdapter } from "../types"
import { ChatGPTAdapter } from "./ChatGPTAdapter"
import { ClaudeAdapter } from "./ClaudeAdapter"
import { DeepSeekAdapter } from "./DeepSeekAdapter"
import { GeminiAdapter } from "./GeminiAdapter"
import { GenericAdapter } from "./GenericAdapter"

export class AdapterFactory {
  /**
   * Resolves and instantiates the proper ChatInputAdapter based on rule, URL, or element features.
   */
  static createAdapter(
    url?: string,
    rule?: PlatformRule | null,
    element?: HTMLElement | null
  ): ChatInputAdapter {
    const targetUrl =
      url || (typeof window !== "undefined" ? window.location.href : "")

    const activeRule = rule ?? resolveActivePlatformRule(targetUrl)

    if (activeRule) {
      switch (activeRule.id) {
        case "gemini":
          return new GeminiAdapter(activeRule)
        case "chatgpt":
          return new ChatGPTAdapter(activeRule)
        case "claude":
          return new ClaudeAdapter(activeRule)
        case "deepseek":
          return new DeepSeekAdapter(activeRule)
        default:
          return new GenericAdapter(activeRule)
      }
    }

    if (element) {
      if (
        element.closest("rich-textarea") ||
        element.matches(".ql-editor, rich-textarea, .ql-editor *")
      ) {
        return new GeminiAdapter(activeRule)
      }
      if (
        element.id === "prompt-textarea" ||
        Boolean(element.closest("#prompt-textarea"))
      ) {
        return new ChatGPTAdapter(activeRule)
      }
      if (
        element.id === "chat-input" ||
        Boolean(element.closest("#chat-input, .chat-input-wrapper"))
      ) {
        return new DeepSeekAdapter(activeRule)
      }
      if (
        element.classList.contains("ProseMirror") &&
        Boolean(element.closest("fieldset"))
      ) {
        return new ClaudeAdapter(activeRule)
      }
    }

    if (
      matchUrlPattern(targetUrl, "https://chatgpt.com/*") ||
      matchUrlPattern(targetUrl, "https://chat.openai.com/*")
    ) {
      return new ChatGPTAdapter(activeRule)
    }
    if (matchUrlPattern(targetUrl, "https://claude.ai/*")) {
      return new ClaudeAdapter(activeRule)
    }
    if (matchUrlPattern(targetUrl, "https://chat.deepseek.com/*")) {
      return new DeepSeekAdapter(activeRule)
    }

    // Default adapter for TemplaGem is GeminiAdapter
    return new GeminiAdapter(activeRule)
  }
}

