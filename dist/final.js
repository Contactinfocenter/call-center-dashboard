// ── Globals ────────────────────────────────────────────────────────────────
let callVolumeChart = null;
const chartAvg = echarts.init(document.getElementById('mainchart'));
let rawData = {};  // Will hold call records globally
let selectedDate = new Date().toISOString().split('T')[0];

// ── Colors ─────────────────────────────────────────────────────────────────
const TABLER_BLUE   = '#206bc4';
const TABLER_GREEN  = '#2fb344';
const TABLER_YELLOW = '#f59f00';
const TABLER_GRAY   = '#9ca3af';
const TABLER_GRID   = '#f1f5f9';

// ── URLs with cache-busting ────────────────────────────────────────────────
const CALLS_URL = 'https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_call_logs.json?t=' + Date.now();
const DROPS_URL = 'https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_drop_calls.json?t=' + Date.now();

// ── Utilities ──────────────────────────────────────────────────────────────
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

function destroyChart(chart) {
  if (chart && typeof chart.dispose === 'function') {
    chart.dispose();
  }
  return null;
}

// ── Call Volume Chart Computations ─────────────────────────────────────────
function computeSelectedDateHourlyVolume(dateStr) {
  const calls = rawData?.[dateStr] || {};
  const h = Array(24).fill(0);
  for (const id in calls) {
    const d = new Date(calls[id].call_date);
    if (!isNaN(d)) h[d.getHours()]++;
  }
  return h.map(v => v > 0 ? v : null);
}

function computeAvgHourlyVolume() {
  const h = Array(24).fill(0);
  let days = 0;
  for (const date in rawData) {
    const calls = rawData[date] || {};
    const daily = Array(24).fill(0);
    let has = false;
    for (const id in calls) {
      const d = new Date(calls[id].call_date);
      if (!isNaN(d)) { daily[d.getHours()]++; has = true; }
    }
    if (has) { days++; daily.forEach((c, i) => h[i] += c); }
  }
  return h.map(v => days ? Math.round(v / days) : 0);
}

function computeRangeHourlyAverage(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);
  const hourlyTotals = Array(24).fill(0);
  let daysCount = 0;

  for (const dateKey in rawData) {
    const date = new Date(dateKey);
    if (isNaN(date.getTime())) continue;
    if (date >= start && date <= end) {
      const calls = rawData[dateKey] || {};
      const daily = Array(24).fill(0);
      let hasData = false;
      for (const id in calls) {
        const callDate = new Date(calls[id].call_date);
        if (!isNaN(callDate.getTime())) {
          daily[callDate.getHours()]++;
          hasData = true;
        }
      }
      if (hasData) {
        daysCount++;
        daily.forEach((count, h) => hourlyTotals[h] += count);
      }
    }
  }
  return hourlyTotals.map(total => daysCount > 0 ? Math.round(total / daysCount) : 0);
}

// ── Call Volume Chart Rendering ────────────────────────────────────────────
function renderCallVolumeChart() {
  callVolumeChart = destroyChart(callVolumeChart);

  const todayData = computeSelectedDateHourlyVolume(selectedDate);

  let rangeAvgData = null;
  let rangeLabel = null;

  const rangeSelect = document.getElementById('volumeRangeSelect');
  const mode = rangeSelect ? rangeSelect.value : '30';

  if (mode === 'all') {
    rangeAvgData = computeAvgHourlyVolume();
    rangeLabel = 'Daily Average (All Time)';
  } else if (mode === '7' || mode === '30') {
    const daysBack = mode === '7' ? 7 : 30;
    const endDate = new Date(selectedDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - daysBack + 1);
    rangeAvgData = computeRangeHourlyAverage(
      startDate.toISOString().split('T')[0],
      selectedDate
    );
    rangeLabel = `Daily Avg (Last ${daysBack} Days)`;
  } else if (mode === 'custom') {
    const start = document.getElementById('rangeStart')?.value;
    const end = document.getElementById('rangeEnd')?.value;
    if (start && end && start <= end) {
      rangeAvgData = computeRangeHourlyAverage(start, end);
      rangeLabel = `Daily Avg (${formatDateDisplay(start)} – ${formatDateDisplay(end)})`;
    }
  }

  const chartDom = document.getElementById('chart-call-volume');
  if (!chartDom) {
    console.warn("Chart container #chart-call-volume not found");
    return;
  }

  callVolumeChart = echarts.init(chartDom);

  const primaryColor = '#3874ff';
  const rangeColor = '#10b981';
  const textColor = '#64748b';
  const fullHours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

  const allValues = [...(rangeAvgData || []), ...todayData.filter(v => v !== null)];
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
              <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${p.color};margin-right:10px;box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
              <span style="color:#64748b;font-size:13px;">${p.seriesName}:</span>
              <span style="font-weight:700;margin-left:8px;color:#1e293b;">${p.value} calls</span>
            </div>
          `;
        });
        return `
          <div style="padding:10px 14px;background:rgba(255,255,255,0.96);border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);font-family:Inter,system-ui,sans-serif;font-size:14px;min-width:210px;pointer-events:none;">
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
      rangeAvgData && {
        name: rangeLabel || 'Range Average',
        type: 'line',
        data: rangeAvgData,
        smooth: true,
        showSymbol: false,
        z: 6,
        itemStyle: { color: rangeColor },
        lineStyle: { width: 2, color: rangeColor, shadowBlur: 6, shadowColor: 'rgba(16,185,129,0.3)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16,185,129,0.2)' },
            { offset: 1, color: 'rgba(16,185,129,0)' }
          ])
        }
      },
      {
        name: formatDateDisplay(selectedDate),
        type: 'line',
        data: todayData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        z: 10,
        itemStyle: { color: primaryColor, borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 2, color: primaryColor, shadowBlur: 8, shadowColor: 'rgba(56,116,255,0.25)' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56,116,255,0.2)' },
            { offset: 1, color: 'rgba(56,116,255,0)' }
          ])
        },
        emphasis: { itemStyle: { borderWidth: 3, shadowBlur: 10, shadowColor: 'rgba(56,116,255,0.5)' } }
      }
    ].filter(Boolean)
  };

  callVolumeChart.setOption(option);
}

// ── KPI Rendering ──────────────────────────────────────────────────────────
function renderKPIs(records) {
  if (!records || Object.keys(records).length === 0) {
    console.warn("No records data for KPIs");
    document.querySelectorAll('[id^="kpi"], #avgFcrPct').forEach(el => el.textContent = "—");
    return;
  }

  let totalCalls = 0, inboundCount = 0, outboundCount = 0;
  let totalAhtSeconds = 0, fcrCount = 0;
  const agentCallCounts = {};
  const dailyRepeatPercentages = [];

  for (const dateKey in records) {
    const dayRecords = records[dateKey] || {};
    const dailyInboundCallerCounts = {};
    let dailyInboundTotal = 0;

    for (const callId in dayRecords) {
      const call = dayRecords[callId];
      if (!call) continue;

      totalCalls++;
      const direction = (call.direction || 'inbound').toLowerCase().trim();
      if (direction === 'outbound') {
        outboundCount++;
      } else {
        inboundCount++;
        dailyInboundTotal++;
        const phone = call.phone_number;
        if (phone) {
          dailyInboundCallerCounts[phone] = (dailyInboundCallerCounts[phone] || 0) + 1;
        }
      }

      totalAhtSeconds += Number(call.acht) || 0;

      if ((call.status || '').toUpperCase() === 'FCR') {
        fcrCount++;
      }

      const agent = (call.full_name || '').trim();
      if (agent) {
        agentCallCounts[agent] = (agentCallCounts[agent] || 0) + 1;
      }
    }

    if (dailyInboundTotal > 0) {
      let repeats = 0;
      Object.values(dailyInboundCallerCounts).forEach(c => {
        if (c > 1) repeats += (c - 1);
      });
      dailyRepeatPercentages.push((repeats / dailyInboundTotal) * 100);
    }
  }

  const avgRepeatPct = dailyRepeatPercentages.length
    ? Math.round(dailyRepeatPercentages.reduce((a,b)=>a+b,0) / dailyRepeatPercentages.length)
    : 0;

  const avgAHT = totalCalls ? Math.round(totalAhtSeconds / totalCalls) : 0;
  const avgFCRPct = totalCalls ? Math.round((fcrCount / totalCalls) * 100) : 0;

  let topAgent = "—", maxCalls = 0;
  for (const [agent, count] of Object.entries(agentCallCounts)) {
    if (count > maxCalls) {
      maxCalls = count;
      topAgent = agent;
    }
  }

  document.getElementById("kpiTotalCalls").innerHTML = `
    ${totalCalls.toLocaleString()}
    <div style="font-size:0.65em;margin-top:4px;font-weight:500">
      <span style="color:#206bc4">In: ${inboundCount.toLocaleString()}</span>
      <span style="color:#9ca3af;margin:0 4px;">|</span>
      <span style="color:#2fb344">Out: ${outboundCount.toLocaleString()}</span>
    </div>
  `;

  document.getElementById("kpiRepeatPct").textContent = avgRepeatPct + "%";
  document.getElementById("kpiAvgAHT").textContent = formatSecondsToMinutes(avgAHT);
  document.getElementById("kpiActiveAgents").textContent = Object.keys(agentCallCounts).length;
  document.getElementById("kpiTopAgent").textContent = topAgent;
  document.getElementById("avgFcrPct").textContent = avgFCRPct + "%";
}

// ── Average Hourly Chart (Original) ────────────────────────────────────────
function getOriginalOption(categories, totalCalls, inbound, outbound, agents, dropPercent, peakHours, isAvg, activeData) {
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
        const callsPerAgent = agents[idx] > 0 ? (totalCalls[idx] / agents[idx]).toFixed(2) : '0';
        const dropDisp = h.dropCountRaw.toFixed(1);
        const dropLine = h.dropCountRaw > 0
          ? `<span style="color:${TABLER_YELLOW}">●</span> Drop: <b>${dropPercent[idx]}%</b> (${dropDisp} avg)<br/>`
          : '';
        return `
          <div style="font-weight: 600; border-bottom: 1px solid ${TABLER_GRID}; margin-bottom: 8px; padding-bottom: 4px;">
            ${categories[idx]} (Avg/Day)
          </div>
          <span style="color:${TABLER_BLUE}">●</span> Total Calls: <b>${totalCalls[idx]}</b> <small style="color:${TABLER_GRAY}">(In:${inbound[idx]} Out:${outbound[idx]})</small><br/>
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
      { type: 'value', name: 'Agents', position: 'right', splitLine: { show: false }, axisLabel: { color: TABLER_GRAY } },
      { type: 'value', name: 'Drop %', position: 'right', offset: 50, axisLabel: { formatter: '{value}%', color: TABLER_GRAY }, splitLine: { show: false } }
    ],
    series: [
      { name: 'Total Calls', type: 'bar', barWidth: '40%', data: totalCalls, itemStyle: { borderRadius: [2, 2, 0, 0], color: TABLER_BLUE }, markArea: { silent: true, data: peakHours } },
      { name: 'Agents', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, lineStyle: { width: 3, color: TABLER_GREEN }, data: agents },
      { name: 'Drop %', type: 'line', yAxisIndex: 2, connectNulls: false, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, type: 'dashed', color: TABLER_YELLOW }, itemStyle: { color: TABLER_YELLOW, borderColor: '#fff' }, data: dropPercent }
    ]
  };
}

async function loadAndRenderDashboard() {
  console.log("Starting dashboard load...");

  try {
    const [callRes, dropRes] = await Promise.all([
      fetch(CALLS_URL),
      fetch(DROPS_URL)
    ]);

    if (!callRes.ok || !dropRes.ok) {
      throw new Error(`Fetch failed: calls ${callRes.status}, drops ${dropRes.status}`);
    }

    const callData = await callRes.json();
    const dropData = await dropRes.json();

    rawData = callData.records || {};  // ← Important: assign to global rawData

    console.log("Fetched callData:", Object.keys(rawData).length, "days");

    renderKPIs(rawData);

    // Average hourly chart logic
    const allUniqueDays = new Set([
      ...Object.keys(callData.records || {}),
      ...Object.keys(dropData.records || {})
    ]);
    const dayCount = allUniqueDays.size || 1;

    const hourlyCalls = Array(24).fill().map(() => ({ inbound: 0, outbound: 0, total: 0, dropCount: 0 }));
    const hourlyAgentsByDay = Array(24).fill().map(() => ({}));

    Object.entries(callData.records || {}).forEach(([date, dayRecords]) => {
      Object.values(dayRecords).forEach(call => {
        const hour = new Date(call.call_date).getHours();
        if (hour >= 0 && hour < 24) {
          const h = hourlyCalls[hour];
          h.total++;
          if (call.direction === 'inbound') h.inbound++;
          else h.outbound++;

          if (call.full_name) {
            if (!hourlyAgentsByDay[hour][date]) hourlyAgentsByDay[hour][date] = new Set();
            hourlyAgentsByDay[hour][date].add(call.full_name);
          }
        }
      });
    });

    Object.values(dropData.records || {}).flatMap(day => Object.values(day)).forEach(drop => {
      const hour = new Date(drop.datetime).getHours();
      if (hour >= 0 && hour < 24) hourlyCalls[hour].dropCount++;
    });

    const activeHours = hourlyCalls.map((h, i) => {
      const dayCounts = Object.values(hourlyAgentsByDay[i]).map(set => set.size);
      const sumOfAgents = dayCounts.reduce((a, b) => a + b, 0);
      const avgAgents = dayCounts.length > 0 ? Math.round(sumOfAgents / dayCount) : 0;

      return {
        hour: i,
        total: Math.ceil(h.total / dayCount),
        inbound: Math.ceil(h.inbound / dayCount),
        outbound: Math.ceil(h.outbound / dayCount),
        dropCountRaw: h.dropCount / dayCount,
        agentCount: avgAgents
      };
    }).filter(h => h.total > 0 || h.dropCountRaw > 0 || h.agentCount > 0);

    const categories = activeHours.map(h => `${h.hour.toString().padStart(2, '0')}:00`);
    const totalCalls = activeHours.map(h => h.total);
    const agents = activeHours.map(h => h.agentCount);
    const dropPercent = activeHours.map(h =>
      h.dropCountRaw > 0 ? ((h.dropCountRaw / h.total) * 100).toFixed(1) : null
    );

    const sortedTotals = [...totalCalls].sort((a, b) => b - a);
    const threshold = sortedTotals[Math.floor(totalCalls.length * 0.2)] || Math.max(...totalCalls);
    const peakHours = [];
    totalCalls.forEach((v, i) => {
      if (v >= threshold && v > 0) peakHours.push([{ xAxis: categories[i], itemStyle: { color: 'rgba(245, 159, 0, 0.12)' } }, { xAxis: categories[i] }]);
    });

    chartAvg.setOption(getOriginalOption(categories, totalCalls, activeHours.map(h=>h.inbound), activeHours.map(h=>h.outbound), agents, dropPercent, peakHours, true, activeHours));

    chartAvg.setOption({
      title: {
        subtext: `${dayCount} days • ${totalCalls.reduce((a,b)=>a+b,0)} avg calls/day`,
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: '500', color: '#1d273b' },
        subtextStyle: { color: TABLER_GRAY }
      }
    });

    // Also render the call volume chart on initial load
    renderCallVolumeChart();

    console.log("Dashboard rendered successfully");

  } catch (e) {
    console.error("Dashboard load failed:", e);
    chartAvg.setOption({
      title: { text: 'Failed to load dashboard data', left: 'center', top: 'middle' }
    });
  }
}

// ── Event Listeners ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded – starting dashboard render");

  // Date picker
  flatpickr("#datePicker", {
    dateFormat: "Y-m-d",
    defaultDate: selectedDate,
    maxDate: "today",
    onChange: (selectedDates, dateStr) => {
      selectedDate = dateStr;
      renderCallVolumeChart();
    }
  });

  // Custom range pickers
  flatpickr("#rangeStart", { dateFormat: "Y-m-d", maxDate: "today" });
  flatpickr("#rangeEnd", { dateFormat: "Y-m-d", maxDate: "today" });

  // Range select change
  const rangeSelect = document.getElementById('volumeRangeSelect');
  if (rangeSelect) {
    rangeSelect.addEventListener('change', function() {
      document.getElementById('customRangeInputs').style.display = this.value === 'custom' ? 'flex' : 'none';
      renderCallVolumeChart();
    });
  }

  // Apply custom range button
  const applyBtn = document.getElementById('applyCustomRange');
  if (applyBtn) {
    applyBtn.addEventListener('click', renderCallVolumeChart);
  }

  // Initial render
  loadAndRenderDashboard();
});

// Single global resize handler for both charts
window.addEventListener('resize', () => {
  if (callVolumeChart) callVolumeChart.resize();
  if (chartAvg) chartAvg.resize();
});