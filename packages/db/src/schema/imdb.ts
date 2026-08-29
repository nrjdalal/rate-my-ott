import { doublePrecision, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core"

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
