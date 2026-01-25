const MASTER_DATA_URL = "https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/dist/data/calls/all_calls.json";

let rawData = {};
let agentList = [];
let agentStats = {};
let selectedDate = null;
let currentSelectedAgent = null;
let datePickerInstance = null;

// Chart instances
let callVolumeChart = null;       // ECharts
let repeatRateChart = null;       // ECharts
let ahtHeatmapApex = null;        // ECharts for AHT Heatmap
let agentVsSystemECharts = null;  // ECharts for Agent vs Team Volume
let talkTimeComparisonECharts = null; // ECharts for Talk Time Comparison

// ==================== UTILITIES ====================
function safeNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function formatSecondsToMinutes(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function updateSelectedDateDisplay(dateStr) {
  const display = formatDateDisplay(dateStr);
  const ids = [
    'selectedDate',
    'selectedDateDisplay',
    'volumeChartDate',
    'selectedDateVolumeCompare'  
    // ← Add this new ID
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = display;
  });
}

function formatDateForTooltip(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getCallsForDate(dateStr) {
  if (rawData[dateStr]) return rawData[dateStr];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const key = `${parts[0]}-${Number(parts[1])}-${Number(parts[2])}`;
    return rawData[key] || {};
  }
  return {};
}

function destroyChart(chart) {
  if (chart) {
    if (typeof chart.dispose === 'function') chart.dispose();
    if (typeof chart.destroy === 'function') chart.destroy();
  }
  return null;
}

// Global state for table filters
let summaryDateRange = { start: null, end: null };
let summarySearchTerm = '';

// Helper: Calculate stats for a specific date range (real filtering)
function calculateFilteredAgentStats(startDate = null, endDate = null) {
    const filteredStats = {};

    // Helper to turn any date into a comparable number (e.g., 20251220)
    const getNumericDate = (d) => {
        const date = new Date(d);
        if (isNaN(date)) return null;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d_ = String(date.getDate()).padStart(2, '0');
        return parseInt(`${y}${m}${d_}`);
    };

    const startNum = startDate ? getNumericDate(startDate) : null;
    const endNum = endDate ? getNumericDate(endDate) : null;

    for (const dateKey in rawData) {
        // dateKey is "2025-12-20"
        const currentNum = getNumericDate(dateKey);
        if (!currentNum) continue;

        // Strict Numeric Comparison
        if (startNum && currentNum < startNum) continue;
        if (endNum && currentNum > endNum) continue;

        const calls = rawData[dateKey] || {};
        for (const callId in calls) {
            const call = calls[callId];
            if (!call) continue;

            const agent = (call.full_name || "Unknown").trim();
            const callTimestamp = Date.parse(call.call_date);
            if (isNaN(callTimestamp)) continue; 

            if (!filteredStats[agent]) {
                filteredStats[agent] = {
                    total: 0, fcr: 0, ahtSum: 0,
                    uniqueCallers: new Set(),
                    firstPerDay: {}, lastPerDay: {}
                };
            }

            const s = filteredStats[agent];
            s.total++;
            s.ahtSum += (parseFloat(call.acht) || 0);
            if (call.status === "FCR") s.fcr++;
            if (call.phone_number) s.uniqueCallers.add(call.phone_number);

            const dayKey = call.call_date.split(' ')[0]; 
            if (!s.firstPerDay[dayKey] || callTimestamp < s.firstPerDay[dayKey]) s.firstPerDay[dayKey] = callTimestamp;
            if (!s.lastPerDay[dayKey] || callTimestamp > s.lastPerDay[dayKey]) s.lastPerDay[dayKey] = callTimestamp;
        }
    }
    return filteredStats;
}

// Main render function (with real filtering + search)
function renderAgentSummaryTable() {
    const container = document.getElementById('agentSummaryTable');
    if (!container) return;

    // 1. Get filtered data
    const statsSource = calculateFilteredAgentStats(summaryDateRange.start, summaryDateRange.end);

    // 2. Map and Calculate
    const ranked = Object.entries(statsSource)
        .map(([agent, s]) => {
            // EXACT PREVIOUS LOGIC FOR HOURS
            const days = Object.keys(s.firstPerDay || {}).map(d => {
                const f = s.firstPerDay[d];
                const l = s.lastPerDay[d] || f;
                return { hours: Math.max(0, (l - f) / 3600000) };
            });

            const totalDays = days.length;
            
            // Replicating your previous totalH and avgH strings
            const totalH = days.reduce((a, b) => a + b.hours, 0).toFixed(2);
            const avgH = totalDays ? (totalH / totalDays).toFixed(2) : '0.00';

            return {
                agent,
                total: s.total,
                uniqueCallers: s.uniqueCallers instanceof Set ? s.uniqueCallers.size : (s.uniqueCallers || 0),
                fcr: s.fcr,
                aht: s.total > 0 ? Math.round(s.ahtSum / s.total) : 0,
                activeDays: totalDays,
                totalHours: totalH, // Already a string with .toFixed(2)
                avgHours: avgH      // Already a string with .toFixed(2)
            };
        })
        .filter(r => !summarySearchTerm || r.agent.toLowerCase().includes(summarySearchTerm.toLowerCase()))
        .sort((a, b) => b.total - a.total);

    // 3. Update Badge
    const badge = document.getElementById('agentCountBadge');
    if (badge) badge.textContent = `${ranked.length} Agent${ranked.length !== 1 ? 's' : ''}`;

    // 4. Build Table
    let rowsHtml = '';
    ranked.forEach((r, i) => {
        const rankColor = i === 0 ? 'bg-warning text-dark' :
                          i === 1 ? 'bg-secondary text-white' :
                          i === 2 ? 'bg-danger text-white' :
                          'bg-gray-200 text-dark';

        rowsHtml += `
            <tr class="${i < 3 ? 'table-warning' : ''}">
                <td class="text-center">
                    <span class="badge ${rankColor} w-4 h-4 rounded-circle d-inline-flex align-items-center justify-content-center fw-bold">
                        ${i + 1}
                    </span>
                </td>
                <td class="fw-semibold text-nowrap">${r.agent}</td>
                <td class="text-center">${r.total.toLocaleString()}</td>
                <td class="text-center">${r.uniqueCallers.toLocaleString()}</td>
                <td class="text-center">${r.fcr}</td>
                <td class="text-center text-nowrap">${formatSecondsToMinutes(r.aht)}</td>
                <td class="text-center">${r.activeDays}</td>
                <td class="text-center">${r.totalHours}h</td>
                <td class="text-center fw-bold">${r.avgHours}h</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <table class="table table-vcenter card-table table-hover border-top">
            <thead class="sticky-top bg-white">
                <tr class="text-muted" style="font-size: 0.7rem; text-transform: uppercase;">
                    <th class="w-1 text-center">Rank</th>
                    <th>Agent</th>
                    <th class="text-center">Total Calls</th>
                    <th class="text-center">Unique Callers</th>
                    <th class="text-center">FCR</th>
                    <th class="text-center">Avg AHT</th>
                    <th class="text-center">Active Days</th>
                    <th class="text-center">Total Hours</th>
                    <th class="text-center">Avg Hours/Day</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml || '<tr><td colspan="9" class="text-center py-5 text-muted">No records found</td></tr>'}
            </tbody>
        </table>
    `;
}

// ==================== DATA LOADING ====================
async function loadDataFromGitHub() {
  const reloadBtn = document.getElementById('btnReload');
  const loadingIcon = document.getElementById('loadingIcon');
  const reloadIcon = document.getElementById('reloadIcon');
  const reloadText = document.getElementById('reloadText');

  if (!reloadBtn) return;

  reloadBtn.disabled = true;
  if (loadingIcon) loadingIcon.style.display = 'inline-block';
  if (reloadIcon) reloadIcon.style.display = 'none';
  if (reloadText) reloadText.textContent = 'Loading...';

  try {
    const res = await fetch(MASTER_DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    rawData = json.calls || {};

    const availableDates = Object.keys(rawData)
      .filter(key => /^\d{4}-\d{1,2}-\d{1,2}$/.test(key))
      .sort((a, b) => new Date(b) - new Date(a));

    if (availableDates.length === 0) {
      alert("No data available.");
      return;
    }

    selectedDate = availableDates[0];
      processRawData();

      updateSelectedDateDisplay(selectedDate);
      renderKPIs();
      renderCallVolumeChart();
      renderRepeatRateChartForSelectedDate();
      renderAgentSummaryTable();
      

      // NEW: Initialize the new chart in Team Average mode (null = team only)
      currentSelectedAgent = null;                    // Ensure team view
      renderAgentChips();                             // Highlight Team Average chip
      renderAHTHeatmap();                             // Team AHT heatmap
      renderAgentVsSystemHourlyChart(null);           // ← Team Total line only (blue)

    // Reset controls safely
    const rangeSelect = document.getElementById('volumeRangeSelect');
    if (rangeSelect) rangeSelect.value = '30';

    const customDiv = document.getElementById('customRangeInputs');
    if (customDiv) customDiv.style.display = 'none';

    const rangeStart = document.getElementById('rangeStart');
    if (rangeStart) rangeStart.value = '';

    const rangeEnd = document.getElementById('rangeEnd');
    if (rangeEnd) rangeEnd.value = '';

    // Default to Team Average
    currentSelectedAgent = null;
    renderAgentChips();
    renderAHTHeatmap();

    initDatePicker();
    initRangeControls();

  } catch (err) {
    console.error("Failed to load data:", err);
    alert("Failed to reload data. Check console for details.");
  } finally {
    reloadBtn.disabled = false;
    if (loadingIcon) loadingIcon.style.display = 'none';
    if (reloadIcon) reloadIcon.style.display = 'inline-block';
    if (reloadText) reloadText.textContent = 'Reload';
  }
}

// ==================== DATA PROCESSING ====================
function processRawData() {
  agentStats = {};

  for (const dateKey in rawData) {
    const calls = rawData[dateKey] || {};

    for (const callId in calls) {
      const call = calls[callId];
      if (!call) continue;

      // 🔴 Skip DROP calls completely for agent stats
      if (call.is_drop === true || call.status === "DROP") continue;

      const agent = (call.full_name || "").trim();
      if (!agent) continue; // skip unknown agents

      const phone = call.phone_number || null;
      const status = call.status || "";
      const acht = safeNum(call.acht);
      const direction = call.direction || "";
      const callDate = call.call_date ? new Date(call.call_date) : null;

      if (!agentStats[agent]) {
        agentStats[agent] = {
          total: 0,
          inbound: 0,
          outbound: 0,
          fcr: 0,
          nonFcr: 0,
          ahtSum: 0,
          uniqueCallers: new Set(),
          callerCounts: {},
          hourly: Array.from({ length: 24 }, () => [])
        };
      }

      const s = agentStats[agent];

      // ✅ Total valid calls
      s.total++;
      s.ahtSum += acht;

      // ✅ Direction split
      if (direction === "inbound") {
        s.inbound++;

        // ✅ FCR only for inbound
        if (status === "FCR") s.fcr++;
        else s.nonFcr++;

      } else if (direction === "outbound") {
        s.outbound++;
      }

      // ✅ Unique caller tracking
      if (phone) {
        s.uniqueCallers.add(phone);
        s.callerCounts[phone] = (s.callerCounts[phone] || 0) + 1;
      }

      // ✅ Hourly AHT (valid time only)
      if (callDate instanceof Date && !isNaN(callDate)) {
        const hr = callDate.getHours();
        s.hourly[hr].push(acht);
      }
    }
  }

  // ✅ Sorted agent list
  agentList = Object.keys(agentStats).sort((a, b) => a.localeCompare(b));
}


// ==================== KPIs ====================
function renderKPIs() {
  /* ===========================
     Agent-based KPIs
     =========================== */

  const totalCalls = Object.values(agentStats)
    .reduce((a, s) => a + s.total, 0);

  const activeAgents = agentList.length;

  const avgAht = totalCalls
    ? Math.round(
        Object.values(agentStats).reduce((a, s) => a + s.ahtSum, 0) / totalCalls
      )
    : 0;

  const topAgentEntry = Object.entries(agentStats)
    .sort((a, b) => b[1].total - a[1].total)[0];

  const topAgent = topAgentEntry ? topAgentEntry[0] : '—';

  /* ===========================
     Inbound / Outbound counts
     =========================== */

  let inboundCount = 0;
  let outboundCount = 0;

  for (const dateKey in rawData) {
    const calls = rawData[dateKey] || {};

    for (const id in calls) {
      const c = calls[id];
      if (!c || c.is_drop === true) continue;

      if (c.direction === "inbound") inboundCount++;
      else if (c.direction === "outbound") outboundCount++;
    }
  }

  /* ===========================
   Avg FCR % (Inbound only)
   =========================== */

let inboundAnswered = 0;
let inboundFcr = 0;

for (const dateKey in rawData) {
  const calls = rawData[dateKey] || {};

  for (const id in calls) {
    const c = calls[id];
    if (!c || c.is_drop === true) continue;
    if (c.direction !== "inbound") continue;

    inboundAnswered++;

    if (c.status === "FCR") inboundFcr++;
  }
}

const avgFcrPct = inboundAnswered
  ? Math.round((inboundFcr / inboundAnswered) * 100)
  : 0;

  /* ===========================
     Inbound Repeat %
     =========================== */

  let inboundTotal = 0;
  let inboundRepeat = 0;

  for (const dateKey in rawData) {
    const calls = rawData[dateKey] || {};
    const callerCount = {};

    for (const id in calls) {
      const c = calls[id];
      if (!c || c.is_drop === true) continue;
      if (c.direction !== "inbound") continue;

      inboundTotal++;

      const phone = c.phone_number;
      if (!phone) continue;

      callerCount[phone] = (callerCount[phone] || 0) + 1;
    }

    for (const count of Object.values(callerCount)) {
      if (count > 1) inboundRepeat += (count - 1);
    }
  }

  const repeatPct = inboundTotal
    ? Math.round((inboundRepeat / inboundTotal) * 100)
    : 0;

  /* ===========================
     KPI Rendering
     =========================== */

  const kpiTotalCallsEl = document.getElementById('kpiTotalCalls');
  if (kpiTotalCallsEl) {
    kpiTotalCallsEl.innerHTML = `
      ${totalCalls.toLocaleString()}
      <div style="font-size:0.65em;margin-top:4px;font-weight:500">
        <span style="color:#206bc4">In: ${inboundCount.toLocaleString()}</span>
        <span style="color:#9ca3af;margin:0 4px;">|</span>
        <span style="color:#2fb344">Out: ${outboundCount.toLocaleString()}</span>
      </div>
    `;
  }

  const kpiActiveAgentsEl = document.getElementById('kpiActiveAgents');
  if (kpiActiveAgentsEl) kpiActiveAgentsEl.textContent = activeAgents;

  const kpiTopAgentEl = document.getElementById('kpiTopAgent');
  if (kpiTopAgentEl) kpiTopAgentEl.textContent = topAgent;

  const kpiAvgAHTEl = document.getElementById('kpiAvgAHT');
  if (kpiAvgAHTEl) kpiAvgAHTEl.textContent = formatSecondsToMinutes(avgAht);

  const kpiRepeatPctEl = document.getElementById('kpiRepeatPct');
  if (kpiRepeatPctEl) kpiRepeatPctEl.textContent = repeatPct + '%';
  const avgFcrPctEl = document.getElementById('avgFcrPct');
  if (avgFcrPctEl) avgFcrPctEl.textContent = avgFcrPct + '%';

}



// ==================== AGENT CHIPS ====================
const agentColors = [
  'bg-primary-lt'
];

function renderAgentChips() {
  const container = document.getElementById('agentChipContainer');
  if (!container) return;

  container.innerHTML = '';
  container.classList.add('d-flex', 'flex-wrap', 'gap-2', 'justify-content-start', 'mb-4');

  // --- 1. Team Average Chip ---
  const teamChip = document.createElement('span');
  teamChip.className = !currentSelectedAgent
    ? 'badge bg-primary text-primary-fg px-3 py-1 fs-5 rounded shadow-sm cursor-pointer'
    : 'badge bg-secondary text-secondary-fg px-3 py-1 fs-5 rounded cursor-pointer';
  teamChip.textContent = 'Team Average';
  teamChip.style.cursor = 'pointer';

  teamChip.onclick = () => {
    currentSelectedAgent = null;
    renderAgentChips();
    renderAHTHeatmap();
    // Render the chart with ONLY team data
    renderAgentVsSystemHourlyChart(null); 
  };
  container.appendChild(teamChip);

  // --- 2. Individual Agent Chips ---
  agentList.forEach((agent, index) => {
    const chip = document.createElement('span');
    const colorClass = agentColors[index % agentColors.length];

    chip.className = agent === currentSelectedAgent
      ? `badge ${colorClass.replace('-lt', '')} text-white px-3 py-1 fs-5 rounded shadow-sm cursor-pointer`
      : `badge ${colorClass} text-dark px-3 py-1 fs-5 rounded cursor-pointer`;
    
    chip.textContent = agent;
    chip.style.cursor = 'pointer';

    // ... inside your agentList.forEach ...
chip.onclick = () => {
    currentSelectedAgent = agent;
    
    // 1. Refresh the chip UI
    renderAgentChips();
    
    // 2. Attempt to render all charts
    // The "clientWidth === 0" guard inside these functions 
    // will prevent them from breaking if the tab is hidden.
    renderAHTHeatmap(currentSelectedAgent);
    renderAgentVsSystemHourlyChart(currentSelectedAgent);
    renderTalkTimeComparisonChart(currentSelectedAgent);
};
    container.appendChild(chip);
  });
}

// ==================== AHT HEATMAP ====================
function computeAhtPerHour(agent = null) {
  const hourlyTotals = Array(24).fill(0);
  const hourlyCounts = Array(24).fill(0);

  if (agent) {
    const stats = agentStats[agent];
    if (!stats || !stats.hourly) return Array(24).fill(0);

    stats.hourly.forEach((arr, hour) => {
      if (arr.length > 0) {
        const sum = arr.reduce((a, b) => a + b, 0);
        hourlyTotals[hour] += sum;
        hourlyCounts[hour] += arr.length;
      }
    });
  } else {
    for (const ag in agentStats) {
      const stats = agentStats[ag];
      stats.hourly.forEach((arr, hour) => {
        if (arr.length > 0) {
          const sum = arr.reduce((a, b) => a + b, 0);
          hourlyTotals[hour] += sum;
          hourlyCounts[hour] += arr.length;
        }
      });
    }
  }

  return hourlyTotals.map((total, hour) => {
    return hourlyCounts[hour] > 0 ? Math.round(total / hourlyCounts[hour]) : 0;
  });
}

function renderAHTHeatmap(agent) {
    // 1. Destroy previous instance
    if (window.ahtHeatmapECharts) {
        window.ahtHeatmapECharts.dispose();
        window.ahtHeatmapECharts = null;
    }

    const container = document.getElementById('ahtHeatmapContainer');
    if (!container) return;

    // 2. Initialization Guard
    if (container.clientWidth === 0) return;

    const data = computeAhtPerHour(agent);
    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    // Color logic preserved
    const barData = data.map(v => {
        let color = '#ef4444'; // Red (High)
        if (v === 0) color = '#e2e8f0'; // Gray (No data)
        else if (v <= 180) color = '#10b981'; // Green (Target)
        else if (v <= 360) color = '#f59e0b'; // Orange (Warning)
        
        return {
            value: v,
            itemStyle: { color: color }
        };
    });

    const validData = data.filter(v => v > 0);
    const overallAvgAht = validData.length > 0 ? validData.reduce((a, b) => a + b, 0) / validData.length : 0;

    const option = {
        title: {
            text: agent ? `AHT per Hour - ${agent}` : 'Team Avg AHT per Hour',
            subtext: 'Historical average across all available days',
            left: 'left',
            textStyle: { fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'Inter' },
            subtextStyle: { fontSize: 12, color: '#64748b' }
        },
        tooltip: {
            trigger: 'axis',
            padding: 0,
            backgroundColor: 'transparent',
            borderWidth: 0,
            axisPointer: { type: 'shadow' }, // Bar charts look better with shadow pointers
            formatter: function (params) {
                const p = params[0];
                const val = p.value ?? 0;
                const title = agent || 'Team Average';
                
                return `
                    <div style="padding: 10px 12px; background: rgba(255,255,255,0.96); border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); min-width: 200px; font-family: Inter, sans-serif;">
                        <div style="font-weight: 500; color: #1e293b; margin-bottom: 6px; font-size: 14px;">
                            ${title} · ${p.name}
                        </div>
                        <div style="display: flex; align-items: center; font-size: 13px;">
                            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 8px;"></span>
                            <span style="color:#64748b;">Avg AHT:</span>
                            <span style="font-weight: 600; margin-left: auto; color: #1e293b;">
                                ${formatSecondsToMinutes(Math.round(val))}
                            </span>
                        </div>
                    </div>
                `;
            }
        },
        grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            data: hours,
            axisLabel: { rotate: -90, color: '#64748b', fontSize: 11 },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: (val) => formatSecondsToMinutes(val), color: '#64748b' },
            splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } }
        },
        series: [{
            name: 'Average Handle Time',
            type: 'bar',
            data: barData,
            barWidth: '70%',
            itemStyle: { borderRadius: [4, 4, 0, 0] },
            // Target Annotations (MarkLines)
            markLine: {
                symbol: 'none',
                label: { position: 'end', fontSize: 10, fontWeight: 600 },
                data: [
                    {
                        yAxis: 180,
                        name: 'Target',
                        lineStyle: { color: '#10b981', type: 'dashed', width: 2 },
                        label: { formatter: 'Target: 3:00', backgroundColor: '#10b981', color: '#fff', padding: [2, 4], borderRadius: 3 }
                    },
                    {
                        yAxis: Math.round(overallAvgAht),
                        name: 'Average',
                        lineStyle: { color: '#64748b', type: 'dotted', width: 2 },
                        label: { formatter: 'Avg: {c}s', backgroundColor: '#64748b', color: '#fff', padding: [2, 4], borderRadius: 3 }
                    }
                ]
            }
        }]
    };

    window.ahtHeatmapECharts = echarts.init(container);
    window.ahtHeatmapECharts.setOption(option);
}

// ==================== AGENT VS TEAM HOURLY VOLUME ====================
function getAgentHourlyVolumeOnSelectedDate(agent, dateStr) {
  const calls = getCallsForDate(dateStr);
  const h = Array(24).fill(0);
  for (const id in calls) {
    const call = calls[id];
    if ((call.full_name || "Unknown").trim() === agent) {
      const d = new Date(call.call_date);
      if (!isNaN(d)) h[d.getHours()]++;
    }
  }
  return h.map(v => v > 0 ? v : null); // null for no calls (breaks line)
}

function computeSelectedDateHourlyVolume(dateStr) {
  const calls = getCallsForDate(dateStr);
  const h = Array(24).fill(0);
  for (const id in calls) {
    const d = new Date(calls[id].call_date);
    if (!isNaN(d)) h[d.getHours()]++;
  }
  return h.map(v => v > 0 ? v : null);
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') {
    chart.destroy();
  }
  return null;
}

// The full function Charts version using ECharts 

function renderAgentVsSystemHourlyChart(agent) {
  // 1. Destroy previous instance to prevent memory leaks
  if (window.agentVsSystemECharts) {
    window.agentVsSystemECharts.dispose();
    window.agentVsSystemECharts = null;
  }

  const container = document.getElementById('agentVsSystemHourlyContainer');
  if (!container) return;

  // 2. INITIALIZATION GUARD: Prevents "squashed" 100px width bug
  if (container.clientWidth === 0) {
    return;
  }

  const systemData = computeSelectedDateHourlyVolume(selectedDate);
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  let series = [{
    name: 'Team Total',
    type: 'line',
    data: systemData,
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    itemStyle: { color: '#3b82f6' },
    lineStyle: { width: 2 },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
        { offset: 1, color: 'rgba(59, 130, 246, 0)' }
      ])
    },
    connectNulls: false
  }];

  if (agent && agent !== "Team Average") {
    const agentData = getAgentHourlyVolumeOnSelectedDate(agent, selectedDate);
    series.unshift({
      name: agent,
      type: 'line',
      data: agentData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: '#f59e0b' },
      lineStyle: { width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(251, 146, 60, 0.3)' },
          { offset: 1, color: 'rgba(251, 146, 60, 0)' }
        ])
      },
      connectNulls: false
    });
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      padding: 0,
      backgroundColor: 'transparent',
      borderWidth: 0,
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#cbd5e1' }
      },
      formatter: function (params) {
        if (!params || !params.length) return '';

        const hour = params[0].name;
        const dateLabel = typeof formatDateForTooltip === 'function' ? formatDateForTooltip(selectedDate) : selectedDate;

        let html = `
          <div style="
            padding: 10px 12px;
            background: rgba(255,255,255,0.96);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.12);
            min-width: 200px;
            font-family: Inter, system-ui, sans-serif;
          ">
            <div style="
              font-weight: 500;
              color: #1e293b;
              margin-bottom: 6px;
              font-size: 14px;
            ">
              ${dateLabel} - ${hour}
            </div>
        `;

        params.forEach(p => {
          const val = p.value ?? 0;
          html += `
            <div style="
              display: flex;
              align-items: center;
              margin-top: 4px;
              font-size: 13px;
            ">
              <span style="
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: ${p.color};
                margin-right: 8px;
              "></span>
              <span style="color:#64748b;">
                ${p.seriesName}:
              </span>
              <span style="
                font-weight: 600;
                margin-left: auto;
                color: #1e293b;
              ">
                ${val}
              </span>
            </div>
          `;
        });

        html += `</div>`;
        return html;
      }
    },
    legend: {
      show: true,
      orient: 'horizontal',
      top: 0,
      left: 'left',
      itemGap: 20,
      textStyle: { color: '#64748b', fontSize: 13 }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLabel: {
        rotate: -90,
        interval: 0,
        color: '#64748b',
        fontSize: 11
      },
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: 'value',
      //name: 'Call Volume',
      //nameTextStyle: { color: '#64748b' },
      // Hides the 0, 10, 20... labels
      axisLabel: { show: false },
      // Hides the horizontal lines crossing the chart
      splitLine: { show: false },
      min: 0
    },
    series: series
  };

  window.agentVsSystemECharts = echarts.init(container);
  window.agentVsSystemECharts.setOption(option);
}


// Helper: Get hourly talk time (sum of AHT) for team and agent on selected date
function getHourlyTalkTime(agent, dateStr) {
  const calls = getCallsForDate(dateStr);
  const sys = Array(24).fill(0);
  const ag = Array(24).fill(0);

  for (const id in calls) {
    const c = calls[id];
    const d = new Date(c.call_date);
    const acht = safeNum(c.acht);
    const name = (c.full_name || "Unknown").trim();

    if (!isNaN(d)) {
      const h = d.getHours();
      sys[h] += acht;
      if (name === agent) ag[h] += acht;
    }
  }

  // Return null for zero talk time → breaks the line
  return {
    systemData: sys.map(v => v > 0 ? v : null),
    agentData: ag.map(v => v > 0 ? v : null)
  };
}

// Main ECharts render function
function renderTalkTimeComparisonChart(agent) {
  // 1. Destroy previous instance
  if (window.talkTimeComparisonECharts) {
    window.talkTimeComparisonECharts.dispose();
    window.talkTimeComparisonECharts = null;
  }

  const container = document.getElementById('talkTimeComparisonContainer');
  if (!container) return;

  // 2. INITIALIZATION GUARD: Prevents "squashed" bug if tab is hidden
  if (container.clientWidth === 0) return;

  const { systemData, agentData } = getHourlyTalkTime(agent, selectedDate);
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  let series = [
    {
      name: 'Team Total',
      type: 'line',
      data: systemData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: '#ef4444' },
      lineStyle: { width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
          { offset: 1, color: 'rgba(239, 68, 68, 0)' }
        ])
      },
      connectNulls: false
    }
  ];

  if (agent && agent !== "Team Average") {
    series.unshift({
      name: agent, 
      type: 'line',
      data: agentData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: '#10b981' },
      lineStyle: { width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
          { offset: 1, color: 'rgba(16, 185, 129, 0)' }
        ])
      },
      connectNulls: false
    });
  }

  const option = {
    
    tooltip: {
      trigger: 'axis',
      padding: 0,
      backgroundColor: 'transparent',
      borderWidth: 0,
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#cbd5e1' }
      },
      formatter: function (params) {
        if (!params || !params.length) return '';

        const hour = params[0].name;
        // Use your utility function or fallback to raw date
        const dateLabel = typeof formatDateForTooltip === 'function' ? formatDateForTooltip(selectedDate) : selectedDate;

        let html = `
          <div style="
            padding: 10px 12px;
            background: rgba(255,255,255,0.96);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.12);
            min-width: 210px;
            font-family: Inter, system-ui, sans-serif;
          ">
            <div style="
              font-weight: 500;
              color: #1e293b;
              margin-bottom: 6px;
              font-size: 14px;
            ">
              ${dateLabel} - ${hour}
            </div>
        `;

        params.forEach(p => {
          const val = p.value ?? 0;
          // Format seconds to M:SS for the tooltip display
          const displayTime = typeof formatSecondsToMinutes === 'function' ? formatSecondsToMinutes(val) : val;
          
          html += `
            <div style="
              display: flex;
              align-items: center;
              margin-top: 4px;
              font-size: 13px;
            ">
              <span style="
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: ${p.color};
                margin-right: 8px;
              "></span>
              <span style="color:#64748b;">
                ${p.seriesName}:
              </span>
              <span style="
                font-weight: 600;
                margin-left: auto;
                color: #1e293b;
              ">
                ${displayTime}
              </span>
            </div>
          `;
        });

        html += `</div>`;
        return html;
      }
    },
    legend: {
      show: true,
      top: 0,
      left: 'center',
      textStyle: { color: '#64748b' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLabel: {
        rotate: -90,
        color: '#64748b',
        fontSize: 11
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      // name: '',        
      axisLabel: { show: false }, // Removed Y-axis labels
      splitLine: { show: false }, // Removed grid lines
      axisLine: { show: false },  // Removed Y-axis border line
      min: 0
    },
    series: series
  };

  window.talkTimeComparisonECharts = echarts.init(container);
  window.talkTimeComparisonECharts.setOption(option);
}

// ==================== VOLUME CALCULATIONS ====================
// Returns array[24] of call counts per hour (drop-safe)
function computeHourlyVolume(dateStr, options = {}) {
  const hours = Array(24).fill(0);
  const calls = rawData[dateStr] || {};

  for (const id in calls) {
    const c = calls[id];
    if (!c) continue;
    if (options.excludeDrop && c.is_drop === true) continue;
    if (options.direction && c.direction !== options.direction) continue;

    const callDate = c.call_date ? new Date(c.call_date) : null;
    if (!callDate || isNaN(callDate)) continue;

    const hr = callDate.getHours();
    hours[hr]++;
  }

  return hours;
}

// Average hourly volume over a range of dates (drop-safe)
function computeRangeHourlyAverage(startDate, endDate, options = {}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const sumHours = Array(24).fill(0);
  let dayCount = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const hourly = computeHourlyVolume(dateStr, options);
    if (!hourly) continue;

    for (let i = 0; i < 24; i++) sumHours[i] += hourly[i];
    dayCount++;
  }

  return dayCount ? sumHours.map(v => Math.round(v / dayCount)) : Array(24).fill(0);
}

// Average across all dates
function computeAllTimeAvgHourly(options = {}) {
  const dates = Object.keys(rawData);
  if (!dates.length) return Array(24).fill(0);
  return computeRangeHourlyAverage(dates[0], dates[dates.length - 1], options);
}


// ==================== RANGE CONTROLS ====================
function initRangeControls() {
  const select = document.getElementById('volumeRangeSelect');
  const customDiv = document.getElementById('customRangeInputs');

  if (!select) return;

  select.addEventListener('change', function () {
    const mode = this.value;
    if (customDiv) customDiv.style.display = mode === 'custom' ? 'flex' : 'none';
    renderCallVolumeChart();
  });

  const availableDates = Object.keys(rawData)
    .filter(d => /^\d{4}-\d{1,2}-\d{1,2}$/.test(d));

  flatpickr('#rangeStart', {
    dateFormat: "Y-m-d",
    maxDate: selectedDate,
    enable: availableDates,
    onChange: () => renderCallVolumeChart()
  });

  flatpickr('#rangeEnd', {
    dateFormat: "Y-m-d",
    maxDate: selectedDate,
    enable: availableDates,
    onChange: () => renderCallVolumeChart()
  });
}

// ==================== VOLUME CHART ====================
function renderCallVolumeChart() {
  destroyChart(callVolumeChart);

  // Today's hourly data
  const inboundToday = computeHourlyVolume(selectedDate, { excludeDrop: true, direction: 'inbound' });
  const outboundToday = computeHourlyVolume(selectedDate, { excludeDrop: true, direction: 'outbound' });

  let rangeAvgInbound = null;
  let rangeAvgOutbound = null;
  let rangeLabel = null;

  const rangeSelect = document.getElementById('volumeRangeSelect');
  const mode = rangeSelect ? rangeSelect.value : '30';

  if (mode === 'all') {
    rangeAvgInbound = computeAllTimeAvgHourly({ excludeDrop: true, direction: 'inbound' });
    rangeAvgOutbound = computeAllTimeAvgHourly({ excludeDrop: true, direction: 'outbound' });
    rangeLabel = 'Daily Avg (All Time)';
  } else if (mode === '7' || mode === '30') {
    const daysBack = mode === '7' ? 7 : 30;
    const endDate = new Date(selectedDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - daysBack + 1);

    rangeAvgInbound = computeRangeHourlyAverage(startDate.toISOString().split('T')[0], selectedDate, { excludeDrop: true, direction: 'inbound' });
    rangeAvgOutbound = computeRangeHourlyAverage(startDate.toISOString().split('T')[0], selectedDate, { excludeDrop: true, direction: 'outbound' });
    rangeLabel = `Daily Avg (Last ${daysBack} Days)`;
  } else if (mode === 'custom') {
    const start = document.getElementById('rangeStart')?.value;
    const end = document.getElementById('rangeEnd')?.value;
    if (start && end && start <= end) {
      rangeAvgInbound = computeRangeHourlyAverage(start, end, { excludeDrop: true, direction: 'inbound' });
      rangeAvgOutbound = computeRangeHourlyAverage(start, end, { excludeDrop: true, direction: 'outbound' });
      rangeLabel = `Daily Avg (${formatDateDisplay(start)} – ${formatDateDisplay(end)})`;
    }
  }

  const chartDom = document.getElementById('chart-call-volume');
  if (!chartDom) return;

  callVolumeChart = echarts.init(chartDom);

  const primaryColor = '#3874ff';
  const outboundColor = '#2fb344';
  const rangeColor = '#10b981';
  const textColor = '#64748b';

  const fullHours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  // Determine chart max
  const allValues = [...(rangeAvgInbound || []), ...(rangeAvgOutbound || []), ...inboundToday, ...outboundToday];
  const dataMax = allValues.length ? Math.max(...allValues) : 100;
  const niceMax = dataMax === 0 ? 100 : Math.ceil((dataMax + 9) / 10) * 10;

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1' } },
      formatter: function (params) {
        const hour = params[0].name;
        params.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        let rows = '';
        params.forEach(p => {
          if (p.value == null) return;
          rows += `
            <div style="display:flex;align-items:center;margin-top:6px;">
              <span style="
                display:inline-block;
                width:11px;
                height:11px;
                border-radius:50%;
                background:${p.color};
                margin-right:10px;
                box-shadow:0 1px 3px rgba(0,0,0,0.15);
              "></span>
              <span style="color:#64748b;font-size:13px;">${p.seriesName}:</span>
              <span style="font-weight:700;margin-left:8px;color:#1e293b;">${p.value} calls</span>
            </div>
          `;
        });
        return `
          <div style="
            padding:10px 14px;
            background:rgba(255,255,255,0.96);
            border:1px solid #e2e8f0;
            border-radius:6px;
            box-shadow:0 4px 16px rgba(0,0,0,0.12);
            font-family:Inter, system-ui, sans-serif;
            font-size:14px;
            min-width:210px;
            pointer-events:none;
          ">
            <div style="font-weight:600;color:#1e293b;margin-bottom:8px;font-size:15px;">${hour}</div>
            ${rows}
          </div>
        `;
      }
    },
    legend: {
      show: true,
      orient: 'horizontal',
      left: '2%',
      top: '0%',
      itemGap: 24,
      itemWidth: 12,
      itemHeight: 12,
      icon: 'circle',
      textStyle: { color: textColor, fontSize: 13, fontWeight: 500 },
      inactiveColor: '#cbd5e1'
    },
    grid: { left: '3%', right: '4%', top: '10%', bottom: '2%', containLabel: true },
    xAxis: { type: 'category', data: fullHours, axisLabel: { color: textColor, interval: i => i % 6 === 0 } },
    yAxis: { type: 'value', max: niceMax, min: 0, show: false },
    series: [
      // Optional range avg
      rangeAvgInbound && {
        name: `Inbound ${rangeLabel}`,
        type: 'line',
        data: rangeAvgInbound,
        smooth: true,
        showSymbol: false,
        z: 6,
        itemStyle: { color: rangeColor },
        lineStyle: { width: 2, color: rangeColor, shadowBlur: 6, shadowColor: 'rgba(16, 185, 129, 0.3)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0)' }
          ])
        }
      },
      rangeAvgOutbound && {
        name: `Outbound ${rangeLabel}`,
        type: 'line',
        data: rangeAvgOutbound,
        smooth: true,
        showSymbol: false,
        z: 6,
        itemStyle: { color: outboundColor },
        lineStyle: { width: 2, color: outboundColor, shadowBlur: 6, shadowColor: 'rgba(47, 179, 68, 0.3)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(47, 179, 68, 0.2)' },
            { offset: 1, color: 'rgba(47, 179, 68, 0)' }
          ])
        }
      },
      // Today inbound
      {
        name: `Inbound ${formatDateDisplay(selectedDate)}`,
        type: 'line',
        data: inboundToday,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        z: 10,
        itemStyle: { color: primaryColor, borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2, color: primaryColor, shadowBlur: 8, shadowColor: 'rgba(56, 116, 255, 0.25)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56, 116, 255, 0.2)' },
            { offset: 1, color: 'rgba(56, 116, 255, 0)' }
          ])
        },
        emphasis: { itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(56, 116, 255, 0.5)' } }
      },
      // Today outbound
      {
        name: `Outbound ${formatDateDisplay(selectedDate)}`,
        type: 'line',
        data: outboundToday,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        z: 10,
        itemStyle: { color: outboundColor, borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2, color: outboundColor, shadowBlur: 8, shadowColor: 'rgba(47, 179, 68, 0.25)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(47, 179, 68, 0.2)' },
            { offset: 1, color: 'rgba(47, 179, 68, 0)' }
          ])
        },
        emphasis: { itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(47, 179, 68, 0.5)' } }
      }
    ].filter(Boolean)
  };

  callVolumeChart.setOption(option);

  // Remove old resize listener if exists
  if (callVolumeChart.resizeListener) window.removeEventListener('resize', callVolumeChart.resizeListener);
  callVolumeChart.resizeListener = () => callVolumeChart.resize();
  window.addEventListener('resize', callVolumeChart.resizeListener);
}


//Capacity-chart

// ===========================
// Global Styling Constants
// ===========================
const TABLER_BLUE   = '#206bc4';
const TABLER_GREEN  = '#2fb344';
const TABLER_YELLOW = '#f59f00';
const TABLER_GRAY   = '#9ca3af';
const TABLER_GRID   = '#f1f5f9';

const chartAvg = echarts.init(document.getElementById('capacity-chart'));

async function loadAverageChartMerged() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/dist/data/calls/all_calls.json');
    const rawData = await res.json();

    const allDates = Object.keys(rawData.calls || {});
    const dayCount = allDates.length || 1;

    // Initialize hourly stats
    const hourlyCalls = Array.from({ length: 24 }, () => ({ inbound: 0, outbound: 0, total: 0, dropCount: 0 }));
    const hourlyAgentsByDay = Array.from({ length: 24 }, () => ({}));

    // Process all calls
    Object.entries(rawData.calls || {}).forEach(([date, dayCalls]) => {
      Object.values(dayCalls).forEach(call => {
        if (!call) return;

        const hour = new Date(call.call_date).getHours();
        if (hour < 0 || hour > 23) return;

        const h = hourlyCalls[hour];
        if (!call.is_drop) {
          h.total++;
          if (call.direction === 'inbound') h.inbound++;
          else if (call.direction === 'outbound') h.outbound++;

          if (call.full_name) {
            if (!hourlyAgentsByDay[hour][date]) hourlyAgentsByDay[hour][date] = new Set();
            hourlyAgentsByDay[hour][date].add(call.full_name);
          }
        } else {
          h.dropCount++;
        }
      });
    });

    // Compute hourly averages
    const activeHours = hourlyCalls.map((h, i) => {
      const dayCounts = Object.values(hourlyAgentsByDay[i]).map(set => set.size);
      const avgAgents = dayCounts.length ? Math.round(dayCounts.reduce((a,b)=>a+b,0)/dayCount) : 0;
      return {
        hour: i,
        total: Math.ceil(h.total / dayCount),
        inbound: Math.ceil(h.inbound / dayCount),
        outbound: Math.ceil(h.outbound / dayCount),
        dropCountRaw: h.dropCount / dayCount,
        agentCount: avgAgents
      };
    }).filter(h => h.total > 0 || h.dropCountRaw > 0);

    const categories = activeHours.map(h => `${h.hour.toString().padStart(2,'0')}:00`);
    const totalCalls = activeHours.map(h => h.total);
    const inbound = activeHours.map(h => h.inbound);
    const outbound = activeHours.map(h => h.outbound);
    const agents = activeHours.map(h => h.agentCount);
    const dropPercent = activeHours.map(h => h.dropCountRaw > 0 ? ((h.dropCountRaw / h.total) * 100).toFixed(1) : null);

    // Highlight peak hours
    const sortedTotals = [...totalCalls].sort((a,b)=>b-a);
    const threshold = sortedTotals[Math.floor(totalCalls.length*0.2)] || Math.max(...totalCalls);
    const peakHours = [];
    totalCalls.forEach((v,i) => {
      if (v >= threshold && v > 0) peakHours.push([{ xAxis: categories[i], itemStyle: { color: 'rgba(245,159,0,0.12)' } }, { xAxis: categories[i] }]);
    });

    chartAvg.setOption(getMergedChartOption(categories, totalCalls, inbound, outbound, agents, dropPercent, peakHours, activeHours));
  } catch (e) { console.error(e); }
}

function getMergedChartOption(categories, totalCalls, inbound, outbound, agents, dropPercent, peakHours, activeData) {
  return {
    backgroundColor: 'transparent',
    legend: {
      left: 'left',
      top: 0,
      icon: 'rect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: TABLER_GRAY, fontSize: 12 },
      data: [
        { name: 'Total Calls', icon: 'rect', itemStyle: { color: TABLER_BLUE } },
        { name: 'Agents', icon: 'rect', itemStyle: { color: TABLER_GREEN } },
        { name: 'Drop %', icon: 'rect', itemStyle: { color: TABLER_YELLOW } }
      ]
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.02)' } },
      backgroundColor: '#ffffff',
      borderColor: '#e6e8eb',
      textStyle: { color: '#1d273b' },
      formatter: function(params) {
        const idx = params[0].dataIndex;
        const h = activeData[idx];
        const callsPerAgent = agents[idx] > 0 ? (totalCalls[idx]/agents[idx]).toFixed(2) : '0';
        const dropDisp = h.dropCountRaw.toFixed(1);
        const dropLine = h.dropCountRaw > 0 ? `<span style="color:${TABLER_YELLOW}">●</span> Drop: <b>${dropPercent[idx]}%</b> (${dropDisp} avg)<br/>` : '';

        return `
          <div style="font-weight:600; border-bottom:1px solid ${TABLER_GRID}; margin-bottom:8px; padding-bottom:4px;">
            ${categories[idx]} (Avg/Day)
          </div>
          <span style="color:${TABLER_BLUE}">●</span> Total Calls: <b>${totalCalls[idx]}</b> 
          <small style="color:${TABLER_GRAY}">(In:${inbound[idx]} Out:${outbound[idx]})</small><br/>
          ${dropLine}
          <span style="color:${TABLER_GREEN}">●</span> Agents: <b>${agents[idx]}</b><br/>
          <span style="color:#626976">●</span> Efficiency: <b>${callsPerAgent}</b> calls/agent
        `;
      }
    },
    grid: { left: '3%', right: '5%', top: 60, bottom: '5%', containLabel: true },
    xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: TABLER_GRID } }, axisLabel: { color: TABLER_GRAY } },
    yAxis: [
      { type: 'value', name: 'Avg Calls', splitLine: { lineStyle: { color: TABLER_GRID } }, axisLabel: { color: TABLER_GRAY } },
      { type: 'value', name: 'Agents', position: 'right', splitLine: { show:false }, axisLabel: { color: TABLER_GRAY } },
      { type: 'value', name: 'Drop %', position: 'right', offset: 50, axisLabel: { formatter:'{value}%', color: TABLER_GRAY }, splitLine: { show:false } }
    ],
    series: [
      { name:'Total Calls', type:'bar', barWidth:'40%', data:totalCalls, itemStyle:{ borderRadius:[2,2,0,0], color: TABLER_BLUE }, markArea:{ silent:true, data:peakHours } },
      { name:'Agents', type:'line', yAxisIndex:1, smooth:true, showSymbol:false, lineStyle:{ width:3, color:TABLER_GREEN }, data:agents },
      { name:'Drop %', type:'line', yAxisIndex:2, connectNulls:false, symbol:'circle', symbolSize:8, lineStyle:{ width:2, type:'dashed', color:TABLER_YELLOW }, itemStyle:{ color:TABLER_YELLOW, borderColor:'#fff' }, data:dropPercent }
    ]
  };
}

// Initialize chart
loadAverageChartMerged();
window.addEventListener('resize', () => chartAvg.resize());


// ==================== REPEAT RATE CHART ====================
function renderRepeatRateChartForSelectedDate() {
  // 1. Destroy previous instance
  if (window.repeatRateECharts) {
    window.repeatRateECharts.dispose();
    window.repeatRateECharts = null;
  }

  const dom = document.getElementById('repeatRateChart');
  if (!dom) return;

  // 2. Data Processing
  const calls = getCallsForDate(selectedDate);
  const agentStatsToday = {};

  for (const id in calls) {
    const c = calls[id];
    const agent = (c.full_name || "Unknown").trim();
    const phone = c.phone_number;
    if (!agentStatsToday[agent]) {
      agentStatsToday[agent] = { total: 0, unique: new Set() };
    }
    agentStatsToday[agent].total++;
    if (phone) agentStatsToday[agent].unique.add(phone);
  }

  const agentData = [];
  let totalCalls = 0;
  let totalUnique = 0;
  Object.keys(agentStatsToday).forEach(agent => {
    const s = agentStatsToday[agent];
    const total = s.total;
    const unique = s.unique.size;
    const repeatRate = total > 0 ? Math.round(((total - unique) / total) * 100) : 0;
    if (repeatRate > 0) agentData.push({ agent, repeatRate });
    totalCalls += total;
    totalUnique += unique;
  });

  agentData.sort((a, b) => a.repeatRate - b.repeatRate); // Horizontal bars usually sort ascending for display

  const categories = agentData.map(d => d.agent);
  const repeatRates = agentData.map(d => d.repeatRate);
  const overallAvg = totalCalls > 0 ? Math.round(((totalCalls - totalUnique) / totalCalls) * 100) : 0;

  if (agentData.length === 0) {
    dom.innerHTML = '<div class="text-center text-muted p-5">No repeat callers on this date</div>';
    return;
  }

  // 3. ECharts Configuration
  const option = {
    tooltip: {
      trigger: 'axis',
      padding: 0,
      backgroundColor: 'transparent',
      borderWidth: 0,
      axisPointer: { type: 'shadow' },
      formatter: function (params) {
        const p = params[0];
        const rate = p.value;
        const agent = p.name;
        const dotColor = rate > 30 ? '#dc2626' : rate > 15 ? '#f59e0b' : '#10b981';

        return `
          <div style="padding: 10px 14px; background: rgba(255, 255, 255, 0.96); border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-family: Inter, sans-serif; min-width: 210px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; font-size: 15px;">${agent}</div>
            <div style="display: flex; align-items: center;">
              <span style="width: 11px; height: 11px; border-radius: 50%; background: ${dotColor}; margin-right: 10px;"></span>
              <span style="color: #64748b; font-size: 13.5px;">Repeat Rate:</span>
              <span style="font-weight: 700; margin-left: 8px; color: #1e293b;">${rate}%</span>
            </div>
          </div>`;
      }
    },
    grid: { left: '3%', 
            right: '7%', 
            bottom: '3%', 
            containLabel: true 
    },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}%', color: '#64748b' },
      splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } }
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#64748b', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [{
      name: 'Repeat Rate',
      type: 'bar',
      data: repeatRates.map(val => ({
        value: val,
        itemStyle: {
          color: val > 30 ? '#dc2626' : val > 15 ? '#f59e0b' : '#10b981',
          borderRadius: [0, 4, 4, 0] // Rounded corners on the right side
        }
      })),
      barWidth: '85%',
      markLine: {
        symbol: 'none',
        label: { position: 'end', formatter: `Avg: ${overallAvg}%`, backgroundColor: '#64748b', color: '#fff', padding: [2, 4], borderRadius: 3 },
        lineStyle: { color: '#64748b', type: 'dotted', width: 2 },
        data: [{ xAxis: overallAvg }]
      }
    }]
  };

  window.repeatRateECharts = echarts.init(dom);
  window.repeatRateECharts.setOption(option);
}

// ==================== DATE PICKER ====================
function initDatePicker() {
  const dates = Object.keys(rawData)
    .filter(d => /^\d{4}-\d{1,2}-\d{1,2}$/.test(d))
    .sort((a, b) => new Date(b) - new Date(a));

  if (datePickerInstance) datePickerInstance.destroy();

  datePickerInstance = flatpickr('#datePicker', {
    altInput: true,
    altFormat: "M j, Y",
    dateFormat: "Y-m-d",
    defaultDate: selectedDate,
    enable: dates,
    onChange: (selectedDates, dateStr) => {
  selectedDate = dateStr;
  updateSelectedDateDisplay(dateStr);
  renderKPIs();
  renderCallVolumeChart();
  renderRepeatRateChartForSelectedDate();

  currentSelectedAgent = null;
  renderAgentChips();
  renderAHTHeatmap();
  renderAgentVsSystemHourlyChart(null);
  renderTalkTimeComparisonChart(null);            // ← Team only talk time
},
    onOpen: () => {
      const visibleInput = document.querySelector('.input-icon .form-control.input-active') ||
                           document.querySelector('.flatpickr-input.input-active');
      if (visibleInput) visibleInput.classList.add('custom-focus');
    },
    onClose: () => {
      const visibleInput = document.querySelector('.input-icon .form-control.input-active') ||
                           document.querySelector('.flatpickr-input.input-active');
      if (visibleInput) visibleInput.classList.remove('custom-focus');
    }
  });
}


// Global listener for Tab Switching
document.addEventListener('shown.bs.tab', function (event) {
    const targetId = event.target.getAttribute('data-bs-target');
    
    // 1. Handle AHT Tab (if you moved it to ECharts)
    if (targetId === '#aht') {
        renderAHTHeatmap(currentSelectedAgent);
    }

    // 2. Handle Volume Tab activation
    if (targetId === '#volume') {
        // We call render instead of resize to ensure the AGENT data is updated
        renderAgentVsSystemHourlyChart(currentSelectedAgent);
    }
    
    // 3. Handle Talk Time Tab activation
    if (targetId === '#talktime') {
        // We call render instead of resize to ensure the AGENT data is updated
        renderTalkTimeComparisonChart(currentSelectedAgent);
    }
    
    // 4. Trigger a general window resize to catch other elements
    window.dispatchEvent(new Event('resize'));
});

// Automatic resize for window changes
window.addEventListener('resize', () => {
    if (window.ahtHeatmapECharts) window.ahtHeatmapECharts.resize();
    if (window.agentVsSystemECharts) window.agentVsSystemECharts.resize();
    if (window.talkTimeComparisonECharts) window.talkTimeComparisonECharts.resize();
    if (window.repeatRateECharts) window.repeatRateECharts.resize();
    if (callVolumeChart) callVolumeChart.resize();
});

// --- Filter Initialization ---

// Initialize Date Range Picker
flatpickr('#summaryDateRange', {
    mode: 'range',
    dateFormat: "Y-m-d",
    maxDate: "today", 
    onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
            summaryDateRange = { start: selectedDates[0], end: selectedDates[1] };
        } else if (selectedDates.length === 0) {
            summaryDateRange = { start: null, end: null };
        }
        renderAgentSummaryTable(); // Re-render table on date change
    }
});

// Initialize Search Input
document.getElementById('agentSearchInput')?.addEventListener('input', function(e) {
    summarySearchTerm = e.target.value.trim();
    renderAgentSummaryTable(); // Re-render table on keystroke
});

// Initial Render
document.addEventListener('DOMContentLoaded', renderAgentSummaryTable);

function clearFilters() {
    // 1. Reset Global Logic State
    summaryDateRange = { start: null, end: null };
    summarySearchTerm = '';

    // 2. Reset Standard Input Fields
    const searchInput = document.getElementById('agentSearchInput');
    if (searchInput) searchInput.value = '';

    // 3. Reset Flatpickr (The "Clean" way)
    const dateInput = document.getElementById('summaryDateRange');
    if (dateInput && dateInput._flatpickr) {
        dateInput._flatpickr.clear(); // This clears the calendar selection and the input text
    } else {
        dateInput.value = ''; // Fallback if flatpickr isn't initialized
    }

    // 4. Update the UI
    renderAgentSummaryTable();
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnReload')?.addEventListener('click', loadDataFromGitHub);
  loadDataFromGitHub();
});