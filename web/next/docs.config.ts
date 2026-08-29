import { site } from "@packages/config/site"

import type { DocsConfig } from "./src/lib/docs"

// Single source of truth for docs structure and metadata. Groups are ordered arrays; each item is a single-key record keyed by a page URL (value = metadata) or a subgroup label (value = nested items). Keys are literal URLs ("/docs" = the docs index).
// title/description are synced into each MDX's frontmatter by the web/next build/dev (.github/scripts/docs.ts); `label` overrides the sidebar label (defaults to title).
const docsConfig: DocsConfig = {
  docs: {
    "Getting Started": [
      {
        "/docs": {
          title: "Introduction",
          description: site.description,
        },
      },
      {
        "/docs/getting-started/install": {
          title: "Install the extension",
          description:
            "Download the zip, load it into your browser, open Netflix. Nothing to run, nothing to configure.",
          label: "Install",
        },
      },
      {
        "/docs/getting-started/development": {
          title: "Run the stack",
          description:
            "Run the API, the site, and a live-reloading extension build locally, with your own IMDb index.",
          label: "Development",
        },
      },
      {
        "/docs/getting-started/ratings-api": {
          title: "The Ratings API",
          description:
            "What the extension calls: one batch endpoint over the IMDb index, IMDb's daily datasets in Postgres.",
          label: "Ratings API",
        },
      },
    ],
    Project: [
      {
        "/docs/privacy": {
          title: "Privacy",
          description: "What the extension sends, what the API keeps, and what neither does.",
        },
      },
    ],
  },
}

export default docsConfig
