/* ==========================================================================
   SECTION 1: CONFIGURATION & GLOBAL STATE
   ========================================================================== */

const BILLING_ISSUE_REASON = "Billing Issue";
const DEFAULT_TREND_DAYS = 15;

// Color Palette for ECharts
const COLORS = {
    Rural: '#10b981', 
    Urban: '#f59e0b', 
    NA: '#94a3b8',
    GeneralAcht: '#f59e0b',
    GeneralVolume: '#3b82f6',
    FCR: '#10b981'
};

// Global State
let selectedDate = null;
let groupedData = {}; // Format: { "YYYY-MM-DD": { "unique_id": {call_data} } }
let availableDates = [];
let trendDateRange = null; // Controlled by the range picker

// Chart Instance Registry (to prevent memory leaks on redraw)
const chartInstances = {
    avgHourlyChart: null,
    lastDayHourlyChart: null,
    monthRegionPie: null,
    lastDayRegionPie: null,
    monthButterflyCallreason: null,
    dayButterflyCallreason: null,
    monthBillingButterfly: null,
    dayBillingButterfly: null,
    monthOverMonthChart: null,
    fcrTrendChart: null,
    callTrendChart: null
};

/* ==========================================================================
   SECTION 2: DATA NORMALIZATION
   ========================================================================== */

function normalizeFromSupabase(rows) {
    const normalized = {};
    
    rows.forEach((row, idx) => {
        let rawDate = row.call_date;
        
        // Handle common Supabase formats safely
        let datePart;
        
        if (typeof rawDate === 'string') {
            // Case 1: "2026-02-08T22:02:00+00:00" or "2026-02-08T22:02:00Z"
            if (rawDate.includes('T')) {
                datePart = rawDate.split('T')[0];           // take only YYYY-MM-DD
            }
            // Case 2: already plain date "2026-02-08"
            else {
                datePart = rawDate;
            }
        }
        // Rare case: if Supabase ever returns Date object (unlikely in JS client)
        else if (rawDate instanceof Date) {
            const y = rawDate.getUTCFullYear();
            const m = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
            const d = String(rawDate.getUTCDate()).padStart(2, '0');
            datePart = `${y}-${m}-${d}`;
        }
        else {
            console.warn("Invalid call_date format:", rawDate);
            return;
        }
        
        // Basic validation – skip invalid dates
        if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            console.warn("Invalid datePart after parsing:", datePart, "from raw:", rawDate);
            return;
        }
        
        const phone = String(row.phone_number || "").trim();
        const id = phone ? `${phone}_${idx}` : `call_${datePart}_${idx}`;
        
        if (!normalized[datePart]) normalized[datePart] = {};
        
        normalized[datePart][id] = {
            call_date: row.call_date,
           // call_date: datePart,  // store clean YYYY-MM-DD
            phone_number: phone,
            status: (row.status || "").toString().toUpperCase(),
            full_name: row.full_name || "Unknown",
            Region: normalizeRegion(row.region),
            "Call Reason": row.call_reason || "Unknown",
            acht: Number(row.acht || 0)
        };
    });
    
    return normalized;
}

// Region Helper: Cleans data like "r" -> "Rural"
function normalizeRegion(raw) {
    if (!raw) return "N/A";
    const v = String(raw).trim().toLowerCase();
    if (['rural','r','village'].includes(v)) return "Rural";
    if (['urban','u','city'].includes(v)) return "Urban";
    return "N/A";
}


/* ==========================================================================
   SECTION 3: SUPABASE FETCHING & REALTIME
   ========================================================================== */

async function fetchAndRefresh() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
        // FIX 1: .limit(5000) bypasses the default 1000-row cap to get all 1,386+ calls
        const { data, error, count } = await supabase
            .from('all_calls')
            .select('*', { count: 'exact' })
            .order('call_date', { ascending: true })
            .range(0, 999999);

        if (error) throw error;
        console.log("Rows received:", data?.length);
        // Process data into our grouped object
        groupedData = normalizeFromSupabase(data);
        availableDates = Object.keys(groupedData).sort();

        // FIX 2: Always select the LATEST available date on refresh
        if (availableDates.length > 0) {
            selectedDate = availableDates[availableDates.length - 1];
            
            const dateTextEl = document.getElementById('selectedDate');
            if (dateTextEl) dateTextEl.textContent = selectedDate;
            
            // Sync the calendar UI to the latest date
            if (window.fp) window.fp.setDate(selectedDate, false);
        }

        renderDashboard();
        createCallTrendChart();
        
    } catch (err) {
        console.error("Fetch Error:", err.message);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// Enable Realtime Listening
function initRealtime() {
    supabase.channel('dashboard-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'all_calls' }, () => {
            console.log("Change detected - Refreshing...");
            fetchAndRefresh();
        })
        .subscribe();
}

/* ==========================================================================
   SECTION 4: KPI RENDERING
   ========================================================================== */
function getHourFromDate(dateStr) {
    if (!dateStr) return 0;

    // 1. Trim any accidental whitespace
    const cleanStr = String(dateStr).trim();

    // 2. Split by space to separate date from time
    // Example: "11/1/2025 0:08" -> ["11/1/2025", "0:08"]
    const parts = cleanStr.split(' ');
    
    if (parts.length < 2) return 0;

    // 3. Take the time part and split by ":" to get the hour
    // Example: "0:08" -> ["0", "08"]
    const timePart = parts[1];
    const hour = parseInt(timePart.split(':')[0], 10);

    return isNaN(hour) ? 0 : hour;
}

   
/* ==========================================================================
  WORST HOUR BADGE
   ========================================================================== */
function renderWorstHourBadge() {
    const callsElement = document.getElementById('worstHourCalls');
    const badgeElement = document.getElementById('worstHourBadge');
    
    if (!callsElement || !badgeElement) return;

    // 1. Check if data exists for the selected date
    if (!selectedDate || !groupedData[selectedDate]) {
        callsElement.textContent = '0';
        badgeElement.textContent = '--:--';
        return;
    }

    const dayCalls = Object.values(groupedData[selectedDate]);
    const hourly = Array(24).fill(0); // Initialize the array properly

    // 2. Count calls per hour (Calculation must happen first!)
    dayCalls.forEach(c => {
        const h = parseInt(getHourFromDate(c.call_date));
        if (h >= 0 && h < 24) {
            hourly[h]++;
        }
    });

    // 3. Find the maximum (the peak)
    let maxCalls = 0;
    let peakHour = 0;
    for (let h = 0; h < 24; h++) {
        if (hourly[h] > maxCalls) {
            maxCalls = hourly[h];
            peakHour = h;
        }
    }

    // 4. Update UI (Formatting happens last)
    if (maxCalls === 0) {
        callsElement.textContent = '0';
        badgeElement.textContent = '--:--';
    } else {
        // Convert to 12-hour format (e.g., 03:00 PM)
        const hour24 = peakHour;
        const ampm = hour24 >= 12 ? 'PM' : 'AM';
        const hour12 = hour24 % 12 || 12;
        const startTime = String(hour12).padStart(2, '0') + ":00 " + ampm;

        callsElement.textContent = maxCalls.toLocaleString();
        badgeElement.textContent = startTime;
    }
}  

function renderDashboard() {
if (!selectedDate || !groupedData[selectedDate]) {
        console.warn("No data for date:", selectedDate);
        return;
    }

    const dayCalls = Object.values(groupedData[selectedDate]);
    const total = dayCalls.length; // This will now show 1,386 if data is loaded

    // Math for KPIs
    const unique = new Set(dayCalls.map(c => c.phone_number).filter(Boolean)).size;
    const agents = new Set(dayCalls.map(c => c.full_name).filter(Boolean)).size;
    const fcr = dayCalls.filter(c => c.status === "FCR").length;
    const avgAht = total > 0 ? Math.round(dayCalls.reduce((s, c) => s + c.acht, 0) / total) : 0;

    // Update HTML Elements
    document.getElementById('kpiTotalCalls').textContent = total.toLocaleString();
    document.getElementById('kpiUniqueCallers').textContent = unique.toLocaleString();
    document.getElementById('kpiActiveAgents').textContent = agents.toLocaleString();
    document.getElementById('kpiFCRPercent').textContent = Math.round((fcr / total) * 100) + '%';
    document.getElementById('kpiAvgHandleTime').textContent = formatTime(avgAht);

    // Update Date Labels across the UI
    const displayDate = new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.querySelectorAll('.date-mirror').forEach(el => el.textContent = displayDate);

    // Trigger Charts (Keep your existing ECharts functions)
    renderSpikingReasons(); 
    renderWorstHourBadge();
}


function formatTime(s) {
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/* ==========================================================================
   SECTION 5: INITIALIZATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the main date picker
    window.fp = flatpickr("#datePicker", {
        dateFormat: "Y-m-d",
        onChange: (selectedDates, dateStr) => {
            // FIX 4: Update the global selectedDate and trigger a re-render
            selectedDate = dateStr; 
            
            const dateTextEl = document.getElementById('selectedDate');
            if (dateTextEl) dateTextEl.textContent = selectedDate;

            // Update all elements with class 'date-mirror'
            document.querySelectorAll('.date-mirror').forEach(el => el.textContent = selectedDate);
            
            renderDashboard(); 
        }
    });

    fetchAndRefresh();
});