const { chromium } = require('playwright');
const { runSearchAutomation, setupPageRouting, ensureOnHomepage, HOMEPAGE_URL, PerformanceLogger } = require('./flightScraper');

const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true';
const SLOW_MO_MS = parseInt(process.env.SLOW_MO_MS || '0', 10) || 0;

// Pool sizing (per your spec): 3 browsers with 10 workers each (30 total pages)
const BROWSER_COUNT = 3;
const WORKERS_PER_BROWSER = 10;
const WORKERS_TOTAL = BROWSER_COUNT * WORKERS_PER_BROWSER;
const JOB_TIMEOUT_MS = Math.max(5000, parseInt(process.env.JOB_TIMEOUT_MS || '30000', 10) || 30000);

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function makeJobId() {
  // Short enough for logs/URLs; collision probability is fine for in-memory store
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class ScraperPool {
  constructor() {
    this.browsers = []; // [{ browser, index }]
    this.workers = []; // [{ id, browserIndex, context, page, busy }]
    this.jobs = new Map(); // jobId -> job state
    this.queue = []; // FIFO of jobIds
    this._initialized = false;
    this._initPromise = null;
  }

  async init() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      // Launch 2 persistent browsers
      for (let i = 0; i < BROWSER_COUNT; i++) {
        const browser = await chromium.launch({
          headless: !DEBUG_MODE,
          slowMo: DEBUG_MODE ? SLOW_MO_MS : 0,
          args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--disable-extensions', '--disable-background-networking',
            '--disable-default-apps', '--disable-sync', '--mute-audio', '--no-first-run',
            '--window-size=1280,900'
          ],
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        this.browsers.push({ browser, index: i });
      }

      // Create 8 persistent workers (contexts+pages), 4 per browser
      let workerId = 0;
      for (const { browser, index: browserIndex } of this.browsers) {
        for (let j = 0; j < WORKERS_PER_BROWSER; j++) {
          const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          const page = await context.newPage();

          await setupPageRouting(page);
          await ensureOnHomepage(page);

          this.workers.push({
            id: workerId++,
            browserIndex,
            context,
            page,
            busy: false
          });
        }
      }

      this._initialized = true;
      console.log(`🧰 ScraperPool ready: ${BROWSER_COUNT} browsers, ${this.workers.length} workers, homepage=${HOMEPAGE_URL}`);
    })();

    return this._initPromise;
  }

  /**
   * Create job, try to acquire worker; if none free, enqueue.
   * Always returns jobId immediately.
   */
  submitJob(input) {
    const jobId = makeJobId();
    const now = Date.now();
    this.jobs.set(jobId, {
      jobId,
      status: 'queued', // queued | running | done | failed
      input,
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      workerId: null,
      perfSearchId: null
    });

    const worker = this._acquireWorker();
    if (worker) {
      this._startJob(jobId, worker).catch(() => {});
    } else {
      this.queue.push(jobId);
    }

    return jobId;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  _acquireWorker() {
    const w = this.workers.find(x => !x.busy);
    if (!w) return null;
    w.busy = true;
    return w;
  }

  async _releaseWorker(worker) {
    // NEW behavior: always keep page open, but reset it back to homepage after a 2s delay
    try {
      await delay(2000);
      await worker.page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Optional readiness: ensure main search inputs exist
      await worker.page.waitForSelector('input[aria-autocomplete], input[matinput]', { timeout: 8000 }).catch(() => {});
    } catch (e) {
      // If reset fails, try a full reload once; worst case we leave it as-is and next job will navigate.
      try {
        await worker.page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      } catch (_) {}
    } finally {
      worker.busy = false;
      this._tryStartNext();
    }
  }

  _tryStartNext() {
    // FIFO scheduler: whenever a worker is available, start next queued job
    while (this.queue.length > 0) {
      const worker = this._acquireWorker();
      if (!worker) return;

      const nextJobId = this.queue.shift();
      if (!nextJobId) {
        worker.busy = false;
        return;
      }

      const job = this.jobs.get(nextJobId);
      if (!job) {
        worker.busy = false;
        continue;
      }

      this._startJob(nextJobId, worker).catch(() => {});
    }
  }

  async _startJob(jobId, worker) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = Date.now();
    job.workerId = worker.id;

    const perf = new PerformanceLogger();
    perf.setSearchParams(job.input);
    job.perfSearchId = perf.searchId;

    const withTimeout = (p) =>
      Promise.race([
        p,
        (async () => {
          await delay(JOB_TIMEOUT_MS);
          throw new Error(`Job timeout after ${JOB_TIMEOUT_MS}ms`);
        })()
      ]);

    try {
      const result = await withTimeout(runSearchAutomation(worker.page, job.input, perf));
      job.result = result;
      job.status = 'done';
      job.finishedAt = Date.now();
    } catch (e) {
      job.error = e?.message || String(e);
      job.status = 'failed';
      job.finishedAt = Date.now();
    } finally {
      // Always reset and free worker
      await this._releaseWorker(worker);
    }
  }

  async shutdown() {
    // Keep pages open during runtime; close only on shutdown.
    try {
      await Promise.allSettled(this.workers.map(w => w.context?.close?.()));
    } catch (e) {}

    try {
      await Promise.allSettled(this.browsers.map(b => b.browser?.close?.()));
    } catch (e) {}
  }
}

const pool = new ScraperPool();

module.exports = {
  pool,
  BROWSER_COUNT,
  WORKERS_TOTAL,
  JOB_TIMEOUT_MS
};


