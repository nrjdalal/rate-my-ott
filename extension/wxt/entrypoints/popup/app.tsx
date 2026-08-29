import { site } from "@packages/config/site"
import { browser } from "wxt/browser"

import { SwitchRow } from "@/components/switch-row"
import { useSettings } from "@/components/use-settings"

export function App() {
  const [current, update] = useSettings()

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
      <footer className="mt-3 flex items-center justify-between text-xs text-neutral-500">
        <button
          type="button"
          className="font-medium text-neutral-700 hover:underline dark:text-neutral-300"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          Options
        </button>
        <span>
          Ratings by{" "}
          <a
            href="https://www.omdbapi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            OMDb
          </a>
        </span>
      </footer>
    </main>
  )
}
