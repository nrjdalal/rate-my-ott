import { site } from "@packages/config/site"
import { useState } from "react"
import { browser } from "wxt/browser"

import { useSettings } from "@/components/use-settings"
import type { HealthReply, Message } from "@/utils/messages"
import { DEFAULT_SETTINGS } from "@/utils/settings"

type Probe =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; version: string }
  | { message: string; state: "failed" }

export function App() {
  const [current, update] = useSettings()
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  const [probe, setProbe] = useState<Probe>({ state: "idle" })
  const draft = apiUrl ?? current?.apiUrl ?? ""
  const dirty = current !== null && draft !== current.apiUrl

  const save = async () => {
    let origin: string
    try {
      origin = new URL(draft).origin
    } catch {
      setProbe({ message: "Enter a full URL, like http://localhost:4000", state: "failed" })
      return
    }
    await update({ apiUrl: origin })
    setApiUrl(null)
    setProbe({ state: "idle" })
  }

  // Asks the background, which is the context holding the host permission, so the check exercises the same path the lookups take.
  const test = async () => {
    if (dirty) await update({ apiUrl: draft })
    setProbe({ state: "checking" })
    const message: Message = { type: "api:health" }
    const reply = (await browser.runtime.sendMessage(message)) as HealthReply
    setProbe(
      reply.error
        ? { message: reply.error, state: "failed" }
        : { state: "ok", version: reply.version ?? "" },
    )
  }

  return (
    <main className="mx-auto max-w-xl p-8 text-neutral-900 dark:text-neutral-100">
      <h1 className="text-xl font-semibold">{site.name} options</h1>
      <p className="mt-1 text-sm text-neutral-500">{site.description}</p>

      {current ? (
        <div className="mt-8 flex flex-col gap-8">
          <section aria-labelledby="api" className="flex flex-col gap-3">
            <h2 id="api" className="text-sm font-semibold">
              API
            </h2>
            <p className="text-xs text-neutral-500">
              Where ratings are fetched from. The default is baked in at build time; point it at a
              dev server (the portless URL, or the fixed port) or at your own deployment.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                aria-label="API URL"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                value={draft}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder={DEFAULT_SETTINGS.apiUrl}
              />
              <button
                type="button"
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                disabled={!dirty}
                onClick={save}
              >
                Save
              </button>
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
                onClick={test}
              >
                Test
              </button>
            </div>
            <p className="text-xs" role="status">
              {probe.state === "checking" && <span className="text-neutral-500">Checking…</span>}
              {probe.state === "ok" && (
                <span className="text-green-600">Connected, API {probe.version}</span>
              )}
              {probe.state === "failed" && <span className="text-red-600">{probe.message}</span>}
            </p>
          </section>

          <button
            type="button"
            className="self-start text-xs text-neutral-500 hover:underline"
            onClick={() => {
              setApiUrl(null)
              update(DEFAULT_SETTINGS)
            }}
          >
            Reset to defaults
          </button>
        </div>
      ) : (
        <p className="mt-8 text-sm text-neutral-500">Loading…</p>
      )}
    </main>
  )
}
