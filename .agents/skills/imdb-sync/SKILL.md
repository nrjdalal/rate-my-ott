---
name: imdb-sync
description: Build, refresh, or debug the IMDb index (imdb_title, imdb_name) that answers every rating. Use when the API answers 503 or found=false for a title that exists, when changing how a title is matched, or when running or scheduling `bun run imdb:sync`.
source: local
---

# The IMDb index

Every rating the API serves comes from IMDb's daily datasets (https://datasets.imdbws.com, `title.basics` and `title.ratings`), imported into two tables by `api/hono/src/jobs/imdb-sync.ts`. There is no third-party ratings API and no cache in front of the index: a lookup is one indexed query plus pure matching.

## Where things are

| Concern                                              | File                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tables (`imdb_title`, `imdb_name`)                   | `packages/db/src/schema/imdb.ts`                                                                             |
| Dataset parsing, the keep filter, name keys, matching | `api/hono/src/lib/imdb.ts` (pure; tested by `tests/api/hono/src/lib/imdb.test.ts`)                          |
| Query keys, spelling variants, batch alignment       | `api/hono/src/lib/lookup.ts` (pure; tested by `tests/api/hono/src/lib/lookup.test.ts`)                       |
| The lookup (one query for a batch, then matching)    | `api/hono/src/lib/ratings.ts`                                                                                |
| The sync job                                         | `api/hono/src/jobs/imdb-sync.ts`, `bun run imdb:sync` at the root, `.github/workflows/auto-imdb-sync.yml`    |
| The dataset origin                                   | `IMDB_DATASETS_URL` in `packages/env/src/api-hono.ts` (default `https://datasets.imdbws.com`)                |

## Running it

```bash
bun run db:migrate          # once, the tables
bun run imdb:sync           # downloads ~235 MB gzipped, writes the index, prunes what left; minutes, not hours
```

The job is safe to rerun: titles are upserted and only rows whose values changed are written, spellings are added on conflict-do-nothing and the ones a renamed title no longer answers to are deleted (`staleNames`), and titles the dataset no longer lists are deleted (their names follow by cascade). Two guards: a rebuild that would shrink the index by half or more refuses to prune (a truncated download), and more than 1.5 million kept titles stops the job before the free Neon branch (512 MB) fills.

In production the `auto-imdb-sync` workflow runs it daily at 14:30 UTC (IMDb refreshes around 12:30 UTC) with the `POSTGRES_URL` repository secret; `gh workflow run auto-imdb-sync.yml` runs it now, `gh run list --workflow=auto-imdb-sync.yml -L 1` shows the last run. Until the first run the API answers `503 SERVICE_UNAVAILABLE`.

To test the job without IMDb, serve a directory holding a small `title.basics.tsv.gz` and `title.ratings.tsv.gz` over HTTP (a few lines of `Bun.serve` returning `Bun.file`) and run `IMDB_DATASETS_URL=http://localhost:5598 bun run imdb:sync` against the local container, twice with different "nights" (votes moved, a title left, one arrived, one renamed) to see the update, the prune, and a rerun that writes nothing (`pg_stat_user_tables`). A fixture needs the header line and `\N` for nulls, exactly as IMDb writes them. The pure pieces (`staleNames`, `shouldPrune`, the parsers) are covered in `tests/api/hono/src/lib/imdb.test.ts`.

## What is kept

`keepTitle` in `lib/imdb.ts`: kinds `movie`, `tvMovie`, `tvSpecial`, `short`, `video` (a film to the platform) and `tvSeries`, `tvMiniSeries` (a series), not adult, with a name, and either rated or from this year or last (an unrated old title is never behind a card); a short or a video only with 100+ votes. Episodes and games are left out; so are alternate and localized names (`title.akas`, 512 MB gzipped, to be filtered on import), which is the next step: IMDb renames titles ("Dune" became "Dune: Part One" under both its names, so Netflix's "Dune" now misses) and brands them differently ("Marvel's Daredevil" is "Daredevil"), and `imdb_name` takes any number of spellings per title without a schema change.

## How a title is matched

`resolveTitle` and `pickImdbTitle` in `lib/imdb.ts`, on the candidates whose name key (`searchKey`: case, width, diacritics, punctuation, and `&` folded) equals a spelling of the platform's title (`titleSpellings`: as given, without a parenthetical, without a subtitle), stopping at the first spelling any candidate fits:

1. Filter: the kind must agree; a film's year within one of its release; a series when the stated year falls inside its run, a year either side (Netflix states a show's latest season), where a run with no end year reaches the present only for a show with 1,000+ votes; a film's runtime within five minutes when both are known. Under the unsubtitled spelling the year must match exactly, so a spin-off never inherits its parent's score.
2. Nothing is taken without a stated year. Once any candidate can be verified by what was stated, unverifiable ones (no year, no runtime) drop out, but still veto a pick they out-vote three to one. A film and a series of one name with no kind stated are an ambiguity.
3. One left: the answer. Several: ranked by closest runtime (a film), then votes, and taken only when the runtime is closer by three minutes or more, or the top has 100+ votes, three times the runner-up's, which never counts under the unsubtitled spelling nor while a candidate in the running is too new to have earned its votes (unrated, or under 100 votes and from this year or last).

A wrong score is worse than none, so every ambiguity is a miss (`found: false`). When a real title misses, reproduce it with `GET /api/v1/ratings?title=...&type=...&year=...&runtime=...` against the local API, check what the index holds (`select * from imdb_name join imdb_title on title_id = id where key = '...'`), and add the case to `imdb.test.ts` before changing a rule.
