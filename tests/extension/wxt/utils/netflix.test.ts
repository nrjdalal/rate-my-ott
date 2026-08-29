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

// A slider card and a My List gallery card as Netflix renders them, plus a card with no title to skip.
const CARDS = `
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
<div class="previewModal--container detail-modal">
  <img class="previewModal--player-titleTreatment-logo" alt="Dune">
  <div class="previewModal--detailsMetadata-left">
    <div class="videoMetadata--container"><span class="year">2021</span><span class="duration">2h 35m</span></div>
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

const page = (html: string) => {
  const window = new Window()
  window.document.body.innerHTML = html
  return window.document as unknown as Document
}

describe("readCard", () => {
  test("reads the title from the anchor label and the identity from the href", () => {
    const [slider, gallery, empty] = findCards(page(CARDS))
    expect(readCard(slider as Element)).toEqual({ id: "80100172", title: "Rick and Morty" })
    expect(readCard(gallery as Element)).toEqual({ id: "81234567", title: "Ikka" })
    expect(readCard(empty as Element)).toBeNull()
  })
})

describe("renderBadge", () => {
  test("puts one badge on the artwork, replaces it on a rerender, and removes it for a miss", () => {
    const doc = page(CARDS)
    const [card] = findCards(doc)
    renderBadge(card as Element, rating(), options)
    renderBadge(card as Element, rating(), options)
    const badges = doc.querySelectorAll(".rmo-badge")
    expect(badges.length).toBe(1)
    expect(badges[0]?.parentElement?.classList.contains("boxart-container")).toBe(true)
    expect(badges[0]?.textContent).toBe("IMDb9.1RT94%")
    expect(hasBadge(card as Element)).toBe(true)

    renderBadge(card as Element, rating({ found: false }), options)
    expect(hasBadge(card as Element)).toBe(false)
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

  test("a series modal is typed by its season count, and a miss gets a muted pill", () => {
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
