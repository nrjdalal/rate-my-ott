---
name: db-migration
description: Create and apply a Drizzle schema change. Use when adding or altering tables, columns, or indexes in @packages/db, or when asked for a migration.
source: https://github.com/nrjdalal/zerostarter
---

# Database Migration

PostgreSQL with Drizzle ORM. Schema lives in `packages/db/src/schema/`, migrations in `packages/db/drizzle/`. Schema, SQL, and snapshot travel together in one PR.

## 0. Show the schema and wait

**Never generate or apply a migration before the user has seen the schema and said go.** Post the table or the altered columns, name the choices that are hard to reverse (nullability, what a null means, foreign keys and their delete behaviour, indexes, whether anything is derived or generated, retention), and stop there.

Two reasons this is a hard stop rather than a courtesy. A shape is cheap to argue about and expensive to change once rows exist, so the review has to happen before the write. And when `canary` and production share one database, applying reaches production the moment it runs, not when the release ships.

## 1. Edit the schema

- Schema files group by concern, not one per table. A new table joins the file for its concern, or starts a new one when it is a new concern, and that file needs an export from `index.ts`: `export * from "@/schema/<name>"`. Miss that export and the table never reaches a migration.
- Conventions: `text` primary keys (`.$defaultFn(() => crypto.randomUUID())`), `timestamp("created_at").defaultNow().notNull()`, snake_case columns, `onDelete: "cascade"` on FKs, and an `index()` on every FK column. Both bend for the same kind of column: use `onDelete: "set null"` when the row outlives the reference and the column is only provenance, and skip the index when nothing queries by it and the table is small enough that the delete-time scan is free. Index a FK when a query narrows on the column itself, or when the table is large enough for the sweep to matter. When a `set null` column is the only record of who acted, store the readable text beside it so a row does not become anonymous.
- Keep column definitions A→Z inside a table, with `id` in its alphabetical place; a unique natural key gets `.unique()`, and an upsert targets it with `onConflictDoUpdate`. `ratings.ts` (the `rating` cache table) is the worked example.

## 2. Generate and review

```bash
bun run db:generate
```

Read the generated `packages/db/drizzle/NNNN_*.sql`. Done when that SQL, its `meta/NNNN_snapshot.json`, and a new `meta/_journal.json` entry all appear and the SQL matches the schema edit.

## 3. Point at a throwaway database first

**Local work runs against a disposable container, never a shared `POSTGRES_URL`.** Once the root `.env` points at a hosted database that `canary` and production both read, a migration applied there is applied to production, and a column renamed under running code takes that code down. The `POSTGRES_URL` that `init` wrote is a local pglaunch container, which is exactly this.

```bash
bunx pglaunch -k                                    # disposable Postgres, -k keeps it across restarts
```

Put the URL it prints in the worktree's own `.env` as `POSTGRES_URL`, then migrate and seed into it. One container per worktree, so two branches with different migrations cannot corrupt each other. Two things follow:

- Seed your own fake rows rather than copying real ones. The shared database holds real people, and a screenshot or a response body from it must never reach a PR.
- Applying to the shared database is a deliberate, separately-authorized act. It happens when the change merges, not while it is being built.

## 4. Apply

```bash
bun run db:migrate
```

This is local or ad-hoc only. On production and canary deploys the API build auto-applies pending migrations (`.github/scripts/migrate-on-deploy.ts`, gated on `VERCEL_ENV`/`VERCEL_GIT_COMMIT_REF`, PR previews skipped), so a migration merged to canary applies itself on the next deploy.

## 5. Make the running stack see it

```bash
bunx turbo run build --filter=@packages/db
```

The API consumes `@packages/db`'s built dist. If dev is running and the API imports the new table, restart dev entirely: `bun --hot` does not pick up new files or exports reliably (see the `dev` skill).

## 6. Inspect data

```bash
bun run db:studio
```

## Notes

- `POSTGRES_URL` comes from the root `.env`, which is why step 3 overrides it per worktree once that value points at a shared database.
- Never edit an applied migration; generate a new one instead.
