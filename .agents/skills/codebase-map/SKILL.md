---
name: codebase-map
description: "Orient in this repo: which file to edit for a change, how a change ripples across the stack, and how to search the code. Use at the start of a task in an unfamiliar area, or before a cross-cutting change."
source: https://github.com/nrjdalal/zerostarter
---

# Codebase Map

One Bun + Turborepo monorepo (built on ZeroStarter): the Ratings API, the browser extension, and the website over shared packages. Imports use `@api/hono`, `@packages/*`, and the `@/` alias, never deep relative paths.

```
api/hono/         # the Ratings API (Hono): routers, middlewares, the AppType export; lib/omdb.ts + lib/ratings.ts are the provider and its cache
extension/wxt/    # the browser extension (WXT, React): entrypoints/ (netflix content script, background, popup, options), utils/netflix.ts (DOM)
web/next/         # the website (Next.js App Router): app/, components/, lib/, content/ (MDX docs)
packages/db/      # Drizzle schema (the rating cache table) + client (PostgreSQL via Bun's SQL driver)
packages/env/     # type-safe env, one validated entry per consumer
packages/config/  # TS base, tsdown factory, and site.ts (brand identity + feature flags)
```

Read `AGENTS.md` first for the rules; `curl "$(bunx portless get rate-my-ott)/llms-full.txt"` dumps the docs as one context file.

## Where to edit for X

| Goal | Edit here | Then |
| --- | --- | --- |
| Add/change an API route | `api/hono/src/routers/<name>.ts` → export from `routers/index.ts` → mount in `src/index.ts` `.route()` chain (app routes live under `v1.ts`) | `api-endpoint` skill |
| Change the database schema | `packages/db/src/schema/<name>.ts` → export from `schema/index.ts` | `db-migration` skill |
| Add/change a page | `web/next/src/app/`: `page.tsx` is the home, `(content)/docs` the MDX docs | `design` skill |
| Add/customize a UI component | `web/next/src/components/`: `ui/` is generated shadcn, don't hand-edit | `design`, `shadcn-sync` skills |
| Call the API from the web app | `web/next/src/lib/api/client.ts` (`apiClient`, `unwrap`) | - |
| Call the API from the extension | `extension/wxt/entrypoints/background.ts` via `utils/api.ts` (`createApiClient`, `unwrap`); the page asks the background with `utils/messages.ts` | `extension-dev` skill |
| Change what the extension shows on Netflix | `extension/wxt/utils/netflix.ts` (which nodes, what is drawn), `entrypoints/netflix.content.ts` (the scan loop), `assets/netflix.css` | `extension-dev` skill |
| Change or add a ratings provider | `api/hono/src/lib/omdb.ts` (pure parsing) and `lib/ratings.ts` (fetch + cache); the env for it in `packages/env/src/api-hono.ts` | `api-endpoint` skill |
| Rebrand (name, description, socials) or flip a feature flag | `packages/config/src/site.ts`, one file (the extension manifest reads it too) | - |
| Add or read an env var | `packages/env/src/{api-hono,db,web-next}.ts` (`extension-wxt.ts` for a `WXT_PUBLIC_*` the extension bakes in); read via `@packages/env/*`, never `process.env`; mirror it in `turbo.json` `globalEnv` and `.env.example`. The root `.env` is loaded by `src/load-dotenv.ts`, which the server targets import and neither `web-next` nor the package index does; a new server target imports `@/load-dotenv` first | - |
| Change the error/response shape | `api/hono/src/lib/error.ts` (the `{ error: { code, message } }` handler) | - |
| Change docs structure/sidebar | `web/next/docs.config.ts`, single source; `meta.json` is generated | - |
| Add a build or tooling script | `.github/scripts/<name>.ts` (Bun; type-checked by `check-types:scripts`) | `runtime-apis` skill |

## Trace a feature across the stack

Types flow downhill, so a change ripples predictably:

```
packages/db/src/schema  →  api/hono/src/routers  →  api/hono/src/index.ts (AppType)  →  web/next/src/lib/api/client.ts, extension/wxt/utils/api.ts  →  pages / content script
```

To add a field end to end: edit and migrate the schema, then select and return it in the router. Every `apiClient` call site is retyped automatically, and the compiler becomes your worklist of what still must change.

## Entry points (read these first)

- `api/hono/src/index.ts`, the `.route()` chain and `export type AppType`, the whole API shape in one file.
- `web/next/src/app/layout.tsx`, the web root.
- `extension/wxt/wxt.config.ts`, the manifest, permissions, and where the API URL comes from.
- `packages/config/src/site.ts`, brand identity, feature flags, and injectable content.

## Fast find

```bash
rg -n "\.route\(" api/hono/src/index.ts               # every mounted router
rg -n "export const \w+Router" api/hono/src/routers   # every router definition
ls packages/db/src/schema                             # every schema file (tables)
rg -n "apiClient\." web/next/src                      # every API call site in the web app
rg -n "rmo-" extension/wxt                            # every class the extension paints onto Netflix
rg -n "SOME_ENV_VAR" packages/env                     # where an env var is declared
ls .agents/skills                                     # every task skill available
```

## Then

Load the task skill (the table's right column); `dev` runs and restarts the stack, and concept docs live under `/docs`.
