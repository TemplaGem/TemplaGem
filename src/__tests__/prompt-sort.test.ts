import { describe, expect, it, vi } from "vitest"

import type { IPrompt } from "../types"
import {
  DEFAULT_SORT_OPTION,
  getStoredSortOption,
  setStoredSortOption,
  SORT_STORAGE_KEY,
  sortPrompts
} from "../utils/prompt-sort"

const samplePrompts: IPrompt[] = [
  {
    _id: "1",
    title: "Banana Prompt",
    body: "Banana body",
    tags: ["food"],
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-05T10:00:00Z")
  },
  {
    _id: "2",
    title: "Apple Prompt",
    body: "Apple body",
    tags: ["food"],
    createdAt: new Date("2026-01-03T10:00:00Z"),
    updatedAt: new Date("2026-01-02T10:00:00Z")
  },
  {
    _id: "3",
    title: "Cherry Prompt",
    body: "Cherry body",
    tags: ["food"],
    createdAt: new Date("2026-01-02T10:00:00Z"),
    updatedAt: new Date("2026-01-08T10:00:00Z")
  }
]

describe("prompt-sort utility", () => {
  it("sorts by createdAt descending (newest first)", () => {
    const sorted = sortPrompts(samplePrompts, "created-desc")
    expect(sorted.map((p) => p._id)).toEqual(["2", "3", "1"])
  })

  it("sorts by createdAt ascending (oldest first)", () => {
    const sorted = sortPrompts(samplePrompts, "created-asc")
    expect(sorted.map((p) => p._id)).toEqual(["1", "3", "2"])
  })

  it("sorts by title alphabetical ascending (A -> Z)", () => {
    const sorted = sortPrompts(samplePrompts, "title-asc")
    expect(sorted.map((p) => p._id)).toEqual(["2", "1", "3"])
  })

  it("sorts by title alphabetical descending (Z -> A)", () => {
    const sorted = sortPrompts(samplePrompts, "title-desc")
    expect(sorted.map((p) => p._id)).toEqual(["3", "1", "2"])
  })

  it("sorts by updatedAt descending (newest modification first)", () => {
    const sorted = sortPrompts(samplePrompts, "updated-desc")
    expect(sorted.map((p) => p._id)).toEqual(["3", "1", "2"])
  })

  it("sorts by updatedAt ascending (oldest modification first)", () => {
    const sorted = sortPrompts(samplePrompts, "updated-asc")
    expect(sorted.map((p) => p._id)).toEqual(["2", "1", "3"])
  })

  it("handles string date timestamps", () => {
    const withStringDates: IPrompt[] = [
      {
        _id: "s1",
        title: "S1",
        body: "B1",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date
      },
      {
        _id: "s2",
        title: "S2",
        body: "B2",
        tags: [],
        createdAt: "2026-01-02T00:00:00.000Z" as unknown as Date
      }
    ]
    const sorted = sortPrompts(withStringDates, "created-desc")
    expect(sorted.map((p) => p._id)).toEqual(["s2", "s1"])
  })

  it("falls back to createdAt when updatedAt is not defined", () => {
    const withNoUpdated: IPrompt[] = [
      {
        _id: "u1",
        title: "U1",
        body: "B1",
        tags: [],
        createdAt: new Date("2026-01-01T00:00:00Z")
      },
      {
        _id: "u2",
        title: "U2",
        body: "B2",
        tags: [],
        createdAt: new Date("2026-01-02T00:00:00Z")
      }
    ]
    const sortedDesc = sortPrompts(withNoUpdated, "updated-desc")
    expect(sortedDesc.map((p) => p._id)).toEqual(["u2", "u1"])
  })

  it("preserves stable relative order when timestamps are equal", () => {
    const equalDates: IPrompt[] = [
      {
        _id: "eq1",
        title: "Same Title",
        body: "B1",
        tags: [],
        createdAt: new Date("2026-01-01T00:00:00Z")
      },
      {
        _id: "eq2",
        title: "Same Title",
        body: "B2",
        tags: [],
        createdAt: new Date("2026-01-01T00:00:00Z")
      }
    ]
    const sortedDesc = sortPrompts(equalDates, "created-desc")
    expect(sortedDesc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    const sortedAsc = sortPrompts(equalDates, "created-asc")
    expect(sortedAsc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    const sortedTitleAsc = sortPrompts(equalDates, "title-asc")
    expect(sortedTitleAsc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    const sortedTitleDesc = sortPrompts(equalDates, "title-desc")
    expect(sortedTitleDesc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    const sortedUpdatedDesc = sortPrompts(equalDates, "updated-desc")
    expect(sortedUpdatedDesc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    const sortedUpdatedAsc = sortPrompts(equalDates, "updated-asc")
    expect(sortedUpdatedAsc.map((p) => p._id)).toEqual(["eq1", "eq2"])

    // @ts-expect-error test invalid sort option
    const sortedDefault = sortPrompts(equalDates, "unknown-sort")
    expect(sortedDefault.map((p) => p._id)).toEqual(["eq1", "eq2"])
  })

  it("reads and writes stored sort option in localStorage and chrome storage", () => {
    localStorage.clear()
    expect(getStoredSortOption()).toBe(DEFAULT_SORT_OPTION)

    // Test invalid stored value in localStorage falls back to default
    localStorage.setItem(SORT_STORAGE_KEY, "invalid-option")
    expect(getStoredSortOption()).toBe(DEFAULT_SORT_OPTION)

    // Test parseDateValue with invalid date string and invalid Date object
    const withInvalidDates: IPrompt[] = [
      {
        _id: "inv1",
        title: "Inv1",
        body: "B1",
        tags: [],
        createdAt: "invalid-date" as unknown as Date,
        updatedAt: new Date(NaN)
      },
      {
        _id: "inv2",
        title: "Inv2",
        body: "B2",
        tags: [],
        createdAt: undefined,
        updatedAt: undefined
      }
    ]
    expect(sortPrompts(withInvalidDates, "created-desc")).toHaveLength(2)
    expect(sortPrompts(withInvalidDates, "updated-desc")).toHaveLength(2)

    const chromeSetSpy = vi.fn()
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          set: chromeSetSpy
        }
      }
    })

    setStoredSortOption("title-asc")
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe("title-asc")
    expect(chromeSetSpy).toHaveBeenCalledWith({ [SORT_STORAGE_KEY]: "title-asc" })
    expect(getStoredSortOption()).toBe("title-asc")

    vi.unstubAllGlobals()
  })
})

