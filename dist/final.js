  // Global chart instance
  let callVolumeChart = null;
  const chartAvg = echarts.init(document.getElementById('mainchart'));

  // Colors
  const TABLER_BLUE   = '#206bc4';
  const TABLER_GREEN  = '#2fb344';
  const TABLER_YELLOW = '#f59f00';
  const TABLER_GRAY   = '#9ca3af';
  const TABLER_GRID   = '#f1f5f9';

  const CALLS_URL = 'https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_call_logs.json?t=' + Date.now();
  const DROPS_URL = 'https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_drop_calls.json?t=' + Date.now();

  // ── Utilities ────────────────────────────────────────────────────────
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
    if (chart && typeof chart.dispose === 'function') chart.dispose();
    return null;
  }

  // ── KPI Render with debug ────────────────────────────────────────────
  function renderKPIs(records) {
    console.log("renderKPIs called with records:", records);

    if (!records || Object.keys(records).length === 0) {
      console.warn("No records data for KPIs – showing fallback");
      document.querySelectorAll('[id^="kpi"]').forEach(el => el.textContent = "—");
      return;
    }

    console.log("Processing " + Object.keys(records).length + " days for KPIs");

    let totalCalls = 0, inboundCount = 0, outboundCount = 0, totalAhtSum = 0;
    const agentCallCounts = {};
    const dailyRepeatPercentages = [];
    const outboundList = ["CARNIVAL", "SYLHET"];

    for (const dateKey in records) {
      const dayRecords = records[dateKey] || {};
      console.log(`  Day ${dateKey}: ${Object.keys(dayRecords).length} calls`);

      const dailyInboundCallerCounts = {};
      let dailyInboundTotal = 0, dailyInboundRepeats = 0;

      for (const callId in dayRecords) {
        const call = dayRecords[callId];
        if (!call) continue;

        totalCalls++;
        const cid = (call.campaign_id || "").toUpperCase().trim();

        if (outboundList.includes(cid)) {
          outboundCount++;
        } else {
          inboundCount++;
          dailyInboundTotal++;
          const phone = call.phone_number;
          if (phone) dailyInboundCallerCounts[phone] = (dailyInboundCallerCounts[phone] || 0) + 1;
        }

        totalAhtSum += parseFloat(call.acht) || 0;
        const agent = (call.full_name || "Unknown").trim();
        if (agent !== "Unknown") agentCallCounts[agent] = (agentCallCounts[agent] || 0) + 1;
      }

      if (dailyInboundTotal > 0) {
        let repeats = 0;
        for (const count of Object.values(dailyInboundCallerCounts)) {
          if (count > 1) repeats += (count - 1);
        }
        dailyRepeatPercentages.push((repeats / dailyInboundTotal) * 100);
      }
    }

    const repeatPctAvg = dailyRepeatPercentages.length > 0
      ? Math.round(dailyRepeatPercentages.reduce((a, b) => a + b, 0) / dailyRepeatPercentages.length)
      : 0;

    console.log("KPI results:", { totalCalls, inboundCount, outboundCount, repeatPctAvg, avgAHT: totalCalls > 0 ? Math.round(totalAhtSum / totalCalls) : 0 });

    document.getElementById("kpiTotalCalls").innerHTML = `
      ${totalCalls.toLocaleString()}
      <div style="font-size: 0.65em; margin-top: 4px; font-weight: 500;">
        <span style="color: #206bc4;">In: ${inboundCount.toLocaleString()}</span>
        <span style="color: #9ca3af; margin: 0 4px;">|</span>
        <span style="color: #2fb344;">Out: ${outboundCount.toLocaleString()}</span>
      </div>`;
    document.getElementById("kpiRepeatPct").textContent = repeatPctAvg + "%";
    document.getElementById("kpiAvgAHT").textContent = formatSecondsToMinutes(totalCalls > 0 ? Math.round(totalAhtSum / totalCalls) : 0);
    document.getElementById("kpiActiveAgents").textContent = Object.keys(agentCallCounts).length.toLocaleString();

    let topAgent = "—", maxCalls = 0;
    for (const [agent, count] of Object.entries(agentCallCounts)) {
      if (count > maxCalls) { maxCalls = count; topAgent = agent; }
    }
    document.getElementById("kpiTopAgent").textContent = topAgent;
  }

  // ── Average Hourly Chart ─────────────────────────────────────────────
  async function loadAndRenderDashboard() {
    console.log("Starting dashboard load...");

    try {
      const [callRes, dropRes] = await Promise.all([
        fetch('https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_call_logs.json?t=' + Date.now()),
        fetch('https://raw.githubusercontent.com/Contactinfocenter/call-center-dashboard/main/data/detailed_drop_calls.json?t=' + Date.now())
      ]);

      if (!callRes.ok || !dropRes.ok) {
        throw new Error(`Fetch failed: calls ${callRes.status}, drops ${dropRes.status}`);
      }

      const callData = await callRes.json();
      const dropData = await dropRes.json();

      console.log("Fetched callData:", Object.keys(callData.records || {}).length, "days");
      console.log("Fetched dropData:", Object.keys(dropData.records || {}).length, "days");

      // Render KPIs
      renderKPIs(callData.records || {});

      // Chart data
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

      console.log("Dashboard rendered successfully");

    } catch (e) {
      console.error("Dashboard load failed:", e);
      chartAvg.setOption({
        title: { text: 'Failed to load dashboard data', left: 'center', top: 'middle' }
      });
    }
  }

  // Your getOriginalOption function (keep your full version)
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

  // ── Initialization ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded – starting dashboard render");
    loadAndRenderDashboard();
  });

  window.addEventListener('resize', () => chartAvg.resize());