// "640k" for a vote count, since the badge has room for a magnitude, not a number.
export const compactCount = (value: number): string =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1, notation: "compact" }).format(value)

// A one-decimal IMDb rating reads "8.0", not "8".
export const oneDecimal = (value: number): string => value.toFixed(1)
