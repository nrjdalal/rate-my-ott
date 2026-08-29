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
      "An Extended Look",
      "Extended Look",
    ])
    expect(titleVariants("  Dune  (2021): Part  One ")).toEqual([
      "Dune (2021): Part One",
      "Dune (2021): Part 1",
      "The Dune (2021): Part One",
      "The Dune (2021): Part 1",
      "Dune: Part One",
      "Dune: Part 1",
      "The Dune: Part One",
      "The Dune: Part 1",
      "Dune",
      "The Dune",
      "Part One",
      "Part 1",
      "The Part One",
      "The Part 1",
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

  test("a standalone number is also spelled the other way, digits as words or words as digits", () => {
    expect(titleVariants("Fear Street Part 1: 1994")).toEqual([
      "Fear Street Part 1: 1994",
      "Fear Street Part One: 1994",
      "The Fear Street Part 1: 1994",
      "The Fear Street Part One: 1994",
      "Fear Street Part 1",
      "Fear Street Part One",
      "The Fear Street Part 1",
      "The Fear Street Part One",
      "1994",
      "The 1994",
    ])
    expect(titleVariants("Part One")).toEqual(["Part One", "Part 1", "The Part One", "The Part 1"])
    // A year, a number inside a word, and numbers past ten are left alone.
    expect(titleVariants("Se7en")).toEqual(["Se7en", "The Se7en"])
    expect(titleVariants("Blade Runner 2049")).toEqual([
      "Blade Runner 2049",
      "The Blade Runner 2049",
    ])
    expect(titleVariants("Ocean's 11")).toEqual(["Ocean's 11", "The Ocean's 11"])
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
      { loose: false, spelling: "Dune: Part 2" },
      { loose: false, spelling: "The Dune: Part Two" },
      { loose: false, spelling: "The Dune: Part 2" },
      { loose: true, spelling: "Dune" },
      { loose: true, spelling: "The Dune" },
      { loose: true, spelling: "Part Two" },
      { loose: true, spelling: "Part 2" },
      { loose: true, spelling: "The Part Two" },
      { loose: true, spelling: "The Part 2" },
    ])
    expect(titleVariants("Half Bad: The Bastard Son & The Devil Himself")).toEqual([
      "Half Bad: The Bastard Son & The Devil Himself",
      "The Half Bad: The Bastard Son & The Devil Himself",
      "Half Bad",
      "The Half Bad",
      "The Bastard Son & The Devil Himself",
      "Bastard Son & The Devil Himself",
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
