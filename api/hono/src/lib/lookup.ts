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

// How far a provider's answer may sit from what the platform stated and still be the same title: a release year differs by region and a festival premiere lands a year early; a runtime differs by a cut or a credits roll, not by much more.
export const YEAR_TOLERANCE = 1
export const RUNTIME_TOLERANCE_MIN = 5

// Whether a provider answer is the title the platform showed (the name already matches): the year within tolerance, and, for a film whose length the platform states, the runtime within tolerance. An answer failing either is a same-name stranger, and no answer beats a wrong one. A field the provider has no record of cannot be checked and does not disqualify.
export const matchesQuery = (
  found: { runtime: number | null; year: number | null },
  query: { runtime?: number; year?: number },
): boolean => {
  if (query.year && found.year !== null && Math.abs(found.year - query.year) > YEAR_TOLERANCE) {
    return false
  }
  if (
    query.runtime &&
    found.runtime !== null &&
    Math.abs(found.runtime - query.runtime) > RUNTIME_TOLERANCE_MIN
  ) {
    return false
  }
  return true
}

// Among the same-name candidates a search returned (with their details), the one the platform meant: of those that fit, the closest runtime when the platform stated one, else the exact year, else the first.
export const pickCandidate = <T extends { runtime: number | null; year: number | null }>(
  details: T[],
  query: { runtime?: number; year?: number },
): T | null => {
  const fitting = details.filter((detail) => matchesQuery(detail, query))
  if (fitting.length === 0) return null
  const runtime = query.runtime
  if (runtime) {
    const measured = fitting
      .filter((detail) => detail.runtime !== null)
      .sort(
        (a, b) =>
          Math.abs((a.runtime as number) - runtime) - Math.abs((b.runtime as number) - runtime),
      )
    if (measured[0]) return measured[0]
  }
  return fitting.find((detail) => detail.year === query.year) ?? (fitting[0] as T)
}

// The years a search covers for a platform's stated year: its own first, then the year before (a premiere), then the year after (a late regional release).
export const yearsAround = (year: number): number[] => [year, year - 1, year + 1]

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
