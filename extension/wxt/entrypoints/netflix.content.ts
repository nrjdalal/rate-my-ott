import "@/assets/netflix.css"
import { browser } from "wxt/browser"
import { defineContentScript } from "wxt/utils/define-content-script"

import type { Rating, TitleQuery } from "@/utils/api"
import type { LookupReply, Message } from "@/utils/messages"
import {
  findCards,
  hasBadge,
  hasPanel,
  readCard,
  readModal,
  removeAll,
  renderBadge,
  renderPanel,
} from "@/utils/netflix"
import { DEFAULT_SETTINGS, settings, type Settings } from "@/utils/settings"

// How long to collect newly seen titles before asking for them in one batch, and how often to rescan regardless of mutations (Netflix swaps artwork and virtualizes rows without always mutating what the observer watches).
const FLUSH_MS = 250
const RESCAN_MS = 2000
const OBSERVE_MS = 100

// The page's own bookkeeping key; results are matched to requests by position, so this only has to be stable within the page.
const keyOf = (query: TitleQuery) =>
  `${query.title.trim().toLowerCase()}|${query.year ?? ""}|${query.type ?? ""}`

export default defineContentScript({
  matches: ["*://*.netflix.com/*"],
  runAt: "document_idle",
  async main(ctx) {
    let current: Settings = await settings.getValue()
    const answers = new Map<string, Rating | null>()
    const inflight = new Set<string>()
    const pending = new Map<string, TitleQuery>()
    let flushTimer: number | null = null
    let scanTimer: number | null = null

    const ask = (query: TitleQuery): Rating | null | undefined => {
      const key = keyOf(query)
      if (answers.has(key)) return answers.get(key)
      if (!inflight.has(key)) {
        inflight.add(key)
        pending.set(key, query)
        scheduleFlush()
      }
      return undefined
    }

    const paint = () => {
      if (!current.enabled) return
      if (current.badges) {
        for (const card of findCards(document)) {
          const info = readCard(card)
          if (!info) continue
          const rating = ask({ title: info.title })
          if (rating !== undefined && !hasBadge(card)) renderBadge(card, rating, current)
        }
      }
      const modal = readModal(document)
      if (modal) {
        const rating = ask(modal.query)
        if (rating !== undefined && !hasPanel(modal.anchor))
          renderPanel(modal.anchor, rating, current)
      }
    }

    const flush = async () => {
      flushTimer = null
      const batch = [...pending.entries()]
      pending.clear()
      if (batch.length === 0) return
      const message: Message = { titles: batch.map(([, query]) => query), type: "ratings:lookup" }
      let reply: LookupReply
      try {
        reply = (await browser.runtime.sendMessage(message)) as LookupReply
      } catch (error) {
        reply = { error: error instanceof Error ? error.message : String(error), ratings: [] }
      }
      batch.forEach(([key], index) => {
        inflight.delete(key)
        // A failed lookup is forgotten rather than cached as a miss, so the next rescan asks again.
        const rating = reply.ratings[index]
        if (rating !== undefined && rating !== null) answers.set(key, rating)
        else if (!reply.error) answers.set(key, null)
      })
      if (reply.error && reply.error !== "disabled") console.warn("[rate-my-ott]", reply.error)
      paint()
    }

    function scheduleFlush() {
      if (flushTimer === null) flushTimer = ctx.setTimeout(flush, FLUSH_MS)
    }

    const scheduleScan = () => {
      if (scanTimer === null) {
        scanTimer = ctx.setTimeout(() => {
          scanTimer = null
          paint()
        }, OBSERVE_MS)
      }
    }

    // A settings change repaints from what is already known: the display options are read at render time, and disabling clears the page.
    settings.watch((next) => {
      current = next ?? DEFAULT_SETTINGS
      removeAll(document)
      paint()
    })

    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, { childList: true, subtree: true })
    ctx.onInvalidated(() => observer.disconnect())
    ctx.setInterval(paint, RESCAN_MS)
    paint()
  },
})
