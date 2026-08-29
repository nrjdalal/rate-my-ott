// What a Netflix tab knows about the titles it asked about, phrased for the popup: how many got a score, and the ones that did not, grouped by why. Pure, so the wording is tested without a page.

export type MissReason = "ambiguous" | "unknown" | "unmatched" | "unrated" | "unstated"

export type Miss = { reason: MissReason; title: string; year?: number }

export type PageReport = { misses: Miss[]; rated: number }

// One line per reason, in the order a reader should see them: the ones the index could fix first, then the ones it cannot.
export const REASONS: { reason: MissReason; why: string }[] = [
  { reason: "unrated", why: "on IMDb, not rated yet" },
  { reason: "ambiguous", why: "several IMDb titles share the name and year; no guess" },
  { reason: "unknown", why: "not on IMDb under this name" },
  { reason: "unmatched", why: "IMDb's namesakes are other years or kinds" },
  { reason: "unstated", why: "Netflix states no year for it" },
]

export type ReportGroup = { reason: MissReason; titles: string[]; why: string }

// The misses grouped by reason, each group's titles deduplicated and in the order seen, empty groups left out.
export const groupMisses = (misses: Miss[]): ReportGroup[] =>
  REASONS.flatMap(({ reason, why }) => {
    const titles: string[] = []
    for (const miss of misses) {
      const label = miss.year ? `${miss.title} (${miss.year})` : miss.title
      if (miss.reason === reason && !titles.includes(label)) titles.push(label)
    }
    return titles.length > 0 ? [{ reason, titles, why }] : []
  })

// "78 rated, 9 without a score" for the popup's first line.
export const summarize = (report: PageReport): string => {
  const missing = new Set(report.misses.map((miss) => `${miss.title}|${miss.year ?? ""}`)).size
  return `${report.rated} rated, ${missing} without a score`
}
