const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load .env (single source of truth)
dotenv.config();

const express = require('express');
const { searchFlights, getPoolStatus } = require('./src/scraper');

function parseBool(v, defaultValue = false) {
  if (v === undefined || v === null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

const app = express();
const PORT = process.env.PORT || 3000;
const ASSET_VERSION = process.env.ASSET_VERSION || String(Date.now());
const isProd = process.env.NODE_ENV === 'production';

function computeOpenBrowserDefault() {
  // If the scraper is forced headless, reflect that in the UI defaults.
  if (process.env.SCRAPER_FORCE_HEADLESS !== undefined && parseBool(process.env.SCRAPER_FORCE_HEADLESS, true)) {
    return false;
  }
  return process.env.OPEN_BROWSER_ON_SEARCH !== undefined
    ? parseBool(process.env.OPEN_BROWSER_ON_SEARCH, false)
    : (process.platform === 'win32');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In dev, disable caching for ALL responses (HTML + API) so you always see latest changes.
if (!isProd) {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
}

// In dev, disable caching so changes to JS/CSS/templates show up immediately.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: isProd,
  lastModified: isProd,
  maxAge: isProd ? '7d' : 0,
  setHeaders: (res) => {
    if (!isProd) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => {
  res.render('index', {
    assetVersion: ASSET_VERSION,
    openBrowserOnSearch: computeOpenBrowserDefault(),
    // Default to closing ASAP; user can still override via the UI input if needed for debugging.
    keepBrowserOpenMs: Math.max(0, parseInt(process.env.KEEP_BROWSER_OPEN_MS || '0', 10) || 0),
    targetSiteHome: process.env.TARGET_SITE_HOME || 'https://sys.prishtinaticket.net/',
    // Supabase credentials for auth
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.get('/results', (req, res) => {
  res.render('results', {
    assetVersion: ASSET_VERSION,
    // Default to closing ASAP; user can override with the UI "Keep open" input if needed.
    openBrowserOnSearch: computeOpenBrowserDefault(),
    keepBrowserOpenMs: Math.max(0, parseInt(process.env.KEEP_BROWSER_OPEN_MS || '0', 10) || 0),
    targetSiteHome: process.env.TARGET_SITE_HOME || 'https://sys.prishtinaticket.net/'
  });
});

app.get('/booking', (req, res) => {
  res.render('booking', {
    assetVersion: ASSET_VERSION,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

// Information pages
app.get('/info/siguria', (req, res) => {
  res.render('info-siguria', { assetVersion: ASSET_VERSION });
});

app.get('/info/para-udhetimit', (req, res) => {
  res.render('info-para-udhetimit', { assetVersion: ASSET_VERSION });
});

app.get('/info/e-biletat', (req, res) => {
  res.render('info-e-biletat', { assetVersion: ASSET_VERSION });
});

app.get('/info/bagazhi', (req, res) => {
  res.render('info-bagazhi', { assetVersion: ASSET_VERSION });
});

app.get('/info/shendeti', (req, res) => {
  res.render('info-shendeti', { assetVersion: ASSET_VERSION });
});

// Contact page
app.get('/kontakt', (req, res) => {
  res.render('kontakt', { assetVersion: ASSET_VERSION });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    assetVersion: ASSET_VERSION,
    nodeEnv: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime())
  });
});

app.get('/api/pool', (req, res) => {
  res.json({ ok: true, pool: getPoolStatus() });
});

// Host performance/load-test reports
const REPORTS_DIR = path.join(__dirname, 'reports');
try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch (_) {}
app.get(['/reports', '/reports/'], (req, res) => {
  // If a generated index.html exists (created by the load test script), serve it.
  const indexPath = path.join(REPORTS_DIR, 'index.html');
  try {
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  } catch (_) {}

  // Otherwise show a simple listing/instructions instead of "Cannot GET /reports/".
  let runs = [];
  try {
    runs = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('run-'))
      .map((d) => d.name)
      .sort()
      .reverse();
  } catch (_) {}

  const items = runs.length
    ? runs.map((name) => `<li><a href="/reports/${name}/report.html">${name}</a> (<a href="/reports/${name}/summary.json">summary</a>)</li>`).join('')
    : '<li><em>No reports yet.</em> Run the load test to generate them.</li>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AirKosova Reports</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:20px} .muted{color:#666}</style>
</head><body>
  <h2>AirKosova Reports</h2>
  <div class="muted">No generated <code>reports/index.html</code> found yet.</div>
  <p class="muted">Generate reports by running the load test on this server:</p>
  <pre>BASE_URL=http://46.224.125.111:3000 RATE_PER_MIN=30 DURATION_MIN=5 MAX_IN_FLIGHT=16 npm run loadtest</pre>
  <h3>Runs</h3>
  <ul>${items}</ul>
</body></html>`);
});
app.use('/reports', express.static(REPORTS_DIR, {
  index: ['index.html']
}));

app.post('/api/search', async (req, res) => {
  try {
    const payload = await searchFlights({
      departure: req.body.departure,
      destination: req.body.destination,
      departureDate: req.body.departureDate,
      returnDate: req.body.returnDate,
      tripType: req.body.tripType,
      adults: req.body.adults,
      children: req.body.children,
      infants: req.body.infants,
      openBrowser: parseBool(req.body.openBrowser, false),
      keepBrowserOpenMs: Math.max(0, parseInt(req.body.keepBrowserOpenMs || '0', 10) || 0)
    });

    res.json({ success: true, data: payload });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`🛫 Server running: http://localhost:${PORT}`);
  console.log(`🔖 Asset version: ${ASSET_VERSION} (pid=${process.pid})`);
});


