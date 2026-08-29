import { db, rating } from "@packages/db"
import { env } from "@packages/env/api-hono"
import { getTableColumns, inArray, sql } from "drizzle-orm"

import { ApiError } from "@/lib/error"
import {
  alignTo,
  isStale,
  mapLimit,
  matchesQuery,
  normalizeTitle,
  pickCandidate,
  titleVariants,
  uniqueQueries,
  yearsAround,
} from "@/lib/lookup"
import {
  omdbIdParams,
  omdbSearchParams,
  omdbTitleParams,
  parseOmdb,
  parseOmdbSearch,
  type Candidate,
  type OmdbBody,
  type OmdbSearchBody,
  type ProviderTitle,
  type TitleQuery,
} from "@/lib/omdb"

export type Rating = typeof rating.$inferSelect

// At most this many provider calls in flight for one request, and this many same-name candidates whose details a search is worth fetching.
const CONCURRENCY = 5
const MAX_CANDIDATES = 4

// The provider asked once per spelling the platform's title could go by, stopping at the first hit; a title unknown under every spelling is a miss.
async function fetchProviderTitle(query: TitleQuery): Promise<ProviderTitle | null> {
  for (const title of titleVariants(query.title)) {
    const found = await fetchProviderOnce({ ...query, title })
    if (found) return found
  }
  return null
}

// One GET to OMDb with the given params, answered as JSON, or a 502/503 the envelope can carry: 503 when no key is configured (the rest of the API keeps working without one), 502 when OMDb is down or refuses the key.
async function omdbGet<T>(params: (apiKey: string) => URLSearchParams): Promise<T> {
  if (!env.OMDB_API_KEY) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Set OMDB_API_KEY to enable ratings lookups")
  }
  const url = new URL(env.OMDB_API_URL)
  url.search = params(env.OMDB_API_KEY).toString()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    // OMDb answers 401 with a JSON body naming the key problem, which the parsers report as a refusal; anything else non-2xx has no body worth reading.
    if (!response.ok && response.status !== 401) {
      throw new ApiError(502, "BAD_GATEWAY", `OMDb answered ${response.status}`)
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError(502, "BAD_GATEWAY", `OMDb is unreachable: ${message}`)
  }
}

const refused = (error: string): never => {
  throw new ApiError(502, "BAD_GATEWAY", `OMDb refused the request: ${error}`)
}

// OMDb's single best match for a title (t=), or by id (i=); a miss is null.
async function omdbTitle(
  params: (apiKey: string) => URLSearchParams,
): Promise<ProviderTitle | null> {
  const answer = parseOmdb(await omdbGet<OmdbBody>(params))
  return answer.ok ? answer.title : refused(answer.error)
}

// The same-name candidates a search lists for the query's year and kind: OMDb searches by prefix, so the name is matched exactly here.
async function omdbCandidates(query: TitleQuery): Promise<Candidate[]> {
  const answer = parseOmdbSearch(
    await omdbGet<OmdbSearchBody>((key) => omdbSearchParams(query, key)),
  )
  if (!answer.ok) return refused(answer.error)
  const wanted = normalizeTitle(query.title)
  return answer.candidates.filter(
    (candidate) =>
      normalizeTitle(candidate.title) === wanted && (!query.type || candidate.type === query.type),
  )
}

// The provider asked for one spelling. Without a year, the title lookup is the whole story. With one, the title lookup is tried first and kept when it fits the platform's year and runtime; when it does not (it answers a same-name film from another year or country), the search lists the exact-name candidates for the year and its neighbours, and the one whose details fit is taken, or none: no answer beats a wrong one.
async function fetchProviderOnce(query: TitleQuery): Promise<ProviderTitle | null> {
  const direct = await omdbTitle((key) => omdbTitleParams(query, key))
  if (!query.year) return direct
  if (direct && matchesQuery(direct, query)) return direct
  for (const year of yearsAround(query.year)) {
    const candidates = (await omdbCandidates({ ...query, year })).slice(0, MAX_CANDIDATES)
    if (candidates.length === 0) continue
    const details = await mapLimit(candidates, CONCURRENCY, (candidate) =>
      omdbTitle((key) => omdbIdParams(candidate.imdbId, key)),
    )
    const picked = pickCandidate(
      details.filter((detail): detail is ProviderTitle => detail !== null),
      query,
    )
    if (picked) return picked
  }
  return null
}

// A miss keeps the asked-for title, year, and type, so the row still says what was looked up.
const toRow = (key: string, query: TitleQuery, found: ProviderTitle | null) => ({
  fetchedAt: new Date(),
  found: found !== null,
  imdbId: found?.imdbId ?? null,
  imdbRating: found?.imdbRating ?? null,
  imdbVotes: found?.imdbVotes ?? null,
  key,
  metascore: found?.metascore ?? null,
  poster: found?.poster ?? null,
  rottenTomatoes: found?.rottenTomatoes ?? null,
  title: found?.title ?? query.title.trim(),
  type: found?.type ?? query.type ?? "unknown",
  year: found?.year ?? query.year ?? null,
})

// Everything a refresh overwrites on a stale row: the provider fields, each taken from the row being inserted. Built from the table so a renamed column is a type error rather than a silent keep of the old value.
const columns = getTableColumns(rating)
const REFRESHED = [
  "fetchedAt",
  "found",
  "imdbId",
  "imdbRating",
  "imdbVotes",
  "metascore",
  "poster",
  "rottenTomatoes",
  "title",
  "type",
  "year",
] as const
const refresh = {
  ...Object.fromEntries(
    REFRESHED.map((name) => [name, sql.raw(`excluded."${columns[name].name}"`)]),
  ),
  updatedAt: sql`now()`,
}

// Answer a batch from the cache, asking the provider only for what is missing or stale, and remember what it said, hit or miss. One answer per request item, in request order.
export async function lookupRatings(queries: TitleQuery[]): Promise<Rating[]> {
  const asked = uniqueQueries(queries)
  const keys = asked.map((entry) => entry.key)
  const cached = keys.length ? await db.select().from(rating).where(inArray(rating.key, keys)) : []
  const byKey = new Map(cached.map((row) => [row.key, row]))

  const pending = asked.filter((entry) => {
    const row = byKey.get(entry.key)
    return !row || isStale(row)
  })
  if (pending.length > 0) {
    const fetched = await mapLimit(pending, CONCURRENCY, async ({ key, query }) =>
      toRow(key, query, await fetchProviderTitle(query)),
    )
    // One statement for the batch; the key is the natural identity, so a stale row is refreshed in place rather than duplicated.
    const written = await db
      .insert(rating)
      .values(fetched)
      .onConflictDoUpdate({ set: refresh, target: rating.key })
      .returning()
    for (const row of written) byKey.set(row.key, row)
  }
  return alignTo(queries, byKey)
}
