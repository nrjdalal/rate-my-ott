import { describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

import { readEntity } from "../../../../extension/wxt/utils/netflix-props"

// A card anchor with the fiber chain React hangs on it: the card component two levels up, the row component further up, shaped like Netflix's browse page on 2026-08-29.
const cardWithFibers = (entity: Record<string, unknown> | null, videoId = 82023350) => {
  const window = new Window({ url: "https://www.netflix.com/browse" })
  window.document.body.innerHTML = `<a href="/browse?jbv=${videoId}" aria-label="Alpha" data-uia="ranked-card"><div><img alt=""></div></a>`
  const anchor = window.document.querySelector("a") as unknown as Element
  const row = {
    memoizedProps: {
      sectionFragment: {
        entities: {
          edges: [
            { node: { unifiedEntity: { __typename: "Movie", releaseYear: 1999, videoId: 1 } } },
            ...(entity ? [{ node: { unifiedEntity: entity } }] : []),
          ],
        },
      },
    },
    return: null,
  }
  const card = {
    memoizedProps: { title: "Alpha", videoId },
    return: { memoizedProps: {}, return: row },
  }
  const leaf = { memoizedProps: { "data-uia": "ranked-card" }, return: card }
  ;(anchor as unknown as Record<string, unknown>)["__reactFiber$abc123"] = leaf
  return anchor
}

describe("readEntity", () => {
  test("reads the card's id and title, and the year and kind from the row's entity", () => {
    const movie = cardWithFibers({ __typename: "Movie", releaseYear: 2026, videoId: 82023350 })
    expect(readEntity(movie)).toEqual({
      title: "Alpha",
      type: "movie",
      videoId: 82023350,
      year: 2026,
    })
    // A show's runtimeSec, when present, is not a length worth matching on.
    const show = cardWithFibers({
      __typename: "Show",
      releaseYear: 2024,
      runtimeSec: 3000,
      videoId: 82023350,
    })
    expect(readEntity(show)).toEqual({
      title: "Alpha",
      type: "series",
      videoId: 82023350,
      year: 2024,
    })
  })

  test("a card whose entity the row does not carry keeps its id and title only", () => {
    expect(readEntity(cardWithFibers(null))).toEqual({ title: "Alpha", videoId: 82023350 })
  })

  // The legacy card (.title-card on genre pages) carries one videoModel; a show states its latest season's year and no length, a film its length in seconds.
  test("a legacy card reads its videoModel: the id, title, year, and kind, and a film's length", () => {
    const legacy = (model: Record<string, unknown>) => {
      const window = new Window({ url: "https://www.netflix.com/browse/genre/83" })
      window.document.body.innerHTML = `<div class="title-card"><a href="/watch/70155590?tctx=1" aria-label="The Mentalist"><div class="boxart-container"><img alt=""></div></a></div>`
      const card = window.document.querySelector(".title-card") as unknown as Element
      const holder = { memoizedProps: { videoModel: model }, return: null }
      ;(card as unknown as Record<string, unknown>)["__reactFiber$legacy"] = {
        memoizedProps: { className: "title-card" },
        return: { memoizedProps: {}, return: holder },
      }
      return card
    }
    expect(
      readEntity(
        legacy({
          releaseYear: 2015,
          runtime: 0,
          summary: { id: 70155590, type: "show" },
          title: "The Mentalist",
          titleType: "video",
          unifiedEntityId: "Video:70155590",
        }),
      ),
    ).toEqual({ title: "The Mentalist", type: "series", videoId: 70155590, year: 2015 })
    expect(
      readEntity(
        legacy({
          releaseYear: 2026,
          runtime: 8400,
          summary: { id: 82023350, type: "movie" },
          title: "Alpha",
          unifiedEntityId: "Video:82023350",
        }),
      ),
    ).toEqual({ runtime: 140, title: "Alpha", type: "movie", videoId: 82023350, year: 2026 })
    // The id falls back to the unified entity id; a model without either is not a card.
    expect(readEntity(legacy({ title: "X", unifiedEntityId: "Video:42" }))).toEqual({
      title: "X",
      videoId: 42,
    })
    expect(readEntity(legacy({ title: "X" }))).toBeNull()
  })

  test("an element with no fiber, or no card above it, reads as null", () => {
    const window = new Window({ url: "https://www.netflix.com/browse" })
    window.document.body.innerHTML = `<a href="/browse?jbv=1"></a>`
    const bare = window.document.querySelector("a") as unknown as Element
    expect(readEntity(bare)).toBeNull()
    ;(bare as unknown as Record<string, unknown>)["__reactFiber$x"] = {
      memoizedProps: {},
      return: null,
    }
    expect(readEntity(bare)).toBeNull()
  })
})
