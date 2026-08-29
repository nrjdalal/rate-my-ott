import type { AppType, ErrorCode } from "@api/hono"
import { hc, type InferRequestType, type InferResponseType } from "hono/client"

// The same typed client the web app builds in web/next/src/lib/api/client.ts, pointed at whatever API URL the settings hold; every request and response type below is inferred from AppType, so a change to the ratings route retypes the extension too.
type Client = ReturnType<typeof hc<AppType>>

export const createApiClient = (baseUrl: string): Client["api"] => hc<AppType>(baseUrl).api

type RatingsPost = Client["api"]["v1"]["ratings"]["$post"]

export type TitleQuery = InferRequestType<RatingsPost>["json"]["titles"][number]
export type Rating = InferResponseType<RatingsPost, 200>["data"]["ratings"][number]

type IndexGet = Client["api"]["v1"]["ratings"]["status"]["$get"]

export type IndexStatus = NonNullable<InferResponseType<IndexGet, 200>["data"]["index"]>

// Standard error shape, matching the jsonError envelope in api/hono/src/lib/error.ts plus the transport codes unwrap itself produces.
export type ApiError = {
  code: ErrorCode | "NETWORK_ERROR" | "UNKNOWN_ERROR"
  message: string
}

type SuccessData<B> = B extends { data: infer D } ? D : never

export type ApiResult<B> = { data: SuccessData<B>; error: null } | { data: null; error: ApiError }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

type RpcResponse = { ok: boolean; json: () => Promise<unknown> }

// Turn a Hono RPC call into a { data, error } result (exactly one is non-null); never throws. Mirrors the web app's unwrap.
export async function unwrap<R extends RpcResponse>(
  call: Promise<R>,
): Promise<ApiResult<Awaited<ReturnType<R["json"]>>>> {
  try {
    const res = await call
    const body: unknown = await res.json()
    if (res.ok && isRecord(body) && "data" in body) {
      return { data: body.data as SuccessData<Awaited<ReturnType<R["json"]>>>, error: null }
    }
    if (isRecord(body) && isRecord(body.error)) {
      const code = (
        typeof body.error.code === "string" && body.error.code ? body.error.code : "ERROR"
      ) as ApiError["code"]
      const message =
        typeof body.error.message === "string" && body.error.message
          ? body.error.message
          : "Request failed"
      return { data: null, error: { code, message } }
    }
    return { data: null, error: { code: "UNKNOWN_ERROR", message: "Unexpected response" } }
  } catch {
    return { data: null, error: { code: "NETWORK_ERROR", message: "Network request failed" } }
  }
}
