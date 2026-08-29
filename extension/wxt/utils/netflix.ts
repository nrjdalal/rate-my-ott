import type { Rating, TitleQuery } from "@/utils/api"
import { compactCount, oneDecimal } from "@/utils/format"

// Everything that reads or writes Netflix's DOM, as pure functions over the nodes they are handed (no globals, no extension APIs), so tests/extension/wxt/utils/netflix.test.ts can drive them with a fixture in happy-dom.

// A card as the scanner reads it. pending is a card the MAIN-world script has not stamped yet (see netflix-entities.content.ts): its year and kind are on the way, and the API answers nothing without a year, so the scanner waits for the stamp rather than ask.
export type CardInfo = {
  id: string
  pending: boolean
  runtime?: number
  title: string
  type?: "movie" | "series"
  year?: number
}

// The attribute the MAIN-world script sets once it has read a card's fiber; data-rmo-year and data-rmo-type sit beside it when the page named them.
export const STAMP = "data-rmo-meta"

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
  const stamped = card.hasAttribute(STAMP)
  return {
    id: match ? (match[1] as string) : title,
    // Any card the page identifies (a jbv or /watch/ link) gets a stamp from its React props; only a bare label has nothing to wait for.
    pending: !stamped && match !== null,
    title,
    ...stampedMeta(card),
  }
}

// The year, kind, and length the MAIN-world script stamped on a card, when it found them.
export function stampedMeta(card: Element): {
  runtime?: number
  type?: "movie" | "series"
  year?: number
} {
  const runtime = Number(card.getAttribute("data-rmo-runtime")) || undefined
  const year = Number(card.getAttribute("data-rmo-year")) || undefined
  const kind = card.getAttribute("data-rmo-type")
  const type = kind === "movie" || kind === "series" ? kind : undefined
  return { ...(runtime ? { runtime } : {}), ...(type ? { type } : {}), ...(year ? { year } : {}) }
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

// One partition of the pill: the number alone, the platform said by its color and spelled out for assistive tech and the tooltip.
const score = (doc: Document, className: string, value: string, label: string): HTMLElement => {
  const el = doc.createElement("span")
  el.className = `rmo-score ${className}`
  el.setAttribute("aria-label", label)
  el.setAttribute("title", label)
  el.textContent = value
  return el
}

// What a rating is worth showing as: one partition per platform with a score, IMDb today; nothing for a miss or a title nobody has rated yet, so no badge rather than an empty one.
function scores(doc: Document, rating: Rating): HTMLElement[] {
  const out: HTMLElement[] = []
  if (rating.imdbRating !== null) {
    const value = oneDecimal(rating.imdbRating)
    out.push(score(doc, "rmo-score--imdb", value, `IMDb ${value}`))
  }
  return out
}

// Idempotent: the card ends with exactly one badge (or none), whatever it had before.
export function renderBadge(card: Element, rating: Rating | null): void {
  const host = badgeHost(card)
  host.querySelector(`:scope > .${BADGE}`)?.remove()
  if (!rating || !rating.found) return
  const parts = scores(host.ownerDocument, rating)
  if (parts.length === 0) return
  const badge = host.ownerDocument.createElement("span")
  badge.className = BADGE
  badge.append(...parts)
  ensurePositioned(host)
  host.append(badge)
}

export type ModalInfo = { anchor: HTMLElement; query: TitleQuery }

// The title the open modal is about. Netflix renders titles as artwork, so it is read from where the page still spells it out: the ?jbv=<id> the modal puts in the URL names the card it opened from, whose aria-label is the title; failing that, the modal's own boxart or story art carries it as alt text, and the legacy logo image did too.
// The card the open modal came from: the ?jbv=<id> in the URL names it.
function modalCard(root: ParentNode): Element | null {
  // 9 is Node.DOCUMENT_NODE, spelled as a number because the DOM globals are not defined under bun test.
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument
  const jbv = doc?.defaultView
    ? new URL(doc.defaultView.location.href).searchParams.get("jbv")
    : null
  return jbv ? (doc?.querySelector(`a[aria-label][href*="jbv=${jbv}"]`) ?? null) : null
}

function modalTitle(root: ParentNode, modal: HTMLElement): string | undefined {
  const card = modalCard(root)
  const art = modal.querySelector<HTMLImageElement>(
    "img.previewModal--boxart[alt], img[class*='storyArt'][alt], img.previewModal--player-titleTreatment-logo[alt], [data-uia='title-treatment'] img[alt], .title-logo img[alt]",
  )
  return (
    card?.getAttribute("aria-label")?.trim() ||
    art?.getAttribute("alt")?.trim() ||
    text(modal.querySelector("[data-uia='video-title']"))
  )
}

// The open title modal, if any, with its title and the year and kind its metadata row states, which is what lets the lookup disambiguate a remake. The anchor is the details column the rating row joins; a modal without one (the hover preview) gets no row, the card's badge already says it.
export function readModal(root: ParentNode): ModalInfo | null {
  const modal = root.querySelector<HTMLElement>(MODAL_SELECTOR)
  if (!modal) return null
  const title = modalTitle(root, modal)
  if (!title) return null
  const details = modal.querySelector<HTMLElement>(".previewModal--detailsMetadata-right")
  if (!details) return null
  const parsedYear = Number(text(modal.querySelector(".year"))?.match(/\d{4}/)?.[0]) || undefined
  const duration = text(modal.querySelector(".duration")) ?? ""
  // "6 Episodes", "3 Seasons", or "Limited Series" for a show; "2h 33m" for a film.
  const parsedType = /season|episode|series/i.test(duration)
    ? ("series" as const)
    : /\d+\s*h|\d+\s*m/i.test(duration)
      ? ("movie" as const)
      : undefined
  // The card the modal opened from carries the page's own year and kind once stamped; the modal's metadata text is the fallback.
  const stamped = stampedMeta(modalCard(root) ?? modal)
  const year = stamped.year ?? parsedYear
  const type = stamped.type ?? parsedType
  const runtime = stamped.runtime
  return {
    anchor: details,
    query: {
      title,
      ...(runtime ? { runtime } : {}),
      ...(type ? { type } : {}),
      ...(year ? { year } : {}),
    },
  }
}

export const hasPanel = (anchor: HTMLElement): boolean =>
  anchor.querySelector(`:scope > .${PANEL}`) !== null

// The modal's rating, as one more row of its details column ("Cast:", "Genres:", "This Movie Is:"): Netflix's own row classes, so it reads as Netflix's, with the score and vote count linking to the IMDb page. Nothing at all for a miss or a title nobody has rated yet. Idempotent like the badge.
export function renderPanel(anchor: HTMLElement, rating: Rating | null): void {
  const doc = anchor.ownerDocument
  anchor.querySelector(`:scope > .${PANEL}`)?.remove()
  if (!rating || !rating.found || rating.imdbRating === null) return
  const row = doc.createElement("div")
  row.className = `previewModal--tags ${PANEL}`
  const label = doc.createElement("span")
  label.className = "previewModal--tags-label"
  label.textContent = "IMDb:"
  const item = doc.createElement("span")
  item.className = "tag-item"
  // Netflix leaves the gap after a label inside the item, as a leading space.
  item.append(" ")
  const value = `${oneDecimal(rating.imdbRating)}${
    rating.imdbVotes !== null ? ` with ${compactCount(rating.imdbVotes)} votes` : ""
  }`
  if (rating.imdbId) {
    const link = doc.createElement("a")
    link.href = `https://www.imdb.com/title/${rating.imdbId}/`
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.textContent = value
    item.append(link)
  } else {
    item.textContent = value
  }
  row.append(label, item)
  anchor.append(row)
}

export function removeAll(root: ParentNode): void {
  for (const node of root.querySelectorAll(`.${BADGE}, .${PANEL}`)) node.remove()
}
