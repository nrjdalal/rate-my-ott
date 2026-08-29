# Rate My OTT

> IMDb, Rotten Tomatoes, and Metacritic ratings on every title while you browse Netflix, with more streaming platforms to come.

A browser extension plus the small API behind it, built on [ZeroStarter](https://zerostarter.dev). The extension reads the titles Netflix renders, asks the Ratings API in batches, and paints an IMDb badge on every card and a ratings row in the title modal. The API answers from a Postgres cache and asks [OMDb](https://www.omdbapi.com) only for titles it has not seen.

## Monorepo structure

```
.
├── api/hono/        # Ratings API (Hono): POST /api/v1/ratings over a Postgres cache, OMDb behind it; Scalar reference at /api/docs
├── extension/wxt/   # Browser extension (WXT + React): Netflix content script, background worker, popup, options page
├── web/next/        # Website (Next.js App Router): landing page + MDX docs
└── packages/
    ├── config/      # site.ts (brand identity + feature flags), TS/tsdown bases
    ├── db/          # Drizzle schema (the `rating` table) + migrations
    └── env/         # Type-safe env, one validated entry per consumer
```

Types flow from the API to both clients: the extension and the web app call it through `hc<AppType>`, so a change to the ratings route retypes every caller.

## Quick start

```bash
# 1. an OMDb key (https://www.omdbapi.com/apikey.aspx) in the repo-root .env
OMDB_API_KEY=your-key

# 2. install, migrate (POSTGRES_URL is set by `zerostarter init`, or set it yourself), run
bun install
bun run db:migrate
bun run dev
```

`bun run dev` serves the web app and the API on named portless `.localhost` URLs (`bunx portless list`) and builds the extension in watch mode into `extension/wxt/.output/chrome-mv3-dev`. Load that directory in Chrome (`chrome://extensions`, Developer mode, Load unpacked), open the extension's Options page, and point it at the API URL portless printed. `PORTLESS=0 bun run dev` uses fixed ports instead (web `:3000`, API `:4000`, which is also the extension's baked-in default).

📖 [Install guide](web/next/content/docs/getting-started/install.mdx) · [Ratings API](web/next/content/docs/getting-started/ratings-api.mdx)

## Scripts

| Command                           | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| `bun run dev`                     | Web + API on portless URLs, extension in watch mode             |
| `bun run build`                   | Build every workspace (the extension into `.output/chrome-mv3`) |
| `bun run check-types`             | Type-check every workspace, the scripts, and the tests          |
| `bun run test`                    | Build the packages, then run the suite in `tests/`              |
| `bun run lint` / `bun run format` | Lint with Oxlint / format with Oxfmt                            |
| `bun run db:generate`             | Generate a Drizzle migration from the schema                    |
| `bun run db:migrate`              | Apply pending migrations                                        |
| `bun run db:studio`               | Open Drizzle Studio                                             |
| `bun run shadcn:update`           | Update shadcn/ui components                                     |
| `cd extension/wxt && bun run zip` | Pack the extension for the store                                |

## Releases

Promoting `canary` to `main` cuts a release (changelog, version bump, GitHub release), and the release workflow attaches the extension zips built against the production API: `rate-my-ott-<version>-chrome.zip` and `-firefox.zip`, on [releases/latest](https://github.com/nrjdalal/rate-my-ott/releases/latest). The extension's manifest version is the repo version, so a zip, the changelog, and a store listing agree.

## Deployment

The web app and the API deploy like any ZeroStarter fork: two Vercel projects sharing one Postgres (the API runs pending migrations on deploy), or `docker compose up --build` for both. Set `WXT_PUBLIC_API_URL` to the deployed API origin before `bun run build` so the extension is granted that host and calls it by default.

Ratings data is from OMDb under CC BY-NC 4.0, which suits a personal build; a commercial release needs a paid OMDb tier or another provider behind `api/hono/src/lib/omdb.ts`.

## License

MIT
