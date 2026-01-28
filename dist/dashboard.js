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
        const currentNum = getNumericDate(dateKey);
        if (!currentNum) continue;

        // Strict Numeric Comparison
        if (startNum && currentNum < startNum) continue;
        if (endNum && currentNum > endNum) continue;

        const calls = rawData[dateKey] || {};
        for (const callId in calls) {
            const call = calls[callId];
            if (!call) continue;

            // ── Exclude dropped calls ────────────────────────────────────────
            if (call.is_drop === true || call.status?.toUpperCase() === "DROP") {
                continue;  // Skip this call completely
            }

            const agent = (call.full_name || "Unknown").trim();
            const callTimestamp = Date.parse(call.call_date);
            if (isNaN(callTimestamp)) continue; 

            if (!filteredStats[agent]) {
                filteredStats[agent] = {
                    total: 0, 
                    fcr: 0, 
                    ahtSum: 0,
                    uniqueCallers: new Set(),
                    firstPerDay: {}, 
                    lastPerDay: {}
                };
            }

            const s = filteredStats[agent];
            s.total++;
            s.ahtSum += (parseFloat(call.acht) || 0);
            if (call.status === "FCR") s.fcr++;

            if (call.phone_number) {
                s.uniqueCallers.add(call.phone_number);
            }

            const dayKey = call.call_date.split(' ')[0]; 
            if (!s.firstPerDay[dayKey] || callTimestamp < s.firstPerDay[dayKey]) {
                s.firstPerDay[dayKey] = callTimestamp;
            }
            if (!s.lastPerDay[dayKey] || callTimestamp > s.lastPerDay[dayKey]) {
                s.lastPerDay[dayKey] = callTimestamp;
            }
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

function calculateMonthlyAgentRankings() {
  const monthlyStats = {};

  for (const dateKey in rawData) {
    const date = new Date(dateKey);
    const monthKey = date.toISOString().slice(0, 7); // "2026-01"

    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {};
    }

    const calls = rawData[dateKey] || {};
    for (const id in calls) {
      const c = calls[id];
      if (!c || c.is_drop || c.status === "DROP") continue;

      const agent = (c.full_name || "Unknown").trim();
      if (!monthlyStats[monthKey][agent]) {
        monthlyStats[monthKey][agent] = { totalCalls: 0 };
      }
      monthlyStats[monthKey][agent].totalCalls++;
    }
  }

  // Now rank each month
  const rankings = {};
  Object.keys(monthlyStats).sort().forEach(month => {
    const agents = Object.entries(monthlyStats[month])
      .map(([agent, data]) => ({ agent, calls: data.totalCalls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5); // Top 5

    rankings[month] = agents;
  });

  return rankings;
}

// Helper function to format month (add this once, anywhere in your script)
function formatMonthKey(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  
  const [year, month] = monthKey.split('-');
  const shortMonth = new Date(2020, Number(month) - 1, 1)
    .toLocaleString('en-US', { month: 'short' });
  
  const shortYear = year.slice(-2); // '26' from 2026
  
  return `${shortMonth}'${shortYear}`;
}

function renderMonthlyRankings() {
  const container = document.getElementById('monthlyRankingsTable');
  if (!container) return;

  const rankings = calculateMonthlyAgentRankings();

  if (Object.keys(rankings).length === 0) {
    container.innerHTML = `
      <p class="text-center text-muted py-4">
        <i class="ti ti-info-circle me-2"></i>No monthly data available
      </p>
    `;
    return;
  }

  let html = `
    <table class="table table-bordered table-hover table-sm">
      <thead class="bg-primary text-white">
        <tr>
          <th class="text-center">Month</th>
          <th>Rank 1</th>
          <th>Rank 2</th>
          <th>Rank 3</th>
          <th>Rank 4</th>
          <th>Rank 5</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Sort months newest → oldest (most recent at top)
  Object.keys(rankings)
    .sort((a, b) => b.localeCompare(a))
    .forEach(month => {
      const top5 = rankings[month];
      html += `<tr><td class="fw-bold text-center">${formatMonthKey(month)}</td>`;

      for (let i = 0; i < 5; i++) {
        const entry = top5[i];
        html += `<td class="text-nowrap">
          ${entry ? `${entry.agent} <small class="text-muted">(${entry.calls})</small>` : '—'}
        </td>`;
      }

      html += '</tr>';
    });

  html += '</tbody></table>';

  container.innerHTML = html;
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
      renderMonthlyRankings();
      

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

      // Skip DROP calls completely for agent stats
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

      // Total valid calls
      s.total++;
      s.ahtSum += acht;

      // Direction split
      if (direction === "inbound") {
        s.inbound++;

        // FCR only for inbound
        if (status === "FCR") s.fcr++;
        else s.nonFcr++;

      } else if (direction === "outbound") {
        s.outbound++;
      }

      // Unique caller tracking
      if (phone) {
        s.uniqueCallers.add(phone);
        s.callerCounts[phone] = (s.callerCounts[phone] || 0) + 1;
      }

      // Hourly AHT (valid time only)
      if (callDate instanceof Date && !isNaN(callDate)) {
        const hr = callDate.getHours();
        s.hourly[hr].push(acht);
      }
    }
  }

  // Sorted agent list
  agentList = Object.keys(agentStats).sort((a, b) => a.localeCompare(b));
}


// ==================== KPIs ====================
function renderKPIs() {

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

    // ── Phoenix Theme Colors ──────────────────────────────────────────────────
    const phoenixCyan   = '#06b6d4'; // Target / Good
    const phoenixAmber  = '#f59e0b'; // Warning
    const phoenixRust   = '#ea580c'; // High / Critical
    const neutralGray   = '#e2e8f0'; // Empty
    const gridColor     = '#f1f5f9';
    const textColor     = '#64748b';

    // Update Color logic to Phoenix Palette
    const barData = data.map(v => {
        let color = phoenixRust;               // Default: High
        if (v === 0) color = neutralGray;      // No data
        else if (v <= 180) color = phoenixCyan; // Target (Under 3 mins)
        else if (v <= 360) color = phoenixAmber; // Warning (Under 6 mins)
        
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
            subtextStyle: { fontSize: 12, color: textColor }
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            padding: [10, 12],
            extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,0.12); border-radius: 8px;',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
                const p = params[0];
                const val = p.value ?? 0;
                const title = agent || 'Team Average';
                
                return `
                    <div style="font-family: Inter, sans-serif; min-width: 180px;">
                        <div style="font-weight: 600; color: #1e293b; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                            ${title} · ${p.name}
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 8px;"></span>
                                <span style="color:#64748b; font-size: 13px;">Avg AHT:</span>
                            </div>
                            <span style="font-weight: 700; color: #1e293b;">
                                ${formatSecondsToMinutes(Math.round(val))}
                            </span>
                        </div>
                    </div>
                `;
            }
        },
        grid: { left: '3%', right: '4%', bottom: '12%', top: '20%', containLabel: true },
        xAxis: {
            type: 'category',
            data: hours,
            axisLabel: { rotate: 45, color: textColor, fontSize: 11 },
            axisLine: { lineStyle: { color: gridColor } },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: (val) => formatSecondsToMinutes(val), color: textColor },
            splitLine: { lineStyle: { type: 'dashed', color: gridColor } }
        },
        series: [{
            name: 'Average Handle Time',
            type: 'bar',
            data: barData,
            barWidth: '65%',
            itemStyle: { borderRadius: [4, 4, 0, 0] },
            markLine: {
                symbol: 'none',
                label: { position: 'end', fontSize: 10, fontWeight: 700 },
                data: [
                    {
                        yAxis: 180,
                        name: 'Target',
                        lineStyle: { color: phoenixCyan, type: 'dashed', width: 2 },
                        label: { 
                            formatter: 'Target: 3m', 
                            backgroundColor: phoenixCyan, 
                            color: '#fff', 
                            padding: [3, 6], 
                            borderRadius: 4 
                        }
                    },
                    {
                        yAxis: Math.round(overallAvgAht),
                        name: 'Average',
                        lineStyle: { color: textColor, type: 'dotted', width: 2 },
                        label: { 
                            formatter: `Avg: ${formatSecondsToMinutes(Math.round(overallAvgAht))}`, 
                            backgroundColor: textColor, 
                            color: '#fff', 
                            padding: [3, 6], 
                            borderRadius: 4 
                        }
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

  // 2. Initialization Guard
  if (container.clientWidth === 0) return;

  const systemData = computeSelectedDateHourlyVolume(selectedDate);
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  // ── Phoenix Theme Colors ──────────────────────────────────────────────────
  const phoenixCyan  = '#06b6d4'; // Team / System
  const phoenixAmber = '#f59e0b'; // Agent
  const textColor    = '#64748b';
  const gridColor    = '#f1f5f9';

  let series = [{
    name: 'Team Total',
    type: 'line',
    data: systemData,
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    itemStyle: { color: phoenixCyan },
    lineStyle: { width: 3, color: phoenixCyan },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(6, 182, 212, 0.2)' },
        { offset: 1, color: 'rgba(6, 182, 212, 0)' }
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
      symbolSize: 8,
      itemStyle: { color: phoenixAmber, borderColor: '#fff', borderWidth: 2 },
      lineStyle: { width: 4, color: phoenixAmber },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(245, 158, 11, 0.25)' },
          { offset: 1, color: 'rgba(245, 158, 11, 0)' }
        ])
      },
      z: 10, // Ensure agent line stays on top of team area
      connectNulls: false
    });
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 12],
      extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,0.12); border-radius: 8px;',
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1' } },
      formatter: function (params) {
        if (!params || !params.length) return '';
        const hour = params[0].name;
        const dateLabel = typeof formatDateForTooltip === 'function' ? formatDateForTooltip(selectedDate) : selectedDate;

        let rows = '';
        params.forEach(p => {
          // 1. Check for null/undefined/missing values
          // If p.value is null or undefined, show '0' or '-'
          const displayValue = (p.value === undefined || p.value === null) ? '0' : p.value;

          rows += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
              <div style="display: flex; align-items: center;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 8px;"></span>
                <span style="color:#64748b; font-size: 13px;">${p.seriesName}:</span>
              </div>
              <span style="font-weight: 700; margin-left: 20px; color: #1e293b;">${displayValue}</span>
            </div>`;
        });

        return `
          <div style="font-family: Inter, sans-serif; min-width: 200px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
              ${dateLabel} · ${hour}
            </div>
            ${rows}
          </div>`;
      }
    },
    legend: {
      show: true,
      top: 0,
      left: 'left',
      itemGap: 25,
      itemWidth: 18,
      itemHeight: 10,
      icon: 'roundRect',
      textStyle: { color: textColor, fontSize: 13, fontWeight: 500 }
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: hours,
      axisLabel: { rotate: 45, interval: 2, color: textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: 'value',
      axisLabel: { show: false },
      splitLine: { show: false },
      min: 0
    },
    series: series
  };

  window.agentVsSystemECharts = echarts.init(container);
  window.agentVsSystemECharts.setOption(option);
  
  window.addEventListener('resize', () => window.agentVsSystemECharts && window.agentVsSystemECharts.resize());
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

  // 2. INITIALIZATION GUARD
  if (container.clientWidth === 0) return;

  const { systemData, agentData } = getHourlyTalkTime(agent, selectedDate);
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  // ── Phoenix Theme Colors ──────────────────────────────────────────────────
  const phoenixCyan  = '#06b6d4'; // Team Total
  const phoenixAmber = '#f59e0b'; // Agent
  const textColor    = '#64748b';
  const gridColor    = '#f1f5f9';

  let series = [
    {
      name: 'Team Total',
      type: 'line',
      data: systemData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: phoenixCyan },
      lineStyle: { width: 3, color: phoenixCyan },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(6, 182, 212, 0.2)' },
          { offset: 1, color: 'rgba(6, 182, 212, 0)' }
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
      symbolSize: 8,
      itemStyle: { color: phoenixAmber, borderColor: '#fff', borderWidth: 2 },
      lineStyle: { width: 4, color: phoenixAmber },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(245, 158, 11, 0.25)' },
          { offset: 1, color: 'rgba(245, 158, 11, 0)' }
        ])
      },
      z: 10, // Keep Agent on top
      connectNulls: false
    });
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 12],
      extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,0.12); border-radius: 8px;',
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1' } },
      formatter: function (params) {
        if (!params || !params.length) return '';
        const hour = params[0].name;
        const dateLabel = typeof formatDateForTooltip === 'function' ? formatDateForTooltip(selectedDate) : selectedDate;

        let rows = '';
        params.forEach(p => {
          const val = p.value ?? 0;
          const displayTime = typeof formatSecondsToMinutes === 'function' ? formatSecondsToMinutes(val) : val;
          
          rows += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
              <div style="display: flex; align-items: center;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 8px;"></span>
                <span style="color:#64748b; font-size: 13px;">${p.seriesName}:</span>
              </div>
              <span style="font-weight: 700; margin-left: 20px; color: #1e293b;">${displayTime}</span>
            </div>`;
        });

        return `
          <div style="font-family: Inter, sans-serif; min-width: 210px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
              ${dateLabel} · ${hour}
            </div>
            ${rows}
          </div>`;
      }
    },
    legend: {
      show: true,
      top: 0,
      left: 'center',
      itemGap: 25,
      itemWidth: 18,
      itemHeight: 10,
      icon: 'roundRect',
      textStyle: { color: textColor, fontSize: 13, fontWeight: 500 }
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: hours,
      axisLabel: { rotate: 45, interval: 3, color: textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { show: false }, 
      splitLine: { show: false }, 
      axisLine: { show: false },
      min: 0
    },
    series: series
  };

  window.talkTimeComparisonECharts = echarts.init(container);
  window.talkTimeComparisonECharts.setOption(option);

  window.addEventListener('resize', () => window.talkTimeComparisonECharts && window.talkTimeComparisonECharts.resize());
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

  // Today's hourly data (Excluding drops)
  const inboundToday = computeHourlyVolume(selectedDate, { excludeDrop: true, direction: 'inbound' });
  const outboundToday = computeHourlyVolume(selectedDate, { excludeDrop: true, direction: 'outbound' });

  let rangeAvgInbound = null;
  let rangeAvgOutbound = null;
  let rangeLabel = "";

  const rangeSelect = document.getElementById('volumeRangeSelect');
  const mode = rangeSelect ? rangeSelect.value : '30';

  // ── UPDATED SHORT FORM LABELS ──────────────────────────────────────────
  if (mode === 'all') {
    rangeAvgInbound = computeAllTimeAvgHourly({ excludeDrop: true, direction: 'inbound' });
    rangeAvgOutbound = computeAllTimeAvgHourly({ excludeDrop: true, direction: 'outbound' });
    rangeLabel = 'All Time'; 
  } else if (mode === '7' || mode === '30') {
    const daysBack = mode === '7' ? 7 : 30;
    const endDate = new Date(selectedDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - daysBack + 1);

    rangeAvgInbound = computeRangeHourlyAverage(startDate.toISOString().split('T')[0], selectedDate, { excludeDrop: true, direction: 'inbound' });
    rangeAvgOutbound = computeRangeHourlyAverage(startDate.toISOString().split('T')[0], selectedDate, { excludeDrop: true, direction: 'outbound' });
    rangeLabel = `Last ${daysBack} Days`;
  } else if (mode === 'custom') {
    const start = document.getElementById('rangeStart')?.value;
    const end = document.getElementById('rangeEnd')?.value;
    if (start && end && start <= end) {
      rangeAvgInbound = computeRangeHourlyAverage(start, end, { excludeDrop: true, direction: 'inbound' });
      rangeAvgOutbound = computeRangeHourlyAverage(start, end, { excludeDrop: true, direction: 'outbound' });
      rangeLabel = `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
    }
  }

  const chartDom = document.getElementById('chart-call-volume');
  if (!chartDom) return;
  callVolumeChart = echarts.init(chartDom);

  // ── Phoenix Theme Colors ──────────────────────────────────────────────────
  const todayInboundColor   = '#f59e0b'; // Amber (Inbound)
  const todayOutboundColor  = '#06b6d4'; // Cyan (Outbound)
  const rangeInboundColor   = '#fbbf24'; // Lighter Amber (Avg)
  const rangeOutboundColor  = '#22d3ee'; // Lighter Cyan (Avg)
  const textColor           = '#475569';
  const gridColor           = '#f1f5f9';

  const fullHours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-radius: 8px;',
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1', width: 1.5 } },
      formatter: function (params) {
        let rows = `<div style="font-weight:600;color:#1e293b;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${params[0].name}</div>`;
        params.forEach(p => {
          rows += `
            <div style="display:flex;align-items:center;margin:4px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:8px;"></span>
              <span style="color:#475569;font-size:13px;">${p.seriesName}:</span>
              <span style="font-weight:700;margin-left:auto;color:#1e293b;">${p.value}</span>
            </div>`;
        });
        return `<div style="min-width:180px;">${rows}</div>`;
      }
    },

    // ── Fixed Legend with SHORT FORM labels ──────────────────────────────────
    legend: {
      show: true,
      top: 0,
      itemGap: 25,
      itemWidth: 18,    
      itemHeight: 10,   
      icon: 'roundRect',
      textStyle: { color: textColor, fontSize: 12, fontWeight: 500 },
      data: [
        `Inbound ${formatDateDisplay(selectedDate)}`,
        `Outbound ${formatDateDisplay(selectedDate)}`,
        rangeAvgInbound ? `Inbound Avg (${rangeLabel})` : null,
        rangeAvgOutbound ? `Outbound Avg (${rangeLabel})` : null
      ].filter(Boolean)
    },

    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: fullHours, 
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, fontSize: 11, interval: 3 }
    },
    yAxis: { 
      type: 'value', 
      show: true,
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLabel: { color: textColor }
    },

    series: [
      rangeAvgInbound && {
        name: `Inbound Avg (${rangeLabel})`,
        type: 'line',
        data: rangeAvgInbound,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: rangeInboundColor },
        itemStyle: { color: rangeInboundColor }
      },
      rangeAvgOutbound && {
        name: `Outbound Avg (${rangeLabel})`,
        type: 'line',
        data: rangeAvgOutbound,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: rangeOutboundColor },
        itemStyle: { color: rangeOutboundColor }
      },
      {
        name: `Inbound ${formatDateDisplay(selectedDate)}`,
        type: 'line',
        data: inboundToday,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 4, color: todayInboundColor },
        itemStyle: { color: todayInboundColor, borderColor: '#fff', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245,158,11,0.2)' },
            { offset: 1, color: 'rgba(245,158,11,0)' }
          ])
        }
      },
      {
        name: `Outbound ${formatDateDisplay(selectedDate)}`,
        type: 'line',
        data: outboundToday,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 4, color: todayOutboundColor },
        itemStyle: { color: todayOutboundColor, borderColor: '#fff', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(6,182,212,0.2)' },
            { offset: 1, color: 'rgba(6,182,212,0)' }
          ])
        }
      }
    ].filter(Boolean)
  };

  callVolumeChart.setOption(option);

  if (callVolumeChart.resizeListener) window.removeEventListener('resize', callVolumeChart.resizeListener);
  callVolumeChart.resizeListener = () => callVolumeChart.resize();
  window.addEventListener('resize', callVolumeChart.resizeListener);
}


//Capacity-chart
// Global Styling Constants
// ── Phoenix Theme Colors ──────────────────────────────────────────────────
const PHOENIX_CYAN  = '#06b6d4';  // Total Calls (System)
const PHOENIX_GREEN = '#10b981';  // Agents (Active)
const PHOENIX_AMBER = '#f59e0b';  // Drop % / Warnings
const PHOENIX_GRAY  = '#64748b';  // Labels
const PHOENIX_GRID  = '#f1f5f9';  // Grid lines

const chartAvg = echarts.init(document.getElementById('capacity-chart'));

async function loadAverageChartMerged() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/dist/data/calls/all_calls.json');
    const rawData = await res.json();

    const allDates = Object.keys(rawData.calls || {});
    const dayCount = allDates.length || 1;

    const hourlyCalls = Array.from({ length: 24 }, () => ({ inbound: 0, outbound: 0, total: 0, dropCount: 0 }));
    const hourlyAgentsByDay = Array.from({ length: 24 }, () => ({}));

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

    const activeHours = hourlyCalls.map((h, i) => {
      const dayCounts = Object.values(hourlyAgentsByDay[i]).map(set => set.size);
      const avgAgents = dayCounts.length ? Math.round(dayCounts.reduce((a, b) => a + b, 0) / dayCount) : 0;

      return {
        hour: i,
        total: Math.ceil(h.total / dayCount),
        inbound: Math.ceil(h.inbound / dayCount),
        outbound: Math.ceil(h.outbound / dayCount),
        dropCountRaw: h.dropCount / dayCount,
        agentCount: avgAgents
      };
    }).filter(h => h.total > 0 || h.dropCountRaw > 0);

    const categories = activeHours.map(h => `${h.hour.toString().padStart(2, '0')}:00`);

    // ── Data Mapping with Line Break Logic (null if 0) ───────────────────────
    const totalCalls = activeHours.map(h => h.total > 0 ? h.total : null);
    const inbound     = activeHours.map(h => h.inbound);
    const outbound    = activeHours.map(h => h.outbound);

    // Agents line breaks if 0
    const agents = activeHours.map(h => h.agentCount > 0 ? h.agentCount : null);

    // Drop Rate line breaks if 0
    const dropPercent = activeHours.map(h =>
      (h.total > 0 && h.dropCountRaw > 0)
        ? ((h.dropCountRaw / h.total) * 100).toFixed(1)
        : null
    );

    // Peak hour highlight logic
    const sortedTotals = [...totalCalls].filter(v => v !== null).sort((a, b) => b - a);
    const threshold = sortedTotals[Math.floor(sortedTotals.length * 0.2)] || Math.max(...sortedTotals);
    const peakHours = [];

    activeHours.forEach((h, i) => {
      if (h.total >= threshold && h.total > 0) {
        peakHours.push([
          { xAxis: categories[i], itemStyle: { color: 'rgba(245,159,0,0.12)' } },
          { xAxis: categories[i] }
        ]);
      }
    });

    chartAvg.setOption(getMergedChartOption(
      categories,
      totalCalls,
      inbound,
      outbound,
      agents,
      dropPercent,
      peakHours,
      activeHours
    ));
  } catch (e) {
    console.error(e);
  }
}

function getMergedChartOption(categories, totalCalls, inbound, outbound, agents, dropPercent, peakHours, activeData) {
  return {
    backgroundColor: 'transparent',

    legend: {
      show: true,
      top: 0,
      itemGap: 25,
      icon: 'roundRect',
      textStyle: {
        color: PHOENIX_GRAY,
        fontSize: 12,
        fontWeight: 500
      },
      data: [
        {
          name: 'Total Calls',
          icon: 'roundRect',
          itemStyle: { color: PHOENIX_CYAN }
        },
        {
          name: 'Agents',
          icon: 'roundRect',
          itemStyle: { color: PHOENIX_GREEN }
        },
        {
          name: 'Drop %',
          icon: 'roundRect',
          itemStyle: { color: PHOENIX_AMBER }
        }
      ]
    },

    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-radius: 8px;',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: 'rgba(0,0,0,0.02)' }
      },
      formatter: function(params) {
        const idx = params[0].dataIndex;
        const h = activeData[idx];
        const currentAgents = agents[idx] || 0;
        const currentTotal = totalCalls[idx] || 0;
        const callsPerAgent = currentAgents > 0 ? (currentTotal / currentAgents).toFixed(1) : '0';

        return `
          <div style="font-family: Inter, sans-serif; min-width: 200px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
              ${categories[idx]} <span style="font-weight:400; font-size:12px; color:#64748b;">(Daily Average)</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span><span style="color:${PHOENIX_CYAN}; margin-right:5px;">●</span>Total Calls:</span>
              <span style="font-weight:700;">${currentTotal} <small style="font-weight:400; color:#64748b;">(I:${inbound[idx]} O:${outbound[idx]})</small></span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span><span style="color:${PHOENIX_AMBER}; margin-right:5px;">●</span>Drop Rate:</span>
              <span style="font-weight:700;">${dropPercent[idx] ? dropPercent[idx] + '%' : '0%'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span><span style="color:${PHOENIX_GREEN}; margin-right:5px;">●</span>Avg Agents:</span>
              <span style="font-weight:700;">${currentAgents}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px dashed #e2e8f0; margin-top:5px; padding-top:5px;">
              <span style="color:#64748b;">Efficiency:</span>
              <span style="font-weight:700; color:#1e293b;">${callsPerAgent} calls/agent</span>
            </div>
          </div>`;
      }
    },

    grid: {
      left: '3%',
      right: '8%',
      top: 60,
      bottom: '5%',
      containLabel: true
    },

    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: PHOENIX_GRID } },
      axisLabel: { color: PHOENIX_GRAY, fontSize: 11 }
    },

    yAxis: [
      {
        type: 'value',
        name: 'Avg Calls',
        splitLine: { lineStyle: { color: PHOENIX_GRID, type: 'dashed' } },
        axisLabel: { color: PHOENIX_GRAY }
      },
      {
        type: 'value',
        name: 'Agents',
        position: 'right',
        splitLine: { show: false },
        axisLabel: { color: PHOENIX_GRAY }
      },
      {
        type: 'value',
        name: 'Drop %',
        position: 'right',
        offset: 40,
        axisLabel: { formatter: '{value}%', color: PHOENIX_GRAY },
        splitLine: { show: false }
      }
    ],

    series: [
      {
        name: 'Total Calls',
        type: 'bar',
        barWidth: '50%',
        data: totalCalls,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: PHOENIX_CYAN
        },
        markArea: {
          silent: true,
          data: peakHours
        }
      },
      {
        name: 'Agents',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 3, color: PHOENIX_GREEN },
        data: agents
      },
      {
        name: 'Drop %',
        type: 'line',
        yAxisIndex: 2,
        symbol: 'circle',
        symbolSize: 8,
        connectNulls: false,
        lineStyle: { width: 2, type: 'dashed', color: PHOENIX_AMBER },
        itemStyle: {
          color: PHOENIX_AMBER,
          borderColor: '#fff',
          borderWidth: 2
        },
        data: dropPercent
      }
    ]
  };
}

loadAverageChartMerged();

window.addEventListener('resize', () => chartAvg.resize());


// ==================== REPEAT RATE CHART ====================
function renderRepeatRateChartForSelectedDate() {
  if (window.repeatRateECharts) {
    window.repeatRateECharts.dispose();
    window.repeatRateECharts = null;
  }

  const dom = document.getElementById('repeatRateChart');
  if (!dom) return;

  const calls = getCallsForDate(selectedDate);
  const agentStatsToday = {};

  for (const id in calls) {
    const c = calls[id];
    if (!c) continue;
    // Exclude drops and outbound to keep repeat rate accurate to inbound customers
    if (c.is_drop === true || c.status === "DROP") continue;
    if (c.direction !== "inbound") continue;

    const agent = (c.full_name || "Unknown").trim();
    const phone = c.phone_number;

    if (!agentStatsToday[agent]) {
      agentStatsToday[agent] = { total: 0, unique: new Set() };
    }

    agentStatsToday[agent].total++;
    if (phone) agentStatsToday[agent].unique.add(phone);
  }

  const agentData = [];
  let totalInboundCalls = 0;
  let totalUniqueCallers = 0;

  Object.keys(agentStatsToday).forEach(agent => {
    const s = agentStatsToday[agent];
    const total = s.total;
    const unique = s.unique.size;
    const repeatRate = total > 0 ? Math.round(((total - unique) / total) * 100) : 0;

    if (repeatRate > 0) {
      agentData.push({ agent, repeatRate });
    }

    totalInboundCalls += total;
    totalUniqueCallers += unique;
  });

  agentData.sort((a, b) => a.repeatRate - b.repeatRate);

  const categories = agentData.map(d => d.agent);
  const repeatRates = agentData.map(d => d.repeatRate);

  const overallAvg = totalInboundCalls > 0 
    ? Math.round(((totalInboundCalls - totalUniqueCallers) / totalInboundCalls) * 100) 
    : 0;

  if (agentData.length === 0) {
    dom.innerHTML = '<div class="text-center text-muted p-5">No repeat inbound callers on this date</div>';
    return;
  }

  // ── Phoenix Palette Constants ──────────────────────────────────────────
  const phoenixAmber      = '#f59e0b'; // Primary Amber
  const phoenixOrange     = '#ea580c'; // Deep Orange for higher rates
  const phoenixLightAmber = '#fbbf24'; // Warning level
  const phoenixCyan       = '#06b6d4'; // Contrast color (used for marks/avg)
  const gridColor         = '#f1f5f9';
  const textColor         = '#64748b';

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-radius: 8px;',
      axisPointer: { type: 'shadow' },
      formatter: function (params) {
        const p = params[0];
        const rate = p.value;
        // Tooltip dot color logic using Phoenix hues
        const dotColor = rate > 5 ? phoenixOrange : rate > 2 ? phoenixAmber : phoenixLightAmber;

        return `
          <div style="font-family: Inter, sans-serif; min-width: 180px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">${p.name}</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; margin-right: 8px;"></span>
                <span style="color: #64748b; font-size: 13px;">Repeat Rate:</span>
              </div>
              <span style="font-weight: 700; color: #1e293b;">${rate}%</span>
            </div>
          </div>`;
      }
    },
    grid: { left: '3%', right: '10%', bottom: '3%', top: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}%', color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#1e293b', fontSize: 12, fontWeight: 500 },
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false }
    },
    series: [{
      name: 'Inbound Repeat Rate',
      type: 'bar',
      barWidth: '60%',
      data: repeatRates.map(val => ({
        value: val,
        itemStyle: {
          // Color progression within the Phoenix palette
          color: val > 5 ? phoenixOrange : val > 2 ? phoenixAmber : phoenixLightAmber,
          borderRadius: [0, 4, 4, 0]
        }
      })),
      markLine: {
        symbol: 'none',
        label: { 
          position: 'end', 
          formatter: `Avg: ${overallAvg}%`, 
          backgroundColor: phoenixCyan, // Using Cyan for the average to make it pop
          color: '#fff', 
          padding: [4, 8], 
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 'bold'
        },
        lineStyle: { color: phoenixCyan, type: 'dashed', width: 2 },
        data: [{ xAxis: overallAvg }]
      }
    }]
  };

  window.repeatRateECharts = echarts.init(dom);
  window.repeatRateECharts.setOption(option);
  
  window.addEventListener('resize', () => window.repeatRateECharts && window.repeatRateECharts.resize());
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

// drop call treand 




// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnReload')?.addEventListener('click', loadDataFromGitHub);
  loadDataFromGitHub();
});


/**
 * DROP TRENDS 
 */
let dropTrendsChart = null;
let dropDateRangePicker = null;

function renderDropTrendsChart() {
    const dom = document.getElementById('dropTrendsChart');
    if (!dom) return;

    // 1. DATA SOURCE
    let sourceData = (typeof rawData !== 'undefined') ? (rawData.calls || rawData) : null;
    if (!sourceData || Object.keys(sourceData).length === 0) {
        setTimeout(renderDropTrendsChart, 1000);
        return;
    }

    if (!dropTrendsChart) dropTrendsChart = echarts.init(dom);

    // 2. FILTER LOGIC
    const allAvailableDates = Object.keys(sourceData).sort();
    let filteredDates = [];

    // Check if Flatpickr has a range
    if (dropDateRangePicker && dropDateRangePicker.selectedDates.length === 2) {
        const [start, end] = dropDateRangePicker.selectedDates;
        const sTime = new Date(start).setHours(0,0,0,0);
        const eTime = new Date(end).setHours(23,59,59,999);

        filteredDates = allAvailableDates.filter(d => {
            const current = new Date(d).getTime();
            return current >= sTime && current <= eTime;
        });
    } else {
        // RESET STATE: Default to most recent 15 dates
        filteredDates = allAvailableDates.slice(-15);
    }

    // 3. PROCESS DATA (Daily/Hourly/Percent)
    const mode = document.getElementById('dropTrendMode')?.value || 'daily';
    const PHX_CYAN = '#06b6d4', PHX_AMBER = '#f59e0b', PHX_GRAY = '#64748b';
    
    const hourlyDrops = Array(24).fill(0);
    let totalDaysWithDrops = 0;

    const chartSeriesData = filteredDates.map(date => {
        const calls = sourceData[date] || {};
        let dCount = 0, iCount = 0, dayHadDrop = false;

        Object.values(calls).forEach(c => {
            const isDrop = c.status === "DROP" || c.status === "FAILED" || c.is_drop === true;
            if (isDrop) {
                dCount++;
                const hr = new Date(c.call_date).getHours();
                if (!isNaN(hr)) { hourlyDrops[hr]++; dayHadDrop = true; }
            }
            if (c.direction === "inbound") iCount++;
        });
        if (dayHadDrop) totalDaysWithDrops++;
        return { date, drops: dCount, pct: iCount > 0 ? ((dCount / (dCount + iCount)) * 100).toFixed(1) : 0 };
    });

    // 4. ECHARTS CONFIG
    let option = {
        tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: [10, 12],
    extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,0.12); border-radius: 8px;',
    axisPointer: { 
        type: 'line', 
        lineStyle: { color: '#cbd5e1', type: 'dashed' } 
    },
    formatter: function (params) {
        if (!params || !params.length) return '';
        
        // Get the X-axis label (Date or Hour)
        const xLabel = params[0].name;
        
        let rows = '';
        params.forEach(p => {
            // Handle undefined/null values safely
            const val = (p.value === undefined || p.value === null) ? '0' : p.value;
            // Add % symbol if it's the Rate or Drop % series
            const suffix = (p.seriesName.includes('Rate') || p.seriesName.includes('%')) ? '%' : '';

            rows += `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
                    <div style="display: flex; align-items: center;">
                        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 8px;"></span>
                        <span style="color:#64748b; font-size: 13px;">${p.seriesName}:</span>
                    </div>
                    <span style="font-weight: 700; margin-left: 20px; color: #1e293b;">${val}${suffix}</span>
                </div>`;
        });

        return `
            <div style="font-family: Inter, sans-serif; min-width: 180px;">
                <div style="font-weight: 600; color: #1e293b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                    ${xLabel}
                </div>
                ${rows}
            </div>`;
    }
},
        grid: { top: 60, left: '3%', right: '4%', bottom: '5%', containLabel: true },
        xAxis: {
            type: 'category',
            data: mode === 'hourly' 
                ? Array.from({length: 24}, (_, i) => `${i.toString().padStart(2,'0')}:00`)
                : filteredDates.map(d => typeof formatDateDisplay === 'function' ? formatDateDisplay(d) : d),
            axisLabel: { color: PHX_GRAY }
        },
        yAxis: [
            { type: 'value', name: 'Drops' },
            { type: 'value', name: '%', position: 'right', max: 100, show: mode !== 'hourly' }
        ],
        series: []
    };

    // Series logic remains same as before...
    if (mode === 'daily') {
        option.series = [
            { name: 'Drops', type: 'bar', data: chartSeriesData.map(d => d.drops), itemStyle: { color: PHX_CYAN } },
            { name: 'Rate', type: 'line', yAxisIndex: 1, data: chartSeriesData.map(d => d.pct), itemStyle: { color: PHX_AMBER } }
        ];
    } else if (mode === 'hourly') {
        const avgHourly = hourlyDrops.map(v => totalDaysWithDrops > 0 ? (v/totalDaysWithDrops).toFixed(1) : 0);
        option.series = [{ name: 'Avg Drops', type: 'bar', data: avgHourly, itemStyle: { color: PHX_AMBER } }];
    } else {
        option.series = [{ name: 'Drop %', type: 'line', areaStyle: { opacity: 0.2 }, data: chartSeriesData.map(d => d.pct), itemStyle: { color: PHX_AMBER } }];
    }

    dropTrendsChart.setOption(option, true);
}

// 5. INITIALIZE
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Flatpickr with Wrap: true to enable the reset button
    dropDateRangePicker = flatpickr("#flatpickr-wrapper", {
        wrap: true, 
        mode: "range",
        dateFormat: "Y-m-d",
        onClose: function(selectedDates) {
            if (selectedDates.length === 2) renderDropTrendsChart();
        },
        onChange: function(selectedDates) {
            // Re-render if the field is cleared via the Reset button
            if (selectedDates.length === 0) renderDropTrendsChart();
        }
    });

    document.getElementById('dropTrendMode').addEventListener('change', renderDropTrendsChart);
    
    setTimeout(renderDropTrendsChart, 500);
});

window.addEventListener('resize', () => dropTrendsChart && dropTrendsChart.resize());