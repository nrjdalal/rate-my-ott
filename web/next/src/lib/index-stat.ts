// The landing page's one live number, phrased from the API's index record: how many IMDb titles are indexed and how fresh they are. Pure, so the phrasing is tested without a page.
export type IndexRecord = { finishedAt: string; titles: number }

export const relativeTime = (iso: string, now = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (seconds < 60) return "just now"
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ]
  for (const [size, unit] of units) {
    if (seconds >= size) {
      return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
        -Math.floor(seconds / size),
        unit,
      )
    }
  }
  return "just now"
}

export const describeIndex = (record: IndexRecord | null, now = Date.now()): string | null =>
  record
    ? `Indexing ${new Intl.NumberFormat("en").format(record.titles)} IMDb titles, refreshed ${relativeTime(record.finishedAt, now)}.`
    : null
