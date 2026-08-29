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
| The scan loop: observe the page, batch titles, paint answers | `entrypoints/netflix.content.ts` |
| The badge and panel styles injected into netflix.com | `assets/netflix.css` (every rule prefixed `rmo-`; no Tailwind, no reset, nothing that restyles the page) |
| The only place that talks to the API, with a session cache | `entrypoints/background.ts` |
| The typed client and `unwrap` | `utils/api.ts` |
| The message protocol between page, popup/options, and background | `utils/messages.ts` |
| Settings (API URL, toggles), synced storage | `utils/settings.ts` |
| Popup and options UI (Tailwind, no shadcn) | `entrypoints/popup/`, `entrypoints/options/`, `components/` |
| Manifest, permissions, dev port, icons | `wxt.config.ts` (icons come from `assets/icon.svg` via `@wxt-dev/auto-icons`) |

The API URL is baked at build from the repo-root `.env` (`WXT_PUBLIC_API_URL`, read by `wxt.config.ts` through `@packages/env/load-dotenv` and validated by `@packages/env/extension-wxt`) and becomes both the default in settings and the `host_permissions` entry; a dev build also holds `http://localhost/*` and `http://*.localhost/*`, so the options page can switch between the fixed port and the portless URL without a rebuild. Content scripts have only the page's permissions, so all fetching stays in the background.

## Build and load

```bash
bun run dev                                  # web + api + extension in watch mode to .output/chrome-mv3-dev (no browser is launched)
cd extension/wxt && bun run build            # production build to .output/chrome-mv3
cd extension/wxt && bun run build:firefox    # .output/firefox-mv3
cd extension/wxt && bun run zip              # store package
```

Chrome: `chrome://extensions`, Developer mode, Load unpacked, pick `extension/wxt/.output/chrome-mv3-dev` (a dev build) or `.output/chrome-mv3` (a production build). After an edit, WXT rebuilds; click the extension's reload icon (or `Alt+R` on a Netflix tab) to pick it up. To have WXT launch a Chrome profile for you, add a gitignored `web-ext.config.ts` next to `wxt.config.ts` with `disabled: false` and a `chromiumProfile`.

## Verify a change

1. `bun run check-types` (runs `wxt prepare`, then `tsc`) and `bun run test` (the DOM helpers against the fixtures).
2. Build, then read `.output/chrome-mv3/manifest.json` (`chrome-mv3-dev` for a dev build): the name, the `storage` permission, the API host permission, and the `*://*.netflix.com/*` content script with its CSS.
3. Netflix needs an account, so the scanner cannot be driven headlessly here. Load the build into your own Chrome, open Netflix, and check: a badge in the top-left of each card, the ratings row under a title's metadata when you open it, and the popup toggles taking effect without a reload. `console.warn("[rate-my-ott]", ...)` on the Netflix tab names an API failure.
4. If cards get no badge: the options page's **Test** button tells whether the API is reachable from the background; if it is, check `utils/netflix.ts` selectors against the current Netflix DOM (`.title-card` / `a.slider-refocus[aria-label]` / `.fallback-text`) and add the new one to the fixture test first.

## Notes

- `wxt prepare` writes `.wxt/` (gitignored) with the tsconfig the extension and its tests extend; run it (or `check-types`) on a fresh checkout before `tsc`.
- `imports: false` in `wxt.config.ts`: import WXT APIs explicitly (`wxt/browser`, `wxt/utils/storage`, `wxt/utils/define-content-script`), nothing is a global.
- The manifest description is `site.description` cut to Chrome's 132-character cap; keep the site description short enough that the cut does not land mid-word.
