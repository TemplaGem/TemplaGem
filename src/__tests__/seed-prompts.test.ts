import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearPromptsDB,
  getAllPromptsDB,
  getPromptDB,
  resetFallbackDB
} from "../services/indexed-db"
import {
  INITIAL_TEST_PROMPTS,
  isPromptsInitialized,
  seedInitialPrompts
} from "../services/seed-prompts"
import {
  clearSyncQueue,
  getStoredPrompts,
  getSyncQueue,
  saveStoredPrompts
} from "../services/sync-storage"
import { extractTemplateVariables, hasTemplateVariables } from "../utils/template"

describe("Seed Initial Prompts on Frontend", () => {
  beforeEach(async () => {
    await resetFallbackDB()
    await clearSyncQueue()
  })

  afterEach(async () => {
    await resetFallbackDB()
  })

  describe("INITIAL_TEST_PROMPTS Catalog", () => {
    it("contains at least 5 high-quality prompts in English", () => {
      expect(INITIAL_TEST_PROMPTS.length).toBeGreaterThanOrEqual(5)
    })

    it("verifies every prompt has title, body with template variables, tags, icon, and access", () => {
      for (const prompt of INITIAL_TEST_PROMPTS) {
        expect(prompt.title.trim().length).toBeGreaterThan(0)
        expect(prompt.body.trim().length).toBeGreaterThan(0)
        expect(prompt.tags.length).toBeGreaterThan(0)
        expect(prompt.icon.trim().length).toBeGreaterThan(0)
        expect(["public", "private", "link"]).toContain(prompt.access)

        // Verifies each prompt body contains {{variable}} syntax
        expect(hasTemplateVariables(prompt.body)).toBe(true)
        const vars = extractTemplateVariables(prompt.body)
        expect(vars.length).toBeGreaterThan(0)
      }
    })
  })

  describe("seedInitialPrompts Execution", () => {
    it("seeds prompts into IndexedDB and enqueues to syncQueue.created on first run", async () => {
      expect(await isPromptsInitialized()).toBe(false)

      const seeded = await seedInitialPrompts()
      expect(seeded).toHaveLength(INITIAL_TEST_PROMPTS.length)
      expect(await isPromptsInitialized()).toBe(true)

      // Verified in IndexedDB
      const allDB = await getAllPromptsDB()
      expect(allDB).toHaveLength(INITIAL_TEST_PROMPTS.length)

      for (const p of seeded) {
        expect(p._id).toBeDefined()
        expect(p.clientTempId).toBeDefined()
        expect(p._id).toBe(p.clientTempId)

        const fromDB = await getPromptDB(p._id!)
        expect(fromDB).not.toBeNull()
        expect(fromDB?.title).toBe(p.title)
      }

      // Verified in syncQueue.created
      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(INITIAL_TEST_PROMPTS.length)
      expect(queue.created.map((q) => q.title)).toEqual(
        expect.arrayContaining(INITIAL_TEST_PROMPTS.map((t) => t.title))
      )
    })

    it("is idempotent: subsequent calls do not duplicate prompts", async () => {
      const firstRun = await seedInitialPrompts()
      expect(firstRun).toHaveLength(INITIAL_TEST_PROMPTS.length)

      const secondRun = await seedInitialPrompts()
      expect(secondRun).toHaveLength(INITIAL_TEST_PROMPTS.length)

      const allDB = await getAllPromptsDB()
      expect(allDB).toHaveLength(INITIAL_TEST_PROMPTS.length)

      const queue = await getSyncQueue()
      expect(queue.created).toHaveLength(INITIAL_TEST_PROMPTS.length)
    })

    it("respects saveStoredPrompts([]) without re-seeding if user deleted all prompts", async () => {
      // Seed first
      await seedInitialPrompts()
      expect(await getAllPromptsDB()).toHaveLength(INITIAL_TEST_PROMPTS.length)

      // User deletes all prompts
      await clearPromptsDB()
      await saveStoredPrompts([])

      const stored = await getStoredPrompts()
      expect(stored).toHaveLength(0)
    })
  })
})
