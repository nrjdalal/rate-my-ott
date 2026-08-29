import { describe, expect, test } from "bun:test"

import { describeIndex, relativeTime } from "../../../../../web/next/src/lib/index-stat"

describe("describeIndex", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z")

  test("phrases the record with a grouped count and a coarse age", () => {
    expect(describeIndex({ finishedAt: "2026-08-29T09:30:00.000Z", titles: 619222 }, now)).toBe(
      "Indexing 619,222 IMDb titles, refreshed 2 hours ago.",
    )
    expect(describeIndex({ finishedAt: "2026-08-29T11:59:40.000Z", titles: 14 }, now)).toBe(
      "Indexing 14 IMDb titles, refreshed just now.",
    )
    expect(describeIndex(null, now)).toBeNull()
  })

  test("relativeTime never says the future", () => {
    expect(relativeTime("2026-08-29T12:05:00.000Z", now)).toBe("just now")
    expect(relativeTime("2026-08-27T13:00:00.000Z", now)).toBe("1 day ago")
  })
})
