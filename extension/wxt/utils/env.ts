import { createExtensionEnv } from "@packages/env/extension-wxt"

// Validated once at load from what Vite inlined at build; wxt.config.ts is where the value comes from.
export const env = createExtensionEnv(import.meta.env)
