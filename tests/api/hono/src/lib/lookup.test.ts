import { describe, expect, test } from "bun:test"

import {
  alignTo,
  FOUND_TTL_MS,
  isStale,
  mapLimit,
  MISSING_TTL_MS,
  normalizeTitle,
  ratingKey,
  titleVariants,
  uniqueQueries,
} from "../../../../../api/hono/src/lib/lookup"

describe("ratingKey", () => {
  test("folds case, spacing, and unicode width, and carries the year and type", () => {
    expect(normalizeTitle("  Rick  and\tMorty ")).toBe("rick and morty")
    expect(ratingKey({ title: "Rick and Morty" })).toBe("rick and morty||")
    expect(ratingKey({ title: "Dune", type: "movie", year: 2021 })).toBe("dune|2021|movie")
    expect(ratingKey({ title: "Ｄune" })).toBe(ratingKey({ title: "dune" }))
  })
})

describe("titleVariants", () => {
  test("tries the title as spelled, then without a parenthetical, then without a subtitle", () => {
    expect(titleVariants("The Office (U.S.)")).toEqual(["The Office (U.S.)", "The Office"])
    expect(titleVariants("Grand Theft Auto VI: An Extended Look")).toEqual([
      "Grand Theft Auto VI: An Extended Look",
      "Grand Theft Auto VI",
    ])
    expect(titleVariants("Shameless (U.S.): Season 1")).toEqual([
      "Shameless (U.S.): Season 1",
      "Shameless: Season 1",
      "Shameless",
    ])
    expect(titleVariants("Ikka")).toEqual(["Ikka"])
  })
})

describe("uniqueQueries and alignTo", () => {
  test("dedupes a batch in first-asked order and spreads answers back over the request", () => {
    const queries = [
      { title: "Ikka" },
      { title: "ikka " },
      { title: "Dune", year: 2021 },
      { title: "Ikka" },
    ]
    const unique = uniqueQueries(queries)
    expect(unique.map((entry) => entry.key)).toEqual(["ikka||", "dune|2021|"])
    const byKey = new Map(unique.map((entry) => [entry.key, entry.query.title]))
    expect(alignTo(queries, byKey)).toEqual(["Ikka", "Ikka", "Dune", "Ikka"])
  })

  test("alignTo fails loudly when an answer is missing rather than returning a hole", () => {
    expect(() => alignTo([{ title: "Ikka" }], new Map())).toThrow('no answer for "Ikka"')
  })
})

describe("isStale", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z")
  test("a hit is trusted for a week, a miss for a day", () => {
    expect(isStale({ fetchedAt: new Date(now - FOUND_TTL_MS + 1000), found: true }, now)).toBe(
      false,
    )
    expect(isStale({ fetchedAt: new Date(now - FOUND_TTL_MS - 1000), found: true }, now)).toBe(true)
    expect(isStale({ fetchedAt: new Date(now - MISSING_TTL_MS + 1000), found: false }, now)).toBe(
      false,
    )
    expect(isStale({ fetchedAt: new Date(now - MISSING_TTL_MS - 1000), found: false }, now)).toBe(
      true,
    )
  })
})

describe("mapLimit", () => {
  test("keeps result order and never runs more than the limit at once", async () => {
    let running = 0
    let peak = 0
    const results = await mapLimit([30, 10, 20, 5], 2, async (ms) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, ms))
      running -= 1
      return ms * 2
    })
    expect(results).toEqual([60, 20, 40, 10])
    expect(peak).toBe(2)
  })

  test("an empty batch resolves to nothing without calling fn", async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([])
  })
})
