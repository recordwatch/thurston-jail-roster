# Thurston County Jail Roster — Project Context

## What it is
A public jail roster monitor for Thurston County, WA. Scrapes the Sheriff's Office roster search page every 30 minutes, tracks bookings and releases, and displays them on a public website.

## URLs
- **Live site:** https://recordwatch.github.io/thurston-jail-roster/
- **GitHub repo:** https://github.com/recordwatch/thurston-jail-roster (all repos live under the `recordwatch` org — no more `theonlytacocat`)
- **Source data:** Thurston County Sheriff — https://www.co.thurston.wa.us/cm/sheriff/bureau-corrections-roster-search.asp?mod=fourth

## Architecture
- **Scraper:** `scrape.js` — standalone Node.js script, runs via GitHub Actions cron every 30 min
- **Frontend:** React + Vite, served as static files on GitHub Pages (`gh-pages` branch)
- **Data storage:** JSON files committed to git in `data/` — no server, no database
- **Hosting cost:** $0

## Key technical notes
- No CAPTCHA — plain HTTP with **axios + cheerio** (same style as Kitsap), no Playwright needed
- The roster page (`mod=fourth`) is a single unpaginated page listing every current inmate — no pagination to handle
- Each inmate has an `idnum` (e.g. `Z0072311`), used in place of a booking number — it's the only stable identifier the site exposes
- Detail pages (`mod=third&idnum=X`) only expose **charge info**: court, cause number, charge, bail, arrest date. Unlike Pierce/Kitsap, Thurston does **not** expose age/sex/race/height/weight/photo — the frontend and data model reflect that. It also has no release-type codes (RPR/RCC/etc.) like Mason, so `/stats` and `/deepstats` are built only from what Thurston does expose (see below)
- `bookingDate` is derived as the earliest `arrestDate` across a person's charges, since the roster has no explicit booking date field
- Release detection is diff-based only (no live release feed like Kitsap's XML endpoint): if an `idnum` drops off the roster page, it's marked released
- Detail fetching is incremental to be polite to a small county server: new bookings get detail fetched in a capped batch (30), and a rolling backfill (40/run) fills in detail for anyone still missing it — mirrors Pierce's approach rather than Kitsap's full-refresh-every-run approach, since Thurston's roster (~280 people) is much larger than Kitsap's

## Key files
- `scrape.js` — main scraper script, writes all `data/*.json` files
- `scrapers/thurston.js` — roster + detail page scraping logic (axios/cheerio)
- `utils.js` — `nowPST()` helper with `hourCycle: 'h23'` (prevents midnight 24:xx bug)
- `data/change_log.json` — full history of all bookings/releases
- `data/roster.json` — current roster state, keyed by `idnum`
- `data/status.json` — `{inCustody, lastUpdated}`
- `.github/workflows/scrape.yml` — GitHub Actions workflow (scrape + build + deploy)
- `frontend/src/App.jsx` — React app, HashRouter, fetches from `./data/*.json`
- `frontend/vite.config.js` — `base: './'` for GitHub Pages compatibility

## Data format
- `change_log.json` is an array of booking entries, newest first
- Each entry: `idnum`, `bookingNumber` (alias of idnum), `name`, `status` (in_custody/released), `firstSeen`, `releasedAt`, `bookingDate`, `charges[]`, `hasDetail`
- Each charge: `{ court, causeNumber, charge, bail, arrestDate }`
- `name` format: `LAST, FIRST MIDDLE`
- `firstSeen` format: "MM/DD/YYYY, HH:MM:SS" (PST)

## Color scheme
- Amber/bronze theme (distinct from Kitsap's blue and Pierce's green)
- Background: #16130F, primary accent: #A85C2E, highlight: #D9A860

## Related projects
- **Kitsap Jail Roster** — https://recordwatch.github.io/ksco-scraper/
- **Pierce County Jail Roster** — https://recordwatch.github.io/pierce-jail-roster/
- **Mason County Jail Roster** — https://alexasroster.com (also serves the wajaildata.org hub page)
- **Washington Jail Data hub** — https://wajaildata.org — landing page linking all county monitors; served from `mason-jail-roster/server.js` around line 822 (`.nav-section`). Add a new `<a class="nav-btn">` entry there once this site is live.

## Stats pages (unlisted)
- `#/stats` and `#/deepstats` are routed in `App.jsx` but deliberately not linked from the nav
- `frontend/src/utils/stats.js` — all computation, client-side from `change_log.json` (`computeStats`, `computeDeepStats`)
- `frontend/src/components/Stats.jsx`, `DeepStats.jsx` — the pages; styles are the `.stats-*` / `.bar-*` classes in `index.css`
- Charges are bucketed into 9 categories + Other by an ordered keyword list (`CHARGE_CATEGORIES`, first match wins). Thurston charge text is raw, so this is heuristic
- Bail is parsed from the per-charge string (`"$1000, BONDABLE"`, `"NO BAIL"`). The data only says bail was *set*, not that it was posted, so labels say "bail set", not "paid"
- Recidivism matches people by exact name string, so it undercounts (name variants) and the tracking window is short
- There is intentionally no bookings-by-date chart (removed — see known issue below); only day-of-week

## Known issues / TODO
- **Fix booking dates.** `bookingDate` is the earliest charge `arrestDate`, not a real booking timestamp. Consequences: day-of-week stats reflect arrest dates; ~11 entries have `bookingDate: null` and fall back to `firstSeen` (when the scraper first saw them); the Stats header "since <date>" shows old arrest dates (e.g. 1/21/2024) rather than when tracking began; time served is measured from this date. Decide on a better source (e.g. `firstSeen` for people booked since tracking began, arrest date only as a fallback) and apply it consistently in `scrape.js` and `stats.js`.
- A 298-bookings-on-one-day spike was reported on `/stats` once and never reproduced (real max was ~18/day) — probably a stale build. Re-check if it reappears.

## Local dev gotcha
`frontend/public/data/` is gitignored and only refreshed by CI (`cp data/*.json frontend/public/data/`). Before previewing locally, run that copy or the dev server shows stale data.

## Remaining setup
- Add the Thurston link to `mason-jail-roster/server.js`'s `.nav-section` (wajaildata.org hub) if not already done
