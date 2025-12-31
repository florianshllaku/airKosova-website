/**
 * AirKosova Flight Scraper - Production Version
 * Optimized for speed using Direct URL navigation
 * Target: ~2-3 seconds per search
 */

const puppeteer = require('puppeteer');
const PerformanceLogger = require('./performanceLogger');
const fs = require('fs');
const path = require('path');

// ========================================
// AIRPORT CODES MAPPING
// ========================================
const airportCodes = {
    "Prishtina": "PRN",
    "Stockholm": "ARN",
    "Berlin Brandenburg": "BER",
    "Milano Bergamo": "BGY",
    "Bremen": "BRE",
    "Brussels": "BRU",
    "Basel": "BSL",
    "Köln/Bonn": "CGN",
    "Dortmund": "DTM",
    "Düsseldorf": "DUS",
    "Memmingen": "FMM",
    "Münster-Osnabrück": "FMO",
    "Göteborg Landvetter": "GOT",
    "Geneva": "GVA",
    "Hannover": "HAJ",
    "Hamburg": "HAM",
    "Helsinki": "HEL",
    "Ljubljana": "LJU",
    "Luxembourg": "LUX",
    "Malmö": "MMX",
    "München": "MUC",
    "Nürnberg": "NUE",
    "Oslo": "OSL",
    "Stuttgart": "STR",
    "Salzburg": "SZG",
    "Vienna": "VIE",
    "Växjö-Småland": "VXO",
    "Zürich": "ZRH"
};

// ========================================
// PRODUCTION CONFIGURATION
// ========================================
const CONFIG = {
    // Environment
    isProduction: process.env.NODE_ENV === 'production',
    debugMode: process.env.DEBUG_BROWSER === 'true',
    
    // Timeouts (ms)
    browserTimeout: 30000,
    pageTimeout: 20000,
    resultWaitTimeout: 8000,
    
    // Wait times (ms) - Optimized for speed
    waitForRender: 1000,      // Wait for Angular to render results
    waitBetweenRetries: 500,
    
    // Retry settings
    maxRetries: 2,
    
    // Logging - Disable in production
    enableLogging: process.env.NODE_ENV !== 'production',
    savePerformanceLogs: process.env.SAVE_PERF_LOGS === 'true', // Only save if explicitly enabled
    verboseLogging: process.env.VERBOSE_LOG === 'true'
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

function log(level, message) {
    // Skip all logging in production unless it's an error
    if (CONFIG.isProduction && level !== 'error') return;
    if (!CONFIG.enableLogging && level !== 'error') return;
    
    const timestamp = new Date().toISOString().substr(11, 8);
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', debug: '🔍', perf: '⏱️' };
    console.log(`[${timestamp}] ${icons[level] || ''} ${message}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format date from YYYY-MM-DD to DD.MM.YYYY (required by prishtinaticket.net)
 */
function formatDateForUrl(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Build direct search URL - SKIPS form filling entirely!
 */
function buildSearchUrl(params) {
    const { fromCode, toCode, departureDate, returnDate, adults, children, infants, tripType } = params;
    
    const flightType = tripType === 'oneway' ? 'ONE_WAY' : 'ROUND_TRIP';
    const dateFrom = formatDateForUrl(departureDate);
    const dateTo = tripType === 'oneway' ? '' : formatDateForUrl(returnDate);
    
    const url = new URL('https://www.prishtinaticket.net/en/flights/booking');
    url.searchParams.set('FLIGHT_TYPE', flightType);
    url.searchParams.set('FROM', fromCode);
    url.searchParams.set('TO', toCode);
    url.searchParams.set('DATE_FROM', dateFrom);
    if (dateTo) url.searchParams.set('DATE_TO', dateTo);
    url.searchParams.set('ADULTS', adults.toString());
    url.searchParams.set('CHILDREN', children.toString());
    url.searchParams.set('INFANTS', infants.toString());
    
    return url.toString();
}

// ========================================
// FLIGHT DATA EXTRACTION
// ========================================

/**
 * Extract flight data from the page
 * Uses multiple methods for reliability
 */
function createExtractionScript(fromCode, toCode) {
    return `
        (function() {
            const results = {
                outbound: { route: { fromCode: '${fromCode}', toCode: '${toCode}' }, flights: [], rawText: '' },
                return: { route: { fromCode: '${toCode}', toCode: '${fromCode}' }, flights: [], rawText: '' },
                currency: 'EUR',
                debug: { outboundFound: false, returnFound: false }
            };
            
            function extractFlights(container) {
                const flights = [];
                if (!container) return flights;
                
                const fullText = container.textContent || '';
                
                // Method 1: Pattern matching on full text
                const flightPattern = /(\\d{2}:\\d{2})\\s+\\w+\\s+\\w{3}\\s+(\\d+h\\s*\\d*\\s*min)\\s+(\\d{2}:\\d{2})\\s+\\w+\\s+\\w{3}.*?([€$CHF]+)\\s*(\\d+)\\s*[.,]?\\s*(\\d{2})?/gi;
                let match;
                while ((match = flightPattern.exec(fullText)) !== null) {
                    const currencyRaw = match[4];
                    const currency = currencyRaw.includes('€') ? 'EUR' : 'CHF';
                    let price = match[5];
                    if (match[6]) price += '.' + match[6];
                    
                    flights.push({
                        departureTime: match[1],
                        arrivalTime: match[3],
                        duration: match[2].trim(),
                        price: price,
                        currency: currency
                    });
                }
                
                if (flights.length > 0) return flights;
                
                // Method 2: Parse raw text for times and prices
                const allTimes = fullText.match(/\\d{2}:\\d{2}/g) || [];
                const eurMatches = fullText.match(/€\\s*(\\d+)/g) || [];
                const chfMatches = fullText.match(/CHF\\s*(\\d+)/g) || [];
                const durations = fullText.match(/\\d+h\\s*\\d*\\s*min/gi) || [];
                
                if (allTimes.length >= 2) {
                    for (let i = 0; i < allTimes.length - 1; i += 2) {
                        let price = '0';
                        let currency = 'EUR';
                        const idx = Math.floor(i / 2);
                        
                        if (eurMatches[idx]) {
                            const num = eurMatches[idx].match(/(\\d+)/);
                            if (num) price = num[1];
                        } else if (chfMatches[idx]) {
                            const num = chfMatches[idx].match(/(\\d+)/);
                            if (num) { price = num[1]; currency = 'CHF'; }
                        } else if (eurMatches.length > 0) {
                            const num = eurMatches[0].match(/(\\d+)/);
                            if (num) price = num[1];
                        }
                        
                        flights.push({
                            departureTime: allTimes[i],
                            arrivalTime: allTimes[i + 1],
                            duration: durations[idx] || '2h',
                            price: price,
                            currency: currency
                        });
                    }
                }
                
                return flights;
            }
            
            // Find containers
            const outSel = 'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(1) > div > div.space-y-5';
            const retSel = 'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(2) > div > div.space-y-5';
            
            const outContainer = document.querySelector(outSel);
            const retContainer = document.querySelector(retSel);
            
            if (outContainer) {
                results.debug.outboundFound = true;
                results.outbound.rawText = outContainer.textContent.substring(0, 500);
                results.outbound.flights = extractFlights(outContainer);
            }
            
            if (retContainer) {
                results.debug.returnFound = true;
                results.return.rawText = retContainer.textContent.substring(0, 500);
                results.return.flights = extractFlights(retContainer);
            }
            
            // Detect currency from found flights
            const allFlights = [...results.outbound.flights, ...results.return.flights];
            if (allFlights.length > 0) {
                results.currency = allFlights[0].currency;
            }
            
            return results;
        })()
    `;
}

// ========================================
// MAIN SEARCH FUNCTION - PRODUCTION OPTIMIZED
// ========================================

async function searchFlights(searchParams, performanceLogger = null) {
    const { 
        departure, 
        destination, 
        departureDate, 
        returnDate, 
        adults = 1, 
        children = 0, 
        infants = 0, 
        tripType = 'roundtrip' 
    } = searchParams;
    
    // Initialize performance tracking
    const perf = performanceLogger || new PerformanceLogger();
    perf.setSearchParams(searchParams);
    
    // Get airport codes
    const fromCode = airportCodes[departure] || departure;
    const toCode = airportCodes[destination] || destination;
    
    const totalAdults = parseInt(adults) || 1;
    const totalChildren = parseInt(children) || 0;
    const totalInfants = parseInt(infants) || 0;
    
    log('info', `Search: ${departure} (${fromCode}) → ${destination} (${toCode})`);
    log('info', `Date: ${departureDate}${returnDate ? ' → ' + returnDate : ' (one-way)'}`);
    log('info', `Passengers: ${totalAdults}A ${totalChildren}C ${totalInfants}I`);
    
    let browser;
    
    try {
        // ========================================
        // STEP 1: Launch Browser
        // ========================================
        perf.startStep('browser_launch');
        
        browser = await puppeteer.launch({
            headless: CONFIG.debugMode ? false : 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--mute-audio',
                '--no-first-run',
                '--window-size=1280,800'
            ],
            defaultViewport: { width: 1280, height: 800 },
            timeout: CONFIG.browserTimeout
        });
        
        const page = await browser.newPage();
        
        // Block unnecessary resources for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        perf.endStep('browser_launch');
        log('success', `Browser launched (${perf.getStepDuration('browser_launch')}ms)`);
        
        // ========================================
        // STEP 2: Navigate DIRECTLY to Search Results
        // ========================================
        perf.startStep('direct_navigation');
        
        const searchUrl = buildSearchUrl({
            fromCode, toCode, departureDate, returnDate,
            adults: totalAdults, children: totalChildren, infants: totalInfants,
            tripType
        });
        
        log('info', `Direct URL: ${searchUrl}`);
        
        await page.goto(searchUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.pageTimeout 
        });
        
        perf.endStep('direct_navigation');
        log('success', `Page loaded (${perf.getStepDuration('direct_navigation')}ms)`);
        
        // ========================================
        // STEP 3: Wait for Flight Results
        // ========================================
        perf.startStep('wait_for_results');
        
        // Wait for the results container
        const resultsSelector = 'lib-modern-flight-availability, app-availabilities, .booking-flights__body';
        
        try {
            await page.waitForSelector(resultsSelector, { timeout: CONFIG.resultWaitTimeout });
            log('success', 'Results container found');
            
            // Wait for Angular to render flights
            await wait(CONFIG.waitForRender);
            
            // Optional: Wait for actual flight times to appear
            try {
                await page.waitForFunction(() => {
                    const text = document.body?.innerText || '';
                    return text.match(/\d{2}:\d{2}/);
                }, { timeout: 3000 });
            } catch (e) {
                log('warn', 'No flight times detected');
            }
            
        } catch (e) {
            log('warn', 'Results container timeout, attempting extraction anyway');
            await wait(1000);
        }
        
        perf.endStep('wait_for_results');
        log('success', `Results ready (${perf.getStepDuration('wait_for_results')}ms)`);
        
        // ========================================
        // STEP 4: Extract Flight Data
        // ========================================
        perf.startStep('extract_data');
        
        const extractionScript = createExtractionScript(fromCode, toCode);
        const flightData = await page.evaluate(extractionScript);
        
        perf.endStep('extract_data', {
            outboundFlightsFound: flightData.outbound.flights.length,
            returnFlightsFound: flightData.return.flights.length
        });
        
        log('success', `Extracted: ${flightData.outbound.flights.length} outbound, ${flightData.return.flights.length} return`);
        
        // Log flight details
        flightData.outbound.flights.forEach((f, i) => {
            log('info', `  Outbound ${i+1}: ${f.departureTime}→${f.arrivalTime} ${f.currency}${f.price}`);
        });
        flightData.return.flights.forEach((f, i) => {
            log('info', `  Return ${i+1}: ${f.departureTime}→${f.arrivalTime} ${f.currency}${f.price}`);
        });
        
        // Print performance summary
        perf.printSummary();
        
        return {
            success: true,
            url: page.url(),
            searchParams: {
                from: departure,
                to: destination,
                fromCode,
                toCode,
                departureDate,
                returnDate,
                adults: totalAdults,
                children: totalChildren,
                infants: totalInfants,
                tripType
            },
            flights: {
                outbound: {
                    route: flightData.outbound.route,
                    flights: flightData.outbound.flights
                },
                return: {
                    route: flightData.return.route,
                    flights: flightData.return.flights
                },
                currency: flightData.currency || 'EUR'
            },
            performanceLogger: perf
        };
        
    } catch (error) {
        log('error', `Search failed: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            url: 'https://www.prishtinaticket.net/en',
            flights: {
                outbound: { flights: [] },
                return: { flights: [] }
            },
            performanceLogger: perf
        };
        
    } finally {
        // ========================================
        // CLEANUP
        // ========================================
        if (browser) {
            perf.startStep('browser_close');
            try {
                await browser.close();
            } catch (e) {
                // Ignore close errors
            }
            perf.endStep('browser_close');
        }
    }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    searchFlights,
    airportCodes,
    PerformanceLogger,
    buildSearchUrl,
    CONFIG
};
