## AirKosova Flight Search (Playwright Scraper)

This is a small web app where users search flights in a simple UI. The backend **does not use an API**—it automates a real website with **Playwright**, scrapes the results, then shows them in this app.

### Setup

Install dependencies:

```bash
npm install
```

Install Playwright Chromium:

```bash
npm run playwright:install
```

Create `.env` from `env.example.txt`.

### Run

```bash
npm run start
```

Open `http://localhost:3000`.

### Notes

- The current scraper (`src/scraper.js`) is a **v1** aimed at a site shaped like `sys.prishtinaticket.net` (selects + `#buchen_aktion` + `#div_hin > table`).
- Tell me the exact target website + the exact selectors and I will make the automation match it perfectly.

### Speed / headless (recommended)

By default on Windows the app may open a visible browser window during scraping (slower). For faster runs, set these in `.env`:

- `OPEN_BROWSER_ON_SEARCH=false` (run headless)
- `SCRAPER_FORCE_HEADLESS=true` (force headless even if UI checkbox is enabled)
- `SCRAPER_BLOCK_RESOURCES=true` (blocks images/fonts/media)
- `SCRAPER_REUSE_BROWSER=true` (reuses a single Chromium instance across searches)
- `SCRAPER_KEEP_READY=true` (resets tabs back to the provider homepage after each scrape)
- `SCRAPER_POOL_BROWSERS=2` + `SCRAPER_POOL_TABS_PER_BROWSER=8` (enables parallel scraping; total concurrency = 16)

### Load testing + performance reports

The repo includes a simple load test script that generates an HTML report (with charts) into `reports/` which the server hosts at `/reports`.

Run (defaults: exactly 30 requests over 1 minute, max 16 in-flight):

```bash
BASE_URL=http://46.224.125.111:3000 RATE_PER_MIN=30 DURATION_MIN=5 MAX_IN_FLIGHT=16 npm run loadtest
```

To run exactly 30 requests:

```bash
BASE_URL=http://46.224.125.111:3000 TOTAL_REQUESTS=30 RATE_PER_MIN=30 DURATION_MIN=1 MAX_IN_FLIGHT=16 npm run loadtest
```

Useful endpoints:
- `GET /api/pool` shows busy/free status per browser tab
- `GET /reports` shows the report index (after you run a load test)



