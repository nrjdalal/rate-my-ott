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

// Walk up from a card: a legacy videoModel is the whole answer; otherwise the first props with a videoId are the card's, the first section fragment with entity edges is the row's, and the edge whose entity has the card's videoId names the year and kind. Null when the element has no fiber or no card above it.
export function readEntity(card: Element, maxDepth = 40): Entity | null {
  let videoId: number | undefined
  let title: string | undefined
  let edges: unknown[] | undefined
  let fiber = fiberOf(card)
  for (let depth = 0; fiber && depth < maxDepth; depth += 1) {
    const props = fiber.memoizedProps
    if (isRecord(props)) {
      if (isRecord(props.videoModel)) {
        const legacy = fromVideoModel(props.videoModel)
        if (legacy) return legacy
      }
      if (videoId === undefined && typeof props.videoId === "number") {
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
