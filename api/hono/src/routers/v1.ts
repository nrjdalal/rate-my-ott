import { Hono } from "hono"

// The app's own API, mounted at /api/v1 in src/index.ts. Add routes here (or a sibling router mounted beside it); see the api-endpoint skill.
export const v1Router = new Hono()
