// OMDb's title lookup (https://www.omdbapi.com), parsed into what the rating cache stores. Pure on purpose: nothing here reads env or the network, so tests/api/hono/src/lib/omdb.test.ts can feed it captured bodies, and the fetch that wraps it lives in ratings.ts beside the cache.

export const TITLE_TYPES = ["movie", "series"] as const
export type TitleType = (typeof TITLE_TYPES)[number]

export type TitleQuery = { title: string; type?: TitleType; year?: number }

// What the provider answers for one query once normalized; the rating table minus its bookkeeping columns, so a hit is one upsert away from the cache.
export type ProviderTitle = {
  imdbId: string | null
  imdbRating: number | null
  imdbVotes: number | null
  metascore: number | null
  poster: string | null
  rottenTomatoes: number | null
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
      title: body.Title ?? "",
      type: typeOf(body.Type),
      year: yearOf(present(body.Year)),
    },
  }
}

// The query string OMDb wants for a title lookup: the title, plus the year and type when the caller knows them, which is what disambiguates a remake from the original.
export function omdbSearchParams(query: TitleQuery, apiKey: string): URLSearchParams {
  const params = new URLSearchParams({ apikey: apiKey, t: query.title })
  if (query.year) params.set("y", String(query.year))
  if (query.type) params.set("type", query.type)
  return params
}
