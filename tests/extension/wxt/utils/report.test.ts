import { describe, expect, test } from "bun:test"

import type { Rating } from "../../../../extension/wxt/utils/api"
import {
  buildReport,
  groupMisses,
  ORDER,
  summarize,
  WHY,
  type Miss,
  type PaintItem,
} from "../../../../extension/wxt/utils/report"

const rating = (over: Partial<Rating> = {}): Rating => ({
  found: true,
  imdbId: "tt1",
  imdbRating: 7.5,
  imdbVotes: 1000,
  metascore: null,
  poster: null,
  reason: null,
  rottenTomatoes: null,
  title: "X",
  type: "movie",
  year: 2025,
  ...over,
})

describe("buildReport", () => {
  test("counts a title once across its cards, files each miss by the API's reason, and skips what has no answer yet", () => {
    const items: PaintItem[] = [
      {
        key: "alpha|2025|movie|140",
        query: { runtime: 140, title: "Alpha", type: "movie", year: 2025 },
      },
      { key: "alpha|2025|movie|", query: { title: "Alpha", type: "movie", year: 2025 } },
      { key: "new|2026|movie|", query: { title: "Brand New Film", type: "movie", year: 2026 } },
      { key: "gone|2026|series|", query: { title: "Viral Hit", type: "series", year: 2026 } },
      { key: "old|2020|series|", query: { title: "Old API Miss", type: "series", year: 2020 } },
      { key: "wait|2026|series|", query: { title: "Still Loading", type: "series", year: 2026 } },
      { key: "fail|2026|series|", query: { title: "Failed Lookup", type: "series", year: 2026 } },
      { reason: "unstated", title: "Some Search Result" },
      { reason: "unstated", title: "Some Search Result" },
    ]
    const answers = new Map<string, Rating | null>([
      ["alpha|2025|movie|140", rating({ imdbRating: 3 })],
      ["alpha|2025|movie|", rating({ imdbRating: 3 })],
      ["new|2026|movie|", rating({ imdbRating: null, reason: "unrated" })],
      ["gone|2026|series|", rating({ found: false, imdbRating: null, reason: "unknown" })],
      // An answer from an older API carries no reason: a miss reads as unknown, a found title without a score as unrated.
      [
        "old|2020|series|",
        { ...rating({ found: false, imdbRating: null }), reason: undefined as unknown as null },
      ],
      ["fail|2026|series|", null],
    ])
    const report = buildReport(items, answers)
    expect(report.rated).toBe(1)
    expect(report.misses).toEqual([
      { reason: "unrated", title: "Brand New Film", year: 2026 },
      { reason: "unknown", title: "Viral Hit", year: 2026 },
      { reason: "unknown", title: "Old API Miss", year: 2020 },
      { reason: "unstated", title: "Some Search Result" },
    ])
    expect(summarize(report)).toBe("1 rated, 4 without a score")
  })

  test("a title rated under one card is not a miss under another", () => {
    const items: PaintItem[] = [
      { key: "a|2025|movie|", query: { title: "Alpha", type: "movie", year: 2025 } },
      {
        key: "a|2025|movie|140",
        query: { runtime: 140, title: "Alpha", type: "movie", year: 2025 },
      },
    ]
    const answers = new Map<string, Rating | null>([
      ["a|2025|movie|", rating({ found: false, imdbRating: null, reason: "ambiguous" })],
      ["a|2025|movie|140", rating({ imdbRating: 3 })],
    ])
    expect(buildReport(items, answers)).toEqual({ misses: [], rated: 1 })
  })
})

describe("groupMisses", () => {
  test("groups by reason in reading order, once each, with wording that follows a count", () => {
    const misses: Miss[] = [
      { reason: "ambiguous", title: "Alpha", year: 2025 },
      { reason: "unrated", title: "Brand New Film", year: 2026 },
      { reason: "unknown", title: "Viral Hit", year: 2026 },
      { reason: "ambiguous", title: "Alpha", year: 2025 },
      { reason: "unstated", title: "Some Search Result" },
      { reason: "unmatched", title: "Bleach", year: 2022 },
    ]
    expect(
      groupMisses(misses).map(
        (group) => `${group.titles.length} ${group.why}: ${group.titles.join(", ")}`,
      ),
    ).toEqual([
      "1 on IMDb but not rated yet: Brand New Film (2026)",
      "1 with several IMDb namesakes, so no guess: Alpha (2025)",
      "1 not in the IMDb index under this name: Viral Hit (2026)",
      "1 whose IMDb namesakes are other years, kinds, or lengths: Bleach (2022)",
      "1 with no year stated by Netflix: Some Search Result",
    ])
    expect(groupMisses([])).toEqual([])
    // Every reason has a line and a place in the order.
    expect(Object.keys(WHY).sort()).toEqual([...ORDER].sort())
  })
})
