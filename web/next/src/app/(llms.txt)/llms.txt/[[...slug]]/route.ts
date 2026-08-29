import { site } from "@packages/config/site"
import { notFound } from "next/navigation"

import docsMeta from "@/../content/docs/meta.json"
import { config } from "@/lib/config"
import { contentSource } from "@/lib/content"
import { getLLMText, llmTextHeaders, sortByMeta } from "@/lib/llms"

export const dynamic = "force-static"
export const revalidate = 60

const docs = contentSource("docs")

async function createPageResponse(page: Parameters<typeof getLLMText>[0]) {
  const content = await getLLMText(page)

  const footer = `---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: ${config.app.url}/llms.txt`

  return new Response(`${content}\n\n${footer}`, {
    headers: llmTextHeaders,
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params

  if (!slug || slug.length === 0) {
    const docsSection = docs.enabled
      ? `

## Documentation

> Complete documentation for ${site.name}

${sortByMeta(docs.pages(), docsMeta.pages, "/docs")
  .map((p) => `- [${p.data.title}](${config.app.url}${p.url}.md): ${p.data.description}`)
  .join("\n")}`
      : ""

    return new Response(
      `# ${site.name}

> ${site.description}${docsSection}
`,
      {
        headers: llmTextHeaders,
      },
    )
  }

  if (slug[0] !== "docs" || !docs.enabled) notFound()

  const pageSlug = slug.length === 1 ? [] : slug.slice(1)
  return createPageResponse(docs.getPageOr404(pageSlug))
}

export function generateStaticParams() {
  const indexParams = [{ slug: [] }]
  const docsParams = docs.params().map((p) => ({ slug: ["docs", ...p.slug] }))
  return [...indexParams, ...docsParams]
}
