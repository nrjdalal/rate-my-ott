import { describe, expect, test } from "bun:test"

import {
  DOMINANT_MIN_VOTES,
  fitsQuery,
  addAka,
  imdbType,
  keepAka,
  keepTitle,
  MINOR_KIND_MIN_VOTES,
  nameKeys,
  OPEN_RUN_MIN_VOTES,
  parseAkasLine,
  parseBasicsLine,
  parseRatingsLine,
  pickImdbTitle,
  readGzipLines,
  resolveOutcome,
  resolveTitle,
  RUNTIME_MARGIN_MIN,
  searchKey,
  shouldPrune,
  staleNames,
  toImdbTitle,
  VOTES_DOMINANCE,
  type ImdbBasics,
  type ImdbTitle,
  type Spellings,
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

describe("alternate names", () => {
  test("parses an akas row and keeps the spellings a platform could show", () => {
    expect(parseAkasLine("tt1160419\t16\tDune\tIN\ten\timdbDisplay\t\\N\t0")).toEqual({
      attributes: null,
      id: "tt1160419",
      isOriginal: false,
      region: "IN",
      title: "Dune",
      types: "imdbDisplay",
    })
    expect(
      parseAkasLine("tt3322312\t27\tMarvel's Daredevil\tUS\t\\N\t\\N\tcomplete title\t0"),
    ).toMatchObject({ attributes: "complete title", types: null })
    expect(
      parseAkasLine(
        "titleId\tordering\ttitle\tregion\tlanguage\ttypes\tattributes\tisOriginalTitle",
      ),
    ).toBeNull()
    expect(parseAkasLine("tt1\t1\t\\N\tUS\t\\N\t\\N\t\\N\t0")).toBeNull()
    expect(parseAkasLine("tt1\t1\tX")).toBeNull()
    const aka = (over: Partial<ReturnType<typeof parseAkasLine> & object>) => ({
      attributes: null,
      id: "tt1",
      isOriginal: false,
      region: "US",
      title: "X",
      types: "imdbDisplay",
      ...over,
    })
    expect(keepAka(aka({}))).toBe(true)
    expect(keepAka(aka({ region: "IN", types: "imdbDisplay" }))).toBe(true)
    // A row with no type is an alias named by its attribute: a complete title or a spelling variant names the title, a working, season, cut, or informal title names a stranger.
    expect(keepAka(aka({ attributes: "complete title", region: "US", types: null }))).toBe(true)
    expect(keepAka(aka({ attributes: "alternative spelling", region: "GB", types: null }))).toBe(
      true,
    )
    expect(keepAka(aka({ attributes: "fake working title", region: "GB", types: null }))).toBe(
      false,
    )
    expect(keepAka(aka({ attributes: "third season title", region: "US", types: null }))).toBe(
      false,
    )
    expect(keepAka(aka({ attributes: "complete title", region: "BR", types: null }))).toBe(false)
    expect(keepAka(aka({ region: "XWW", types: null }))).toBe(false)
    expect(keepAka(aka({ region: "US", types: null }))).toBe(false)
    expect(keepAka(aka({ region: null, isOriginal: true, types: "original" }))).toBe(true)
    expect(keepAka(aka({ region: "US", types: "alternative" }))).toBe(true)
    // IMDb joins several types with \\x02.
    expect(keepAka(aka({ region: "US", types: "imdbDisplay\u0002tv" }))).toBe(true)
    expect(keepAka(aka({ region: "US", types: "festival\u0002working" }))).toBe(false)
    expect(keepAka(aka({ region: "BR", types: "imdbDisplay" }))).toBe(false)
    expect(keepAka(aka({ region: "US", types: "working" }))).toBe(false)
    expect(keepAka(aka({ region: null, types: "imdbDisplay" }))).toBe(false)
  })
})

describe("addAka", () => {
  test("adds a new spelling to a known title once, never one it already owns", () => {
    const spellings: Spellings = new Map([["tt3322312", { akas: [], own: ["daredevil"] }]])
    const aka = (title: string, id = "tt3322312") => ({
      attributes: null,
      id,
      isOriginal: false,
      region: "US",
      title,
      types: "alternative",
    })
    expect(addAka(spellings, aka("Marvel's Daredevil"))).toBe(true)
    expect(addAka(spellings, aka("Marvel's Daredevil"))).toBe(false)
    expect(addAka(spellings, aka("DAREDEVIL"))).toBe(false)
    expect(addAka(spellings, aka("!!!"))).toBe(false)
    expect(addAka(spellings, aka("Anything", "tt0"))).toBe(false)
    expect(spellings.get("tt3322312")).toEqual({ akas: ["marvel s daredevil"], own: ["daredevil"] })
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
    expect(keepTitle(basics({ startYear: 2030 }), null, NOW)).toBe(true)
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
    const unratedOlder = title({
      endYear: null,
      startYear: 2024,
      titleType: "tvSeries",
      votes: null,
    })
    expect(fitsQuery(unratedOlder, { title: "X", type: "series", year: 2026 }, { now: NOW })).toBe(
      false,
    )
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
  const at = { now: NOW }

  test("nothing is taken without a year; one fitting candidate is the answer; none is a miss", () => {
    expect(pickImdbTitle([wolf], { title: "Alpha" }, at)).toBeNull()
    expect(pickImdbTitle([wolf], { title: "Alpha", type: "movie" }, at)).toBeNull()
    expect(pickImdbTitle([wolf], { runtime: 96, title: "Alpha", type: "movie" }, at)).toBeNull()
    expect(pickImdbTitle([hindi, wolf], { title: "Alpha", type: "movie", year: 2026 }, at)).toBe(
      hindi,
    )
    expect(pickImdbTitle([wolf], { title: "Alpha", type: "movie", year: 2026 }, at)).toBeNull()
    expect(pickImdbTitle([wolf], { title: "Alpha", year: 2018 }, at)).toBe(wolf)
    expect(pickImdbTitle([], { title: "Alpha", year: 2026 }, at)).toBeNull()
  })

  test("a film and a series of one name, with no kind stated, are an ambiguity", () => {
    const film = title({ id: "tt21", runtime: null, startYear: 2020, votes: 12000 })
    const show = title({
      id: "tt22",
      runtime: null,
      startYear: 2020,
      titleType: "tvSeries",
      votes: 1000,
    })
    expect(pickImdbTitle([film, show], { title: "X", year: 2020 }, at)).toBeNull()
    expect(pickImdbTitle([film, show], { title: "X", type: "movie", year: 2020 }, at)).toBe(film)
    expect(pickImdbTitle([film, show], { title: "X", type: "series", year: 2020 }, at)).toBe(show)
  })

  test("a clearly closer runtime separates same-year films; a minute does not", () => {
    expect(
      pickImdbTitle(
        [french, hindi, wolf],
        { runtime: 140, title: "Alpha", type: "movie", year: 2026 },
        at,
      ),
    ).toBe(hindi)
    expect(
      pickImdbTitle(
        [hindi, french],
        { runtime: 130, title: "Alpha", type: "movie", year: 2025 },
        at,
      ),
    ).toBe(french)
    const a = title({ id: "tt4", runtime: 100, startYear: 2020, votes: 500 })
    const b = title({
      id: "tt5",
      runtime: 100 + RUNTIME_MARGIN_MIN - 1,
      startYear: 2020,
      votes: 100000,
    })
    // Runtimes a minute apart do not decide; popularity does, and it favours b.
    expect(
      pickImdbTitle([a, b], { runtime: 101, title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBe(b)
    const c = title({
      id: "tt6",
      runtime: 100 + RUNTIME_MARGIN_MIN,
      startYear: 2020,
      votes: 100000,
    })
    expect(
      pickImdbTitle([a, c], { runtime: 100, title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBe(a)
  })

  test("without a runtime, a stated year takes the dominant title and refuses a close call or an unrated twin", () => {
    const popular = title({ id: "tt7", runtime: null, startYear: 2020, votes: 30000 })
    const obscure = title({
      id: "tt8",
      runtime: null,
      startYear: 2020,
      votes: 30000 / VOTES_DOMINANCE,
    })
    expect(
      pickImdbTitle([obscure, popular], { title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBe(popular)
    const rival = title({ id: "tt9", runtime: null, startYear: 2020, votes: 20000 })
    expect(
      pickImdbTitle([rival, popular], { title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBeNull()
    // The platform's own new film is the unrated one; showing the rated twin's score would be wrong.
    const unrated = title({ id: "tt10", runtime: null, startYear: 2020, votes: null })
    expect(
      pickImdbTitle([unrated, popular], { title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBeNull()
    const few = title({ id: "tt11", runtime: null, startYear: 2020, votes: DOMINANT_MIN_VOTES - 1 })
    const fewer = title({ id: "tt12", runtime: null, startYear: 2020, votes: 3 })
    expect(
      pickImdbTitle([few, fewer], { title: "Alpha", type: "movie", year: 2020 }, at),
    ).toBeNull()
  })

  test("a title too new to have earned its votes denies dominance to a namesake", () => {
    // Netflix's own new series with 60 votes against last year's unrelated namesake with 200.
    const fresh = title({
      id: "tt23",
      runtime: null,
      startYear: 2026,
      titleType: "tvSeries",
      votes: 60,
    })
    const namesake = title({
      endYear: 2025,
      id: "tt24",
      runtime: null,
      startYear: 2025,
      titleType: "tvSeries",
      votes: 200,
    })
    expect(
      pickImdbTitle([namesake, fresh], { title: "Ikka", type: "series", year: 2026 }, at),
    ).toBeNull()
    // The same pair years ago: 60 votes is all that title will ever get, and 200 dominates it.
    const old = title({
      endYear: 2021,
      id: "tt25",
      runtime: null,
      startYear: 2020,
      titleType: "tvSeries",
      votes: 60,
    })
    const known = title({
      endYear: 2021,
      id: "tt26",
      runtime: null,
      startYear: 2021,
      titleType: "tvSeries",
      votes: 200,
    })
    expect(pickImdbTitle([old, known], { title: "Ikka", type: "series", year: 2021 }, at)).toBe(
      known,
    )
  })

  test("a candidate the statements cannot verify drops out, but vetoes a far less popular pick", () => {
    const undated = title({ id: "tt13", runtime: null, startYear: null, votes: 500 })
    expect(pickImdbTitle([undated, hindi], { title: "Alpha", type: "movie", year: 2025 }, at)).toBe(
      hindi,
    )
    const famous = title({ id: "tt14", runtime: null, startYear: 2025, votes: 500000 })
    const measured = title({ id: "tt15", runtime: 138, startYear: 2024, votes: 20 })
    expect(
      pickImdbTitle(
        [famous, measured],
        { runtime: 140, title: "Alpha", type: "movie", year: 2025 },
        at,
      ),
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
      pickImdbTitle([long, short], { runtime: 45, title: "X", type: "series", year: 2020 }, at),
    ).toBe(short)
    const a = title({ id: "tt18", runtime: 100, startYear: 2020, votes: 10 })
    const b = title({ id: "tt19", runtime: null, startYear: 2020, votes: 10 })
    const c = title({ id: "tt20", runtime: 105, startYear: 2020, votes: 10 })
    for (const order of [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ]) {
      expect(
        pickImdbTitle(order, { runtime: 100, title: "X", type: "movie", year: 2020 }, at),
      ).toBe(a)
    }
  })

  test("a title that fits under its own name beats any that fit only under an alternate name, which is taken only alone", () => {
    // Torchwood (2006) carries "torchwood" as its own name; Doctor Who once used it as a fake working title.
    const torchwood = title({
      endYear: 2011,
      id: "tt0485301",
      runtime: null,
      startYear: 2006,
      titleType: "tvSeries",
      votes: 45905,
    })
    const doctorWho = title({
      aka: true,
      endYear: null,
      id: "tt0436992",
      runtime: null,
      startYear: 2005,
      titleType: "tvSeries",
      votes: 250000,
    })
    expect(
      pickImdbTitle([doctorWho, torchwood], { title: "Torchwood", type: "series", year: 2006 }, at),
    ).toBe(torchwood)
    // "Dune" 2021: only Dune: Part One fits, and only under an alternate name.
    const dune1984 = title({ id: "tt0087182", runtime: 137, startYear: 1984, votes: 193908 })
    const partOne = title({
      aka: true,
      id: "tt1160419",
      runtime: 155,
      startYear: 2021,
      votes: 1086538,
    })
    expect(
      pickImdbTitle([dune1984, partOne], { title: "Dune", type: "movie", year: 2021 }, at),
    ).toBe(partOne)
    // Two alternate-name candidates fit: an ambiguity, whatever their votes.
    const other = title({ aka: true, id: "tt2", runtime: 100, startYear: 2021, votes: 5 })
    expect(
      pickImdbTitle([partOne, other], { title: "Dune", type: "movie", year: 2021 }, at),
    ).toBeNull()
  })

  test("verification comes before the own-name preference: a fan video carrying a famous film's name does not outrank the film", () => {
    // "Star Wars: The Last Jedi" (2017, 152 min): the film under an alternate name, a RiffTrax video under its original title with no runtime on record.
    const film = title({ aka: true, id: "tt2527336", runtime: 152, startYear: 2017, votes: 726000 })
    const riff = title({ id: "tt11563030", runtime: null, startYear: 2018, votes: 43 })
    expect(
      pickImdbTitle(
        [riff, film],
        { runtime: 152, title: "Star Wars: The Last Jedi", type: "movie", year: 2017 },
        at,
      ),
    ).toBe(film)
    // Without a runtime to check, both are verifiable, the own name wins, and the film vetoes only an obscure pick.
    expect(
      pickImdbTitle(
        [riff, film],
        { title: "Star Wars: The Last Jedi", type: "movie", year: 2017 },
        at,
      ),
    ).toBeNull()
  })

  test("an alternate-name candidate vetoes only a pick nobody has heard of", () => {
    const torchwood = title({
      endYear: 2011,
      id: "tt0485301",
      runtime: null,
      startYear: 2006,
      titleType: "tvSeries",
      votes: 45905,
    })
    const doctorWho = title({
      aka: true,
      endYear: null,
      id: "tt0436992",
      runtime: null,
      startYear: 2005,
      titleType: "tvSeries",
      votes: 250000,
    })
    expect(
      pickImdbTitle([doctorWho, torchwood], { title: "Torchwood", type: "series", year: 2006 }, at),
    ).toBe(torchwood)
    const obscure = title({
      endYear: 2011,
      id: "tt1",
      runtime: null,
      startYear: 2006,
      titleType: "tvSeries",
      votes: 316,
    })
    expect(
      pickImdbTitle([doctorWho, obscure], { title: "Torchwood", type: "series", year: 2006 }, at),
    ).toBeNull()
  })

  test("the real Office: a namesake that started the stated year does not outrank the famous one", () => {
    const us = title({
      endYear: 2013,
      id: "tt0386676",
      runtime: 22,
      startYear: 2005,
      titleType: "tvSeries",
      votes: 847167,
    })
    const namesake = title({
      endYear: null,
      id: "tt2186395",
      runtime: null,
      startYear: 2012,
      titleType: "tvSeries",
      votes: 17,
    })
    const other = title({
      endYear: 2013,
      id: "tt1791001",
      runtime: 30,
      startYear: 2010,
      titleType: "tvSeries",
      votes: 87,
    })
    expect(
      pickImdbTitle([namesake, other, us], { title: "The Office", type: "series", year: 2012 }, at),
    ).toBe(us)
  })
})

describe("resolveTitle", () => {
  const office = title({
    endYear: 2013,
    id: "tt0386676",
    runtime: 22,
    startYear: 2005,
    titleType: "tvSeries",
    votes: 847167,
  })
  const parent = title({
    endYear: null,
    id: "tt10919420",
    runtime: 55,
    startYear: 2021,
    titleType: "tvSeries",
    votes: 774354,
  })
  const spinoff = title({
    endYear: null,
    id: "tt24003330",
    runtime: 50,
    startYear: 2023,
    titleType: "tvSeries",
    votes: 30000,
  })
  const hindiOf = () => title({ id: "tt28363783", runtime: 141, startYear: 2025, votes: 24000 })
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
  const lookup = (spelling: string) => index.get(spelling) ?? []

  test("a parenthetical qualifier is dropped freely; a subtitle drops to the parent for a season, never for a film", () => {
    expect(
      resolveTitle({ title: "The Office (U.S.)", type: "series", year: 2012 }, lookup, NOW)?.id,
    ).toBe("tt0386676")
    expect(
      resolveTitle({ title: "Squid Game: The Challenge", type: "series", year: 2023 }, lookup, NOW)
        ?.id,
    ).toBe("tt24003330")
    expect(
      resolveTitle(
        { title: "Operation Safed Sagar: The Untold Story", type: "series", year: 2026 },
        lookup,
        NOW,
      )?.id,
    ).toBe("tt36643714")
    // A subtitled series unknown under its own name is a season of the parent: IMDb's "Monster" (2022-) is Netflix's "Monster: The Ed Gein Story" (2025).
    const anthology = title({
      endYear: null,
      id: "tt13207736",
      runtime: null,
      startYear: 2022,
      titleType: "tvSeries",
      votes: 225875,
    })
    const anime = title({
      endYear: 2005,
      id: "tt0434706",
      runtime: null,
      startYear: 2004,
      titleType: "tvSeries",
      votes: 90000,
    })
    const monsters = (spelling: string) => (spelling === "Monster" ? [anime, anthology] : [])
    expect(
      resolveTitle(
        { title: "Monster: The Ed Gein Story", type: "series", year: 2025 },
        monsters,
        NOW,
      )?.id,
    ).toBe("tt13207736")
    expect(
      resolveTitle(
        { title: "Monster: The Jeffrey Dahmer Story", type: "series", year: 2022 },
        monsters,
        NOW,
      )?.id,
    ).toBe("tt13207736")
    expect(
      resolveTitle({ title: "Monster: Something", type: "series", year: 2010 }, monsters, NOW),
    ).toBeNull()
    // A subtitled series whose parent is obscure gets nothing; a subtitled film never drops to a namesake of another year.
    const small = title({
      endYear: null,
      id: "tt9",
      runtime: null,
      startYear: 2022,
      titleType: "tvSeries",
      votes: 300,
    })
    expect(
      resolveTitle(
        { title: "Small: Season Two", type: "series", year: 2024 },
        (s) => (s === "Small" ? [small] : []),
        NOW,
      ),
    ).toBeNull()
    const dune = title({ id: "tt1160419", runtime: 155, startYear: 2021, votes: 1086538 })
    expect(
      resolveTitle(
        { title: "Dune: Part Two", type: "movie", year: 2024 },
        (s) => (s === "Dune" ? [dune] : []),
        NOW,
      ),
    ).toBeNull()
  })

  test("an ambiguity under the platform's own spelling is final; a looser spelling is not tried", () => {
    expect(resolveTitle({ title: "Alpha", type: "movie" }, lookup, NOW)).toBeNull()
    expect(
      resolveTitle({ runtime: 140, title: "Alpha", type: "movie", year: 2026 }, lookup, NOW)?.id,
    ).toBe("tt28363783")
    expect(
      resolveTitle({ title: "Alpha: Origins", type: "movie", year: 2026 }, lookup, NOW),
    ).toBeNull()
    expect(
      resolveTitle({ title: "Nothing Here", type: "movie", year: 2026 }, lookup, NOW),
    ).toBeNull()
    // Two same-year Alphas fit "Alpha: Origins" (2025) under the loose spelling; popularity must not pick one.
    const alphas = new Map<string, ImdbTitle[]>([
      [
        "Alpha",
        [hindiOf(), title({ id: "tt29000001", runtime: 128, startYear: 2025, votes: 4000 })],
      ],
    ])
    const alphaLookup = (spelling: string) => alphas.get(spelling) ?? []
    expect(
      resolveTitle({ title: "Alpha: Origins", type: "movie", year: 2025 }, alphaLookup, NOW),
    ).toBeNull()
    expect(resolveTitle({ title: "Alpha", type: "movie", year: 2025 }, alphaLookup, NOW)?.id).toBe(
      "tt28363783",
    )
    // An ambiguity under the exact spelling stays one even when a looser spelling would fit a single title.
    const nested = new Map<string, ImdbTitle[]>([
      [
        "Dune: Part Two",
        [
          title({ id: "tt30", runtime: null, startYear: 2024, votes: 500 }),
          title({ id: "tt31", runtime: null, startYear: 2024, votes: 400 }),
        ],
      ],
      ["Dune", [title({ id: "tt32", runtime: null, startYear: 2024, votes: 90000 })]],
    ])
    expect(
      resolveTitle(
        { title: "Dune: Part Two", type: "movie", year: 2024 },
        (s) => nested.get(s) ?? [],
        NOW,
      ),
    ).toBeNull()
  })
})

describe("resolveOutcome", () => {
  const alpha = title({ id: "tt28363783", runtime: 141, startYear: 2025, votes: 24000 })
  const wolf = title({ id: "tt6194322", runtime: 96, startYear: 2018, votes: 90000 })
  const index = new Map<string, ImdbTitle[]>([
    ["Alpha", [alpha, wolf]],
    ["Brand New Film", [title({ id: "tt31000001", rating: null, startYear: 2026, votes: null })]],
  ])
  const lookup = (spelling: string) => index.get(spelling) ?? []

  test("says why a query got no title", () => {
    expect(resolveOutcome({ title: "Alpha", type: "movie" }, lookup, NOW)).toEqual({
      reason: "unstated",
      title: null,
    })
    expect(
      resolveOutcome({ title: "Nothing Here", type: "movie", year: 2026 }, lookup, NOW),
    ).toEqual({ reason: "unknown", title: null })
    expect(resolveOutcome({ title: "Alpha", type: "series", year: 2026 }, lookup, NOW)).toEqual({
      reason: "unmatched",
      title: null,
    })
    expect(resolveOutcome({ title: "Alpha", type: "movie", year: 2018 }, lookup, NOW)).toEqual({
      reason: null,
      title: wolf,
    })
    const twin = title({ id: "tt2", runtime: null, startYear: 2025, votes: 20000 })
    const ambiguous = (spelling: string) => (spelling === "Alpha" ? [alpha, twin] : [])
    expect(resolveOutcome({ title: "Alpha", type: "movie", year: 2025 }, ambiguous, NOW)).toEqual({
      reason: "ambiguous",
      title: null,
    })
    expect(
      resolveOutcome({ title: "Brand New Film", type: "movie", year: 2026 }, lookup, NOW).title
        ?.rating,
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
