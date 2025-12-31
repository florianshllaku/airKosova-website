const puppeteer = require('puppeteer');
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
// BALANCED SPEED SETTINGS
// Fast but reliable - works on both local & server
// ============================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true';
const VERBOSE = process.env.VERBOSE_LOG === 'true' || !IS_PRODUCTION;

// BALANCED timings - tested for reliability + speed
const WAIT_TINY = 30;      // Minimal pause
const WAIT_SHORT = 60;     // Quick actions
const WAIT_MEDIUM = 120;   // Dropdown/typing
const WAIT_LONG = 250;     // Complex actions
const WAIT_PAGE = 500;     // After page load
const TYPE_DELAY = 8;      // Typing speed

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

async function saveDebugInfo(page, searchParams, reason) {
    try {
        const debugDir = path.join(__dirname, '..', 'logs', 'debug');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = `debug_${timestamp}`;
        
        await page.screenshot({ path: path.join(debugDir, `${prefix}.png`), fullPage: true });
        fs.writeFileSync(path.join(debugDir, `${prefix}.html`), await page.content());
        fs.writeFileSync(path.join(debugDir, `${prefix}.json`), JSON.stringify({ timestamp, reason, url: page.url(), searchParams }, null, 2));
        
        logAlways('📸', `Debug saved: ${prefix}`);
    } catch (e) {
        logAlways('⚠️', 'Debug save failed: ' + e.message);
    }
}

async function searchFlights(searchParams, performanceLogger = null) {
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
    
    let browser, page;
    
    try {
        // STEP 1: Launch browser (target: <500ms)
        perf.startStep('browser_launch');
        
        browser = await puppeteer.launch({
            headless: DEBUG_MODE ? false : 'new',
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--disable-extensions', '--disable-background-networking',
                '--disable-default-apps', '--disable-sync', '--mute-audio', '--no-first-run',
                '--window-size=1280,900'
            ],
            defaultViewport: { width: 1280, height: 900 },
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        
        page = await browser.newPage();
        
        // Block heavy resources
        await page.setRequestInterception(true);
        page.on('request', req => {
            const t = req.resourceType();
            if (t === 'image' || t === 'font' || t === 'media' || req.url().includes('analytics') || req.url().includes('facebook')) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        perf.endStep('browser_launch');
        log('✅', `Browser: ${perf.getStepDuration('browser_launch')}ms`);
        
        // STEP 2: Navigate (target: <1.5s)
        perf.startStep('page_navigation');
        
        await page.goto('https://www.prishtinaticket.net/en', { 
            waitUntil: 'domcontentloaded',  // FAST - don't wait for all resources
            timeout: 20000 
        });
        
        // Disable animations
        await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
        await wait(WAIT_PAGE);
        
        perf.endStep('page_navigation');
        log('✅', `Navigate: ${perf.getStepDuration('page_navigation')}ms`);
        
        // STEP 3: Form filling (target: <800ms)
        perf.startStep('form_filling');
        
        // Trip type
        if (tripType === 'oneway') {
            await page.evaluate(() => {
                const l = [...document.querySelectorAll('label')].find(x => x.textContent.toLowerCase().includes('one way'));
                if (l) l.click();
            });
            await wait(WAIT_SHORT);
        }
        
        // Departure
        await page.evaluate(() => {
            const inp = document.querySelectorAll('input[matinput], input[aria-autocomplete]')[0];
            if (inp) { inp.value = ''; inp.focus(); inp.click(); }
        });
        await wait(WAIT_TINY);
        await page.keyboard.type(fromCity, { delay: TYPE_DELAY });
        await wait(WAIT_MEDIUM);
        await page.evaluate(() => document.querySelector('mat-option, [role="option"]')?.click());
        await wait(WAIT_SHORT);
        
        // Destination
        await page.evaluate(() => {
            const inp = document.querySelectorAll('input[matinput], input[aria-autocomplete]')[1];
            if (inp) { inp.value = ''; inp.focus(); inp.click(); }
        });
        await wait(WAIT_TINY);
        await page.keyboard.type(toCity, { delay: TYPE_DELAY });
        await wait(WAIT_MEDIUM);
        await page.evaluate(() => document.querySelector('mat-option, [role="option"]')?.click());
        await wait(WAIT_SHORT);
        
        perf.endStep('form_filling');
        log('✅', `Form: ${perf.getStepDuration('form_filling')}ms`);
        
        // STEP 4: Dates (target: <500ms)
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
        
        // STEP 5: Passengers (only if needed)
        if (totalAdults > 1 || totalChildren > 0 || totalInfants > 0) {
            perf.startStep('set_passengers');
            try {
                await page.click('lib-button button');
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
        
        // STEP 6: Search & wait (target: <2s)
        perf.startStep('search_and_wait');
        
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes('search'));
            if (btn) btn.click();
        });
        
        try {
            await page.waitForSelector('lib-modern-flight-availability', { timeout: 10000 });
            await wait(800);  // Let content render
        } catch (e) {
            log('⚠️', 'Timeout - checking anyway');
            await wait(1500);
        }
        
        perf.endStep('search_and_wait');
        log('✅', `Search: ${perf.getStepDuration('search_and_wait')}ms`);
        
        // STEP 7: Extract (target: <50ms)
        perf.startStep('extract_data');
        
        const flightData = await page.evaluate((fromCode, toCode) => {
            const results = {
                outbound: { route: { fromCode, toCode }, flights: [] },
                return: { route: { fromCode: toCode, toCode: fromCode }, flights: [] }
            };
            
            function extract(container) {
                if (!container) return [];
                const txt = container.textContent || '';
                const times = txt.match(/\d{2}:\d{2}/g) || [];
                const eurP = txt.match(/€\s*(\d+)/g) || [];
                const chfP = txt.match(/CHF\s*(\d+)/g) || [];
                const durs = txt.match(/\d+h\s*\d*\s*min/gi) || [];
                const flights = [];
                
                for (let i = 0; i < times.length - 1; i += 2) {
                    const idx = Math.floor(i / 2);
                    let price = '0', currency = 'EUR';
                    
                    if (eurP[idx]) { price = eurP[idx].match(/(\d+)/)?.[1] || '0'; }
                    else if (chfP[idx]) { price = chfP[idx].match(/(\d+)/)?.[1] || '0'; currency = 'CHF'; }
                    else if (eurP[0]) { price = eurP[0].match(/(\d+)/)?.[1] || '0'; }
                    
                    if (parseFloat(price) > 0) {
                        flights.push({ departureTime: times[i], arrivalTime: times[i+1], duration: durs[idx] || '2h', price, currency });
                    }
                }
                return flights;
            }
            
            const containers = document.querySelectorAll('lib-modern-flight-availability');
            if (containers[0]) results.outbound.flights = extract(containers[0]);
            if (containers[1]) results.return.flights = extract(containers[1]);
            
            return results;
        }, fromCode, toCode);
        
        perf.endStep('extract_data');
        
        // Results
        logAlways('✈️', `Found: ${flightData.outbound.flights.length} out, ${flightData.return.flights.length} ret`);
        
        if (flightData.outbound.flights.length === 0 && flightData.return.flights.length === 0) {
            logAlways('⚠️', 'No flights - saving debug');
            await saveDebugInfo(page, searchParams, 'No flights');
        }
        
        if (DEBUG_MODE) await wait(3000);
        
        perf.printSummary();
        
        return {
            success: true,
            url: page.url(),
            searchParams: { from: departure, to: destination, fromCode, toCode, departureDate, returnDate, adults: totalAdults, children: totalChildren, infants: totalInfants, tripType },
            flights: {
                outbound: { route: flightData.outbound.route, flights: flightData.outbound.flights },
                return: { route: flightData.return.route, flights: flightData.return.flights },
                currency: 'EUR'
            },
            performanceLogger: perf
        };
        
    } catch (error) {
        logAlways('❌', 'Error: ' + error.message);
        if (page) await saveDebugInfo(page, searchParams, error.message);
        return { success: false, error: error.message, flights: { outbound: { flights: [] }, return: { flights: [] } }, performanceLogger: perf };
    } finally {
        if (browser) {
            perf.startStep('browser_close');
            await browser.close();
            perf.endStep('browser_close');
        }
    }
}

module.exports = { searchFlights, airportCodes, PerformanceLogger };
