import { describe, expect, test } from "bun:test"

import { omdbSearchParams, parseOmdb, type OmdbBody } from "../../../../../api/hono/src/lib/omdb"

// A captured OMDb answer for a series, trimmed to the fields the parser reads.
const rickAndMorty: OmdbBody = {
  Title: "Rick and Morty",
  Year: "2013–",
  Type: "series",
  Poster: "https://m.media-amazon.com/images/M/rick.jpg",
  Ratings: [
    { Source: "Internet Movie Database", Value: "9.1/10" },
    { Source: "Rotten Tomatoes", Value: "94%" },
  ],
  Metascore: "N/A",
  imdbRating: "9.1",
  imdbVotes: "640,123",
  imdbID: "tt2861424",
  Response: "True",
}

describe("parseOmdb", () => {
  test("reads a hit into the cache shape, with N/A as null and the votes as a number", () => {
    expect(parseOmdb(rickAndMorty)).toEqual({
      ok: true,
      title: {
        imdbId: "tt2861424",
        imdbRating: 9.1,
        imdbVotes: 640123,
        metascore: null,
        poster: "https://m.media-amazon.com/images/M/rick.jpg",
        rottenTomatoes: 94,
        title: "Rick and Morty",
        type: "series",
        year: 2013,
      },
    })
  })

  test("takes the first year of a range and the Metascore when present", () => {
    const answer = parseOmdb({ ...rickAndMorty, Year: "2008–2013", Metascore: "85", Type: "movie" })
    expect(answer.ok && answer.title?.year).toBe(2008)
    expect(answer.ok && answer.title?.metascore).toBe(85)
    expect(answer.ok && answer.title?.type).toBe("movie")
  })

  test("an unknown type reads as unknown, and a missing poster or votes as null", () => {
    const answer = parseOmdb({ ...rickAndMorty, Type: "game", Poster: "N/A", imdbVotes: "N/A" })
    expect(answer.ok && answer.title).toMatchObject({
      imdbVotes: null,
      poster: null,
      type: "unknown",
    })
  })

  test("a title OMDb does not know is a miss, not an error", () => {
    expect(parseOmdb({ Response: "False", Error: "Movie not found!" })).toEqual({
      ok: true,
      title: null,
    })
  })

  test("a refused key is an error the route turns into a 502", () => {
    expect(parseOmdb({ Response: "False", Error: "Invalid API key!" })).toEqual({
      error: "Invalid API key!",
      ok: false,
    })
    expect(parseOmdb({ Response: "False", Error: "Request limit reached!" }).ok).toBe(false)
  })
})

describe("omdbSearchParams", () => {
  test("sends only what the caller knows", () => {
    expect(omdbSearchParams({ title: "Ikka" }, "k").toString()).toBe("apikey=k&t=Ikka")
    expect(omdbSearchParams({ title: "Dune", type: "movie", year: 2021 }, "k").toString()).toBe(
      "apikey=k&t=Dune&y=2021&type=movie",
    )
  })
})
