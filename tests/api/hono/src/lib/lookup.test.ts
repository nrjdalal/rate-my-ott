import { describe, expect, test } from "bun:test"

import {
  alignTo,
  FOUND_TTL_MS,
  isStale,
  mapLimit,
  matchesQuery,
  MISSING_TTL_MS,
  normalizeTitle,
  pickCandidate,
  ratingKey,
  titleVariants,
  uniqueQueries,
  yearsAround,
} from "../../../../../api/hono/src/lib/lookup"

describe("ratingKey", () => {
  test("folds case, spacing, and unicode width, and carries the year and type", () => {
    expect(normalizeTitle("  Rick  and\tMorty ")).toBe("rick and morty")
    expect(ratingKey({ title: "Rick and Morty" })).toBe("rick and morty||")
    expect(ratingKey({ title: "Dune", type: "movie", year: 2021 })).toBe("dune|2021|movie")
    expect(ratingKey({ title: "Ｄune" })).toBe(ratingKey({ title: "dune" }))
  })
})

describe("matchesQuery and pickCandidate", () => {
  // Netflix's "Alpha" (2026 there, 2025 on IMDb, 140 minutes) against OMDb's same-name entries.
  const french = { runtime: 128, year: 2026 }
  const hindi = { runtime: 141, year: 2025 }
  const american = { runtime: 96, year: 2018 }
  const unmeasured = { runtime: null, year: 2026 }

  test("a same-name film from another year or with another length is a stranger", () => {
    expect(matchesQuery(french, { runtime: 140, year: 2026 })).toBe(false)
    expect(matchesQuery(hindi, { runtime: 140, year: 2026 })).toBe(true)
    expect(matchesQuery(american, { year: 2026 })).toBe(false)
    expect(matchesQuery(french, { year: 2026 })).toBe(true)
  })

  test("what the provider has no record of cannot disqualify", () => {
    expect(matchesQuery(unmeasured, { runtime: 140, year: 2026 })).toBe(true)
    expect(matchesQuery({ runtime: null, year: null }, { runtime: 140, year: 2026 })).toBe(true)
  })

  test("the closest runtime wins, then the exact year, and nothing fitting is nothing", () => {
    expect(pickCandidate([french, hindi, unmeasured], { runtime: 140, year: 2026 })).toBe(hindi)
    expect(pickCandidate([unmeasured, hindi], { runtime: 140, year: 2026 })).toBe(hindi)
    expect(pickCandidate([unmeasured], { runtime: 140, year: 2026 })).toBe(unmeasured)
    expect(pickCandidate([american, french], { year: 2026 })).toBe(french)
    expect(pickCandidate([french, american], { runtime: 140, year: 2026 })).toBeNull()
  })

  test("yearsAround covers the stated year, then the year before, then the year after", () => {
    expect(yearsAround(2026)).toEqual([2026, 2025, 2027])
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
