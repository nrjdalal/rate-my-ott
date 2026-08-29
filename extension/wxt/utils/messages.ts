import type { IndexStatus, Rating, TitleQuery } from "@/utils/api"
import type { PageReport } from "@/utils/report"

// What the content script and the options page ask the background, which is the only context that talks to the API.
// A Netflix tab reports what it asked about after every paint (page:report, one way), and the popup asks the background for the newest report (page:latest).
export type Message =
  | { type: "api:health" }
  | { type: "api:index" }
  | { report: PageReport; type: "page:report" }
  | { type: "page:latest" }
  | { titles: TitleQuery[]; type: "ratings:lookup" }

// One answer per title asked, in the order asked (null when the API had none or the request failed); `error` names the failure so the page can tell a miss from an outage.
export type LookupReply = { error: string | null; ratings: (Rating | null)[] }

export type HealthReply = { error: string | null; version: string | null }

// What the index holds and when it was rebuilt, null while it has never been built; `error` names an unreachable API.
export type IndexReply = { error: string | null; index: IndexStatus | null }

// The newest tab report the background holds, null before any Netflix tab has painted.
export type LatestReply = { report: PageReport | null }
