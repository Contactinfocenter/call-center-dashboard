// 1. Setup
const SUPABASE_URL = "https://ubonrsjbcvzpoizmidlw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5HdtgopObCBVHwqotJEQCw_ByDIyw8v";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedDate = null;
let dailyCache = null;
let trendCache = null;
let trendDateRange = null;
const chartInstances = {};

// 2. Data Fetching
async function fetchAndRefresh() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
        const filters = {
            p_region: getFilterValue('filterRegion'),
            p_zone: getFilterValue('filterZone'),
            p_status: getFilterValue('filterStatus'),
            p_call_reason: getFilterValue('filterCallReason'),
            p_client_type: getFilterValue('filterClientType')
        };

        // Fetch Trend Data
        const { data: trendData, error: trendErr } = await supabaseClient.rpc('dashboard_analytics', {
            ...filters,
            p_start_date: '2024-01-01',
            p_end_date: new Date().toISOString().split('T')[0]
        });

        if (trendErr) throw trendErr;
        trendCache = trendData;
        const availableDates = trendData.daily_trend.map(d => d.source_date);
        if (!selectedDate && availableDates.length) selectedDate = availableDates[availableDates.length - 1];

        // Fetch Daily Data
        const { data: dayData, error: dayErr } = await supabaseClient.rpc('dashboard_analytics', {
            ...filters,
            p_start_date: selectedDate,
            p_end_date: selectedDate
        });

        if (dayErr) throw dayErr;
        dailyCache = dayData;

        renderDashboard();
    } catch (err) {
        console.error("Supabase RPC Error Details:", err.message, err.details, err.hint);
        alert("Data Load Error: " + err.message);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// 3. Rendering
function renderDashboard() {
    if (!dailyCache || !trendCache) return;
    const s = dailyCache.summary;

    // KPIs
    document.getElementById('kpiTotalCalls').textContent = s.total_calls.toLocaleString();
    document.getElementById('kpiUniqueCallers').textContent = s.unique_callers.toLocaleString();
    document.getElementById('kpiActiveAgents').textContent = s.active_agents || 0;
    document.getElementById('kpiFCRPercent').textContent = s.total_calls > 0 ? Math.round((s.fcr_count/s.total_calls)*100)+'%' : '0%';
    document.getElementById('kpiAvgHandleTime').textContent = formatTime(s.avg_acht);

    // Charts
    renderHourlyChart();
    renderRegionPie();
    // Daily Butterfly
    renderButterfly('dayButterflyCallreason', dailyCache.reason_breakdown, 'call_reason');
    renderButterfly('dayBillingButterfly', dailyCache.billing_breakdown, 'billing_sub_reason');

    // Monthly Butterfly
    renderButterfly('monthButterflyCallreason', trendCache.monthly_reason_breakdown, 'call_reason');
    renderButterfly('monthBillingButterfly', trendCache.monthly_billing_breakdown, 'billing_sub_reason');
    
    renderTrendChart();

    renderMonthlyCharts();

    renderMonthOverMonthChart();
    renderFCRTrendChart();
    
    // Spikes & Badges
    renderSpikingReasons();
    renderWorstHourBadge();
    updateDateMirrors();
}

// 4. UI Components
function renderSpikingReasons() {
    const container = document.getElementById('spikesContainer');
    if (!container || !dailyCache.spikes) return;

    if (dailyCache.spikes.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <span class="badge bg-success-lt fw-bold p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline me-1" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                        <path d="M5 12l5 5l10 -10"></path>
                    </svg>
                    No significant spikes – smooth day!
                </span>
            </div>`;
        return;
    }

    let html = '';
    const topSpikes = dailyCache.spikes.slice(0, 4);

    topSpikes.forEach(spike => {
        const isUp = spike.diff > 0;
        const colorClass = isUp ? 'text-danger' : 'text-success';
        const badgeClass = isUp ? 'bg-danger-lt' : 'bg-success-lt';
        const pctText = spike.pct >= 1000 
            ? 'NEW' 
            : (spike.pct >= 0 ? '+' + spike.pct : spike.pct) + '%';

        const icon = isUp
            ? `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline ${colorClass}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M3 17l6 -6l4 4l8 -8"></path>
                    <path d="M14 7l7 0l0 7"></path>
               </svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline ${colorClass}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M3 7l6 6l4 -4l8 8"></path>
                    <path d="M14 17l7 0l0 -7"></path>
               </svg>`;

        html += `
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm shadow-none border">
                    <div class="card-body p-3">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <span class="avatar avatar-sm ${badgeClass}">
                                    ${icon}
                                </span>
                            </div>
                            <div class="col text-truncate">
                                <div class="d-flex align-items-center">
                                    <div class="h3 mb-0 fw-bold ${colorClass}">
                                        ${spike.today.toLocaleString()}
                                    </div>
                                    <span class="badge ${badgeClass} ms-2 fw-bold" style="font-size: 0.65rem;">
                                        ${pctText}
                                    </span>
                                </div>
                                <div class="text-secondary small text-truncate" title="${spike.call_reason}">
                                    ${spike.call_reason}
                                </div>
                                <div class="text-muted small mt-1">
                                    7d Avg: ${spike.avg_val}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    });

    container.innerHTML = html;
}


function renderWorstHourBadge() {
    let max = 0, hour = "00:00";
    (dailyCache.hourly || []).forEach(h => { if(h.total > max){ max = h.total; hour = h.hour.toString().padStart(2,'0')+":00"; }});
    document.getElementById('worstHourCalls').textContent = max;
    document.getElementById('worstHourBadge').textContent = hour;
}

// Helper Charts

function renderMonthlyCharts() {
    const hours = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ":00");
    const m = trendCache.monthly_averages; // Assuming trendCache holds the full RPC result

    // 1. Prepare Average Hourly Data
    const avgTotalArr = Array(24).fill(0);
    const avgUniqueArr = Array(24).fill(0);
    const avgAgentsArr = Array(24).fill(0);

    m.hourly_avg.forEach(h => {
        const idx = parseInt(h.hour);
        avgTotalArr[idx] = h.avg_total;
        avgUniqueArr[idx] = h.avg_unique;
        avgAgentsArr[idx] = h.avg_agents;
    });

    createAreaChart('avgHourlyChart', [
        { name: 'Avg Calls / Hour', data: avgTotalArr },
        { name: 'Avg Unique Callers', data: avgUniqueArr },
        { name: 'Avg Agents Online', data: avgAgentsArr }
    ], hours);

    // 2. Prepare Monthly Region Data
    const REGION_COLORS = ['#0088FE', '#00C49F', '#FFBB28'];
    const regionData = [
        { value: 0, name: 'Rural' },
        { value: 0, name: 'Urban' },
        { value: 0, name: 'N/A' }
    ];

    m.region_avg.forEach(r => {
        if (r.region === 'Rural') regionData[0].value = r.total;
        else if (r.region === 'Urban') regionData[1].value = r.total;
        else regionData[2].value += r.total;
    });

    createPieChart('monthRegionPie', regionData, REGION_COLORS);
}


function renderHourlyChart() {
    const hours = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ":00");
    const dayTotals = Array(24).fill(0);
    const dayUnique = Array(24).fill(0);
    const dayAgents = Array(24).fill(0);

    (dailyCache.hourly || []).forEach(h => {
        const idx = parseInt(h.hour);
        dayTotals[idx] = h.total;
        dayUnique[idx] = h.unique_callers;
        dayAgents[idx] = h.agents_online;
    });

    createAreaChart('lastDayHourlyChart', [
        { name: 'Total Calls', data: dayTotals },
        { name: 'Unique Callers', data: dayUnique },
        { name: 'Agents Online', data: dayAgents }
    ], hours);
}

function renderRegionPie() {
    
    const REGION_COLORS = ['#0088FE', '#00C49F', '#FFBB28']; 
    
    const regionMap = { 'Rural': 0, 'Urban': 0, 'N/A': 0 };
    (dailyCache.region_breakdown || []).forEach(r => {
        if (regionMap.hasOwnProperty(r.region)) regionMap[r.region] = r.total;
        else regionMap['N/A'] += r.total;
    });

    const data = [
        { value: regionMap.Rural, name: 'Rural' },
        { value: regionMap.Urban, name: 'Urban' },
        { value: regionMap['N/A'], name: 'N/A' }
    ];

    createPieChart('lastDayRegionPie', data, REGION_COLORS);
}

function renderButterfly(id, data, labelKey) {
    if (!data) return;

    const labels = data.map(i => i[labelKey] || 'Other');

    // Handle daily + monthly safely
    const volumes = data.map(i => 
        i.total ?? i.avg_total ?? 0
    );

    const achts = data.map(i => 
        Math.round(i.avg_acht ?? 0)
    );

    createButterflyChart(id, labels, achts, volumes);
}

function renderMonthButterflyReason() {
    if (!trendCache?.monthly_reason_breakdown) return;

    const data = trendCache.monthly_reason_breakdown;

    const labels = data.map(d => d.call_reason);
    const values = data.map(d => d.avg_total);

    createOrUpdateEChart(labels, values, null, 'monthButterflyCallreason');
}

function renderMonthButterflyBilling() {
    if (!trendCache?.monthly_billing_breakdown) return;

    const data = trendCache.monthly_billing_breakdown;

    const labels = data.map(d => d.billing_sub_reason);
    const values = data.map(d => d.avg_total);

    createOrUpdateEChart(labels, values, null, 'monthBillingButterfly');
}

function renderTrendChart() {

    const container = document.getElementById('callTrendChart');
    if (!container) return;

    let data = trendCache?.daily_trend || [];

    // ✅ Apply date range filter if selected
    if (trendDateRange?.start && trendDateRange?.end) {
        data = data.filter(d =>
            d.source_date >= trendDateRange.start &&
            d.source_date <= trendDateRange.end
        );
    } else {
        // Default: last 15 days
        data = data.slice(-15);
    }

    // ✅ Sort by date ascending
    data = data.sort((a, b) =>
        new Date(a.source_date) - new Date(b.source_date)
    );

    if (!data.length) {
        container.innerHTML =
            '<div class="text-center py-5 text-muted">No trend data available</div>';
        return;
    }

    const existing = echarts.getInstanceByDom(container);
    if (existing) existing.dispose();

    const chart = echarts.init(container);

    const labels = data.map(d =>
        new Date(d.source_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        })
    );

    const callCounts = data.map(d => d.total ?? 0);
    const avgAHT = data.map(d => d.avg_acht ?? 0);
    const fcrPercent = data.map(d => d.fcr_percent ?? 0);

    const option = {

        color: ['#3b82f6', '#f59e0b', '#10b981'],

        tooltip: {
            trigger: 'axis',
            confine: true,
            axisPointer: { type: 'shadow' },
            backgroundColor: '#fff',
            borderColor: '#e3e6ed',
            borderWidth: 1,
            formatter: function (params) {

                const title = params[0].name;

                const rows = params.map(p => {
                    const suffix =
                        p.seriesName.includes('FCR') ? '%' :
                        p.seriesName.includes('AHT') ? 's' : '';

                    return `
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
                            <strong>${p.value}${suffix}</strong>
                        </div>
                    `;
                }).join('');

                return `
                    <div style="min-width:160px">
                        <div style="
                            padding:8px 12px;
                            font-weight:600;
                            color:#1d273b;
                            border-bottom:1px solid #e6e7e9;
                        ">
                            ${title}
                        </div>
                        <div style="padding:8px 12px">
                            ${rows}
                        </div>
                    </div>
                `;
            }
        },

        legend: {
            top: 10,
            left: 'center',
            itemGap: 20,
            textStyle: { color: '#64748b', fontWeight: 500 }
        },

        grid: {
            top: 60,
            left: '6%',
            right: '8%',
            bottom: '18%',
            containLabel: true
        },

        xAxis: {
            type: 'category',
            data: labels,
            axisLine: { lineStyle: { color: '#e2e8f0' } },
            axisTick: { alignWithLabel: true },
            axisLabel: {
                color: '#64748b',
                fontSize: 11,
                rotate: 45,
                margin: 12
            }
        },

        yAxis: [
            {
                type: 'value',
                name: 'Calls',
                axisLine: { show: false },
                axisLabel: { color: '#3b82f6' },
                splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
            },
            {
                type: 'value',
                name: 'AHT / FCR',
                axisLine: { show: false },
                axisLabel: { color: '#64748b' },
                splitLine: { show: false }
            }
        ],

        series: [
            {
                name: 'Call Volume',
                type: 'bar',
                barWidth: '60%',
                itemStyle: {
                    borderRadius: [4, 4, 0, 0]
                },
                data: callCounts,
                yAxisIndex: 0
            },
            {
                name: 'Avg Handle Time (s)',
                type: 'line',
                smooth: 0.35,
                symbolSize: 7,
                lineStyle: { width: 3 },
                data: avgAHT,
                yAxisIndex: 1
            },
            {
                name: 'FCR %',
                type: 'line',
                smooth: 0.35,
                symbolSize: 7,
                lineStyle: { width: 3 },
                data: fcrPercent,
                yAxisIndex: 1
            }
        ]
    };

    chart.setOption(option);

    window.addEventListener('resize', () => chart.resize());
}

// 5. Chart Utilities UI

function hexToRgba(hex, opacity) {
    hex = hex.replace('#', '');

    if (hex.length === 3) {
        hex = hex.split('').map(x => x + x).join('');
    }

    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

//createAreaChart

function createAreaChart(id, series, cats) {

    if (chartInstances[id]) chartInstances[id].dispose();

    const el = document.getElementById(id);
    if (!el) return;

    const c = echarts.init(el);
    chartInstances[id] = c;

    const colors = ['#3874ff', '#10b981', '#f59e0b'];

    // Smart Y-axis padding
    let allValues = [];
    series.forEach(s => allValues = allValues.concat(s.data));
    const maxVal = Math.max(...allValues);
    const paddedMax = Math.ceil(maxVal * 1.15);

    // Value formatter (1.2k style)
    const formatValue = (val) => {
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
        return val;
    };

    c.setOption({

        color: colors,

        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#1e293b', fontSize: 12 },
            axisPointer: {
                type: 'line',
                lineStyle: {
                    color: '#94a3b8',
                    type: 'dashed'
                }
            },
            formatter: function (params) {
                                    // Tabler Header Style
                                    let html = `
                                        <div style="
                                            background: #f8fafc; 
                                            padding: 8px 12px;
                                            margin: -10px -12px 10px -12px;
                                            border-bottom: 1px solid #e6e7e9;
                                            border-radius: 4px 4px 0 0;
                                            display: flex;
                                            align-items: center;
                                            justify-content: space-between;
                                        ">
                                            <span style="
                                                font-size: 11px; 
                                                font-weight: 700; 
                                                color: #1d273b; 
                                                text-transform: uppercase; 
                                                letter-spacing: .04em;
                                            ">
                                                ${params[0].axisValue}
                                            </span>
                                            
                                        </div>
                                        <div style="padding: 0 4px;">
                                    `;

                                    // Tooltip Rows
                                    params.forEach(p => {
                                        html += `
                                            <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom: 4px;">
                                                <span style="display:flex; align-items:center; font-size: 12px; color: #667382;">
                                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${p.color}; margin-right:8px;"></span>
                                                    ${p.seriesName}
                                                </span>
                                                <span style="font-size: 12px; font-weight: 700; color: #1d273b;">
                                                    ${p.value.toLocaleString()}
                                                </span>
                                            </div>
                                        `;
                                    });

                                    html += `</div>`;
                                    return html;
                                }
        },

        legend: {
            top: 0,
            left: 0,
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 24,
            textStyle: {
                color: '#64748b',
                fontWeight: 600,
                fontSize: 12
            }
        },

        grid: {
            top: '15%',
            right: '3%',
            bottom: '10%',
            left: '3%',
            containLabel: true
        },

        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: cats,
            axisLine: {
                lineStyle: { color: '#e2e8f0' }
            },
            axisTick: { show: false },
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                fontWeight: 500
            }
        },

        yAxis: {
            type: 'value',
            max: paddedMax,
            axisLabel: {
                color: '#94a3b8',
                formatter: formatValue
            },
            splitLine: {
                lineStyle: {
                    color: '#f1f5f9',
                    type: 'dashed'
                }
            }
        },

        series: series.map((s, index) => {

            const mainColor = colors[index] || colors[0];

            return {
                name: s.name,
                type: 'line',
                data: s.data,
                smooth: 0.4,
                showSymbol: false,
                emphasis: { focus: 'series' },
                animationDuration: 700,
                animationEasing: 'cubicOut',
                lineStyle: {
                    width: 2.5,
                    color: mainColor
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: hexToRgba(mainColor, 0.18) },
                        { offset: 1, color: hexToRgba(mainColor, 0) }
                    ])
                }
            };
        })
    });

    window.addEventListener('resize', () => c.resize());
}

//createPieChart

function createPieChart(id, data, colors) {
    if (chartInstances[id]) chartInstances[id].dispose();

    const el = document.getElementById(id);
    if (!el || !data || data.length === 0) return;

    const chart = echarts.init(el);
    chartInstances[id] = chart;

    const total = data.reduce((sum, item) => sum + item.value, 0);

    const formatValue = (val) => {
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
        return val;
    };

    const option = {
        color: colors || ['#3b82f6', '#10b981', '#f59e0b'],
        tooltip: { trigger: 'item', formatter: '{b}<br/>Count: {c} ({d}%)'},
        legend: {
                    top: '5%',            // Moves it to the top
                    left: 'center',       // Keeps it centered horizontally
                    icon: 'circle',       // Matches your modern UI style
                    itemWidth: 10,
                    itemHeight: 10,
                    itemGap: 20,          // Adds space between legend items
                    textStyle: {
                        color: '#64748b',
                        fontWeight: 500,
                        fontSize: 12
                    }
                },
        series: [{
            type: 'pie',
            radius: ['55%', '78%'],
            avoidLabelOverlap: false,
            // 1. STYLE THE DEFAULT CENTER TEXT (TOTAL)
            label: {
                show: true,
                position: 'center',
                formatter: () => `{total|${formatValue(total)}}\n{name|Total}`,
                rich: {
                    total: { fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 30 },
                    name: { fontSize: 12, color: '#94a3b8' }
                }
            },
            // 2. STYLE THE HOVER TEXT (REPLACES TOTAL)
            emphasis: {
                label: {
                    show: true,
                    fontSize: 20,
                    fontWeight: 'bold',
                    formatter: (params) => `{value|${formatValue(params.value)}}\n{name|${params.name}}`,
                    rich: {
                        value: { fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 28 },
                        name: { fontSize: 12, color: '#94a3b8' }
                    }
                }
            },
            labelLine: { show: false },
            data: data
        }]
    };

    chart.setOption(option);

    // 3. THE MAGIC: Event Listeners to toggle visibility
    chart.on('mouseover', (params) => {
        chart.setOption({
            series: [{
                label: { show: false } // Hide the "Total" label
            }]
        });
    });

    chart.on('mouseout', () => {
        chart.setOption({
            series: [{
                label: { show: true } // Bring back the "Total" label
            }]
        });
    });

    chart.on('highlight', () => {
        chart.setOption({
            series: [{
                label: { show: false } 
            }]
        });
    });

    // This brings the "Total" back when nothing is being hovered/highlighted
    chart.on('downplay', () => {
        chart.setOption({
            series: [{
                label: { show: true }
            }]
        });
    });    

    window.addEventListener('resize', () => chart.resize());
}


function createButterflyChart(id, labels, left, right) {
    if (chartInstances[id]) chartInstances[id].dispose();

    const dom = document.getElementById(id);
    if (!dom) return;

    const chart = echarts.init(dom);
    chartInstances[id] = chart;

    chart.setOption({
        legend: {
            show: true,
            top: 0,
            left: 'left',
            icon: 'circle',
            itemGap: 30,
            textStyle: {
                color: '#9fa6bc',
                fontWeight: 700,
                fontSize: 11
            }
        },

        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },

        grid: {
            top: '15%',
            bottom: '2%',
            left: '3%',
            right: '3%',
            containLabel: true
        },

        xAxis: { type: 'value', show: false },

        yAxis: {
            type: 'category',
            data: labels,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                fontWeight: 700,
                color: '#9fa6bc',
                fontSize: 10,
                margin: 15
            }
        },

        series: [
            {
                name: 'ACHT',
                type: 'bar',
                stack: 'total',
                barWidth: 12,
                itemStyle: {
                    borderRadius: [4, 0, 0, 4],
                    color: '#f59e0b'
                },
                data: left.map(v => Math.abs(v)) // remove negative logic
            },
            {
                name: 'Vol',
                type: 'bar',
                stack: 'total',
                barWidth: 12,
                itemStyle: {
                    borderRadius: [0, 4, 4, 0],
                    color: '#3b82f6'
                },
                data: right
            }
        ]
    });

    window.addEventListener('resize', () => chart.resize());
}


function renderMonthOverMonthChart() {

  const chartDom = document.getElementById("monthOverMonthChart");
  if (!chartDom) return;

  const existing = echarts.getInstanceByDom(chartDom);
  if (existing) existing.dispose();

  const chart = echarts.init(chartDom);

  const data = trendCache?.daily_trend || [];
  if (!data.length) return;

  // ---- Group by Month ----
  const monthlyStats = {};

  data.forEach(d => {
    const [year, month] = d.source_date.split("-");
    const key = `${year}-${month}`;

    if (!monthlyStats[key]) {
      monthlyStats[key] = { calls: 0, achtSum: 0, days: 0 };
    }

    monthlyStats[key].calls += d.total ?? 0;
    monthlyStats[key].achtSum += (d.avg_acht ?? 0) * (d.total ?? 0);
    monthlyStats[key].days += 1;
  });

  const sortedMonths = Object.keys(monthlyStats).sort();

  const labels = sortedMonths.map(m => {
    const [y, mNum] = m.split("-");
    return new Date(y, mNum - 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const volumeData = sortedMonths.map(m =>
    Math.round(monthlyStats[m].calls / monthlyStats[m].days)
  );

  const ahtData = sortedMonths.map(m => {
    const avg = monthlyStats[m].calls > 0
      ? monthlyStats[m].achtSum / monthlyStats[m].calls
      : 0;
    return Math.round(avg);
  });

  const option = {
    color: ['#3874ff', '#ef4444'],
    tooltip: { trigger: 'axis' },
    legend: { top: '0%', left: 'center' },
    grid: { top: '15%', left: '5%', right: '5%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: [
      { type: 'value', name: 'Calls' },
      { type: 'value', name: 'AHT' }
    ],
    series: [
      {
        name: 'Avg Daily Calls',
        type: 'bar',
        barWidth: '35%',
        data: volumeData
      },
      {
        name: 'Avg AHT (sec)',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.4,
        data: ahtData
      }
    ]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

function renderFCRTrendChart() {

  const chartDom = document.getElementById("fcrTrendChart");
  if (!chartDom) return;

  const existing = echarts.getInstanceByDom(chartDom);
  if (existing) existing.dispose();

  const chart = echarts.init(chartDom);

  const data = trendCache?.daily_trend || [];
  if (!data.length) return;

  // ---- Group by Month ----
  const monthlyFCR = {};

  data.forEach(d => {
    const [year, month] = d.source_date.split("-");
    const key = `${year}-${month}`;

    if (!monthlyFCR[key]) {
      monthlyFCR[key] = { totalPercent: 0, days: 0 };
    }

    monthlyFCR[key].totalPercent += d.fcr_percent ?? 0;
    monthlyFCR[key].days += 1;
  });

  const sorted = Object.keys(monthlyFCR).sort();

  const labels = sorted.map(m => {
    const [y, mNum] = m.split("-");
    return new Date(y, mNum - 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const fcrPercent = sorted.map(m =>
    Math.round(monthlyFCR[m].totalPercent / monthlyFCR[m].days)
  );

  const option = {
    color: ['#10b981'],
    tooltip: { trigger: 'axis' },
    grid: { top: '10%', left: '5%', right: '5%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' }
    },
    series: [{
      name: 'FCR %',
      type: 'line',
      smooth: 0.4,
      showSymbol: false,
      data: fcrPercent
    }]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

function formatTime(s) {
    const m = Math.floor(s/60); const sec = Math.round(s%60);
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

function getFilterValue(id) {
    const el = document.getElementById(id);
    return (el && el.value !== 'All') ? el.value : null;
}

function updateDateMirrors() {
    document.querySelectorAll('.date-mirror').forEach(el => el.innerHTML = `<span class="badge bg-blue-lt">${selectedDate}</span>`);
}

// ===============================
// Trend Date Range Picker (Supabase Version)
// ===============================
const trendFp = flatpickr("#trendDateRangePicker", {
  mode: "range",
  dateFormat: "Y-m-d",
  maxDate: "today",

  onChange: (selectedDates) => {

    if (selectedDates.length === 2) {

      // ✅ LOCAL date extraction (timezone safe)
      const start = [
        selectedDates[0].getFullYear(),
        String(selectedDates[0].getMonth() + 1).padStart(2, '0'),
        String(selectedDates[0].getDate()).padStart(2, '0')
      ].join('-');

      const end = [
        selectedDates[1].getFullYear(),
        String(selectedDates[1].getMonth() + 1).padStart(2, '0'),
        String(selectedDates[1].getDate()).padStart(2, '0')
      ].join('-');

      trendDateRange = { start, end };

    } else {
      trendDateRange = null;
    }

    // 🔥 Re-render Supabase trend chart
    renderTrendChart();
    updateTrendRangeDisplay();
  }
});


// ===============================
// Reset Button
// ===============================
document
  .getElementById('btnResetTrendRange')
  ?.addEventListener('click', () => {

    trendDateRange = null;
    trendFp.clear();
    document.getElementById('trendDateRangePicker').value = '';

    renderTrendChart();
    updateTrendRangeDisplay();
  });

// 6. Init
document.addEventListener('DOMContentLoaded', () => {
    window.fp = flatpickr("#datePicker", { dateFormat: "Y-m-d", onChange: (d, str) => { selectedDate = str; fetchAndRefresh(); } });
    fetchAndRefresh();
    ['filterRegion', 'filterZone', 'filterStatus', 'filterCallReason', 'filterClientType'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', fetchAndRefresh);
    });
});