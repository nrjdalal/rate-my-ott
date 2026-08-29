import { site } from "@packages/config/site"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import type { Metadata } from "next"

import { CopyAsMarkdown } from "@/components/docs/copy-as-markdown"
import { config } from "@/lib/config"
import type { ContentKind, ContentSource, PageOf } from "@/lib/content"
import { getMDXComponents } from "@/mdx-components"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: site.name,
    },
  }
}

export function renderPageContent<K extends ContentKind>(cs: ContentSource<K>, page: PageOf<K>) {
  const MDX = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>
        {page.data.title} {cs.kind === "docs" && <CopyAsMarkdown url={page.url} />}
      </DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: cs.relativeLink(page),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generatePageMetadata<K extends ContentKind>(
  cs: ContentSource<K>,
  page: PageOf<K>,
): Promise<Metadata> {
  const pageUrl = `${config.app.url}${page.url}`
  // page.url always starts with cs.baseUrl (the loader prefixes it), so slicing the base off yields the slug path. This assumes no frontmatter slug override makes page.url diverge from the route param slug; none exists here.
  const slugPath = page.url.slice(cs.baseUrl.length).replace(/^\//, "")
  // Only kinds with an /og route get an OG image; omit it otherwise rather than link a nonexistent route.
  // Intentional cache-bust: the build/revalidation timestamp ties the OG URL to each deploy so social and CDN scrapers refetch the regenerated image instead of serving a stale one; not a bug.
  const imageUrl = cs.og
    ? `${config.app.url}/og${cs.baseUrl}${slugPath ? `/${slugPath}` : ""}?t=${Date.now()}`
    : undefined
  const images = imageUrl
    ? [{ url: imageUrl, width: 1200, height: 630, alt: page.data.title }]
    : undefined

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      type: "website",
      title: page.data.title,
      description: page.data.description,
      siteName: site.name,
      url: pageUrl,
      images,
    },
    other: {
      "og:logo": `${config.app.url}/favicon.ico`,
    },
    twitter: {
      card: "summary_large_image",
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}
