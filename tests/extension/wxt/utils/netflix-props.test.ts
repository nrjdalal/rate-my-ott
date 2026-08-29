import { describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

import { readBillboard, readEntity } from "../../../../extension/wxt/utils/netflix-props"

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
          summary: { id: 70155590, type: "movie" },
          title: "Alpha",
          unifiedEntityId: "Video:70155590",
        }),
      ),
    ).toEqual({ runtime: 140, title: "Alpha", type: "movie", videoId: 70155590, year: 2026 })
    // A model higher up (a row's, a billboard's) that names another video is not the card's; the walk goes on and finds nothing.
    const stray = legacy({ releaseYear: 2018, summary: { id: 999, type: "movie" }, title: "Alpha" })
    expect(readEntity(stray)).toBeNull()
    // The id falls back to the unified entity id; a model without either is not a card.
    expect(readEntity(legacy({ title: "X", unifiedEntityId: "Video:70155590" }))).toEqual({
      title: "X",
      videoId: 70155590,
    })
    expect(readEntity(legacy({ title: "X" }))).toBeNull()
  })

  // A card in the modal's "More Like This" row: no link, a video record in its props with the show's latest season as its year.
  test("a modal card reads its video record, taking a show's latest year and a film's display runtime", () => {
    const modalCard = (video: Record<string, unknown>) => {
      const window = new Window({ url: "https://www.netflix.com/browse?jbv=1" })
      window.document.body.innerHTML = `<div data-uia="titleCard--container" aria-label="Little Brother"><div class="titleCard-imageWrapper"><img alt=""></div></div>`
      const card = window.document.querySelector("div") as unknown as Element
      ;(card as unknown as Record<string, unknown>)["__reactFiber$m"] = {
        memoizedProps: { role: "button" },
        return: { memoizedProps: { video }, return: null },
      }
      return card
    }
    expect(
      readEntity(
        modalCard({
          __typename: "Movie",
          displayRuntimeSec: 6047,
          latestYear: 2026,
          title: "Little Brother",
          videoId: 81521988,
        }),
      ),
    ).toEqual({
      runtime: 101,
      title: "Little Brother",
      type: "movie",
      videoId: 81521988,
      year: 2026,
    })
    expect(
      readEntity(
        modalCard({
          __typename: "Show",
          displayRuntimeSec: 3000,
          latestYear: 2025,
          title: "A Show",
          videoId: 7,
        }),
      ),
    ).toEqual({
      title: "A Show",
      type: "series",
      videoId: 7,
      year: 2025,
    })
    expect(readEntity(modalCard({ title: "No id" }))).toBeNull()
  })

  test("the billboard reads its play button's entity and drops the promoted season from the title", () => {
    const window = new Window({ url: "https://www.netflix.com/browse" })
    window.document.body.innerHTML = `<section data-uia="billboard"></section>`
    const section = window.document.querySelector("section") as unknown as Element
    const props = {
      buttons: [
        {
          __typename: "PinotHawkinsButton",
          onPress: {
            __typename: "PinotEntityPlaybackAction",
            unifiedEntity: { __typename: "Show", releaseYear: 2011, videoId: 70184207 },
          },
        },
        {
          __typename: "PinotHawkinsButton",
          onPress: { __typename: "PinotNavigateToDisplayPageAction" },
        },
      ],
      title: "Shameless (U.S.), Season 1",
    }
    ;(section as unknown as Record<string, unknown>)["__reactFiber$b"] = {
      memoizedProps: {},
      return: { memoizedProps: props, return: null },
    }
    expect(readBillboard(section)).toEqual({
      title: "Shameless (U.S.)",
      type: "series",
      videoId: 70184207,
      year: 2011,
    })
    ;(section as unknown as Record<string, unknown>)["__reactFiber$b"] = {
      memoizedProps: { title: "X", buttons: [] },
      return: null,
    }
    expect(readBillboard(section)).toBeNull()
  })

  test("the billboard drops whatever is promoted from its title: a season, a part, a limited series", () => {
    const read = (title: string) => {
      const window = new Window({ url: "https://www.netflix.com/browse" })
      window.document.body.innerHTML = `<section data-uia="billboard"></section>`
      const section = window.document.querySelector("section") as unknown as Element
      const entity = { __typename: "Show", releaseYear: 2026, videoId: 1 }
      ;(section as unknown as Record<string, unknown>)["__reactFiber$b"] = {
        memoizedProps: { buttons: [{ onPress: { unifiedEntity: entity } }], title },
        return: null,
      }
      return readBillboard(section)?.title
    }
    expect(read("HIS & HERS, Limited Series")).toBe("HIS & HERS")
    expect(read("Stranger Things: Season 5")).toBe("Stranger Things")
    expect(read("Money Heist, Part 3")).toBe("Money Heist")
    expect(read("Alpha")).toBe("Alpha")
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
