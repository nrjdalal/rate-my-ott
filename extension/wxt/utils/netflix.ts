import type { Rating, TitleQuery } from "@/utils/api"
import { compactCount, oneDecimal } from "@/utils/format"

// Everything that reads or writes Netflix's DOM, as pure functions over the nodes they are handed (no globals, no extension APIs), so tests/extension/wxt/utils/netflix.test.ts can drive them with a fixture in happy-dom.

export type CardInfo = { id: string; title: string }

export type DisplayOptions = { showMetascore: boolean; showRottenTomatoes: boolean }

// Every lockup a badge goes on: the classic slider card, the gallery card on My List, and the data-uia variant newer rows carry.
export const CARD_SELECTOR = ".title-card, [data-uia='title-card']"

// The hover and detail modals share one container class; the detail one adds `detail-modal`.
export const MODAL_SELECTOR = ".previewModal--container"

const BADGE = "rmo-badge"
const PANEL = "rmo-panel"

export const findCards = (root: ParentNode): Element[] => [...root.querySelectorAll(CARD_SELECTOR)]

const text = (node: Element | null | undefined): string | undefined =>
  node?.textContent?.replace(/\s+/g, " ").trim() || undefined

// The title as Netflix labels it for screen readers first (the anchor's aria-label), then the fallback text it renders under artwork that failed to load, then the newer title node; a card with none of them (a logo-only promo) is skipped. The Netflix video id in the anchor's href is the card's identity, since the same title can appear in several rows.
export function readCard(card: Element): CardInfo | null {
  const anchor =
    card.querySelector<HTMLAnchorElement>("a.slider-refocus") ??
    card.querySelector<HTMLAnchorElement>("a[href]")
  const title =
    anchor?.getAttribute("aria-label")?.trim() ||
    text(card.querySelector(".fallback-text")) ||
    text(card.querySelector("[data-uia='title-card-title']"))
  if (!title) return null
  const href = anchor?.getAttribute("href") ?? ""
  const match = href.match(/\/(?:watch|title)\/(\d+)/)
  return { id: match ? (match[1] as string) : title, title }
}

// Where the badge sits: the artwork box, which Netflix already positions (its fallback text is absolutely placed inside it), so an absolutely placed badge lands on the art rather than in the card's flow; the card itself when there is no such box.
export const badgeHost = (card: Element): HTMLElement =>
  card.querySelector<HTMLElement>(".boxart-container, .boxart-size-16x9, .boxart-size-7x10") ??
  (card as HTMLElement)

export const hasBadge = (card: Element): boolean =>
  badgeHost(card).querySelector(`:scope > .${BADGE}`) !== null

// A positioned host keeps the badge on the art; only a static one is touched, and only with a class, so Netflix's own positioning is never overridden.
function ensurePositioned(host: HTMLElement): void {
  const view = host.ownerDocument.defaultView
  if (view && view.getComputedStyle(host).position === "static") host.classList.add("rmo-host")
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

// The open title modal, if any, with the title Netflix shows in it and the year and kind its metadata row states, which is what lets the lookup disambiguate a remake. The title comes from the logo image's alt text (Netflix renders titles as artwork), then the newer title node, then any labelled link inside the modal.
export function readModal(root: ParentNode): ModalInfo | null {
  const modal = root.querySelector<HTMLElement>(MODAL_SELECTOR)
  if (!modal) return null
  const logo = modal.querySelector<HTMLImageElement>(
    "img.previewModal--player-titleTreatment-logo, [data-uia='title-treatment'] img, .title-logo img",
  )
  const title =
    logo?.getAttribute("alt")?.trim() ||
    text(modal.querySelector("[data-uia='video-title']")) ||
    modal.querySelector<HTMLAnchorElement>("a[aria-label]")?.getAttribute("aria-label")?.trim()
  if (!title) return null
  const metadata = modal.querySelector<HTMLElement>(".videoMetadata--container")
  const year = Number(text(modal.querySelector(".year"))?.match(/\d{4}/)?.[0]) || undefined
  const duration = text(modal.querySelector(".duration")) ?? ""
  const type = /season|episode/i.test(duration)
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
