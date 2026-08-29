import type { Rating, TitleQuery } from "@/utils/api"
import { compactCount, oneDecimal } from "@/utils/format"
import { sameTitle } from "@/utils/netflix-props"

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

// Every lockup a badge goes on. Netflix's current browse UI renders a card as one anchor labelled with the title and linking to /browse?jbv=<id>: standard-card (rows), ranked-card (Top 10), progress-card (Continue Watching); any other labelled jbv link is a card too. The modal's "More Like This" cards are labelled divs with no link (their id comes from the stamp). The legacy .title-card markup stays beside them for pages that still render it.
export const CARD_SELECTOR =
  "a[data-uia='standard-card'], a[data-uia='ranked-card'], a[data-uia='progress-card'], a[aria-label][href*='jbv='], [data-uia='titleCard--container'][aria-label], .title-card, [data-uia='title-card']"

// The hero at the top of a browse page; its rating joins the metadata line under the logo.
export const BILLBOARD_SELECTOR = "[data-uia='billboard']"

// The hover and detail modals share one container class; the detail one adds `detail-modal`, the hover one `mini-modal`.
export const MODAL_SELECTOR = ".previewModal--container"

const BADGE = "rmo-badge"
const PANEL = "rmo-panel"

export const findCards = (root: ParentNode): Element[] => [...root.querySelectorAll(CARD_SELECTOR)]

const text = (node: Element | null | undefined): string | undefined =>
  node?.textContent?.replace(/\s+/g, " ").trim() || undefined

// The title as Netflix labels it for screen readers first (the card's own aria-label: the card is the anchor in the current UI, a labelled div in the modal's "More Like This" row; the legacy card labels its inner anchor), then the fallback text the legacy card renders under artwork that failed to load, then its title node; a card with none of them (a logo-only promo) is skipped. The Netflix video id in the href (jbv= today, /watch/ or /title/ before) is the card's identity, since the same title can appear in several rows.
export function readCard(card: Element): CardInfo | null {
  const anchor = card.matches("a[href]")
    ? (card as HTMLAnchorElement)
    : (card.querySelector<HTMLAnchorElement>("a.slider-refocus") ??
      card.querySelector<HTMLAnchorElement>("a[href]"))
  const title =
    card.getAttribute("aria-label")?.trim() ||
    anchor?.getAttribute("aria-label")?.trim() ||
    text(card.querySelector(".fallback-text")) ||
    text(card.querySelector("[data-uia='title-card-title']"))
  if (!title) return null
  const href = anchor?.getAttribute("href") ?? ""
  const match = href.match(/(?:\/watch\/|\/title\/|[?&]jbv=)(\d+)/)
  // A stamp counts only while it names this card: React recycles a card element for another title, and the MAIN-world script re-stamps it on its next scan.
  const stampedId = card.getAttribute("data-rmo-id")
  const stampedTitle = card.getAttribute("data-rmo-title")
  // A linked card is known by its id, a link-less one by its label, the same way the MAIN-world script decides whether to re-stamp it.
  const stamped =
    card.hasAttribute(STAMP) &&
    (match
      ? stampedId === null || stampedId === match[1]
      : stampedTitle === null || sameTitle(stampedTitle, title))
  return {
    id: (stamped && stampedId) || (match ? (match[1] as string) : title),
    // Any card the page identifies (a jbv or /watch/ link, or a labelled modal card) gets a stamp from its React props; only a bare label has nothing to wait for.
    pending: !stamped && (match !== null || card.matches("[data-uia='titleCard--container']")),
    title,
    ...(stamped ? stampedMeta(card) : {}),
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
  card.querySelector<HTMLElement>(
    ".boxart-container, .boxart-size-16x9, .boxart-size-7x10, .titleCard-imageWrapper",
  ) ??
  card.querySelector("img")?.parentElement ??
  (card as HTMLElement)

// Every painted score carries the key of the query it answers (data-rmo-for), so a card React recycled for another title, or the billboard a route change reused, is painted again rather than kept.
export const FOR = "data-rmo-for"

const painted = (node: Element | null, key: string): boolean =>
  node !== null && node.getAttribute(FOR) === key

export const hasBadge = (card: Element, key = ""): boolean =>
  painted(badgeHost(card).querySelector(`:scope > .${BADGE}`), key)

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

// Whether a title's artwork is dimmed: only a title with a score under the threshold, never one without a score.
export const shouldDim = (rating: Rating | null, dimBelow: number | null): boolean =>
  dimBelow !== null && rating !== null && rating.imdbRating !== null && rating.imdbRating < dimBelow

const DIM = "rmo-dim"

// Idempotent: the card ends with exactly one badge (or none), whatever it had before, and its artwork dimmed only when the score and the threshold say so.
export function renderBadge(
  card: Element,
  rating: Rating | null,
  key = "",
  dimBelow: number | null = null,
): void {
  const host = badgeHost(card)
  host.querySelector(`:scope > .${BADGE}`)?.remove()
  host.classList.toggle(DIM, shouldDim(rating, dimBelow))
  if (!rating || !rating.found) return
  const parts = scores(host.ownerDocument, rating)
  if (parts.length === 0) return
  const badge = host.ownerDocument.createElement("span")
  badge.setAttribute(FOR, key)
  // Netflix's own duration label sits top-right on the modal's cards; the badge takes the other corner there.
  badge.className = host.querySelector(".duration") ? `${BADGE} ${BADGE}--left` : BADGE
  badge.append(...parts)
  ensurePositioned(host)
  host.append(badge)
}

// Where a modal's rating goes: the detail modal's details column as an "IMDb:" row, the hover modal's metadata line as an item beside the duration.
export type ModalInfo = { anchor: HTMLElement; kind: "details" | "line"; query: TitleQuery }

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
    modal.getAttribute("data-rmo-title")?.trim() ||
    card?.getAttribute("aria-label")?.trim() ||
    art?.getAttribute("alt")?.trim() ||
    text(modal.querySelector("[data-uia='video-title']"))
  )
}

// The open title modal, if any, with its title and the year and kind its stamp or metadata row states, which is what lets the lookup disambiguate a remake. The anchor is the details column (the detail modal) or the metadata line (the hover preview, which has no details) the rating joins.
// Every modal open at once: the detail modal, the hover preview, and on a legacy page the preview that lingers while the next one animates in beside it, since the one the viewer is looking at is not always the first in the document.
export const readModals = (root: ParentNode): ModalInfo[] =>
  [...root.querySelectorAll<HTMLElement>(MODAL_SELECTOR)].flatMap((modal) => {
    const info = readOneModal(root, modal)
    return info ? [info] : []
  })

export const readModal = (root: ParentNode): ModalInfo | null => readModals(root)[0] ?? null

function readOneModal(root: ParentNode, modal: HTMLElement): ModalInfo | null {
  const id = modal.getAttribute("data-rmo-id")
  const twin = id ? root.querySelector(`[data-rmo-id="${id}"]:not(${MODAL_SELECTOR})`) : null
  // A legacy preview's stamp may carry no title (its card was recycled by the time it was stamped); the card it hovers over, found by the id, still spells it.
  const title = modalTitle(root, modal) || (twin ? readCard(twin)?.title : undefined)
  if (!title) return null
  const details = modal.querySelector<HTMLElement>(".previewModal--detailsMetadata-right")
  const line = modal.querySelector<HTMLElement>(".videoMetadata--line")
  const anchor = details ?? line
  if (!anchor) return null
  const parsedYear = Number(text(modal.querySelector(".year"))?.match(/\d{4}/)?.[0]) || undefined
  const duration = text(modal.querySelector(".duration")) ?? ""
  // "1h 39m" is the film's length, the strongest thing to check a namesake against, where the props stated none.
  const length = duration.match(/^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i)
  const parsedRuntime = length
    ? Number(length[1] ?? 0) * 60 + Number(length[2] ?? 0) || undefined
    : undefined
  // "6 Episodes", "3 Seasons", or "Limited Series" for a show; "2h 33m" for a film.
  const parsedType = /season|episode|series/i.test(duration)
    ? ("series" as const)
    : /\d+\s*h|\d+\s*m/i.test(duration)
      ? ("movie" as const)
      : undefined
  // The modal's own stamp names the page's year and kind when its props carry them (the hover preview's do not, only its id and title); the card it opened from or hovers over, found by the jbv in the URL or by the same stamped id, is the next source, and the modal's metadata text the last.
  const own = stampedMeta(modal)
  const fromCard = stampedMeta(modalCard(root) ?? twin ?? modal)
  const stamped = { ...fromCard, ...own }
  const year = stamped.year ?? parsedYear
  const type = stamped.type ?? parsedType
  const runtime = stamped.runtime ?? (type === "movie" ? parsedRuntime : undefined)
  return {
    anchor,
    kind: details ? "details" : "line",
    query: {
      title,
      ...(runtime ? { runtime } : {}),
      ...(type ? { type } : {}),
      ...(year ? { year } : {}),
    },
  }
}

export const hasPanel = (anchor: HTMLElement, key = ""): boolean =>
  painted(anchor.querySelector(`:scope > .${PANEL}`), key)

// The modal's rating, as one more row of its details column ("Cast:", "Genres:", "This Movie Is:"): Netflix's own row classes, so it reads as Netflix's, with the score and vote count linking to the IMDb page. On the hover preview's metadata line instead, one more item cloned from the duration ("2h 20m  IMDb 5.4"). Nothing at all for a miss or a title nobody has rated yet. Idempotent like the badge.
export function renderPanel(anchor: HTMLElement, rating: Rating | null, key = ""): void {
  const doc = anchor.ownerDocument
  anchor.querySelector(`:scope > .${PANEL}`)?.remove()
  if (!rating || !rating.found || rating.imdbRating === null) return
  if (anchor.classList.contains("videoMetadata--line")) {
    // Cloned from the duration when there is one; a plain span otherwise, never the HD badge or the maturity box that end the line.
    const duration = anchor.querySelector(".duration")
    const item = duration ? (duration.cloneNode(false) as HTMLElement) : doc.createElement("span")
    item.classList.add(PANEL)
    item.setAttribute(FOR, key)
    item.textContent = `IMDb ${oneDecimal(rating.imdbRating)}`
    if (rating.imdbVotes !== null)
      item.setAttribute("title", `${compactCount(rating.imdbVotes)} votes on IMDb`)
    anchor.append(item)
    return
  }
  const row = doc.createElement("div")
  row.className = `previewModal--tags ${PANEL}`
  row.setAttribute(FOR, key)
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

export type BillboardInfo = { anchor: HTMLElement; query: TitleQuery }

// The stamped billboard, if any: the title, year, and kind the MAIN-world script read from its props (the title is artwork in the markup), and the metadata line ("Series • Drama • 2011 • 11 Seasons • A") its rating joins.
export function readBillboard(root: ParentNode): BillboardInfo | null {
  const section = root.querySelector<HTMLElement>(`${BILLBOARD_SELECTOR}[${STAMP}]`)
  const title = section?.getAttribute("data-rmo-title")?.trim()
  const line = section?.querySelector<HTMLElement>("[data-uia='attributes-elements']")
  if (!section || !title || !line) return null
  const meta = stampedMeta(section)
  return {
    anchor: line,
    query: {
      title,
      ...(meta.runtime ? { runtime: meta.runtime } : {}),
      ...(meta.type ? { type: meta.type } : {}),
      ...(meta.year ? { year: meta.year } : {}),
    },
  }
}

export const hasBillboardRating = (anchor: HTMLElement, key = ""): boolean =>
  painted(anchor.querySelector(`:scope > .${PANEL}`), key)

// The billboard's rating as two more items of its metadata line, cloned from the line's own separator and item so they read as Netflix's: "• IMDb 8.5". Nothing for a miss. Idempotent like the badge.
export function renderBillboardRating(anchor: HTMLElement, rating: Rating | null, key = ""): void {
  for (const node of anchor.querySelectorAll(`:scope > .${PANEL}`)) node.remove()
  if (!rating || !rating.found || rating.imdbRating === null) return
  // Cloned from the first item (the "Series" or "Film" label), not the last: the line ends with the maturity rating, whose box is not the look wanted. A clone keeps no id or data-uia, which name Netflix's own nodes.
  const items = [...anchor.children]
  const separator = items.find((node) => node.getAttribute("aria-hidden") === "true")
  const item = items.find((node) => node.getAttribute("aria-hidden") !== "true")
  if (!item) return
  const dot = (separator ?? item).cloneNode(true) as HTMLElement
  const score = item.cloneNode(false) as HTMLElement
  for (const node of [dot, score]) {
    node.removeAttribute("id")
    node.removeAttribute("data-uia")
    node.classList.add(PANEL)
    node.setAttribute(FOR, key)
  }
  score.textContent = `IMDb ${oneDecimal(rating.imdbRating)}`
  score.setAttribute(
    "title",
    rating.imdbVotes !== null ? `${compactCount(rating.imdbVotes)} votes on IMDb` : "IMDb",
  )
  anchor.append(dot, score)
}

export function removeAll(root: ParentNode): void {
  for (const node of root.querySelectorAll(`.${BADGE}, .${PANEL}`)) node.remove()
  for (const node of root.querySelectorAll(`.${DIM}`)) node.classList.remove(DIM)
}
