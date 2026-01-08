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
- `SCRAPER_KEEP_READY=true` + `SCRAPER_REUSE_PAGE=true` (keeps one warm page open and ready for the next search)



