import { describe, expect, test } from "bun:test"

import {
  DOMINANT_MIN_VOTES,
  fitsQuery,
  imdbType,
  keepTitle,
  MINOR_KIND_MIN_VOTES,
  nameKeys,
  OPEN_RUN_MIN_VOTES,
  parseBasicsLine,
  parseRatingsLine,
  pickImdbTitle,
  readGzipLines,
  resolveTitle,
  RUNTIME_MARGIN_MIN,
  searchKey,
  shouldPrune,
  staleNames,
  toImdbTitle,
  VOTES_DOMINANCE,
  type ImdbBasics,
  type ImdbTitle,
} from "../../../../../api/hono/src/lib/imdb"

const basics = (over: Partial<ImdbBasics> = {}): ImdbBasics => ({
  endYear: null,
  id: "tt0000001",
  isAdult: false,
  originalTitle: "Alpha",
  primaryTitle: "Alpha",
  runtime: 141,
  startYear: 2025,
  titleType: "movie",
  ...over,
})

const title = (over: Partial<ImdbTitle> = {}): ImdbTitle => ({
  ...toImdbTitle(basics(), { id: "tt0000001", rating: 6.1, votes: 12000 }),
  ...over,
})

const NOW = 2026

describe("dataset lines", () => {
  test("parses a basics row, reads \\N as null, and skips the header", () => {
    expect(
      parseBasicsLine(
        "tt0000003\tshort\tPoor Pierrot\tPauvre Pierrot\t0\t1892\t\\N\t5\tAnimation,Comedy",
      ),
    ).toEqual({
      endYear: null,
      id: "tt0000003",
      isAdult: false,
      originalTitle: "Pauvre Pierrot",
      primaryTitle: "Poor Pierrot",
      runtime: 5,
      startYear: 1892,
      titleType: "short",
    })
    expect(
      parseBasicsLine(
        "tt4574334\ttvSeries\tStranger Things\tStranger Things\t0\t2016\t2025\t51\tDrama",
      ),
    ).toMatchObject({ endYear: 2025, startYear: 2016, titleType: "tvSeries" })
    expect(parseBasicsLine("tt1\tmovie\tX\tX\t1\t\\N\t\\N\t\\N\t\\N")).toMatchObject({
      isAdult: true,
      runtime: null,
      startYear: null,
    })
    expect(
      parseBasicsLine(
        "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres",
      ),
    ).toBeNull()
    expect(parseBasicsLine("")).toBeNull()
    expect(parseBasicsLine("tt1\tmovie\tX")).toBeNull()
  })

  test("parses a ratings row and rejects the header and junk", () => {
    expect(parseRatingsLine("tt0000001\t5.7\t2228")).toEqual({
      id: "tt0000001",
      rating: 5.7,
      votes: 2228,
    })
    expect(parseRatingsLine("tconst\taverageRating\tnumVotes")).toBeNull()
    expect(parseRatingsLine("tt0000001\tN/A\t5")).toBeNull()
    expect(parseRatingsLine("tt0000001\t5.7")).toBeNull()
  })

  test("streams gzipped lines across chunk boundaries and multi-byte characters", async () => {
    const lines = ["a\tb", "ünïcödé\t日本語", "last-without-newline"]
    const bytes = Buffer.from(Bun.gzipSync(new TextEncoder().encode(lines.join("\n"))))
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7) {
          controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + 7)))
        }
        controller.close()
      },
    })
    const seen: string[] = []
    for await (const line of readGzipLines(stream)) seen.push(line)
    expect(seen).toEqual(lines)
  })
})

describe("keepTitle and names", () => {
  test("keeps what fronts a card as a film or a series; drops episodes, games, and adult titles", () => {
    for (const kind of ["movie", "tvMovie", "tvSpecial", "short", "video"])
      expect(imdbType(kind)).toBe("movie")
    for (const kind of ["tvSeries", "tvMiniSeries"]) expect(imdbType(kind)).toBe("series")
    const rated = { id: "tt0000001", rating: 6.1, votes: 12000 }
    for (const kind of ["tvEpisode", "videoGame", "tvShort", "constructor", ""]) {
      expect(imdbType(kind)).toBeNull()
      expect(keepTitle(basics({ titleType: kind }), rated, NOW)).toBe(false)
    }
    expect(keepTitle(basics(), rated, NOW)).toBe(true)
    expect(keepTitle(basics({ isAdult: true }), rated, NOW)).toBe(false)
    expect(keepTitle(basics({ primaryTitle: "" }), rated, NOW)).toBe(false)
  })

  test("keeps an unrated title only when it is from this year or last", () => {
    const rated = { id: "tt0000001", rating: 6.1, votes: 12000 }
    expect(keepTitle(basics({ startYear: 2026 }), null, NOW)).toBe(true)
    expect(keepTitle(basics({ startYear: 2025 }), null, NOW)).toBe(true)
    expect(keepTitle(basics({ startYear: 2024 }), null, NOW)).toBe(false)
    expect(keepTitle(basics({ startYear: null }), null, NOW)).toBe(false)
    expect(keepTitle(basics({ startYear: 1994 }), rated, NOW)).toBe(true)
  })

  test("keeps a short or a video only once it has a hundred votes", () => {
    for (const kind of ["short", "video"]) {
      expect(keepTitle(basics({ startYear: 2026, titleType: kind }), null, NOW)).toBe(false)
      expect(
        keepTitle(
          basics({ titleType: kind }),
          { id: "tt1", rating: 7, votes: MINOR_KIND_MIN_VOTES - 1 },
          NOW,
        ),
      ).toBe(false)
      expect(
        keepTitle(
          basics({ titleType: kind }),
          { id: "tt1", rating: 7, votes: MINOR_KIND_MIN_VOTES },
          NOW,
        ),
      ).toBe(true)
    }
  })

  test("searchKey folds case, width, diacritics, punctuation, and ampersands", () => {
    expect(searchKey("Marvel's Daredevil")).toBe("marvel s daredevil")
    expect(searchKey("Guns & Gulaabs")).toBe("guns and gulaabs")
    expect(searchKey("WALL·E")).toBe("wall e")
    expect(searchKey("  Ｄune:  Part   Two ")).toBe("dune part two")
    expect(searchKey("Amélie")).toBe("amelie")
    expect(searchKey("日本語のタイトル")).toBe("日本語のタイトル")
    expect(searchKey("!!!")).toBe("")
  })

  test("nameKeys lists the primary and original spellings once each", () => {
    expect(nameKeys({ originalTitle: "La casa de papel", primaryTitle: "Money Heist" })).toEqual([
      "money heist",
      "la casa de papel",
    ])
    expect(nameKeys({ originalTitle: "ALPHA", primaryTitle: "Alpha" })).toEqual(["alpha"])
    expect(nameKeys({ originalTitle: "", primaryTitle: "Alpha" })).toEqual(["alpha"])
  })

  test("toImdbTitle joins the basics with a rating, or leaves the score null", () => {
    expect(toImdbTitle(basics(), null)).toMatchObject({ rating: null, votes: null })
    expect(toImdbTitle(basics(), { id: "tt0000001", rating: 6.1, votes: 12000 })).toMatchObject({
      id: "tt0000001",
      rating: 6.1,
      votes: 12000,
    })
  })
})

describe("fitsQuery", () => {
  test("a film fits within a year and five minutes; a same-name stranger does not", () => {
    // Netflix's "Alpha" (2026 there, 140 minutes) against the Hindi film (2025, 141) and the French one (2025, 128).
    expect(fitsQuery(title(), { runtime: 140, title: "Alpha", type: "movie", year: 2026 })).toBe(
      true,
    )
    expect(
      fitsQuery(title({ runtime: 128 }), {
        runtime: 140,
        title: "Alpha",
        type: "movie",
        year: 2026,
      }),
    ).toBe(false)
    expect(
      fitsQuery(title({ startYear: 2018 }), { title: "Alpha", type: "movie", year: 2026 }),
    ).toBe(false)
    expect(fitsQuery(title({ titleType: "tvSeries" }), { title: "Alpha", type: "movie" })).toBe(
      false,
    )
    expect(fitsQuery(title(), { title: "Alpha", type: "series" })).toBe(false)
  })

  test("a series fits when the stated year falls in its run, a year either side", () => {
    const show = title({
      endYear: 2025,
      runtime: 51,
      startYear: 2016,
      titleType: "tvSeries",
      votes: 1400000,
    })
    for (const year of [2015, 2016, 2020, 2025, 2026]) {
      expect(fitsQuery(show, { title: "X", type: "series", year }, { now: NOW })).toBe(true)
    }
    expect(fitsQuery(show, { title: "X", type: "series", year: 2014 }, { now: NOW })).toBe(false)
    expect(fitsQuery(show, { title: "X", type: "series", year: 2027 }, { now: NOW })).toBe(false)
  })

  test("an open run reaches the present for a well-known show only; an obscure one stays at its start", () => {
    const known = title({
      endYear: null,
      startYear: 2016,
      titleType: "tvSeries",
      votes: OPEN_RUN_MIN_VOTES,
    })
    expect(fitsQuery(known, { title: "X", type: "series", year: 2026 }, { now: NOW })).toBe(true)
    expect(fitsQuery(known, { title: "X", type: "series", year: 2028 }, { now: NOW })).toBe(false)
    const obscure = title({ endYear: null, startYear: 2005, titleType: "tvSeries", votes: 300 })
    expect(fitsQuery(obscure, { title: "X", type: "series", year: 2026 }, { now: NOW })).toBe(false)
    expect(fitsQuery(obscure, { title: "X", type: "series", year: 2006 }, { now: NOW })).toBe(true)
    const unrated = title({ endYear: null, startYear: 2025, titleType: "tvSeries", votes: null })
    expect(fitsQuery(unrated, { title: "X", type: "series", year: 2026 }, { now: NOW })).toBe(true)
  })

  test("a runtime is only checked for a film, and an unknown field does not disqualify unless the year must be exact", () => {
    const show = title({ runtime: 51, startYear: 2016, titleType: "tvSeries", votes: 1400000 })
    expect(fitsQuery(show, { runtime: 140, title: "X", type: "series", year: 2016 })).toBe(true)
    expect(fitsQuery(title({ runtime: null }), { runtime: 140, title: "X", year: 2025 })).toBe(true)
    expect(fitsQuery(title({ startYear: null }), { title: "X", year: 1999 })).toBe(true)
    expect(
      fitsQuery(title({ startYear: null }), { title: "X", year: 1999 }, { exactYear: true }),
    ).toBe(false)
    expect(fitsQuery(title(), { title: "X", year: 2026 }, { exactYear: true })).toBe(false)
    expect(fitsQuery(title(), { title: "X", year: 2025 }, { exactYear: true })).toBe(true)
  })
})

describe("pickImdbTitle", () => {
  const hindi = title({ id: "tt1", runtime: 141, startYear: 2025, votes: 12000 })
  const french = title({ id: "tt2", runtime: 128, startYear: 2025, votes: 4000 })
  const wolf = title({ id: "tt3", runtime: 96, startYear: 2018, votes: 90000 })

  test("nothing is taken on a name alone; one fitting candidate is the answer; none is a miss", () => {
    expect(pickImdbTitle([wolf], { title: "Alpha" })).toBeNull()
    expect(pickImdbTitle([hindi, wolf], { title: "Alpha", type: "movie", year: 2026 })).toBe(hindi)
    expect(pickImdbTitle([wolf], { title: "Alpha", type: "movie", year: 2026 })).toBeNull()
    expect(pickImdbTitle([wolf], { title: "Alpha", type: "movie" })).toBe(wolf)
    expect(pickImdbTitle([], { title: "Alpha", year: 2026 })).toBeNull()
  })

  test("a clearly closer runtime separates same-year films; a minute does not", () => {
    expect(
      pickImdbTitle([french, hindi, wolf], {
        runtime: 140,
        title: "Alpha",
        type: "movie",
        year: 2026,
      }),
    ).toBe(hindi)
    expect(
      pickImdbTitle([hindi, french], { runtime: 130, title: "Alpha", type: "movie", year: 2025 }),
    ).toBe(french)
    const a = title({ id: "tt4", runtime: 100, votes: 50 })
    const b = title({ id: "tt5", runtime: 100 + RUNTIME_MARGIN_MIN - 1, votes: 100000 })
    // Runtimes a minute apart do not decide; popularity does, and it favours b.
    expect(pickImdbTitle([a, b], { runtime: 101, title: "Alpha", type: "movie", year: 2025 })).toBe(
      b,
    )
    const c = title({ id: "tt6", runtime: 100 + RUNTIME_MARGIN_MIN, votes: 100000 })
    expect(pickImdbTitle([a, c], { runtime: 100, title: "Alpha", type: "movie", year: 2025 })).toBe(
      a,
    )
  })

  test("without a runtime, a stated year takes the dominant title and refuses a close call or an unrated twin", () => {
    const popular = title({ id: "tt7", runtime: null, votes: 30000 })
    const obscure = title({ id: "tt8", runtime: null, votes: 30000 / VOTES_DOMINANCE })
    expect(pickImdbTitle([obscure, popular], { title: "Alpha", type: "movie", year: 2025 })).toBe(
      popular,
    )
    const rival = title({ id: "tt9", runtime: null, votes: 20000 })
    expect(
      pickImdbTitle([rival, popular], { title: "Alpha", type: "movie", year: 2025 }),
    ).toBeNull()
    // The platform's own new film is the unrated one; showing the rated twin's score would be wrong.
    const unrated = title({ id: "tt10", runtime: null, votes: null })
    expect(
      pickImdbTitle([unrated, popular], { title: "Alpha", type: "movie", year: 2025 }),
    ).toBeNull()
    const few = title({ id: "tt11", runtime: null, votes: DOMINANT_MIN_VOTES - 1 })
    const fewer = title({ id: "tt12", runtime: null, votes: 3 })
    expect(pickImdbTitle([few, fewer], { title: "Alpha", type: "movie", year: 2025 })).toBeNull()
  })

  test("a candidate the statements cannot verify drops out, but vetoes a far less popular pick", () => {
    const undated = title({ id: "tt13", runtime: null, startYear: null, votes: 500 })
    expect(pickImdbTitle([undated, hindi], { title: "Alpha", type: "movie", year: 2025 })).toBe(
      hindi,
    )
    const famous = title({ id: "tt14", runtime: null, startYear: 2025, votes: 500000 })
    const measured = title({ id: "tt15", runtime: 138, startYear: 2024, votes: 20 })
    expect(
      pickImdbTitle([famous, measured], {
        runtime: 140,
        title: "Alpha",
        type: "movie",
        year: 2025,
      }),
    ).toBeNull()
  })

  test("a series is never ranked by its episode length, and the pick does not depend on candidate order", () => {
    const long = title({
      id: "tt16",
      runtime: 45,
      startYear: 2020,
      titleType: "tvSeries",
      votes: 1000,
    })
    const short = title({
      id: "tt17",
      runtime: 22,
      startYear: 2020,
      titleType: "tvSeries",
      votes: 100000,
    })
    expect(
      pickImdbTitle([long, short], { runtime: 45, title: "X", type: "series", year: 2020 }),
    ).toBe(short)
    const a = title({ id: "tt18", runtime: 100, votes: 10 })
    const b = title({
      id: "tt19",
      runtime: null,
      startYear: 2025,
      titleType: "tvSeries",
      votes: 10,
    })
    const c = title({ id: "tt20", runtime: 105, votes: 10 })
    for (const order of [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ]) {
      expect(pickImdbTitle(order, { runtime: 100, title: "X", year: 2025 })).toBe(a)
    }
  })

  test("the real Office: a namesake that started the stated year does not outrank the famous one", () => {
    const us = title({
      id: "tt0386676",
      endYear: 2013,
      runtime: 22,
      startYear: 2005,
      titleType: "tvSeries",
      votes: 847167,
    })
    const namesake = title({
      id: "tt2186395",
      endYear: null,
      runtime: null,
      startYear: 2012,
      titleType: "tvSeries",
      votes: 17,
    })
    const other = title({
      id: "tt1791001",
      endYear: 2013,
      runtime: 30,
      startYear: 2010,
      titleType: "tvSeries",
      votes: 87,
    })
    expect(
      pickImdbTitle(
        [namesake, other, us],
        { title: "The Office", type: "series", year: 2012 },
        { now: NOW },
      ),
    ).toBe(us)
  })
})

describe("resolveTitle", () => {
  const office = title({
    id: "tt0386676",
    endYear: 2013,
    runtime: 22,
    startYear: 2005,
    titleType: "tvSeries",
    votes: 847167,
  })
  const parent = title({
    id: "tt10919420",
    endYear: null,
    runtime: 55,
    startYear: 2021,
    titleType: "tvSeries",
    votes: 774354,
  })
  const spinoff = title({
    id: "tt24003330",
    endYear: null,
    runtime: 50,
    startYear: 2023,
    titleType: "tvSeries",
    votes: 30000,
  })
  const index = new Map<string, ImdbTitle[]>([
    ["The Office", [office]],
    ["Squid Game", [parent]],
    ["Squid Game: The Challenge", [spinoff]],
    [
      "Operation Safed Sagar",
      [title({ id: "tt36643714", startYear: 2026, titleType: "tvSeries", votes: 5767 })],
    ],
    ["Alpha", [hindiOf(), title({ id: "tt6194322", runtime: 96, startYear: 2018, votes: 90000 })]],
  ])
  function hindiOf() {
    return title({ id: "tt28363783", runtime: 141, startYear: 2025, votes: 24000 })
  }
  const lookup = (spelling: string) => index.get(spelling) ?? []

  test("a parenthetical qualifier is dropped freely; a subtitle only for the stated year exactly", () => {
    expect(
      resolveTitle({ title: "The Office (U.S.)", type: "series", year: 2012 }, lookup, NOW)?.id,
    ).toBe("tt0386676")
    expect(
      resolveTitle({ title: "Squid Game: The Challenge", type: "series", year: 2023 }, lookup, NOW)
        ?.id,
    ).toBe("tt24003330")
    // Unknown under its own name, the spin-off must not inherit the parent's score by dropping its subtitle.
    expect(
      resolveTitle({ title: "Squid Game: The Recruit", type: "series", year: 2025 }, lookup, NOW),
    ).toBeNull()
    expect(
      resolveTitle(
        { title: "Operation Safed Sagar: The Untold Story", type: "series", year: 2026 },
        lookup,
        NOW,
      )?.id,
    ).toBe("tt36643714")
  })

  test("an ambiguity under the platform's own spelling is final; a looser spelling is not tried", () => {
    expect(resolveTitle({ title: "Alpha", type: "movie" }, lookup, NOW)).toBeNull()
    expect(
      resolveTitle({ title: "Alpha", runtime: 140, type: "movie", year: 2026 }, lookup, NOW)?.id,
    ).toBe("tt28363783")
    expect(
      resolveTitle({ title: "Alpha: Origins", type: "movie", year: 2026 }, lookup, NOW),
    ).toBeNull()
    expect(
      resolveTitle({ title: "Nothing Here", type: "movie", year: 2026 }, lookup, NOW),
    ).toBeNull()
  })
})

describe("sync helpers", () => {
  test("staleNames lists the spellings a title no longer answers to", () => {
    const existing = [
      { key: "dark", titleId: "tt5753856" },
      { key: "dark 2017", titleId: "tt5753856" },
      { key: "alpha", titleId: "tt1" },
    ]
    expect(
      staleNames(existing, [
        { key: "dark 2017", titleId: "tt5753856" },
        { key: "alpha", titleId: "tt1" },
      ]),
    ).toEqual([{ key: "dark", titleId: "tt5753856" }])
    expect(staleNames(existing, existing)).toEqual([])
  })

  test("shouldPrune refuses a rebuild that halves the index, and allows a first build", () => {
    expect(shouldPrune(0, 10)).toBe(true)
    expect(shouldPrune(600000, 590000)).toBe(true)
    expect(shouldPrune(600000, 300000)).toBe(true)
    expect(shouldPrune(600000, 299999)).toBe(false)
  })
})
