const { chromium } = require('playwright');

function parseBool(v, defaultValue = false) {
  if (v === undefined || v === null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==========================================================
// Playwright pool: N browsers × M tabs (pages) each
// ==========================================================
let _pool = null;
let _poolLaunching = null;

function clampEnvInt(val, min, max, fallback) {
  const n = parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function closePool() {
  const p = _pool;
  _pool = null;
  _poolLaunching = null;
  if (!p) return;
  for (const b of (p.browsers || [])) {
    try { await b.browser?.close(); } catch (_) {}
  }
}

function getPoolStatus() {
  const p = _pool;
  if (!p) {
    return {
      initialized: false,
      key: null,
      headless: null,
      targetHome: null,
      browsers: [],
      waiters: 0
    };
  }

  const browsers = (p.browsers || []).map((b) => {
    const tabs = (b.pages || []).map((t) => ({
      tabIndex: t.index,
      busy: !!t.busy,
      warmed: !!t.warmed,
      lastAcquireAtMs: t.lastAcquireAtMs || null,
      lastReleaseAtMs: t.lastReleaseAtMs || null,
      lastUrl: t.lastUrl || null,
      lastError: t.lastError || null
    }));
    const busyCount = tabs.filter((x) => x.busy).length;
    return {
      browserIndex: b.index,
      busyCount,
      tabsCount: tabs.length,
      tabs
    };
  });

  const totalTabs = browsers.reduce((s, b) => s + b.tabsCount, 0);
  const totalBusy = browsers.reduce((s, b) => s + b.busyCount, 0);

  return {
    initialized: true,
    key: p.key,
    headless: p.headless,
    targetHome: p.targetHome,
    totalTabs,
    totalBusy,
    totalFree: Math.max(0, totalTabs - totalBusy),
    waiters: (p.waiters || []).length,
    browsers
  };
}

// Best-effort cleanup on shutdown.
process.once('SIGINT', () => { closePool().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { closePool().finally(() => process.exit(0)); });
process.once('beforeExit', () => { closePool().catch(() => {}); });

async function ensurePool({
  headless,
  launchArgs,
  viewport,
  targetHome,
  blockResources,
  fastMode
}) {
  const browsersCount = clampEnvInt(process.env.SCRAPER_POOL_BROWSERS, 1, 8, 2);
  const tabsPerBrowser = clampEnvInt(process.env.SCRAPER_POOL_TABS_PER_BROWSER, 1, 32, 8);
  const warmup = parseBool(process.env.SCRAPER_POOL_WARMUP, true);

  const key = `${headless ? 'H' : 'V'}|${launchArgs.join(' ')}`;
  if (_pool && _pool.key === key) return _pool;
  if (_poolLaunching) return await _poolLaunching;

  _poolLaunching = (async () => {
    if (_pool) await closePool();

    const browsers = [];
    for (let bi = 0; bi < browsersCount; bi++) {
      const browser = await chromium.launch({ headless, args: launchArgs });
      const context = await browser.newContext({ viewport });

      if (blockResources) {
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'image' || type === 'media' || type === 'font') return route.abort();
          return route.continue();
        });
      }

      const pages = [];
      for (let pi = 0; pi < tabsPerBrowser; pi++) {
        const page = await context.newPage();
        if (fastMode) {
          page.setDefaultTimeout(30000);
          page.setDefaultNavigationTimeout(60000);
        }
        pages.push({ index: pi, page, busy: false, warmed: false, lastAcquireAtMs: null, lastReleaseAtMs: null, lastUrl: null, lastError: null });
      }

      browsers.push({ index: bi, browser, context, pages });
    }

    const pool = { key, headless, browsers, waiters: [], warmup, targetHome };

    if (warmup) {
      const FROM_SELECT = '#buchungen_buchen_form > div:nth-child(3) > select';
      await Promise.all(
        browsers.flatMap((b) =>
          b.pages.map(async (p) => {
            try {
              await p.page.goto(targetHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
              await p.page.locator(FROM_SELECT).first().waitFor({ state: 'visible', timeout: 30000 });
              p.warmed = true;
            } catch (_) {
              p.warmed = false;
            }
          })
        )
      );
    }

    _pool = pool;
    return pool;
  })();

  try {
    return await _poolLaunching;
  } finally {
    _poolLaunching = null;
  }
}

async function acquireTab(pool) {
  for (const b of pool.browsers) {
    for (const p of b.pages) {
      if (!p.busy) {
        p.busy = true;
        p.lastAcquireAtMs = Date.now();
        return { browserIndex: b.index, tabIndex: p.index, context: b.context, page: p.page, _ref: p };
      }
    }
  }
  return await new Promise((resolve) => {
    pool.waiters.push(resolve);
  });
}

function releaseTab(pool, handle) {
  if (!pool || !handle || !handle._ref) return;
  handle._ref.busy = false;
  handle._ref.lastReleaseAtMs = Date.now();
  const next = pool.waiters.shift();
  if (next) {
    handle._ref.busy = true;
    handle._ref.lastAcquireAtMs = Date.now();
    next(handle);
  }
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseISODate(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const monthIndex = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  return { year, monthIndex, day };
}

function monthIndexFromName(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const m3 = s.slice(0, 3);
  const map = {
    jan: 0,
    feb: 1,
    mar: 2,
    'mär': 2,
    mrz: 2,
    apr: 3,
    may: 4,
    mai: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    okt: 9,
    nov: 10,
    dec: 11,
    dez: 11
  };
  return map[m3];
}

async function pickFlatpickrDate(page, inputSelector, isoDate) {
  const target = parseISODate(isoDate);
  if (!target) throw new Error(`Invalid date for ${inputSelector}. Use YYYY-MM-DD.`);

  // Your selectors (month/year/next-month inside the open flatpickr calendar)
  const CAL_ROOT = 'body > div.flatpickr-calendar.animate.open';
  const MONTH_SEL = `${CAL_ROOT} > div.flatpickr-months > div > div > select`;
  const YEAR_INPUT = `${CAL_ROOT} > div.flatpickr-months > div > div > div > input`;
  const NEXT_BTN = `${CAL_ROOT} > div.flatpickr-months > span.flatpickr-next-month > svg, ${CAL_ROOT} span.flatpickr-next-month`;

  const input = page.locator(inputSelector).first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click({ timeout: 30000 });

  const cal = page.locator(CAL_ROOT).first();
  await cal.waitFor({ state: 'visible', timeout: 30000 });

  const readState = async () => {
    return await page.evaluate(({ monthSel, yearInput }) => {
      const mSel = document.querySelector(monthSel);
      const yInp = document.querySelector(yearInput);
      const monthIndex =
        mSel && typeof mSel.selectedIndex === 'number' ? mSel.selectedIndex : -1;
      const year =
        yInp && yInp.value ? parseInt(String(yInp.value).replace(/[^0-9]/g, ''), 10) : NaN;
      return { monthIndex, year };
    }, { monthSel: MONTH_SEL, yearInput: YEAR_INPUT });
  };

  // Navigate forward (click next-month) until we reach target month+year
  for (let i = 0; i < 48; i++) {
    const cur = await readState();
    if (!Number.isFinite(cur.year) || cur.monthIndex < 0) break;

    const curKey = cur.year * 12 + cur.monthIndex;
    const tgtKey = target.year * 12 + target.monthIndex;
    if (curKey === tgtKey) break;
    if (curKey > tgtKey) {
      throw new Error(`Calendar is ahead of target date (cur=${cur.year}-${cur.monthIndex + 1}, target=${target.year}-${target.monthIndex + 1})`);
    }

    await page.locator(NEXT_BTN).first().click({ timeout: 30000 });
    await page.waitForTimeout(80);
  }

  // Click the day in the current month grid
  const clicked = await page.evaluate(({ calRoot, day }) => {
    const root = document.querySelector(calRoot);
    if (!root) return false;
    const days = Array.from(root.querySelectorAll('.flatpickr-day'))
      .filter((el) =>
        !el.classList.contains('prevMonthDay') &&
        !el.classList.contains('nextMonthDay') &&
        !el.classList.contains('disabled')
      );
    const hit = days.find((el) => (el.textContent || '').trim() === String(day));
    if (!hit) return false;
    hit.click();
    return true;
  }, { calRoot: CAL_ROOT, day: target.day });

  if (!clicked) {
    throw new Error(`Could not click day ${target.day} for ${target.year}-${String(target.monthIndex + 1).padStart(2, '0')}`);
  }

  await page.waitForTimeout(80);
}

// Step 1 only: automate sys.prishtinaticket.net form completion + click Search.
// (No scraping yet; we’ll do that next after you confirm the automation is correct.)
async function searchFlights(input) {
  const targetHome = process.env.TARGET_SITE_HOME || 'https://sys.prishtinaticket.net/';

  const openBrowserDefault =
    process.env.OPEN_BROWSER_ON_SEARCH !== undefined
      ? parseBool(process.env.OPEN_BROWSER_ON_SEARCH, false)
      : (process.platform === 'win32');

  // Force headless via env if desired (useful for speeding up Windows defaults).
  // If not set, we use the UI checkbox (input.openBrowser) / OPEN_BROWSER_ON_SEARCH fallback.
  const forceHeadless =
    process.env.SCRAPER_FORCE_HEADLESS !== undefined
      ? parseBool(process.env.SCRAPER_FORCE_HEADLESS, true)
      : null;
  const headless =
    typeof forceHeadless === 'boolean'
      ? forceHeadless
      : !(input.openBrowser || openBrowserDefault);

  // Speed knobs (safe defaults): enable "fast mode" automatically when running headless,
  // and optionally block images/fonts/media to reduce bandwidth/CPU.
  const fastMode = parseBool(process.env.SCRAPER_FAST_MODE, headless);
  const blockResources = parseBool(process.env.SCRAPER_BLOCK_RESOURCES, fastMode);
  const keepReady = parseBool(process.env.SCRAPER_KEEP_READY, true);

  // Close the browser as soon as scraping finishes (default).
  // If you need to visually debug, set keepBrowserOpenMs > 0 in the UI (or KEEP_BROWSER_OPEN_MS in env).
  const keepMsDefault = Math.max(0, parseInt(process.env.KEEP_BROWSER_OPEN_MS || '0', 10) || 0);
  const requestedKeepMs = Math.max(0, Number(input.keepBrowserOpenMs) || 0);
  const keepMsEffective = Math.min(120000, requestedKeepMs || keepMsDefault || 0);

  async function waitForRowCountToStabilize(page, tableSelector, {
    timeoutMs = 20000,
    pollMs = 300,
    stableRounds = 4
  } = {}) {
    const start = Date.now();
    let last = -1;
    let stable = 0;
    while (Date.now() - start < timeoutMs) {
      const count = await page.locator(`${tableSelector} > tr`).count().catch(() => 0);
      if (count === last) stable++;
      else stable = 0;
      last = count;
      if (stable >= stableRounds) return count;
      await page.waitForTimeout(pollMs).catch(() => {});
    }
    return last;
  }

  const launchArgs = ['--window-size=1280,900'];
  const viewport = { width: 1280, height: 900 };
  const pool = await ensurePool({ headless, launchArgs, viewport, targetHome, blockResources, fastMode });
  const handle = await acquireTab(pool);

  const run = async () => {
    const context = handle.context;
    const page = handle.page;
    const t0 = Date.now();
    let tHome = null;
    let tFormFilled = null;
    let tTablesReady = null;
    let tStabilized = null;
    let tScraped = null;
    let tReset = null;

    try {
      if (fastMode) {
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(60000);
      }

      // === From / To selects ===
      const FROM_SELECT = '#buchungen_buchen_form > div:nth-child(3) > select';
      const HOME_LOGO_SEL = '#header > nav > ul > li.title > a > img';
      const HOME_LINK_SEL = '#header > nav > ul > li.title > a';

      // Ensure we're on the home form and ready. If we're already there (warm page), skip navigation.
      const isHomeReady = await page.locator(FROM_SELECT).count().catch(() => 0);
      if (!isHomeReady) {
        await page.goto(targetHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.locator(FROM_SELECT).first().waitFor({ state: 'visible', timeout: 30000 });
      }
      if (handle._ref) handle._ref.warmed = true;
      tHome = Date.now();

    // === Trip type radio ===
    const tripType = String(input.tripType || 'roundtrip').toLowerCase();
    const ROUNDTRIP_SEL = '#FLGARTHin-\\ und\\ Rück\\ ';
    const ONEWAY_SEL = '#FLGARTNur\\ Hinreise';

    await page.evaluate(({ tripType, ROUNDTRIP_SEL, ONEWAY_SEL }) => {
      const tryClick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        try { el.click(); return true; } catch (_) { return false; }
      };
      if (tripType === 'oneway') tryClick(ONEWAY_SEL);
      else tryClick(ROUNDTRIP_SEL);
    }, { tripType, ROUNDTRIP_SEL, ONEWAY_SEL });

    const TO_SELECT = '#buchungen_buchen_form > div:nth-child(4) > select';

    const allowedCodes = new Set([
      'PRN','BSL','BER','BRE','BRU','DTM','DUS','GVA','GOT','HAM','HAJ','HEL','CGN','LJU','LUX','MMX','FMM',
      'BGY','MUC','FMO','NUE','OSL','SZG','ARN','STR','VXO','VIE','ZRH'
    ]);

    const fromCode = String(input.departure || '').trim();
    const toCode = String(input.destination || '').trim();
    if (!fromCode || !toCode) throw new Error('Missing departure/destination.');
    if (!allowedCodes.has(fromCode) || !allowedCodes.has(toCode)) {
      throw new Error(`Unsupported airport code(s). from=${fromCode}, to=${toCode}`);
    }

    await page.locator(FROM_SELECT).first().selectOption({ value: fromCode });
    await sleep(120);
    await page.locator(TO_SELECT).first().selectOption({ value: toCode });

    // === Dates via flatpickr ===
    const depDate = String(input.departureDate || '').trim();
    const retDate = String(input.returnDate || '').trim();
    if (!depDate) throw new Error('Missing departureDate (YYYY-MM-DD)');
    if (tripType !== 'oneway' && !retDate) throw new Error('Missing returnDate for roundtrip search (YYYY-MM-DD)');

    await pickFlatpickrDate(page, '#DATUM_HIN_input', depDate);
    if (tripType !== 'oneway' && retDate) {
      await pickFlatpickrDate(page, '#DATUM_RUK_input', retDate);
    }

    // === Passengers ===
    const adults = clampInt(input.adults, 1, 5, 1);
    const children = clampInt(input.children, 0, 5, 0);
    const infants = clampInt(input.infants, 0, 5, 0);

    const ADULT_SELECT = '#buchungen_buchen_form > div:nth-child(9) > div:nth-child(1) > label > select';
    const CHILD_SELECT = '#buchungen_buchen_form > div:nth-child(9) > div:nth-child(2) > label > select';
    const INFANT_SELECT = '#buchungen_buchen_form > div:nth-child(9) > div:nth-child(3) > label > select';

    await page.locator(ADULT_SELECT).first().selectOption({ value: String(adults) });
    if (children > 0) await page.locator(CHILD_SELECT).first().selectOption({ value: String(children) });
    if (infants > 0) await page.locator(INFANT_SELECT).first().selectOption({ value: String(infants) });
    tFormFilled = Date.now();

    // === Click search button ===
    // Use the exact selector you provided (document.querySelector("#buchen_aktion")).
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('#buchen_aktion');
      if (!btn) return false;
      try { btn.click(); return true; } catch (_) { return false; }
    });
    if (!clicked) throw new Error('Search button not found/clickable: #buchen_aktion');
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
    // Small pause so the results view is visible even on fast machines
    await page.waitForTimeout(fastMode ? 150 : 800);

    // Wait for results tables TBODY (outbound required).
    // IMPORTANT: do NOT swallow this wait; if it fails, we want a clear error (not a misleading empty result).
    await page.waitForSelector('#div_hin > table > tbody', { timeout: 90000 });
    if (tripType !== 'oneway') {
      // For roundtrip, require SOME return tbody. The site sometimes uses a slightly different table nesting.
      await page.waitForSelector('#div_ruk > table > tbody, #div_ruk table tbody', { timeout: 90000 });
    }
    tTablesReady = Date.now();

    // Give the page time to finish populating the TBODY rows (they can load progressively).
    await waitForRowCountToStabilize(page, '#div_hin > table > tbody', {
      timeoutMs: fastMode ? 25000 : 40000,
      pollMs: fastMode ? 200 : 300,
      stableRounds: fastMode ? 3 : 4
    });
    if (tripType !== 'oneway') {
      // Stabilize whichever return tbody exists; prefer the strict selector first.
      const hasStrictReturnTbody = await page.locator('#div_ruk > table > tbody').count().catch(() => 0);
      const returnTbodySel = hasStrictReturnTbody ? '#div_ruk > table > tbody' : '#div_ruk table tbody';
      await waitForRowCountToStabilize(page, returnTbodySel, {
        timeoutMs: fastMode ? 40000 : 60000,
        pollMs: fastMode ? 200 : 300,
        stableRounds: fastMode ? 3 : 4
      });
    }

    // Some flows only populate the return table AFTER an outbound option is selected.
    // If return tbody exists but is still empty, click the first outbound option and wait again.
    if (tripType !== 'oneway') {
      const outRowCount = await page.locator('#div_hin > table > tbody > tr').count().catch(() => 0);
      const hasStrictReturnTbody = await page.locator('#div_ruk > table > tbody').count().catch(() => 0);
      const returnTbodySel = hasStrictReturnTbody ? '#div_ruk > table > tbody' : '#div_ruk table tbody';
      let retRowCount = await page.locator(`${returnTbodySel} > tr`).count().catch(() => 0);

      if (outRowCount > 0 && retRowCount === 0) {
        const radio = page.locator('#div_hin > table > tbody input[type="radio"]').first();
        const radioCount = await radio.count().catch(() => 0);

        if (radioCount > 0) {
          // Prefer "check" when possible; fall back to click.
          await radio.check({ timeout: 10000, force: true }).catch(async () => {
            await radio.click({ timeout: 10000, force: true });
          });
        } else {
          // Fall back: click first row
          await page.locator('#div_hin > table > tbody > tr').first().click({ timeout: 10000, force: true }).catch(() => {});
        }

        // Wait until at least 1 return row appears, then stabilize.
        await page.waitForFunction(() => {
          const tbody = document.querySelector('#div_ruk > table > tbody') || document.querySelector('#div_ruk table tbody');
          if (!tbody) return false;
          return tbody.querySelectorAll('tr').length > 0;
        }, { timeout: 60000 }).catch(() => {});

        await waitForRowCountToStabilize(page, returnTbodySel, { timeoutMs: 60000 });
        retRowCount = await page.locator(`${returnTbodySel} > tr`).count().catch(() => 0);
      }
    }
    tStabilized = Date.now();

    const dep = parseISODate(depDate);
    const ret = retDate ? parseISODate(retDate) : null;
    const depYear = dep?.year || new Date().getFullYear();
    const retYear = ret?.year || depYear;

    // Extract + group all rows by date (entire table, not just the selected date).
    const scraped = await page.evaluate(({ depYear, retYear }) => {
      function normalizePriceNumber(raw) {
        if (!raw) return null;
        let s = String(raw).trim();
        s = s.replace(/\u00A0/g, ' ').replace(/\s+/g, '');
        s = s.replace(/[€]/g, '').replace(/CHF/gi, '').replace(/EUR/gi, '');
        const hasDot = s.includes('.');
        const hasComma = s.includes(',');
        if (hasDot && hasComma) {
          if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
          else s = s.replace(/,/g, '');
        } else if (hasComma && !hasDot) {
          const parts = s.split(',');
          if (parts.length === 2 && parts[1].length <= 2) s = parts[0] + '.' + parts[1];
          else s = s.replace(/,/g, '');
        }
        s = s.replace(/[^0-9.]/g, '');
        return s || null;
      }

      function parsePrice(text) {
        const t = (text || '').replace(/\u00A0/g, ' ');
        let m = t.match(/(CHF|EUR|€)\s*([0-9][0-9.,]*)/i);
        if (m) return { currency: m[1] === '€' ? 'EUR' : m[1].toUpperCase(), price: normalizePriceNumber(m[2]) };
        m = t.match(/([0-9][0-9.,]*)\s*(CHF|EUR|€)/i);
        if (m) return { currency: m[2] === '€' ? 'EUR' : m[2].toUpperCase(), price: normalizePriceNumber(m[1]) };
        return null;
      }

      function monthIndexFromName(raw) {
        const s = String(raw || '').trim().toLowerCase();
        const m3 = s.slice(0, 3);
        const map = {
          jan: 0,
          feb: 1,
          mar: 2,
          'mär': 2,
          mrz: 2,
          apr: 3,
          may: 4,
          mai: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          okt: 9,
          nov: 10,
          dec: 11,
          dez: 11
        };
        return map[m3];
      }

      function parseDateCell(text, baseYear) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();

        // Numeric dates from the site, e.g. "Sa 28.03" or "Do 26.03" or "28.03"
        // (ignore weekday prefix; interpret as dd.mm in the selected year)
        const mNum = t.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
        if (mNum) {
          const day = parseInt(mNum[1], 10);
          const mon1 = parseInt(mNum[2], 10); // 1-12
          const yearFromText = mNum[3] ? parseInt(mNum[3], 10) : NaN;
          const yyyy = Number.isFinite(yearFromText) ? yearFromText : (Number.isFinite(baseYear) ? baseYear : new Date().getFullYear());
          if (Number.isFinite(day) && Number.isFinite(mon1) && mon1 >= 1 && mon1 <= 12) {
            const mm = String(mon1).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const label = `${dd} ${monthNames[mon1 - 1]}`;
            return { key: `${yyyy}-${mm}-${dd}`, label };
          }
        }

        // Month-name dates, e.g. "Wed. 14 Jan" / "Sa. 17 Jan" / "14 Jan"
        const m = t.match(/(\d{1,2})\s+([A-Za-zÄÖÜäöü]{3,})/);
        if (!m) return { key: t || '', label: t || '' };
        const day = parseInt(m[1], 10);
        const mon = monthIndexFromName(m[2]);
        if (!Number.isFinite(day) || !Number.isFinite(mon)) return { key: t || String(day), label: t || String(day) };
        const yyyy = Number.isFinite(baseYear) ? baseYear : new Date().getFullYear();
        const mm = String(mon + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return { key: `${yyyy}-${mm}-${dd}`, label: `${dd} ${m[2]}` };
      }

      function minutesBetween(dep, arr) {
        const toMin = (x) => {
          const p = String(x || '').split(':');
          if (p.length !== 2) return null;
          const h = parseInt(p[0], 10);
          const m = parseInt(p[1], 10);
          if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
          return h * 60 + m;
        };
        const a = toMin(dep);
        const b = toMin(arr);
        if (a === null || b === null) return null;
        let d = b - a;
        if (d < 0) d += 24 * 60;
        return d;
      }

      function fmtDuration(mins) {
        if (!Number.isFinite(mins) || mins <= 0) return '';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
      }

      function parseTable(tbodySelectorOrList, baseYear) {
        const candidates = Array.isArray(tbodySelectorOrList) ? tbodySelectorOrList : [tbodySelectorOrList];
        let usedSelector = null;
        let tbody = null;
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el) { usedSelector = sel; tbody = el; break; }
        }
        const byDate = {};
        const datesMeta = {};
        if (!tbody) {
          return {
            byDate,
            dates: [],
            rawRows: [],
            debug: {
              hasTable: false,
              usedSelector,
              rowCount: 0,
              parsedRowCount: 0,
              skippedRowCount: 0,
              sampleRows: [],
              // Extra DOM debug (helps when site changes markup)
              cellCounts: [],
              firstRowHtml: null,
              firstRowText: null
            }
          };
        }

        const allTr = Array.from(tbody.querySelectorAll('tr')).filter(Boolean);
        const rawRows = allTr.map((tr) => {
          // Some tables use <th> for the first cell; include both.
          const cells = Array.from(tr.querySelectorAll('td,th'));
          return cells.map((cell) => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim());
        });

        // "Parsable" rows: at least 4 columns (date, time, flightNo, price)
        const rows = allTr.filter((tr) => tr && tr.querySelectorAll('td,th').length >= 4);

        // You asked to output all rows, not just the first 5.
        const sampleRows = rawRows.map((cols) => cols.slice(0, 4));
        const cellCounts = allTr.slice(0, 25).map((tr) => tr.querySelectorAll('td,th').length);
        const firstTr = allTr[0] || null;
        const firstRowHtml = firstTr ? firstTr.innerHTML : null;
        const firstRowText = firstTr ? (firstTr.innerText || firstTr.textContent || '').replace(/\s+/g, ' ').trim() : null;
        let parsedRowCount = 0;
        let skippedRowCount = 0;

        for (const tr of rows) {
          const tds = tr.querySelectorAll('td,th');
          const dateTxt = (tds[0].innerText || tds[0].textContent || '').trim();
          const timeTxt = (tds[1].innerText || tds[1].textContent || '').trim();
          const flightNoTxt = (tds[2].innerText || tds[2].textContent || '').trim();
          const priceTxt = (tds[3].innerText || tds[3].textContent || '').trim();

          // Accept "11:40", "11.40" etc; normalize "." -> ":"
          const times = (timeTxt.match(/\b\d{1,2}[:.]\d{2}\b/g) || []).map((x) => x.replace('.', ':'));
          if (times.length < 2) { skippedRowCount++; continue; }

          const dKey = parseDateCell(dateTxt, baseYear);
          const p = parsePrice(priceTxt);
          const duration = fmtDuration(minutesBetween(times[0], times[1]));
          const soldOut = /\bsold\s*out\b/i.test(priceTxt) || /\bausgebucht\b/i.test(priceTxt);

          const flight = {
            dateKey: dKey.key,
            dateLabel: dKey.label,
            departureTime: times[0],
            arrivalTime: times[1],
            duration,
            flightNumber: flightNoTxt || null,
            soldOut,
            priceText: priceTxt || null,
            price: p?.price || null,
            currency: p?.currency || null
          };

          if (!byDate[dKey.key]) byDate[dKey.key] = [];
          byDate[dKey.key].push(flight);
          parsedRowCount++;

          if (!datesMeta[dKey.key]) {
            datesMeta[dKey.key] = { key: dKey.key, label: dKey.label, minPrice: null, currency: null };
          }
          if (flight.price && flight.currency) {
            const num = parseFloat(flight.price);
            if (Number.isFinite(num)) {
              if (datesMeta[dKey.key].minPrice === null || num < datesMeta[dKey.key].minPrice) {
                datesMeta[dKey.key].minPrice = num;
                datesMeta[dKey.key].currency = flight.currency;
              }
            }
          }
        }

        // Sort flights within each date by departure time
        for (const k of Object.keys(byDate)) {
          byDate[k].sort((a, b) => String(a.departureTime).localeCompare(String(b.departureTime)));
        }

        const dates = Object.values(datesMeta).sort((a, b) => String(a.key).localeCompare(String(b.key)));
        return {
          byDate,
          dates,
          rawRows,
          // rowCount = total rows in tbody (not only parsable rows)
          debug: {
            hasTable: true,
            usedSelector,
            rowCount: allTr.length,
            parsedRowCount,
            skippedRowCount,
            sampleRows,
            cellCounts,
            firstRowHtml,
            firstRowText
          }
        };
      }

      return {
        outbound: parseTable(['#div_hin > table > tbody', '#div_hin table tbody'], depYear),
        return: parseTable(['#div_ruk > table > tbody', '#div_ruk table tbody'], retYear)
      };
    }, { depYear, retYear });
    tScraped = Date.now();

    // Keep browser open (headed) if requested
    if (!headless && keepMsEffective > 0) {
      await sleep(keepMsEffective);
    }

    // Keep the page warm and ready for the next search (go back home and idle).
      if (keepReady) {
        try {
          // After scraping we want to *actively* return to the provider homepage (for the next search).
          // Prefer clicking the site's logo/link; fall back to goto if that fails.
          const tryLogoClick = async () => {
            const linkCount = await page.locator(HOME_LINK_SEL).count().catch(() => 0);
            if (linkCount > 0) {
              await page.locator(HOME_LINK_SEL).first().click({ timeout: 15000, force: true }).catch(() => {});
              await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
              return true;
            }
            const logoCount = await page.locator(HOME_LOGO_SEL).count().catch(() => 0);
            if (logoCount > 0) {
              await page.locator(HOME_LOGO_SEL).first().click({ timeout: 15000, force: true }).catch(() => {});
              await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
              return true;
            }
            return false;
          };

          const clicked = await tryLogoClick().catch(() => false);
          const readyAfterClick = await page.locator(FROM_SELECT).count().catch(() => 0);
          if (!readyAfterClick) {
            // If click didn't navigate to the form, hard reset via navigation.
            await page.goto(targetHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
          }
          await page.locator(FROM_SELECT).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
        } catch (_) {
          if (handle._ref) handle._ref.warmed = false;
        }
      }
      tReset = Date.now();

    return {
      meta: {
        targetHome,
        headless,
        url: page.url(),
        warmPage: true,
        keepReady: !!keepReady,
        pool: {
          browsers: pool.browsers.length,
          tabsPerBrowser: pool.browsers[0]?.pages?.length || 0,
          browserIndex: handle.browserIndex,
          tabIndex: handle.tabIndex
        },
        timingsMs: (() => {
          const safe = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x : null;
          const home = safe(tHome);
          const form = safe(tFormFilled);
          const tables = safe(tTablesReady);
          const stab = safe(tStabilized);
          const scrapedAt = safe(tScraped);
          const resetAt = safe(tReset);

          const end = (keepReady && resetAt) ? resetAt : (scrapedAt || Date.now());
          const out = {
            totalMs: end - t0
          };
          if (home) out.homeReadyMs = home - t0;
          if (home && form) out.fillFormMs = form - home;
          if (form && tables) out.waitResultsMs = tables - form;
          if (tables && stab) out.stabilizeMs = stab - tables;
          if (stab && scrapedAt) out.scrapeEvalMs = scrapedAt - stab;
          if (scrapedAt && resetAt) out.resetHomeMs = resetAt - scrapedAt;
          return out;
        })()
      },
      request: input,
      flights: scraped
    };
    } finally {
      try { if (handle && handle._ref) handle._ref.lastUrl = handle.page?.url?.() || null; } catch (_) {}
      releaseTab(pool, handle);
    }
  };
  return await run();
}

module.exports = { searchFlights, getPoolStatus };


