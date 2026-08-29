import type { Rating, TitleQuery } from "@/utils/api"
import { compactCount, oneDecimal } from "@/utils/format"

// Everything that reads or writes Netflix's DOM, as pure functions over the nodes they are handed (no globals, no extension APIs), so tests/extension/wxt/utils/netflix.test.ts can drive them with a fixture in happy-dom.

export type CardInfo = { id: string; title: string }

export type DisplayOptions = { showMetascore: boolean; showRottenTomatoes: boolean }

// Every lockup a badge goes on. Netflix's current browse UI renders a card as one anchor labelled with the title and linking to /browse?jbv=<id>: standard-card (rows), ranked-card (Top 10), progress-card (Continue Watching); any other labelled jbv link is a card too. The legacy .title-card markup stays beside them for pages that still render it.
export const CARD_SELECTOR =
  "a[data-uia='standard-card'], a[data-uia='ranked-card'], a[data-uia='progress-card'], a[aria-label][href*='jbv='], .title-card, [data-uia='title-card']"

// The hover and detail modals share one container class; the detail one adds `detail-modal`.
export const MODAL_SELECTOR = ".previewModal--container"

const BADGE = "rmo-badge"
const PANEL = "rmo-panel"

export const findCards = (root: ParentNode): Element[] => [...root.querySelectorAll(CARD_SELECTOR)]

const text = (node: Element | null | undefined): string | undefined =>
  node?.textContent?.replace(/\s+/g, " ").trim() || undefined

// The title as Netflix labels it for screen readers first (the card anchor's aria-label; the card is the anchor in the current UI), then the fallback text the legacy card renders under artwork that failed to load, then its title node; a card with none of them (a logo-only promo) is skipped. The Netflix video id in the href (jbv= today, /watch/ or /title/ before) is the card's identity, since the same title can appear in several rows.
export function readCard(card: Element): CardInfo | null {
  const anchor = card.matches("a[href]")
    ? (card as HTMLAnchorElement)
    : (card.querySelector<HTMLAnchorElement>("a.slider-refocus") ??
      card.querySelector<HTMLAnchorElement>("a[href]"))
  const title =
    anchor?.getAttribute("aria-label")?.trim() ||
    text(card.querySelector(".fallback-text")) ||
    text(card.querySelector("[data-uia='title-card-title']"))
  if (!title) return null
  const href = anchor?.getAttribute("href") ?? ""
  const match = href.match(/(?:\/watch\/|\/title\/|[?&]jbv=)(\d+)/)
  return { id: match ? (match[1] as string) : title, title }
}

// Where the badge sits: the artwork box, so an absolutely placed badge lands on the art rather than in the card's flow. The legacy card names it (.boxart-container); the current card is an anchor whose artwork is an <img> in a plain wrapper div, which is the box there (a ranked card puts its rank numeral in a sibling div, so the wrapper, not the anchor, keeps the badge on the art). The card itself when there is no artwork at all.
export const badgeHost = (card: Element): HTMLElement =>
  card.querySelector<HTMLElement>(".boxart-container, .boxart-size-16x9, .boxart-size-7x10") ??
  card.querySelector("img")?.parentElement ??
  (card as HTMLElement)

export const hasBadge = (card: Element): boolean =>
  badgeHost(card).querySelector(`:scope > .${BADGE}`) !== null

// A positioned host keeps the badge on the art; only a static one is touched, and only with a class, so Netflix's own positioning is never overridden.
function ensurePositioned(host: HTMLElement): void {
  const position = host.ownerDocument.defaultView?.getComputedStyle(host).position
  // An empty value is what a DOM without layout (happy-dom in the tests) reports for an unpositioned box.
  if (!position || position === "static") host.classList.add("rmo-host")
}

const chip = (doc: Document, mark: string, value: string, label: string): HTMLElement => {
  const el = doc.createElement("span")
  el.className = "rmo-badge__chip"
  el.setAttribute("aria-label", label)
  const markEl = doc.createElement("span")
  markEl.className = "rmo-badge__mark"
  markEl.textContent = mark
  el.append(markEl, value)
  return el
}

// What a rating is worth showing as: the IMDb score first, then Rotten Tomatoes and Metacritic when the user wants them; nothing for a miss or a title with no scores, so no badge rather than an empty one.
function chips(doc: Document, rating: Rating, options: DisplayOptions): HTMLElement[] {
  const out: HTMLElement[] = []
  if (rating.imdbRating !== null) {
    out.push(
      chip(doc, "IMDb", oneDecimal(rating.imdbRating), `IMDb ${oneDecimal(rating.imdbRating)}`),
    )
  }
  if (options.showRottenTomatoes && rating.rottenTomatoes !== null) {
    out.push(
      chip(doc, "RT", `${rating.rottenTomatoes}%`, `Rotten Tomatoes ${rating.rottenTomatoes}%`),
    )
  }
  if (options.showMetascore && rating.metascore !== null) {
    out.push(chip(doc, "MC", String(rating.metascore), `Metacritic ${rating.metascore}`))
  }
  return out
}

// Idempotent: the card ends with exactly one badge (or none), whatever it had before.
export function renderBadge(card: Element, rating: Rating | null, options: DisplayOptions): void {
  const host = badgeHost(card)
  host.querySelector(`:scope > .${BADGE}`)?.remove()
  if (!rating || !rating.found) return
  const parts = chips(host.ownerDocument, rating, options)
  if (parts.length === 0) return
  const badge = host.ownerDocument.createElement("span")
  badge.className = BADGE
  badge.append(...parts)
  ensurePositioned(host)
  host.append(badge)
}

export type ModalInfo = { anchor: HTMLElement; query: TitleQuery }

// The title the open modal is about. Netflix renders titles as artwork, so it is read from where the page still spells it out: the ?jbv=<id> the modal puts in the URL names the card it opened from, whose aria-label is the title; failing that, the modal's own boxart or story art carries it as alt text, and the legacy logo image did too.
function modalTitle(root: ParentNode, modal: HTMLElement): string | undefined {
  // 9 is Node.DOCUMENT_NODE, spelled as a number because the DOM globals are not defined under bun test.
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument
  const jbv = doc?.defaultView
    ? new URL(doc.defaultView.location.href).searchParams.get("jbv")
    : null
  const card = jbv ? doc?.querySelector(`a[aria-label][href*="jbv=${jbv}"]`) : null
  const art = modal.querySelector<HTMLImageElement>(
    "img.previewModal--boxart[alt], img[class*='storyArt'][alt], img.previewModal--player-titleTreatment-logo[alt], [data-uia='title-treatment'] img[alt], .title-logo img[alt]",
  )
  return (
    card?.getAttribute("aria-label")?.trim() ||
    art?.getAttribute("alt")?.trim() ||
    text(modal.querySelector("[data-uia='video-title']"))
  )
}

// The open title modal, if any, with its title and the year and kind its metadata row states, which is what lets the lookup disambiguate a remake.
export function readModal(root: ParentNode): ModalInfo | null {
  const modal = root.querySelector<HTMLElement>(MODAL_SELECTOR)
  if (!modal) return null
  const title = modalTitle(root, modal)
  if (!title) return null
  const metadata = modal.querySelector<HTMLElement>(".videoMetadata--container")
  const year = Number(text(modal.querySelector(".year"))?.match(/\d{4}/)?.[0]) || undefined
  const duration = text(modal.querySelector(".duration")) ?? ""
  // "6 Episodes", "3 Seasons", or "Limited Series" for a show; "2h 33m" for a film.
  const type = /season|episode|series/i.test(duration)
    ? ("series" as const)
    : /\d+\s*h|\d+\s*m/i.test(duration)
      ? ("movie" as const)
      : undefined
  return {
    anchor: metadata ?? modal,
    query: { title, ...(year ? { year } : {}), ...(type ? { type } : {}) },
  }
}

export const hasPanel = (anchor: HTMLElement): boolean =>
  (anchor.parentElement ?? anchor).querySelector(`.${PANEL}`) !== null

const pill = (doc: Document, label: string, className = ""): HTMLElement => {
  const el = doc.createElement("span")
  el.className = `rmo-pill ${className}`.trim()
  el.textContent = label
  return el
}

// The modal's rating row: an IMDb pill linking to the title page, then Rotten Tomatoes and Metacritic when wanted, or one muted pill saying the title was not found. Inserted after the metadata row when there is one (so it reads as part of it), else appended to the modal. Idempotent like the badge.
export function renderPanel(
  anchor: HTMLElement,
  rating: Rating | null,
  options: DisplayOptions,
): void {
  const doc = anchor.ownerDocument
  const parent = anchor.parentElement ?? anchor
  parent.querySelector(`.${PANEL}`)?.remove()
  const panel = doc.createElement("div")
  panel.className = PANEL
  panel.setAttribute("role", "group")
  panel.setAttribute("aria-label", "Ratings")
  if (!rating) return
  if (
    !rating.found ||
    (rating.imdbRating === null && rating.rottenTomatoes === null && rating.metascore === null)
  ) {
    panel.append(pill(doc, "No ratings found", "rmo-pill--muted"))
  } else {
    if (rating.imdbRating !== null) {
      let imdb: HTMLElement
      if (rating.imdbId) {
        const link = doc.createElement("a")
        link.href = `https://www.imdb.com/title/${rating.imdbId}/`
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        imdb = link
      } else {
        imdb = doc.createElement("span")
      }
      imdb.className = "rmo-pill rmo-pill--imdb"
      imdb.append(`IMDb ${oneDecimal(rating.imdbRating)}`)
      if (rating.imdbVotes !== null) {
        const votes = doc.createElement("small")
        votes.textContent = `${compactCount(rating.imdbVotes)} votes`
        imdb.append(votes)
      }
      panel.append(imdb)
    }
    if (options.showRottenTomatoes && rating.rottenTomatoes !== null) {
      panel.append(pill(doc, `Rotten Tomatoes ${rating.rottenTomatoes}%`))
    }
    if (options.showMetascore && rating.metascore !== null) {
      panel.append(pill(doc, `Metacritic ${rating.metascore}`))
    }
  }
  if (anchor.classList.contains("videoMetadata--container"))
    anchor.insertAdjacentElement("afterend", panel)
  else anchor.append(panel)
}

export function removeAll(root: ParentNode): void {
  for (const node of root.querySelectorAll(`.${BADGE}, .${PANEL}`)) node.remove()
}
