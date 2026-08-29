import { describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

import type { Rating } from "../../../../extension/wxt/utils/api"
import {
  findCards,
  hasBadge,
  hasBillboardRating,
  hasPanel,
  readBillboard,
  readCard,
  readModal,
  readModals,
  removeAll,
  renderBadge,
  renderBillboardRating,
  renderPanel,
  shouldDim,
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
    <div class="titleCard--container" data-uia="titleCard--container" aria-label="Little Brother" data-rmo-meta data-rmo-id="81521988" data-rmo-year="2026" data-rmo-type="movie" data-rmo-runtime="101"><div class="titleCard-imageWrapper has-duration"><div class="ptrack-content"><img alt=""></div><div class="duration">1h 40m</div></div><div class="titleCard--metadataWrapper"><span class="year">2026</span></div></div>
    <div class="titleCard--container" data-uia="titleCard--container" aria-label="Not Yet Stamped"><div class="titleCard-imageWrapper"><img alt=""></div></div>
  </div>
</div>
`

const rating = (overrides: Partial<Rating> = {}): Rating => ({
  found: true,
  imdbId: "tt2861424",
  imdbRating: 9.1,
  imdbVotes: 640123,
  metascore: null,
  poster: null,
  reason: null,
  rottenTomatoes: null,
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

  test("a title under the dim threshold fades its artwork; one without a score never does", () => {
    const doc = page(CARDS)
    const card = findCards(doc)[4] as Element
    expect(shouldDim(rating({ imdbRating: 5.4 }), 6)).toBe(true)
    expect(shouldDim(rating({ imdbRating: 6 }), 6)).toBe(false)
    expect(shouldDim(rating({ imdbRating: null }), 6)).toBe(false)
    expect(shouldDim(rating({ found: false, imdbRating: null }), 6)).toBe(false)
    expect(shouldDim(rating({ imdbRating: 5.4 }), null)).toBe(false)
    renderBadge(card, rating({ imdbRating: 5.4 }), "k", 6)
    const host = doc.querySelector(".rmo-badge")?.parentElement
    expect(host?.classList.contains("rmo-dim")).toBe(true)
    renderBadge(card, rating({ imdbRating: 7.2 }), "k", 6)
    expect(host?.classList.contains("rmo-dim")).toBe(false)
    renderBadge(card, rating({ imdbRating: 5.4 }), "k", 6)
    removeAll(doc)
    expect(doc.querySelector(".rmo-dim")).toBeNull()
  })

  test("a painted score names the query it answers, so another title on the same element is painted again", () => {
    const doc = page(CARDS)
    const card = findCards(doc)[4] as Element
    renderBadge(card, rating({ imdbRating: 8.5 }), "a|2020|series|")
    expect(hasBadge(card, "a|2020|series|")).toBe(true)
    expect(hasBadge(card, "b|2021|movie|")).toBe(false)
    renderBadge(card, rating({ imdbRating: 6.1 }), "b|2021|movie|")
    expect(doc.querySelectorAll(".rmo-badge").length).toBe(1)
    expect(doc.querySelector(".rmo-badge")?.textContent).toBe("6.1")
    expect(hasBadge(card, "b|2021|movie|")).toBe(true)
  })

  test("a linked card is known by its id: a stamp title that differs from the label still counts", () => {
    const doc = page(CARDS)
    const [standard] = findCards(doc)
    standard?.setAttribute("data-rmo-id", "81616273")
    standard?.setAttribute("data-rmo-title", "")
    expect(readCard(standard as Element)?.pending).toBe(false)
    expect(readCard(standard as Element)?.year).toBe(2026)
  })

  test("a stamp that names another id or label is no stamp: the card is pending again", () => {
    const doc = page(CARDS)
    const [standard] = findCards(doc)
    standard?.setAttribute("data-rmo-id", "999")
    expect(readCard(standard as Element)).toEqual({
      id: "81616273",
      pending: true,
      title: "Operation Safed Sagar: The Untold Story of the Kargil War",
    })
    const modal = page(MODAL)
    const similar = findCards(modal).find(
      (c) => c.getAttribute("data-uia") === "titleCard--container",
    ) as Element
    similar.setAttribute("data-rmo-title", "Someone Else")
    expect(readCard(similar)).toEqual({
      id: "Little Brother",
      pending: true,
      title: "Little Brother",
    })
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

const BILLBOARD = `
<section data-uia="billboard" data-rmo-meta data-rmo-id="70184207" data-rmo-title="Shameless (U.S.)" data-rmo-year="2011" data-rmo-type="series" data-rmo-runtime="45">
  <div data-uia="billboard-title"><img alt="LOGO|abc" data-uia="billboard-logo">
    <div data-uia="attributes-elements"><span class="e1" data-uia="kind">Series</span><p aria-hidden="true" class="sep" id="sep-1">•</p><span class="e1">Drama</span><p aria-hidden="true" class="sep">•</p><span class="e1">2011</span><p aria-hidden="true" class="sep">•</p><span class="maturity">A</span></div>
  </div>
</section>
`

describe("readBillboard and renderBillboardRating", () => {
  test("reads the stamped billboard and joins its metadata line in its own markup", () => {
    const doc = page(BILLBOARD + CARDS)
    const billboard = readBillboard(doc)
    expect(billboard?.query).toEqual({
      runtime: 45,
      title: "Shameless (U.S.)",
      type: "series",
      year: 2011,
    })
    expect(billboard?.anchor.getAttribute("data-uia")).toBe("attributes-elements")
    renderBillboardRating(billboard!.anchor, rating({ imdbRating: 8.5, imdbVotes: 300000 }))
    renderBillboardRating(billboard!.anchor, rating({ imdbRating: 8.5, imdbVotes: 300000 }))
    const added = [...billboard!.anchor.querySelectorAll(".rmo-panel")]
    expect(added.map((n) => n.tagName + ":" + n.textContent)).toEqual(["P:•", "SPAN:IMDb 8.5"])
    expect(added[0]?.classList.contains("sep")).toBe(true)
    expect(added[0]?.hasAttribute("id")).toBe(false)
    expect(added[1]?.classList.contains("e1")).toBe(true)
    expect(added[1]?.classList.contains("maturity")).toBe(false)
    expect(added[1]?.hasAttribute("data-uia")).toBe(false)
    expect(added[1]?.getAttribute("title")).toBe("300K votes on IMDb")
    expect(hasBillboardRating(billboard!.anchor)).toBe(true)
    renderBillboardRating(billboard!.anchor, rating({ found: false }))
    expect(hasBillboardRating(billboard!.anchor)).toBe(false)
    expect(billboard!.anchor.textContent).toBe("Series•Drama•2011•A")
  })

  test("an unstamped billboard, or one without a metadata line, is nothing to ask about", () => {
    expect(readBillboard(page(BILLBOARD.replace(" data-rmo-meta", "")))).toBeNull()
    expect(readBillboard(page(BILLBOARD.replace('data-uia="attributes-elements"', "")))).toBeNull()
  })
})

// The preview's own stamp has only the id and title; the card it hovers over (same id) has the year, kind, and length.
const MINI = `
<a href="/browse?jbv=81715790" aria-label="72 HOURS" data-uia="standard-card" data-rmo-meta data-rmo-id="81715790" data-rmo-year="2026" data-rmo-type="movie" data-rmo-runtime="105"><div><img alt=""></div></a>
<div class="previewModal--container mini-modal" data-rmo-meta data-rmo-id="81715790" data-rmo-title="72 HOURS">
  <div data-uia="videoMetadata--container" class="videoMetadata--container"><div class="videoMetadata--line"><div class="maturity-rating"><span class="maturity-number">A</span></div><span class="duration">1h 45m</span><span class="player-feature-badge">HD</span></div></div>
</div>
`

describe("the hover preview", () => {
  test("reads its stamp for the title, year, and kind, and adds the rating beside the duration", () => {
    const doc = page(MINI)
    const modal = readModal(doc)
    expect(modal?.kind).toBe("line")
    expect(modal?.query).toEqual({ runtime: 105, title: "72 HOURS", type: "movie", year: 2026 })
    renderPanel(modal!.anchor, rating({ imdbRating: 5.4, imdbVotes: 20209 }))
    renderPanel(modal!.anchor, rating({ imdbRating: 5.4, imdbVotes: 20209 }))
    const items = [...modal!.anchor.querySelectorAll(".rmo-panel")]
    expect(items.map((i) => i.className + ":" + i.textContent)).toEqual([
      "duration rmo-panel:IMDb 5.4",
    ])
    expect(items[0]?.getAttribute("title")).toBe("20.2K votes on IMDb")
    expect(hasPanel(modal!.anchor)).toBe(true)
    renderPanel(modal!.anchor, rating({ found: false }))
    expect(modal!.anchor.textContent).toBe("A1h 45mHD")
  })

  test("a preview whose card is gone keeps its title and its duration's kind and length but no year, and an unstamped one is nothing to ask about", () => {
    const alone = page(MINI.replace(/<a [^>]*>.*?<\/a>\n/s, ""))
    expect(readModal(alone)?.query).toEqual({ runtime: 105, title: "72 HOURS", type: "movie" })
    expect(readModal(page(MINI.replace(/ data-rmo-[a-z]+="[^"]*"| data-rmo-meta/g, "")))).toBeNull()
  })
})

describe("readModals", () => {
  test("reads every open preview, and a legacy preview stamped without a title from the card it hovers over", () => {
    const doc = page(`
  <div class="title-card" data-rmo-meta data-rmo-id="81667463" data-rmo-title="" data-rmo-year="2026" data-rmo-type="series"><a class="slider-refocus" href="/watch/81667463?tctx=1" aria-label="MOURINHO"><img alt=""></a></div>
  <div class="title-card" data-rmo-meta data-rmo-id="70204957" data-rmo-title="Bleach" data-rmo-year="2022" data-rmo-type="series"><a class="slider-refocus" href="/watch/70204957?tctx=1" aria-label="Bleach"><img alt=""></a></div>
  <div class="previewModal--container mini-modal" data-rmo-meta data-rmo-id="81667463" data-rmo-title=""><div class="videoMetadata--container"><div class="videoMetadata--line"><span class="duration">Limited Series</span></div></div></div>
  <div class="previewModal--container mini-modal" data-rmo-meta data-rmo-id="70204957" data-rmo-title="Bleach"><div class="videoMetadata--container"><div class="videoMetadata--line"><span class="duration">3 Seasons</span></div></div></div>
`)
    const modals = readModals(doc)
    expect(modals.map((modal) => modal.query)).toEqual([
      { title: "MOURINHO", type: "series", year: 2026 },
      { title: "Bleach", type: "series", year: 2022 },
    ])
    expect(modals.every((modal) => modal.kind === "line")).toBe(true)
    expect(readModal(doc)?.query.title).toBe("MOURINHO")
    // A preview stamped without a title whose card is gone has nothing to be asked about.
    doc.querySelector(".title-card")?.remove()
    expect(readModals(doc).map((modal) => modal.query.title)).toEqual(["Bleach"])
  })
})

describe("readModal and renderPanel", () => {
  test("reads the title, year, kind, and length from its metadata text, and inserts the ratings row after the metadata", () => {
    const doc = page(MODAL)
    const modal = readModal(doc)
    expect(modal?.query).toEqual({ runtime: 155, title: "Dune", type: "movie", year: 2021 })
    expect(modal?.anchor.className).toBe("previewModal--detailsMetadata-right")
    expect(modal?.kind).toBe("details")

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

  test("a More Like This card is a card: stamped id, year, and kind, badge on the artwork's left corner", () => {
    const doc = page(MODAL)
    const cards = findCards(doc).filter(
      (c) => c.getAttribute("data-uia") === "titleCard--container",
    )
    expect(cards.length).toBe(2)
    expect(readCard(cards[0] as Element)).toEqual({
      id: "81521988",
      pending: false,
      runtime: 101,
      title: "Little Brother",
      type: "movie",
      year: 2026,
    })
    expect(readCard(cards[1] as Element)).toEqual({
      id: "Not Yet Stamped",
      pending: true,
      title: "Not Yet Stamped",
    })
    renderBadge(cards[0] as Element, rating({ imdbRating: 6.4 }))
    const badge = doc.querySelector(".rmo-badge")
    expect(badge?.parentElement?.classList.contains("titleCard-imageWrapper")).toBe(true)
    expect(badge?.className).toBe("rmo-badge rmo-badge--left")
    expect(badge?.textContent).toBe("6.4")
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
