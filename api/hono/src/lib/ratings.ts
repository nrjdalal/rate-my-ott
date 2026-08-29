import { db, imdbName, imdbSync, imdbTitle } from "@packages/db"
import { desc, eq, inArray } from "drizzle-orm"

import { ApiError } from "@/lib/error"
import { resolveOutcome, searchKey, toRating, type ImdbTitle, type Rating } from "@/lib/imdb"
import { alignTo, titleVariants, uniqueQueries, type TitleQuery } from "@/lib/lookup"

export type { Rating } from "@/lib/imdb"

// The index rows whose name matches any spelling of any of the queries, in one round trip, grouped by the spelling's key.
async function imdbCandidates(queries: TitleQuery[]): Promise<Map<string, ImdbTitle[]>> {
  const keys = [
    ...new Set(queries.flatMap((query) => titleVariants(query.title).map(searchKey))),
  ].filter((key) => key !== "")
  const found = new Map<string, ImdbTitle[]>()
  if (keys.length === 0) return found
  const rows = await db
    .select({ aka: imdbName.aka, key: imdbName.key, title: imdbTitle })
    .from(imdbName)
    .innerJoin(imdbTitle, eq(imdbName.titleId, imdbTitle.id))
    .where(inArray(imdbName.key, keys))
  for (const row of rows) {
    const list = found.get(row.key) ?? []
    list.push({ ...row.title, aka: row.aka })
    found.set(row.key, list)
  }
  return found
}

const indexEmpty = async () => {
  const [row] = await db.select({ id: imdbTitle.id }).from(imdbTitle).limit(1)
  return row === undefined
}

// Answer a batch from the index: one round trip for every spelling of every distinct title, then the pure matching per query. One answer per request item, in request order. An index with nothing in it (imdb:sync has not run) is a 503, not a batch of misses.
export async function lookupRatings(queries: TitleQuery[]): Promise<Rating[]> {
  const asked = uniqueQueries(queries)
  const index = await imdbCandidates(asked.map((entry) => entry.query))
  if (index.size === 0 && (await indexEmpty())) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "The IMDb index is empty; run imdb:sync")
  }
  const byKey = new Map(
    asked.map(({ key, query }) => [
      key,
      toRating(
        query,
        resolveOutcome(query, (spelling) => index.get(searchKey(spelling)) ?? []),
      ),
    ]),
  )
  return alignTo(queries, byKey)
}

// The newest rebuild's record, or null while the index has never been built.
export async function indexStatus() {
  const [row] = await db.select().from(imdbSync).orderBy(desc(imdbSync.finishedAt)).limit(1)
  return row ?? null
}
