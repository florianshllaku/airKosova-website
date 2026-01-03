const fs = require('fs');
const path = require('path');
const PerformanceLogger = require('./performanceLogger');

// Airport codes mapping
const airportCodes = {
    "Prishtina": "PRN", "Stockholm": "ARN", "Berlin Brandenburg": "BER",
    "Milano Bergamo": "BGY", "Bremen": "BRE", "Brussels": "BRU", "Basel": "BSL",
    "Köln/Bonn": "CGN", "Dortmund": "DTM", "Düsseldorf": "DUS", "Memmingen": "FMM",
    "Münster-Osnabrück": "FMO", "Göteborg Landvetter": "GOT", "Geneva": "GVA",
    "Hannover": "HAJ", "Hamburg": "HAM", "Helsinki": "HEL", "Ljubljana": "LJU",
    "Luxembourg": "LUX", "Malmö": "MMX", "München": "MUC", "Nürnberg": "NUE",
    "Oslo": "OSL", "Stuttgart": "STR", "Salzburg": "SZG", "Vienna": "VIE",
    "Växjö-Småland": "VXO", "Zürich": "ZRH"
};

const cityNames = {
    "PRN": "Prishtina", "ARN": "Stockholm", "BER": "Berlin", "BGY": "Milano",
    "BRE": "Bremen", "BRU": "Brussels", "BSL": "Basel", "CGN": "Köln",
    "DTM": "Dortmund", "DUS": "Düsseldorf", "FMM": "Memmingen", "FMO": "Münster",
    "GOT": "Göteborg", "GVA": "Geneva", "HAJ": "Hannover", "HAM": "Hamburg",
    "HEL": "Helsinki", "LJU": "Ljubljana", "LUX": "Luxembourg", "MMX": "Malmö",
    "MUC": "München", "NUE": "Nürnberg", "OSL": "Oslo", "STR": "Stuttgart",
    "SZG": "Salzburg", "VIE": "Vienna", "VXO": "Växjö", "ZRH": "Zürich"
};

// ============================================
// OPTIMIZED SPEED SETTINGS
// ============================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Headless by default. Set DEBUG_BROWSER=true to see Chromium live.
const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true';
const VERBOSE = process.env.VERBOSE_LOG === 'true' || !IS_PRODUCTION;
// Optional: slow down Playwright actions when debugging (milliseconds). Example: SLOW_MO_MS=75
const SLOW_MO_MS = parseInt(process.env.SLOW_MO_MS || '0', 10) || 0;
// Optional: log a few extracted prices to help debug production mismatches
const PRICE_DEBUG = process.env.PRICE_DEBUG === 'true';
// Optional: always save a debug snapshot (png/html/json) after each search (useful for prod debugging)
const SAVE_DEBUG_ALWAYS = process.env.SAVE_DEBUG_ALWAYS === 'true';

// OPTIMIZED timings - safe reductions for speed
const WAIT_TINY = 30;      // Minimal pause
const WAIT_SHORT = 50;     // Quick actions
const WAIT_MEDIUM = 150;   // Dropdown/typing
const WAIT_LONG = 250;     // Complex actions
const WAIT_PAGE = 300;     // After page load
const TYPE_DELAY = 50;     // Typing speed - SLOW for accuracy (50ms per character)

// Angular Material autocomplete options can appear as `mat-option` or `mat-mdc-option` depending on site version.
const AUTOCOMPLETE_OPTION_SELECTOR = 'mat-option, mat-mdc-option, .mat-mdc-option, [role="option"]';

// Request blocking (speed): keep safe defaults that don't break the app.
// - Always block heavy assets (images/fonts/media)
// - Block common trackers/analytics unless explicitly disabled
const BLOCK_TRACKERS = process.env.BLOCK_TRACKERS !== 'false';

// Homepage for resetting workers after each job
const HOMEPAGE_URL = process.env.PRISHTINATICKET_HOME || 'https://prishtinaticket.net/';

function log(emoji, message) {
    if (VERBOSE) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${emoji} ${message}`);
    }
}

function logAlways(emoji, message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${emoji} ${message}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Register request blocking rules for speed.
 * Call once per page (worker).
 */
async function setupPageRouting(page) {
    if (page.__akRouteSetup) return;
    await page.route('**/*', route => {
        const req = route.request();
        const t = req.resourceType();
        const url = req.url();

        // Heavy assets we never need for scraping speed
        if (t === 'image' || t === 'font' || t === 'media') return route.abort();

        // Trackers/analytics (safe to block; can be disabled via BLOCK_TRACKERS=false)
        if (BLOCK_TRACKERS) {
            const u = url.toLowerCase();
            if (
                u.includes('googletagmanager') ||
                u.includes('google-analytics') ||
                u.includes('doubleclick') ||
                u.includes('hotjar') ||
                u.includes('analytics') ||
                u.includes('facebook') ||
                u.includes('fbq') ||
                u.includes('clarity.ms')
            ) {
                return route.abort();
            }
        }

        return route.continue();
    });
    page.__akRouteSetup = true;
}

async function dismissCookieBanner(page) {
    try {
        const btn = page.locator('button:has-text("Accept Cookies"), button:has-text("Accept cookies"), button:has-text("Accept")').first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click({ timeout: 2000 }).catch(() => {});
            await wait(150);
            log('🍪', 'Accepted cookies banner');
        }
    } catch (e) {
        // ignore
    }
}

async function selectCityFromAutocomplete(page, inputLocator, cityTextOrObj) {
    const city = (typeof cityTextOrObj === 'string' ? cityTextOrObj : cityTextOrObj?.label) || '';
    const code = (typeof cityTextOrObj === 'object' ? cityTextOrObj?.code : '') || '';
    const cityStr = String(city).trim();
    const codeStr = String(code).trim();
    if (!cityStr && !codeStr) return false;

    // Make sure overlays (cookies) don't block interaction
    await dismissCookieBanner(page);

    const warning = page.locator('text=Please select an item from the list').first();

    // Try twice (production can be slower / autocomplete can be flaky)
    for (let attempt = 1; attempt <= 3; attempt++) {
        // Focus input and set value
        await inputLocator.click({ timeout: 5000 });
        await inputLocator.fill(cityStr || codeStr);

        // Try to open the autocomplete dropdown
        await inputLocator.press('ArrowDown').catch(() => {});
        await wait(100);

        // Wait for options to appear (Angular Material overlay)
        const options = page.locator(AUTOCOMPLETE_OPTION_SELECTOR);
        const anyOptVisible = await options.first().isVisible({ timeout: 7000 }).catch(() => false);

        if (anyOptVisible) {
            // Choose the best matching option by text (prefer airport code match if available)
            const count = Math.min(await options.count(), 20);
            let bestIndex = 0;
            let bestScore = -1;
            for (let i = 0; i < count; i++) {
                const txt = (await options.nth(i).innerText().catch(() => '')) || '';
                const t = txt.toLowerCase();
                let score = 0;
                if (codeStr && t.includes(codeStr.toLowerCase())) score += 5;
                if (cityStr && t.includes(cityStr.toLowerCase())) score += 3;
                // Prefer exact start matches
                if (cityStr && t.startsWith(cityStr.toLowerCase())) score += 1;
                if (score > bestScore) { bestScore = score; bestIndex = i; }
            }
            await options.nth(bestIndex).scrollIntoViewIfNeeded().catch(() => {});
            await options.nth(bestIndex).click({ timeout: 5000 }).catch(() => {});
        } else {
            // Fallback: keyboard select first entry (better than nothing)
            await inputLocator.press('Enter').catch(() => {});
        }

        // Blur to force Angular validation/selection to apply
        await inputLocator.press('Tab').catch(() => {});
        await wait(150);

        // Verify: input must now contain the city and no warning should be visible
        const value = await inputLocator.inputValue().catch(() => '');
        const warningVisible = await warning.isVisible({ timeout: 300 }).catch(() => false);
        const v = String(value || '').toLowerCase();
        const ok =
            !warningVisible &&
            (v.length > 0) &&
            (
                (cityStr && v.includes(cityStr.toLowerCase())) ||
                (codeStr && v.includes(codeStr.toLowerCase()))
            );
        if (ok) return true;

        // Retry: clear + continue
        await inputLocator.click({ timeout: 5000 }).catch(() => {});
        await inputLocator.fill('').catch(() => {});
        await dismissCookieBanner(page);
        await wait(200);
    }

    return false;
}

// Navigate to homepage (or click logo to return)
async function ensureOnHomepage(page) {
    await page.goto(HOMEPAGE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000
    });

    // Disable animations
    await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
    await wait(WAIT_PAGE);

    // Cookie banner can block clicks/autocomplete dropdowns
    await dismissCookieBanner(page);

    // Extra readiness check
    await page.waitForSelector('input[aria-autocomplete], input[matinput]', { timeout: 8000 }).catch(() => {});
}

// Click logo to return to homepage after extraction
async function returnToHomepage(page) {
    try {
        // User-requested: wait a moment so the results page is visible, then click logo
        await wait(1000);

        // Click the exact logo selector you provided (most reliable)
        const clicked = await page.evaluate(() => {
            const exact =
                'body > app-root > app-booking > div > div > lib-flight-header > div > div.flex.items-center.w-full.lg\\:w-auto.justify-center.lg\\:justify-start.py-4.lg\\:py-0.mr-6.lg\\:mr-0 > lib-logo > div > lib-link > a > img';
            const logoImg = document.querySelector(exact);
            if (logoImg) { logoImg.click(); return true; }

            // Fallbacks
            const logoAny = document.querySelector('lib-logo img, lib-logo a, lib-flight-header lib-logo');
            if (logoAny) { logoAny.click(); return true; }

            const logoLink = document.querySelector('a[href="/en"], a[href="/"]');
            if (logoLink) { logoLink.click(); return true; }

            return false;
        });

        if (!clicked) throw new Error('Logo element not found to return home');

        // Wait for homepage search inputs to be present
        await page.waitForSelector('input[aria-autocomplete], input[matinput]', { timeout: 8000 });
        await wait(WAIT_PAGE);

        // We consider ourselves "ready" once we are not on booking/results view
        const url = page.url();
        const ready = url.includes('prishtinaticket.net') && !url.includes('/booking');
        log('🏠', `Returned to homepage via logo click (${ready ? 'ready' : 'not-ready'})`);
        return ready;
    } catch (e) {
        log('⚠️', 'Logo click failed, will navigate fresh next time: ' + e.message);
        return false;
    }
}

async function saveDebugInfo(page, searchParams, reason, extra = null) {
    try {
        const debugDir = path.join(__dirname, '..', 'logs', 'debug');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = `debug_${timestamp}`;
        
        await page.screenshot({ path: path.join(debugDir, `${prefix}.png`), fullPage: true });
        fs.writeFileSync(path.join(debugDir, `${prefix}.html`), await page.content());
        fs.writeFileSync(
            path.join(debugDir, `${prefix}.json`),
            JSON.stringify({ timestamp, reason, url: page.url(), searchParams, extra }, null, 2)
        );
        
        logAlways('📸', `Debug saved: ${prefix}`);
    } catch (e) {
        logAlways('⚠️', 'Debug save failed: ' + e.message);
    }
}

/**
 * Core automation: runs a flight search using the provided Playwright page.
 * Browser/page lifecycle is managed by the worker pool.
 */
async function runSearchAutomation(page, searchParams, performanceLogger = null) {
        const { departure, destination, departureDate, returnDate, adults = 1, children = 0, infants = 0, tripType = 'roundtrip' } = searchParams;
        
        const perf = performanceLogger || new PerformanceLogger();
        perf.setSearchParams(searchParams);
        
        const fromCode = airportCodes[departure] || departure;
        const toCode = airportCodes[destination] || destination;
        const fromCity = cityNames[fromCode] || departure;
        const toCity = cityNames[toCode] || destination;
        
        const depDate = new Date(departureDate);
        const retDate = returnDate ? new Date(returnDate) : null;
        
        const totalAdults = parseInt(adults) || 1;
        const totalChildren = parseInt(children) || 0;
        const totalInfants = parseInt(infants) || 0;
        
        logAlways('🔍', `Search: ${fromCode}→${toCode} | ${depDate.toLocaleDateString()}${retDate ? ' → ' + retDate.toLocaleDateString() : ''}`);

        try {
            // STEP 1: Navigate to homepage (workers are reset to homepage after each job, but we hard-navigate to be safe)
            perf.startStep('page_navigation');
            await ensureOnHomepage(page);
            perf.endStep('page_navigation');
            log('✅', `Navigate: ${perf.getStepDuration('page_navigation')}ms`);

            // STEP 2: Form filling (UI)
        perf.startStep('form_filling');
        
        // Trip type
        if (tripType === 'oneway') {
            await page.evaluate(() => {
                const l = [...document.querySelectorAll('label')].find(x => x.textContent.toLowerCase().includes('one way'));
                if (l) l.click();
            });
            await wait(WAIT_SHORT);
        }
        
        // === CITIES (Departure + Destination) ===
        const inputs = page.locator('input[matinput], input[aria-autocomplete]');
        if (await inputs.count() >= 2) {
            const depInput = inputs.nth(0);
            const destInput = inputs.nth(1);

            const depOk = await selectCityFromAutocomplete(page, depInput, { label: fromCity, code: fromCode });
            if (!depOk) logAlways('⚠️', `Departure city did not select from dropdown: ${fromCity}`);

            const destOk = await selectCityFromAutocomplete(page, destInput, { label: toCity, code: toCode });
            if (!destOk) logAlways('⚠️', `Destination city did not select from dropdown: ${toCity}`);

            // If city selection fails, stop early and save debug instead of running a wrong search.
            if (!depOk || !destOk) {
                await saveDebugInfo(page, searchParams, 'City selection failed', { depOk, destOk, fromCity, toCity, fromCode, toCode });
                throw new Error(`City selection failed (depOk=${depOk}, destOk=${destOk})`);
            }
        } else {
            logAlways('⚠️', 'City inputs not found for autocomplete selection');
        }
        
        perf.endStep('form_filling');
        log('✅', `Form: ${perf.getStepDuration('form_filling')}ms`);
        
            // STEP 3: Dates
        perf.startStep('select_dates');
        
        const datePickerBtn = tripType === 'oneway' ? 'lib-datepicker button' : 'lib-range-datepicker button';
        
        try {
            await page.waitForSelector(datePickerBtn, { timeout: 3000 });
            await page.click(datePickerBtn);
            await wait(WAIT_MEDIUM);
            
            // Fast month navigation
            const navToMonth = async (tMonth, tYear) => {
                for (let i = 0; i < 24; i++) {
                    const cur = await page.evaluate(() => {
                        const btn = document.querySelector('.mat-calendar-period-button');
                        if (!btn) return null;
                        const txt = btn.textContent.toUpperCase();
                        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                        const m = months.findIndex(x => txt.includes(x));
                        const y = txt.match(/20\d{2}/);
                        return { m, y: y ? parseInt(y[0]) : -1 };
                    });
                    if (!cur || cur.m === -1) break;
                    if (cur.y === tYear && cur.m === tMonth) break;
                    await page.click((tYear * 12 + tMonth) > (cur.y * 12 + cur.m) ? '.mat-calendar-next-button' : '.mat-calendar-previous-button');
                    await wait(WAIT_TINY);
                }
            };
            
            await navToMonth(depDate.getMonth(), depDate.getFullYear());
            await page.evaluate(d => {
                const cells = document.querySelectorAll('.mat-calendar-body-cell');
                for (const c of cells) {
                    const t = c.querySelector('.mat-calendar-body-cell-content');
                    if (t && t.textContent.trim() === d.toString()) { c.click(); break; }
                }
            }, depDate.getDate());
            await wait(WAIT_SHORT);
            
            if (tripType !== 'oneway' && retDate) {
                await navToMonth(retDate.getMonth(), retDate.getFullYear());
                await page.evaluate(d => {
                    const cells = document.querySelectorAll('.mat-calendar-body-cell');
                    for (const c of cells) {
                        const t = c.querySelector('.mat-calendar-body-cell-content');
                        if (t && t.textContent.trim() === d.toString()) { c.click(); break; }
                    }
                }, retDate.getDate());
                await wait(WAIT_SHORT);
            }
            
            await page.keyboard.press('Escape');
        } catch (e) {
            log('⚠️', 'Date error: ' + e.message);
        }
        
        perf.endStep('select_dates');
        log('✅', `Dates: ${perf.getStepDuration('select_dates')}ms`);
        
            // STEP 4: Passengers (only if needed)
        if (totalAdults > 1 || totalChildren > 0 || totalInfants > 0) {
            perf.startStep('set_passengers');
            try {
                // Cookie banner can block the passengers button, especially on long-lived sessions.
                await dismissCookieBanner(page);

                // Playwright click() can wait up to ~30s by default if element isn't clickable.
                // Use a shorter timeout + more targeted selector.
                const passengersBtn = page.locator(
                    'lib-button button:has-text("Adult"), lib-button button:has-text("adult"), button:has-text("Adult"), button:has-text("adult")'
                ).first();

                const clickedPassengers = await passengersBtn
                    .click({ timeout: 5000 })
                    .then(() => true)
                    .catch(() => false);

                if (!clickedPassengers) {
                    // Fallback to previous behavior but with a short timeout
                    await page.click('lib-button button', { timeout: 5000 });
                }

                await wait(WAIT_MEDIUM);
                
                const addP = async (idx, cnt) => {
                    for (let i = 0; i < cnt; i++) {
                        await page.evaluate(idx => {
                            const item = document.querySelector(`lib-passenger-selection-item:nth-child(${idx})`);
                            if (item) [...item.querySelectorAll('button')].find(b => b.textContent.includes('+'))?.click();
                        }, idx);
                        await wait(WAIT_TINY);
                    }
                };
                
                if (totalAdults > 1) await addP(1, totalAdults - 1);
                if (totalChildren > 0) await addP(3, totalChildren);
                if (totalInfants > 0) await addP(5, totalInfants);
                
                await page.keyboard.press('Escape');
            } catch (e) {}
            perf.endStep('set_passengers');
            log('✅', `Passengers: ${perf.getStepDuration('set_passengers')}ms`);
        }
        
        // STEP 6: Search & wait
        perf.startStep('search_and_wait');
        
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes('search'));
            if (btn) btn.click();
        });
        
        try {
            await page.waitForSelector('lib-modern-flight-availability', { timeout: 10000 });
            // Wait until prices/times are actually present (sometimes results skeleton renders first)
            try {
                await page.waitForFunction(() => {
                    const outboundList = document.querySelector(
                        'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(1) > div > div.space-y-5'
                    );
                    const inboundList = document.querySelector(
                        'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(2) > div > div.space-y-5'
                    );

                    const root = outboundList || inboundList || document.querySelector('lib-modern-flight-availability');
                    if (!root) return false;

                    const txt = (root.innerText || root.textContent || '');
                    const hasTimes = (txt.match(/\b\d{2}:\d{2}\b/g) || []).length >= 2;
                    const hasPrice = /€\s*\d|CHF\s*\d|\d\s*€|\d\s*CHF/i.test(txt);
                    return hasTimes && hasPrice;
                }, undefined, { timeout: 6000 });
            } catch (e) {
                // If it never stabilizes, we still try extraction (better than failing)
            }

            await wait(250);  // Small buffer after "ready"
        } catch (e) {
            log('⚠️', 'Timeout - checking anyway');
            await wait(800);  // Reduced from 1500ms
        }
        
        perf.endStep('search_and_wait');
        log('✅', `Search: ${perf.getStepDuration('search_and_wait')}ms`);
        
        // STEP 7: Extract (target: <50ms)
        perf.startStep('extract_data');
        
        const flightData = await page.evaluate(({ fromCode, toCode, priceDebug }) => {
            const results = {
                outbound: { route: { fromCode, toCode }, flights: [] },
                return: { route: { fromCode: toCode, toCode: fromCode }, flights: [] }
            };
            const debugPriceSamples = { outbound: [], return: [] };

            const isBookingContext = !!document.querySelector('app-booking, body app-root app-booking') ||
                /\/flights\/booking/i.test(location.href) ||
                !!document.querySelector('.booking-flights__body, app-availabilities');
            
            function normalizePriceNumber(raw) {
                if (!raw) return null;
                let s = String(raw).trim();
                // Remove spaces and currency symbols/words
                s = s.replace(/\s+/g, '');
                s = s.replace(/[€]/g, '');
                s = s.replace(/CHF/gi, '');
                s = s.replace(/EUR/gi, '');

                // Handle European formats:
                //  - "1.234,56" -> "1234.56"
                //  - "89,50" -> "89.50"
                //  - "1,234.56" -> "1234.56"
                const hasDot = s.includes('.');
                const hasComma = s.includes(',');
                if (hasDot && hasComma) {
                    // Decide decimal separator by last occurrence
                    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
                        // dot thousands, comma decimal
                        s = s.replace(/\./g, '').replace(',', '.');
                    } else {
                        // comma thousands, dot decimal
                        s = s.replace(/,/g, '');
                    }
                } else if (hasComma && !hasDot) {
                    // If comma looks like decimal separator
                    const parts = s.split(',');
                    if (parts.length === 2 && parts[1].length <= 2) {
                        s = parts[0] + '.' + parts[1];
                    } else {
                        s = s.replace(/,/g, '');
                    }
                }

                // Keep only digits and dot
                s = s.replace(/[^0-9.]/g, '');
                if (!s) return null;
                return s;
            }

            function parsePrice(text) {
                const t = (text || '').replace(/\u00A0/g, ' '); // nbsp

                // Patterns like: "€ 123.45" or "CHF123,45"
                let m = t.match(/(CHF|EUR|€)\s*([0-9][0-9.,]*)/i);
                if (m) {
                    const cur = m[1] === '€' ? 'EUR' : m[1].toUpperCase();
                    const num = normalizePriceNumber(m[2]);
                    return num ? { currency: cur, price: num } : null;
                }

                // Patterns like: "123,45 €" or "123 CHF"
                m = t.match(/([0-9][0-9.,]*)\s*(CHF|EUR|€)/i);
                if (m) {
                    const cur = m[2] === '€' ? 'EUR' : m[2].toUpperCase();
                    const num = normalizePriceNumber(m[1]);
                    return num ? { currency: cur, price: num } : null;
                }

                return null;
            }

            function findPriceTextWithin(node) {
                if (!node) return null;
                // Prefer elements likely to contain the actual fare amount
                const preferred = node.querySelectorAll(
                    '[class*="price"], [class*="amount"], [data-cy*="price"], [data-testid*="price"], [aria-label*="price" i]'
                );
                const all = preferred.length ? preferred : node.querySelectorAll('*');
                for (const el of all) {
                    const txt = (el.innerText || el.textContent || '').trim();
                    if (!txt) continue;
                    if (/€\s*\d|CHF\s*\d|\d\s*€|\d\s*CHF/i.test(txt)) return txt;
                }
                return null;
            }

            function extractFromList(listEl) {
                if (!listEl) return [];
                // The `.space-y-5` div is a list container; each direct child is typically a card.
                const nodes = Array.from(listEl.children || []).filter(n => n && (n.innerText || n.textContent));
                const flights = [];
                const seen = new Set();

                for (const node of nodes) {
                    const txt = (node.innerText || node.textContent || '').trim();
                    if (!txt) continue;

                    const times = txt.match(/\b\d{2}:\d{2}\b/g) || [];
                    if (times.length < 2) continue;

                    // IMPORTANT: never make up prices.
                    // If we can't find a real price for this flight card, keep the flight but mark price as null.
                    const priceTxt = findPriceTextWithin(node) || txt;
                    const priceObj = parsePrice(priceTxt);

                    const durMatch =
                        txt.match(/\b\d+\s*h\s*\d+\s*min\b/i) ||
                        txt.match(/\b\d+\s*h\s*\d*\s*min\b/i) ||
                        txt.match(/\b\d+\s*h\b/i);
                    const duration = durMatch ? durMatch[0].replace(/\s+/g, ' ').trim() : '2h';

                    const key = priceObj?.price
                        ? `${times[0]}-${times[1]}-${priceObj.currency}-${priceObj.price}`
                        : `${times[0]}-${times[1]}-NO_PRICE`;
                    if (seen.has(key)) continue;
                    seen.add(key);

                    const priceNum = priceObj?.price ? parseFloat(priceObj.price) : NaN;
                    const flight = {
                        departureTime: times[0],
                        arrivalTime: times[1],
                        duration,
                        price: (!isNaN(priceNum) && priceNum > 0) ? priceObj.price : null,
                        currency: (!isNaN(priceNum) && priceNum > 0) ? priceObj.currency : null
                    };
                    flights.push(flight);

                    if (priceDebug) {
                        // store small sample only to avoid huge payload
                        if (debugPriceSamples && debugPriceSamples.__activeList && debugPriceSamples[debugPriceSamples.__activeList]?.length < 5) {
                            debugPriceSamples[debugPriceSamples.__activeList].push({
                                times: `${flight.departureTime}-${flight.arrivalTime}`,
                                priceTxt: String(priceTxt).slice(0, 120),
                                parsed: `${flight.currency || ''}${flight.price ?? '—'}`,
                                url: location.href
                            });
                        }
                    }
                }

                return flights;
            }

            function extractFallback(container) {
                if (!container) return [];
                const txt = (container.textContent || '').trim();
                const times = txt.match(/\b\d{2}:\d{2}\b/g) || [];
                const prices = txt.match(/(CHF|EUR|€)\s*[0-9][0-9.,]*/gi) || [];
                const durs = txt.match(/\b\d+\s*h\s*\d*\s*min\b/gi) || [];
                const flights = [];
                for (let i = 0; i < times.length - 1; i += 2) {
                    const idx = Math.floor(i / 2);
                    // IMPORTANT: never make up prices (no "prices[0]" fallback).
                    const priceObj = parsePrice(prices[idx] || '');
                    const duration = (durs[idx] || durs[0] || '2h').replace(/\s+/g, ' ').trim();
                    flights.push({
                        departureTime: times[i],
                        arrivalTime: times[i + 1],
                        duration,
                        price: priceObj?.price || null,
                        currency: priceObj?.currency || null
                    });
                }
                return flights;
            }
            
            // Preferred: exact list containers you provided (most reliable)
            const outboundList = document.querySelector(
                'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(1) > div > div.space-y-5'
            );
            const returnList = document.querySelector(
                'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(2) > div > div.space-y-5'
            );

            if (isBookingContext) {
                if (outboundList) {
                    debugPriceSamples.__activeList = 'outbound';
                    results.outbound.flights = extractFromList(outboundList);
                }
                if (returnList) {
                    debugPriceSamples.__activeList = 'return';
                    results.return.flights = extractFromList(returnList);
                }
            } else {
                // Safety: never scrape prices from non-booking pages (homepage has "offers" prices that are unrelated)
                return { results, debugPriceSamples };
            }

            // Fallback (if selectors change)
            if (!results.outbound.flights.length || !results.return.flights.length) {
                const containers = document.querySelectorAll('lib-modern-flight-availability');
                if (containers[0] && results.outbound.flights.length === 0) results.outbound.flights = extractFallback(containers[0]);
                if (containers[1] && results.return.flights.length === 0) results.return.flights = extractFallback(containers[1]);
            }
            
            return { results, debugPriceSamples };
        }, { fromCode, toCode, priceDebug: PRICE_DEBUG });

        const extracted = flightData?.results || flightData || {};

        if (PRICE_DEBUG) {
            const sampleOut = (extracted?.outbound?.flights || []).slice(0, 3);
            const sampleRet = (extracted?.return?.flights || []).slice(0, 3);
            logAlways('💰', `Price samples OUT: ${sampleOut.map(f => `${f.departureTime}-${f.arrivalTime}:${f.currency || ''}${f.price ?? '—'}`).join(' | ')}`);
            logAlways('💰', `Price samples RET: ${sampleRet.map(f => `${f.departureTime}-${f.arrivalTime}:${f.currency || ''}${f.price ?? '—'}`).join(' | ')}`);
            const debugSamples = flightData?.debugPriceSamples;
            if (debugSamples?.outbound?.length) logAlways('🧾', `Raw OUT: ${debugSamples.outbound.map(x => `${x.times} [${x.priceTxt}] -> ${x.parsed}`).join(' | ')}`);
            if (debugSamples?.return?.length) logAlways('🧾', `Raw RET: ${debugSamples.return.map(x => `${x.times} [${x.priceTxt}] -> ${x.parsed}`).join(' | ')}`);
        }
        
        perf.endStep('extract_data');
        
        // Results
        logAlways('✈️', `Found: ${extracted.outbound?.flights?.length || 0} out, ${extracted.return?.flights?.length || 0} ret`);
        
        if ((extracted.outbound?.flights?.length || 0) === 0 && (extracted.return?.flights?.length || 0) === 0) {
            logAlways('⚠️', 'No flights - saving debug');
            await saveDebugInfo(page, searchParams, 'No flights');
        }
        
        if (SAVE_DEBUG_ALWAYS) {
            await saveDebugInfo(page, searchParams, 'SAVE_DEBUG_ALWAYS', {
                flights: {
                    outbound: (extracted.outbound?.flights || []).slice(0, 10),
                    return: (extracted.return?.flights || []).slice(0, 10)
                },
                debugPriceSamples: PRICE_DEBUG ? flightData?.debugPriceSamples : undefined
            });
        }
        
        // STEP 8: (Temporarily disabled) Return to homepage (click logo)
        // User request: focus on extracting correct data first.
        // We intentionally do NOT navigate away from the results page here.
        // Next search will still work because `ensureOnHomepage()` will navigate back to /en if needed.
        
        if (DEBUG_MODE) await wait(3000);
        
        perf.printSummary();
        
            return {
                success: true,
                url: page.url(),
                searchParams: { from: departure, to: destination, fromCode, toCode, departureDate, returnDate, adults: totalAdults, children: totalChildren, infants: totalInfants, tripType },
                flights: {
                    outbound: { route: extracted.outbound?.route, flights: extracted.outbound?.flights || [] },
                    return: { route: extracted.return?.route, flights: extracted.return?.flights || [] },
                    currency: 'EUR'
                },
                performanceLogger: perf,
                browserReused: true
            };
            
        } catch (error) {
            logAlways('❌', 'Error: ' + error.message);
            if (page) await saveDebugInfo(page, searchParams, error.message);
            
            return { success: false, error: error.message, flights: { outbound: { flights: [] }, return: { flights: [] } }, performanceLogger: perf };
        }
}

// Graceful shutdown
module.exports = {
    runSearchAutomation,
    setupPageRouting,
    ensureOnHomepage,
    returnToHomepage,
    HOMEPAGE_URL,
    airportCodes,
    PerformanceLogger
};
