import { describe, expect, test } from "bun:test"

import { groupMisses, summarize, type Miss } from "../../../../extension/wxt/utils/report"

describe("the tab report", () => {
  const misses: Miss[] = [
    { reason: "ambiguous", title: "Alpha", year: 2025 },
    { reason: "unrated", title: "Brand New Film", year: 2026 },
    { reason: "unknown", title: "Viral Hit", year: 2026 },
    { reason: "ambiguous", title: "Alpha", year: 2025 },
    { reason: "unstated", title: "Some Search Result" },
    { reason: "unmatched", title: "Bleach", year: 2022 },
  ]

  test("groups the misses by reason in reading order, once each, and counts them", () => {
    expect(
      groupMisses(misses).map((group) => `${group.reason}: ${group.titles.join(", ")}`),
    ).toEqual([
      "unrated: Brand New Film (2026)",
      "ambiguous: Alpha (2025)",
      "unknown: Viral Hit (2026)",
      "unmatched: Bleach (2022)",
      "unstated: Some Search Result",
    ])
    expect(groupMisses(misses).every((group) => group.why.length > 0)).toBe(true)
    expect(groupMisses([])).toEqual([])
    expect(summarize({ misses, rated: 78 })).toBe("78 rated, 5 without a score")
  })
})
