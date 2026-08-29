import { MetadataRoute } from "next"

import { config } from "@/lib/config"
import { contentSource } from "@/lib/content"

export const dynamic = "force-static"
export const revalidate = 60

const docs = contentSource("docs")

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = config.app.url

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
  ]

  // Docs pages (empty when the docs feature is off)
  const docsRoutes: MetadataRoute.Sitemap = docs.pages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }))

  const allPages = [...staticRoutes, ...docsRoutes]
  return allPages.sort((a, b) => a.url.localeCompare(b.url))
}
