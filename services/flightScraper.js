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

// TURBO MODE
const DEBUG_MODE = process.env.DEBUG_BROWSER === 'true' || process.env.NODE_ENV !== 'production';
const TURBO_MODE = true;

const WAIT_SHORT = 50;
const WAIT_MEDIUM = 100;
const WAIT_LONG = 200;
const WAIT_PAGE_LOAD = 500;
const TYPE_DELAY = 10;

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
    
    // Parse dates correctly
    const depDate = new Date(departureDate);
    const retDate = returnDate ? new Date(returnDate) : null;
    
    const totalAdults = parseInt(adults) || 1;
    const totalChildren = parseInt(children) || 0;
    const totalInfants = parseInt(infants) || 0;
    
    log('🔍', '='.repeat(60));
    log('🔍', 'TURBO MODE SEARCH ⚡');
    log('🔍', '='.repeat(60));
    log('📋', `From: ${departure} (${fromCode}) → To: ${destination} (${toCode})`);
    log('📅', `Departure Date: ${depDate.toDateString()} (Day: ${depDate.getDate()}, Month: ${depDate.getMonth() + 1}, Year: ${depDate.getFullYear()})`);
    log('📅', `Return Date: ${retDate ? retDate.toDateString() : 'One way'}`);
    log('📋', `Passengers: ${totalAdults} adult(s), ${totalChildren} child(ren), ${totalInfants} infant(s)`);
    
    let browser;
    try {
        // STEP 1: Launch browser
        perf.startStep('browser_launch');
        log('🚀', 'Launching browser...');
        browser = await puppeteer.launch({
            headless: DEBUG_MODE ? false : 'new',
            slowMo: 0,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
                   '--disable-extensions', '--mute-audio', '--window-size=1400,900'],
            defaultViewport: null,
            timeout: 60000
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        perf.endStep('browser_launch');
        log('✅', `Browser launched (${perf.getStepDuration('browser_launch')}ms)`);
        
        // STEP 2: Navigate
        perf.startStep('page_navigation');
        log('📍', 'Navigating to prishtinaticket.net...');
        await page.goto('https://www.prishtinaticket.net/en', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Disable animations
        await page.addStyleTag({
            content: '*, *::before, *::after { animation-duration: 0.001s !important; transition-duration: 0.001s !important; }'
        });
        
        await wait(WAIT_PAGE_LOAD);
        perf.endStep('page_navigation');
        log('✅', `Page loaded (${perf.getStepDuration('page_navigation')}ms)`);
        
        // STEP 3: Trip type
        perf.startStep('select_trip_type');
        if (tripType === 'oneway') {
            log('🔄', 'Selecting ONE-WAY...');
            await page.evaluate(() => {
                const labels = document.querySelectorAll('label');
                for (const l of labels) {
                    if (l.textContent.toLowerCase().includes('one way') || l.textContent.toLowerCase().includes('one-way')) {
                        l.click(); break;
                    }
                }
            });
            await wait(WAIT_MEDIUM);
        }
        perf.endStep('select_trip_type');
        
        // STEP 4: Departure city
        perf.startStep('fill_departure');
        log('✈️', `Entering departure: ${fromCity}`);
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
            if (inputs[0]) { inputs[0].value = ''; inputs[0].focus(); inputs[0].click(); }
        });
        await wait(WAIT_MEDIUM);
        await page.keyboard.type(fromCity, { delay: TYPE_DELAY });
        await wait(WAIT_LONG);
        await page.evaluate(() => {
            const options = document.querySelectorAll('mat-option, .mat-option, [role="option"]');
            if (options.length > 0) options[0].click();
        });
        await wait(WAIT_MEDIUM);
        perf.endStep('fill_departure');
        log('✅', `Departure set (${perf.getStepDuration('fill_departure')}ms)`);
        
        // STEP 5: Destination city
        perf.startStep('fill_destination');
        log('🛬', `Entering destination: ${toCity}`);
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
            if (inputs[1]) { inputs[1].value = ''; inputs[1].focus(); inputs[1].click(); }
        });
        await wait(WAIT_MEDIUM);
        await page.keyboard.type(toCity, { delay: TYPE_DELAY });
        await wait(WAIT_LONG);
        await page.evaluate(() => {
            const options = document.querySelectorAll('mat-option, .mat-option, [role="option"]');
            if (options.length > 0) options[0].click();
        });
        await wait(WAIT_MEDIUM);
        perf.endStep('fill_destination');
        log('✅', `Destination set (${perf.getStepDuration('fill_destination')}ms)`);
        
        // STEP 6: Select dates - FIXED VERSION
        perf.startStep('select_dates');
        log('📅', 'Opening date picker...');
        
        const targetDepMonth = depDate.getMonth(); // 0-11
        const targetDepYear = depDate.getFullYear();
        const targetDepDay = depDate.getDate();
        
        log('📅', `Target departure: Day ${targetDepDay}, Month ${targetDepMonth + 1}, Year ${targetDepYear}`);
        
        const datePickerSelector = tripType === 'oneway' ? 'lib-datepicker button' : 'lib-range-datepicker button';
        
        try {
            await page.waitForSelector(datePickerSelector, { timeout: 5000 });
            await page.click(datePickerSelector);
            await wait(300);
            
            // Get current calendar month/year
            const getCurrentCalendar = async () => {
                return await page.evaluate(() => {
                    const btn = document.querySelector('.mat-calendar-period-button');
                    if (!btn) return null;
                    const text = btn.textContent.trim().toUpperCase();
                    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                    let month = -1, year = -1;
                    for (let i = 0; i < months.length; i++) {
                        if (text.includes(months[i])) { month = i; break; }
                    }
                    const yearMatch = text.match(/20\d{2}/);
                    if (yearMatch) year = parseInt(yearMatch[0]);
                    return { month, year, text };
                });
            };
            
            // Navigate to target month for DEPARTURE
            let current = await getCurrentCalendar();
            log('📅', `Calendar showing: ${current?.text} (Month: ${current?.month + 1}, Year: ${current?.year})`);
            
            let attempts = 0;
            const maxAttempts = 24;
            
            while (attempts < maxAttempts) {
                current = await getCurrentCalendar();
                if (!current || current.month === -1 || current.year === -1) {
                    log('⚠️', 'Could not read calendar');
                    break;
                }
                
                // Check if we're at the right month
                if (current.year === targetDepYear && current.month === targetDepMonth) {
                    log('✅', `Found target month: ${current.text}`);
                    break;
                }
                
                // Calculate direction
                const currentTotal = current.year * 12 + current.month;
                const targetTotal = targetDepYear * 12 + targetDepMonth;
                
                if (targetTotal > currentTotal) {
                    log('➡️', `Moving forward... (current: ${current.month + 1}/${current.year}, target: ${targetDepMonth + 1}/${targetDepYear})`);
                    await page.click('.mat-calendar-next-button');
                } else if (targetTotal < currentTotal) {
                    log('⬅️', `Moving backward... (current: ${current.month + 1}/${current.year}, target: ${targetDepMonth + 1}/${targetDepYear})`);
                    await page.click('.mat-calendar-previous-button');
                } else {
                    break;
                }
                
                await wait(100);
                attempts++;
            }
            
            // Click the departure day
            log('📅', `Clicking day ${targetDepDay}...`);
            await page.evaluate((day) => {
                const cells = document.querySelectorAll('.mat-calendar-body-cell');
                for (const cell of cells) {
                    const content = cell.querySelector('.mat-calendar-body-cell-content');
                    if (content && content.textContent.trim() === day.toString()) {
                        cell.click();
                        return true;
                    }
                }
                return false;
            }, targetDepDay);
            await wait(200);
            
            // Handle return date
            if (tripType !== 'oneway' && retDate) {
                const targetRetMonth = retDate.getMonth();
                const targetRetYear = retDate.getFullYear();
                const targetRetDay = retDate.getDate();
                
                log('📅', `Target return: Day ${targetRetDay}, Month ${targetRetMonth + 1}, Year ${targetRetYear}`);
                
                // Navigate to return month if different
                attempts = 0;
                while (attempts < maxAttempts) {
                    current = await getCurrentCalendar();
                    if (!current || current.month === -1) break;
                    
                    if (current.year === targetRetYear && current.month === targetRetMonth) {
                        log('✅', `At return month: ${current.text}`);
                        break;
                    }
                    
                    const currentTotal = current.year * 12 + current.month;
                    const targetTotal = targetRetYear * 12 + targetRetMonth;
                    
                    if (targetTotal > currentTotal) {
                        await page.click('.mat-calendar-next-button');
                    } else if (targetTotal < currentTotal) {
                        await page.click('.mat-calendar-previous-button');
                    } else {
                        break;
                    }
                    
                    await wait(100);
                    attempts++;
                }
                
                // Click return day
                log('📅', `Clicking return day ${targetRetDay}...`);
                await page.evaluate((day) => {
                    const cells = document.querySelectorAll('.mat-calendar-body-cell');
                    for (const cell of cells) {
                        const content = cell.querySelector('.mat-calendar-body-cell-content');
                        if (content && content.textContent.trim() === day.toString()) {
                            cell.click();
                            return true;
                        }
                    }
                    return false;
                }, targetRetDay);
                await wait(200);
            }
            
            // Close calendar
            await page.keyboard.press('Escape');
            await wait(100);
            
        } catch (e) {
            log('❌', 'Date picker error: ' + e.message);
        }
        
        perf.endStep('select_dates');
        log('✅', `Dates selected (${perf.getStepDuration('select_dates')}ms)`);
        
        // STEP 7: Passengers
        perf.startStep('set_passengers');
        if (totalAdults > 1 || totalChildren > 0 || totalInfants > 0) {
            log('👥', 'Setting passengers...');
            try {
                const passengerBtn = await page.$('lib-button button');
                if (passengerBtn) {
                    await passengerBtn.click();
                    await wait(WAIT_LONG);
                    
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
                    await wait(WAIT_SHORT);
                }
            } catch (e) {
                log('⚠️', 'Passenger error: ' + e.message);
            }
        }
        perf.endStep('set_passengers');
        
        // STEP 8: Click Search
        perf.startStep('click_search');
        log('🔍', 'Clicking search button...');
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                if (b.textContent.toLowerCase().includes('search')) { b.click(); break; }
            }
        });
        perf.endStep('click_search');
        
        // STEP 9: Wait for results
        perf.startStep('wait_for_results');
        log('⏳', 'Waiting for results...');
        try {
            await page.waitForSelector('lib-modern-flight-availability', { timeout: 10000 });
            await wait(1000);
        } catch (e) {
            log('⚠️', 'Timeout waiting for results, checking anyway...');
            await wait(2000);
        }
        perf.endStep('wait_for_results');
        log('✅', `Results loaded (${perf.getStepDuration('wait_for_results')}ms)`);
        
        // STEP 10: Extract data
        perf.startStep('extract_flight_data');
        log('📊', 'Extracting flights...');
        
        const flightData = await page.evaluate((fromCode, toCode) => {
            const results = {
                outbound: { route: { fromCode, toCode }, flights: [], rawText: '' },
                return: { route: { fromCode: toCode, toCode: fromCode }, flights: [], rawText: '' },
                currency: 'EUR'
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
                            price: price,
                            currency: currency
                        });
                    }
                }
                return flights;
            }
            
            const containers = document.querySelectorAll('lib-modern-flight-availability');
            if (containers[0]) {
                const inner = containers[0].querySelector('.space-y-5') || containers[0];
                results.outbound.rawText = inner.textContent.substring(0, 500);
                results.outbound.flights = extractFlights(inner);
            }
            if (containers[1]) {
                const inner = containers[1].querySelector('.space-y-5') || containers[1];
                results.return.rawText = inner.textContent.substring(0, 500);
                results.return.flights = extractFlights(inner);
            }
            
            return results;
        }, fromCode, toCode);
        
        perf.endStep('extract_flight_data', {
            outboundFlightsFound: flightData.outbound.flights.length,
            returnFlightsFound: flightData.return.flights.length
        });
        
        // Log results
        log('📊', '='.repeat(60));
        log('📊', 'EXTRACTION RESULTS');
        log('📊', '='.repeat(60));
        log('📝', `Outbound raw: ${flightData.outbound.rawText.substring(0, 200)}`);
        log('✈️', `Outbound flights: ${flightData.outbound.flights.length}`);
        flightData.outbound.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime} → ${f.arrivalTime} | ${f.duration} | ${f.currency} ${f.price}`);
        });
        log('🔙', `Return flights: ${flightData.return.flights.length}`);
        flightData.return.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime} → ${f.arrivalTime} | ${f.duration} | ${f.currency} ${f.price}`);
        });
        
        // Debug mode: keep browser open briefly
        if (DEBUG_MODE) {
            log('👀', 'DEBUG: Browser staying open for 3 seconds...');
            await wait(3000);
        }
        
        // Print performance summary
        perf.printSummary();
        
        return {
            success: true,
            url: page.url(),
            searchParams: {
                from: departure, to: destination, fromCode, toCode,
                departureDate, returnDate,
                adults: totalAdults, children: totalChildren, infants: totalInfants, tripType
            },
            flights: {
                outbound: { route: flightData.outbound.route, flights: flightData.outbound.flights },
                return: { route: flightData.return.route, flights: flightData.return.flights },
                currency: flightData.currency || 'EUR'
            },
            performanceLogger: perf
        };
        
    } catch (error) {
        log('❌', 'ERROR: ' + error.message);
        console.error(error);
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
