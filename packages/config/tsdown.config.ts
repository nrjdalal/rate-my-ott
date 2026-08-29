import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/site.ts"],
  minify: true,
  outDir: "dist",
})
