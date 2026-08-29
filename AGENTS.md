# AGENTS.md

Guidance for AI coding agents working in this repository: a Bun + Turborepo monorepo built on ZeroStarter, with the Ratings API (`api/hono`), the browser extension (`extension/wxt`), the website (`web/next`), and shared `packages/*` (config, db, env). Start each task with the `codebase-map` skill to orient, then load the task skill that fits (see [Skills](#skills)).

## Instructions

- ALWAYS: Use `@/` for imports, and follow the `design` skill for UI and styling conventions.
- ALWAYS: Keep documentation in sync with every change (`web/next/content/docs/`, `README.md`, the skills under `.agents/skills/`, and this file). See the `doc-sync` skill.
- ALWAYS: Put every test under the repo-root `tests/` directory, mirroring the path of the file it covers (`api/hono/src/lib/omdb.ts` is tested by `tests/api/hono/src/lib/omdb.test.ts`); `bun run test` runs the suite. A test imports by relative path and reaches only pure modules (no env, no database, no extension API), which is why the API keeps its parsing (`lib/omdb.ts`, `lib/lookup.ts`) apart from its fetching (`lib/ratings.ts`), and the extension keeps its DOM work (`utils/netflix.ts`) free of `wxt/*` imports.
- ALWAYS: Read env through the validated `@packages/env/*` entrypoint for the consumer, never `process.env`. A new variable is declared there, mirrored in `turbo.json` `globalEnv` and `.env.example`, and documented in the docs.
- ALWAYS: Show the user a new or altered database schema before generating or applying a migration once `POSTGRES_URL` points at a shared database; local work runs against a disposable container. See the `db-migration` skill.
- ALWAYS: Keep enumerable lists alphabetical (A→Z): env-var schemas and their `turbo.json` mirrors, union and enum members, dependency lists, table columns (`id` in its alphabetical place), and a row's own fields in an API response, where the subject key (`ratings`, `rating`) leads and the rest sort after it.
- ALWAYS: Version every root `catalog` entry with a caret range; `.github/scripts/deps-manager.ts` rewrites the rest on `postinstall`.
- ALWAYS: Prefer a Bun-native API when the file runs under Bun and one exists; otherwise a Node built-in with the `node:` prefix. See the `runtime-apis` skill.
- Do not comment unnecessarily, and keep a comment on a single line.
- NEVER: Include "Co-authored-by" in commit messages.
- NEVER: Use em-dashes (the long dash, U+2014) in code, comments, docs, or copy. Regular hyphens are fine; for a pause or aside, use a comma, colon, or period.

## Skills

Skills live in `.agents/skills` (symlinked to `.claude/skills` and `.github/skills`, so every agent tool reads the same files). Each is a `SKILL.md` with a `description` trigger and a literal procedure. Start with `codebase-map` to orient, then load the task skill that fits.

These tables are generated from each skill's own description by `bun .github/scripts/skills-manager.ts`, which a pre-commit hook runs for you. **Custom** skills are maintained here; **vendored** skills are copied verbatim from an upstream project (re-vendor to update, do not hand-edit).

**Custom**

<!-- skills:custom -->

| Skill                                                    | Description                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [add-package](.agents/skills/add-package/SKILL.md)       | Add a new shared workspace package under packages/*.                                                                                                                                |
| [api-endpoint](.agents/skills/api-endpoint/SKILL.md)     | Add a typed Hono API endpoint or WebSocket route: router, OpenAPI docs, validation envelope, and RPC client wiring.                                                                 |
| [audit](.agents/skills/audit/SKILL.md)                   | Run the dependency security audit and maintain .github/notes/dependencies.md.                                                                                                       |
| [codebase-map](.agents/skills/codebase-map/SKILL.md)     | Orient in this repo: which file to edit for a change, how a change ripples across the stack, and how to search the code.                                                            |
| [db-migration](.agents/skills/db-migration/SKILL.md)     | Create and apply a Drizzle schema change.                                                                                                                                           |
| [design](.agents/skills/design/SKILL.md)                 | Follow and maintain the app's UI conventions.                                                                                                                                       |
| [dev](.agents/skills/dev/SKILL.md)                       | Start, restart, and verify the rate-my-ott dev stack. `bun run dev` serves portless named `.localhost` URLs (branch-prefixed in a worktree); resolve them with `bunx portless get`. |
| [doc-sync](.agents/skills/doc-sync/SKILL.md)             | Sync docs and skills so they never drift from the code.                                                                                                                             |
| [docker-test](.agents/skills/docker-test/SKILL.md)       | Build and smoke-test the Docker images with docker compose.                                                                                                                         |
| [extension-dev](.agents/skills/extension-dev/SKILL.md)   | Build, load, and verify the browser extension (extension/wxt), and find where its Netflix scanner, background worker, and popup/options live.                                       |
| [fonts](.agents/skills/fonts/SKILL.md)                   | Add, swap, or remove a self-hosted web font (latin variable woff2 from fontsource, localized via next/font/local).                                                                  |
| [gh-commit](.agents/skills/gh-commit/SKILL.md)           | Create atomic commits in the conventional format.                                                                                                                                   |
| [icebox](.agents/skills/icebox/SKILL.md)                 | Icebox a raised-but-undecided concern instead of forcing a plan-or-dismiss call: record it with no verdict so the context survives.                                                 |
| [ignore-sync](.agents/skills/ignore-sync/SKILL.md)       | Mirror .gitignore to .dockerignore.                                                                                                                                                 |
| [release](.agents/skills/release/SKILL.md)               | Cut a production release by promoting canary to main.                                                                                                                               |
| [runtime-apis](.agents/skills/runtime-apis/SKILL.md)     | Prefer Bun-native APIs, else Node built-ins with the node: prefix.                                                                                                                  |
| [shadcn-sync](.agents/skills/shadcn-sync/SKILL.md)       | Run and reconcile the shadcn component sync (`bun run shadcn:update`).                                                                                                              |
| [skills-manager](.agents/skills/skills-manager/SKILL.md) | Keep the AGENTS.md skills tables generated from skill descriptions, and understand how a fork syncs its skills from upstream.                                                       |
| [ui-verify](.agents/skills/ui-verify/SKILL.md)           | Verify a frontend or UI change in a real browser.                                                                                                                                   |

<!-- /skills:custom -->

**Vendored** (upstream, copied verbatim)

<!-- skills:vendored -->

| Skill                                                  | Description                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [agent-browser](.agents/skills/agent-browser/SKILL.md) | Browser automation CLI for AI agents.                                                                                    |
| [portless](.agents/skills/portless/SKILL.md)           | Set up and use portless for named local dev server URLs (e.g. https://myapp.localhost instead of http://localhost:3000). |

<!-- /skills:vendored -->
