---
name: imdb-sync
description: Build, refresh, or debug the IMDb index (imdb_title, imdb_name) that answers every rating. Use when the API answers 503 or found=false for a title that exists, when changing how a title is matched, or when running or scheduling `bun run imdb:sync`.
source: local
---

# The IMDb index

Every rating the API serves comes from IMDb's daily datasets (https://datasets.imdbws.com: `title.basics`, `title.ratings`, and `title.akas` for alternate names), imported into two tables by `api/hono/src/jobs/imdb-sync.ts`, which records each rebuild in a third. There is no third-party ratings API and no cache in front of the index: a lookup is one indexed query plus pure matching.

## Where things are

| Concern                                              | File                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tables (`imdb_title`, `imdb_name`, `imdb_sync`)      | `packages/db/src/schema/imdb.ts`                                                                             |
| Dataset parsing, the keep filter, name keys, matching | `api/hono/src/lib/imdb.ts` (pure; tested by `tests/api/hono/src/lib/imdb.test.ts`)                          |
| Query keys, spelling variants, batch alignment       | `api/hono/src/lib/lookup.ts` (pure; tested by `tests/api/hono/src/lib/lookup.test.ts`)                       |
| The lookup (one query for a batch, then matching)    | `api/hono/src/lib/ratings.ts`                                                                                |
| The sync job                                         | `api/hono/src/jobs/imdb-sync.ts`, `bun run imdb:sync` at the root, `.github/workflows/auto-imdb-sync.yml`    |
| The dataset origin                                   | `IMDB_DATASETS_URL` in `packages/env/src/api-hono.ts` (default `https://datasets.imdbws.com`)                |

## Running it

```bash
bun run db:migrate          # once, the tables
bun run imdb:sync           # downloads ~750 MB gzipped (basics, ratings, akas), writes the index, prunes what left; minutes, not hours
```

The job reads and parses all three datasets before it opens its transaction (the database client closes a connection idle for thirty seconds, which streaming the alternate names alone would exceed), then writes everything in one transaction, so a night lands whole or not at all (a failed download leaves the previous index serving), and it runs without parallel workers (`set local max_parallel_workers_per_gather = 0`): on Neon's smallest compute a parallel scan cannot allocate its dynamic shared memory once the table has grown ("could not resize shared memory segment"). It is safe to rerun: titles are upserted and only rows whose values changed are written, spellings are upserted (a name that turns from own to alternate, or back, has its `aka` flag rewritten) and the ones a renamed title no longer answers to are deleted (`staleNames`), and titles the dataset no longer lists are deleted (their names follow by cascade). Two guards: a rebuild that would shrink the index by half or more refuses to prune (a truncated download), and more than 1.5 million kept titles stops the job before the free Neon branch (512 MB) fills.

In production the `auto-imdb-sync` workflow runs it daily at 14:30 UTC (IMDb refreshes around 12:30 UTC) with the `POSTGRES_URL` repository secret; `gh workflow run auto-imdb-sync.yml` runs it now, `gh run list --workflow=auto-imdb-sync.yml -L 1` shows the last run, and `GET /api/v1/ratings/status` (the newest `imdb_sync` row, written inside the rebuild's transaction) says what is serving and how fresh it is; the extension's popup shows the same line. Until the first run the API answers `503 SERVICE_UNAVAILABLE` and the popup says the index has not been built.

To test the job without IMDb, serve a directory holding a small `title.basics.tsv.gz`, `title.ratings.tsv.gz`, and `title.akas.tsv.gz` (the job fails on a missing file) over HTTP (a few lines of `Bun.serve` returning `Bun.file`) and run `IMDB_DATASETS_URL=http://localhost:5598 bun run imdb:sync` against the local container, twice with different "nights" (votes moved, a title left, one arrived, one renamed) to see the update, the prune, and a rerun that writes nothing (`pg_stat_user_tables`). A fixture needs the header line and `\N` for nulls, exactly as IMDb writes them. The pure pieces (`staleNames`, `shouldPrune`, the parsers) are covered in `tests/api/hono/src/lib/imdb.test.ts`.

## What is kept

`keepTitle` in `lib/imdb.ts`: kinds `movie`, `tvMovie`, `tvSpecial`, `short`, `video` (a film to the platform) and `tvSeries`, `tvMiniSeries` (a series), not adult, with a name, and either rated or from this year or last (an unrated old title is never behind a card); a short or a video only with 100+ votes. Episodes and games are left out. Alternate names (`title.akas`) are kept for well-known titles only (`AKA_MIN_VOTES`, 1,000+ votes) and only the names IMDb displays in English-speaking regions or worldwide with a stated type (`keepAka`: regions AU, CA, GB, IE, IN, NZ, US, XWW; types imdbDisplay, alternative, original, joined by `\x02` when several, or no type with the attribute "complete title" or "alternative spelling" ("Marvel's Daredevil" is Daredevil's US complete title); any other attribute-only alias, a fake working title, a season title, a cut, an informal name, names a stranger and is dropped), which is what lets Netflix's "Dune" reach "Dune: Part One" and "Marvel's Daredevil" reach "Daredevil" (about 40,000 names). Each such row is flagged `aka` in `imdb_name`, and the matcher takes a title matched only through an alternate name only when nothing fits under its own name and it alone fits, so Torchwood never wears Doctor Who's score. A non-English Netflix UI would need the other regions; `imdb_name` takes any number of spellings per title without a schema change.

## How a title is matched

`resolveTitle` and `pickImdbTitle` in `lib/imdb.ts`, on the candidates whose name key (`searchKey`: case, width, diacritics, punctuation, and `&` folded) equals a spelling of the platform's title (`titleSpellings`: as given, without a parenthetical, without a subtitle), stopping at the first spelling any candidate fits:

1. Filter: the kind must agree; a film's year within one of its release; a series when the stated year falls inside its run, a year either side (Netflix states a show's latest season), where a run with no end year reaches the present only for a show with 1,000+ votes; a film's runtime within five minutes when both are known. Under the unsubtitled spelling the year must match exactly, so a spin-off never inherits its parent's score.
2. Nothing is taken without a stated year. Once any candidate can be verified by what was stated, unverifiable ones (no year, no runtime) drop out, but still veto a pick they out-vote three to one. A film and a series of one name with no kind stated are an ambiguity.
3. One left: the answer. Several: ranked by closest runtime (a film), then votes, and taken only when the runtime is closer by three minutes or more, or the top has 100+ votes, three times the runner-up's, which never counts under the unsubtitled spelling nor while a candidate in the running is too new to have earned its votes (unrated, or under 100 votes and from this year or last).

A wrong score is worse than none, so every ambiguity is a miss (`found: false`). When a real title misses, reproduce it with `GET /api/v1/ratings?title=...&type=...&year=...&runtime=...` against the local API, check what the index holds (`select * from imdb_name join imdb_title on title_id = id where key = '...'`), and add the case to `imdb.test.ts` before changing a rule.
