import { site } from "@packages/config/site"
import { useEffect, useState } from "react"
import { browser } from "wxt/browser"

import { SwitchRow } from "@/components/switch-row"
import { useSettings } from "@/components/use-settings"
import { compactCount, relativeTime } from "@/utils/format"
import type { IndexReply, LatestReply, Message } from "@/utils/messages"
import { groupMisses, summarize, type PageReport } from "@/utils/report"

// What the popup says about the index: unknown while asking, then the API's answer or its failure.
type Status = { state: "asking" } | { reply: IndexReply; state: "answered" }

export function App() {
  const [current, update] = useSettings()
  const [status, setStatus] = useState<Status>({ state: "asking" })
  const [page, setPage] = useState<PageReport | null>(null)

  useEffect(() => {
    const latest: Message = { type: "page:latest" }
    browser.runtime
      .sendMessage(latest)
      .then((reply: LatestReply | undefined) => setPage(reply?.report ?? null))
      .catch(() => setPage(null))
    const message: Message = { type: "api:index" }
    browser.runtime
      .sendMessage(message)
      .then((reply: IndexReply | undefined) =>
        setStatus({
          reply: reply ?? { error: "No reply from the extension; try again", index: null },
          state: "answered",
        }),
      )
      .catch((error: unknown) =>
        setStatus({
          reply: { error: error instanceof Error ? error.message : String(error), index: null },
          state: "answered",
        }),
      )
  }, [])

  return (
    <main className="w-72 bg-white p-4 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="text-imdb grid size-7 place-items-center rounded-md bg-neutral-900 text-sm font-black dark:bg-neutral-800"
        >
          ★
        </span>
        <div>
          <h1 className="text-sm font-semibold">{site.name}</h1>
          <p className="text-xs text-neutral-500">{site.tagline}</p>
        </div>
      </header>
      {current ? (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <SwitchRow
            label="Show ratings on Netflix"
            description="Turn everything off without uninstalling"
            checked={current.enabled}
            onChange={(enabled) => update({ enabled })}
          />
          <SwitchRow
            label="Badges on title cards"
            description="The modal keeps its ratings row either way"
            checked={current.badges}
            onChange={(badges) => update({ badges })}
          />
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-neutral-500">Loading…</p>
      )}
      {page && (
        <section aria-labelledby="page" className="mt-3 text-xs">
          <h2 id="page" className="font-semibold text-neutral-700 dark:text-neutral-300">
            This Netflix tab: {summarize(page)}
          </h2>
          {groupMisses(page.misses).map((group) => (
            <details key={group.reason} className="mt-1 text-neutral-500">
              <summary className="cursor-pointer">
                {group.titles.length} {group.why}
              </summary>
              <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">
                {group.titles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
      <p className="mt-3 text-xs text-neutral-500" role="status">
        {status.state === "asking" && "Checking the IMDb index…"}
        {status.state === "answered" &&
          (status.reply.error ? (
            <span className="text-red-600">API unreachable: {status.reply.error}</span>
          ) : status.reply.index ? (
            `IMDb index: ${compactCount(status.reply.index.titles)} titles, refreshed ${relativeTime(status.reply.index.finishedAt)}`
          ) : (
            <span className="text-amber-600">The IMDb index has not been built yet</span>
          ))}
      </p>
      <footer className="mt-3 flex items-center justify-between text-xs text-neutral-500">
        <button
          type="button"
          className="font-medium text-neutral-700 hover:underline dark:text-neutral-300"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          Options
        </button>
        <span>
          Information courtesy of{" "}
          <a
            href="https://www.imdb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            IMDb
          </a>
          . Used with permission.
        </span>
      </footer>
    </main>
  )
}
