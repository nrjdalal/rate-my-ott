import { features } from "@packages/config/site"
import type { Root } from "fumadocs-core/page-tree"
import { createRelativeLink } from "fumadocs-ui/mdx"
import { notFound } from "next/navigation"

import { docsSource } from "@/lib/source"

export type ContentKind = "docs"

// The one place that knows each content kind's source, base URL, the feature flag that gates it, and whether it has an /og route. A new kind (a blog, internal docs) is one entry here plus its loader in source.ts.
const REGISTRY = {
  docs: { source: docsSource, baseUrl: "/docs", feature: "docs", og: true },
} as const

type Registry = typeof REGISTRY
type SourceOf<K extends ContentKind> = Registry[K]["source"]
export type PageOf<K extends ContentKind> = NonNullable<ReturnType<SourceOf<K>["getPage"]>>

const EMPTY_TREE: Root = { name: "", children: [] }

export interface ContentSource<K extends ContentKind> {
  kind: K
  baseUrl: string
  enabled: boolean
  // Whether this kind has an /og${baseUrl} route; when false, metadata omits the OG image rather than pointing at a route that does not exist.
  og: boolean
  source: SourceOf<K>
  getPageOr404: (slug: string[] | undefined) => PageOf<K>
  pages: () => PageOf<K>[]
  params: () => { slug: string[] }[]
  tree: () => Root
  relativeLink: (page: PageOf<K>) => ReturnType<typeof createRelativeLink>
}

// A handle to one content kind. When the kind's feature is off, every accessor behaves as if the collection were empty: getPageOr404 404s, pages/params return [], and tree is empty, so routes, static params, sitemap, llms, and search all drop the surface with no per-caller checks.
export function contentSource<K extends ContentKind>(kind: K): ContentSource<K> {
  const entry = REGISTRY[kind]
  const source = entry.source
  const enabled = features[entry.feature]

  const getPageOr404 = (slug: string[] | undefined): PageOf<K> => {
    if (!enabled) notFound()
    const page = source.getPage(slug)
    if (!page) notFound()
    return page as PageOf<K>
  }

  const pages = (): PageOf<K>[] => (enabled ? (source.getPages() as PageOf<K>[]) : [])

  const params = (): { slug: string[] }[] =>
    enabled ? source.generateParams().map((p) => ({ slug: p.slug ?? [] })) : []

  const tree = (): Root => (enabled ? source.getPageTree() : EMPTY_TREE)

  // Resolve relative markdown links against this kind's own source: each has its own baseUrl and file tree.
  const relativeLink = (page: PageOf<K>): ReturnType<typeof createRelativeLink> =>
    createRelativeLink(docsSource, page as PageOf<"docs">)

  return {
    kind,
    baseUrl: entry.baseUrl,
    enabled,
    og: entry.og,
    source,
    getPageOr404,
    pages,
    params,
    tree,
    relativeLink,
  }
}
