import type { IndexStatus, Rating, TitleQuery } from "@/utils/api"

// What the content script and the options page ask the background, which is the only context that talks to the API.
export type Message =
  | { type: "api:health" }
  | { type: "api:index" }
  | { titles: TitleQuery[]; type: "ratings:lookup" }

// One answer per title asked, in the order asked (null when the API had none or the request failed); `error` names the failure so the page can tell a miss from an outage.
export type LookupReply = { error: string | null; ratings: (Rating | null)[] }

export type HealthReply = { error: string | null; version: string | null }

// What the index holds and when it was rebuilt, null while it has never been built; `error` names an unreachable API.
export type IndexReply = { error: string | null; index: IndexStatus | null }
