const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

function tr(key, fallback) {
  try {
    if (typeof window.t === 'function') return window.t(key);
  } catch (_) {}
  return fallback || key;
}

function setStatus({ text = '', hint = '', loading = false, isError = false } = {}) {
  if (!statusEl) return;
  const textEl = statusEl.querySelector('.status-text');
  const hintEl = statusEl.querySelector('.status-hint');

  // Support legacy markup (in case status-text isn't present)
  if (textEl) textEl.textContent = String(text || '');
  else statusEl.textContent = String(text || '');

  if (hintEl) {
    hintEl.textContent = String(hint || '');
    hintEl.style.display = hint ? '' : 'none';
  }

  statusEl.classList.toggle('err', !!isError);
  statusEl.classList.toggle('loading', !!loading && !isError);
  statusEl.style.display = text ? '' : 'none';
}

function setStatusKeys(textKey, hintKey, isError = false) {
  setStatus({
    text: tr(textKey),
    hint: hintKey ? tr(hintKey) : '',
    loading: !isError && (textKey === 'searching' || textKey === 'searching_long'),
    isError
  });
}

function epochNowMs() {
  // High-accuracy epoch time when available (important across navigations)
  if (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number' && typeof performance.now === 'function') {
    return performance.timeOrigin + performance.now();
  }
  return Date.now();
}

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function afterNextPaint() {
  // Ensure the DOM has actually painted before we stop the timer.
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function fetchHealthLine() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = await r.json();
    if (!j || !j.ok) return '';
    const pidEl = document.getElementById('buildPid');
    if (pidEl) pidEl.textContent = `pid: ${j.pid}`;
    return `server pid=${j.pid}, assetVersion=${j.assetVersion}`;
  } catch (_) {
    return '';
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = getEl(id);
  if (!el) return;
  el.textContent = text == null ? '—' : String(text);
}

// Global currency symbol helper
function currencySymbol(cur) {
  const c = String(cur || '').toUpperCase();
  if (c === 'EUR') return '€';
  if (c === 'CHF') return 'CHF';
  return c || '';
}

function renderFlights(data) {
  const outbound = data?.flights?.outbound || {};
  const inbound = data?.flights?.return || {};
  const tripType = String(data?.request?.tripType || 'roundtrip').toLowerCase();
  const selectedDepKey = String(data?.request?.departureDate || '').trim();
  const selectedRetKey = String(data?.request?.returnDate || '').trim();
  const fromCode = String(data?.request?.departure || '').trim();
  const toCode = String(data?.request?.destination || '').trim();
  const labels = (window.AK_AIRPORTS || {});
  const t = data?.meta?.timingsMs || null;
  const timingLine =
    t && typeof t === 'object'
      ? [
          t.totalMs != null ? `total=${formatMs(t.totalMs)}` : null,
          t.homeReadyMs != null ? `home=${formatMs(t.homeReadyMs)}` : null,
          t.fillFormMs != null ? `fill=${formatMs(t.fillFormMs)}` : null,
          t.waitResultsMs != null ? `results=${formatMs(t.waitResultsMs)}` : null,
          t.stabilizeMs != null ? `stabilize=${formatMs(t.stabilizeMs)}` : null,
          t.scrapeEvalMs != null ? `scrape=${formatMs(t.scrapeEvalMs)}` : null,
          t.resetHomeMs != null ? `reset=${formatMs(t.resetHomeMs)}` : null
        ].filter(Boolean).join(', ')
      : '';

  function airportName(code) {
    const label = labels[code];
    if (label) return String(label).replace(/\s*\([A-Z0-9]{3}\)\s*$/, '');
    return code || '—';
  }

  function isoYear(iso) {
    const m = String(iso || '').match(/^(\d{4})-/);
    return m ? parseInt(m[1], 10) : null;
  }

  function monthIndexFromName(raw) {
    const s = String(raw || '').trim().toLowerCase();
    const m3 = s.slice(0, 3);
    const map = { jan:0,feb:1,mar:2,'mär':2,mrz:2,apr:3,may:4,mai:4,jun:5,jul:6,aug:7,sep:8,oct:9,okt:9,nov:10,dec:11,dez:11 };
    return map[m3];
  }

  function parseDateCell(text, baseYear) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();

    // Numeric dates from the site, e.g. "Sa 28.03" or "Do 26.03" or "28.03"
    const mNum = t.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
    if (mNum) {
      const day = parseInt(mNum[1], 10);
      const mon1 = parseInt(mNum[2], 10);
      const yearFromText = mNum[3] ? parseInt(mNum[3], 10) : NaN;
      const yyyy = Number.isFinite(yearFromText) ? yearFromText : (Number.isFinite(baseYear) ? baseYear : new Date().getFullYear());
      if (Number.isFinite(day) && Number.isFinite(mon1) && mon1 >= 1 && mon1 <= 12) {
        const mm = String(mon1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return { key: `${yyyy}-${mm}-${dd}`, label: `${dd} ${monthNames[mon1 - 1]}` };
      }
    }

    const m = t.match(/(\d{1,2})\s+([A-Za-zÄÖÜäöü]{3,})/);
    if (!m) return { key: t || '', label: t || '' };
    const day = parseInt(m[1], 10);
    const mon = monthIndexFromName(m[2]);
    if (!Number.isFinite(day) || !Number.isFinite(mon)) return { key: t || String(day), label: t || String(day) };
    const yyyy = Number.isFinite(baseYear) ? baseYear : (new Date().getFullYear());
    const mm = String(mon + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return { key: `${yyyy}-${mm}-${dd}`, label: `${dd} ${m[2]}` };
  }

  function parsePrice(text) {
    const t = String(text || '').replace(/\u00A0/g, ' ');
    let m = t.match(/(CHF|EUR|€)\s*([0-9][0-9.,]*)/i);
    if (!m) m = t.match(/([0-9][0-9.,]*)\s*(CHF|EUR|€)/i);
    if (!m) {
      console.log('[parsePrice] No match for:', t);
      return { currency: null, price: null };
    }
    
    // Determine which group is currency and which is price
    let cur, numRaw;
    if (/CHF|EUR|€/i.test(m[1])) {
      cur = (m[1] === '€') ? 'EUR' : String(m[1]).toUpperCase();
      numRaw = String(m[2] || '').trim();
    } else {
      cur = (m[2] === '€') ? 'EUR' : String(m[2]).toUpperCase();
      numRaw = String(m[1] || '').trim();
    }
    
    const cleaned = numRaw.replace(/\s+/g, '').replace(/[€]/g, '').replace(/CHF|EUR/gi, '');
    
    console.log('[parsePrice] Input:', t, '| Match:', m, '| Currency:', cur, '| Price:', cleaned);
    
    return { currency: cur, price: cleaned || null };
  }

  function extractTimes(text) {
    const t = String(text || '');
    // Accept "11:40", "11.40" etc; normalize "." -> ":"
    const hits = t.match(/\b\d{1,2}[:.]\d{2}\b/g) || [];
    return hits.map((x) => x.replace('.', ':'));
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

  function deriveFromRaw(group, baseYear) {
    const rows = Array.isArray(group?.rawRows) ? group.rawRows : [];
    const byDate = {};
    const datesMeta = {};

    const looksLikeFlightNo = (s) => /\b[A-Z]{1,3}\s*\d{2,4}\b/.test(String(s || ''));
    const looksLikePrice = (s) => /\bsold\s*out\b/i.test(String(s || '')) || /\bausgebucht\b/i.test(String(s || '')) || /€|CHF|EUR/i.test(String(s || '')) || /\b\d+[0-9.,]*\s*(CHF|EUR)\b/i.test(String(s || ''));

    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 2) continue;
      const cells = r.map((x) => String(x ?? '').trim()).filter(Boolean);
      if (!cells.length) continue;

      // Find date/time/flight/price anywhere in the row (site markup varies).
      const dateTxt = (cells.find((c) => /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/.test(c)) || cells[0] || '').trim();
      const timeTxt = (cells.find((c) => extractTimes(c).length >= 2) || cells[1] || cells[0] || '').trim();
      const flightNo = (cells.find((c) => looksLikeFlightNo(c)) || cells[2] || '').trim();
      const priceTxt = (cells.find((c) => looksLikePrice(c)) || cells[cells.length - 1] || '').trim();

      const times = extractTimes(timeTxt);
      if (times.length < 2) continue; // can't render a flight without 2 times
      const d = parseDateCell(dateTxt, baseYear);
      const p = parsePrice(priceTxt);
      const soldOut = /\bsold\s*out\b/i.test(priceTxt) || /\bausgebucht\b/i.test(priceTxt);
      const duration = fmtDuration(minutesBetween(times[0], times[1])) || null;
      const flight = {
        dateKey: d.key,
        dateLabel: d.label,
        departureTime: times[0],
        arrivalTime: times[1],
        flightNumber: flightNo || null,
        duration,
        soldOut,
        priceText: priceTxt || null,
        price: p.price,
        currency: p.currency
      };
      if (!byDate[d.key]) byDate[d.key] = [];
      byDate[d.key].push(flight);

      if (!datesMeta[d.key]) datesMeta[d.key] = { key: d.key, label: d.label, minPrice: null, currency: null };
      const n = soldOut ? NaN : parseFloat(String(flight.price || '').replace(',', '.'));
      if (Number.isFinite(n)) {
        if (datesMeta[d.key].minPrice === null || n < datesMeta[d.key].minPrice) {
          datesMeta[d.key].minPrice = n;
          datesMeta[d.key].currency = flight.currency;
        }
      }
    }
    for (const k of Object.keys(byDate)) {
      byDate[k].sort((a, b) => String(a.departureTime).localeCompare(String(b.departureTime)));
    }
    const dates = Object.values(datesMeta).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    return { byDate, dates };
  }

  function enrichFromParsed(rawByDate, parsedByDate) {
    const parsed = parsedByDate || {};
    const out = {};
    for (const [k, flights] of Object.entries(rawByDate || {})) {
      const pList = Array.isArray(parsed[k]) ? parsed[k] : [];
      out[k] = (flights || []).map((f) => {
        if (!f) return f;
        const match = pList.find((p) =>
          p &&
          String(p.departureTime) === String(f.departureTime) &&
          String(p.arrivalTime) === String(f.arrivalTime) &&
          String(p.flightNumber || '') === String(f.flightNumber || '')
        );
        return match ? { ...f, ...match, dateKey: f.dateKey, dateLabel: f.dateLabel } : f;
      });
      out[k].sort((a, b) => String(a.departureTime).localeCompare(String(b.departureTime)));
    }
    return out;
  }

  function dateKeyToEpochMs(key) {
    const s = String(key || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    // Use UTC midnight so timezone doesn't affect ordering.
    return Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
  }

  function buildDatesFromByDate(byDate, labelLookup) {
    const keys = Object.keys(byDate || {});
    if (!keys.length) return [];

    // Chronological ascending (nearest date -> furthest date).
    keys.sort((a, b) => {
      const ta = dateKeyToEpochMs(a);
      const tb = dateKeyToEpochMs(b);
      if (ta === null && tb === null) return String(a).localeCompare(String(b));
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });

    return keys.map((k) => {
      const flights = Array.isArray(byDate[k]) ? byDate[k] : [];
      let min = null;
      let cur = null;
      for (const f of flights) {
        if (!f || f.soldOut) continue;
        if (!f.price || !f.currency) continue;
        const n = parseFloat(String(f.price).replace(',', '.'));
        if (!Number.isFinite(n)) continue;
        if (min === null || n < min) { min = n; cur = f.currency; }
      }
      const label = (labelLookup && labelLookup[k]) ? labelLookup[k] : (flights[0]?.dateLabel || k);
      return { key: k, label, minPrice: min, currency: cur };
    });
  }

  function makeRawTable(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (!rows.length) return `<div class="pill">No raw rows</div>`;

    const colCount = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
    const headers = [];
    for (let i = 0; i < colCount; i++) {
      if (i === 0) headers.push('Date');
      else if (i === 1) headers.push('Time');
      else if (i === 2) headers.push('Flight #');
      else if (i === 3) headers.push('Price');
      else headers.push(`Col ${i + 1}`);
    }

    const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const tbody = rows
      .map((r) => {
        const cols = [];
        for (let i = 0; i < colCount; i++) cols.push(`<td>${escapeHtml((r && r[i]) || '')}</td>`);
        return `<tr>${cols.join('')}</tr>`;
      })
      .join('');

    return `
      <details style="margin-top:10px;">
        <summary style="cursor:pointer;color:#a9b4e6;font-size:12px;">Raw table (${rows.length} rows)</summary>
        <div style="margin-top:8px;">
          <table class="table">
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  function pickActiveKey(dates, preferredKey) {
    const list = Array.isArray(dates) ? dates : [];
    if (!list.length) return null;

    const pref = String(preferredKey || '').trim();
    if (pref && list.some((d) => d && d.key === pref)) return pref;

    const prefT = pref ? dateKeyToEpochMs(pref) : null;
    if (prefT === null) return list[0].key;

    let bestKey = list[0].key;
    let bestAbs = Infinity;
    let bestT = null;
    for (const d of list) {
      if (!d || !d.key) continue;
      const t = dateKeyToEpochMs(d.key);
      if (t === null) continue;
      const abs = Math.abs(t - prefT);
      if (abs < bestAbs) {
        bestAbs = abs;
        bestKey = d.key;
        bestT = t;
      } else if (abs === bestAbs && bestT !== null && t < bestT) {
        // Tie-breaker: earlier date wins.
        bestKey = d.key;
        bestT = t;
      }
    }
    return bestKey;
  }

  function bestPriceBadge(group) {
    const ds = Array.isArray(group?.dates) ? group.dates : [];
    let best = null;
    for (const d of ds) {
      if (d && d.minPrice !== null && d.minPrice !== undefined && Number.isFinite(Number(d.minPrice))) {
        if (!best || Number(d.minPrice) < Number(best.minPrice)) best = d;
      }
    }
    if (!best) return '';
    const cur = currencySymbol(best.currency);
    return `<div class="best-price">Best price: <strong>${escapeHtml(best.label || best.key)}</strong> <span class="best-price-amt">${escapeHtml(cur)} ${escapeHtml(Number(best.minPrice).toFixed(2))}</span></div>`;
  }

  function formatDateChipLabel(d) {
    // Prefer human label from parsing; fall back to ISO key.
    const label = d?.label || d?.key || '—';
    return String(label);
  }

  function buildDates(group, preferredKey) {
    const dates = Array.isArray(group?.dates) ? group.dates : [];
    if (dates.length) return dates;

    // Fallback: derive dates from byDate keys if available.
    const byDate = group?.byDate || {};
    const keys = Object.keys(byDate || {}).sort((a, b) => String(a).localeCompare(String(b)));
    if (keys.length) {
      return keys.map((k) => {
        const flights = Array.isArray(byDate[k]) ? byDate[k] : [];
        let min = null;
        let cur = null;
        for (const f of flights) {
          if (!f || !f.price || !f.currency) continue;
          const n = parseFloat(String(f.price));
          if (!Number.isFinite(n)) continue;
          if (min === null || n < min) { min = n; cur = f.currency; }
        }
        return { key: k, label: k, minPrice: min, currency: cur };
      });
    }

    // Fallback: derive from rawRows if present (this fixes cases where parsing didn't populate byDate).
    const y = isoYear(preferredKey) || new Date().getFullYear();
    const derived = deriveFromRaw(group, y);
    if (derived.dates.length) return derived.dates;

    const key = String(preferredKey || '').trim();
    if (key) return [{ key, label: key, minPrice: null, currency: null }];
    return [{ key: '__no_date__', label: '—', minPrice: null, currency: null }];
  }

  function renderCarousel(host, dates, activeKey, onChange) {
    if (!host) return;
    const maxVisible = window.matchMedia && window.matchMedia('(min-width: 900px)').matches ? 7 : 3;
    const all = dates || [];
    const foundIndex = all.findIndex((d) => d && d.key === activeKey);
    const activeIndex = Math.max(0, foundIndex);

    // Window start so that active is visible, centered when possible
    let start = Math.max(0, activeIndex - Math.floor(maxVisible / 2));
    if (start + maxVisible > all.length) start = Math.max(0, all.length - maxVisible);

    const slice = all.slice(start, start + maxVisible);
    const leftDisabled = activeIndex <= 0;
    const rightDisabled = activeIndex >= all.length - 1;

    const htmlChips = slice.map((d) => {
      const isActive = d.key === activeKey;
      const sub =
        d.minPrice !== null && d.minPrice !== undefined && Number.isFinite(Number(d.minPrice))
          ? `${currencySymbol(d.currency)} ${Number(d.minPrice).toFixed(2)}`
          : '';
      return `
        <button type="button" class="date-chip${isActive ? ' active' : ''}" data-key="${escapeHtml(d.key)}">
          <div class="date-chip-top">${escapeHtml(String(d.key || '—'))}</div>
          <div class="date-chip-sub">${escapeHtml(sub || '')}</div>
        </button>
      `;
    }).join('');

    host.innerHTML = `
      <div class="date-carousel">
        <button type="button" class="arrow" data-dir="-1" ${leftDisabled ? 'disabled' : ''} aria-label="Previous date">‹</button>
        <div class="date-strip">${htmlChips}</div>
        <button type="button" class="arrow" data-dir="1" ${rightDisabled ? 'disabled' : ''} aria-label="Next date">›</button>
      </div>
    `;

    host.querySelectorAll('.date-chip').forEach((btn) => {
      btn.addEventListener('click', () => onChange(btn.getAttribute('data-key')));
    });
    host.querySelectorAll('.arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.getAttribute('data-dir') || '0', 10);
        if (!dir) return;
        const nextIndex = Math.min(all.length - 1, Math.max(0, activeIndex + dir));
        const next = all[nextIndex];
        if (next) onChange(next.key);
      });
    });
  }

  // Global selection state
  let selectedOutbound = null;
  let selectedReturn = null;
  let tripTypeGlobal = 'roundtrip';

  function renderFlightCard(f, leftName, leftCode, rightName, rightCode, type = 'outbound', index = 0) {
    const price =
      f.soldOut ? 'Sold out' :
      (f.price ? `${currencySymbol(f.currency)} ${f.price}` : (f.priceText || '—'));
    const dur = f.duration ? f.duration : '—';
    // Some sources don't provide a clean numeric price, only a priceText (e.g. "CHF 199.00").
    // Allow selecting those too, and parse the numeric price on click.
    const isSelectable = !f.soldOut && (!!f.price || !!f.priceText);
    const dataAttrs = isSelectable
      ? [
          `data-type="${type}"`,
          `data-index="${index}"`,
          `data-price="${f.price || ''}"`,
          `data-currency="${f.currency || ''}"`,
          `data-pricetext="${escapeHtml(f.priceText || '')}"`,
          `data-date="${f.dateKey || ''}"`,
          `data-flight="${f.flightNumber || ''}"`,
          `data-deptime="${f.departureTime || ''}"`,
          `data-arrtime="${f.arrivalTime || ''}"`,
          `data-fromcode="${leftCode || ''}"`,
          `data-tocode="${rightCode || ''}"`,
          `data-fromname="${escapeHtml(leftName)}"`,
          `data-toname="${escapeHtml(rightName)}"`
        ].join(' ')
      : '';
    
    return `
      <div class="flight-card${isSelectable ? ' selectable' : ''}${f.soldOut ? ' sold-out' : ''}" ${dataAttrs}>
        <div class="fc-time">
          <div class="fc-time-big">${escapeHtml(f.departureTime || '—')}</div>
          <div class="fc-air">${escapeHtml(leftName)}</div>
          <div class="fc-code">${escapeHtml(leftCode || '—')}</div>
        </div>
        <div class="fc-line">
          <div class="fc-track">
            <span class="dot"></span>
            <span class="rail"></span>
            <span class="mid"></span>
            <span class="rail"></span>
            <span class="dot"></span>
          </div>
          <div class="fc-dur">${escapeHtml(dur)}</div>
        </div>
        <div class="fc-time right">
          <div class="fc-time-big">${escapeHtml(f.arrivalTime || '—')}</div>
          <div class="fc-air">${escapeHtml(rightName)}</div>
          <div class="fc-code">${escapeHtml(rightCode || '—')}</div>
        </div>
        <div class="fc-price${f.soldOut ? ' sold' : ''}">
          ${escapeHtml(price)}
          ${isSelectable ? '<div class="fc-select-hint">Click to select</div>' : ''}
        </div>
        <div class="fc-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
    `;
  }

  function updateBookingSummary() {
    const continueBar = document.getElementById('bookingSummary');
    const outBadge = document.getElementById('outboundBadge');
    const retBadge = document.getElementById('returnBadge');
    const returnSection = document.getElementById('returnSection');

    // Update badges
    if (outBadge) outBadge.style.display = selectedOutbound ? 'flex' : 'none';
    if (retBadge) retBadge.style.display = selectedReturn ? 'flex' : 'none';

    // Check if selection is complete
    const isOneWay = tripTypeGlobal === 'oneway';
    const canProceed = selectedOutbound && (isOneWay || selectedReturn);

    // Hide return section for one-way trips
    if (returnSection) returnSection.style.display = isOneWay ? 'none' : '';

    // Show continue button only when selection is complete
    if (continueBar) {
      continueBar.style.display = canProceed ? 'block' : 'none';
    }

    // Store selection in sessionStorage for booking page
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('sid') || '';
    if (sid && canProceed) {
      try {
        const selectionData = {
          outbound: selectedOutbound,
          return: selectedReturn,
          tripType: tripTypeGlobal
        };
        
        // Debug: log what we're saving
        console.log('====== SAVING TO SESSIONSTORAGE ======');
        console.log('Session ID:', sid);
        console.log('Full selection data:', JSON.stringify(selectionData, null, 2));
        console.log('Outbound currency:', selectedOutbound?.currency);
        console.log('Return currency:', selectedReturn?.currency);
        console.log('======================================');
        
        sessionStorage.setItem(`ak_selection_${sid}`, JSON.stringify(selectionData));
      } catch (e) {
        console.error('Failed to save selection:', e);
      }
    }
  }

  function setupFlightCardClicks() {
    const cards = document.querySelectorAll('.flight-card.selectable');
    console.log('[AK] setupFlightCardClicks: found', cards.length, 'selectable cards');
    cards.forEach(card => {
      // Remove any previous listener by cloning
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
    });
    // Re-attach click handlers to the cloned nodes
    document.querySelectorAll('.flight-card.selectable').forEach(card => {
      card.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const type = this.dataset.type;
        const parseNumericPrice = (raw) => {
          const s = String(raw || '').replace(/\u00A0/g, ' ').trim();
          // Capture "EUR 123.45", "CHF 123,45", "€ 123.45" etc
          const m = s.match(/(?:CHF|EUR|€)\s*([0-9][0-9.,]*)/i) || s.match(/([0-9][0-9.,]*)\s*(?:CHF|EUR|€)/i);
          if (!m) return null;
          const num = String(m[1] || '').replace(/\./g, '').replace(',', '.'); // tolerate "1.234,56"
          const n = parseFloat(num);
          return Number.isFinite(n) ? String(n) : null;
        };
        // Detect currency from multiple sources
        let detectedCurrency = this.dataset.currency;
        if (!detectedCurrency) {
          // Try to detect from pricetext
          const pt = this.dataset.pricetext || '';
          if (/\bCHF\b/i.test(pt)) {
            detectedCurrency = 'CHF';
          } else if (/€|EUR/i.test(pt)) {
            detectedCurrency = 'EUR';
          }
        }
        // Normalize currency
        if (detectedCurrency) {
          detectedCurrency = detectedCurrency.toUpperCase().trim();
          if (detectedCurrency !== 'CHF' && detectedCurrency !== 'EUR') {
            detectedCurrency = 'EUR'; // Default fallback
          }
        } else {
          detectedCurrency = 'EUR';
        }
        
        console.log('====== FLIGHT CARD CLICK - CURRENCY DEBUG ======');
        console.log('All data attributes:', this.dataset);
        console.log('data-currency:', this.dataset.currency);
        console.log('data-price:', this.dataset.price);
        console.log('data-pricetext:', this.dataset.pricetext);
        console.log('Detected currency BEFORE assignment:', detectedCurrency);
        console.log('================================================');
        
        const flightData = {
          price: this.dataset.price || parseNumericPrice(this.dataset.pricetext) || '',
          currency: detectedCurrency,
          date: this.dataset.date,
          flight: this.dataset.flight,
          depTime: this.dataset.deptime,
          arrTime: this.dataset.arrtime,
          fromCode: this.dataset.fromcode,
          toCode: this.dataset.tocode,
          fromName: this.dataset.fromname,
          toName: this.dataset.toname
        };
        
        console.log('Final flightData object:', flightData);
        console.log('Currency in flightData:', flightData.currency);

        // Toggle selection
        if (type === 'outbound') {
          // Deselect all outbound cards
          document.querySelectorAll('.flight-card[data-type="outbound"]').forEach(c => c.classList.remove('selected'));
          // Select this one
          this.classList.add('selected');
          selectedOutbound = flightData;
        } else if (type === 'return') {
          // Deselect all return cards
          document.querySelectorAll('.flight-card[data-type="return"]').forEach(c => c.classList.remove('selected'));
          // Select this one
          this.classList.add('selected');
          selectedReturn = flightData;
        }

        console.log('[AK] Selected', type, 'flight:', flightData);
        updateBookingSummary();
      });
    });

    // Continue button click
    setupContinueButton();
  }

  function setupContinueButton() {
    const btn = document.getElementById('btnContinueBooking');
    if (!btn) return;
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const isOneWay = tripTypeGlobal === 'oneway';
      const canProceed = selectedOutbound && (isOneWay || selectedReturn);
      
      if (!canProceed) {
        console.log('[AK] Cannot proceed - incomplete selection');
        return;
      }

      // Get session ID from URL
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('sid') || '';
      
      // Navigate to booking page
      const bookingUrl = `/booking?sid=${encodeURIComponent(sid)}`;
      console.log('[AK] Navigating to booking:', bookingUrl);
      window.location.href = bookingUrl;
    });
  }

  function renderRowCard(r, leftName, leftCode, rightName, rightCode) {
    // Legacy helper kept for compatibility; not used after raw-derived grouping is authoritative.
    return renderFlightCard(r, leftName, leftCode, rightName, rightCode);
  }

  function renderSimpleRowsTable(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (!rows.length) return '';
    const tbody = rows
      .filter((r) => Array.isArray(r) && r.length)
      .map((r) => {
        const date = String(r[0] || '');
        const time = String(r[1] || '');
        const fn = String(r[2] || '');
        const price = String(r[3] || '');
        return `<tr>
          <td>${escapeHtml(date)}</td>
          <td>${escapeHtml(time)}</td>
          <td>${escapeHtml(fn)}</td>
          <td>${escapeHtml(price)}</td>
        </tr>`;
      })
      .join('');

    return `
      <table class="table compact">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Flight #</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    `;
  }

  function renderFlightsTable(flights) {
    const rows = Array.isArray(flights) ? flights : [];
    if (!rows.length) return '';
    const tbody = rows.map((f) => {
      const priceText =
        f.soldOut ? 'Sold out' :
        (f.price ? `${currencySymbol(f.currency)} ${f.price}` : (f.priceText || '—'));
      return `<tr>
        <td>${escapeHtml(f.dateKey || '')}</td>
        <td>${escapeHtml(f.departureTime || '')} → ${escapeHtml(f.arrivalTime || '')}</td>
        <td>${escapeHtml(f.flightNumber || '')}</td>
        <td>${escapeHtml(priceText)}</td>
      </tr>`;
    }).join('');
    return `
      <table class="table compact">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Flight #</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    `;
  }

  let activeOutKey = null;
  let activeRetKey = null;

  // Pre-built view (server-rendered HTML). We only "feed" data into it here.
  const view = getEl('resultsView');
  if (view) view.style.display = '';

  setText('debugTripType', tripType);
  setText('debugSourceUrl', data?.meta?.url || '—');
  setText('debugOutSel', outbound?.debug?.usedSelector || '—');
  setText('debugRetSel', inbound?.debug?.usedSelector || '—');
  const timingWrap = getEl('debugTimingWrap');
  if (timingWrap) timingWrap.style.display = timingLine ? '' : 'none';
  setText('debugTiming', timingLine || '—');

  const outRouteEl = getEl('outRoute');
  const retRouteEl = getEl('retRoute');
  if (outRouteEl) outRouteEl.innerHTML = `${escapeHtml(airportName(fromCode))} <span class="rb-arrow">→</span> ${escapeHtml(airportName(toCode))}`;
  if (retRouteEl) retRouteEl.innerHTML = `${escapeHtml(airportName(toCode))} <span class="rb-arrow">→</span> ${escapeHtml(airportName(fromCode))}`;

  const outBest = getEl('outBest');
  const retBest = getEl('retBest');
  if (outBest) outBest.innerHTML = bestPriceBadge(outbound) || '';
  if (retBest) retBest.innerHTML = bestPriceBadge(inbound) || '';

  const outCarouselHost = getEl('outCarousel');
  const outCardsHost = getEl('outCards');
  const retCarouselHost = getEl('retCarousel');
  const retCardsHost = getEl('retCards');

  const outYear = isoYear(selectedDepKey) || new Date().getFullYear();
  const retYear = isoYear(selectedRetKey) || outYear;

  const outDerived = deriveFromRaw(outbound, outYear);
  const retDerived = deriveFromRaw(inbound, retYear);

  // IMPORTANT: use raw-derived dates as the authoritative grouping so dd.mm rows
  // like "Fr 03.04" and "Mo 06.04" never collapse into the same tab.
  const outByDate = enrichFromParsed(outDerived.byDate, outbound?.byDate);
  const retByDate = enrichFromParsed(retDerived.byDate, inbound?.byDate);

  const outLabelLookup = Object.fromEntries((outbound?.dates || []).map((d) => [d.key, d.label]));
  const retLabelLookup = Object.fromEntries((inbound?.dates || []).map((d) => [d.key, d.label]));

  const outDates = buildDatesFromByDate(outByDate, outLabelLookup);
  const retDates = buildDatesFromByDate(retByDate, retLabelLookup);

  // Default active date:
  // - if the selected date exists, open that
  // - otherwise open the nearest available date (chronologically closest)
  activeOutKey = pickActiveKey(outDates, selectedDepKey);
  activeRetKey = pickActiveKey(retDates, selectedRetKey);

  // Store trip type globally
  tripTypeGlobal = tripType;

  const renderOutbound = (key) => {
    activeOutKey = key;
    renderCarousel(outCarouselHost, outDates, activeOutKey, renderOutbound);
    const flights = ((outByDate || {})[activeOutKey] || []);
    const leftName = airportName(fromCode);
    const rightName = airportName(toCode);

    const anyOutbound = Object.values(outByDate || {}).some((arr) => Array.isArray(arr) && arr.length);
    if (!flights.length && anyOutbound) {
      // Auto-jump to the nearest date that *does* have something to show.
      const idx = Math.max(0, outDates.findIndex((d) => d && d.key === activeOutKey));
      const hasAny = (k) => (Array.isArray(outByDate?.[k]) ? outByDate[k].length : 0) > 0;
      let nextKey = null;
      for (let step = 1; step < outDates.length; step++) {
        const left = outDates[idx - step]?.key;
        const right = outDates[idx + step]?.key;
        if (left && hasAny(left)) { nextKey = left; break; }
        if (right && hasAny(right)) { nextKey = right; break; }
      }
      if (!nextKey) {
        // Fall back to the first date that has anything.
        nextKey = outDates.find((d) => d && hasAny(d.key))?.key || null;
      }
      if (nextKey && nextKey !== activeOutKey) return renderOutbound(nextKey);
    }

    const content =
      (flights.length
        ? flights.map((f, i) => renderFlightCard(f, leftName, fromCode, rightName, toCode, 'outbound', i)).join('')
        : (anyOutbound ? '' : renderSimpleRowsTable(outbound.rawRows)));

    if (outCardsHost) {
      outCardsHost.innerHTML = content;
      setupFlightCardClicks();
    }
  };

  const renderReturn = (key) => {
    activeRetKey = key;
    renderCarousel(retCarouselHost, retDates, activeRetKey, renderReturn);
    const flights = ((retByDate || {})[activeRetKey] || []);
    const leftName = airportName(toCode);
    const rightName = airportName(fromCode);

    const anyReturn = Object.values(retByDate || {}).some((arr) => Array.isArray(arr) && arr.length);
    if (!flights.length && anyReturn) {
      const idx = Math.max(0, retDates.findIndex((d) => d && d.key === activeRetKey));
      const hasAny = (k) => (Array.isArray(retByDate?.[k]) ? retByDate[k].length : 0) > 0;
      let nextKey = null;
      for (let step = 1; step < retDates.length; step++) {
        const left = retDates[idx - step]?.key;
        const right = retDates[idx + step]?.key;
        if (left && hasAny(left)) { nextKey = left; break; }
        if (right && hasAny(right)) { nextKey = right; break; }
      }
      if (!nextKey) {
        nextKey = retDates.find((d) => d && hasAny(d.key))?.key || null;
      }
      if (nextKey && nextKey !== activeRetKey) return renderReturn(nextKey);
    }

    const content =
      (flights.length
        ? flights.map((f, i) => renderFlightCard(f, leftName, toCode, rightName, fromCode, 'return', i)).join('')
        : (anyReturn ? '' : renderSimpleRowsTable(inbound.rawRows)));

    if (retCardsHost) {
      retCardsHost.innerHTML = content;
      setupFlightCardClicks();
    }

    // Hide return section for one-way trips
    const returnSection = document.getElementById('returnSection');
    if (returnSection && tripType === 'oneway') {
      returnSection.style.display = 'none';
    }
  };

  if (activeOutKey) renderOutbound(activeOutKey);
  else if (outCardsHost) outCardsHost.innerHTML = '';

  if (activeRetKey) renderReturn(activeRetKey);
  else if (retCardsHost) retCardsHost.innerHTML = '';
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get('sid') || '';
  if (!sid) {
    setStatusKeys('no_search_in_progress', null, true);
    return;
  }

  // End-to-end timer: from homepage "Search" click -> results rendered (incl. paint).
  const e2eEl = document.getElementById('e2eTime');
  let startedAtMs = null;
  try {
    const raw = sessionStorage.getItem(`ak_startedAtMs_${sid}`);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) startedAtMs = n;
  } catch (_) {}
  if (!Number.isFinite(Number(startedAtMs))) {
    // Fallback: if start wasn't recorded (sessionStorage cleared), start now.
    startedAtMs = epochNowMs();
    try { sessionStorage.setItem(`ak_startedAtMs_${sid}`, String(Math.round(startedAtMs))); } catch (_) {}
  }
  const setE2E = (endAtMs) => {
    if (!e2eEl) return;
    const total = endAtMs - startedAtMs;
    e2eEl.textContent = `⏱ ${formatMs(total)}`;
  };

  await fetchHealthLine();
  setStatusKeys('searching', 'searching_hint', false);

  const payloadRaw = sessionStorage.getItem(`ak_payload_${sid}`);
  if (!payloadRaw) {
    setStatusKeys('session_expired', null, true);
    return;
  }

  // Button: rescrape (no caching; always runs a fresh scrape)
  const btnRescrape = document.getElementById('btnRescrape');
  if (btnRescrape) {
    btnRescrape.addEventListener('click', () => {
      // Treat rescrape as a new end-to-end run from the moment the user clicks rescrape.
      const t0 = epochNowMs();
      try { sessionStorage.setItem(`ak_startedAtMs_${sid}`, String(Math.round(t0))); } catch (_) {}
      // Run immediately without reloading the page.
      runScrape().catch(() => {});
    });
  }

  let payload = null;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (_) {
    setStatusKeys('something_went_wrong', null, true);
    return;
  }

  // Default to closing ASAP unless user explicitly sets keepBrowserOpenMs
  if (payload.keepBrowserOpenMs === undefined || payload.keepBrowserOpenMs === null || payload.keepBrowserOpenMs === '') {
    payload.keepBrowserOpenMs = (window.AK_DEFAULTS && window.AK_DEFAULTS.keepBrowserOpenMs) || 0;
  }
  if (payload.openBrowser === undefined || payload.openBrowser === null) {
    payload.openBrowser = (window.AK_DEFAULTS && window.AK_DEFAULTS.openBrowserOnSearch) || false;
  }

  async function runScrape() {
    setStatusKeys('searching', 'searching_hint', false);
    if (e2eEl) e2eEl.textContent = 'Searching...';
    
    // Hide the view while loading
    const view = getEl('resultsView');
    if (view) view.style.display = 'none';

    const resp = await fetch('/api/search', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Search failed');

    // Hide searching panel once results are ready
    setStatus({ text: '' });
    renderFlights(json.data);
    
    await afterNextPaint();
    const tRendered = epochNowMs();
    setE2E(tRendered);
  }

  try {
    await runScrape();
  } catch (e) {
    setStatus({ text: e?.message || String(e), hint: '', loading: false, isError: true });
  }
}

run();


