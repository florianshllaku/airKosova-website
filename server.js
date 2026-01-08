const path = require('path');
const dotenv = require('dotenv');

// Load .env (single source of truth)
dotenv.config();

const express = require('express');
const { searchFlights } = require('./src/scraper');

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
    targetSiteHome: process.env.TARGET_SITE_HOME || 'https://sys.prishtinaticket.net/'
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

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    assetVersion: ASSET_VERSION,
    nodeEnv: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime())
  });
});

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


