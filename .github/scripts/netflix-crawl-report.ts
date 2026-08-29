// Reads a crawl (netflix-crawl.sh), dedupes the stamped cards into titles, and replays every unbadged one that stated a year against the API, with and without its runtime, so a matching gap shows up as a line to reason about: what Netflix stated, what the API answered, and (with POSTGRES_URL and psql at hand) what the index holds under the name.
//
//   bun run crawl:report                                  # extension/wxt/.output/crawl/crawl.jsonl against http://localhost:4000
//   RMO_API_URL=https://api-rate-my-ott.vercel.app bun run crawl:report path/to/crawl.jsonl

import { $ } from "bun"

type Card = {
  badge: string | null
  id: string
  kind: string | null
  runtime: string | null
  surface: string
  title: string
  year: string | null
}
type Hover = {
  badge: string | null
  card: string | null
  preview: { line: string | null; panel: string | null } | null
}
type Page = {
  cards: Card[]
  hovers: Hover[]
  modal: { meta: string; more: [string, string | null][]; row: string | null } | null
  report: { groups: { titles: string[]; why: string }[]; heading: string | null } | null
  url: string
}
type Answer = {
  found: boolean
  imdbId: string | null
  imdbRating: number | null
  reason: string | null
}

const root = new URL("../..", import.meta.url).pathname
const file = process.argv[2] ?? `${root}extension/wxt/.output/crawl/crawl.jsonl`
const api = process.env.RMO_API_URL ?? "http://localhost:4000"
const pages = (await Bun.file(file).text())
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Page)

const titles = new Map<string, Card>()
let stamps = 0
for (const page of pages) {
  for (const card of page.cards) {
    stamps += 1
    const key = `${card.title.toLowerCase()}|${card.year ?? ""}`
    const known = titles.get(key)
    if (!known) titles.set(key, { ...card })
    else {
      if (!known.badge && card.badge) known.badge = card.badge
      if (!known.runtime && card.runtime) known.runtime = card.runtime
    }
  }
}
const all = [...titles.values()]
const unbadged = all.filter((card) => !card.badge)
const dated = unbadged.filter((card) => card.year)
console.log(
  `${pages.length} pages, ${stamps} stamps, ${all.length} titles, ${all.length - unbadged.length} badged, ${unbadged.length} unbadged (${unbadged.length - dated.length} with no year stated)`,
)
console.log(`popup: ${pages.map((page) => page.report?.heading ?? "no report").join(" | ")}`)
const flatHovers = pages.flatMap((page) => page.hovers)
console.log(
  `hovers: ${flatHovers.length}, preview open ${flatHovers.filter((h) => h.preview).length}, rating on the line ${flatHovers.filter((h) => h.preview?.panel).length}`,
)
console.log(
  `modals: ${pages.map((page) => (page.modal ? `${page.modal.meta} -> ${page.modal.row ?? "no row"}, more like this ${page.modal.more.filter((m) => m[1]).length}/${page.modal.more.length}` : "none")).join(" | ")}`,
)

const ask = async (withRuntime: boolean): Promise<Answer[]> => {
  const out: Answer[] = []
  for (let i = 0; i < dated.length; i += 50) {
    const batch = dated.slice(i, i + 50).map((card) => ({
      title: card.title,
      year: Number(card.year),
      ...(card.kind ? { type: card.kind } : {}),
      ...(withRuntime && card.runtime ? { runtime: Number(card.runtime) } : {}),
    }))
    const response = await fetch(`${api}/api/v1/ratings`, {
      body: JSON.stringify({ titles: batch }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    const json = (await response.json()) as { data?: { ratings: Answer[] }; error?: unknown }
    if (!json.data) throw new Error(`${api}: ${JSON.stringify(json.error)}`)
    out.push(...json.data.ratings)
  }
  return out
}
const withRuntime = await ask(true)
const withoutRuntime = await ask(false)

const key = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
const psql = process.env.POSTGRES_URL && Bun.which("psql") ? process.env.POSTGRES_URL : null
const held = async (title: string): Promise<string> => {
  if (!psql) return ""
  const k = key(title)
  const keys = [k, k.replace(/^(the|a|an) /, ""), `the ${k}`].map(
    (x) => `'${x.replace(/'/g, "''")}'`,
  )
  const sql = `select t.title_type || ' ' || coalesce(t.start_year::text, '?') || coalesce('-' || t.end_year, '') || ' ' || coalesce(t.runtime::text, '?') || 'm ' || coalesce(t.rating::text, '-') || '/' || coalesce(t.votes::text, '-') || case when n.aka then ' aka' else '' end from imdb_name n join imdb_title t on t.id = n.title_id where n.key in (${keys.join(",")}) order by t.votes desc nulls last limit 6`
  try {
    const rows = (await $`psql ${psql} -Atc ${sql}`.quiet().text()).trim()
    return rows ? ` | index: ${rows.split("\n").join(" ; ")}` : " | index: nothing"
  } catch (error) {
    return ` | index: psql failed (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`
  }
}

const describe = (answer: Answer) =>
  answer.found ? `${answer.imdbId} ${answer.imdbRating ?? "unrated"}` : (answer.reason ?? "?")
const byReason = new Map<string, number>()
console.log(`\nunbadged with a year (${dated.length}):`)
for (const [i, card] of dated.entries()) {
  const a = withRuntime[i] as Answer
  const b = withoutRuntime[i] as Answer
  const reason = a.reason ?? (a.found ? "found now" : "?")
  byReason.set(reason, (byReason.get(reason) ?? 0) + 1)
  console.log(
    `- ${card.title} (${card.year}, ${card.kind ?? "?"}, ${card.runtime ?? "?"}m) [${card.surface}] with runtime: ${describe(a)}; without: ${describe(b)}${await held(card.title)}`,
  )
}
console.log(`\nby reason: ${[...byReason].map(([reason, n]) => `${reason} ${n}`).join(", ")}`)
