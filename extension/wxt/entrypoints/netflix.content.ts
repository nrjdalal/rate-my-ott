import "@/assets/netflix.css"
import { browser } from "wxt/browser"
import { defineContentScript } from "wxt/utils/define-content-script"

import type { Rating, TitleQuery } from "@/utils/api"
import type { LookupReply, Message } from "@/utils/messages"
import {
  findCards,
  hasBadge,
  hasBillboardRating,
  STAMP,
  hasPanel,
  readBillboard,
  readCard,
  readModal,
  removeAll,
  renderBadge,
  renderBillboardRating,
  renderPanel,
} from "@/utils/netflix"
import { buildReport, type PaintItem } from "@/utils/report"
import { readSettings, settings, withDefaults, type Settings } from "@/utils/settings"

// How long to collect newly seen titles before asking for them in one batch, and how often to rescan regardless of mutations (Netflix swaps artwork and virtualizes rows without always mutating what the observer watches).
const FLUSH_MS = 250
const RESCAN_MS = 2000
const OBSERVE_MS = 100
// How long a lookup that failed (the API down, a batch refused) is left alone before the page asks again; every rescan would otherwise repeat the same failing request.
const FAILED_RETRY_MS = 30000

// The page's own bookkeeping key; results are matched to requests by position, so this only has to be stable within the page.
const keyOf = (query: TitleQuery) =>
  `${query.title.trim().toLowerCase()}|${query.year ?? ""}|${query.type ?? ""}|${query.runtime ?? ""}`

export default defineContentScript({
  matches: ["*://*.netflix.com/*"],
  runAt: "document_idle",
  async main(ctx) {
    let current: Settings = await readSettings()
    const answers = new Map<string, Rating | null>()
    // What the last paint saw on screen, for the popup's "why no score" list; asked for, never pushed, so the list is this tab's and current.
    let lastPaint: PaintItem[] = []
    const failedAt = new Map<string, number>()
    const inflight = new Set<string>()
    const pending = new Map<string, TitleQuery>()
    let flushTimer: number | null = null
    let scanTimer: number | null = null

    const ask = (query: TitleQuery): Rating | null | undefined => {
      const key = keyOf(query)
      if (answers.has(key)) return answers.get(key)
      const failed = failedAt.get(key)
      if (failed !== undefined && Date.now() - failed < FAILED_RETRY_MS) return undefined
      if (!inflight.has(key)) {
        inflight.add(key)
        pending.set(key, query)
        scheduleFlush()
      }
      return undefined
    }

    const paint = () => {
      const items: PaintItem[] = []
      if (!current.enabled) {
        lastPaint = []
        return
      }
      if (current.badges) {
        for (const card of findCards(document)) {
          const info = readCard(card)
          if (!info) continue
          // A card whose stamp no longer names it is being recycled for another title: its badge goes until the new stamp lands. A card is asked about only once the page has named its year: the API answers nothing without one, so a card the MAIN-world script never stamps (Netflix moved its internals) simply stays bare.
          if (info.pending || !info.year) {
            if (info.pending) renderBadge(card, null)
            else items.push({ reason: "unstated", title: info.title })
            continue
          }
          const query: TitleQuery = {
            title: info.title,
            ...(info.runtime ? { runtime: info.runtime } : {}),
            ...(info.type ? { type: info.type } : {}),
            year: info.year,
          }
          const rating = ask(query)
          const key = keyOf(query)
          items.push({ key, query })
          if (rating !== undefined && !hasBadge(card, key)) {
            renderBadge(card, rating, key, current.dimBelow)
          }
        }
      }
      const billboard = readBillboard(document)
      if (billboard && billboard.query.year) {
        const rating = ask(billboard.query)
        const key = keyOf(billboard.query)
        items.push({ key, query: billboard.query })
        if (rating !== undefined && !hasBillboardRating(billboard.anchor, key)) {
          renderBillboardRating(billboard.anchor, rating, key)
        }
      }
      const modal = readModal(document)
      if (modal && modal.query.year) {
        const rating = ask(modal.query)
        const key = keyOf(modal.query)
        items.push({ key, query: modal.query })
        if (rating !== undefined && !hasPanel(modal.anchor, key)) {
          renderPanel(modal.anchor, rating, key)
        }
      }
      lastPaint = items
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
      const now = Date.now()
      batch.forEach(([key], index) => {
        inflight.delete(key)
        // A failed lookup is not cached as a miss: it is asked again after a pause, so an outage or a refused batch neither sticks nor floods.
        const rating = reply.ratings[index]
        if (rating !== undefined && rating !== null) answers.set(key, rating)
        else if (!reply.error) answers.set(key, null)
        else if (reply.error !== "disabled") failedAt.set(key, now)
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

    // A settings change repaints from what is already known, and disabling clears the page.
    settings.watch((next) => {
      current = withDefaults(next)
      failedAt.clear()
      removeAll(document)
      paint()
    })

    // The popup asks this tab for its report; the answer is built from the last paint and the answers so far, so it is this tab's and current, and survives a background restart.
    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      if (message.type !== "page:latest") return false
      sendResponse(buildReport(lastPaint, answers))
      return false
    })

    const observer = new MutationObserver(scheduleScan)
    // Attribute changes too, so a stamp landing on a card repaints it without waiting for the next rescan.
    observer.observe(document.body, {
      attributeFilter: [STAMP],
      attributes: true,
      childList: true,
      subtree: true,
    })
    ctx.onInvalidated(() => observer.disconnect())
    ctx.setInterval(paint, RESCAN_MS)
    paint()
  },
})
