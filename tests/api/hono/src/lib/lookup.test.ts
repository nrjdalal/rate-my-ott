import { describe, expect, test } from "bun:test"

import {
  alignTo,
  lookupKey,
  normalizeTitle,
  titleSpellings,
  titleVariants,
  uniqueQueries,
} from "../../../../../api/hono/src/lib/lookup"

describe("lookupKey", () => {
  test("folds case, spacing, and unicode width, and carries the year, kind, and runtime", () => {
    expect(normalizeTitle("  Rick  and\tMorty ")).toBe("rick and morty")
    expect(lookupKey({ title: "Rick and Morty" })).toBe("rick and morty|||")
    expect(lookupKey({ runtime: 140, title: "Alpha", type: "movie", year: 2026 })).toBe(
      "alpha|2026|movie|140",
    )
    expect(lookupKey({ title: "Ｄune" })).toBe(lookupKey({ title: "dune" }))
    expect(lookupKey({ title: "Alpha", year: 2026 })).not.toBe(lookupKey({ title: "Alpha" }))
  })
})

describe("titleSpellings", () => {
  test("tries the title as given, then without a qualifier, then without a subtitle, each with its article dropped or put on", () => {
    expect(titleVariants("The Office (U.S.)")).toEqual([
      "The Office (U.S.)",
      "Office (U.S.)",
      "The Office",
      "Office",
    ])
    expect(titleVariants("Grand Theft Auto VI: An Extended Look")).toEqual([
      "Grand Theft Auto VI: An Extended Look",
      "The Grand Theft Auto VI: An Extended Look",
      "Grand Theft Auto VI",
      "The Grand Theft Auto VI",
    ])
    expect(titleVariants("  Dune  (2021): Part  One ")).toEqual([
      "Dune (2021): Part One",
      "The Dune (2021): Part One",
      "Dune: Part One",
      "The Dune: Part One",
      "Dune",
      "The Dune",
    ])
    expect(titleVariants("Dune")).toEqual(["Dune", "The Dune"])
    expect(titleVariants("(2021)")).toEqual(["(2021)", "The (2021)"])
  })

  test("the article is dropped whichever it is, and the platform's spelling always comes first", () => {
    expect(titleVariants("Devil's Advocate")).toEqual(["Devil's Advocate", "The Devil's Advocate"])
    expect(titleVariants("A Quiet Place")).toEqual(["A Quiet Place", "Quiet Place"])
    expect(titleVariants("An Education")).toEqual(["An Education", "Education"])
    expect(titleVariants("the office")).toEqual(["the office", "office"])
    // A word that merely starts like an article is left alone, and so is the article on its own.
    expect(titleVariants("Theodore")).toEqual(["Theodore", "The Theodore"])
    expect(titleVariants("The")).toEqual(["The", "The The"])
  })

  test("only the unsubtitled spelling is loose, its article variant with it, and never the title itself", () => {
    expect(titleSpellings("The Office (U.S.)")).toEqual([
      { loose: false, spelling: "The Office (U.S.)" },
      { loose: false, spelling: "Office (U.S.)" },
      { loose: false, spelling: "The Office" },
      { loose: false, spelling: "Office" },
    ])
    expect(titleSpellings("Dune: Part Two")).toEqual([
      { loose: false, spelling: "Dune: Part Two" },
      { loose: false, spelling: "The Dune: Part Two" },
      { loose: true, spelling: "Dune" },
      { loose: true, spelling: "The Dune" },
    ])
    expect(titleSpellings("Dune")).toEqual([
      { loose: false, spelling: "Dune" },
      { loose: false, spelling: "The Dune" },
    ])
  })
})

describe("uniqueQueries and alignTo", () => {
  test("dedupes a batch by key in first-asked order and spreads answers back positionally", () => {
    const queries = [
      { title: "Dune", year: 2021 },
      { title: "dune", year: 2021 },
      { title: "Dune" },
      { title: "Dune", year: 2021 },
    ]
    const unique = uniqueQueries(queries)
    expect(unique.map((entry) => entry.key)).toEqual(["dune|2021||", "dune|||"])
    expect(unique[0]?.query).toBe(queries[0] as { title: string })
    const answers = new Map(unique.map((entry, index) => [entry.key, index]))
    expect(alignTo(queries, answers)).toEqual([0, 0, 1, 0])
  })

  test("alignTo refuses a batch it has no answer for", () => {
    expect(() => alignTo([{ title: "Dune" }], new Map())).toThrow('no answer for "Dune"')
  })
})
