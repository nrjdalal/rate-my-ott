import { db, imdbName, imdbSync, imdbTitle, type Transaction } from "@packages/db"
import { env } from "@packages/env/api-hono"
import { count, sql } from "drizzle-orm"

import {
  addAka,
  addShortNames,
  AKA_MIN_VOTES,
  keepAka,
  keepTitle,
  nameKeys,
  parseAkasLine,
  parseBasicsLine,
  parseRatingsLine,
  readGzipLines,
  shouldPrune,
  staleNames,
  toImdbTitle,
  type ImdbRating,
  type ImdbTitle,
  type Spellings,
} from "@/lib/imdb"

// Rebuilds the IMDb index from IMDb's daily datasets: every kept title is upserted (only rows that changed are written), its spellings (primary and original name, plus the alternate names a well-known title is displayed under) are added and the ones it no longer answers to are dropped, and titles that left the dataset are pruned. Run by the nightly workflow and by hand (`bun run imdb:sync`); safe to rerun, and a rerun on unchanged data writes nothing.

// Rows per statement. Each batch travels as one JSON parameter and is unpacked server-side (json_to_recordset): a 5,000-row VALUES list with 45,000 placeholders is a plan Neon's smallest compute cannot hold ("out of memory ... CachedPlan"), while one parameter is one small plan, and few enough round trips for the job to finish in minutes from a CI runner.
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

type Name = typeof imdbName.$inferInsert

// The JSON rows of a batch as a recordset the statements select from; the record's columns are the rows' own keys. The parameter travels as text and is cast on the server: declared as json, the driver would JSON-encode the string itself.
const TITLE_RECORD = sql.raw(
  't("endYear" integer, id text, "originalTitle" text, "primaryTitle" text, rating double precision, runtime integer, "startYear" integer, "titleType" text, votes integer)',
)
const NAME_RECORD = sql.raw('t(aka boolean, key text, "titleId" text)')

async function flushTitles(tx: Transaction, titles: ImdbTitle[]) {
  if (titles.length === 0) return
  // Only a row whose values changed is written, so a rerun on unchanged data leaves the table alone.
  await tx.execute(sql`
    insert into imdb_title (end_year, id, original_title, primary_title, rating, runtime, start_year, title_type, votes)
    select t."endYear", t.id, t."originalTitle", t."primaryTitle", t.rating, t.runtime, t."startYear", t."titleType", t.votes
    from json_to_recordset(${JSON.stringify(titles)}::text::json) as ${TITLE_RECORD}
    on conflict (id) do update set
      end_year = excluded.end_year, original_title = excluded.original_title, primary_title = excluded.primary_title,
      rating = excluded.rating, runtime = excluded.runtime, start_year = excluded.start_year,
      title_type = excluded.title_type, votes = excluded.votes
    where (imdb_title.end_year, imdb_title.original_title, imdb_title.primary_title, imdb_title.rating, imdb_title.runtime, imdb_title.start_year, imdb_title.title_type, imdb_title.votes)
      is distinct from (excluded.end_year, excluded.original_title, excluded.primary_title, excluded.rating, excluded.runtime, excluded.start_year, excluded.title_type, excluded.votes)
  `)
}

// The spellings of a batch of titles: added on conflict-do-nothing, and the ones the titles no longer answer to deleted, so a renamed title (IMDb renames working titles often) stops answering to its old spelling, or a platform's title of that name would land on it.
async function flushNames(tx: Transaction, ids: string[], names: Name[]) {
  if (names.length > 0) {
    await tx.execute(sql`
      insert into imdb_name (aka, key, title_id)
      select t.aka, t.key, t."titleId" from json_to_recordset(${JSON.stringify(names)}::text::json) as ${NAME_RECORD}
      on conflict (key, title_id) do update set aka = excluded.aka where imdb_name.aka is distinct from excluded.aka
    `)
  }
  const existing = await tx.execute<Name>(sql`
    select aka, key, title_id as "titleId" from imdb_name
    where title_id in (select json_array_elements_text(${JSON.stringify(ids)}::text::json))
  `)
  const stale = staleNames([...existing] as Name[], names)
  if (stale.length > 0) {
    await tx.execute(sql`
      delete from imdb_name n using json_to_recordset(${JSON.stringify(stale)}::text::json) as ${NAME_RECORD}
      where n.key = t.key and n.title_id = t."titleId"
    `)
  }
}

// Titles the dataset no longer lists leave the index; their names follow by cascade.
async function prune(tx: Transaction, seen: Set<number>): Promise<number> {
  const rows = await tx.select({ id: imdbTitle.id }).from(imdbTitle)
  const gone = rows.map((row) => row.id).filter((id) => !seen.has(numericId(id)))
  for (let offset = 0; offset < gone.length; offset += BATCH) {
    const ids = JSON.stringify(gone.slice(offset, offset + BATCH))
    await tx.execute(sql`
      delete from imdb_title where id in (select json_array_elements_text(${ids}::text::json))
    `)
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

const countTitles = async (tx: Transaction) => {
  const [row] = await tx.select({ count: count() }).from(imdbTitle)
  return row?.count ?? 0
}

// Everything the datasets say, read and parsed before any connection is held: the writes run in one transaction, and the database client closes a connection idle for thirty seconds, which streaming the alternate names alone would exceed.
type Dump = {
  akas: number
  popular: number
  read: number
  spellings: Spellings
  titles: ImdbTitle[]
}

async function readDatasets(started: number): Promise<Dump> {
  const year = new Date().getUTCFullYear()
  const ratings = await loadRatings()
  log(`${ratings.size} ratings read in ${seconds(started)}`)
  const titles: ImdbTitle[] = []
  const spellings: Spellings = new Map()
  let akas = 0
  const popular = new Set<number>()
  let read = 0
  for await (const line of await open("title.basics.tsv.gz")) {
    read += 1
    if (read % 1_000_000 === 0) log(`${read} rows read, ${titles.length} kept, ${seconds(started)}`)
    const basics = parseBasicsLine(line)
    if (!basics) continue
    const rating = ratings.get(numericId(basics.id)) ?? null
    if (!keepTitle(basics, rating, year)) continue
    if (titles.length >= MAX_TITLES) {
      throw new Error(`more than ${MAX_TITLES} titles kept, refusing to grow the index`)
    }
    titles.push(toImdbTitle(basics, rating))
    spellings.set(basics.id, { akas: [], own: nameKeys(basics) })
    if (rating !== null && rating.votes >= AKA_MIN_VOTES) {
      popular.add(numericId(basics.id))
      akas += addShortNames(spellings, basics)
    }
  }
  log(`${read} rows read, ${titles.length} titles kept, ${akas} short names, ${seconds(started)}`)
  for await (const line of await open("title.akas.tsv.gz")) {
    const aka = parseAkasLine(line)
    if (aka && popular.has(numericId(aka.id)) && keepAka(aka) && addAka(spellings, aka)) akas += 1
  }
  log(`${akas} alternate names read for ${popular.size} well-known titles, ${seconds(started)}`)
  return { akas, popular: popular.size, read, spellings, titles }
}

// One rebuild is one transaction: a night either lands whole or not at all (a refused prune leaves the previous index serving), and the connection it holds is the one place the session setting has to land. Without parallel workers, because on Neon's smallest compute a parallel scan cannot allocate its dynamic shared memory ("could not resize shared memory segment") once the table has grown, while a serial scan of it takes a second.
async function writeIndex(tx: Transaction, dump: Dump, started: number): Promise<number> {
  await tx.execute(sql`set local max_parallel_workers_per_gather = 0`)
  const before = await countTitles(tx)
  const seen = new Set<number>()
  for (let offset = 0; offset < dump.titles.length; offset += BATCH) {
    const batch = dump.titles.slice(offset, offset + BATCH)
    for (const title of batch) seen.add(numericId(title.id))
    await flushTitles(tx, batch)
  }
  log(`${dump.titles.length} titles written in ${seconds(started)}`)
  let ids: string[] = []
  let names: Name[] = []
  let count = 0
  for (const [id, { akas, own }] of dump.spellings) {
    ids.push(id)
    for (const key of own) names.push({ aka: false, key, titleId: id })
    for (const key of akas) names.push({ aka: true, key, titleId: id })
    count += own.length + akas.length
    if (ids.length >= BATCH) {
      await flushNames(tx, ids, names)
      ids = []
      names = []
    }
  }
  await flushNames(tx, ids, names)
  log(`${count} spellings of ${dump.spellings.size} titles written in ${seconds(started)}`)
  if (!shouldPrune(before, dump.titles.length)) {
    throw new Error(
      `only ${dump.titles.length} titles kept against ${before} indexed, refusing to prune`,
    )
  }
  const pruned = await prune(tx, seen)
  // One record a night is all the history worth keeping; older ones go so the table never grows past a season.
  await tx.execute(sql`delete from imdb_sync where finished_at < now() - interval '90 days'`)
  // Stamped from here, not by the database default: now() inside the transaction is when it began, a minute or two earlier.
  await tx.insert(imdbSync).values({
    akas: dump.akas,
    durationMs: Math.round(performance.now() - started),
    finishedAt: new Date(),
    names: count,
    pruned,
    titles: dump.titles.length,
  })
  return pruned
}

async function main() {
  const started = performance.now()
  log(`source ${env.IMDB_DATASETS_URL}`)
  const dump = await readDatasets(started)
  const pruned = await db.transaction((tx) => writeIndex(tx, dump, started))
  log(`${pruned} titles pruned; ${await sizes()}; done in ${seconds(started)}`)
}

// The pool's idle connection would keep the process alive; a job exits when its work is done. The failure is written and flushed before the exit, since an exit right after console.error can drop it, and a driver error names the failing query and its cause.
try {
  await main()
  process.exit(0)
} catch (error) {
  // A driver error carries a statement hundreds of kilobytes long; its cause is the part worth reading.
  const cause =
    error instanceof Error && error.cause !== undefined
      ? Bun.inspect(error.cause, { depth: 1 })
      : ""
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300)
  await Bun.write(Bun.stderr, `[imdb-sync] failed: ${message}\n${cause}\n`)
  process.exit(1)
}
