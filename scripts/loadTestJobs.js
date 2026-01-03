/**
 * Load test script for AirKosova job-based search API.
 *
 * What it does:
 * - Sends POST /api/search at a fixed rate (default: 30 requests/minute)
 * - Polls GET /api/jobs/:jobId until done/failed
 * - Writes a detailed report (JSON + CSV) including timestamps and durations
 *
 * Run (PowerShell / bash):
 *   node scripts/loadTestJobs.js --baseUrl=http://localhost:3000 --rpm=30 --minutes=1
 *
 * Notes:
 * - You can run this locally against production; it measures "your PC -> server" latency too.
 * - For best realism, run from a machine in the same region as your users (or another VPS).
 */

const fs = require('fs');
const path = require('path');

// Node 18+ has global fetch
if (typeof fetch !== 'function') {
  console.error('This script requires Node.js 18+ (global fetch).');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    'reqIndex',
    'jobId',
    'status',
    'departure',
    'destination',
    'tripType',
    'departureDate',
    'returnDate',
    'adults',
    'children',
    'infants',
    'requestSentAt',
    'jobCreatedAt',
    'jobStartedAt',
    'jobFinishedAt',
    'clickToResultSeconds',
    'queueWaitSeconds',
    'runSeconds',
    'totalSeconds',
    'error'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = headers.map((h) => csvEscape(r[h])).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

async function postJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function defaultSearchParams() {
  // Keep it deterministic + valid; adjust if you want variety.
  // NOTE: Use ISO YYYY-MM-DD for your server.
  return {
    departure: 'Prishtina',
    destination: 'Basel',
    departureDate: '2026-01-10',
    returnDate: '2026-01-20',
    adults: '1',
    children: '0',
    infants: '0',
    tripType: 'roundtrip'
  };
}

function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function fetchDepartures(baseUrl, httpTimeoutMs) {
  const { ok, status, json } = await getJson(`${baseUrl}/api/departures`, httpTimeoutMs);
  if (!ok) throw new Error(`GET /api/departures failed (HTTP ${status})`);
  return json?.departures || [];
}

async function fetchDestinations(baseUrl, departureCity, httpTimeoutMs) {
  const { ok, status, json } = await getJson(`${baseUrl}/api/destinations/${encodeURIComponent(departureCity)}`, httpTimeoutMs);
  if (!ok) throw new Error(`GET /api/destinations/${departureCity} failed (HTTP ${status})`);
  return json?.destinations || [];
}

async function buildRandomSearchParams(baseUrl, httpTimeoutMs, opts = {}) {
  // Cities are configured server-side in `server.js` (cities + flightRoutes),
  // exposed via `/api/departures` and `/api/destinations/:city`.
  const departures = await fetchDepartures(baseUrl, httpTimeoutMs);
  if (!departures.length) throw new Error('No departures returned');

  const depName = opts.departure || departures[randInt(0, departures.length - 1)].name;
  const dests = await fetchDestinations(baseUrl, depName, httpTimeoutMs);
  if (!dests.length) throw new Error(`No destinations for departure=${depName}`);

  const destName = opts.destination || dests[randInt(0, dests.length - 1)].name;

  // Dates: choose within a future window (site may not have availability for very close dates)
  const today = new Date();
  const depOffsetDays = randInt(opts.depMinDays ?? 7, opts.depMaxDays ?? 30);
  const depDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + depOffsetDays);

  let tripType = opts.tripType;
  if (!tripType || tripType === 'random') {
    tripType = Math.random() < (opts.roundtripPct ?? 0.8) ? 'roundtrip' : 'oneway';
  }

  let returnDate = '';
  if (tripType === 'roundtrip') {
    const retOffsetDays = randInt(opts.retMinDays ?? 3, opts.retMaxDays ?? 21);
    const retDate = new Date(depDate.getFullYear(), depDate.getMonth(), depDate.getDate() + retOffsetDays);
    returnDate = formatIsoDate(retDate);
  }

  // Passengers: keep within realistic bounds
  const adults = String(opts.adults ?? randInt(1, 3));
  const children = String(opts.children ?? randInt(0, 2));
  const infantsMax = Math.min(Number(adults), 1);
  const infants = String(opts.infants ?? randInt(0, infantsMax));

  return {
    departure: depName,
    destination: destName,
    departureDate: formatIsoDate(depDate),
    returnDate,
    adults,
    children,
    infants,
    tripType
  };
}

async function pollJob(baseUrl, jobId, { pollMinMs, pollMaxMs, pollTimeoutMs, httpTimeoutMs }) {
  const start = Date.now();
  let last = null;

  while (true) {
    if (Date.now() - start > pollTimeoutMs) {
      return { status: 'failed', error: `Polling timed out after ${pollTimeoutMs}ms`, job: last };
    }

    const { ok, status, json } = await getJson(`${baseUrl}/api/jobs/${jobId}`, httpTimeoutMs);
    last = json;
    if (!ok) {
      return { status: 'failed', error: `GET /api/jobs failed (HTTP ${status})`, job: json };
    }

    if (json.status === 'done') return { status: 'done', job: json };
    if (json.status === 'failed') return { status: 'failed', error: json.error || 'Job failed', job: json };

    const wait = pollMinMs + Math.floor(Math.random() * (pollMaxMs - pollMinMs + 1));
    await sleep(wait);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const baseUrl = (args.baseUrl || 'http://localhost:3000').replace(/\/$/, '');
  const rpm = toNumber(args.rpm, 30);
  const minutes = toNumber(args.minutes, 1);
  const concurrency = toNumber(args.concurrency, 10); // how many polls can run concurrently
  const random = String(args.random || 'false').toLowerCase() === 'true';

  const httpTimeoutMs = toNumber(args.httpTimeoutMs, 20000);
  const pollTimeoutMs = toNumber(args.pollTimeoutMs, 120000);
  const pollMinMs = toNumber(args.pollMinMs, 500);
  const pollMaxMs = toNumber(args.pollMaxMs, 900);

  const totalRequests = Math.max(1, Math.floor(rpm * minutes));
  const intervalMs = Math.max(1, Math.floor(60000 / rpm));

  const outDir = path.join(process.cwd(), 'logs', 'loadtest');
  fs.mkdirSync(outDir, { recursive: true });
  const runId = `loadtest_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const jsonPath = path.join(outDir, `${runId}.json`);
  const csvPath = path.join(outDir, `${runId}.csv`);

  console.log(`Load test starting:
  baseUrl=${baseUrl}
  rate=${rpm}/min (interval ${intervalMs}ms)
  duration=${minutes} minute(s)
  totalRequests=${totalRequests}
  concurrency(poll)=${concurrency}
  randomSearches=${random}
  output=${jsonPath}
`);

  const requests = [];
  let inFlight = 0;
  let nextIndex = 0;

  async function runOne(reqIndex) {
    const requestSentAt = nowIso();
    const requestSentEpoch = Date.now();

    const input = random
      ? await buildRandomSearchParams(baseUrl, httpTimeoutMs, {
          tripType: args.tripType, // 'roundtrip' | 'oneway' | 'random'
          departure: args.departure,
          destination: args.destination
        })
      : defaultSearchParams();

    const { ok, status, json } = await postJson(`${baseUrl}/api/search`, input, httpTimeoutMs);
    if (!ok || !json.jobId) {
      return {
        reqIndex,
        jobId: json?.jobId || '',
        status: 'failed',
        ...input,
        requestSentAt,
        jobCreatedAt: '',
        jobStartedAt: '',
        jobFinishedAt: '',
        clickToResultSeconds: '',
        queueWaitSeconds: '',
        runSeconds: '',
        totalSeconds: '',
        error: `POST /api/search failed (HTTP ${status})`
      };
    }

    const jobId = json.jobId;
    const poll = await pollJob(baseUrl, jobId, {
      pollMinMs,
      pollMaxMs,
      pollTimeoutMs,
      httpTimeoutMs
    });

    const job = poll.job || {};
    const createdAt = job.createdAt ? new Date(job.createdAt).toISOString() : '';
    const startedAt = job.startedAt ? new Date(job.startedAt).toISOString() : '';
    const finishedAt = job.finishedAt ? new Date(job.finishedAt).toISOString() : '';

    const createdEpoch = job.createdAt || null;
    const startedEpoch = job.startedAt || null;
    const finishedEpoch = job.finishedAt || null;

    const totalMs = finishedEpoch ? (finishedEpoch - requestSentEpoch) : null;
    const queueMs = createdEpoch && startedEpoch ? (startedEpoch - createdEpoch) : null;
    const runMs = startedEpoch && finishedEpoch ? (finishedEpoch - startedEpoch) : null;

    return {
      reqIndex,
      jobId,
      status: poll.status,
      ...input,
      requestSentAt,
      jobCreatedAt: createdAt,
      jobStartedAt: startedAt,
      jobFinishedAt: finishedAt,
      clickToResultSeconds: totalMs !== null ? (totalMs / 1000).toFixed(2) : '',
      queueWaitSeconds: queueMs !== null ? (queueMs / 1000).toFixed(2) : '',
      runSeconds: runMs !== null ? (runMs / 1000).toFixed(2) : '',
      totalSeconds: totalMs !== null ? (totalMs / 1000).toFixed(2) : '',
      error: poll.status === 'failed' ? (poll.error || '') : ''
    };
  }

  // Producer: schedule N requests evenly over time
  const scheduled = [];
  for (let i = 0; i < totalRequests; i++) {
    scheduled.push(Date.now() + i * intervalMs);
  }

  const results = [];

  async function schedulerLoop() {
    while (nextIndex < totalRequests) {
      const now = Date.now();
      const dueAt = scheduled[nextIndex];
      if (now < dueAt) {
        await sleep(Math.min(100, dueAt - now));
        continue;
      }

      if (inFlight >= concurrency) {
        await sleep(50);
        continue;
      }

      const reqIndex = nextIndex;
      nextIndex++;
      inFlight++;

      const p = runOne(reqIndex)
        .then((row) => {
          results.push(row);
          const msg = `${row.reqIndex}/${totalRequests - 1} jobId=${row.jobId} status=${row.status} total=${row.totalSeconds || '—'}s`;
          console.log(msg);
        })
        .catch((e) => {
          results.push({
            reqIndex,
            jobId: '',
            status: 'failed',
            requestSentAt: nowIso(),
            jobCreatedAt: '',
            jobStartedAt: '',
            jobFinishedAt: '',
            clickToResultSeconds: '',
            queueWaitSeconds: '',
            runSeconds: '',
            totalSeconds: '',
            error: e?.message || String(e)
          });
        })
        .finally(() => {
          inFlight--;
        });

      requests.push(p);
    }
  }

  await schedulerLoop();
  await Promise.allSettled(requests);

  // Summary
  const totals = results
    .filter((r) => r.status === 'done' && r.totalSeconds)
    .map((r) => Number(r.totalSeconds))
    .filter((n) => Number.isFinite(n));

  const done = results.filter((r) => r.status === 'done').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  const summary = {
    runId,
    baseUrl,
    rpm,
    minutes,
    totalRequests,
    done,
    failed,
    statsSeconds: {
      min: totals.length ? Math.min(...totals) : null,
      p50: pct(totals, 50),
      p90: pct(totals, 90),
      p95: pct(totals, 95),
      max: totals.length ? Math.max(...totals) : null
    }
  };

  const report = {
    summary,
    results
  };

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(csvPath, toCsv(results));

  console.log('\nDone.');
  console.log('Summary:', summary);
  console.log(`Report JSON: ${jsonPath}`);
  console.log(`Report CSV:  ${csvPath}`);
}

main().catch((e) => {
  console.error('Load test failed:', e);
  process.exit(1);
});


