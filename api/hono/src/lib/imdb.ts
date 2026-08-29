import {
  RUNTIME_TOLERANCE_MIN,
  titleSpellings,
  YEAR_TOLERANCE,
  type TitleQuery,
  type TitleType,
} from "@/lib/lookup"

// The IMDb title kinds the index keeps, each mapped to the kind a platform states: a short, a special, or a straight-to-video release fronts a Netflix card as a film. Episodes and games never do, and would multiply the table, which has to fit a free Neon branch (512 MB).
const IMDB_TYPES = new Map<string, TitleType>([
  ["movie", "movie"],
  ["short", "movie"],
  ["tvMiniSeries", "series"],
  ["tvMovie", "movie"],
  ["tvSeries", "series"],
  ["tvSpecial", "movie"],
  ["video", "movie"],
])

export const imdbType = (titleType: string): TitleType | null => IMDB_TYPES.get(titleType) ?? null

// One row of title.basics.tsv and of title.ratings.tsv, as the dataset writes them: tab-separated, `\N` for a missing value, a header line first.
export type ImdbBasics = {
  endYear: number | null
  id: string
  isAdult: boolean
  originalTitle: string
  primaryTitle: string
  runtime: number | null
  startYear: number | null
  titleType: string
}
export type ImdbRating = { id: string; rating: number; votes: number }

// A row of the index, and what the sync job writes: the basics joined with the rating.
export type ImdbTitle = {
  endYear: number | null
  id: string
  originalTitle: string
  primaryTitle: string
  rating: number | null
  runtime: number | null
  startYear: number | null
  titleType: string
  votes: number | null
}

const NULL = "\\N"
const text = (value: string | undefined) => (value === undefined || value === NULL ? null : value)
const int = (value: string | undefined) => {
  const raw = text(value)
  if (raw === null) return null
  const number = Number(raw)
  return Number.isInteger(number) ? number : null
}

// A basics line as a record, or null for the header and for anything that is not a title row.
export function parseBasicsLine(line: string): ImdbBasics | null {
  const cols = line.split("\t")
  const id = cols[0]
  if (cols.length < 9 || !id || !id.startsWith("tt")) return null
  return {
    endYear: int(cols[6]),
    id,
    isAdult: cols[4] === "1",
    originalTitle: text(cols[3]) ?? "",
    primaryTitle: text(cols[2]) ?? "",
    runtime: int(cols[7]),
    startYear: int(cols[5]),
    titleType: cols[1] ?? "",
  }
}

// A ratings line as a record, or null for the header and for a malformed row.
export function parseRatingsLine(line: string): ImdbRating | null {
  const cols = line.split("\t")
  const id = cols[0]
  if (cols.length < 3 || !id || !id.startsWith("tt")) return null
  const rating = Number(cols[1])
  const votes = Number(cols[2])
  if (!Number.isFinite(rating) || !Number.isInteger(votes)) return null
  return { id, rating, votes }
}

// The votes a short or a straight-to-video release needs to earn a row: IMDb lists a quarter of a million rated shorts, almost all with a handful of votes, and the few that reach a Netflix card are well known.
export const MINOR_KIND_MIN_VOTES = 100

// Whether a title earns a row: a kind the index keeps, not adult, named, and either rated already or recent enough (this year or last) to be rated soon; a short or a video only once it is known. An old title nobody has voted on is never behind a card, and leaving it out keeps the table small.
export const keepTitle = (basics: ImdbBasics, rating: ImdbRating | null, year: number): boolean => {
  if (imdbType(basics.titleType) === null || basics.isAdult || basics.primaryTitle === "")
    return false
  if (basics.titleType === "short" || basics.titleType === "video") {
    return rating !== null && rating.votes >= MINOR_KIND_MIN_VOTES
  }
  return rating !== null || (basics.startYear !== null && basics.startYear >= year - 1)
}

export const toImdbTitle = (basics: ImdbBasics, rating: ImdbRating | null): ImdbTitle => ({
  endYear: basics.endYear,
  id: basics.id,
  originalTitle: basics.originalTitle,
  primaryTitle: basics.primaryTitle,
  rating: rating?.rating ?? null,
  runtime: basics.runtime,
  startYear: basics.startYear,
  titleType: basics.titleType,
  votes: rating?.votes ?? null,
})

// The spelling a name is indexed and looked up by. Case, width, diacritics, and punctuation are noise ("Marvel's Daredevil" is "marvel s daredevil", "Guns & Gulaabs" is "guns and gulaabs", "WALL·E" is "wall e"); only letters, digits, and single spaces survive. The cache key (normalizeTitle in lookup.ts) stays looser on purpose: it names what was asked, this names what is meant.
export const searchKey = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

// The distinct keys a title answers to: its primary and its original name.
export const nameKeys = (basics: Pick<ImdbBasics, "originalTitle" | "primaryTitle">): string[] => {
  const keys: string[] = []
  for (const name of [basics.primaryTitle, basics.originalTitle]) {
    const key = searchKey(name)
    if (key && !keys.includes(key)) keys.push(key)
  }
  return keys
}

// How much more popular the best of several fitting candidates must be than the runner-up before it is taken on a year alone, and how many votes it needs for that to mean anything: a same-name title from the same year or the next is usually the well-known one, but not by a hair, and not among titles nobody has heard of.
export const VOTES_DOMINANCE = 3
export const DOMINANT_MIN_VOTES = 100

// How much closer a film's runtime must be than the runner-up's to decide between them: a minute is a credits roll, three is a different cut of a different film.
export const RUNTIME_MARGIN_MIN = 3

// A series IMDb has not marked as ended is taken to still run only when it is well known: many old shows simply lack an end year, and an obscure one must not cover every later year a platform can state.
export const OPEN_RUN_MIN_VOTES = 1000

export type MatchOptions = {
  // Accept only a candidate released the stated year exactly: for a spelling looser than the platform's (a subtitle dropped), a parent or a namesake is close enough to fool the tolerances.
  exactYear?: boolean
  // The current year, for a series whose run is open.
  now?: number
}

const votesOf = (title: ImdbTitle) => title.votes ?? 0

// Whether a candidate can be the title the platform showed, given what the platform stated (the name already matches). The kind must agree. A film's year within a year of its release; a series when the stated year falls in its run, a year either side, since a platform states a show's latest season rather than its premiere; a run with no end year reaches the present only for a well-known show. A film's runtime within five minutes when both are known. A field the index lacks cannot be checked and does not disqualify here (except a missing year when the year must be exact); pickImdbTitle drops such a candidate once another can be checked.
export function fitsQuery(
  title: ImdbTitle,
  query: TitleQuery,
  options: MatchOptions = {},
): boolean {
  const now = options.now ?? new Date().getUTCFullYear()
  const kind = imdbType(title.titleType)
  if (query.type && kind !== query.type) return false
  if (query.year && title.startYear !== null) {
    if (options.exactYear && title.startYear !== query.year) return false
    if (kind === "series") {
      if (query.year < title.startYear - YEAR_TOLERANCE) return false
      if (title.endYear !== null) {
        if (query.year > title.endYear + YEAR_TOLERANCE) return false
      } else if (query.year > title.startYear + YEAR_TOLERANCE) {
        if (query.year > now + YEAR_TOLERANCE || votesOf(title) < OPEN_RUN_MIN_VOTES) return false
      }
    } else if (Math.abs(title.startYear - query.year) > YEAR_TOLERANCE) {
      return false
    }
  } else if (query.year && options.exactYear) {
    return false
  }
  if (
    query.runtime &&
    kind === "movie" &&
    title.runtime !== null &&
    Math.abs(title.runtime - query.runtime) > RUNTIME_TOLERANCE_MIN
  ) {
    return false
  }
  return true
}

// Among the candidates that fit, the one the platform meant, or null when that is not certain: no answer beats a wrong one. Nothing is taken without a stated year. Once any candidate can be checked against what was stated (a known year, a known runtime for a film when one was stated), the ones that cannot drop out, and they still veto the pick when one of them is far more popular. One left is the answer. Several of both kinds with no kind stated are an ambiguity. Several rank by closest runtime (a film, when one was stated), then votes, and the best is taken only when something separates it from the runner-up: a runtime closer by a clear margin, or votes that dominate, which is denied under a loose spelling and whenever a candidate in the running is too new to have earned its votes (unrated, or under the floor and from this year or last): that one is as likely the platform's as the popular twin.
export function pickImdbTitle(
  candidates: ImdbTitle[],
  query: TitleQuery,
  options: MatchOptions = {},
): ImdbTitle | null {
  if (!query.year) return null
  const now = options.now ?? new Date().getUTCFullYear()
  const fitting = candidates.filter((candidate) => fitsQuery(candidate, query, options))
  const runtime = query.runtime
  const checksRuntime = (title: ImdbTitle) =>
    runtime !== undefined && imdbType(title.titleType) === "movie"
  const verified = (title: ImdbTitle) =>
    (!query.year || title.startYear !== null) && (!checksRuntime(title) || title.runtime !== null)
  const verifiable = fitting.filter(verified)
  const pool = verifiable.length > 0 ? verifiable : fitting
  const dropped = fitting.filter((title) => !pool.includes(title))
  if (pool.length === 0) return null
  const gap = (title: ImdbTitle) =>
    !checksRuntime(title) || title.runtime === null ? Infinity : Math.abs(title.runtime - runtime!)
  const ranked = [...pool].sort((a, b) => {
    const byGap = gap(a) === gap(b) ? 0 : gap(a) < gap(b) ? -1 : 1
    return byGap !== 0 ? byGap : votesOf(b) - votesOf(a)
  })
  const top = ranked[0] as ImdbTitle
  if (dropped.some((title) => votesOf(title) >= VOTES_DOMINANCE * votesOf(top))) return null
  if (ranked.length === 1) return top
  if (!query.type && new Set(pool.map((title) => imdbType(title.titleType))).size > 1) return null
  const next = ranked[1] as ImdbTitle
  if (Number.isFinite(gap(top)) && gap(next) - gap(top) >= RUNTIME_MARGIN_MIN) return top
  const tooNew = (title: ImdbTitle) =>
    title.votes === null ||
    (title.votes < DOMINANT_MIN_VOTES && (title.startYear ?? now) >= now - 1)
  if (
    !options.exactYear &&
    !pool.some(tooNew) &&
    votesOf(top) >= DOMINANT_MIN_VOTES &&
    votesOf(top) >= VOTES_DOMINANCE * votesOf(next)
  ) {
    return top
  }
  return null
}

// The title the index holds for a query, spelling by spelling (as the platform wrote it, then without a parenthetical qualifier, then without a subtitle after a colon), stopping at the first spelling any candidate fits: what fits under the platform's own spelling is either the answer or an ambiguity, never a reason to try a looser one. The unsubtitled spelling names a parent or a namesake as easily as the title, so it is taken only for the stated year exactly.
export function resolveTitle(
  query: TitleQuery,
  candidatesFor: (spelling: string) => ImdbTitle[],
  now?: number,
): ImdbTitle | null {
  for (const { loose, spelling } of titleSpellings(query.title)) {
    const candidates = candidatesFor(spelling)
    if (candidates.length === 0) continue
    const options: MatchOptions = { exactYear: loose, now }
    if (!candidates.some((candidate) => fitsQuery(candidate, query, options))) continue
    return pickImdbTitle(candidates, query, options)
  }
  return null
}

// The name rows a title no longer answers to, once its spellings are rewritten: what the index holds for it that the fresh spellings do not.
export const staleNames = <T extends { key: string; titleId: string }>(
  existing: T[],
  fresh: { key: string; titleId: string }[],
): T[] => {
  const keep = new Set(fresh.map((name) => `${name.key}\u0000${name.titleId}`))
  return existing.filter((name) => !keep.has(`${name.key}\u0000${name.titleId}`))
}

// Whether a rebuild may delete what it did not see: not when it would shrink the index by half or more, which means a truncated download or a changed format rather than IMDb dropping half its titles overnight.
export const shouldPrune = (before: number, kept: number): boolean =>
  before === 0 || kept >= before / 2

// The lines of a gzipped TSV as it streams in, chunk boundaries and multi-byte characters handled, the trailing line included when the file does not end in a newline.
export async function* readGzipLines(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let rest = ""
  for await (const chunk of stream.pipeThrough(new DecompressionStream("gzip"))) {
    const parts = (rest + decoder.decode(chunk, { stream: true })).split("\n")
    rest = parts.pop() as string
    for (const part of parts) yield part
  }
  rest += decoder.decode()
  if (rest) yield rest
}
