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
  test("tries the title as given, then without a qualifier, then without a subtitle", () => {
    expect(titleVariants("The Office (U.S.)")).toEqual(["The Office (U.S.)", "The Office"])
    expect(titleVariants("Grand Theft Auto VI: An Extended Look")).toEqual([
      "Grand Theft Auto VI: An Extended Look",
      "Grand Theft Auto VI",
    ])
    expect(titleVariants("  Dune  (2021): Part  One ")).toEqual([
      "Dune (2021): Part One",
      "Dune: Part One",
      "Dune",
    ])
    expect(titleVariants("Dune")).toEqual(["Dune"])
    expect(titleVariants("(2021)")).toEqual(["(2021)"])
  })

  test("only the unsubtitled spelling is loose, and never when it is the title itself", () => {
    expect(titleSpellings("The Office (U.S.)")).toEqual([
      { loose: false, spelling: "The Office (U.S.)" },
      { loose: false, spelling: "The Office" },
    ])
    expect(titleSpellings("Dune: Part Two")).toEqual([
      { loose: false, spelling: "Dune: Part Two" },
      { loose: true, spelling: "Dune" },
    ])
    expect(titleSpellings("Dune")).toEqual([{ loose: false, spelling: "Dune" }])
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
