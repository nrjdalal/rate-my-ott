import { defineContentScript } from "wxt/utils/define-content-script"

import { CARD_SELECTOR, STAMP } from "@/utils/netflix"
import { readEntity } from "@/utils/netflix-props"

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
    const stamp = () => {
      for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        if (card.hasAttribute(STAMP)) continue
        const entity = readEntity(card)
        if (!entity) continue
        card.setAttribute(STAMP, "")
        if (entity.year) card.setAttribute("data-rmo-year", String(entity.year))
        if (entity.type) card.setAttribute("data-rmo-type", entity.type)
        if (entity.runtime) card.setAttribute("data-rmo-runtime", String(entity.runtime))
      }
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
