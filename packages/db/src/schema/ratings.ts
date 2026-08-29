import { boolean, doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

// One row per lookup the API has answered, found or not, so the provider is asked once per title and a miss is remembered too (a miss expires sooner; the API owns both TTLs). `key` is the normalized "title|year|type" the API derives from a request, which is what a batch of card titles matches on. `imdb_id` is the provider's identity and deliberately not unique: two lookups (with and without a year) can resolve to one title and both deserve their own cached answer.
export const rating = pgTable("rating", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  found: boolean("found").notNull(),
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  imdbId: text("imdb_id"),
  imdbRating: doublePrecision("imdb_rating"),
  imdbVotes: integer("imdb_votes"),
  key: text("key").notNull().unique(),
  metascore: integer("metascore"),
  poster: text("poster"),
  rottenTomatoes: integer("rotten_tomatoes"),
  title: text("title").notNull(),
  type: text("type").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  year: integer("year"),
})
