// Brand identity for this app: the single source a fork edits to rebrand. web reads it via lib/config.ts.
export const site = {
  name: "Rate-my-ott",
  description: "Rate-my-ott is just getting started. Tell its story here.",
  tagline: "Your tagline, ready when you are.",
  social: {
    discord: "",
    github: "",
    x: "",
  },
  // Injectable long-form text blocks. A product sets its own, or leaves them empty.
  apiReferenceDescription: "",
  llmsFullPreamble: "",
} as const

export type Site = typeof site

// Optional surfaces this app enables or disables. Typed boolean (not `as const`) so they can be flipped and the runtime gates are not dead code. Off means the routes 404 and the links, nav, sitemap, llms, and search drop the surface.
export const features = {
  apiDocs: true,
  docs: true,
}

export type Feature = keyof typeof features
