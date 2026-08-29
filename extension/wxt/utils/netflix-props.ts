// Netflix's browse page is React, and its card components carry what the page fetched for them. The current card (a jbv anchor) holds videoId and title in its own props, and its row's props hold every edge with a unifiedEntity { __typename: "Movie" | "Show", releaseYear, runtimeSec }. The legacy card (.title-card, still rendered on genre pages) holds one videoModel { title, releaseYear, runtime, summary: { id, type: "movie" | "show" } }. Either is the only place the page states a title's year and kind, which is what keeps "Alpha (2026)" apart from the 2018 film; for a show the year is its latest season's, not its premiere's. React's fiber properties are visible only from the page's own JS world, so entrypoints/netflix-entities.content.ts runs there and stamps what this reads onto the card as data attributes for the isolated-world scanner. Pure over the element it is handed, so tests can hang a fake fiber chain on a happy-dom node.

export type Entity = {
  runtime?: number
  title: string
  type?: "movie" | "series"
  videoId: number
  year?: number
}

type Fiber = { memoizedProps?: unknown; return?: Fiber | null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const fiberOf = (el: Element): Fiber | null => {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"))
  return key ? ((el as unknown as Record<string, Fiber | undefined>)[key] ?? null) : null
}

const edgesOf = (props: Record<string, unknown>): unknown[] | undefined => {
  const row = isRecord(props.row) ? props.row : undefined
  const fragment = isRecord(props.sectionFragment)
    ? props.sectionFragment
    : row && isRecord(row.sectionFragment)
      ? row.sectionFragment
      : undefined
  const entities = fragment && isRecord(fragment.entities) ? fragment.entities : undefined
  return entities && Array.isArray(entities.edges) ? entities.edges : undefined
}

const entityOf = (edge: unknown): Record<string, unknown> | null => {
  if (!isRecord(edge) || !isRecord(edge.node) || !isRecord(edge.node.unifiedEntity)) return null
  return edge.node.unifiedEntity
}

// The kind a video record states (a legacy videoModel, or the video of a card in the modal's "More Like This" row), its year (a show's latest season), and a film's length in minutes from its seconds (a show's runtime is 0 or an episode's, not a length worth matching on).
function fromVideo(video: Record<string, unknown>): Entity | null {
  if (typeof video.videoId !== "number") return null
  const type =
    video.__typename === "Movie" ? "movie" : video.__typename === "Show" ? "series" : undefined
  const year =
    typeof video.releaseYear === "number"
      ? video.releaseYear
      : typeof video.latestYear === "number"
        ? video.latestYear
        : undefined
  const seconds =
    typeof video.runtimeSec === "number"
      ? video.runtimeSec
      : typeof video.displayRuntimeSec === "number"
        ? video.displayRuntimeSec
        : undefined
  const runtime = type === "movie" && seconds ? Math.round(seconds / 60) : undefined
  return {
    title: typeof video.title === "string" ? video.title : "",
    videoId: video.videoId,
    ...(runtime ? { runtime } : {}),
    ...(type ? { type } : {}),
    ...(year ? { year } : {}),
  }
}

// The kind a legacy videoModel states, and a film's length in minutes from its seconds (a show's runtime is 0 or an episode's, not a length worth matching on).
function fromVideoModel(model: Record<string, unknown>): Entity | null {
  const summary = isRecord(model.summary) ? model.summary : undefined
  const videoId =
    typeof summary?.id === "number"
      ? summary.id
      : typeof model.unifiedEntityId === "string"
        ? Number(model.unifiedEntityId.split(":")[1])
        : Number.NaN
  if (!Number.isInteger(videoId)) return null
  const type = summary?.type === "movie" ? "movie" : summary?.type === "show" ? "series" : undefined
  const year = typeof model.releaseYear === "number" ? model.releaseYear : undefined
  const runtime =
    type === "movie" && typeof model.runtime === "number" && model.runtime > 0
      ? Math.round(model.runtime / 60)
      : undefined
  return {
    title: typeof model.title === "string" ? model.title : "",
    videoId,
    ...(runtime ? { runtime } : {}),
    ...(type ? { type } : {}),
    ...(year ? { year } : {}),
  }
}

// The video id the card's own link names (jbv= today, /watch/ or /title/ before), which any props met on the way up must agree with: a row, a billboard, or a modal above the card carries a model of its own.
const linkedId = (card: Element): number | undefined => {
  const href =
    (card.matches("a[href]") ? card : card.querySelector("a[href]"))?.getAttribute("href") ?? ""
  const match = href.match(/(?:\/watch\/|\/title\/|[?&]jbv=)(\d+)/)
  return match ? Number(match[1]) : undefined
}

// Walk up from a card: a legacy videoModel for the card's own id is the whole answer; otherwise the first props with the card's videoId are the card's, the first section fragment with entity edges is the row's, and the edge whose entity has the card's videoId names the year and kind. Null when the element has no fiber or no card above it.
export function readEntity(card: Element, maxDepth = 40): Entity | null {
  const linked = linkedId(card)
  const owns = (id: number) => linked === undefined || id === linked
  let videoId: number | undefined
  let title: string | undefined
  let edges: unknown[] | undefined
  let fiber = fiberOf(card)
  for (let depth = 0; fiber && depth < maxDepth; depth += 1) {
    const props = fiber.memoizedProps
    if (isRecord(props)) {
      if (isRecord(props.videoModel)) {
        const legacy = fromVideoModel(props.videoModel)
        if (legacy && owns(legacy.videoId)) return legacy
      }
      if (isRecord(props.video)) {
        const similar = fromVideo(props.video)
        if (similar && owns(similar.videoId)) return similar
      }
      if (videoId === undefined && typeof props.videoId === "number" && owns(props.videoId)) {
        videoId = props.videoId
        if (typeof props.title === "string") title = props.title
      }
      if (!edges) edges = edgesOf(props)
      if (videoId !== undefined && edges) break
    }
    fiber = fiber.return ?? null
  }
  if (videoId === undefined) return null
  const entity = edges?.map(entityOf).find((ue) => ue !== null && ue.videoId === videoId)
  const year = entity && typeof entity.releaseYear === "number" ? entity.releaseYear : undefined
  const type =
    entity?.__typename === "Movie" ? "movie" : entity?.__typename === "Show" ? "series" : undefined
  // A film's length in minutes; a show carries episodes, not a runtime.
  const runtime =
    type === "movie" && entity && typeof entity.runtimeSec === "number"
      ? Math.round(entity.runtimeSec / 60)
      : undefined
  return {
    title: title ?? "",
    videoId,
    ...(runtime ? { runtime } : {}),
    ...(type ? { type } : {}),
    ...(year ? { year } : {}),
  }
}

// The billboard (the hero at the top of a browse page) names its title only as a logo image, but its props carry the play button's entity { videoId, __typename, releaseYear } and a title string such as "Shameless (U.S.), Season 1" or "His & Hers, Limited Series", whose suffix names what is promoted, not the show. Null when the section has no fiber or no such props above it.
const PROMOTED_SUFFIX = /[,:]\s*(?:Season|Part|Volume|Chapter)\s+\d+$|,\s*Limited Series$/i

export function readBillboard(section: Element, maxDepth = 30): Entity | null {
  let fiber = fiberOf(section)
  for (let depth = 0; fiber && depth < maxDepth; depth += 1) {
    const props = fiber.memoizedProps
    if (isRecord(props) && typeof props.title === "string" && Array.isArray(props.buttons)) {
      for (const button of props.buttons) {
        const press = isRecord(button) && isRecord(button.onPress) ? button.onPress : undefined
        const entity = press && isRecord(press.unifiedEntity) ? press.unifiedEntity : undefined
        if (entity && typeof entity.videoId === "number") {
          const read = fromVideo(entity)
          if (read) return { ...read, title: props.title.replace(PROMOTED_SUFFIX, "").trim() }
        }
      }
    }
    fiber = fiber.return ?? null
  }
  return null
}
