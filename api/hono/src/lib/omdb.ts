// OMDb's title lookup (https://www.omdbapi.com), parsed into what the rating cache stores. Pure on purpose: nothing here reads env or the network, so tests/api/hono/src/lib/omdb.test.ts can feed it captured bodies, and the fetch that wraps it lives in ratings.ts beside the cache.

export const TITLE_TYPES = ["movie", "series"] as const
export type TitleType = (typeof TITLE_TYPES)[number]

// What a platform can say about a title: its name, and when it knows them, its kind, release year, and length in minutes, which are what tell one title from another of the same name.
export type TitleQuery = { runtime?: number; title: string; type?: TitleType; year?: number }

// What the provider answers for one query once normalized; the rating table minus its bookkeeping columns, so a hit is one upsert away from the cache.
export type ProviderTitle = {
  imdbId: string | null
  imdbRating: number | null
  imdbVotes: number | null
  metascore: number | null
  poster: string | null
  rottenTomatoes: number | null
  runtime: number | null
  title: string
  type: TitleType | "unknown"
  year: number | null
}

export type OmdbBody = {
  Error?: string
  Metascore?: string
  Poster?: string
  Ratings?: { Source: string; Value: string }[]
  Response: "False" | "True"
  Runtime?: string
  Title?: string
  Type?: string
  Year?: string
  imdbID?: string
  imdbRating?: string
  imdbVotes?: string
}

// A miss (the title is unknown to OMDb) is an answer; a refusal (the key is missing, invalid, or over its daily limit) is not, and the caller turns it into a 502.
export type OmdbAnswer = { ok: true; title: ProviderTitle | null } | { ok: false; error: string }

// OMDb spells an absent value "N/A" rather than omitting the field.
const present = (value: string | undefined): string | null =>
  value && value !== "N/A" ? value : null

const asNumber = (value: string | null): number | null => {
  if (value === null) return null
  const n = Number(value.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

// "91%" from the Rotten Tomatoes entry of the Ratings list; OMDb carries it nowhere else.
const rottenTomatoesOf = (ratings: OmdbBody["Ratings"]): number | null => {
  const entry = ratings?.find((r) => r.Source === "Rotten Tomatoes")
  return entry ? asNumber(entry.Value.replace("%", "")) : null
}

// A series year reads "2019-" or "2019-2023" (with OMDb's own dash); the first four digits are the year the title started, which is what a card can be matched on.
const yearOf = (value: string | null): number | null => {
  const match = value?.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

// "128 min" as a number of minutes.
const runtimeOf = (value: string | null): number | null => {
  const match = value?.match(/(\d+)\s*min/)
  return match ? Number(match[1]) : null
}

const typeOf = (value: string | undefined): ProviderTitle["type"] =>
  value === "movie" || value === "series" ? value : "unknown"

// Anything OMDb says about the key rather than the title: "No API key provided.", "Invalid API key!", "Request limit reached!".
const isRefusal = (error: string) => /api key|request limit/i.test(error)

export function parseOmdb(body: OmdbBody): OmdbAnswer {
  if (body.Response !== "True") {
    const error = body.Error ?? "Unknown error"
    return isRefusal(error) ? { ok: false, error } : { ok: true, title: null }
  }
  return {
    ok: true,
    title: {
      imdbId: present(body.imdbID),
      imdbRating: asNumber(present(body.imdbRating)),
      imdbVotes: asNumber(present(body.imdbVotes)),
      metascore: asNumber(present(body.Metascore)),
      poster: present(body.Poster),
      rottenTomatoes: rottenTomatoesOf(body.Ratings),
      runtime: runtimeOf(present(body.Runtime)),
      title: body.Title ?? "",
      type: typeOf(body.Type),
      year: yearOf(present(body.Year)),
    },
  }
}

// The query string OMDb wants for a title lookup (its single best match): the title, plus the year and type when the caller knows them.
export function omdbTitleParams(query: TitleQuery, apiKey: string): URLSearchParams {
  const params = new URLSearchParams({ apikey: apiKey, t: query.title })
  if (query.year) params.set("y", String(query.year))
  if (query.type) params.set("type", query.type)
  return params
}

// The query string for a search (every match, by title prefix), and for one entry by its IMDb id.
export function omdbSearchParams(query: TitleQuery, apiKey: string): URLSearchParams {
  const params = new URLSearchParams({ apikey: apiKey, s: query.title })
  if (query.year) params.set("y", String(query.year))
  if (query.type) params.set("type", query.type)
  return params
}

export const omdbIdParams = (imdbId: string, apiKey: string): URLSearchParams =>
  new URLSearchParams({ apikey: apiKey, i: imdbId })

export type OmdbSearchBody = {
  Error?: string
  Response: "False" | "True"
  Search?: { Title: string; Type: string; Year: string; imdbID: string }[]
  totalResults?: string
}

export type Candidate = {
  imdbId: string
  title: string
  type: ProviderTitle["type"]
  year: number | null
}

export type OmdbSearchAnswer = { candidates: Candidate[]; ok: true } | { error: string; ok: false }

// A search with no results is an empty answer, not an error; a refused key is, like the title lookup.
export function parseOmdbSearch(body: OmdbSearchBody): OmdbSearchAnswer {
  if (body.Response !== "True") {
    const error = body.Error ?? "Unknown error"
    return isRefusal(error) ? { error, ok: false } : { candidates: [], ok: true }
  }
  return {
    candidates: (body.Search ?? []).map((entry) => ({
      imdbId: entry.imdbID,
      title: entry.Title,
      type: typeOf(entry.Type),
      year: yearOf(present(entry.Year)),
    })),
    ok: true,
  }
}
