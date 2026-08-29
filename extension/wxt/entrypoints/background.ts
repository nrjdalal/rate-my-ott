import { browser } from "wxt/browser"
import { defineBackground } from "wxt/utils/define-background"
import { storage } from "wxt/utils/storage"

import { createApiClient, unwrap, type Rating, type TitleQuery } from "@/utils/api"
import type { HealthReply, IndexReply, LatestReply, LookupReply, Message } from "@/utils/messages"
import type { PageReport } from "@/utils/report"
import { readSettings } from "@/utils/settings"

// The only context that talks to the API: it holds the host permission that lets a cross-origin call skip CORS, and one place to batch and cache keeps every Netflix tab from asking twice.

// What the API answers, remembered for the browser session (session storage survives service-worker restarts and clears when the browser closes, so it cannot grow across sessions); the API itself answers from its index every time. A miss is remembered briefly: the index is rebuilt nightly and a title can appear in it, and a lookup is cheap now that no quota stands behind it.
const FOUND_TTL_MS = 12 * 60 * 60 * 1000
const MISS_TTL_MS = 10 * 60 * 1000
const BATCH = 50

type Cached = { at: number; rating: Rating }

// A local key for the session cache only; results are matched to requests by position, so this need not reproduce the API's normalization, but everything that changes an answer (the runtime too) is part of it.
const cacheKey = (query: TitleQuery): `session:${string}` =>
  `session:rating:${query.title.trim().toLowerCase()}|${query.year ?? ""}|${query.type ?? ""}|${query.runtime ?? ""}`

async function lookup(titles: TitleQuery[]): Promise<LookupReply> {
  const current = await readSettings()
  if (!current.enabled) return { error: "disabled", ratings: titles.map(() => null) }
  const keys = titles.map(cacheKey)
  const now = Date.now()
  const cached = (await storage.getItems(keys)) as { key: string; value: Cached | null }[]
  const ratings: (Rating | null)[] = cached.map(({ value }) =>
    value && now - value.at < (value.rating.found ? FOUND_TTL_MS : MISS_TTL_MS)
      ? value.rating
      : null,
  )
  const missing = titles
    .map((title, index) => ({ index, title }))
    .filter(({ index }) => ratings[index] === null)
  if (missing.length === 0) return { error: null, ratings }

  const api = createApiClient(current.apiUrl)
  for (let at = 0; at < missing.length; at += BATCH) {
    const slice = missing.slice(at, at + BATCH)
    const { data, error } = await unwrap(
      api.v1.ratings.$post({ json: { titles: slice.map((entry) => entry.title) } }),
    )
    // A failed request leaves its titles null and stops: the next chunk would fail the same way, and the page retries on its own rescan.
    if (error) return { error: error.message, ratings }
    const fresh = slice.map((entry, offset) => {
      const rating = data.ratings[offset] as Rating
      ratings[entry.index] = rating
      return { key: keys[entry.index] as `session:${string}`, value: { at: now, rating } }
    })
    await storage.setItems(fresh)
  }
  return { error: null, ratings }
}

async function health(): Promise<HealthReply> {
  const current = await readSettings()
  const { data, error } = await unwrap(createApiClient(current.apiUrl).health.$get())
  return error ? { error: error.message, version: null } : { error: null, version: data.version }
}

async function indexStatus(): Promise<IndexReply> {
  const current = await readSettings()
  const { data, error } = await unwrap(createApiClient(current.apiUrl).v1.ratings.status.$get())
  return error ? { error: error.message, index: null } : { error: null, index: data.index }
}

// The newest report from any Netflix tab, in memory only: the popup shows it, and a service worker restart merely forgets it until the next paint.
let latest: PageReport | null = null

const handle = (
  message: Message,
): Promise<HealthReply | IndexReply | LatestReply | LookupReply> => {
  switch (message.type) {
    case "api:health":
      return health()
    case "api:index":
      return indexStatus()
    case "page:report":
      latest = message.report
      return Promise.resolve({ report: latest })
    case "page:latest":
      return Promise.resolve({ report: latest })
    default:
      return lookup(message.titles)
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    handle(message).then(sendResponse, (error: unknown) =>
      sendResponse({ error: error instanceof Error ? error.message : String(error), ratings: [] }),
    )
    // Keeps the channel open for the async reply.
    return true
  })
})
