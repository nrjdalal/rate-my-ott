import "@packages/env/load-dotenv"
import { site } from "@packages/config/site"
import { createExtensionEnv } from "@packages/env/extension-wxt"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "wxt"

import pkg from "../../package.json" with { type: "json" }

// The extension reads the repo-root .env like every other workspace (load-dotenv resolves ../../.env from this directory), so WXT_PUBLIC_API_URL lives beside NEXT_PUBLIC_API_URL rather than in a second .env here. Under a skip flag (CI, a worktree pre-commit build) a missing URL becomes a shape-valid dummy, mirroring @packages/env's polyfills, since a build that lacks it must still pass. Vite then exposes the WXT_PUBLIC_* it finds in process.env as import.meta.env, which is where utils/env.ts reads it back.
const skip = process.env.SKIP_ENV_VALIDATION === "true"
if (skip && !process.env.WXT_PUBLIC_API_URL) process.env.WXT_PUBLIC_API_URL = "https://polyfill.url"
const env = createExtensionEnv(process.env)
const apiOrigin = new URL(env.WXT_PUBLIC_API_URL).origin

export default defineConfig({
  autoIcons: { baseIconPath: "assets/icon.svg" },
  // A fixed port off Next's 3000, so PORTLESS=0 dev does not collide; only the extension's own HMR client talks to it.
  dev: { server: { port: 3005 } },
  // Explicit imports only (`wxt/browser`, `wxt/utils/*`), like the rest of the monorepo; nothing is injected as a global.
  imports: false,
  // Manifest V3 for Firefox too (WXT would default it to V2), so both builds share one background and one set of permissions.
  manifestVersion: 3,
  manifest: ({ browser, mode }) => ({
    name: site.name,
    // The repo's release version (bumped by the canary-to-main release flow), so a store listing, a release zip, and the changelog all say the same number; the workspace's own package.json stays at 0.0.0 like every other workspace.
    version: pkg.version,
    // Chrome caps a manifest description at 132 characters.
    description: site.description.slice(0, 132),
    permissions: ["storage"],
    // Firefox installs an unsigned add-on persistently and updates a signed one only under a stable id, and since late 2025 wants every new add-on to declare what it collects (nothing, here). Chrome would flag the key as unrecognized, so only the Firefox build carries it.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: { required: ["none"] },
              id: "rate-my-ott@nrjdalal.com",
              strict_min_version: "128.0",
            },
          },
        }
      : {}),
    // The background fetches the API under a host permission, which is what lets an extension call a cross-origin API without CORS; a content script has only the page's permissions, so it never fetches itself. A dev build also covers the fixed-port and portless hosts, so the options page can point at either without a rebuild.
    host_permissions: [
      `${apiOrigin}/*`,
      ...(mode === "development" ? ["http://localhost/*", "http://*.localhost/*"] : []),
    ],
  }),
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()] }),
  // `bun run dev` runs this beside web and api and must not spawn a browser; a local web-ext.config.ts (gitignored) re-enables it with your own Chrome profile.
  webExt: { disabled: true },
  // What a release attaches: rate-my-ott-1.2.3-chrome.zip and rate-my-ott-1.2.3-firefox.zip.
  zip: { artifactTemplate: "rate-my-ott-{{version}}-{{browser}}.zip" },
})
