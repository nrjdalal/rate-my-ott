import type { TitleQuery } from "./omdb"

// How long a cached answer is trusted. A hit changes slowly (votes drift, a rating barely moves), a miss deserves another look sooner, since the provider may have added the title or a card title may have been matched wrongly.
export const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MISSING_TTL_MS = 24 * 60 * 60 * 1000

// One string per distinct lookup, so a batch dedupes on it and the cache is keyed by it. Casing and spacing are noise; the year and type are part of the identity because a remake shares the title.
export const normalizeTitle = (value: string) =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

// The spellings to try when the provider does not know a title as the platform writes it: as given, then without a parenthetical qualifier ("The Office (U.S.)"), then without a subtitle after a colon ("Grand Theft Auto VI: An Extended Look"). Each distinct variant is tried once, so a miss costs at most three provider calls, and only until the day-long miss cache covers it.
export const titleVariants = (title: string): string[] => {
  const variants: string[] = []
  const add = (value: string) => {
    const spelled = value.replace(/\s+/g, " ").trim()
    if (spelled && !variants.includes(spelled)) variants.push(spelled)
  }
  add(title)
  const unqualified = title.replace(/\s*\([^)]*\)/g, "")
  add(unqualified)
  add(unqualified.split(":")[0] as string)
  return variants
}

export const ratingKey = (query: TitleQuery) =>
  `${normalizeTitle(query.title)}|${query.year ?? ""}|${query.type ?? ""}`

export const isStale = (row: { fetchedAt: Date; found: boolean }, now = Date.now()) =>
  now - row.fetchedAt.getTime() > (row.found ? FOUND_TTL_MS : MISSING_TTL_MS)

// The distinct queries of a batch in the order first asked, each with its key; the answer is later spread back over the original order with alignTo.
export const uniqueQueries = (queries: TitleQuery[]) => {
  const seen = new Map<string, TitleQuery>()
  for (const query of queries) {
    const key = ratingKey(query)
    if (!seen.has(key)) seen.set(key, query)
  }
  return [...seen.entries()].map(([key, query]) => ({ key, query }))
}

// One answer per request item, in request order, duplicates repeated, so a client maps results positionally and never has to reproduce the key normalization.
export const alignTo = <T>(queries: TitleQuery[], byKey: Map<string, T>): T[] =>
  queries.map((query) => {
    const row = byKey.get(ratingKey(query))
    if (!row) throw new Error(`no answer for "${query.title}"`)
    return row
  })

// Run fn over items with at most `limit` in flight, keeping result order; a batch of fifty fresh titles must not open fifty provider connections at once.
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
