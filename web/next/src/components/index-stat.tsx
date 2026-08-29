import { apiClient, unwrap } from "@/lib/api/client"
import { describeIndex } from "@/lib/index-stat"

// The API's index record as one line under the hero, rendered on the server and refreshed every quarter hour (a release builds the site while the previous API is still live, so the first render can miss the route); nothing at all when the API cannot be reached (a build without one, an outage), so the page never fails on it.
export async function IndexStat() {
  const { data } = await unwrap(
    apiClient.v1.ratings.status.$get(undefined, { init: { next: { revalidate: 900 } } }),
  )
  const line = describeIndex(data?.index ?? null)
  return line ? <p className="text-muted-foreground mt-6 text-sm">{line}</p> : null
}
