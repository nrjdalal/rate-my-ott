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
<a href="/browse?jbv=81616273" aria-label="Operation Safed Sagar: The Untold Story of the Kargil War" data-uia="standard-card" data-rmo-meta data-rmo-year="2026" data-rmo-type="series"><div><img alt="" class="standard-card tracked-card"></div></a>
<a href="/browse?jbv=82023350" aria-label="Alpha" data-uia="ranked-card"><div><svg></svg></div><div><img alt="" class="ranked-card tracked-card"></div></a>
<a href="/browse?jbv=81715790" aria-label="72 HOURS" data-uia="standard-card" data-rmo-meta data-rmo-year="2026" data-rmo-type="movie" data-rmo-runtime="105"><div><img alt="" class="standard-card tracked-card"></div></a>
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
    <div class="previewModal--detailsMetadata-right"><div class="previewModal--tags"><span class="previewModal--tags-label">Cast:</span><span class="tag-item"><a href="/browse/person/1">Someone</a></span></div></div>
  </div>
</div>
`

const rating = (overrides: Partial<Rating> = {}): Rating => ({
  found: true,
  imdbId: "tt2861424",
  imdbRating: 9.1,
  imdbVotes: 640123,
  title: "Rick and Morty",
  type: "series",
  year: 2013,
  ...overrides,
})

const page = (html: string, url = "https://www.netflix.com/browse") => {
  const window = new Window({ url })
  window.document.body.innerHTML = html
  return window.document as unknown as Document
}

describe("readCard", () => {
  test("reads the title from the anchor label and the identity from the href, for every card kind", () => {
    const [standard, ranked, film, progress, slider, gallery, empty] = findCards(page(CARDS))
    // A stamped card carries the page's year and kind; an unstamped card with a video id (jbv, /watch/, /title/) is pending; a bare label has nothing to wait for.
    expect(readCard(standard as Element)).toEqual({
      id: "81616273",
      pending: false,
      title: "Operation Safed Sagar: The Untold Story of the Kargil War",
      type: "series",
      year: 2026,
    })
    expect(readCard(ranked as Element)).toEqual({ id: "82023350", pending: true, title: "Alpha" })
    expect(readCard(film as Element)).toEqual({
      id: "81715790",
      pending: false,
      runtime: 105,
      title: "72 HOURS",
      type: "movie",
      year: 2026,
    })
    expect(readCard(progress as Element)).toEqual({
      id: "82760630",
      pending: true,
      title: "Chainsmoker Cat",
    })
    expect(readCard(slider as Element)).toEqual({
      id: "80100172",
      pending: true,
      title: "Rick and Morty",
    })
    expect(readCard(gallery as Element)).toEqual({ id: "81234567", pending: true, title: "Ikka" })
    slider?.setAttribute("data-rmo-meta", "")
    slider?.setAttribute("data-rmo-year", "2015")
    slider?.setAttribute("data-rmo-type", "series")
    expect(readCard(slider as Element)).toEqual({
      id: "80100172",
      pending: false,
      title: "Rick and Morty",
      type: "series",
      year: 2015,
    })
    expect(readCard(empty as Element)).toBeNull()
  })

  test("a ranked card hosts its badge on the artwork wrapper, not the rank numeral or the anchor", () => {
    const doc = page(CARDS)
    const ranked = findCards(doc)[1] as Element
    renderBadge(ranked, rating())
    const badge = doc.querySelector(".rmo-badge")
    expect(badge?.parentElement?.querySelector("img")?.classList.contains("ranked-card")).toBe(true)
    expect(badge?.parentElement?.classList.contains("rmo-host")).toBe(true)
  })
})

describe("renderBadge", () => {
  test("puts one badge on the artwork, replaces it on a rerender, and removes it for a miss", () => {
    const doc = page(CARDS)
    const card = findCards(doc)[4] as Element
    renderBadge(card, rating())
    renderBadge(card, rating())
    const badges = doc.querySelectorAll(".rmo-badge")
    expect(badges.length).toBe(1)
    expect(badges[0]?.parentElement?.classList.contains("boxart-container")).toBe(true)
    expect([...(badges[0]?.children ?? [])].map((s) => s.textContent)).toEqual(["9.1"])
    expect([...(badges[0]?.children ?? [])].map((s) => s.getAttribute("aria-label"))).toEqual([
      "IMDb 9.1",
    ])
    expect(badges[0]?.children[0]?.className).toBe("rmo-score rmo-score--imdb")
    expect(hasBadge(card)).toBe(true)

    renderBadge(card, rating({ found: false }))
    expect(hasBadge(card)).toBe(false)
  })

  test("rounds the score to one decimal and shows nothing for a title nobody has rated", () => {
    const doc = page(CARDS)
    const [card] = findCards(doc)
    renderBadge(card as Element, rating({ imdbRating: 7.96 }))
    expect(doc.querySelector(".rmo-badge")?.textContent).toBe("8.0")
    renderBadge(card as Element, rating({ imdbRating: null }))
    expect(doc.querySelector(".rmo-badge")).toBeNull()
  })
})

describe("readModal and renderPanel", () => {
  test("reads the title, year, and kind, and inserts the ratings row after the metadata", () => {
    const doc = page(MODAL)
    const modal = readModal(doc)
    expect(modal?.query).toEqual({ title: "Dune", type: "movie", year: 2021 })
    expect(modal?.anchor.className).toBe("previewModal--detailsMetadata-right")

    renderPanel(modal!.anchor, rating({ imdbId: "tt1160419", imdbRating: 8.0, imdbVotes: 900000 }))
    renderPanel(modal!.anchor, rating({ imdbId: "tt1160419", imdbRating: 8.0, imdbVotes: 900000 }))
    const panels = doc.querySelectorAll(".rmo-panel")
    expect(panels.length).toBe(1)
    expect(panels[0]?.className).toBe("previewModal--tags rmo-panel")
    expect(panels[0]?.parentElement?.className).toBe("previewModal--detailsMetadata-right")
    expect(panels[0]?.previousElementSibling?.textContent).toBe("Cast:Someone")
    expect(panels[0]?.querySelector(".previewModal--tags-label")?.textContent).toBe("IMDb:")
    const link = panels[0]?.querySelector(".tag-item a")
    expect(link?.getAttribute("href")).toBe("https://www.imdb.com/title/tt1160419/")
    expect(link?.textContent).toBe("8.0 with 900K votes")
    expect(panels[0]?.textContent).toBe("IMDb: 8.0 with 900K votes")
    expect(hasPanel(modal!.anchor)).toBe(true)
  })

  test("the modal's title comes from the card its jbv names, over the art's alt text", () => {
    const doc = page(CARDS + MODAL, "https://www.netflix.com/browse?jbv=82023350")
    expect(readModal(doc)?.query.title).toBe("Alpha")
  })

  test("the modal takes the year, kind, and length from the stamped card over its own metadata text", () => {
    const doc = page(CARDS + MODAL, "https://www.netflix.com/browse?jbv=81616273")
    expect(readModal(doc)?.query).toEqual({
      title: "Operation Safed Sagar: The Untold Story of the Kargil War",
      type: "series",
      year: 2026,
    })
    const film = page(CARDS + MODAL, "https://www.netflix.com/browse?jbv=81715790")
    expect(readModal(film)?.query).toEqual({
      runtime: 105,
      title: "72 HOURS",
      type: "movie",
      year: 2026,
    })
  })

  test("a series modal is typed by its season count, a limited series too, and a miss or an unrated title gets no row", () => {
    expect(readModal(page(MODAL.replace("2h 35m", "Limited Series")))?.query.type).toBe("series")
    const doc = page(MODAL.replace("2h 35m", "3 Seasons"))
    const modal = readModal(doc)
    expect(modal?.query.type).toBe("series")
    renderPanel(modal!.anchor, rating())
    expect(hasPanel(modal!.anchor)).toBe(true)
    renderPanel(modal!.anchor, rating({ found: false }))
    expect(doc.querySelector(".rmo-panel")).toBeNull()
    renderPanel(modal!.anchor, rating({ imdbRating: null, imdbVotes: null }))
    expect(doc.querySelector(".rmo-panel")).toBeNull()
    expect(hasPanel(modal!.anchor)).toBe(false)
  })

  test("removeAll clears every badge and panel", () => {
    const doc = page(CARDS + MODAL)
    renderBadge(findCards(doc)[0] as Element, rating())
    renderPanel(readModal(doc)!.anchor, rating())
    removeAll(doc)
    expect(doc.querySelectorAll(".rmo-badge, .rmo-panel").length).toBe(0)
  })

  test("a page without a modal reads as none", () => {
    expect(readModal(page(CARDS))).toBeNull()
  })
})
