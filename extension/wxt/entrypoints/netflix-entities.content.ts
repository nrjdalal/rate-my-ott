import { defineContentScript } from "wxt/utils/define-content-script"

import { BILLBOARD_SELECTOR, CARD_SELECTOR, MODAL_SELECTOR, STAMP } from "@/utils/netflix"
import { linkedId, readBillboard, readEntity, type Entity } from "@/utils/netflix-props"

// Runs in the page's own JS world (world: "MAIN"), where React's fiber properties are visible, and does one thing: stamp each card anchor with the year and kind Netflix fetched for it, as data attributes the isolated-world scanner (netflix.content.ts) reads. No extension API exists in this world, so the attributes are the whole interface, and nothing here touches the network or storage.

const RESCAN_MS = 2000
const OBSERVE_MS = 100

export default defineContentScript({
  matches: ["*://*.netflix.com/*"],
  runAt: "document_idle",
  world: "MAIN",
  main() {
    let timer: number | null = null

    // Every card is stamped once (STAMP marks it done, year and type only when the fiber names them), so a card React re-renders is stamped again only if it is a new node.
    // A stamp is kept only while it still names the element's title: React recycles a card for another title and a route change reuses the billboard, so a card is read again when its link or label no longer matches its stamp, and a modal or the billboard (one or two nodes) is read every scan.
    const current = (node: Element) => {
      if (!node.hasAttribute(STAMP)) return false
      const id = linkedId(node)
      if (id !== undefined) return node.getAttribute("data-rmo-id") === String(id)
      const label = node.getAttribute("aria-label")
      return label === null || node.getAttribute("data-rmo-title") === label
    }

    const stamp = () => {
      for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        if (current(card)) continue
        const entity = readEntity(card)
        if (!entity) continue
        mark(card, entity)
      }
      // A modal (the hover preview, the detail view) names its title only as artwork too; its props carry the title.
      for (const modal of document.querySelectorAll(MODAL_SELECTOR)) {
        const entity = readEntity(modal)
        if (!entity || modal.getAttribute("data-rmo-id") === String(entity.videoId)) continue
        mark(modal, entity)
      }
      // The billboard names its title only as artwork, so the stamp carries the title too.
      for (const section of document.querySelectorAll(BILLBOARD_SELECTOR)) {
        const entity = readBillboard(section)
        if (!entity || section.getAttribute("data-rmo-id") === String(entity.videoId)) continue
        mark(section, entity)
      }
    }

    // Every field is written or removed, so a re-stamp never keeps a previous title's year.
    const mark = (node: Element, entity: Entity) => {
      node.setAttribute(STAMP, "")
      node.setAttribute("data-rmo-id", String(entity.videoId))
      node.setAttribute("data-rmo-title", entity.title)
      node.toggleAttribute("data-rmo-year", false)
      node.toggleAttribute("data-rmo-type", false)
      node.toggleAttribute("data-rmo-runtime", false)
      if (entity.year) node.setAttribute("data-rmo-year", String(entity.year))
      if (entity.type) node.setAttribute("data-rmo-type", entity.type)
      if (entity.runtime) node.setAttribute("data-rmo-runtime", String(entity.runtime))
    }

    const schedule = () => {
      if (timer === null) {
        timer = window.setTimeout(() => {
          timer = null
          stamp()
        }, OBSERVE_MS)
      }
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
    window.setInterval(stamp, RESCAN_MS)
    stamp()
  },
})
