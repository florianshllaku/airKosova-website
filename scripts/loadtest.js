const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clampInt(n, min, max) {
  const x = parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function nowIso() {
  return new Date().toISOString();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function runId() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function isoDateFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function stats(values) {
  const xs = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : null;
  const min = n ? xs[0] : null;
  const max = n ? xs[n - 1] : null;
  const pct = (p) => {
    if (!n) return null;
    const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
    return xs[idx];
  };
  return { n, min, max, mean, p50: pct(50), p90: pct(90), p95: pct(95), p99: pct(99) };
}

function fmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function makeReportHtml({ runMeta, records, summary }) {
  // Uses Chart.js from CDN to avoid bundling large JS files.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AirKosova Load Test Report ${runMeta.runId}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; color: #111; }
    .muted { color: #666; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px; }
    .kvs { display: grid; grid-template-columns: 200px 1fr; gap: 8px; }
    .k { color:#444; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
    th { text-align: left; background: #fafafa; position: sticky; top: 0; }
    .ok { color: #0a7a2f; font-weight: 600; }
    .bad { color: #b00020; font-weight: 600; }
    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; background:#f2f2f2; font-size: 12px; margin-right: 6px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body>
  <h2>AirKosova Load Test Report</h2>
  <div class="muted">Run: <span class="mono">${runMeta.runId}</span> • Generated: <span class="mono">${nowIso()}</span></div>

  <div style="margin-top:14px;" class="grid">
    <div class="card">
      <div class="pill">Requests: <strong>${summary.countTotal}</strong></div>
      <div class="pill">Success: <strong class="ok">${summary.countOk}</strong></div>
      <div class="pill">Errors: <strong class="bad">${summary.countErr}</strong></div>
      <div class="pill">Rate: <strong>${summary.ratePerMin}/min</strong></div>
      <div class="pill">Base URL: <strong class="mono">${runMeta.baseUrl}</strong></div>
      <div style="margin-top:10px;" class="kvs">
        <div class="k">Duration</div><div><strong>${fmtMs(summary.runDurationMs)}</strong></div>
        <div class="k">Latency min/mean/max</div><div><strong>${fmtMs(summary.latency.min)}</strong> / <strong>${fmtMs(summary.latency.mean)}</strong> / <strong>${fmtMs(summary.latency.max)}</strong></div>
        <div class="k">Latency p50/p90/p95</div><div><strong>${fmtMs(summary.latency.p50)}</strong> / <strong>${fmtMs(summary.latency.p90)}</strong> / <strong>${fmtMs(summary.latency.p95)}</strong></div>
      </div>
    </div>

    <div class="card">
      <div style="font-weight:600;margin-bottom:8px;">Server-side breakdown (avg)</div>
      <div class="kvs">
        <div class="k">homeReady</div><div>${fmtMs(summary.serverAvg.homeReadyMs)}</div>
        <div class="k">fillForm</div><div>${fmtMs(summary.serverAvg.fillFormMs)}</div>
        <div class="k">waitResults</div><div>${fmtMs(summary.serverAvg.waitResultsMs)}</div>
        <div class="k">stabilize</div><div>${fmtMs(summary.serverAvg.stabilizeMs)}</div>
        <div class="k">scrapeEval</div><div>${fmtMs(summary.serverAvg.scrapeEvalMs)}</div>
        <div class="k">resetHome</div><div>${fmtMs(summary.serverAvg.resetHomeMs)}</div>
      </div>
      <div class="muted" style="margin-top:8px;">These come from the scraper's <span class="mono">meta.timingsMs</span>.</div>
    </div>
  </div>

  <div style="margin-top:16px;" class="grid">
    <div class="card">
      <div style="font-weight:600;margin-bottom:8px;">Latency over time (ms)</div>
      <canvas id="latencyChart" height="140"></canvas>
    </div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:8px;">Latency histogram</div>
      <canvas id="histChart" height="140"></canvas>
    </div>
  </div>

  <div style="margin-top:16px;" class="card">
    <div style="font-weight:600;margin-bottom:8px;">All requests</div>
    <div class="muted">Tip: download raw data: <a href="./records.ndjson">records.ndjson</a> • <a href="./summary.json">summary.json</a></div>
    <div style="max-height:520px; overflow:auto; margin-top:10px;">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>ok</th>
            <th>duration</th>
            <th>route</th>
            <th>dates</th>
            <th>pax</th>
            <th>pool</th>
            <th class="mono">error</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script>
    const records = ${JSON.stringify(records)};
    const summary = ${JSON.stringify(summary)};

    const tbody = document.getElementById('rows');
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const tr = document.createElement('tr');
      const ok = r.ok ? '<span class="ok">yes</span>' : '<span class="bad">no</span>';
      const route = (r.request?.departure || '—') + ' → ' + (r.request?.destination || '—');
      const dates = (r.request?.departureDate || '—') + (r.request?.returnDate ? (' → ' + r.request.returnDate) : '');
      const pax = 'A' + (r.request?.adults ?? '—') + ' C' + (r.request?.children ?? '—') + ' I' + (r.request?.infants ?? '—');
      const pool = r.pool ? ('B' + r.pool.browserIndex + '/T' + r.pool.tabIndex) : '—';
      tr.innerHTML = \`
        <td class="mono">\${i + 1}</td>
        <td>\${ok}</td>
        <td class="mono">\${r.durationMs != null ? r.durationMs : '—'}</td>
        <td class="mono">\${route}</td>
        <td class="mono">\${dates}</td>
        <td class="mono">\${pax}</td>
        <td class="mono">\${pool}</td>
        <td class="mono">\${(r.error || '').slice(0, 140)}</td>
      \`;
      tbody.appendChild(tr);
    }

    // Latency over time chart
    const labels = records.map((r, i) => i + 1);
    const latency = records.map((r) => r.durationMs ?? null);
    new Chart(document.getElementById('latencyChart'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'durationMs', data: latency, borderColor: '#1f77b4', tension: 0.2, pointRadius: 0 }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { title: { display: true, text: 'request #' } }, y: { title: { display: true, text: 'ms' } } } }
    });

    // Histogram
    const xs = latency.filter((x) => typeof x === 'number' && isFinite(x)).sort((a,b)=>a-b);
    const bins = 20;
    const min = xs.length ? xs[0] : 0;
    const max = xs.length ? xs[xs.length - 1] : 0;
    const width = xs.length && max > min ? (max - min) / bins : 1;
    const counts = new Array(bins).fill(0);
    for (const x of xs) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((x - min) / width)));
      counts[idx]++;
    }
    const binLabels = counts.map((_, i) => {
      const a = Math.round(min + i * width);
      const b = Math.round(min + (i + 1) * width);
      return a + '-' + b;
    });
    new Chart(document.getElementById('histChart'), {
      type: 'bar',
      data: { labels: binLabels, datasets: [{ label: 'count', data: counts, backgroundColor: '#ff7f0e' }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { ticks: { maxRotation: 90, minRotation: 60 } } } }
    });
  </script>
</body>
</html>`;
}

function sumField(records, getter) {
  let s = 0;
  let n = 0;
  for (const r of records) {
    const v = getter(r);
    if (Number.isFinite(v)) { s += v; n++; }
  }
  return { sum: s, n, mean: n ? s / n : null };
}

function randomSearchPayload() {
  const CODES = [
    'PRN','BSL','BER','BRE','BRU','DTM','DUS','GVA','GOT','HAM','HAJ','HEL','CGN','LJU','LUX','MMX','FMM',
    'BGY','MUC','FMO','NUE','OSL','SZG','ARN','STR','VXO','VIE','ZRH'
  ];
  const NON_PRN = CODES.filter((c) => c !== 'PRN');
  const other = pick(NON_PRN);

  const prnAsDeparture = Math.random() < 0.5;
  const departure = prnAsDeparture ? 'PRN' : other;
  const destination = prnAsDeparture ? other : 'PRN';

  const tripType = Math.random() < 0.75 ? 'roundtrip' : 'oneway';

  const start = new Date();
  start.setDate(start.getDate() + randInt(1, 90));
  const departureDate = isoDateFromDate(start);

  let returnDate = '';
  if (tripType !== 'oneway') {
    const ret = new Date(start);
    ret.setDate(ret.getDate() + randInt(1, 21));
    returnDate = isoDateFromDate(ret);
  }

  const adults = randInt(1, 5);
  const children = randInt(0, 2);
  const infants = Math.min(adults, randInt(0, 1));

  return {
    departure,
    destination,
    departureDate,
    returnDate: returnDate || '',
    tripType,
    adults,
    children,
    infants,
    openBrowser: false,
    keepBrowserOpenMs: 0
  };
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('This script requires Node 18+ (global fetch).');
    process.exit(1);
  }

  // Default to production URL (can still be overridden by BASE_URL env var).
  const BASE_URL = process.env.BASE_URL || 'http://46.224.125.111:3000';
  const RATE_PER_MIN = clampInt(process.env.RATE_PER_MIN || 30, 1, 600);
  const DURATION_MIN = clampInt(process.env.DURATION_MIN || 5, 1, 180);
  const MAX_IN_FLIGHT = clampInt(process.env.MAX_IN_FLIGHT || 16, 1, 256);

  const reportsRoot = path.join(process.cwd(), 'reports');
  const id = runId();
  const outDir = path.join(reportsRoot, `run-${id}`);
  fs.mkdirSync(outDir, { recursive: true });

  const ndjsonPath = path.join(outDir, 'records.ndjson');
  const ndjson = fs.createWriteStream(ndjsonPath, { flags: 'a' });

  const runMeta = {
    runId: id,
    baseUrl: BASE_URL,
    ratePerMin: RATE_PER_MIN,
    durationMin: DURATION_MIN,
    maxInFlight: MAX_IN_FLIGHT,
    startedAt: nowIso()
  };

  const intervalMs = Math.round(60000 / RATE_PER_MIN);
  const totalMs = DURATION_MIN * 60000;
  const startedAtMs = Date.now();

  const records = [];
  let inflight = 0;
  let tick = 0;

  const fireOne = async () => {
    const payload = randomSearchPayload();
    const seq = ++tick;
    const t0 = Date.now();
    inflight++;
    let rec = {
      seq,
      startedAt: new Date(t0).toISOString(),
      ok: false,
      durationMs: null,
      httpStatus: null,
      error: null,
      request: payload,
      pool: null,
      serverTimingsMs: null
    };

    try {
      const resp = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      rec.httpStatus = resp.status;
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json || !json.success) {
        throw new Error((json && json.error) ? String(json.error) : `HTTP ${resp.status}`);
      }
      rec.ok = true;
      rec.pool = json?.data?.meta?.pool || null;
      rec.serverTimingsMs = json?.data?.meta?.timingsMs || null;
    } catch (e) {
      rec.error = e?.message || String(e);
    } finally {
      const t1 = Date.now();
      rec.endedAt = new Date(t1).toISOString();
      rec.durationMs = t1 - t0;
      records.push(rec);
      ndjson.write(JSON.stringify(rec) + '\n');
      inflight--;
    }
  };

  // Scheduler loop
  while (Date.now() - startedAtMs < totalMs) {
    if (inflight < MAX_IN_FLIGHT) {
      fireOne(); // don't await (parallel)
    }
    await sleep(intervalMs);
  }

  // Drain
  while (inflight > 0) {
    await sleep(250);
  }

  ndjson.end();
  runMeta.endedAt = nowIso();
  runMeta.runDurationMs = Date.now() - startedAtMs;

  const durations = records.map((r) => r.durationMs);
  const latency = stats(durations);
  const countTotal = records.length;
  const countOk = records.filter((r) => r.ok).length;
  const countErr = countTotal - countOk;

  const avgHome = sumField(records, (r) => r.serverTimingsMs?.homeReadyMs);
  const avgFill = sumField(records, (r) => r.serverTimingsMs?.fillFormMs);
  const avgWait = sumField(records, (r) => r.serverTimingsMs?.waitResultsMs);
  const avgStab = sumField(records, (r) => r.serverTimingsMs?.stabilizeMs);
  const avgScrape = sumField(records, (r) => r.serverTimingsMs?.scrapeEvalMs);
  const avgReset = sumField(records, (r) => r.serverTimingsMs?.resetHomeMs);

  const summary = {
    runId: id,
    baseUrl: BASE_URL,
    ratePerMin: RATE_PER_MIN,
    durationMin: DURATION_MIN,
    maxInFlight: MAX_IN_FLIGHT,
    runDurationMs: runMeta.runDurationMs,
    startedAt: runMeta.startedAt,
    endedAt: runMeta.endedAt,
    countTotal,
    countOk,
    countErr,
    latency,
    serverAvg: {
      homeReadyMs: avgHome.mean,
      fillFormMs: avgFill.mean,
      waitResultsMs: avgWait.mean,
      stabilizeMs: avgStab.mean,
      scrapeEvalMs: avgScrape.mean,
      resetHomeMs: avgReset.mean
    }
  };

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.html'), makeReportHtml({ runMeta, records, summary }), 'utf8');

  // Update top-level index.html
  const runs = fs.readdirSync(reportsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('run-'))
    .map((d) => d.name)
    .sort()
    .reverse();

  const rows = runs.map((name) => {
    const link = `./${name}/report.html`;
    const sumLink = `./${name}/summary.json`;
    return `<li><a href="${link}">${name}</a> <span class="muted">(<a href="${sumLink}">summary</a>)</span></li>`;
  }).join('\n');

  const indexHtml = `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AirKosova Reports</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:20px} .muted{color:#666}</style>
</head><body>
  <h2>AirKosova Reports</h2>
  <div class="muted">Generated: ${nowIso()}</div>
  <div class="muted">Latest run: <strong>${runs[0] || '—'}</strong></div>
  <ul style="margin-top:12px;">${rows}</ul>
</body></html>`;

  fs.writeFileSync(path.join(reportsRoot, 'index.html'), indexHtml, 'utf8');

  console.log(`✅ Load test complete. Report: ${path.join(outDir, 'report.html')}`);
  console.log(`➡️  If your server hosts /reports, open: /reports/${path.basename(outDir)}/report.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


