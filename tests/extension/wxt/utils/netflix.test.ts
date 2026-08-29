import { describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

import type { Rating } from "../../../../extension/wxt/utils/api"
import {
  findCards,
  hasBadge,
  hasPanel,
  readCard,
  readModal,
  removeAll,
  renderBadge,
  renderPanel,
} from "../../../../extension/wxt/utils/netflix"

// The current cards (a row card, a Top 10 card with its rank numeral, a Continue Watching card), the legacy slider and gallery cards, and a card with no title to skip.
const CARDS = `
<a href="/browse?jbv=81616273" aria-label="Operation Safed Sagar: The Untold Story of the Kargil War" data-uia="standard-card"><div><img alt="" class="standard-card tracked-card"></div></a>
<a href="/browse?jbv=82023350" aria-label="Alpha" data-uia="ranked-card"><div><svg></svg></div><div><img alt="" class="ranked-card tracked-card"></div></a>
<a href="/browse?jbv=82760630" aria-label="Chainsmoker Cat" data-uia="progress-card"><div><img alt="" class="continue-watching-card tracked-card"></div></a>
<div class="slider-item"><div class="title-card-container"><div id="title-card-0-0" class="title-card">
  <a href="/watch/80100172?tctx=1" aria-label="Rick and Morty" class="slider-refocus">
    <div class="boxart-size-16x9 boxart-container"><img class="boxart-image" alt="">
      <div class="fallback-text-container"><p class="fallback-text">Rick and Morty</p></div></div>
  </a>
</div></div></div>
<div class="title-card">
  <a href="/title/81234567"><div class="boxart-container"><p class="fallback-text">Ikka</p></div></a>
</div>
<div class="title-card"><a href="/watch/1"><div class="boxart-container"></div></a></div>
`

const MODAL = `
<div class="previewModal--container detail-modal" data-uia="modal-motion-container-DETAIL_MODAL">
  <img class="previewModal--boxart" alt="Dune">
  <img class="previewModal--player-titleTreatment-logo">
  <div class="previewModal--detailsMetadata-left">
    <div data-uia="videoMetadata--container" class="videoMetadata--container"><div class="year">2021</div><span class="duration">2h 35m</span></div>
  </div>
</div>
`

const rating = (overrides: Partial<Rating> = {}): Rating => ({
  fetchedAt: "2026-08-29T10:00:00.000Z",
  found: true,
  imdbId: "tt2861424",
  imdbRating: 9.1,
  imdbVotes: 640123,
  key: "rick and morty||",
  metascore: null,
  poster: null,
  rottenTomatoes: 94,
  title: "Rick and Morty",
  type: "series",
  year: 2013,
  ...overrides,
})

const options = { showMetascore: true, showRottenTomatoes: true }

const page = (html: string, url = "https://www.netflix.com/browse") => {
  const window = new Window({ url })
  window.document.body.innerHTML = html
  return window.document as unknown as Document
}

describe("readCard", () => {
  test("reads the title from the anchor label and the identity from the href, for every card kind", () => {
    const [standard, ranked, progress, slider, gallery, empty] = findCards(page(CARDS))
    expect(readCard(standard as Element)).toEqual({
      id: "81616273",
      title: "Operation Safed Sagar: The Untold Story of the Kargil War",
    })
    expect(readCard(ranked as Element)).toEqual({ id: "82023350", title: "Alpha" })
    expect(readCard(progress as Element)).toEqual({ id: "82760630", title: "Chainsmoker Cat" })
    expect(readCard(slider as Element)).toEqual({ id: "80100172", title: "Rick and Morty" })
    expect(readCard(gallery as Element)).toEqual({ id: "81234567", title: "Ikka" })
    expect(readCard(empty as Element)).toBeNull()
  })

  test("a ranked card hosts its badge on the artwork wrapper, not the rank numeral or the anchor", () => {
    const doc = page(CARDS)
    const ranked = findCards(doc)[1] as Element
    renderBadge(ranked, rating(), options)
    const badge = doc.querySelector(".rmo-badge")
    expect(badge?.parentElement?.querySelector("img")?.classList.contains("ranked-card")).toBe(true)
    expect(badge?.parentElement?.classList.contains("rmo-host")).toBe(true)
  })
})

describe("renderBadge", () => {
  test("puts one badge on the artwork, replaces it on a rerender, and removes it for a miss", () => {
    const doc = page(CARDS)
    const card = findCards(doc)[3] as Element
    renderBadge(card, rating(), options)
    renderBadge(card, rating(), options)
    const badges = doc.querySelectorAll(".rmo-badge")
    expect(badges.length).toBe(1)
    expect(badges[0]?.parentElement?.classList.contains("boxart-container")).toBe(true)
    expect(badges[0]?.textContent).toBe("IMDb9.1RT94%")
    expect(hasBadge(card)).toBe(true)

    renderBadge(card, rating({ found: false }), options)
    expect(hasBadge(card)).toBe(false)
  })

  test("respects the display options and shows nothing for a title without scores", () => {
    const doc = page(CARDS)
    const [card] = findCards(doc)
    renderBadge(card as Element, rating({ metascore: 85 }), {
      showMetascore: false,
      showRottenTomatoes: false,
    })
    expect(doc.querySelector(".rmo-badge")?.textContent).toBe("IMDb9.1")
    renderBadge(
      card as Element,
      rating({ imdbRating: null, metascore: null, rottenTomatoes: null }),
      options,
    )
    expect(doc.querySelector(".rmo-badge")).toBeNull()
  })
})

describe("readModal and renderPanel", () => {
  test("reads the title, year, and kind, and inserts the ratings row after the metadata", () => {
    const doc = page(MODAL)
    const modal = readModal(doc)
    expect(modal?.query).toEqual({ title: "Dune", type: "movie", year: 2021 })
    expect(modal?.anchor.getAttribute("data-uia")).toBe("videoMetadata--container")

    renderPanel(
      modal!.anchor,
      rating({ imdbId: "tt1160419", imdbRating: 8.0, imdbVotes: 900000 }),
      options,
    )
    renderPanel(
      modal!.anchor,
      rating({ imdbId: "tt1160419", imdbRating: 8.0, imdbVotes: 900000 }),
      options,
    )
    const panels = doc.querySelectorAll(".rmo-panel")
    expect(panels.length).toBe(1)
    expect(panels[0]?.previousElementSibling?.classList.contains("videoMetadata--container")).toBe(
      true,
    )
    const link = panels[0]?.querySelector("a")
    expect(link?.getAttribute("href")).toBe("https://www.imdb.com/title/tt1160419/")
    expect(link?.textContent).toBe("IMDb 8.0900K votes")
    expect(hasPanel(modal!.anchor)).toBe(true)
  })

  test("the modal's title comes from the card its jbv names, over the art's alt text", () => {
    const doc = page(CARDS + MODAL, "https://www.netflix.com/browse?jbv=82023350")
    expect(readModal(doc)?.query.title).toBe("Alpha")
  })

  test("a series modal is typed by its season count, a limited series too, and a miss gets a muted pill", () => {
    expect(readModal(page(MODAL.replace("2h 35m", "Limited Series")))?.query.type).toBe("series")
    const doc = page(MODAL.replace("2h 35m", "3 Seasons"))
    const modal = readModal(doc)
    expect(modal?.query.type).toBe("series")
    renderPanel(modal!.anchor, rating({ found: false }), options)
    expect(doc.querySelector(".rmo-pill--muted")?.textContent).toBe("No ratings found")
  })

  test("removeAll clears every badge and panel", () => {
    const doc = page(CARDS + MODAL)
    renderBadge(findCards(doc)[0] as Element, rating(), options)
    renderPanel(readModal(doc)!.anchor, rating(), options)
    removeAll(doc)
    expect(doc.querySelectorAll(".rmo-badge, .rmo-panel").length).toBe(0)
  })

  test("a page without a modal reads as none", () => {
    expect(readModal(page(CARDS))).toBeNull()
  })
})
