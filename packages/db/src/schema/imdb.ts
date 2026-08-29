import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

// The IMDb index: one row per title from IMDb's daily datasets (imdb:sync keeps it current), so a card's IMDb score is answered locally and exactly instead of by a provider's best guess. `id` is the tconst. Nulls mean IMDb has no value (an unreleased year, an unlisted runtime, a title nobody has rated yet).
export const imdbTitle = pgTable("imdb_title", {
  endYear: integer("end_year"),
  id: text("id").primaryKey(),
  originalTitle: text("original_title").notNull(),
  primaryTitle: text("primary_title").notNull(),
  rating: doublePrecision("rating"),
  runtime: integer("runtime"),
  startYear: integer("start_year"),
  titleType: text("title_type").notNull(),
  votes: integer("votes"),
})

// The spellings a title answers to, one row each (its primary and original names today, localized names later), keyed by the API's search normalization so a lookup is one indexed equality. The composite key doubles as the lookup index; the title index serves the cascade when a title leaves the dataset.
export const imdbName = pgTable(
  "imdb_name",
  {
    key: text("key").notNull(),
    titleId: text("title_id")
      .notNull()
      .references(() => imdbTitle.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.titleId] }),
    index("imdb_name_title_id_idx").on(table.titleId),
  ],
)

// One row per rebuild that landed, written inside the rebuild's own transaction, so the newest row says what the index holds and how fresh it is; the API's index route and the extension's popup read it. A rebuild that failed leaves no row, which is how a stale index shows.
export const imdbSync = pgTable("imdb_sync", {
  akas: integer("akas").notNull(),
  durationMs: integer("duration_ms").notNull(),
  finishedAt: timestamp("finished_at").defaultNow().notNull(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  names: integer("names").notNull(),
  pruned: integer("pruned").notNull(),
  titles: integer("titles").notNull(),
})
