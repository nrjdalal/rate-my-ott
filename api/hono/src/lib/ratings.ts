import { db, rating } from "@packages/db"
import { env } from "@packages/env/api-hono"
import { getTableColumns, inArray, sql } from "drizzle-orm"

import { ApiError } from "@/lib/error"
import { alignTo, isStale, mapLimit, titleVariants, uniqueQueries } from "@/lib/lookup"
import {
  omdbSearchParams,
  parseOmdb,
  type OmdbBody,
  type ProviderTitle,
  type TitleQuery,
} from "@/lib/omdb"

export type Rating = typeof rating.$inferSelect

// At most this many provider calls in flight for one request.
const CONCURRENCY = 5

// The provider asked once per spelling the platform's title could go by, stopping at the first hit; a title unknown under every spelling is a miss.
async function fetchProviderTitle(query: TitleQuery): Promise<ProviderTitle | null> {
  for (const title of titleVariants(query.title)) {
    const found = await fetchProviderOnce({ ...query, title })
    if (found) return found
  }
  return null
}

// One provider call, or a 502/503 the envelope can carry: 503 when no key is configured (the rest of the API keeps working without one), 502 when OMDb is down or refuses the key. A miss is null.
async function fetchProviderOnce(query: TitleQuery): Promise<ProviderTitle | null> {
  if (!env.OMDB_API_KEY) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Set OMDB_API_KEY to enable ratings lookups")
  }
  const url = new URL(env.OMDB_API_URL)
  url.search = omdbSearchParams(query, env.OMDB_API_KEY).toString()
  let body: OmdbBody
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    // OMDb answers 401 with a JSON body naming the key problem, which parseOmdb reports as a refusal; anything else non-2xx has no body worth reading.
    if (!response.ok && response.status !== 401) {
      throw new ApiError(502, "BAD_GATEWAY", `OMDb answered ${response.status}`)
    }
    body = (await response.json()) as OmdbBody
  } catch (error) {
    if (error instanceof ApiError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError(502, "BAD_GATEWAY", `OMDb is unreachable: ${message}`)
  }
  const answer = parseOmdb(body)
  if (!answer.ok)
    throw new ApiError(502, "BAD_GATEWAY", `OMDb refused the request: ${answer.error}`)
  return answer.title
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
