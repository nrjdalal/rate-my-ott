// The kinds a platform states for a title, and one lookup as the extension sends it: what it reads off a card or a modal.
export const TITLE_TYPES = ["movie", "series"] as const
export type TitleType = (typeof TITLE_TYPES)[number]
export type TitleQuery = { runtime?: number; title: string; type?: TitleType; year?: number }

// Casing and spacing are noise in a title as asked.
export const normalizeTitle = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

// One string per distinct lookup, so a batch dedupes on it and the answers are spread back by it. The year, kind, and runtime are part of the identity because a remake shares the title.
export const lookupKey = (query: TitleQuery) =>
  `${normalizeTitle(query.title)}|${query.year ?? ""}|${query.type ?? ""}|${query.runtime ?? ""}`

// The spellings to try when the index does not know a title as the platform writes it: as given, then without a parenthetical qualifier ("The Office (U.S.)" is still The Office), then without a subtitle after a colon ("Grand Theft Auto VI: An Extended Look"), which is loose: it names a parent or a namesake as easily as the title. Each is followed by its spelling with the leading English article dropped or "The" put on ("Devil's Advocate" is IMDb's "The Devil's Advocate"), as strict as the spelling itself: the article is the platform's to keep or drop, and the year, kind, and runtime still have to fit. Each distinct spelling is listed once, in that order.
const ARTICLE = /^(?:the|a|an)\s+/i
export type Spelling = { loose: boolean; spelling: string }

export const titleSpellings = (title: string): Spelling[] => {
  const spellings: Spelling[] = []
  const push = (value: string, loose: boolean) => {
    const spelling = value.replace(/\s+/g, " ").trim()
    if (spelling && !spellings.some((known) => known.spelling === spelling)) {
      spellings.push({ loose, spelling })
    }
  }
  const add = (value: string, loose: boolean) => {
    const spelling = value.replace(/\s+/g, " ").trim()
    if (!spelling) return
    push(spelling, loose)
    const bare = spelling.replace(ARTICLE, "")
    push(bare === spelling ? `The ${spelling}` : bare, loose)
  }
  add(title, false)
  const unqualified = title.replace(/\s*\([^)]*\)/g, "")
  add(unqualified, false)
  add(unqualified.split(":")[0] as string, true)
  return spellings
}

export const titleVariants = (title: string): string[] =>
  titleSpellings(title).map((known) => known.spelling)

// How far an index entry may sit from what the platform stated and still be the same title: a release year differs by region and a festival premiere lands a year early; a runtime differs by a credits roll, the speed-up of a long film, or a cut for the platform (Netflix's "Bhooth Bangla" runs 163 minutes to IMDb's 173), not by much more; namesakes closer than that are told apart by whichever runtime is closer.
export const YEAR_TOLERANCE = 1
export const RUNTIME_TOLERANCE_MIN = 10

// The distinct queries of a batch in the order first asked, each with its key; the answer is later spread back over the original order with alignTo.
export const uniqueQueries = (queries: TitleQuery[]) => {
  const seen = new Map<string, TitleQuery>()
  for (const query of queries) {
    const key = lookupKey(query)
    if (!seen.has(key)) seen.set(key, query)
  }
  return [...seen.entries()].map(([key, query]) => ({ key, query }))
}

// One answer per request item, in request order, duplicates repeated, so a client maps results positionally and never has to reproduce the key normalization.
export const alignTo = <T>(queries: TitleQuery[], byKey: Map<string, T>): T[] =>
  queries.map((query) => {
    const row = byKey.get(lookupKey(query))
    if (row === undefined) throw new Error(`no answer for "${query.title}"`)
    return row
  })
