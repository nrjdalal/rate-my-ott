---
name: extension-dev
description: "Build, load, and verify the browser extension (extension/wxt), and find where its Netflix scanner, background worker, and popup/options live. Use when changing anything under extension/wxt, or when badges do not appear on Netflix."
source: local
---

# Extension Dev

`extension/wxt` is a WXT (Vite) extension with React for its popup and options page. It has no server: the background worker calls the Ratings API (`POST /api/v1/ratings`) through the same `hc<AppType>` client the web app uses, so the request and response types come from `api/hono`.

## Where things live

| Concern | File |
| --- | --- |
| Which Netflix nodes are titles, and how a badge/panel is drawn | `utils/netflix.ts` (pure DOM functions; tested from `tests/extension/wxt/utils/netflix.test.ts` in happy-dom) |
| A card's year, kind, and runtime, read from React's fiber props in the page's own world and stamped on the card as `data-rmo-*` | `entrypoints/netflix-entities.content.ts` (`world: "MAIN"`, no extension APIs) over `utils/netflix-props.ts` (pure; tested with a fake fiber chain) |
| The scan loop: observe the page, batch titles, paint answers | `entrypoints/netflix.content.ts` |
| The badge and panel styles injected into netflix.com | `assets/netflix.css` (every rule prefixed `rmo-`; no Tailwind, no reset, nothing that restyles the page) |
| The only place that talks to the API, with a session cache | `entrypoints/background.ts` |
| The typed client and `unwrap` | `utils/api.ts` |
| The message protocol between page, popup/options, and background | `utils/messages.ts` |
| Settings (API URL, on/off switches), synced storage | `utils/settings.ts` |
| Popup and options UI (Tailwind, no shadcn) | `entrypoints/popup/`, `entrypoints/options/`, `components/` |
| Manifest, permissions, dev port, icons | `wxt.config.ts` (icons come from `assets/icon.svg` via `@wxt-dev/auto-icons`) |

The API URL is baked at build from the repo-root `.env` (`WXT_PUBLIC_API_URL`, read by `wxt.config.ts` through `@packages/env/load-dotenv` and validated by `@packages/env/extension-wxt`) and becomes both the default in settings and the `host_permissions` entry; a dev build also holds `http://localhost/*` and `http://*.localhost/*`, so the options page can switch between the fixed port and the portless URL without a rebuild. Content scripts have only the page's permissions, so all fetching stays in the background.

## Build and load

```bash
bun run dev                                  # web + api + extension in watch mode to .output/chrome-mv3-dev (no browser is launched)
cd extension/wxt && bun run build            # production build to .output/chrome-mv3
cd extension/wxt && bun run build:firefox    # .output/firefox-mv3
cd extension/wxt && bun run zip              # rate-my-ott-<version>-chrome.zip in .output/ (version = root package.json)
```

Chrome: `chrome://extensions`, Developer mode, Load unpacked, pick `extension/wxt/.output/chrome-mv3-dev` (a dev build) or `.output/chrome-mv3` (a production build). After an edit, WXT rebuilds; click the extension's reload icon (or `Alt+R` on a Netflix tab) to pick it up. To have WXT launch a Chrome profile for you, add a gitignored `web-ext.config.ts` next to `wxt.config.ts` with `disabled: false` and a `chromiumProfile`.

## Releases

The release workflow (`.github/workflows/auto-release.yml`, on a canary-to-main merge) builds `bun run zip` and `zip:firefox` with `WXT_PUBLIC_API_URL` from the repo variable of that name (the production API) and uploads both zips to the GitHub release; the manifest version comes from the root `package.json`, which the same flow bumps. A local production zip is the same two commands with the URL set inline.

## Verify a change

1. `bun run check-types` (runs `wxt prepare`, then `tsc`) and `bun run test` (the DOM helpers against the fixtures).
2. Build, then read `.output/chrome-mv3/manifest.json` (`chrome-mv3-dev` for a dev build): the name, the `storage` permission, the API host permission, and the `*://*.netflix.com/*` content script with its CSS.
3. Netflix needs an account, so the scanner is driven in a headed `agent-browser` with a persistent, logged-in profile. Start with `agent-browser close --all`, then export the four variables so every command (not only `open`) carries them; a daemon started by a command without them launches Chrome without the extension:

```bash
export AGENT_BROWSER_SESSION=rmo AGENT_BROWSER_HEADED=1 AGENT_BROWSER_PROFILE=~/.agent-browser/profiles/rate-my-ott-netflix AGENT_BROWSER_EXTENSIONS=$PWD/extension/wxt/.output/chrome-mv3
agent-browser open https://www.netflix.com/browse && agent-browser wait 10000
agent-browser eval "JSON.stringify({ stamped: document.querySelectorAll('[data-rmo-meta]').length, badges: document.querySelectorAll('.rmo-badge').length })"
```

An unpacked extension is read at launch, so a rebuild needs `agent-browser close --all` and a fresh `open`. Check the home page (current `jbv` cards) and a genre page such as `/browse/genre/83` (legacy `.title-card` markup, read through its `videoModel`): stamps on every card, a badge on every card the index matches, an "IMDb:" row in a title's details column (beside Cast and Genres) when you open it, and the popup switches taking effect without a reload. `console.warn("[rate-my-ott]", ...)` on the Netflix tab names an API failure; a `400` for a whole batch means one title broke the route's validation.
4. If cards get no badge: the options page's **Test** button tells whether the API is reachable from the background; if it is, check `utils/netflix.ts` against the current Netflix DOM and add the new shape to the fixture test first. As of 2026-08 a card is `a[data-uia="standard-card"|"ranked-card"|"progress-card"][aria-label][href="/browse?jbv=<id>"]` wrapping an `<img>` in a plain div (class names are Emotion hashes, only `data-uia` and the semantic `tracked-card` classes are stable), and the open title modal is `.previewModal--container` with `[data-uia="videoMetadata--container"]` (`.year`, `.duration`) and `?jbv=<id>` in the URL naming the card it came from. The legacy `.title-card` / `a.slider-refocus` / `.fallback-text` markup (genre pages) is still supported, and its React `videoModel` prop (`releaseYear`, `summary.type`, `summary.id`) is where the stamper reads its year and kind. A card's year, kind, and runtime are not in its markup at all: the MAIN-world script reads them from the card's React fiber (the card props carry `videoId` + `title`, the row props carry `sectionFragment.entities.edges[].node.unifiedEntity` with `__typename` Movie/Show, `releaseYear`, `runtimeSec`) and stamps `data-rmo-meta`, `data-rmo-year`, `data-rmo-type`, `data-rmo-runtime`; the scanner asks only once a card is stamped with a year (the API matches nothing without one) and the API uses kind, year, and runtime to reject a same-name stranger (the 2026 "Alpha" on Netflix is Alia Bhatt's, not Julia Ducournau's); a stamp must name the card's own video id, so a row's or billboard's model above it is ignored.
5. Verify with a production build (`bun run build`, load `.output/chrome-mv3`). The dev build registers its content script at runtime and, after WXT reloads the extension on a rebuild, the script did not run again on a reloaded Netflix tab in testing (no badge, and `.rmo-badge` had no CSS), so a missing badge on a dev build is not evidence of a scanner bug.

## Notes

- `wxt prepare` writes `.wxt/` (gitignored) with the tsconfig the extension and its tests extend; run it (or `check-types`) on a fresh checkout before `tsc`.
- `imports: false` in `wxt.config.ts`: import WXT APIs explicitly (`wxt/browser`, `wxt/utils/storage`, `wxt/utils/define-content-script`), nothing is a global.
- The manifest description is `site.description` cut to Chrome's 132-character cap; keep the site description short enough that the cut does not land mid-word.
- A headed, logged-in Netflix for checks: the recipe in step 3 of Verify (close every session first, export the four variables, sign in by hand the first time). Run the API on the baked port for it: `cd api/hono && SKIP_ENV_VALIDATION_SERVER=true bun src/index.ts` (port 4000 from `.env`). The background remembers a found answer for 12 hours and a miss for 10 minutes per browser session; a Chrome restart clears both.
