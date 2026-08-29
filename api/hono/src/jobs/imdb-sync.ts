import { db, imdbName, imdbTitle } from "@packages/db"
import { env } from "@packages/env/api-hono"
import { count, getTableColumns, inArray, sql } from "drizzle-orm"

import {
  keepTitle,
  nameKeys,
  parseBasicsLine,
  parseRatingsLine,
  readGzipLines,
  shouldPrune,
  staleNames,
  toImdbTitle,
  type ImdbRating,
  type ImdbTitle,
} from "@/lib/imdb"

// Rebuilds the IMDb index from IMDb's daily datasets: every kept title is upserted (only rows that changed are written), spellings are added and the ones a renamed title no longer answers to are dropped, and titles that left the dataset are pruned. Run by the nightly workflow and by hand (`bun run imdb:sync`); safe to rerun, and a rerun on unchanged data writes nothing.

// Rows per statement: 5,000 titles is 45,000 bind parameters, under Postgres's 65,535, and few enough round trips for the job to finish in minutes from a CI runner.
const BATCH = 5000

// Sanity bounds on the kept titles. A rebuild that would shrink the index by half or more means the download was truncated or the format changed, and nothing is pruned; over the ceiling the filter no longer holds the table under the free branch's 512 MB, and the job stops writing.
const MAX_TITLES = 1_500_000

const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000

const log = (message: string) => console.log(`[imdb-sync] ${message}`)
const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)}s`

async function open(file: string): Promise<AsyncGenerator<string>> {
  const url = new URL(file, `${env.IMDB_DATASETS_URL.replace(/\/$/, "")}/`)
  // A stalled download must fail the job, not hold it to the workflow's limit; the largest file takes a minute or two.
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok || !response.body) throw new Error(`${url} answered ${response.status}`)
  return readGzipLines(response.body)
}

// A tconst as a number, the cheapest key for a map of every rating.
const numericId = (id: string) => Number(id.slice(2))

async function loadRatings(): Promise<Map<number, ImdbRating>> {
  const ratings = new Map<number, ImdbRating>()
  for await (const line of await open("title.ratings.tsv.gz")) {
    const parsed = parseRatingsLine(line)
    if (parsed) ratings.set(numericId(parsed.id), parsed)
  }
  return ratings
}

const columns = getTableColumns(imdbTitle)
const CHANGING = [
  "endYear",
  "originalTitle",
  "primaryTitle",
  "rating",
  "runtime",
  "startYear",
  "titleType",
  "votes",
] as const
const excluded = Object.fromEntries(
  CHANGING.map((name) => [name, sql.raw(`excluded."${columns[name].name}"`)]),
)
const current = CHANGING.map((name) => `"imdb_title"."${columns[name].name}"`).join(", ")
const incoming = CHANGING.map((name) => `excluded."${columns[name].name}"`).join(", ")
const changed = sql.raw(`(${current}) IS DISTINCT FROM (${incoming})`)

type Name = typeof imdbName.$inferInsert

async function flush(titles: ImdbTitle[], names: Name[]) {
  if (titles.length === 0) return
  await db
    .insert(imdbTitle)
    .values(titles)
    .onConflictDoUpdate({ set: excluded, setWhere: changed, target: imdbTitle.id })
  if (names.length > 0) await db.insert(imdbName).values(names).onConflictDoNothing()
  // A renamed title (IMDb renames working titles often) must stop answering to its old spelling, or a platform's title of that name would land on it.
  const ids = titles.map((title) => title.id)
  const existing = await db.select().from(imdbName).where(inArray(imdbName.titleId, ids))
  const stale = staleNames(existing, names)
  if (stale.length > 0) {
    await db.delete(imdbName).where(
      inArray(
        sql`(${imdbName.key}, ${imdbName.titleId})`,
        stale.map((name) => sql`(${name.key}, ${name.titleId})`),
      ),
    )
  }
}

// Titles the dataset no longer lists leave the index; their names follow by cascade.
async function prune(seen: Set<number>): Promise<number> {
  const rows = await db.select({ id: imdbTitle.id }).from(imdbTitle)
  const gone = rows.map((row) => row.id).filter((id) => !seen.has(numericId(id)))
  for (let offset = 0; offset < gone.length; offset += BATCH) {
    await db.delete(imdbTitle).where(inArray(imdbTitle.id, gone.slice(offset, offset + BATCH)))
  }
  return gone.length
}

async function sizes(): Promise<string> {
  const rows = await db.execute<{ name: string; size: string }>(sql`
    select relname as name, pg_size_pretty(pg_total_relation_size(oid)) as size
    from pg_class where relname in ('imdb_title', 'imdb_name') order by relname
  `)
  return [...rows].map((row) => `${row.name} ${row.size}`).join(", ")
}

const countTitles = async () => {
  const [row] = await db.select({ count: count() }).from(imdbTitle)
  return row?.count ?? 0
}

async function main() {
  const started = performance.now()
  const year = new Date().getUTCFullYear()
  log(`source ${env.IMDB_DATASETS_URL}`)
  const before = await countTitles()
  const ratings = await loadRatings()
  log(`${ratings.size} ratings read in ${seconds(started)}`)

  const seen = new Set<number>()
  let read = 0
  let kept = 0
  let titles: ImdbTitle[] = []
  let names: Name[] = []
  for await (const line of await open("title.basics.tsv.gz")) {
    read += 1
    if (read % 1_000_000 === 0) log(`${read} rows read, ${kept} kept, ${seconds(started)}`)
    const basics = parseBasicsLine(line)
    if (!basics) continue
    const rating = ratings.get(numericId(basics.id)) ?? null
    if (!keepTitle(basics, rating, year)) continue
    kept += 1
    if (kept > MAX_TITLES)
      throw new Error(`more than ${MAX_TITLES} titles kept, refusing to grow the index`)
    seen.add(numericId(basics.id))
    titles.push(toImdbTitle(basics, rating))
    for (const key of nameKeys(basics)) names.push({ key, titleId: basics.id })
    if (titles.length >= BATCH) {
      await flush(titles, names)
      titles = []
      names = []
    }
  }
  await flush(titles, names)
  log(`${read} rows read, ${kept} titles kept and written in ${seconds(started)}`)
  if (!shouldPrune(before, kept)) {
    throw new Error(`only ${kept} titles kept against ${before} indexed, refusing to prune`)
  }

  const pruned = await prune(seen)
  log(`${pruned} titles pruned; ${await sizes()}; done in ${seconds(started)}`)
}

// The pool's idle connection would keep the process alive; a job exits when its work is done.
try {
  await main()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
