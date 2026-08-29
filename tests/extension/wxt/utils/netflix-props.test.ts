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
