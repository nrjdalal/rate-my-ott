#!/bin/bash

# Headless crawl of Netflix with the built extension, for a robustness pass: every page is scrolled to the bottom so its lazy rows render, sample cards are hovered (the preview line) and one is clicked (the modal row), and the popup's report for the tab is read. Each page's stamped cards, badge or not, land in one JSON line for `bun run crawl:report` to replay against the API. Needs agent-browser and a profile already logged in to Netflix (see the extension-dev skill); the build is copied to a fresh directory first, since Chrome keeps a stale service worker for an unpacked id.
#
#   bun run crawl                       # the default pages, extension/wxt/.output/chrome-mv3
#   CRAWL_PAGES="https://www.netflix.com/browse/genre/83" bun run crawl
#   CRAWL_PROFILE=~/.agent-browser/profiles/other bun run crawl

set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BUILD=${CRAWL_BUILD:-$ROOT/extension/wxt/.output/chrome-mv3}
OUT=${CRAWL_OUT:-$ROOT/extension/wxt/.output/crawl}
PROFILE=${CRAWL_PROFILE:-$HOME/.agent-browser/profiles/rate-my-ott-netflix}
DEFAULT_PAGES="https://www.netflix.com/browse
https://www.netflix.com/latest
https://www.netflix.com/browse/my-list
https://www.netflix.com/browse/genre/83
https://www.netflix.com/browse/genre/34399
https://www.netflix.com/browse/genre/6548
https://www.netflix.com/browse/genre/8711
https://www.netflix.com/browse/genre/1365
https://www.netflix.com/browse/genre/7424
https://www.netflix.com/browse/genre/5763
https://www.netflix.com/search?q=thriller
https://www.netflix.com/search?q=love"
PAGES=${CRAWL_PAGES:-$DEFAULT_PAGES}

if [ ! -f "$BUILD/manifest.json" ]; then
  echo "no build at $BUILD (run bun run build in extension/wxt first)" >&2
  exit 1
fi
command -v agent-browser >/dev/null || { echo "agent-browser is not installed" >&2; exit 1; }

mkdir -p "$OUT/shots"
EXT="$OUT/ext-$(date +%s)"
cp -R "$BUILD" "$EXT"
# The popup's id: the first 32 hex characters of the SHA-256 of the build path, mapped 0-9a-f to a-p.
ID=$(printf '%s' "$EXT" | shasum -a 256 | cut -c1-32 | tr '0123456789abcdef' 'abcdefghijklmnop')
export AGENT_BROWSER_SESSION=rmo-crawl AGENT_BROWSER_PROFILE="$PROFILE" AGENT_BROWSER_EXTENSIONS="$EXT"
unset AGENT_BROWSER_HEADED
JSONL="$OUT/crawl.jsonl"
: > "$JSONL"

ev() { agent-browser eval "$1" 2>&1 | tail -1; }
# close --all can leave the Chrome process (and its stale tabs) alive; a crawl wants a fresh one per page.
fresh() {
  agent-browser close --all >/dev/null 2>&1
  for pid in $(pgrep -f "user-data-dir=$PROFILE"); do kill "$pid" 2>/dev/null; done
  sleep 1
}

n=0
while IFS= read -r url; do
  [ -z "$url" ] && continue
  n=$((n + 1))
  fresh
  echo "[$n] $url"
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait 8000 >/dev/null 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do agent-browser scroll down 1400 >/dev/null 2>&1; agent-browser wait 900 >/dev/null 2>&1; done
  ev "window.scrollTo(0, 0)" >/dev/null
  agent-browser wait 5000 >/dev/null 2>&1
  cards=$(ev "JSON.stringify([...document.querySelectorAll('[data-rmo-id]')].filter((c) => !c.matches('.previewModal--container, .billboard')).map((c) => ({ badge: c.querySelector('.rmo-badge')?.textContent ?? null, id: c.getAttribute('data-rmo-id'), kind: c.getAttribute('data-rmo-type'), runtime: c.getAttribute('data-rmo-runtime'), surface: c.getAttribute('data-uia') || c.className.split(' ')[0], title: c.getAttribute('data-rmo-title') || c.getAttribute('aria-label') || '', year: c.getAttribute('data-rmo-year') })))")
  hovers="[]"
  for i in 0 7 19; do
    ev "(() => { document.querySelectorAll('[data-rmo-crawl]').forEach((e) => e.removeAttribute('data-rmo-crawl')); const c = [...document.querySelectorAll('[data-rmo-id][data-rmo-year]')].filter((c) => !c.matches('.previewModal--container, .billboard'))[$i]; if (!c) return; c.setAttribute('data-rmo-crawl', '1'); c.scrollIntoView({ block: 'center', inline: 'nearest' }) })()" >/dev/null
    agent-browser wait 700 >/dev/null 2>&1
    agent-browser hover "[data-rmo-crawl='1']" >/dev/null 2>&1
    agent-browser wait 3500 >/dev/null 2>&1
    h=$(ev "JSON.stringify({ badge: document.querySelector('[data-rmo-crawl=\"1\"] .rmo-badge')?.textContent ?? null, card: document.querySelector('[data-rmo-crawl=\"1\"]')?.getAttribute('data-rmo-title') ?? null, preview: document.querySelector('.previewModal--container') ? { line: document.querySelector('.previewModal--container .videoMetadata--line')?.textContent ?? null, panel: document.querySelector('.previewModal--container .rmo-panel')?.textContent ?? null } : null })")
    hovers=$(printf '%s' "$hovers" | bun -e 'const a = JSON.parse(await Bun.stdin.text()); try { a.push(JSON.parse(JSON.parse(process.argv[1]))) } catch {} console.log(JSON.stringify(a))' "$h")
    ev "document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 2, clientY: 2, bubbles: true }))" >/dev/null
    agent-browser wait 1200 >/dev/null 2>&1
  done
  agent-browser click "[data-rmo-crawl='1']" >/dev/null 2>&1
  agent-browser wait 5000 >/dev/null 2>&1
  modal=$(ev "JSON.stringify({ meta: [...document.querySelectorAll('.previewModal--container .videoMetadata--container .year, .previewModal--container .videoMetadata--container .duration')].slice(0, 2).map((e) => e.textContent).join(' '), more: [...document.querySelectorAll('.previewModal--container [data-uia=\"titleCard--container\"][data-rmo-id]')].map((c) => [c.getAttribute('aria-label'), c.querySelector('.rmo-badge')?.textContent ?? null]), row: document.querySelector('.previewModal--container .previewModal--detailsMetadata-right .rmo-panel')?.textContent ?? null })")
  agent-browser screenshot "$OUT/shots/$n-modal.png" >/dev/null 2>&1
  agent-browser press Escape >/dev/null 2>&1
  agent-browser wait 1500 >/dev/null 2>&1
  # The popup, in a second tab: open navigates the current one, and the report is the Netflix tab's.
  agent-browser tab new >/dev/null 2>&1
  agent-browser open "chrome-extension://$ID/popup.html" >/dev/null 2>&1
  agent-browser wait 4000 >/dev/null 2>&1
  report=$(ev "JSON.stringify({ groups: [...document.querySelectorAll('details')].map((d) => ({ titles: [...d.querySelectorAll('li')].map((li) => li.textContent), why: d.querySelector('summary')?.textContent?.trim() })), heading: document.querySelector('#page')?.textContent ?? null })")
  agent-browser screenshot "$OUT/shots/$n-popup.png" >/dev/null 2>&1
  bun -e '
    const [url, cards, hovers, modal, report] = process.argv.slice(1)
    const parse = (s, fallback) => { try { return JSON.parse(JSON.parse(s)) } catch { try { return JSON.parse(s) } catch { return fallback } } }
    console.log(JSON.stringify({ cards: parse(cards, []), hovers: parse(hovers, []), modal: parse(modal, null), report: parse(report, null), url }))
  ' "$url" "$cards" "$hovers" "$modal" "$report" >> "$JSONL"
  echo "  $(tail -1 "$JSONL" | bun -e 'const r = JSON.parse(await Bun.stdin.text()); console.log(`${r.cards.length} stamps, ${r.cards.filter((c) => c.badge).length} badged; popup: ${r.report?.heading ?? "no report"}`)')"
done <<< "$PAGES"
fresh
echo "done: $JSONL"
