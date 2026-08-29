import { sValidator } from "@hono/standard-validator"
import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { z } from "zod"

import { ApiError, providerErrorResponses, validationErrorResponses } from "@/lib/error"
import { TITLE_TYPES } from "@/lib/omdb"
import { lookupRatings, type Rating } from "@/lib/ratings"

// The most titles one request will look up: a Netflix row holds a few dozen cards and the extension flushes what it sees in short windows, so fifty covers a burst without letting one call hold the provider for long.
export const MAX_TITLES = 50

const titleQuerySchema = z.object({
  // Minutes; a film's length as the platform states it, which tells two same-name films of one year apart.
  runtime: z.coerce.number().int().min(1).max(3000).optional().meta({ example: 140 }),
  title: z.string().trim().min(1).max(200).meta({ example: "Rick and Morty" }),
  type: z.enum(TITLE_TYPES).optional().meta({ example: "series" }),
  year: z.coerce.number().int().min(1888).max(2100).optional().meta({ example: 2013 }),
})

const batchSchema = z.object({
  titles: z.array(titleQuerySchema).min(1).max(MAX_TITLES),
})

const ratingSchema = z.object({
  fetchedAt: z.string().meta({ format: "date-time", example: "2026-08-29T10:00:00.000Z" }),
  found: z.boolean().meta({ example: true }),
  imdbId: z.string().nullable().meta({ example: "tt2861424" }),
  imdbRating: z.number().nullable().meta({ example: 9.1 }),
  imdbVotes: z.number().nullable().meta({ example: 640000 }),
  key: z.string().meta({ example: "rick and morty||series" }),
  metascore: z.number().nullable().meta({ example: 85 }),
  poster: z
    .string()
    .nullable()
    .meta({ example: "https://m.media-amazon.com/images/M/example.jpg" }),
  rottenTomatoes: z.number().nullable().meta({ example: 94 }),
  title: z.string().meta({ example: "Rick and Morty" }),
  type: z.enum(["movie", "series", "unknown"]).meta({ example: "series" }),
  year: z.number().nullable().meta({ example: 2013 }),
})

// Named field by field so the response carries exactly what the schema documents, in its order.
const asResponse = (row: Rating) => ({
  fetchedAt: row.fetchedAt.toISOString(),
  found: row.found,
  imdbId: row.imdbId,
  imdbRating: row.imdbRating,
  imdbVotes: row.imdbVotes,
  key: row.key,
  metascore: row.metascore,
  poster: row.poster,
  rottenTomatoes: row.rottenTomatoes,
  title: row.title,
  type: row.type as "movie" | "series" | "unknown",
  year: row.year,
})

const invalid = (result: { success: boolean; error?: unknown }) => {
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid input", { issues: result.error })
  }
}

export const ratingsRouter = new Hono()
  .get(
    "/",
    describeRoute({
      tags: ["Ratings"],
      description:
        "Ratings for one title (IMDb, Rotten Tomatoes, Metacritic), answered from the cache or fetched from OMDb and cached. A title OMDb does not know comes back with found=false.",
      ...({
        "x-codeSamples": [
          {
            lang: "typescript",
            label: "hono/client",
            source: `import { apiClient, unwrap } from "@/lib/api/client"

const { data, error } = await unwrap(
  apiClient.v1.ratings.$get({ query: { title: "Rick and Morty", type: "series" } }),
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
        ...providerErrorResponses,
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
      description: `Ratings for a batch of titles (up to ${MAX_TITLES}), one answer per title in the order asked; what the extension calls with the cards it sees. Cached answers are served as-is, the rest are fetched from OMDb and cached.`,
      ...({
        "x-codeSamples": [
          {
            lang: "typescript",
            label: "hono/client",
            source: `import { apiClient, unwrap } from "@/lib/api/client"

const { data, error } = await unwrap(
  apiClient.v1.ratings.$post({
    json: { titles: [{ title: "Rick and Morty", type: "series" }, { title: "Ikka" }] },
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
        ...providerErrorResponses,
      },
    }),
    sValidator("json", batchSchema, invalid),
    async (c) => {
      const rows = await lookupRatings(c.req.valid("json").titles)
      return c.json({ data: { ratings: rows.map(asResponse) } })
    },
  )
