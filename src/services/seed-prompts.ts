import { setCachedPrompts } from "../prompts-api"
import type { IPrompt, SyncPromptItemDto } from "../types"
import {
  getAllPromptsDB,
  getMetaDB,
  putPromptsDB,
  setMetaDB
} from "./indexed-db"
import { generateTempId } from "./sync-storage"
import { getSyncQueue, saveSyncQueue } from "./sync-storage"

export interface InitialPromptTemplate {
  title: string
  body: string
  tags: string[]
  icon: string
  access: "public" | "private" | "link"
}

export const INITIAL_TEST_PROMPTS: InitialPromptTemplate[] = [
  {
    title: "Code Review & Optimization",
    body: "Please review the following {{language}} code for performance bottlenecks, code smells, security vulnerabilities, and adherence to clean code best practices:\n\n```{{language}}\n{{code}}\n```\n\nProvide constructive feedback with a refactored version and explanations.",
    tags: ["development", "code-review", "clean-code"],
    icon: "code",
    access: "private"
  },
  {
    title: "Professional Email Polisher",
    body: "Rewrite the following draft email to make it sound {{tone}} (e.g. friendly, assertive, formal, polite) while keeping the core message intact and concise:\n\n\"{{draft_email}}\"\n\nAlso suggest 2 clear and engaging subject lines.",
    tags: ["writing", "email", "productivity"],
    icon: "mail",
    access: "private"
  },
  {
    title: "Explain Concept Simply (ELI5)",
    body: "Explain the concept of \"{{concept}}\" to a {{target_audience}} using intuitive real-world analogies and everyday examples without confusing technical jargon. Highlight why it matters.",
    tags: ["learning", "education", "simplify"],
    icon: "brain",
    access: "private"
  },
  {
    title: "Bug Investigator & Fixer",
    body: "I am encountering the following error in my application:\n\nError Message:\n{{error_message}}\n\nContext / Code Snippet:\n```\n{{context}}\n```\n\nDiagnose the root cause step-by-step and provide a working fix with explanations.",
    tags: ["debugging", "troubleshooting", "development"],
    icon: "bug",
    access: "private"
  },
  {
    title: "Meeting Summary & Action Items",
    body: "Summarize the following meeting notes into structured bullet points:\n\n1. Key Decisions Made\n2. Open Questions & Blockers\n3. Action Items (with assignees and deadlines)\n\nMeeting Notes:\n\"{{meeting_notes}}\"",
    tags: ["productivity", "meeting", "summary"],
    icon: "list-checks",
    access: "private"
  }
]

export const PROMPTS_INITIALIZED_KEY = "prompts_initialized"

export async function isPromptsInitialized(): Promise<boolean> {
  const isInit = await getMetaDB<boolean>(PROMPTS_INITIALIZED_KEY)
  return Boolean(isInit)
}

export async function seedInitialPrompts(force = false): Promise<IPrompt[]> {
  const isInit = await getMetaDB<boolean>(PROMPTS_INITIALIZED_KEY)
  if (isInit && !force) {
    const existing = await getAllPromptsDB()
    if (existing.length > 0) {
      return existing
    }
  }

  const now = new Date().toISOString()
  const seededPrompts: IPrompt[] = INITIAL_TEST_PROMPTS.map((item) => {
    const tempId = generateTempId()
    return {
      _id: tempId,
      id: tempId,
      clientTempId: tempId,
      title: item.title,
      body: item.body,
      tags: [...item.tags],
      icon: item.icon,
      access: item.access,
      createdAt: now,
      updatedAt: now
    }
  })

  // 1. Persist directly into IndexedDB
  await putPromptsDB(seededPrompts)
  await setMetaDB(PROMPTS_INITIALIZED_KEY, true)
  setCachedPrompts(seededPrompts)

  // 2. Enqueue into syncQueue.created so they sync to backend when connected
  const queue = await getSyncQueue()
  for (const p of seededPrompts) {
    const alreadyInQueue = queue.created.some(
      (item) => item.clientTempId === p.clientTempId
    )
    if (!alreadyInQueue) {
      const syncItem: SyncPromptItemDto = {
        clientTempId: p.clientTempId,
        title: p.title,
        body: p.body,
        tags: p.tags,
        icon: p.icon,
        access: p.access,
        createdAt: now,
        updatedAt: now
      }
      queue.created.push(syncItem)
    }
  }
  await saveSyncQueue(queue)

  return seededPrompts
}
