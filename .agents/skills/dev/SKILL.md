---
name: dev
description: Start, restart, and verify the rate-my-ott dev stack. `bun run dev` serves portless named `.localhost` URLs (branch-prefixed in a worktree); resolve them with `bunx portless get`. Use when asked to run the app, when the API returns NOT_FOUND for routes that exist in source, or before browser testing.
source: https://github.com/nrjdalal/zerostarter
---

# Dev Stack

`bun run dev` runs the web app (Next.js) and the API (Hono) through **portless**, and the extension (WXT) in watch mode beside them (it writes `extension/wxt/.output/chrome-mv3-dev`, serves its own HMR on `:3005`, and launches no browser; see the `extension-dev` skill). Portless gives the two servers stable named `.localhost` URLs off one unprivileged HTTP proxy on `:1355`, instead of raw ports. In a linked worktree the branch name prefixes each host, so parallel worktrees never collide on a port. Bare `bun run dev` uses turbo's TUI, which needs an interactive terminal; run stream mode detached instead.

## Start

```bash
(bun run dev --ui stream > /tmp/rate-my-ott-dev.log 2>&1 &)
# Resolve this worktree's URLs (branch-prefixed); the proxy needs a moment, so retry
for i in $(seq 1 60); do WEB=$(bunx portless get rate-my-ott 2>/dev/null); [ -n "$WEB" ] && break; sleep 1; done
API=$(bunx portless get api.rate-my-ott)
curl -sf --retry 60 --retry-delay 1 --retry-connrefused "$API/api/health" > /dev/null
curl -sS "$API/api/health"                        # {"data":{"message":"ok",...}}
curl -sS -o /dev/null -w "%{http_code}" "$WEB/"   # 200
```

Ready when the health curl prints `"message":"ok"` and `/` returns `200`. `bunx portless list` shows every active route.

- Web / API base URLs: `bunx portless get rate-my-ott` / `bunx portless get api.rate-my-ott`
- Scalar API docs: `$API/api/docs`
- Logs: `tail -f /tmp/rate-my-ott-dev.log`
- Extension build: `extension/wxt/.output/chrome-mv3-dev` (load unpacked; point its options at `$API`)

**Fixed ports:** `PORTLESS=0 bun run dev` skips the proxy and serves web on `:3000`, api on `:4000` (the ports the curl examples in other skills assume). It runs a single stack only: two worktrees on fixed ports collide, which is why portless is the default.

## Stale-route trap

The API dev task runs `bun --hot src/index.ts`, and **`--hot` does not pick up newly created files** (new routers, new schema exports). The symptom is a route that exists in source returning `{"error":{"code":"NOT_FOUND"}}`. Touching files does not clear it; only a full restart does:

```bash
pkill -f "turbo run dev" 2>/dev/null
# turbo does not take `next dev` down with it, and a surviving one fails the restart with "Another next dev server is already running". Scope the kill to this checkout's binary path: a bare `pkill -f "next dev"` takes every other worktree's stack down too.
pkill -f "$PWD/web/next/node_modules/.bin/next dev" 2>/dev/null
pkill -f "$PWD/extension/wxt/node_modules/.bin/wxt" 2>/dev/null
sleep 2
(bun run dev --ui stream > /tmp/rate-my-ott-dev.log 2>&1 &)
API=$(bunx portless get api.rate-my-ott)
curl -sf --retry 60 --retry-delay 1 --retry-connrefused "$API/api/health" > /dev/null
```

`pkill -f "turbo run dev"` matches any turbo dev process regardless of worktree (the api's `concurrently` takes its own children down with it); the shared portless proxy keeps running, and this worktree's apps re-register on restart. Before restarting, confirm no other worktree needs the turbo process you are killing, and never widen the `next`/`wxt` kills beyond `$PWD`. Done when the previously-NOT_FOUND route responds.

Restart the same way after changing `@packages/*` exports the API consumes: they resolve to built dist, so run `bunx turbo run build --filter=@packages/<name>` first.

