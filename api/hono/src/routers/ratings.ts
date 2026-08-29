import { sValidator } from "@hono/standard-validator"
import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { z } from "zod"

import { ApiError, indexErrorResponses, validationErrorResponses } from "@/lib/error"
import { MISS_REASONS } from "@/lib/imdb"
import { TITLE_TYPES } from "@/lib/lookup"
import { indexStatus, lookupRatings, type Rating } from "@/lib/ratings"

// The most titles one request will look up: a Netflix row holds a few dozen cards and the extension flushes what it sees in short windows, so fifty covers a burst in one round trip to the index.
export const MAX_TITLES = 50

const titleQuerySchema = z.object({
  // Minutes; a film's length as the platform states it, which tells two same-name films of one year apart.
  runtime: z.coerce.number().int().min(1).max(3000).optional().meta({ example: 140 }),
  // Long enough for a light-novel adaptation's full name (Netflix renders titles over 200 characters), since one refused title fails its whole batch.
  title: z.string().trim().min(1).max(500).meta({ example: "Rick and Morty" }),
  type: z.enum(TITLE_TYPES).optional().meta({ example: "series" }),
  year: z.coerce.number().int().min(1888).max(2100).optional().meta({ example: 2013 }),
})

const batchSchema = z.object({
  titles: z.array(titleQuerySchema).min(1).max(MAX_TITLES),
})

// metascore, poster, and rottenTomatoes are always null: the v0.0.1 extension reads them and would paint "undefined" were they missing. Drop them in the next minor.
const ratingSchema = z.object({
  found: z.boolean().meta({ example: true }),
  imdbId: z.string().nullable().meta({ example: "tt2861424" }),
  imdbRating: z.number().nullable().meta({ example: 9.1 }),
  imdbVotes: z.number().nullable().meta({ example: 640000 }),
  metascore: z.null(),
  poster: z.null(),
  // Why there is no score: a miss's cause, or "unrated" for a title IMDb lists but nobody has rated yet; null with a score.
  reason: z
    .enum([...MISS_REASONS, "unrated"])
    .nullable()
    .meta({ example: null }),
  rottenTomatoes: z.null(),
  title: z.string().meta({ example: "Rick and Morty" }),
  type: z.enum(["movie", "series", "unknown"]).meta({ example: "series" }),
  year: z.number().nullable().meta({ example: 2013 }),
})

// Named field by field so the response carries exactly what the schema documents, in its order.
const asResponse = (row: Rating) => ({
  found: row.found,
  imdbId: row.imdbId,
  imdbRating: row.imdbRating,
  imdbVotes: row.imdbVotes,
  metascore: null,
  poster: null,
  reason: row.reason,
  rottenTomatoes: null,
  title: row.title,
  type: row.type,
  year: row.year,
})

// What the newest rebuild wrote, or null while the index has never been built.
const indexSchema = z
  .object({
    akas: z.number().meta({ example: 41093 }),
    finishedAt: z.string().meta({ format: "date-time", example: "2026-08-29T14:33:00.000Z" }),
    names: z.number().meta({ example: 760902 }),
    titles: z.number().meta({ example: 619222 }),
  })
  .nullable()

const invalid = (result: { success: boolean; error?: unknown }) => {
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid input", { issues: result.error })
  }
}

export const ratingsRouter = new Hono()
  // Named status, not index: Hono's RPC client drops a path segment called index as the directory index.
  .get(
    "/status",
    describeRoute({
      tags: ["Ratings"],
      description:
        "What the IMDb index holds and when it was last rebuilt: the newest rebuild's record, or null while the index has never been built (the ratings routes answer 503 then). The extension's popup shows it.",
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: resolver(z.object({ data: z.object({ index: indexSchema }) })),
            },
          },
        },
      },
    }),
    async (c) => {
      const status = await indexStatus()
      return c.json({
        data: {
          index: status
            ? {
                akas: status.akas,
                finishedAt: status.finishedAt.toISOString(),
                names: status.names,
                titles: status.titles,
              }
            : null,
        },
      })
    },
  )
  .get(
    "/",
    describeRoute({
      tags: ["Ratings"],
      description:
        "The IMDb rating for one title, matched in the IMDb index (IMDb's daily datasets) by name, kind, year, and runtime; a year is required for a match. A title the index cannot match with certainty comes back with found=false: no answer rather than a wrong one.",
      ...({
        "x-codeSamples": [
          {
            lang: "typescript",
            label: "hono/client",
            source: `import { apiClient, unwrap } from "@/lib/api/client"

const { data, error } = await unwrap(
  apiClient.v1.ratings.$get({ query: { title: "Rick and Morty", type: "series", year: 2013 } }),
)`,
          },
        ],
      } as object),
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: resolver(z.object({ data: z.object({ rating: ratingSchema }) })),
            },
          },
        },
        ...validationErrorResponses,
        ...indexErrorResponses,
      },
    }),
    sValidator("query", titleQuerySchema, invalid),
    async (c) => {
      const [row] = await lookupRatings([c.req.valid("query")])
      return c.json({ data: { rating: asResponse(row as Rating) } })
    },
  )
  .post(
    "/",
    describeRoute({
      tags: ["Ratings"],
      description: `IMDb ratings for a batch of titles (up to ${MAX_TITLES}), one answer per title in the order asked; what the extension calls with the cards it sees. Every title is matched in the IMDb index in one round trip.`,
      ...({
        "x-codeSamples": [
          {
            lang: "typescript",
            label: "hono/client",
            source: `import { apiClient, unwrap } from "@/lib/api/client"

const { data, error } = await unwrap(
  apiClient.v1.ratings.$post({
    json: { titles: [{ title: "Rick and Morty", type: "series", year: 2013 }, { title: "Ikka", year: 2026 }] },
  }),
)`,
          },
        ],
      } as object),
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: resolver(z.object({ data: z.object({ ratings: z.array(ratingSchema) }) })),
            },
          },
        },
        ...validationErrorResponses,
        ...indexErrorResponses,
      },
    }),
    sValidator("json", batchSchema, invalid),
    async (c) => {
      const rows = await lookupRatings(c.req.valid("json").titles)
      return c.json({ data: { ratings: rows.map(asResponse) } })
    },
  )
