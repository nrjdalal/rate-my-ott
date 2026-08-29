# Node API index

Per-file inventory of every Node built-in used in the repo, for the [`runtime-apis`](SKILL.md) skill.
Snapshot: 2026-08-23. Regenerate with the `rg "node:..."` command in `SKILL.md`.

The `Runtime` column drives the rule: **Node**, **Both** and **Build** files stay on `node:` (no `Bun.*`);
**Bun** files may move a call to a `Bun.*` equivalent where one exists. `web/next` is **Both**: `next dev`
runs under the system Node while Docker and Vercel serve it under Bun.

| File | Runtime | `node:` modules (APIs used) |
| --- | --- | --- |
| `.github/scripts/compress-images.ts` | Bun | `node:path` (path) |
| `.github/scripts/docs.ts` | Bun | `node:path` (path) |
| `.github/scripts/skills-manager.ts` | Bun | `node:crypto` (createHash); `node:path` (path) |
| `.github/workflows/auto-labeler.yml` | Node | `node:fs`, `node:path` (via `require`, `actions/github-script`) |
| `packages/env/src/load-dotenv.ts` | Both | `node:path` (path) |
| `packages/env/tsdown.config.ts` | Build | `node:child_process` (execSync) |
| `web/next/src/app/layout.tsx` | Both | `node:fs` (existsSync); `node:path` (join) |

## Convertible to `Bun.*` (Bun-only files)

Nothing remains. What is left on a Bun-only file is `node:path`, `node:os`, or the directory half of `node:fs`, which Bun's
own docs route to `node:` ("for operations they don't cover, such as `mkdir` or `readdir`, use `node:fs`"),
plus one deliberate keep: `skills-manager.ts`'s `createHash` mirrors the ZeroStarter CLI's (Node) ledger digest line for line.
