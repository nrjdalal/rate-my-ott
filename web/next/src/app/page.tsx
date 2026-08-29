import { features, site } from "@packages/config/site"
import {
  RiArrowRightLine,
  RiChromeLine,
  RiFilmLine,
  RiFirefoxLine,
  RiFlashlightLine,
  RiStarFill,
} from "@remixicon/react"
import Link from "next/link"

import { IndexStat } from "@/components/index-stat"
import { Button } from "@/components/ui/button"

const steps = [
  {
    title: "Browse Netflix as usual",
    body: "The extension watches the titles Netflix renders: every card in every row, and the title you open.",
  },
  {
    title: "Ratings arrive in batches",
    body: "Titles go to the Ratings API a batch at a time, with the year, kind, and runtime Netflix knows, so the right Alpha comes back.",
  },
  {
    title: "Read the score, not the pitch",
    body: "Each card gets an IMDb badge; the title modal gets the score, the vote count, and a link to the IMDb page.",
  },
]

const facts = [
  {
    icon: RiStarFill,
    title: "IMDb, exactly",
    body: "Matched in IMDb's own daily datasets by name, kind, year, and runtime; an ambiguous title gets no score rather than a wrong one.",
  },
  {
    icon: RiFlashlightLine,
    title: "Fresh every night",
    body: "The index is rebuilt from IMDb every day, and a lookup is one query, so nothing waits on a third-party API or its quota.",
  },
  {
    icon: RiFilmLine,
    title: "Netflix first",
    body: "Built for Netflix's cards and modals today, with the scanner kept separate so other platforms can follow.",
  },
]

// The latest release's zips under stable names (the release workflow uploads an unversioned copy of each).
const DOWNLOADS = {
  chrome: "https://github.com/nrjdalal/rate-my-ott/releases/latest/download/rate-my-ott-chrome.zip",
  firefox:
    "https://github.com/nrjdalal/rate-my-ott/releases/latest/download/rate-my-ott-firefox.zip",
}

export default function Home() {
  return (
    <>
      <main className="pt-14">
        <section aria-labelledby="hero" className="px-4 py-24 text-center md:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <span className="text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
              <RiStarFill className="text-imdb size-3.5" aria-hidden="true" />
              Browser extension for Netflix
            </span>
            <h1 id="hero" className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
              {site.tagline}
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg">{site.description}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button render={<a href={DOWNLOADS.chrome} />}>
                <RiChromeLine aria-hidden="true" />
                Download for Chrome
              </Button>
              <Button variant="outline" render={<a href={DOWNLOADS.firefox} />}>
                <RiFirefoxLine aria-hidden="true" />
                Firefox
              </Button>
              {features.docs && (
                <Button variant="ghost" render={<Link href="/docs/getting-started/install" />}>
                  How to install
                  <RiArrowRightLine aria-hidden="true" />
                </Button>
              )}
              {features.apiDocs && (
                <Button
                  variant="outline"
                  render={<a href="/api/docs" target="_blank" rel="noopener noreferrer" />}
                >
                  API reference
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Unzip, then load the folder from chrome://extensions with Developer mode on.
            </p>
            <IndexStat />
          </div>
        </section>

        <section aria-labelledby="how" className="border-t px-4 py-24 md:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 id="how" className="mb-10 text-center text-3xl font-bold tracking-tight">
              How it works
            </h2>
            <ol className="grid gap-8 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="text-muted-foreground font-mono text-sm">0{index + 1}</span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="facts" className="border-t px-4 py-24 md:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 id="facts" className="mb-10 text-center text-3xl font-bold tracking-tight">
              What you get
            </h2>
            <ul className="grid gap-6 md:grid-cols-3">
              {facts.map((fact) => (
                <li key={fact.title} className="bg-card flex flex-col gap-3 rounded-xl border p-6">
                  <fact.icon className="size-6" aria-hidden="true" />
                  <h3 className="font-semibold">{fact.title}</h3>
                  <p className="text-muted-foreground text-sm">{fact.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <footer className="text-muted-foreground border-t px-4 py-10 text-center text-sm md:px-6">
        Information courtesy of{" "}
        <a
          href="https://www.imdb.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          IMDb
        </a>
        . Used with permission. Not affiliated with Netflix.{" "}
        <Link href="/docs/privacy" className="underline">
          Privacy
        </Link>
      </footer>
    </>
  )
}
