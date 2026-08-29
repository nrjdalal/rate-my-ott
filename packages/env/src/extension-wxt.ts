import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// The extension's build-time env, validated from whatever the caller hands in: Vite's import.meta.env inside the bundle, process.env inside wxt.config.ts. It takes the object as a parameter instead of reading process.env itself because this entry ships in the extension, where `process` does not exist, and for the same reason it carries none of the skip-flag polyfills; wxt.config.ts applies those before the build.
export const createExtensionEnv = (
  runtimeEnv: Record<string, boolean | number | string | undefined>,
) =>
  createEnv({
    clientPrefix: "WXT_PUBLIC_",
    client: {
      WXT_PUBLIC_API_URL: z.url(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  })
