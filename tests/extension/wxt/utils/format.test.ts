import { describe, expect, test } from "bun:test"

import { compactCount, oneDecimal, relativeTime } from "../../../../extension/wxt/utils/format"

describe("format", () => {
  test("compactCount and oneDecimal read like a badge", () => {
    expect(compactCount(640123)).toBe("640.1K")
    expect(compactCount(20209)).toBe("20.2K")
    expect(compactCount(950)).toBe("950")
    expect(oneDecimal(8)).toBe("8.0")
    expect(oneDecimal(7.96)).toBe("8.0")
  })

  test("relativeTime is coarse and never in the future", () => {
    const now = Date.parse("2026-08-29T12:00:00.000Z")
    expect(relativeTime("2026-08-29T11:59:30.000Z", now)).toBe("just now")
    expect(relativeTime("2026-08-29T11:57:00.000Z", now)).toBe("3 minutes ago")
    expect(relativeTime("2026-08-29T09:30:00.000Z", now)).toBe("2 hours ago")
    expect(relativeTime("2026-08-27T13:00:00.000Z", now)).toBe("1 day ago")
    expect(relativeTime("2026-08-29T12:05:00.000Z", now)).toBe("just now")
  })
})
