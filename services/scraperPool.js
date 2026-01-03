const { chromium } = require('playwright');
const { runSearchAutomation, setupPageRouting, ensureOnHomepage, HOMEPAGE_URL, NAV_TIMEOUT_MS, PerformanceLogger } = require('./flightScraper');

const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true';
const SLOW_MO_MS = parseInt(process.env.SLOW_MO_MS || '0', 10) || 0;

// Pool sizing (per your spec): 3 browsers with 10 workers each (30 total pages)
const BROWSER_COUNT = 3;
const WORKERS_PER_BROWSER = 10;
const WORKERS_TOTAL = BROWSER_COUNT * WORKERS_PER_BROWSER;
const JOB_TIMEOUT_MS = Math.max(5000, parseInt(process.env.JOB_TIMEOUT_MS || '30000', 10) || 30000);
const POOL_INIT_RETRIES = Math.max(0, parseInt(process.env.POOL_INIT_RETRIES || '3', 10) || 3);
const POOL_WARM_ON_STARTUP = process.env.POOL_WARM_ON_STARTUP !== 'false';

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
          page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

          await setupPageRouting(page);
          if (POOL_WARM_ON_STARTUP) {
            let warmed = false;
            let lastErr = null;
            for (let attempt = 1; attempt <= POOL_INIT_RETRIES + 1; attempt++) {
              try {
                await ensureOnHomepage(page);
                warmed = true;
                break;
              } catch (e) {
                lastErr = e;
                // Backoff a bit; target site or network can be slow at boot.
                await delay(1000 * attempt);
              }
            }
            if (!warmed) {
              console.log(`⚠️ Worker warm-up failed (worker=${workerId}, browser=${browserIndex}): ${lastErr?.message || lastErr}`);
              // Keep the page open anyway; first job will navigate again.
            }
          }

          this.workers.push({
            id: workerId++,
            browserIndex,
            context,
            page,
            busy: false,
            currentJobId: null,
            lastJobId: null
          });
        }
      }

      this._initialized = true;
      console.log(`🧰 ScraperPool ready: ${BROWSER_COUNT} browsers, ${this.workers.length} workers, homepage=${HOMEPAGE_URL}`);

      // If any jobs arrived while we were booting, start them now.
      this._tryStartNext();
    })().catch(err => {
      // Allow retrying init if it fails
      this._initPromise = null;
      this._initialized = false;
      throw err;
    });

    return this._initPromise;
  }

  /**
   * Create job, try to acquire worker; if none free, enqueue.
   * Always returns jobId immediately.
   */
  submitJob(input) {
    // If the first request arrives before startup init finishes, kick init now.
    // The job will be queued and processed automatically once init completes.
    if (!this._initialized && !this._initPromise) {
      this.init().catch(() => {});
    }

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

  getStatus() {
    const total = this.workers.length;
    const busy = this.workers.filter(w => w.busy).length;
    const counts = { queued: 0, running: 0, done: 0, failed: 0 };
    for (const j of this.jobs.values()) {
      if (counts[j.status] !== undefined) counts[j.status]++;
    }

    const oldestQueued = this.queue.length > 0 ? this.jobs.get(this.queue[0]) : null;
    const oldestQueuedAgeMs = oldestQueued ? (Date.now() - oldestQueued.createdAt) : 0;

    return {
      browsers: this.browsers.length,
      workersTotal: total,
      workersBusy: busy,
      workersFree: total - busy,
      queueLength: this.queue.length,
      jobs: counts,
      oldestQueuedAgeMs,
      workers: this.workers.map(w => ({
        id: w.id,
        browserIndex: w.browserIndex,
        busy: w.busy,
        currentJobId: w.currentJobId,
        lastJobId: w.lastJobId
      }))
    };
  }

  listJobs(limit = 50) {
    const items = Array.from(this.jobs.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit)
      .map(j => ({
        jobId: j.jobId,
        status: j.status,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt,
        workerId: j.workerId,
        error: j.status === 'failed' ? j.error : undefined
      }));
    return { total: this.jobs.size, items };
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
      await worker.page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      // Optional readiness: ensure main search inputs exist
      await worker.page.waitForSelector('input[aria-autocomplete], input[matinput]', { timeout: Math.min(15000, NAV_TIMEOUT_MS) }).catch(() => {});
    } catch (e) {
      // If reset fails, try a full reload once; worst case we leave it as-is and next job will navigate.
      try {
        await worker.page.goto(HOMEPAGE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => {});
      } catch (_) {}
    } finally {
      worker.busy = false;
      worker.currentJobId = null;
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
    worker.currentJobId = jobId;
    worker.lastJobId = jobId;

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


