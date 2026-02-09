// --- STATIC JSON CONFIG ---
const MASTER_DATA_URL = "https://raw.githubusercontent.com/Contactinfocenter/dashboard-data/main/data/calls/all_calls.json";

const CLIENT_BASE_CSV_URL = "https://raw.githubusercontent.com/Contactinfocenter/dashboard-data/main/data/client_count.csv"; 

/* ---------------- DOM & STATE ---------------- */
let dateFilters = {
    main: { start: null, end: null },
    zone: { start: null, end: null },
    rural: { start: null, end: null }
};

// Region / Main
const statusText = document.getElementById('statusText');
const regionChips = document.getElementById('regionChips');
const reasonChips = document.getElementById('reasonChips');
const summaryTableContainer = document.getElementById('summaryTableContainer');
const quickStats = document.getElementById('quickStats'); // This wasn't used in main, but kept.
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const mainBarChartCanvas = document.getElementById('barChart');

// Zone (Urban)
const zoneChips = document.getElementById('zoneChips');
const zoneReasonChips = document.getElementById('zoneReasonChips');
const zoneSummaryTableContainer = document.getElementById('zoneSummaryTableContainer');
const zoneBarChartCanvas = document.getElementById('zoneBarChart');
const clearZoneFiltersBtn = document.getElementById('clearZoneFiltersBtn');
const selectAllZoneBtn = document.getElementById('selectAllZoneBtn');

// New Rural Zone (Top 20)
const ruralSummaryTableContainer = document.getElementById("ruralSummaryTableContainer");
const ruralZoneCanvas = document.getElementById("ruralZoneBarChart");
const ruralZoneQuickStats = document.getElementById("ruralZoneQuickStats");

// Declare rural chip references globally
let ruralZoneChips = document.getElementById("ruralZoneChips");
let ruralZoneReasonChips = document.getElementById("ruralZoneReasonChips");

const clearRuralFiltersBtn = document.getElementById('clearRuralFiltersBtn');
const selectAllRuralBtn = document.getElementById('selectAllRuralBtn');


let chart = null;
let zoneChart = null;
let ruralZoneChart = null;

let rawData = {}; // This will now hold the normalized data keyed by date ('YYYY-MM-DD')
let filters = { regions: new Set(), reasons: new Set() };
let zoneFilters = new Set();
let zoneReasonFilters = new Set();
let ruralZoneFilters = new Set();
let ruralReasonFilters = new Set();

const zonesOfInterest = ['Dhaka','Comilla','Chittagong'];
const excludedMetroZones = ["Dhaka", "Comilla", "Chittagong"]; // Used for rural filtering

let allAvailableRegions = [];
let allAvailableReasons = [];
let allAvailableZoneReasons = [];
let allRuralZones = []; // To store discovered rural zones
let ruralReasons = [];  // To store discovered rural reasons
let clientBaseMap = {};
let clientBaseMapNormalized = {};

/* ---------------- UTIL (Kept as is + Data Normalization) ---------------- */
function normalizeKey(s) {
    if (s === undefined || s === null) return '';
    return String(s).trim().toLowerCase();
}

function getCallerId(item, docKey) {
    return String(item?.phone_number || item?.Client_ID || item?.email || docKey);
}

function formatRegionName(region) { return region || 'N/A'; }

function normalizeFromRows(data) {
    // Safety Adapter: If 'data' is an object (from GitHub), convert it to a flat array
    let rows = [];
    if (Array.isArray(data)) {
        rows = data;
    } else if (typeof data === 'object' && data !== null) {
        // If the data is keyed by date or ID, flatten all nested objects into one array
        Object.values(data).forEach(item => {
            if (Array.isArray(item)) {
                rows.push(...item);
            } else if (typeof item === 'object') {
                // If it's a double-nested object (Date -> ID -> Record)
                rows.push(...Object.values(item));
            }
        });
    }

    const normalized = {};

    rows.forEach((row, idx) => {
        // --- START OF YOUR WORKING LOGIC ---
        const call_date_val = row.call_date || '';
        const dateStr = call_date_val ? String(call_date_val).split(' ')[0] : 'Unknown'; 
        
        const id = row.phone_number && row.call_date ? 
                   `${row.phone_number}_${new Date(row.call_date).getTime()}` : 
                   `${dateStr}_${idx}`; 
        
        const rawPhoneNumber = row.phone_number;
        const cleanedPhoneNumber = rawPhoneNumber ? String(Math.floor(Number(rawPhoneNumber))) : '';

        const callRegion = row.region || row.Region || 'N/A';
        const callZone = row.zone || row.Zone || 'N/A';
        const achtValue = Number(row.acht || row.ACR || row.length_in_sec || 0); 
        const callReason = row["Call Reason"] || row.call_reason || 'N/A';

        normalized[dateStr] = normalized[dateStr] || {};
        
        normalized[dateStr][id] = {
            call_date: call_date_val,
            phone_number: cleanedPhoneNumber,
            status: (row.status || '').toUpperCase(),
            full_name: row.full_name || row.email || 'Unknown',
            Region: callRegion, 
            Zone: callZone,
            "Call Reason": callReason,
            acht: achtValue, 
            comments: row.comments || 'Comment Not Provided'
        };
        // --- END OF WORKING LOGIC ---
    });

    return normalized;
}


/* ---------------- Date Range Helpers ---------------- */

function getFilteredDates(filterSet, defaultN) {
    const datesAvailable = Object.keys(rawData).sort();

    if (filterSet.start && filterSet.end) {
        // Filter by the user-defined range
        return datesAvailable.filter(d => {
            // Create date object from 'YYYY-MM-DD' key
            const date = new Date(d + 'T00:00:00'); 
            return date >= filterSet.start && date <= filterSet.end;
        });
    } else {
        // Default behavior: return the last N dates
        return datesAvailable.slice(-defaultN);
    }
}

function getPreviousPeriodDates(currentDates, allDates) {
    if (!currentDates.length) return [];

    const periodLength = currentDates.length;
    
    const firstDateStr = currentDates[0];
    const firstDateIndex = allDates.indexOf(firstDateStr);

    if (firstDateIndex <= 0) return []; 
    
    // Slice the array to get the 'periodLength' dates immediately preceding the start date
    const previousPeriodStart = Math.max(0, firstDateIndex - periodLength);
    const previousDates = allDates.slice(previousPeriodStart, firstDateIndex);

    return previousDates;
}

/* ---------------- CHART HELPERS ---------------- */
function createOrUpdateEChart(labels, totalData, uniqueData, elementId) {
    const chartDom = document.getElementById(elementId);
    if (!chartDom) return;

    // Get or create instance
    let myChart = echarts.getInstanceByDom(chartDom);
    if (!myChart) {
        myChart = echarts.init(chartDom);
    }

    const option = {
        tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 0,              // Important: let HTML handle spacing
                    textStyle: { fontSize: 12 },
                    axisPointer: {
                        type: 'shadow',
                        shadowStyle: { color: 'rgba(241, 245, 249, 0.6)' }
                    },
                    formatter: function (params) {
                        const title = params[0].axisValue;

                        const rows = params.map(p => `
                            <div style="
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                                margin-top:6px;
                                color:#1d273b;
                                font-size:12px;
                            ">
                                <span>
                                    <span style="
                                        display:inline-block;
                                        width:8px;
                                        height:8px;
                                        border-radius:50%;
                                        background:${p.color};
                                        margin-right:6px;
                                    "></span>
                                    ${p.seriesName}
                                </span>
                                <strong>${p.value}</strong>
                            </div>
                        `).join('');

                        return `
                            <div style="min-width:160px">
                                <!-- Header -->
                                <div style="
                                    padding:8px 12px;
                                    font-weight:600;
                                    color:#1d273b;
                                    border-bottom:1px solid #e6e7e9;
                                ">
                                    ${title}
                                </div>

                                <!-- Body -->
                                <div style="padding:8px 12px">
                                    ${rows}
                                </div>
                            </div>
                        `;
                    }
                },

        legend: {
            data: ['Total Calls', 'Unique Calls'],
            right: '0%',
            top: '0%',
            icon: 'roundRect',
            itemWidth: 20,
            itemHeight: 12,
            itemGap: 20,
            textStyle: {
                fontSize: 12,
                fontWeight: 500,
                color: '#616876' // Tabler muted text
            }
        },

        grid: {
            left: '0%',
            right: '0%',
            bottom: '0%',
            top: '16%',
            containLabel: true
        },

        xAxis: {
            type: 'category',
            data: labels,
            axisTick: { show: false },
            axisLine: {
                show: true,
                lineStyle: { color: '#e6e7e9' }
            },
            axisLabel: {
                color: '#616876',
                fontSize: 11,
                margin: 12
            }
        },

        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisLabel: { show: false },
            splitLine: {
                show: true,
                lineStyle: {
                    type: 'dashed',
                    color: '#f1f5f9'
                }
            }
        },

        series: [
            {
                name: 'Total Calls',
                type: 'bar',
                data: totalData,
                barMaxWidth: 25,
                barGap: '30%',
                barCategoryGap: '45%',
                itemStyle: {
                    color: '#206bc4', // Tabler brand blue
                    borderRadius: [3, 3, 0, 0]
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#206bc4',
                    fontSize: 10,
                    fontWeight: 600,
                    distance: 8
                }
            },
            {
                name: 'Unique Calls',
                type: 'bar',
                data: uniqueData,
                barMaxWidth: 25,
                barGap: '30%',
                barCategoryGap: '45%',
                itemStyle: {
                    color: '#cfd4dc', // Improved muted Tabler gray
                    borderRadius: [3, 3, 0, 0]
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#616876',
                    fontSize: 10,
                    fontWeight: 600,
                    distance: 8
                }
            }
        ],

        animationDuration: 800,
        animationEasing: 'cubicOut'
    };

    myChart.setOption(option, true);

    // Resize handling (safe, no duplicates)
    if (!chartDom._resizeHandler) {
        chartDom._resizeHandler = () => myChart.resize();
        window.addEventListener('resize', chartDom._resizeHandler);
    }
}


/* --- WRAPPERS (USE THESE IN YOUR RENDER LOGIC) --- */

function createOrUpdateMainChart(labels, totalData, uniqueData) {
    createOrUpdateEChart(labels, totalData, uniqueData, 'barChart');
}

function createOrUpdateZoneChart(labels, totalData, uniqueData) {
    createOrUpdateEChart(labels, totalData, uniqueData, 'zoneBarChart');
}

function createOrUpdateRuralZoneChart(labels, totalData, uniqueData) {
    createOrUpdateEChart(labels, totalData, uniqueData, 'ruralZoneBarChart');
}

/* ---------------- FILTER & AGGREGATE HELPERS ---------------- */
function buildFilterLists(recordsByDate) {
    const regions = new Set();
    const reasons = new Set();
    const zoneReasons = new Set();
    const ruralZonesTemp = new Set();
    const ruralReasonsTemp = new Set();

    for (const d in recordsByDate) {
        const group = recordsByDate[d] || {};
        for (const k in group) {
            const r = group[k];
            if (!r) continue;
            // Uses normalized 'Region' key
            regions.add(String(r.Region || 'N/A')); 
            // Uses normalized 'Call Reason' key
            reasons.add(String(r["Call Reason"] || 'N/A'));
            
            const zoneVal = String(r.Zone || 'N/A');
            if (zonesOfInterest.includes(zoneVal)) {
                zoneReasons.add(String(r["Call Reason"] || 'N/A'));
            }
            if (String(r.Region).trim() === "Rural") {
                ruralZonesTemp.add(zoneVal);
                ruralReasonsTemp.add(String(r["Call Reason"] || 'N/A'));
            }
        }
    }
    allAvailableRegions = Array.from(regions).sort();
    allAvailableReasons = Array.from(reasons).sort();
    allAvailableZoneReasons = Array.from(zoneReasons).sort();
    allRuralZones = Array.from(ruralZonesTemp).sort(); 
    ruralReasons = Array.from(ruralReasonsTemp).sort(); 
}
// Update chip visuals based on current filters
// ────────────────────────────────────────────────
//  Unified Tabler chip styler
// ────────────────────────────────────────────────
function styleTablerChip(chip, isActive) {
    chip.classList.remove(
        'bg-primary-lt',
        'text-primary',
        'badge-outline',
        'text-muted'
    );

    chip.classList.add('badge');

    if (isActive) {
        chip.classList.add('bg-primary-lt', 'text-primary');
    } else {
        chip.classList.add('badge-outline', 'text-muted');
    }
}


// ────────────────────────────────────────────────
//  Main + Zone + Rural chips visual updater
// ────────────────────────────────────────────────
function updateChipVisuals() {

    // ────────────────────────────────────────────
    //  Region + Reason chips
    // ────────────────────────────────────────────
    if (regionChips && reasonChips) {
        [...regionChips.children, ...reasonChips.children].forEach(chip => {
            const type  = chip.dataset.type;
            const value = chip.dataset.value;

            const activeSet =
                type === 'region' ? filters.regions : filters.reasons;

            styleTablerChip(chip, activeSet.has(value));
        });
    }

    // Buttons visibility (main filters)
    clearFiltersBtn?.classList.toggle(
        'd-none',
        filters.regions.size === 0 && filters.reasons.size === 0
    );

    selectAllBtn?.classList.toggle(
        'd-none',
        filters.regions.size === allAvailableRegions.length &&
        filters.reasons.size === allAvailableReasons.length
    );

    // ────────────────────────────────────────────
    //  Zone chips
    // ────────────────────────────────────────────
    if (zoneChips) {
        [...zoneChips.children].forEach(chip => {
            styleTablerChip(
                chip,
                zoneFilters.has(chip.dataset.value)
            );
        });
    }

    if (zoneReasonChips) {
        [...zoneReasonChips.children].forEach(chip => {
            styleTablerChip(
                chip,
                zoneReasonFilters.has(chip.dataset.value)
            );
        });
    }

    // Buttons visibility (zone filters)
    clearZoneFiltersBtn?.classList.toggle(
        'd-none',
        zoneFilters.size === 0 && zoneReasonFilters.size === 0
    );

    selectAllZoneBtn?.classList.toggle(
        'd-none',
        zoneFilters.size === zonesOfInterest.length &&
        zoneReasonFilters.size === allAvailableZoneReasons.length
    );

    // ────────────────────────────────────────────
    //  Rural chips
    // ────────────────────────────────────────────
    updateRuralChipVisuals();
}


// ────────────────────────────────────────────────
//  Rural chips (NOW TABLER STYLE)
// ────────────────────────────────────────────────
function updateRuralChipVisuals() {

    // Rural Zone chips
    if (ruralZoneChips) {
        [...ruralZoneChips.children].forEach(chip => {
            styleTablerChip(
                chip,
                ruralZoneFilters.has(chip.dataset.value)
            );
        });
    }

    // Rural Reason chips
    if (ruralZoneReasonChips) {
        [...ruralZoneReasonChips.children].forEach(chip => {
            styleTablerChip(
                chip,
                ruralReasonFilters.has(chip.dataset.value)
            );
        });
    }

    // Buttons visibility (rural filters)
    clearRuralFiltersBtn?.classList.toggle(
        'd-none',
        ruralZoneFilters.size === 0 && ruralReasonFilters.size === 0
    );

    selectAllRuralBtn?.classList.toggle(
        'd-none',
        ruralZoneFilters.size === allRuralZones.length &&
        ruralReasonFilters.size === ruralReasons.length
    );
}


function passFilters(row) {
    if (!row) return false;
    // normalized 'Region' key
    const region = String(row.Region || 'N/A'); 
    const reason = String(row["Call Reason"] || 'N/A');
    if (filters.regions.size > 0 && !filters.regions.has(region)) return false;
    if (filters.reasons.size > 0 && !filters.reasons.has(reason)) return false;
    return true;
}

function passZoneFilters(row) {
    if (!row) return false;
    // normalized 'Zone' key
    const zone = String(row.Zone || 'N/A'); 
    const reason = String(row["Call Reason"] || 'N/A');
    if (zoneFilters.size > 0 && !zoneFilters.has(zone)) return false;
    if (zoneReasonFilters.size > 0 && !zoneReasonFilters.has(reason)) return false;
    return true;
}

function passRuralFilters(row) {
    if (!row) return false;
    // normalized 'Region' key
    if (String(row.Region).trim() !== "Rural") return false; 
    const zone = String(row.Zone || "N/A");
    const reason = String(row["Call Reason"] || "N/A");
    if (ruralZoneFilters.size > 0 && !ruralZoneFilters.has(zone)) return false;
    if (ruralReasonFilters.size > 0 && !ruralReasonFilters.has(reason)) return false;
    return true;
}

function computeTotalsForDateArray(dateArray, filterFunc = passFilters) {
    let totals = 0;
    let uniquesSet = new Set();
    for (const d of dateArray) {
        const group = rawData[d] || {};
        for (const docKey in group) {
            const row = group[docKey];
            if (!filterFunc(row)) continue;
            totals++;
            uniquesSet.add(getCallerId(row, docKey));
        }
    }
    return { tot: totals, uniqueCount: uniquesSet.size, days: dateArray.length };
}

function computeRegionAggregatesForDates(region, dateArray) {
    let tot = 0, uniqSet = new Set();
    for (const d of dateArray) {
        const group = rawData[d] || {};
        for (const docKey in group) {
            const row = group[docKey];
            // Uses normalized 'Region' key
            if (!row || String(row.Region || 'N/A') !== region) continue; 
            if (!passFilters(row)) continue;
            tot++; uniqSet.add(getCallerId(row, docKey));
        }
    }
    return { tot, uniq: uniqSet.size };
}

function computeZoneAggregates(keyValue, dateArray, filterFunc = passZoneFilters) {
    let tot = 0, uniqSet = new Set();
    for (const dStr of dateArray) {
        const group = rawData[dStr] || {};
        for (const docKey in group) {
            const row = group[docKey];
            // normalized 'Zone' key
            if (!row || String(row.Zone || 'N/A') !== keyValue) continue; 
            if (!filterFunc(row)) continue;
            tot++; uniqSet.add(getCallerId(row, docKey));
        }
    }
    return { tot, uniq: uniqSet.size };
}

function computeDailyUniqueCount(dateStr, filterFunc) {
    const dailyUniqueSet = new Set();
    const group = rawData[dateStr] || {};
    for (const docKey in group) {
        const row = group[docKey];
        if (!row || !filterFunc(row)) continue;
        dailyUniqueSet.add(getCallerId(row, docKey));
    }
    return dailyUniqueSet.size;
}

/* ---------------- Load client base CSV ---------------- */
function loadClientBase() {
    return new Promise((resolve, reject) => {
        Papa.parse(CLIENT_BASE_CSV_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete(results) {
                if (results.data && Array.isArray(results.data)) {
                    clientBaseMap = {};
                    clientBaseMapNormalized = {};
                    results.data.forEach(row => {
                        const zoneKey = row.Zone !== undefined ? String(row.Zone).trim() : (row.Region !== undefined ? String(row.Region).trim() : 'N/A');
                        const count = Number(row.ClientBaseCount) || Number(row.Client_Count) || 0;
                        const safeCount = Number.isFinite(count) ? Math.round(count) : 0;
                        clientBaseMap[zoneKey] = safeCount;
                        clientBaseMapNormalized[normalizeKey(zoneKey)] = safeCount;
                    });
                    resolve();
                } else {
                    reject(new Error("Failed to parse client_count.csv or it's empty."));
                }
            },
            error(err) { reject(err); }
        });
    });
}

/* ---------------- RENDER (Main, Zone, Rural)---------------- */
// --- Main Render ---
function render() {
    const datesAvailable = Object.keys(rawData).sort();
    if (datesAvailable.length === 0) {
        if (summaryTableContainer) summaryTableContainer.innerHTML = "<p style='padding:12px'>No call data available.</p>";
        createOrUpdateMainChart([], [], []);
        updateChipVisuals();
        renderZoneSection(); 
        renderRuralZoneSection(); 
        return;
    }

    const allDates = datesAvailable;
    const N = 7; 
    const currentFilteredDates = getFilteredDates(dateFilters.main, N); 
    const lastDates = currentFilteredDates;

    const prevDates = getPreviousPeriodDates(lastDates, allDates);

    const latestDateStr = lastDates[lastDates.length - 1];
    if (!latestDateStr) { }
    const [latestYear, latestMonth] = latestDateStr ? latestDateStr.split('-').map(Number) : [0, 0];
    const mtdDates = allDates.filter(d => { const [y, m] = d.split('-').map(Number); return y === latestYear && m === latestMonth; });
    
    const cwaText = (dateFilters.main.start && dateFilters.main.end) ? 'CFA' : 'CWA';
    const pwaText = (dateFilters.main.start && dateFilters.main.end) ? 'PBA' : 'PWA';

    const regionsSet = new Set(allAvailableRegions);
    const perRegion = {};
    for (const r of Array.from(regionsSet)) {
        const normalized = normalizeKey(r);
        const cb = clientBaseMapNormalized[normalized];
        perRegion[r] = { 
            clientBase: Number.isFinite(cb) ? cb : 0, 
            dailyTotals: lastDates.map(() => 0), 
            dailyUniques: lastDates.map(() => 0) 
        };
    }

    for (let i = 0; i < lastDates.length; i++) {
        const d = lastDates[i];
        const group = rawData[d] || {};
        const perRegionUniqueSets = {};
        for (const rKey in perRegion) perRegionUniqueSets[rKey] = new Set();
        for (const docKey in group) {
            const row = group[docKey];
            if (!row || !passFilters(row)) continue;
            const reg = String(row.Region || 'N/A');
            const caller = getCallerId(row, docKey);
            if (perRegion[reg]) {
                perRegion[reg].dailyTotals[i] += 1;
                perRegionUniqueSets[reg].add(caller);
            }
        }
        for (const rKey in perRegion) perRegion[rKey].dailyUniques[i] = perRegionUniqueSets[rKey].size;
    }

    const grandTotals = lastDates.map((_, i) => Object.values(perRegion).reduce((sum, r) => sum + r.dailyTotals[i], 0));
    const grandUniqueTotals = lastDates.map((_, i) => {
        // Correctly calculate grand unique totals across all regions for the day
        const dailyUniqueSet = new Set();
        const d = lastDates[i];
        const group = rawData[d] || {};
        for(const docKey in group){
            const row = group[docKey];
            if(!row || !passFilters(row)) continue;
            dailyUniqueSet.add(getCallerId(row, docKey));
        }
        return dailyUniqueSet.size;
    });

    const currentWeekAgg = computeTotalsForDateArray(lastDates);
    const prevWeekAgg = computeTotalsForDateArray(prevDates);
    const mtdAgg = computeTotalsForDateArray(mtdDates);

    const repeatRatios = grandTotals.map((t, i) => { const u = grandUniqueTotals[i] || 0; return u > 0 ? (t / u).toFixed(2) : '-'; });
    const repeatPct = grandTotals.map((t, i) => { const u = grandUniqueTotals[i] || 0; return t > 0 ? Math.round((1 - (u / t)) * 100) + '%' : '-'; });

    function buildTableHtml() {
        const thDates = lastDates.map(d => {
            const [y, m, day] = d.split('-');
            return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });

        let html = `

            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter table-sm card-table table-striped text-nowrap">
                        <thead>
                            <tr class="text-uppercase text-muted" style="font-size: 0.7rem; letter-spacing: 0.02em;">
                                <th class="py-3">Total Call</th>
                                <th class="py-3">Type</th>
                                <th class="py-3">Client<br><span class="text-lowercase fw-normal">base</span></th>
                                <th class="py-3 col-base-pct">% age of<br><span class="text-lowercase fw-normal">base (mtd)</span></th>
                                <th class="py-3 text-center">MTD Avg</th>
                                <th class="py-3 text-center">${pwaText}</th>
                                <th class="py-3 text-center">${cwaText}</th>`;

                for (const hd of thDates) {
                    // Added text-center and vertical padding to match your image
                    html += `<th class="text-center py-3" style="font-size: 0.7rem;">${hd}</th>`;
                }

                html += `
                            </tr>
                        </thead>
                        <tbody style="font-size: 0.80rem;">`;

        const defaultOrder = ['Urban', 'Rural', 'N/A'];
        const regionOrder = [...defaultOrder, ...Array.from(regionsSet).filter(r => !defaultOrder.includes(r))];
        const today = new Date();

        for (const r of regionOrder) {
            if (!perRegion[r]) continue;
            const clientBase = perRegion[r].clientBase;
            
            const regionMtd = computeRegionAggregatesForDates(r, mtdDates);
            const prevWeekUniqueAgg = computeRegionAggregatesForDates(r, prevDates);
            const currentWeekUniqueAgg = computeRegionAggregatesForDates(r, lastDates);

            let mtdSumUniq = 0, mtdDays = 0;
            for (const dStr of mtdDates) {
                const [yy, mm, dd] = dStr.split('-');
                const dObj = new Date(yy, parseInt(mm) - 1, dd);
                if (dObj >= today) continue;
                const group = rawData[dStr] || {};
                const uniqSet = new Set();
                for (const docKey in group) {
                    const row = group[docKey];
                    if (!row || !passFilters(row) || String(row.Region || 'N/A') !== r) continue;
                    uniqSet.add(getCallerId(row, docKey));
                }
                mtdSumUniq += uniqSet.size;
                mtdDays++;
            }
            const mtdAvgUniq = mtdDays > 0 ? (mtdSumUniq / mtdDays) : 0;

            let percentOfBase = '-';
            if (clientBase > 0) {
                const pct = (mtdAvgUniq / clientBase) * 100;
                percentOfBase = Number.isFinite(pct) ? (pct.toFixed(1) + '%') : '-';
            }

            const mtdAvg = Math.round(regionMtd.tot / Math.max(1, mtdDates.length));
            const prevAvg = prevDates.length > 0 ? Math.round(prevWeekUniqueAgg.tot / prevDates.length) : 0;
            const curAvg = lastDates.length > 0 ? Math.round(currentWeekUniqueAgg.tot / lastDates.length) : 0;

            const mtdUniqAvg = Math.round(regionMtd.uniq / Math.max(1, mtdDates.length));
            const prevUniqAvg = prevDates.length > 0 ? Math.round(prevWeekUniqueAgg.uniq / prevDates.length) : 0;
            const curUniqAvg = lastDates.length > 0 ? Math.round(currentWeekUniqueAgg.uniq / lastDates.length) : 0;

            html += `<tr><td class="zone">${formatRegionName(r)}</td><td>Total</td><td>${clientBase}</td><td class="muted col-base-pct">${percentOfBase}</td><td>${mtdAvg}</td><td>${prevAvg}</td><td>${curAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perRegion[r].dailyTotals[i]}</td>`;
            html += `</tr>`;

            html += `<tr class="row-unique"><td class="zone"></td><td>Unique</td><td></td><td class="col-base-pct"></td><td>${mtdUniqAvg}</td><td>${prevUniqAvg}</td><td>${curUniqAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perRegion[r].dailyUniques[i]}</td>`;
            html += `</tr>`;
        }

        const grandBase = Object.values(perRegion).reduce((s, r) => s + r.clientBase, 0);
        const grandMtdAvg = mtdAgg.days > 0 ? Math.round(mtdAgg.tot / mtdAgg.days) : 0;
        const grandPrevAvg = prevWeekAgg.days > 0 ? Math.round(prevWeekAgg.tot / prevWeekAgg.days) : 0;
        const grandCurAvg = currentWeekAgg.days > 0 ? Math.round(currentWeekAgg.tot / currentWeekAgg.days) : 0;

        const grandMtdUniqAvg = mtdAgg.days > 0 ? Math.round(mtdAgg.uniqueCount / mtdAgg.days) : 0;
        const grandPrevUniqAvg = prevWeekAgg.days > 0 ? Math.round(prevWeekAgg.uniqueCount / prevWeekAgg.days) : 0;
        const grandCurUniqAvg = currentWeekAgg.days > 0 ? Math.round(currentWeekAgg.uniqueCount / currentWeekAgg.days) : 0;

        html += `<tr class="bg-blue-lt fw-normal"><td>Grand Total</td><td>Total</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdAvg}</td><td>${grandPrevAvg}</td><td>${grandCurAvg}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandTotals[i]}</td>`;
        html += `</tr>`;

        html += `<tr class="bg-yellow-lt fw-normal"><td>Grand Total</td><td>Unique</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdUniqAvg}</td><td>${grandPrevUniqAvg}</td><td>${grandCurUniqAvg}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandUniqueTotals[i]}</td>`;
        html += `</tr>`;

        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call Ratio</td>`;

        for (let i = 0; i < repeatRatios.length; i++) {
        html += `<td class="${rcrRatioClass(repeatRatios[i])}">${repeatRatios[i]}</td>`;
        }

        html += `</tr>`;


        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call %</td>`;

        for (let i = 0; i < repeatPct.length; i++) {
        html += `<td class="${rcrClass(repeatPct[i])}">${repeatPct[i]}</td>`;
        }

        html += `</tr>`;


                html += `</tbody></table></div>`;
                return html;
    }

    if (summaryTableContainer) summaryTableContainer.innerHTML = buildTableHtml();

    const chartLabels = lastDates.map(d => {
        const [y, m, day] = d.split('-');
        return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });
    createOrUpdateMainChart(chartLabels, grandTotals, grandUniqueTotals);

    if (regionChips && regionChips.children.length !== allAvailableRegions.length) {
        regionChips.innerHTML = "";
        for (const r of allAvailableRegions) {
            const chip = document.createElement("div");
            chip.className = "chip off";
            chip.dataset.type = "region";
            chip.dataset.value = r;
            chip.textContent = r;
            chip.onclick = () => { filters.regions.clear(); filters.regions.add(r); render(); };
            regionChips.appendChild(chip);
        }
    }

    if (reasonChips && reasonChips.children.length !== allAvailableReasons.length) {
        reasonChips.innerHTML = "";
        for (const reason of allAvailableReasons) {
            const chip = document.createElement("div");
            chip.className = "chip off";
            chip.dataset.type = "reason";
            chip.dataset.value = reason;
            chip.textContent = reason;
            chip.onclick = () => { filters.reasons.clear(); filters.reasons.add(reason); render(); };
            reasonChips.appendChild(chip);
        }
    }

    renderZoneSection();
    renderRuralZoneSection();

    updateChipVisuals();
}

/*
// --- Update Page Title with Date Range ---
function updatePageTitle() {
    let title = "Call Analytics";

    if (dateFilters.main.start && dateFilters.main.end) {
        const format = { day: 'numeric', month: 'short', year: 'numeric' };
        const from = dateFilters.main.start.toLocaleDateString(undefined, format);
        const to   = dateFilters.main.end.toLocaleDateString(undefined, format);
        title += ` • ${from} – ${to}`;
    } else {
        title += " • Last 7 Days";
    }

    document.title = title;
}

updatePageTitle();
*/

// --- Zone Render (Urban) ---
function renderZoneSection() {
    const datesAvailable = Object.keys(rawData).sort();
    if (datesAvailable.length === 0) {
        if (zoneSummaryTableContainer) zoneSummaryTableContainer.innerHTML = "<p style='padding:12px'>No zone data available.</p>";
        createOrUpdateZoneChart([], [], []);
        return;
    }

    const allDates = datesAvailable;
    const N = 7;
    const currentFilteredDates = getFilteredDates(dateFilters.zone, N);
    const lastDates = currentFilteredDates;
    const prevDates = getPreviousPeriodDates(lastDates, allDates);

    const latestDateStr = lastDates[lastDates.length - 1];
    const [latestYear, latestMonth] = latestDateStr ? latestDateStr.split('-').map(Number) : [0, 0];
    const mtdDates = allDates.filter(d => {
        const [y, m] = d.split('-').map(Number);
        return y === latestYear && m === latestMonth;
    });

    const cwaText = (dateFilters.zone.start && dateFilters.zone.end) ? 'CFA' : 'CWA';
    const pwaText = (dateFilters.zone.start && dateFilters.zone.end) ? 'PBA' : 'PWA';

    const today = new Date();
    const perZone = {};

    // Initialize per-zone structure
    for (const z of zonesOfInterest) {
        const normalized = normalizeKey(z);
        const cb = clientBaseMapNormalized[normalized];
        perZone[z] = {
            clientBase: Number.isFinite(cb) ? cb : 0,
            dailyTotals: lastDates.map(() => 0),
            dailyUniques: lastDates.map(() => 0)
        };
    }

    // Fill daily totals and uniques per zone
    for (let i = 0; i < lastDates.length; i++) {
        const d = lastDates[i];
        const group = rawData[d] || {};
        const uniqueSets = {};
        for (const z of zonesOfInterest) uniqueSets[z] = new Set();

        for (const docKey in group) {
            const row = group[docKey];
            if (!row || !passZoneFilters(row)) continue;
            const zoneVal = String(row.Zone || 'N/A');
            if (!zonesOfInterest.includes(zoneVal)) continue;

            perZone[zoneVal].dailyTotals[i]++;
            uniqueSets[zoneVal].add(getCallerId(row, docKey));
        }
        for (const z of zonesOfInterest) {
            perZone[z].dailyUniques[i] = uniqueSets[z].size;
        }
    }

    // Grand Totals (sum of totals across all urban zones)
    const grandTotals = lastDates.map((_, i) =>
        zonesOfInterest.reduce((sum, z) => sum + (perZone[z]?.dailyTotals[i] || 0), 0)
    );

    // Grand Uniques (real unique across all urban zones - no summing!)
    const grandUniques = lastDates.map((_, i) => {
        const dailySet = new Set();
        const d = lastDates[i];
        const group = rawData[d] || {};
        for (const docKey in group) {
            const row = group[docKey];
            if (!row || !passZoneFilters(row)) continue;
            if (!zonesOfInterest.includes(String(row.Zone || 'N/A'))) continue;
            dailySet.add(getCallerId(row, docKey));
        }
        return dailySet.size;
    });

    // MTD / PWA / CWA aggregates only for urban zones
    const urbanOnlyFilter = (row) => {
        if (!row) return false;
        const zone = String(row.Zone || 'N/A');
        return zonesOfInterest.includes(zone) && passZoneFilters(row);
    };

    const mtdAgg = computeTotalsForDateArray(mtdDates, urbanOnlyFilter);
    const prevAgg = computeTotalsForDateArray(prevDates, urbanOnlyFilter);
    const curAgg = computeTotalsForDateArray(lastDates, urbanOnlyFilter);

    const grandMtdAvg = mtdAgg.days > 0 ? Math.round(mtdAgg.tot / mtdAgg.days) : 0;
    const grandPrevAvg = prevAgg.days > 0 ? Math.round(prevAgg.tot / prevAgg.days) : 0;
    const grandCurAvg = curAgg.days > 0 ? Math.round(curAgg.tot / curAgg.days) : 0;

    const grandMtdUniqAvg = mtdAgg.days > 0 ? Math.round(mtdAgg.uniqueCount / mtdAgg.days) : 0;
    const grandPrevUniqAvg = prevAgg.days > 0 ? Math.round(prevAgg.uniqueCount / prevAgg.days) : 0;
    const grandCurUniqAvg = curAgg.days > 0 ? Math.round(curAgg.uniqueCount / curAgg.days) : 0;

    const grandBase = zonesOfInterest.reduce((s, z) => s + (perZone[z]?.clientBase || 0), 0);

    // Rebuild available reasons based on current zone filter
    const currentReasons = new Set();
    for (const date in rawData) {
        const day = rawData[date];
        for (const id in day) {
            const row = day[id];
            if (!row) continue;
            const zone = String(row.Zone || 'N/A');
            if (zoneFilters.size > 0 && !zoneFilters.has(zone)) continue;
            if (zonesOfInterest.includes(zone)) {
                currentReasons.add(String(row["Call Reason"] || 'N/A'));
            }
        }
    }
    allAvailableZoneReasons = Array.from(currentReasons).sort();

    function buildZoneTableHtml() {
        const thDates = lastDates.map(d => {
            const [y, m, day] = d.split('-');
            return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });

                let html = `

            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter table-sm card-table table-striped text-nowrap">
                        <thead>
                            <tr class="text-uppercase text-muted" style="font-size: 0.7rem; letter-spacing: 0.02em;">
                                <th class="py-3">Total Call</th>
                                <th class="py-3">Type</th>
                                <th class="py-3">Client<br><span class="text-lowercase fw-normal">base</span></th>
                                <th class="py-3 col-base-pct">% age of<br><span class="text-lowercase fw-normal">base (mtd)</span></th>
                                <th class="py-3 text-center">MTD Avg</th>
                                <th class="py-3 text-center">${pwaText}</th>
                                <th class="py-3 text-center">${cwaText}</th>`;

                for (const hd of thDates) {
                    // Added text-center and vertical padding to match your image
                    html += `<th class="text-center py-3" style="font-size: 0.7rem;">${hd}</th>`;
                }

                html += `
                            </tr>
                        </thead>
                        <tbody style="font-size: 0.80rem;">`;

        for (const z of zonesOfInterest) {
            if (!perZone[z]) continue;
            const clientBase = perZone[z].clientBase;

            // MTD Unique Avg per zone (for % of base)
            let mtdSumUniq = 0, mtdDays = 0;
            for (const dStr of mtdDates) {
                const [yy, mm, dd] = dStr.split('-');
                const dObj = new Date(yy, parseInt(mm) - 1, dd);
                if (dObj >= today) continue;
                const count = computeDailyUniqueCount(dStr, row => {
                    return String(row.Zone || 'N/A') === z && passZoneFilters(row);
                });
                mtdSumUniq += count;
                mtdDays++;
            }
            const mtdAvgUniq = mtdDays > 0 ? (mtdSumUniq / mtdDays) : 0;
            const percentOfBase = clientBase > 0 ? (mtdAvgUniq / clientBase * 100).toFixed(1) + '%' : '-';

            const zoneMtd = computeZoneAggregates(z, mtdDates, passZoneFilters);
            const zonePrev = computeZoneAggregates(z, prevDates, passZoneFilters);
            const zoneCur = computeZoneAggregates(z, lastDates, passZoneFilters);

            const mtdAvg = Math.round(zoneMtd.tot / Math.max(1, mtdDates.length));
            const prevAvg = prevDates.length > 0 ? Math.round(zonePrev.tot / prevDates.length) : 0;
            const curAvg = lastDates.length > 0 ? Math.round(zoneCur.tot / lastDates.length) : 0;

            const mtdUniqAvg = Math.round(zoneMtd.uniq / Math.max(1, mtdDates.length));
            const prevUniqAvg = prevDates.length > 0 ? Math.round(zonePrev.uniq / prevDates.length) : 0;
            const curUniqAvg = lastDates.length > 0 ? Math.round(zoneCur.uniq / lastDates.length) : 0;

            html += `<tr><td class="zone">${z}</td><td>Total</td><td>${clientBase}</td><td class="muted col-base-pct">${percentOfBase}</td><td>${mtdAvg}</td><td>${prevAvg}</td><td>${curAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perZone[z].dailyTotals[i]}</td>`;
            html += `</tr>`;

            html += `<tr class="row-unique"><td class="zone"></td><td>Unique</td><td></td><td class="col-base-pct"></td><td>${mtdUniqAvg}</td><td>${prevUniqAvg}</td><td>${curUniqAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perZone[z].dailyUniques[i]}</td>`;
            html += `</tr>`;
        }

        // GRAND TOTALS 
        html += `<tr class="bg-blue-lt fw-normal"><td>Grand Total</td><td>Total</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdAvg}</td><td>${grandPrevAvg}</td><td>${grandCurAvg}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandTotals[i]}</td>`;
        html += `</tr>`;

        html += `<tr class="bg-yellow-lt fw-normal"><td>Grand Total</td><td>Unique</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdUniqAvg}</td><td>${grandPrevUniqAvg}</td><td>${grandCurUniqAvg}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandUniques[i]}</td>`;
        html += `</tr>`;

        // Repeat ratios
        const ratios = grandTotals.map((t, i) => {
            const u = grandUniques[i] || 0;
            return u > 0 ? (t / u).toFixed(2) : '-';
        });
        const pct = grandTotals.map((t, i) => {
            const u = grandUniques[i] || 0;
            return t > 0 ? Math.round((1 - u / t) * 100) + '%' : '-';
        });

        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call Ratio</td>`;

        for (const r of ratios) {
        html += `<td class="${rcrRatioClass(r)}">${r}</td>`;
        }

        html += `</tr>`;


        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call %</td>`;

        for (const p of pct) {
        html += `<td class="${rcrPctClass(p)}">${p}</td>`;
        }

        html += `</tr></tbody></table></div>`;

        return html;

    }

    if (zoneSummaryTableContainer) zoneSummaryTableContainer.innerHTML = buildZoneTableHtml();

    // Chart - now shows correct urban-only data
    const chartLabels = lastDates.map(d => {
        const [y, m, day] = d.split('-');
        return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });

    createOrUpdateZoneChart(chartLabels, grandTotals, grandUniques);

    // Rebuild zone & reason chips
    if (zoneChips && zoneChips.children.length !== zonesOfInterest.length) {
        zoneChips.innerHTML = "";
        for (const z of zonesOfInterest) {
            const chip = document.createElement("div");
            chip.className = zoneFilters.has(z) ? "chip selected" : "chip off";
            chip.dataset.value = z;
            chip.textContent = z;
            chip.onclick = () => { zoneFilters.clear(); zoneFilters.add(z); renderZoneSection(); };
            zoneChips.appendChild(chip);
        }
    }

    if (zoneReasonChips) {
        zoneReasonChips.innerHTML = '';
        for (const reason of allAvailableZoneReasons) {
            const chip = document.createElement('div');
            chip.className = zoneReasonFilters.has(reason) ? 'chip selected' : 'chip off';
            chip.dataset.value = reason;
            chip.textContent = reason;
            chip.onclick = () => {
                zoneReasonFilters.clear();
                zoneReasonFilters.add(reason);
                renderZoneSection();
            };
            zoneReasonChips.appendChild(chip);
        }
    }

    updateChipVisuals();
}

// --- Rural Render (Top-20) ---
function renderRuralZoneSection() {
    const datesAvailable = Object.keys(rawData).sort();
    if (!datesAvailable.length) {
        if (ruralSummaryTableContainer) ruralSummaryTableContainer.innerHTML = "<p style='padding:12px'>No rural data available.</p>";
        createOrUpdateRuralZoneChart([], [], []);
        if (ruralZoneQuickStats) ruralZoneQuickStats.innerHTML = "";
        updateRuralChipVisuals();
        return;
    }

    const allDates = datesAvailable;
    const N = 7;
    const currentFilteredDates = getFilteredDates(dateFilters.rural, N);
    const lastDates = currentFilteredDates;
    
    const prevDates = getPreviousPeriodDates(lastDates, allDates);

    const latestDateStr = lastDates[lastDates.length - 1];
    const [latestYear, latestMonth] = latestDateStr ? latestDateStr.split('-').map(Number) : [0, 0];
    const mtdDates = allDates.filter(d => { const [y, m] = d.split('-').map(Number); return y === latestYear && m === latestMonth; });
    
    const cwaText = (dateFilters.rural.start && dateFilters.rural.end) ? 'CFA' : 'CWA';
    const pwaText = (dateFilters.rural.start && dateFilters.rural.end) ? 'PBA' : 'PWA';

    const today = new Date();
    const perZone = {};
    for (const z of allRuralZones) {
        const normalized = normalizeKey(z);
        const cb = clientBaseMapNormalized[normalized];
        perZone[z] = { 
            clientBase: Number.isFinite(cb) ? cb : 0, 
            dailyTotals: lastDates.map(() => 0), 
            dailyUniques: lastDates.map(() => 0) 
        };
    }

    const zoneMtdTotals = {};
    for (const z of allRuralZones) zoneMtdTotals[z] = 0;
    for (const d of mtdDates) {
        const group = rawData[d] || {};
        for (const docKey in group) {
            const row = group[docKey];
            if (!row) continue;
            if (String(row.Region).trim() === "Rural") {
                const z = String(row.Zone || "N/A");
                zoneMtdTotals[z] = (zoneMtdTotals[z] || 0) + 1;
            }
        }
    }

    const top20Zones = Object.entries(zoneMtdTotals)
        .sort((a,b) => b[1] - a[1])
        .slice(0,20)
        .map(([z]) => z);
        
    for (let i = 0; i < lastDates.length; i++) {
        const d = lastDates[i];
        const group = rawData[d] || {};
        for (const z of allRuralZones) {
            perZone[z].dailyTotals[i] = 0;
            perZone[z].dailyUniques[i] = 0;
        }
        const uniqueSets = {};
        for (const z of allRuralZones) uniqueSets[z] = new Set();
        
        for (const docKey in group) {
            const row = group[docKey];
            if (!row || !passRuralFilters(row)) continue;
            const z = String(row.Zone || "N/A");
            const caller = getCallerId(row, docKey);
            
            if (perZone[z]) {
                perZone[z].dailyTotals[i] += 1;
                uniqueSets[z].add(caller);
            }
        }
        for (const z of allRuralZones) perZone[z].dailyUniques[i] = uniqueSets[z].size;
    }

    const grandRuralAggMtdTop20 = computeTotalsForDateArray(mtdDates, (row) => top20Zones.includes(String(row.Zone)) && passRuralFilters(row));
    const grandRuralAggPrevTop20 = computeTotalsForDateArray(prevDates, (row) => top20Zones.includes(String(row.Zone)) && passRuralFilters(row));
    const grandRuralAggCurTop20 = computeTotalsForDateArray(lastDates, (row) => top20Zones.includes(String(row.Zone)) && passRuralFilters(row));

    function buildRuralTableHtml() {
        const thDates = lastDates.map(d => {
            const [y, m, day] = d.split('-');
            return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        });

                let html = `

            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter table-sm card-table table-striped text-nowrap">
                        <thead>
                            <tr class="text-uppercase text-muted" style="font-size: 0.7rem; letter-spacing: 0.02em;">
                                <th class="py-3">Total Call</th>
                                <th class="py-3">Type</th>
                                <th class="py-3">Client<br><span class="text-lowercase fw-normal">base</span></th>
                                <th class="py-3 col-base-pct">% age of<br><span class="text-lowercase fw-normal">base (mtd)</span></th>
                                <th class="py-3 text-center">MTD Avg</th>
                                <th class="py-3 text-center">${pwaText}</th>
                                <th class="py-3 text-center">${cwaText}</th>`;

                for (const hd of thDates) {
                    // Added text-center and vertical padding to match your image
                    html += `<th class="text-center py-3" style="font-size: 0.7rem;">${hd}</th>`;
                }

                html += `
                            </tr>
                        </thead>
                        <tbody style="font-size: 0.80rem;">`;

        const computeAggregatesRural = (zoneKey, dateArray) => {
            return computeZoneAggregates(zoneKey, dateArray, passRuralFilters);
        };

        for (let idx = 0; idx < top20Zones.length; idx++) {
            const z = top20Zones[idx];
            const clientBase = perZone[z]?.clientBase || 0;

            const mtdAgg = computeAggregatesRural(z, mtdDates);
            const prevAgg = prevDates.length ? computeAggregatesRural(z, prevDates) : { tot: 0, uniq: 0 };
            const curAgg = lastDates.length ? computeAggregatesRural(z, lastDates) : { tot: 0, uniq: 0 };

            let mtdSumUniq = 0, mtdDays = 0;
            for (const dStr of mtdDates) {
                const [yy, mm, dd] = dStr.split('-');
                const dObj = new Date(yy, parseInt(mm) - 1, dd);
                if (dObj >= today) continue;
                const group = rawData[dStr] || {};
                const uniq = new Set();
                for (const docKey in group) {
                    const row = group[docKey];
                    if (!row || !passRuralFilters(row) || String(row.Zone || "N/A") !== z) continue;
                    uniq.add(getCallerId(row, docKey));
                }
                mtdSumUniq += uniq.size;
                mtdDays++;
            }
            const mtdAvgUniq = mtdDays > 0 ? (mtdSumUniq / mtdDays) : 0;
            let percentOfBase = '-';
            if (clientBase > 0) {
                const pct = (mtdAvgUniq / clientBase) * 100;
                percentOfBase = Number.isFinite(pct) ? (pct.toFixed(1) + '%') : '-';
            }

            const mtdAvg = Math.round(mtdAgg.tot / Math.max(1, mtdDates.length));
            const prevAvg = prevDates.length > 0 ? Math.round(prevAgg.tot / prevDates.length) : 0;
            const curAvg = lastDates.length > 0 ? Math.round(curAgg.tot / lastDates.length) : 0;

            const mtdUniqAvg = Math.round(mtdAgg.uniq / Math.max(1, mtdDates.length));
            const prevUniqAvg = prevDates.length > 0 ? Math.round(prevAgg.uniq / prevDates.length) : 0;
            const curUniqAvg = lastDates.length > 0 ? Math.round(curAgg.uniq / lastDates.length) : 0;

            html += `<tr><td>${z}</td><td>Total</td><td>${clientBase}</td><td class="muted col-base-pct">${percentOfBase}</td><td>${mtdAvg}</td><td>${prevAvg}</td><td>${curAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perZone[z].dailyTotals[i]}</td>`;
            html += `</tr>`;

            html += `<tr class="row-unique"><td></td><td>Unique</td><td></td><td class="col-base-pct"></td><td>${mtdUniqAvg}</td><td>${prevUniqAvg}</td><td>${curUniqAvg}</td>`;
            for (let i = 0; i < lastDates.length; i++) html += `<td>${perZone[z].dailyUniques[i]}</td>`;
            html += `</tr>`;
        }

        const grandBase = top20Zones.reduce((s, z) => s + (perZone[z]?.clientBase || 0), 0);
        const grandTotals = lastDates.map((_, i) => top20Zones.reduce((s, z) => s + (perZone[z]?.dailyTotals[i] || 0), 0));
        const grandUniques = lastDates.map((_, i) => {
            // Correctly calculate grand unique totals across top 20 zones for the day
            const dailyUniqueSet = new Set();
            const d = lastDates[i];
            const group = rawData[d] || {};
            for(const docKey in group){
                const row = group[docKey];
                if(!row || !passRuralFilters(row) || !top20Zones.includes(String(row.Zone))) continue;
                dailyUniqueSet.add(getCallerId(row, docKey));
            }
            return dailyUniqueSet.size;
        });

        const grandMtdAvgTop20 = grandRuralAggMtdTop20.days > 0 ? Math.round(grandRuralAggMtdTop20.tot / grandRuralAggMtdTop20.days) : 0;
        const grandMtdUniqAvgTop20 = grandRuralAggMtdTop20.days > 0 ? Math.round(grandRuralAggMtdTop20.uniqueCount / grandRuralAggMtdTop20.days) : 0;
        
        const grandPrevAvgTop20 = grandRuralAggPrevTop20.days > 0 ? Math.round(grandRuralAggPrevTop20.tot / grandRuralAggPrevTop20.days) : 0;
        const grandPrevUniqAvgTop20 = grandRuralAggPrevTop20.days > 0 ? Math.round(grandRuralAggPrevTop20.uniqueCount / grandRuralAggPrevTop20.days) : 0;
        
        const grandCurAvgTop20 = grandRuralAggCurTop20.days > 0 ? Math.round(grandRuralAggCurTop20.tot / grandRuralAggCurTop20.days) : 0;
        const grandCurUniqAvgTop20 = grandRuralAggCurTop20.days > 0 ? Math.round(grandRuralAggCurTop20.uniqueCount / grandRuralAggCurTop20.days) : 0;

        html += `<tr class="bg-blue-lt fw-normal"><td>Grand Total</td><td>Total</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdAvgTop20}</td><td>${grandPrevAvgTop20}</td><td>${grandCurAvgTop20}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandTotals[i]}</td>`;
        html += `</tr>`;

        html += `<tr class="bg-yellow-lt fw-normal"><td>Grand Total</td><td>Unique</td><td>${grandBase}</td><td class="col-base-pct">-</td><td>${grandMtdUniqAvgTop20}</td><td>${grandPrevUniqAvgTop20}</td><td>${grandCurUniqAvgTop20}</td>`;
        for (let i = 0; i < lastDates.length; i++) html += `<td>${grandUniques[i]}</td>`;
        html += `</tr>`;

        const zoneRepeatRatios = grandTotals.map((t,i) => { const u = grandUniques[i] || 0; return u > 0 ? (t / u).toFixed(2) : '-'; });
        const zoneRepeatPct = grandTotals.map((t,i) => { const u = grandUniques[i] || 0; return t > 0 ? Math.round((1 - (u / t)) * 100) + '%' : '-'; });

        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call Ratio</td>`;

        for (let i = 0; i < zoneRepeatRatios.length; i++) {
        html += `<td class="${rcrRatioClass(zoneRepeatRatios[i])}">
                    ${zoneRepeatRatios[i]}
                </td>`;
        }

        html += `</tr>`;


        html += `<tr class="repeat">
        <td colspan="7" class="zone fw-semibold">Repeat Call %</td>`;

        for (let i = 0; i < zoneRepeatPct.length; i++) {
        html += `<td class="${rcrClass(zoneRepeatPct[i])}">
                    ${zoneRepeatPct[i]}
                </td>`;
        }

        html += `</tr>`;


        html += `</tbody></table></div>`;
        return html;
    }

    if (ruralSummaryTableContainer) ruralSummaryTableContainer.innerHTML = buildRuralTableHtml();

    const chartLabels = lastDates.map(d => {
        const [y, m, day] = d.split('-');
        return new Date(y, parseInt(m) - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });
    const chartTotals = lastDates.map((_, i) => top20Zones.reduce((s, z) => s + (perZone[z]?.dailyTotals[i] || 0), 0));
    const chartUniques = lastDates.map((_, i) => {
        const dailyUniqueSet = new Set();
        const d = lastDates[i];
        const group = rawData[d] || {};
        for(const docKey in group){
            const row = group[docKey];
            if(!row || !passRuralFilters(row) || !top20Zones.includes(String(row.Zone))) continue;
            dailyUniqueSet.add(getCallerId(row, docKey));
        }
        return dailyUniqueSet.size;
    });

    createOrUpdateRuralZoneChart(chartLabels, chartTotals, chartUniques);

    if (ruralZoneQuickStats) {
        const latestIdx = chartTotals.length - 1;
        const latestTotal = chartTotals[latestIdx] || 0;
        const latestUnique = chartUniques[latestIdx] || 0;
        ruralZoneQuickStats.innerHTML = `
            <div class="stat">Top zones: ${top20Zones.length}</div>
            <div class="stat">Total (${cwaText} Latest): <strong>${latestTotal}</strong></div>
            <div class="stat">Unique (${cwaText} Latest): <strong>${latestUnique}</strong></div>
            <div class="stat">Total Calls (MTD Top20): <strong>${grandRuralAggMtdTop20.tot}</strong></div>
        `;
    }

    if (ruralZoneChips && ruralZoneChips.children.length !== allRuralZones.length) {
        ruralZoneChips.innerHTML = "";
        for (const z of allRuralZones) {
            const chip = document.createElement("div");
            chip.className = ruralZoneFilters.has(z) ? "chip selected" : "chip off";
            chip.dataset.value = z;
            chip.textContent = z;
            chip.onclick = () => {
                ruralZoneFilters.clear();
                ruralZoneFilters.add(z);
                renderRuralZoneSection();
            };
            ruralZoneChips.appendChild(chip);
        }
    }

    if (ruralZoneReasonChips && ruralZoneReasonChips.children.length !== ruralReasons.length) {
        ruralZoneReasonChips.innerHTML = "";
        for (const reason of ruralReasons) {
            const chip = document.createElement("div");
            chip.className = ruralReasonFilters.has(reason) ? "chip selected" : "chip off";
            chip.dataset.value = reason;
            chip.textContent = reason;
            chip.onclick = () => {
                ruralReasonFilters.clear();
                ruralReasonFilters.add(reason);
                renderRuralZoneSection();
            };
            ruralZoneReasonChips.appendChild(chip);
        }
    }

    updateRuralChipVisuals();
}

/* ---------------- FLATPICKR INITIALIZATION (Kept as is) ---------------- */
// Helper function to initialize Flatpickr for a section with a clear button
function initDateFilterSystem(inputSelector, clearBtnSelector, filterSection, renderCallback) {
    // NOTE: This assumes flatpickr has been loaded via a script tag in the HTML.
    const fp = flatpickr(inputSelector, {
        mode: "range",
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            // Only update if we have a valid range (start and end)
            if (selectedDates.length === 2) {
                dateFilters[filterSection].start = selectedDates[0];
                dateFilters[filterSection].end = selectedDates[1];
                renderCallback();
            }
            // Handle clearing (if user deletes text manually or via API)
            if (selectedDates.length === 0) {
                dateFilters[filterSection].start = null;
                dateFilters[filterSection].end = null;
                renderCallback();
            }
        }
    });

    // Attach listener to the clear button
    const clearBtn = document.querySelector(clearBtnSelector);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            fp.clear(); // This triggers the onChange event with empty dates
        });
    }
}

/* ---------------- BUTTONS & START (Modified for static fetch) ---------------- */
if (clearFiltersBtn) clearFiltersBtn.onclick = () => { filters.regions.clear(); filters.reasons.clear(); render(); };
if (selectAllBtn) selectAllBtn.onclick = () => { filters.regions = new Set(allAvailableRegions); filters.reasons = new Set(allAvailableReasons); render(); };

if (clearZoneFiltersBtn) clearZoneFiltersBtn.onclick = () => { zoneFilters.clear(); zoneReasonFilters.clear(); renderZoneSection(); };
if (selectAllZoneBtn) selectAllZoneBtn.onclick = () => { zoneFilters = new Set(zonesOfInterest); zoneReasonFilters = new Set(allAvailableZoneReasons); renderZoneSection(); };

if (clearRuralFiltersBtn) clearRuralFiltersBtn.onclick = () => { ruralZoneFilters.clear(); ruralReasonFilters.clear(); renderRuralZoneSection(); };
if (selectAllRuralBtn) selectAllRuralBtn.onclick = () => { ruralZoneFilters = new Set(allRuralZones); ruralReasonFilters = new Set(ruralReasons); renderRuralZoneSection(); };


async function fetchDataAndProcess(){
    try {
        const res = await fetch(MASTER_DATA_URL);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        // Step 1: Parse the full JSON object
        const wrapperObject = await res.json(); 
        
        // Step 2: Extract the object containing call data grouped by date
        const callsByDate = wrapperObject.calls; 

        if (!callsByDate || typeof callsByDate !== 'object' || Array.isArray(callsByDate)) {
            throw new Error("JSON structure error: 'calls' object not found or is not the expected object format.");
        }
        
        // Step 3: Flatten the deeply nested objects into a single array of records
        let allCallRecords = [];
        for (const dateKey in callsByDate) {
            const dayRecords = callsByDate[dateKey];
            if (typeof dayRecords === 'object' && dayRecords !== null) {
                // Get all call objects for the day
                const records = Object.values(dayRecords); 
                allCallRecords = allCallRecords.concat(records);
            }
        }

        // Step 4: Normalize and group the data by date key (YYYY-MM-DD)
        rawData = normalizeFromRows(allCallRecords);
        
        buildFilterLists(rawData);
        
        // Initialize Date Pickers AND Clear Buttons
        initDateFilterSystem("#mainDateRange", "#clearMainDateBtn", "main", render);
        initDateFilterSystem("#zoneDateRange", "#clearZoneDateBtn", "zone", renderZoneSection);
        initDateFilterSystem("#ruralDateRange", "#clearRuralDateBtn", "rural", renderRuralZoneSection);

        render(); 
        
        if (statusText) statusText.textContent = ` ${Object.keys(rawData).length} dates.`;

    } catch (error) {
        console.error('Error fetching or processing JSON data:', error);
        if (statusText) statusText.textContent = `ERROR: Failed to load data. Check console. ${error.message}`;
    }
}


function start() {
    if (statusText) statusText.textContent = 'Loading client base data from CSV...';
    loadClientBase()
        .then(() => {
            if (statusText) statusText.textContent = 'Fetching call data from GitHub JSON...';
            // Start the static fetch process instead of Firebase onValue
            fetchDataAndProcess();
        })
        .catch(err => {
            if (statusText) statusText.textContent = `Error loading client_count.csv. Details: ${err.message}`;
            console.error("CSV Loading Error:", err);
        });
}

//document.getElementById('lastUpdated').textContent = new Date().toLocaleString();

start();

// export for debugging (optional)
window.__dashboard = {
  fetchDataAndProcess,
  rawData,
  charts: { chart, zoneChart, ruralZoneChart }
};


function rcrRatioClass(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'text-muted';

  if (num >= 1.30) return 'text-red fw-semibold';
  if (num >= 1.20) return 'text-orange';
  return 'text-muted';
}


function rcrClass(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'text-muted';

  if (num > 20) return 'text-red fw-semibold';
  if (num > 12) return 'text-orange';
  return 'text-muted';
}

function rcrPctClass(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'text-muted';

  if (num > 20) return 'text-red fw-semibold';
  if (num > 12) return 'text-orange';
  return 'text-muted';
}




