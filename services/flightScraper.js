const puppeteer = require('puppeteer');
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
// SPEED SETTINGS
// ============================================
const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true';  // Only true if explicitly set
const ULTRA_SPEED = true;  // Maximum speed optimizations

const WAIT_SHORT = ULTRA_SPEED ? 30 : 50;
const WAIT_MEDIUM = ULTRA_SPEED ? 60 : 100;
const WAIT_LONG = ULTRA_SPEED ? 120 : 200;
const WAIT_PAGE_LOAD = ULTRA_SPEED ? 300 : 500;
const TYPE_DELAY = ULTRA_SPEED ? 5 : 10;

function log(emoji, message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${emoji} ${message}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    
    log('🔍', '='.repeat(60));
    log('🔍', `ULTRA SPEED MODE ⚡⚡⚡ ${DEBUG_MODE ? '(DEBUG)' : '(HEADLESS)'}`);
    log('🔍', '='.repeat(60));
    log('📋', `${departure} (${fromCode}) → ${destination} (${toCode})`);
    log('📅', `Dep: ${depDate.toDateString()} | Ret: ${retDate ? retDate.toDateString() : 'One way'}`);
    
    let browser;
    try {
        // STEP 1: Launch browser with SPEED optimizations
        perf.startStep('browser_launch');
        log('🚀', 'Launching browser...');
        
        browser = await puppeteer.launch({
            headless: DEBUG_MODE ? false : 'new',  // Headless = faster
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-features=TranslateUI',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--window-size=1200,800'
            ],
            defaultViewport: { width: 1200, height: 800 }  // Smaller viewport
        });
        
        const page = await browser.newPage();
        
        // BLOCK UNNECESSARY RESOURCES for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            const url = req.url();
            
            // Block images, fonts, media, and tracking
            if (resourceType === 'image' || 
                resourceType === 'font' || 
                resourceType === 'media' ||
                url.includes('google-analytics') ||
                url.includes('googletagmanager') ||
                url.includes('facebook') ||
                url.includes('hotjar') ||
                url.includes('clarity') ||
                url.includes('.png') ||
                url.includes('.jpg') ||
                url.includes('.gif') ||
                url.includes('.woff') ||
                url.includes('.woff2')) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        perf.endStep('browser_launch');
        log('✅', `Browser launched (${perf.getStepDuration('browser_launch')}ms)`);
        
        // STEP 2: Navigate
        perf.startStep('page_navigation');
        log('📍', 'Loading prishtinaticket.net...');
        
        await page.goto('https://www.prishtinaticket.net/en', { 
            waitUntil: 'domcontentloaded',  // Faster than 'load'
            timeout: 30000 
        });
        
        // Disable CSS animations
        await page.addStyleTag({
            content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
        });
        
        await wait(WAIT_PAGE_LOAD);
        perf.endStep('page_navigation');
        log('✅', `Page loaded (${perf.getStepDuration('page_navigation')}ms)`);
        
        // STEP 3: Trip type (fast)
        perf.startStep('form_filling');
        if (tripType === 'oneway') {
            await page.evaluate(() => {
                const labels = document.querySelectorAll('label');
                for (const l of labels) {
                    if (l.textContent.toLowerCase().includes('one way')) { l.click(); break; }
                }
            });
            await wait(WAIT_SHORT);
        }
        
        // STEP 4: Departure city (optimized)
        log('✈️', `Filling: ${fromCity} → ${toCity}`);
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
            if (inputs[0]) { inputs[0].value = ''; inputs[0].focus(); inputs[0].click(); }
        });
        await wait(WAIT_SHORT);
        await page.keyboard.type(fromCity, { delay: TYPE_DELAY });
        await wait(WAIT_MEDIUM);
        await page.evaluate(() => {
            const opt = document.querySelector('mat-option, [role="option"]');
            if (opt) opt.click();
        });
        await wait(WAIT_SHORT);
        
        // STEP 5: Destination city
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
            if (inputs[1]) { inputs[1].value = ''; inputs[1].focus(); inputs[1].click(); }
        });
        await wait(WAIT_SHORT);
        await page.keyboard.type(toCity, { delay: TYPE_DELAY });
        await wait(WAIT_MEDIUM);
        await page.evaluate(() => {
            const opt = document.querySelector('mat-option, [role="option"]');
            if (opt) opt.click();
        });
        await wait(WAIT_SHORT);
        
        perf.endStep('form_filling');
        log('✅', `Cities filled (${perf.getStepDuration('form_filling')}ms)`);
        
        // STEP 6: Select dates
        perf.startStep('select_dates');
        log('📅', `Selecting dates...`);
        
        const targetDepMonth = depDate.getMonth();
        const targetDepYear = depDate.getFullYear();
        const targetDepDay = depDate.getDate();
        
        const datePickerSelector = tripType === 'oneway' ? 'lib-datepicker button' : 'lib-range-datepicker button';
        
        try {
            await page.waitForSelector(datePickerSelector, { timeout: 3000 });
            await page.click(datePickerSelector);
            await wait(WAIT_MEDIUM);
            
            // Fast calendar navigation
            const navigateToMonth = async (targetMonth, targetYear) => {
                for (let i = 0; i < 24; i++) {
                    const current = await page.evaluate(() => {
                        const btn = document.querySelector('.mat-calendar-period-button');
                        if (!btn) return null;
                        const text = btn.textContent.trim().toUpperCase();
                        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                        let month = -1;
                        for (let i = 0; i < months.length; i++) {
                            if (text.includes(months[i])) { month = i; break; }
                        }
                        const yearMatch = text.match(/20\d{2}/);
                        const year = yearMatch ? parseInt(yearMatch[0]) : -1;
                        return { month, year };
                    });
                    
                    if (!current || current.month === -1) break;
                    if (current.year === targetYear && current.month === targetMonth) break;
                    
                    const currentTotal = current.year * 12 + current.month;
                    const targetTotal = targetYear * 12 + targetMonth;
                    
                    if (targetTotal > currentTotal) {
                        await page.click('.mat-calendar-next-button');
                    } else {
                        await page.click('.mat-calendar-previous-button');
                    }
                    await wait(WAIT_SHORT);
                }
            };
            
            await navigateToMonth(targetDepMonth, targetDepYear);
            
            // Click departure day
            await page.evaluate((day) => {
                const cells = document.querySelectorAll('.mat-calendar-body-cell');
                for (const cell of cells) {
                    const content = cell.querySelector('.mat-calendar-body-cell-content');
                    if (content && content.textContent.trim() === day.toString()) {
                        cell.click(); break;
                    }
                }
            }, targetDepDay);
            await wait(WAIT_SHORT);
            
            // Return date
            if (tripType !== 'oneway' && retDate) {
                await navigateToMonth(retDate.getMonth(), retDate.getFullYear());
                await page.evaluate((day) => {
                    const cells = document.querySelectorAll('.mat-calendar-body-cell');
                    for (const cell of cells) {
                        const content = cell.querySelector('.mat-calendar-body-cell-content');
                        if (content && content.textContent.trim() === day.toString()) {
                            cell.click(); break;
                        }
                    }
                }, retDate.getDate());
                await wait(WAIT_SHORT);
            }
            
            await page.keyboard.press('Escape');
        } catch (e) {
            log('⚠️', 'Date error: ' + e.message);
        }
        
        perf.endStep('select_dates');
        log('✅', `Dates selected (${perf.getStepDuration('select_dates')}ms)`);
        
        // STEP 7: Passengers (skip if default)
        if (totalAdults > 1 || totalChildren > 0 || totalInfants > 0) {
            perf.startStep('set_passengers');
            try {
                const passengerBtn = await page.$('lib-button button');
                if (passengerBtn) {
                    await passengerBtn.click();
                    await wait(WAIT_MEDIUM);
                    
                    const addPassenger = async (idx, count) => {
                        for (let i = 0; i < count; i++) {
                            await page.evaluate((index) => {
                                const item = document.querySelector(`lib-passenger-selection-item:nth-child(${index})`);
                                if (item) {
                                    const btns = item.querySelectorAll('button');
                                    for (const b of btns) if (b.textContent.includes('+')) { b.click(); break; }
                                }
                            }, idx);
                            await wait(WAIT_SHORT);
                        }
                    };
                    
                    if (totalAdults > 1) await addPassenger(1, totalAdults - 1);
                    if (totalChildren > 0) await addPassenger(3, totalChildren);
                    if (totalInfants > 0) await addPassenger(5, totalInfants);
                    
                    await page.keyboard.press('Escape');
                }
            } catch (e) {}
            perf.endStep('set_passengers');
        }
        
        // STEP 8: Click Search
        perf.startStep('search_and_wait');
        log('🔍', 'Searching...');
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                if (b.textContent.toLowerCase().includes('search')) { b.click(); break; }
            }
        });
        
        // STEP 9: Wait for results (optimized)
        try {
            await page.waitForSelector('lib-modern-flight-availability', { timeout: 8000 });
            await wait(600);  // Minimal wait for content
        } catch (e) {
            await wait(1500);
        }
        perf.endStep('search_and_wait');
        log('✅', `Search complete (${perf.getStepDuration('search_and_wait')}ms)`);
        
        // STEP 10: Extract data (fast)
        perf.startStep('extract_data');
        
        const flightData = await page.evaluate((fromCode, toCode) => {
            const results = {
                outbound: { route: { fromCode, toCode }, flights: [], rawText: '' },
                return: { route: { fromCode: toCode, toCode: fromCode }, flights: [], rawText: '' }
            };
            
            function extractFlights(container) {
                if (!container) return [];
                const flights = [];
                const text = container.textContent || '';
                const times = text.match(/\d{2}:\d{2}/g) || [];
                const eurPrices = text.match(/€\s*(\d+)/g) || [];
                const chfPrices = text.match(/CHF\s*(\d+)/g) || [];
                const durations = text.match(/\d+h\s*\d*\s*min/gi) || [];
                
                for (let i = 0; i < times.length - 1; i += 2) {
                    let price = '0', currency = 'EUR';
                    const idx = Math.floor(i / 2);
                    
                    if (eurPrices[idx]) {
                        const m = eurPrices[idx].match(/(\d+)/);
                        if (m) price = m[1];
                    } else if (chfPrices[idx]) {
                        const m = chfPrices[idx].match(/(\d+)/);
                        if (m) { price = m[1]; currency = 'CHF'; }
                    } else if (eurPrices[0]) {
                        const m = eurPrices[0].match(/(\d+)/);
                        if (m) price = m[1];
                    }
                    
                    if (parseFloat(price) > 0) {
                        flights.push({
                            departureTime: times[i],
                            arrivalTime: times[i + 1],
                            duration: durations[idx] || '2h',
                            price, currency
                        });
                    }
                }
                return flights;
            }
            
            const containers = document.querySelectorAll('lib-modern-flight-availability');
            if (containers[0]) {
                results.outbound.rawText = containers[0].textContent.substring(0, 300);
                results.outbound.flights = extractFlights(containers[0]);
            }
            if (containers[1]) {
                results.return.rawText = containers[1].textContent.substring(0, 300);
                results.return.flights = extractFlights(containers[1]);
            }
            
            return results;
        }, fromCode, toCode);
        
        perf.endStep('extract_data');
        
        // Results
        log('📊', '='.repeat(50));
        log('✈️', `Outbound: ${flightData.outbound.flights.length} flights`);
        flightData.outbound.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime}→${f.arrivalTime} | ${f.currency} ${f.price}`);
        });
        log('🔙', `Return: ${flightData.return.flights.length} flights`);
        flightData.return.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime}→${f.arrivalTime} | ${f.currency} ${f.price}`);
        });
        
        if (DEBUG_MODE) {
            log('👀', 'DEBUG: Keeping browser open 3s...');
            await wait(3000);
        }
        
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
        log('❌', 'ERROR: ' + error.message);
        return {
            success: false,
            error: error.message,
            flights: { outbound: { flights: [] }, return: { flights: [] } },
            performanceLogger: perf
        };
    } finally {
        if (browser) {
            perf.startStep('browser_close');
            await browser.close();
            perf.endStep('browser_close');
        }
    }
}

module.exports = { searchFlights, airportCodes, PerformanceLogger };
