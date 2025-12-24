const puppeteer = require('puppeteer');

// Airport codes mapping
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

// City name mapping for typing into the form
const cityNames = {
    "PRN": "Prishtina",
    "ARN": "Stockholm",
    "BER": "Berlin",
    "BGY": "Milano",
    "BRE": "Bremen",
    "BRU": "Brussels",
    "BSL": "Basel",
    "CGN": "Köln",
    "DTM": "Dortmund",
    "DUS": "Düsseldorf",
    "FMM": "Memmingen",
    "FMO": "Münster",
    "GOT": "Göteborg",
    "GVA": "Geneva",
    "HAJ": "Hannover",
    "HAM": "Hamburg",
    "HEL": "Helsinki",
    "LJU": "Ljubljana",
    "LUX": "Luxembourg",
    "MMX": "Malmö",
    "MUC": "München",
    "NUE": "Nürnberg",
    "OSL": "Oslo",
    "STR": "Stuttgart",
    "SZG": "Salzburg",
    "VIE": "Vienna",
    "VXO": "Växjö",
    "ZRH": "Zürich"
};

// ========================================
// DEBUG MODE - Set to true to see browser (only works locally, not on server)
// ========================================
const DEBUG_MODE = process.env.NODE_ENV !== 'production'; // Auto-detect: false on server, true locally
const SLOW_MOTION = DEBUG_MODE ? 150 : 0; // milliseconds delay between actions

/**
 * Log with timestamp and emoji for visibility
 */
function log(emoji, message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${emoji} ${message}`);
}

/**
 * Wait helper
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search for flights on prishtinaticket.net using MANUAL FORM FILLING
 */
async function searchFlights(searchParams) {
    const { departure, destination, departureDate, returnDate, adults = 1, children = 0, infants = 0, tripType = 'roundtrip' } = searchParams;
    
    // Get airport codes
    const fromCode = airportCodes[departure] || departure;
    const toCode = airportCodes[destination] || destination;
    
    // Get city names for typing
    const fromCity = cityNames[fromCode] || departure;
    const toCity = cityNames[toCode] || destination;
    
    // Parse dates
    const depDate = new Date(departureDate);
    const retDate = returnDate ? new Date(returnDate) : null;
    
    // Calculate passengers
    const totalAdults = parseInt(adults) || 1;
    const totalChildren = parseInt(children) || 0;
    const totalInfants = parseInt(infants) || 0;
    
    log('🔍', '='.repeat(60));
    log('🔍', 'MANUAL FORM AUTOMATION - DEBUG MODE');
    log('🔍', '='.repeat(60));
    log('📋', `From: ${departure} (${fromCode}) → Type: "${fromCity}"`);
    log('📋', `To: ${destination} (${toCode}) → Type: "${toCity}"`);
    log('📋', `Departure: ${depDate.toDateString()}`);
    log('📋', `Return: ${retDate ? retDate.toDateString() : 'One way'}`);
    log('📋', `Passengers: ${totalAdults} adult(s), ${totalChildren} child(ren), ${totalInfants} infant(s)`);
    log('🔍', '='.repeat(60));
    
    let browser;
    try {
        // Launch browser (headless on server, visible locally)
        log('🚀', `Launching browser in ${DEBUG_MODE ? 'VISIBLE' : 'HEADLESS'} mode...`);
        browser = await puppeteer.launch({
            headless: DEBUG_MODE ? false : 'new',
            slowMo: SLOW_MOTION,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Use system Chrome if specified
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--window-size=1400,900',
                '--window-position=100,100'
            ],
            defaultViewport: null,
            timeout: 60000
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // ========================================
        // STEP 1: Navigate to prishtinaticket.net
        // ========================================
        log('📍', 'Navigating to prishtinaticket.net/en ...');
        await page.goto('https://www.prishtinaticket.net/en', { waitUntil: 'networkidle2', timeout: 45000 });
        log('✅', 'Page loaded!');
        
        await wait(3000);
        
        
        // Try to accept cookies if present
        try {
            await page.evaluate(() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.textContent.includes('Accept') || btn.textContent.includes('Agree')) {
                        btn.click();
                        return;
                    }
                }
            });
            await wait(1000);
        } catch (e) { }
        
        // ========================================
        // STEP 2: Select trip type (ONE-WAY if needed)
        // ========================================
        if (tripType === 'oneway') {
            log('🔄', 'Selecting ONE-WAY trip...');
            const oneWaySelector = '#mat-tab-group-0-content-0 > div > lib-search-form > div > div.row.mb-1 > div > lib-radio > lib-form-field-wrapper > div > div > div > div:nth-child(2) > label';
            
            try {
                await page.waitForSelector(oneWaySelector, { timeout: 5000 });
                await page.click(oneWaySelector);
                log('✅', 'Selected ONE-WAY trip');
                await wait(500);
            } catch (e) {
                log('⚠️', 'One-way selection error: ' + e.message);
                // Try fallback - click by text
                await page.evaluate(() => {
                    const labels = document.querySelectorAll('label');
                    for (const label of labels) {
                        if (label.textContent.toLowerCase().includes('one way') || 
                            label.textContent.toLowerCase().includes('one-way')) {
                            label.click();
                            return;
                        }
                    }
                });
            }
        } else {
            log('🔄', 'Using default ROUND-TRIP');
        }
        
        // ========================================
        // STEP 3: Enter "Flying From" city
        // ========================================
        log('✈️', `Entering departure city: ${fromCity}`);
        
        // Find the FROM input dynamically (IDs change on each page load)
        try {
            // First, find the input by looking for autocomplete inputs in the form
            const fromInputFound = await page.evaluate((cityToType) => {
                // Find all text inputs that might be the "from" field
                const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
                
                for (const input of inputs) {
                    const placeholder = (input.placeholder || '').toLowerCase();
                    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
                    const id = input.id || '';
                    
                    // Look for "from" or "departure" or first autocomplete input
                    if (placeholder.includes('from') || placeholder.includes('departure') || 
                        ariaLabel.includes('from') || ariaLabel.includes('departure') ||
                        input.closest('[class*="from"]') || input.closest('[class*="departure"]')) {
                        
                        // Clear the input
                        input.value = '';
                        input.focus();
                        input.click();
                        return input.id || 'found';
                    }
                }
                
                // Fallback: get the first autocomplete input (usually the FROM field)
                const autocompleteInputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
                if (autocompleteInputs.length > 0) {
                    const input = autocompleteInputs[0];
                    input.value = '';
                    input.focus();
                    input.click();
                    return input.id || 'found-first';
                }
                
                return null;
            }, fromCity);
            
            if (fromInputFound) {
                log('✅', `Found FROM input: ${fromInputFound}`);
                await wait(500);
                
                // Type the city name
                await page.keyboard.type(fromCity, { delay: 100 });
                log('✅', `Typed: "${fromCity}"`);
                
                await wait(1500); // Wait for dropdown
                
                // Click first dropdown option
                await page.evaluate(() => {
                    const options = document.querySelectorAll('mat-option, .mat-option, [role="option"]');
                    if (options.length > 0) {
                        options[0].click();
                    }
                });
                log('✅', 'Selected from dropdown');
                await wait(500);
            } else {
                log('⚠️', 'Could not find FROM input!');
            }
            
        } catch (e) {
            log('⚠️', 'From input error: ' + e.message);
        }
        
        // ========================================
        // STEP 4: Enter "Flying To" city
        // ========================================
        log('🛬', `Entering destination city: ${toCity}`);
        
        try {
            // Find the TO input dynamically
            const toInputFound = await page.evaluate(() => {
                // Find all text inputs
                const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
                
                for (const input of inputs) {
                    const placeholder = (input.placeholder || '').toLowerCase();
                    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
                    
                    // Look for "to" or "destination" or "arrival"
                    if (placeholder.includes('to') || placeholder.includes('destination') || 
                        placeholder.includes('arrival') ||
                        ariaLabel.includes('to') || ariaLabel.includes('destination')) {
                        
                        input.value = '';
                        input.focus();
                        input.click();
                        return input.id || 'found';
                    }
                }
                
                // Fallback: get the second autocomplete input (usually the TO field)
                const autocompleteInputs = document.querySelectorAll('input[matinput], input[aria-autocomplete]');
                if (autocompleteInputs.length > 1) {
                    const input = autocompleteInputs[1];
                    input.value = '';
                    input.focus();
                    input.click();
                    return input.id || 'found-second';
                }
                
                return null;
            });
            
            if (toInputFound) {
                log('✅', `Found TO input: ${toInputFound}`);
                await wait(500);
                
                // Type the city name
                await page.keyboard.type(toCity, { delay: 100 });
                log('✅', `Typed: "${toCity}"`);
                
                await wait(1500); // Wait for dropdown
                
                // Click first dropdown option
                await page.evaluate(() => {
                    const options = document.querySelectorAll('mat-option, .mat-option, [role="option"]');
                    if (options.length > 0) {
                        options[0].click();
                    }
                });
                log('✅', 'Selected from dropdown');
                await wait(500);
            } else {
                log('⚠️', 'Could not find TO input!');
            }
            
        } catch (e) {
            log('⚠️', 'To input error: ' + e.message);
        }
        
        // ========================================
        // STEP 5: Select dates
        // ========================================
        log('📅', 'Opening date picker...');
        
        // Different selectors for ONE-WAY vs ROUND-TRIP
        let datePickerButtonSelector;
        let monthLabelSelector;
        let nextMonthButtonSelector;
        
        if (tripType === 'oneway') {
            // ONE-WAY uses lib-datepicker and mat-datepicker-1
            datePickerButtonSelector = '#mat-tab-group-0-content-0 > div > lib-search-form > div > div:nth-child(2) > div.col-12.col-xl-7.order-1.xl\\:order-none > div > div:nth-child(1) > lib-datepicker > lib-form-field-wrapper > div > div > div > div > lib-form-icon > div > button';
            monthLabelSelector = '#mat-datepicker-1 > mat-calendar-header > div > div > button.mdc-button.mat-mdc-button-base.mat-calendar-period-button.mat-mdc-button.mat-unthemed > span.mdc-button__label > span';
            nextMonthButtonSelector = '#mat-datepicker-1 > mat-calendar-header > div > div > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-mdc-tooltip-trigger.mat-calendar-next-button.mat-mdc-button-disabled-interactive.mat-unthemed';
            log('📅', 'Using ONE-WAY date picker selectors (lib-datepicker, mat-datepicker-1)');
        } else {
            // ROUND-TRIP uses lib-range-datepicker and mat-datepicker-0
            datePickerButtonSelector = '#mat-tab-group-0-content-0 > div > lib-search-form > div > div:nth-child(2) > div.col-12.col-xl-7.order-1.xl\\:order-none > div > div:nth-child(1) > lib-range-datepicker > lib-form-field-wrapper > div > div > div > div > lib-form-icon > div > button';
            monthLabelSelector = '#mat-datepicker-0 > mat-calendar-header > div > div > button.mdc-button.mat-mdc-button-base.mat-calendar-period-button.mat-mdc-button.mat-unthemed > span.mdc-button__label > span';
            nextMonthButtonSelector = '#mat-datepicker-0 > mat-calendar-header > div > div > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-calendar-next-button';
            log('📅', 'Using ROUND-TRIP date picker selectors (lib-range-datepicker, mat-datepicker-0)');
        }
        
        try {
            // Click the date picker button to open calendar
            await page.waitForSelector(datePickerButtonSelector, { timeout: 10000 });
            await page.click(datePickerButtonSelector);
            log('✅', 'Date picker button clicked!');
            await wait(1000);
            
            // Helper function to read current month from calendar
            async function getCurrentMonth() {
                const monthText = await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return el ? el.textContent.trim() : '';
                }, monthLabelSelector);
                return monthText;
            }
            
            // Helper function to navigate to the correct month
            async function navigateToMonth(targetDate) {
                const targetMonth = targetDate.getMonth();
                const targetYear = targetDate.getFullYear();
                
                const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                const fullMonthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
                const targetMonthShort = monthNames[targetMonth];
                const targetMonthFull = fullMonthNames[targetMonth];
                
                log('📅', `Target: ${targetMonthFull} ${targetYear}`);
                
                let attempts = 0;
                while (attempts < 24) { // Allow navigating up to 2 years ahead
                    const currentMonthText = await getCurrentMonth();
                    log('📅', `Calendar shows: "${currentMonthText}"`);
                    
                    // Check if we're at the right month
                    const upperText = currentMonthText.toUpperCase();
                    if ((upperText.includes(targetMonthShort) || upperText.includes(targetMonthFull)) && 
                        currentMonthText.includes(targetYear.toString())) {
                        log('✅', `Reached target month: ${targetMonthFull} ${targetYear}`);
                        return true;
                    }
                    
                    // Click next month button
                    log('📅', 'Clicking next month...');
                    try {
                        await page.click(nextMonthButtonSelector);
                    } catch (e) {
                        // Try alternative selector
                        await page.evaluate(() => {
                            const btn = document.querySelector('.mat-calendar-next-button');
                            if (btn) btn.click();
                        });
                    }
                    await wait(500);
                    
                    attempts++;
                }
                
                log('⚠️', 'Could not navigate to target month after 24 attempts');
                return false;
            }
            
            // Helper to click on a specific day
            async function clickDay(day) {
                log('📅', `Clicking on day: ${day}`);
                
                const clicked = await page.evaluate((d) => {
                    // Find all calendar day cells
                    const cells = document.querySelectorAll('.mat-calendar-body-cell');
                    for (const cell of cells) {
                        const content = cell.querySelector('.mat-calendar-body-cell-content');
                        if (content && content.textContent.trim() === d.toString()) {
                            // Highlight for debugging
                            cell.style.outline = '3px solid red';
                            cell.click();
                            return true;
                        }
                    }
                    
                    // Alternative: try clicking by text content directly
                    const allCells = document.querySelectorAll('[role="gridcell"]');
                    for (const cell of allCells) {
                        if (cell.textContent.trim() === d.toString()) {
                            cell.click();
                            return true;
                        }
                    }
                    
                    return false;
                }, day);
                
                if (clicked) {
                    log('✅', `Clicked on day ${day}`);
                } else {
                    log('⚠️', `Could not find day ${day}`);
                }
                
                return clicked;
            }
            
            // Select DEPARTURE date
            log('📅', `Selecting DEPARTURE date: ${depDate.getDate()}/${depDate.getMonth() + 1}/${depDate.getFullYear()}`);
            await navigateToMonth(depDate);
            await wait(500);
            await clickDay(depDate.getDate());
            log('✅', `Selected departure day: ${depDate.getDate()}`);
            await wait(1000);
            
            // Select RETURN date if round trip (skip for one-way)
            if (tripType === 'oneway') {
                log('📅', 'ONE-WAY trip: Skipping return date selection');
            } else if (retDate) {
                log('📅', `Selecting RETURN date: ${retDate.getDate()}/${retDate.getMonth() + 1}/${retDate.getFullYear()}`);
                
                // Check if return date is in a different month
                if (retDate.getMonth() !== depDate.getMonth() || retDate.getFullYear() !== depDate.getFullYear()) {
                    log('📅', 'Return date is in a different month, navigating...');
                    await navigateToMonth(retDate);
                    await wait(500);
                }
                
                await clickDay(retDate.getDate());
                log('✅', `Selected return day: ${retDate.getDate()}`);
            }
            
            await wait(500);
            
            // Click outside to close the calendar (if still open)
            try {
                await page.keyboard.press('Escape');
                await wait(300);
            } catch (e) { }
            
        } catch (e) {
            log('⚠️', 'Date selection error: ' + e.message);
            console.error(e);
        }
        
        // ========================================
        // STEP 6: Add passengers if needed
        // ========================================
        if (totalAdults > 1 || totalChildren > 0 || totalInfants > 0) {
            log('👥', 'Adjusting passenger count...');
            log('👥', `Need: ${totalAdults} adult(s), ${totalChildren} child(ren), ${totalInfants} infant(s)`);
            
            // Button to open passenger selector dropdown
            const passengerDropdownSelector = '#mat-tab-group-0-content-0 > div > lib-search-form > div > div:nth-child(2) > div.col-12.col-xl-7.order-1.xl\\:order-none > div > div.col-12.col-md-6.col-xl-5.relative > lib-button > button';
            
            try {
                // Click on passenger dropdown to open it
                log('👥', 'Opening passenger selector...');
                await page.waitForSelector(passengerDropdownSelector, { timeout: 10000 });
                await page.click(passengerDropdownSelector);
                log('✅', 'Passenger selector opened!');
                await wait(1500);
                
                // Helper function to click the + button for a passenger type
                // The overlay ID changes dynamically (cdk-overlay-0, cdk-overlay-17, etc.)
                // So we find the lib-passenger-selection component dynamically
                async function clickPlusButton(itemIndex, count, label) {
                    for (let i = 0; i < count; i++) {
                        const clicked = await page.evaluate((idx) => {
                            // Find the passenger selection component (in any overlay)
                            const passengerSelection = document.querySelector('lib-passenger-selection');
                            if (!passengerSelection) {
                                console.log('Could not find lib-passenger-selection');
                                return false;
                            }
                            
                            // Find the correct item (1=adults, 3=children, 5=infants)
                            const item = passengerSelection.querySelector(`lib-passenger-selection-item:nth-child(${idx})`);
                            if (!item) {
                                console.log(`Could not find item at index ${idx}`);
                                return false;
                            }
                            
                            // Find the + button (it's the 3rd lib-button child)
                            const plusButton = item.querySelector('lib-button:nth-child(3) button');
                            if (!plusButton) {
                                // Try alternative: find button with + text
                                const buttons = item.querySelectorAll('button');
                                for (const btn of buttons) {
                                    if (btn.textContent.includes('+')) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                console.log('Could not find + button');
                                return false;
                            }
                            
                            plusButton.click();
                            return true;
                        }, itemIndex);
                        
                        if (clicked) {
                            log('✅', `Added ${label} ${i + 1}`);
                        } else {
                            log('⚠️', `Could not click + for ${label}`);
                        }
                        await wait(400);
                    }
                }
                
                // Add extra adults (beyond the default 1)
                const adultsToAdd = totalAdults - 1;
                if (adultsToAdd > 0) {
                    log('👤', `Adding ${adultsToAdd} extra adult(s)...`);
                    await clickPlusButton(1, adultsToAdd, 'adult');
                }
                
                // Add children
                if (totalChildren > 0) {
                    log('🧒', `Adding ${totalChildren} child(ren)...`);
                    await clickPlusButton(3, totalChildren, 'child');
                }
                
                // Add infants
                if (totalInfants > 0) {
                    log('👶', `Adding ${totalInfants} infant(s)...`);
                    await clickPlusButton(5, totalInfants, 'infant');
                }
                
                // Click outside to close passenger dropdown
                log('👥', 'Closing passenger selector...');
                await page.keyboard.press('Escape');
                await wait(500);
                
                log('✅', `Passengers set: ${totalAdults} adult(s), ${totalChildren} child(ren), ${totalInfants} infant(s)`);
                
            } catch (e) {
                log('⚠️', 'Passenger selection error: ' + e.message);
                console.error(e);
            }
        }
        
        
        // ========================================
        // STEP 7: Click Search button
        // ========================================
        log('🔍', 'Clicking SEARCH button...');
        
        const searchButtonSelector = '#mat-tab-group-0-content-0 > div > lib-search-form > div > div:nth-child(2) > div.col-12.col-xl-7.order-1.xl\\:order-none > div > div.col-12.col-xl-2.relative > lib-button > button';
        
        try {
            await page.waitForSelector(searchButtonSelector, { timeout: 10000 });
            
            // Highlight button first
            await page.evaluate((sel) => {
                const btn = document.querySelector(sel);
                if (btn) {
                    btn.style.outline = '5px solid red';
                    btn.style.outlineOffset = '3px';
                }
            }, searchButtonSelector);
            
            await wait(500);
            
            // Click using evaluate for more reliable clicking
            const clicked = await page.evaluate((sel) => {
                const btn = document.querySelector(sel);
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            }, searchButtonSelector);
            
            if (clicked) {
                log('✅', 'Search button clicked!');
            } else {
                // Try puppeteer click as backup
                await page.click(searchButtonSelector);
                log('✅', 'Search button clicked (puppeteer)!');
            }
            
        } catch (e) {
            log('⚠️', 'Search button error, trying fallback: ' + e.message);
            
            // Fallback: find by text
            const fallbackClicked = await page.evaluate(() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('search') || text.includes('find') || text.includes('suchen')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (fallbackClicked) {
                log('✅', 'Search button clicked (fallback)!');
            } else {
                log('❌', 'Could not click search button!');
            }
        }
        
        // ========================================
        // STEP 8: Wait for results to load
        // ========================================
        log('⏳', 'Waiting for flight results (10 seconds)...');
        await wait(10000);
        
        // ========================================
        // STEP 9: Extract flight data
        // ========================================
        log('📊', 'Extracting flight data...');
        
        const outboundSelector = 'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(1) > div > div.space-y-5';
        const returnSelector = 'body > app-root > app-booking > div > div > div > div.booking-flights__body > app-availabilities > lib-modern-flight-availability:nth-child(2) > div > div.space-y-5';
        
        // Wait for flight containers
        try {
            await page.waitForSelector(outboundSelector, { timeout: 15000 });
            log('✅', 'Flight results container found!');
        } catch (e) {
            log('⚠️', 'Flight results container not found: ' + e.message);
        }
        
        // Highlight containers
        await page.evaluate((outSel, retSel) => {
            const outbound = document.querySelector(outSel);
            const returnFlight = document.querySelector(retSel);
            if (outbound) {
                outbound.style.outline = '5px solid blue';
                outbound.style.outlineOffset = '5px';
            }
            if (returnFlight) {
                returnFlight.style.outline = '5px solid green';
                returnFlight.style.outlineOffset = '5px';
            }
        }, outboundSelector, returnSelector);
        
        // Extract flight data
        const flightData = await page.evaluate((outSel, retSel, fromCode, toCode) => {
            const results = {
                outbound: {
                    route: { fromCode: fromCode, toCode: toCode },
                    flights: [],
                    rawText: ''
                },
                return: {
                    route: { fromCode: toCode, toCode: fromCode },
                    flights: [],
                    rawText: ''
                },
                currency: 'CHF',
                debug: {
                    outboundFound: false,
                    returnFound: false
                }
            };
            
            function extractFlights(container) {
                const flights = [];
                if (!container) return flights;
                
                // Method 1: Look at direct children (each should be a flight card)
                const children = container.children;
                for (let i = 0; i < children.length; i++) {
                    const card = children[i];
                    const cardText = card.textContent || '';
                    
                    // Extract times
                    const times = cardText.match(/(\d{2}:\d{2})/g);
                    if (!times || times.length < 2) continue;
                    
                    // Extract price - try different patterns
                    let price = '';
                    const priceMatch = cardText.match(/CHF\s*(\d+(?:[.,]\d{2})?)/i) ||
                                       cardText.match(/(\d+)[.,](\d{2})\s*CHF/i) ||
                                       cardText.match(/(\d+(?:[.,]\d{2})?)\s*$/);
                    if (priceMatch) {
                        price = priceMatch[1].replace(',', '.');
                    }
                    
                    // Extract duration
                    const durationMatch = cardText.match(/(\d+)\s*h(?:\s*(\d+)\s*min)?/i);
                    let duration = '';
                    if (durationMatch) {
                        duration = durationMatch[1] + 'h';
                        if (durationMatch[2]) duration += ' ' + durationMatch[2] + 'min';
                    }
                    
                    // Only add if we have the essential data
                    if (times.length >= 2) {
                        flights.push({
                            departureTime: times[0],
                            arrivalTime: times[1],
                            duration: duration || '2h',
                            price: price || '0',
                            currency: 'CHF'
                        });
                    }
                }
                
                // Method 2: Fallback - scan all elements if no flights found
                if (flights.length === 0) {
                    const allElements = container.querySelectorAll('*');
                    const seen = new Set();
                    
                    allElements.forEach(el => {
                        const elText = el.textContent || '';
                        const key = elText.substring(0, 50);
                        
                        if (elText.match(/\d{2}:\d{2}/) && !seen.has(key)) {
                            const times = elText.match(/(\d{2}:\d{2})/g);
                            const price = elText.match(/CHF\s*(\d+(?:[.,]\d{2})?)/i) ||
                                         elText.match(/(\d+)[.,](\d{2})/);
                            const duration = elText.match(/(\d+h(?:\s*\d+\s*min)?)/i);
                            
                            if (times && times.length >= 2) {
                                seen.add(key);
                                flights.push({
                                    departureTime: times[0],
                                    arrivalTime: times[1],
                                    duration: duration ? duration[1] : '2h',
                                    price: price ? price[1].replace(',', '.') : '0',
                                    currency: 'CHF'
                                });
                            }
                        }
                    });
                }
                
                // Remove duplicates by departure time + price
                const uniqueFlights = flights.filter((f, i, arr) =>
                    arr.findIndex(x => x.departureTime === f.departureTime && x.price === f.price) === i
                );
                
                // Filter out flights with 0 price (invalid/unavailable options)
                return uniqueFlights.filter(f => {
                    const priceNum = parseFloat(f.price);
                    return !isNaN(priceNum) && priceNum > 0;
                });
            }
            
            const outContainer = document.querySelector(outSel);
            const retContainer = document.querySelector(retSel);
            
            if (outContainer) {
                results.debug.outboundFound = true;
                results.outbound.rawText = outContainer.textContent.substring(0, 1000);
                results.outbound.flights = extractFlights(outContainer);
            }
            
            if (retContainer) {
                results.debug.returnFound = true;
                results.return.rawText = retContainer.textContent.substring(0, 1000);
                results.return.flights = extractFlights(retContainer);
            }
            
            return results;
        }, outboundSelector, returnSelector, fromCode, toCode);
        
        
        // Log results
        log('📊', '='.repeat(60));
        log('📊', 'EXTRACTION RESULTS');
        log('📊', '='.repeat(60));
        log('📊', `Outbound container found: ${flightData.debug.outboundFound}`);
        log('📊', `Return container found: ${flightData.debug.returnFound}`);
        
        log('📝', 'OUTBOUND RAW TEXT (first 800 chars):');
        console.log(flightData.outbound.rawText.substring(0, 800));
        
        log('📝', 'RETURN RAW TEXT (first 800 chars):');
        console.log(flightData.return.rawText.substring(0, 800));
        
        // Debug: show what patterns were found
        const outText = flightData.outbound.rawText;
        log('🔍', `Times found in outbound: ${(outText.match(/\d{2}:\d{2}/g) || []).join(', ')}`);
        log('🔍', `Prices found in outbound: ${(outText.match(/CHF\s*\d+/gi) || []).join(', ')}`);
        
        log('✈️', `Outbound flights: ${flightData.outbound.flights.length}`);
        flightData.outbound.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime} → ${f.arrivalTime} | ${f.duration} | CHF ${f.price}`);
        });
        
        log('🔙', `Return flights: ${flightData.return.flights.length}`);
        flightData.return.flights.forEach((f, i) => {
            console.log(`   ${i + 1}. ${f.departureTime} → ${f.arrivalTime} | ${f.duration} | CHF ${f.price}`);
        });
        
        // Keep browser open in debug mode (only locally)
        if (DEBUG_MODE) {
            log('👀', 'DEBUG: Browser stays open for 10 seconds...');
            log('👀', 'Blue = Outbound | Green = Return');
            await wait(10000);
        }
        
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
                currency: 'CHF'
            }
        };
        
    } catch (error) {
        log('❌', 'ERROR: ' + error.message);
        console.error(error);
        return {
            success: false,
            error: error.message,
            url: 'https://www.prishtinaticket.net/en',
            flights: {
                outbound: { flights: [] },
                return: { flights: [] }
            }
        };
    } finally {
        if (browser) {
            log('🔚', 'Closing browser...');
            await browser.close();
        }
    }
}

module.exports = {
    searchFlights,
    airportCodes
};
