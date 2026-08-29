import type { Rating, TitleQuery } from "@/utils/api"

// What a Netflix tab shows right now, phrased for the popup: how many titles on screen got a score, and the ones that did not, grouped by why. Pure, so the arithmetic and the wording are tested without a page.

export type Reason = NonNullable<Rating["reason"]>

// One title on screen as the tab saw it in its last paint: asked about (with its query key into the answers), or never asked because Netflix stated no year for it.
export type PaintItem = { key: string; query: TitleQuery } | { reason: "unstated"; title: string }

export type Miss = { reason: Reason; title: string; year?: number }

export type PageReport = { misses: Miss[]; rated: number }

// The wording after a count ("2 on IMDb but not rated yet"), and the order a reader should see the groups in: what time will fix, what the index cannot decide, what the index lacks, what Netflix withholds.
export const WHY: Record<Reason, string> = {
  ambiguous: "with several IMDb namesakes, so no guess",
  unknown: "not in the IMDb index under this name",
  unmatched: "whose IMDb namesakes are other years, kinds, or lengths",
  unrated: "on IMDb but not rated yet",
  unstated: "with no year stated by Netflix",
}
export const ORDER: Reason[] = ["unrated", "ambiguous", "unknown", "unmatched", "unstated"]

// A title's identity for counting: the same film as a standard card and as a ranked card is one title.
const identity = (title: string, year: number | undefined) =>
  `${title.trim().toLowerCase()}|${year ?? ""}`

// The report for a paint: an item whose answer has not arrived is left out; a found title with a score counts as rated; anything else is a miss with the API's reason, or the best reading of an answer from an older API.
export const buildReport = (
  items: PaintItem[],
  answers: Map<string, Rating | null>,
): PageReport => {
  const rated = new Set<string>()
  const seen = new Set<string>()
  const misses: Miss[] = []
  const miss = (reason: Reason, title: string, year: number | undefined) => {
    const id = identity(title, year)
    if (seen.has(id)) return
    seen.add(id)
    const entry: Miss = { reason, title }
    if (year !== undefined) entry.year = year
    misses.push(entry)
  }
  for (const item of items) {
    if ("reason" in item) {
      miss("unstated", item.title, undefined)
      continue
    }
    const rating = answers.get(item.key)
    if (rating === undefined || rating === null) continue
    const year = typeof item.query.year === "number" ? item.query.year : undefined
    if (rating.imdbRating !== null) rated.add(identity(item.query.title, year))
    else miss(rating.reason ?? (rating.found ? "unrated" : "unknown"), item.query.title, year)
  }
  return {
    misses: misses.filter((entry) => !rated.has(identity(entry.title, entry.year))),
    rated: rated.size,
  }
}

export type ReportGroup = { reason: Reason; titles: string[]; why: string }

// The misses grouped by reason in reading order, each group's titles once and in the order seen, empty groups left out.
export const groupMisses = (misses: Miss[]): ReportGroup[] =>
  ORDER.flatMap((reason) => {
    const titles = new Set<string>()
    for (const entry of misses) {
      if (entry.reason === reason)
        titles.add(entry.year ? `${entry.title} (${entry.year})` : entry.title)
    }
    return titles.size > 0 ? [{ reason, titles: [...titles], why: WHY[reason] }] : []
  })

// "78 rated, 9 without a score" for the popup's first line.
export const summarize = (report: PageReport): string =>
  `${report.rated} rated, ${report.misses.length} without a score`
