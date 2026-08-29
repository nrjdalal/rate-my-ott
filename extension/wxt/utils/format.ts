// "640k" for a vote count, since the badge has room for a magnitude, not a number.
export const compactCount = (value: number): string =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1, notation: "compact" }).format(value)

// A one-decimal IMDb rating reads "8.0", not "8".
export const oneDecimal = (value: number): string => value.toFixed(1)

// "2 hours ago" for a timestamp, coarse on purpose: the popup says how fresh the index is, not when the job ran.
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
