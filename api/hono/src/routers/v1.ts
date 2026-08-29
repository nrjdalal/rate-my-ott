import { Hono } from "hono"

import { ratingsRouter } from "@/routers/ratings"

// The app's own API, mounted at /api/v1 in src/index.ts. A new concern gets its own router in this directory and a `.route()` here; see the api-endpoint skill.
export const v1Router = new Hono().route("/ratings", ratingsRouter)
