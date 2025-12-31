const fs = require('fs');
const path = require('path');

/**
 * Performance Logger - Tracks and logs timing for each step of the search process
 */
class PerformanceLogger {
    constructor(searchId) {
        this.searchId = searchId || this.generateSearchId();
        this.startTime = Date.now();
        this.timings = {};
        this.steps = [];
        this.searchParams = null;
    }

    generateSearchId() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const random = Math.random().toString(36).substring(2, 8);
        return `search_${timestamp}_${random}`;
    }

    setSearchParams(params) {
        this.searchParams = params;
    }

    /**
     * Start timing a specific step
     */
    startStep(stepName) {
        this.timings[stepName] = {
            start: Date.now(),
            end: null,
            duration: null
        };
        return this.timings[stepName].start;
    }

    /**
     * End timing a specific step
     */
    endStep(stepName, details = {}) {
        if (!this.timings[stepName]) {
            console.warn(`Step "${stepName}" was not started!`);
            return 0;
        }
        
        this.timings[stepName].end = Date.now();
        this.timings[stepName].duration = this.timings[stepName].end - this.timings[stepName].start;
        this.timings[stepName].details = details;
        
        this.steps.push({
            name: stepName,
            duration: this.timings[stepName].duration,
            details
        });
        
        return this.timings[stepName].duration;
    }

    /**
     * Record a step with start and end time at once
     */
    recordStep(stepName, startTime, endTime, details = {}) {
        const duration = endTime - startTime;
        this.timings[stepName] = {
            start: startTime,
            end: endTime,
            duration,
            details
        };
        this.steps.push({ name: stepName, duration, details });
        return duration;
    }

    /**
     * Get duration of a specific step
     */
    getStepDuration(stepName) {
        return this.timings[stepName]?.duration || 0;
    }

    /**
     * Get total elapsed time since logger creation
     */
    getTotalTime() {
        return Date.now() - this.startTime;
    }

    /**
     * Generate a detailed report
     */
    generateReport() {
        const totalTime = this.getTotalTime();
        const endTime = new Date();
        
        const report = {
            searchId: this.searchId,
            timestamp: new Date(this.startTime).toISOString(),
            endTimestamp: endTime.toISOString(),
            searchParams: this.searchParams,
            
            // Summary metrics (in milliseconds)
            summary: {
                totalDurationMs: totalTime,
                totalDurationFormatted: this.formatDuration(totalTime),
                stepCount: this.steps.length
            },

            // Categorized timing breakdown
            breakdown: {
                // Scraper phases
                browserLaunch: this.timings['browser_launch']?.duration || 0,
                pageNavigation: this.timings['page_navigation']?.duration || 0,
                formFilling: this.calculatePhaseTotal(['fill_departure', 'fill_destination', 'select_dates', 'set_passengers', 'select_trip_type']),
                searchClick: this.timings['click_search']?.duration || 0,
                waitForResults: this.timings['wait_for_results']?.duration || 0,
                dataExtraction: this.timings['extract_flight_data']?.duration || 0,
                browserClose: this.timings['browser_close']?.duration || 0,
                
                // API/Server phases
                apiRequestReceived: this.timings['api_request_received']?.duration || 0,
                scraperExecution: this.timings['scraper_execution']?.duration || 0,
                apiResponseSent: this.timings['api_response_sent']?.duration || 0,
                
                // Frontend phases
                frontendDisplayTime: this.timings['frontend_display']?.duration || 0
            },

            // Formatted breakdown for readability
            breakdownFormatted: {},

            // Detailed step-by-step log
            steps: this.steps.map(step => ({
                ...step,
                durationFormatted: this.formatDuration(step.duration)
            })),

            // Raw timing data
            rawTimings: this.timings,

            // Performance analysis
            analysis: {
                bottlenecks: [],
                suggestions: []
            }
        };

        // Format breakdown durations
        for (const [key, value] of Object.entries(report.breakdown)) {
            report.breakdownFormatted[key] = this.formatDuration(value);
        }

        // Identify bottlenecks (steps > 2 seconds)
        this.steps.forEach(step => {
            if (step.duration > 2000) {
                report.analysis.bottlenecks.push({
                    step: step.name,
                    duration: step.duration,
                    severity: step.duration > 5000 ? 'high' : 'medium'
                });
            }
        });

        // Add suggestions based on bottlenecks
        if (report.breakdown.pageNavigation > 3000) {
            report.analysis.suggestions.push('Page navigation is slow. Consider checking network conditions or server response times.');
        }
        if (report.breakdown.waitForResults > 5000) {
            report.analysis.suggestions.push('Waiting for results takes long. The source website may be slow to respond.');
        }
        if (report.breakdown.dataExtraction > 1000) {
            report.analysis.suggestions.push('Data extraction could be optimized with more specific selectors.');
        }

        return report;
    }

    /**
     * Calculate total time for a phase (sum of multiple steps)
     */
    calculatePhaseTotal(stepNames) {
        return stepNames.reduce((total, name) => {
            return total + (this.timings[name]?.duration || 0);
        }, 0);
    }

    /**
     * Format milliseconds into readable string
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(2);
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Save the report to a file
     */
    async saveReport(additionalData = {}) {
        const report = this.generateReport();
        
        // Merge additional data
        Object.assign(report, additionalData);
        
        // Create filename with timestamp
        const filename = `${this.searchId}.json`;
        const logsDir = path.join(__dirname, '..', 'logs', 'performance');
        const filepath = path.join(logsDir, filename);
        
        // Ensure directory exists
        try {
            await fs.promises.mkdir(logsDir, { recursive: true });
        } catch (e) {
            // Directory may already exist
        }
        
        // Write report
        await fs.promises.writeFile(filepath, JSON.stringify(report, null, 2));
        
        // Also write a human-readable summary
        const summaryFilename = `${this.searchId}_summary.txt`;
        const summaryPath = path.join(logsDir, summaryFilename);
        const summary = this.generateHumanReadableSummary(report);
        await fs.promises.writeFile(summaryPath, summary);
        
        console.log(`📊 Performance report saved: ${filename}`);
        
        return { filepath, report };
    }

    /**
     * Generate a human-readable summary
     */
    generateHumanReadableSummary(report) {
        const lines = [
            '═══════════════════════════════════════════════════════════════════',
            '                    PERFORMANCE TIMING REPORT',
            '═══════════════════════════════════════════════════════════════════',
            '',
            `Search ID:     ${report.searchId}`,
            `Timestamp:     ${report.timestamp}`,
            '',
            '───────────────────────────────────────────────────────────────────',
            '                       SEARCH PARAMETERS',
            '───────────────────────────────────────────────────────────────────',
        ];

        if (report.searchParams) {
            lines.push(`From:          ${report.searchParams.departure || 'N/A'}`);
            lines.push(`To:            ${report.searchParams.destination || 'N/A'}`);
            lines.push(`Departure:     ${report.searchParams.departureDate || 'N/A'}`);
            lines.push(`Return:        ${report.searchParams.returnDate || 'One-way'}`);
            lines.push(`Passengers:    ${report.searchParams.adults || 1} adult(s), ${report.searchParams.children || 0} child(ren), ${report.searchParams.infants || 0} infant(s)`);
            lines.push(`Trip Type:     ${report.searchParams.tripType || 'roundtrip'}`);
        }

        lines.push('');
        lines.push('───────────────────────────────────────────────────────────────────');
        lines.push('                       TIMING BREAKDOWN');
        lines.push('───────────────────────────────────────────────────────────────────');
        lines.push('');
        lines.push('PHASE 1: BROWSER & NAVIGATION');
        lines.push(`  ├─ Browser Launch:           ${report.breakdownFormatted.browserLaunch}`);
        lines.push(`  └─ Page Navigation:          ${report.breakdownFormatted.pageNavigation}`);
        lines.push('');
        lines.push('PHASE 2: FORM FILLING');
        lines.push(`  ├─ Fill Departure City:      ${this.formatDuration(this.timings['fill_departure']?.duration || 0)}`);
        lines.push(`  ├─ Fill Destination City:    ${this.formatDuration(this.timings['fill_destination']?.duration || 0)}`);
        lines.push(`  ├─ Select Dates:             ${this.formatDuration(this.timings['select_dates']?.duration || 0)}`);
        lines.push(`  ├─ Set Passengers:           ${this.formatDuration(this.timings['set_passengers']?.duration || 0)}`);
        lines.push(`  └─ Total Form Filling:       ${report.breakdownFormatted.formFilling}`);
        lines.push('');
        lines.push('PHASE 3: SEARCH EXECUTION');
        lines.push(`  ├─ Click Search Button:      ${report.breakdownFormatted.searchClick}`);
        lines.push(`  └─ Wait for Results:         ${report.breakdownFormatted.waitForResults}`);
        lines.push('');
        lines.push('PHASE 4: DATA EXTRACTION');
        lines.push(`  └─ Extract Flight Data:      ${report.breakdownFormatted.dataExtraction}`);
        lines.push('');
        lines.push('PHASE 5: CLEANUP');
        lines.push(`  └─ Browser Close:            ${report.breakdownFormatted.browserClose}`);
        lines.push('');
        lines.push('PHASE 6: FRONTEND DISPLAY');
        lines.push(`  └─ Display Time:             ${report.breakdownFormatted.frontendDisplayTime}`);
        lines.push('');
        lines.push('───────────────────────────────────────────────────────────────────');
        lines.push('                          SUMMARY');
        lines.push('───────────────────────────────────────────────────────────────────');
        lines.push('');
        lines.push(`  ⏱️  TOTAL TIME: ${report.summary.totalDurationFormatted}`);
        lines.push(`  📊 Total Steps: ${report.summary.stepCount}`);
        lines.push('');

        if (report.analysis.bottlenecks.length > 0) {
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('                       ⚠️  BOTTLENECKS');
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('');
            report.analysis.bottlenecks.forEach(b => {
                const icon = b.severity === 'high' ? '🔴' : '🟡';
                lines.push(`  ${icon} ${b.step}: ${this.formatDuration(b.duration)}`);
            });
            lines.push('');
        }

        if (report.analysis.suggestions.length > 0) {
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('                      💡 SUGGESTIONS');
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('');
            report.analysis.suggestions.forEach((s, i) => {
                lines.push(`  ${i + 1}. ${s}`);
            });
            lines.push('');
        }

        // Add results summary if available
        if (report.results) {
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('                       RESULTS SUMMARY');
            lines.push('───────────────────────────────────────────────────────────────────');
            lines.push('');
            lines.push(`  Outbound Flights Found:  ${report.results.outboundCount || 0}`);
            lines.push(`  Return Flights Found:    ${report.results.returnCount || 0}`);
            lines.push('');
        }

        lines.push('═══════════════════════════════════════════════════════════════════');
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push('═══════════════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Print a quick console summary (skipped in production)
     */
    printSummary() {
        // Skip in production
        if (process.env.NODE_ENV === 'production') return;
        
        const report = this.generateReport();
        
        console.log('\n' + '═'.repeat(60));
        console.log('⏱️  PERFORMANCE SUMMARY');
        console.log('═'.repeat(60));
        console.log(`Total Time: ${report.summary.totalDurationFormatted}`);
        console.log('');
        console.log('Breakdown:');
        console.log(`  • Browser Launch:    ${report.breakdownFormatted.browserLaunch}`);
        console.log(`  • Direct Navigation: ${report.breakdownFormatted.directNavigation || report.breakdownFormatted.pageNavigation}`);
        console.log(`  • Wait for Results:  ${report.breakdownFormatted.waitForResults}`);
        console.log(`  • Data Extraction:   ${report.breakdownFormatted.extractData || report.breakdownFormatted.dataExtraction}`);
        console.log('═'.repeat(60) + '\n');
    }
}

module.exports = PerformanceLogger;

