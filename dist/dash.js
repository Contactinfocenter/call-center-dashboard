  // ===============================
// Supabase Configuration
// ===============================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'




    const SUPABASE_URL = 'https://ubonrsjbcvzpoizmidlw.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_5HdtgopObCBVHwqotJEQCw_ByDIyw8v';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    
    const BILLING_ISSUE_REASON = "Billing Issue";
    const DEFAULT_TREND_DAYS = 15;

    const GENERAL_ACHT_COLOR     = '#f59e0b';
    const GENERAL_VOLUME_COLOR   = '#3b82f6';
    const BILLING_ACHT_COLOR     = '#a855f7';
    const BILLING_VOLUME_COLOR   = '#06b6d4';

    const REGION_COLORS = { 'Rural': '#10b981', 'Urban': '#f59e0b', 'N/A': '#94a3b8' };
    const FCR_COLORS = ['#10b981', '#f97316'];

    let selectedDate = null;
    let groupedData = {};
    let availableDates = [];

    // Track chart instances to destroy on update
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
      fcrTrendChart: null
    };

    chartInstances.callTrendChart = null;

    let trendDateRange = null;

    // Utilities
    function formatTime(seconds) {
      if (!seconds && seconds !== 0) return "0s";
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }

    function getHourFromDate(dateStr) {
      const d = new Date(dateStr);
      return isNaN(d) ? "00" : String(d.getHours()).padStart(2, '0');
    }

    function categorizeBillingCall(call) {
      return (call.comments || "Comment Not Provided").trim();
    }

    function normalizeRegion(raw) {
      if (raw === null || raw === undefined) return "N/A";
      const v = String(raw).trim().toLowerCase();
      if (!v) return "N/A";
      const ruralSet = new Set(['rural','r','ru','village','vlg','rural area']);
      const urbanSet = new Set(['urban','u','city','town','urban area','metro','metropolitan']);
      const naSet = new Set(['n/a','na','none','-','null','undefined','unknown','unk']);
      if (ruralSet.has(v)) return "Rural";
      if (urbanSet.has(v)) return "Urban";
      if (naSet.has(v)) return "N/A";
      if (v.includes('rural')) return "Rural";
      if (v.includes('urban')) return "Urban";
      return "N/A";
    }

function hexToRgba(hex, opacity) {
  // Remove # if present and normalize
  hex = hex.replace('#', '').toLowerCase();
  
  // Expand shorthand (e.g. #f59 → #ff5599)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  // Parse RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Fallback for invalid input
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    console.warn(`Invalid hex color: ${hex}`);
    return `rgba(0, 0, 0, ${opacity})`;
  }
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}  

    // Data Normalization — fixed to use row.region correctly
function normalizeFromRows(rows) {
  const normalized = {};

  rows.forEach((row) => {

    const rawDate =
      row.call_date ??
      row.created_at ??
      row.callDate ??
      '';

    if (!rawDate) return;

    // Always convert safely
    const d = new Date(rawDate);
    if (isNaN(d)) return;

    const datePart = d.toISOString().split('T')[0];

    if (!normalized[datePart]) {
      normalized[datePart] = [];
    }

    normalized[datePart].push(row);
  });

  return normalized;
}




// ECharts Area Chart — with destroy
function createEChartsAreaChart(containerId, seriesData, categories) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (chartInstances[containerId]) {
    chartInstances[containerId].dispose();
  }

  const chart = echarts.init(el);
  chartInstances[containerId] = chart;

  // Phoenix v1.24.0 Color Palette
  const colors = ['#3874ff', '#f59e0b', '#10b981']; 
  const comparisonColor = '#cbd0dd'; // Used for the dashed line if needed

  const formattedSeries = seriesData.map((s, index) => {
    const mainColor = colors[index] || colors[0];
    
    return {
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: 0.4,      // Matches Phoenix's "Curvy" style
      showSymbol: false,
      z: 10 - index,    // Layering
      lineStyle: {
        width: 2,
        color: mainColor,
        type: s.name.toLowerCase().includes('avg') ? 'line' : 'solid' 
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexToRgba(mainColor, 0.12) },
          { offset: 1, color: hexToRgba(mainColor, 0) }
        ])
      }
    };
  });

  const option = {
    color: colors,
tooltip: {
  trigger: 'axis',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  axisPointer: { type: 'none' },
  confine: true,

  formatter: function (params) {
    let tooltipHtml = `
      <div style="
        background:rgba(255,255,255,0.98);
        border:1px solid #e2e8f0;
        border-radius:6px;
        box-shadow:0 8px 24px rgba(0,0,0,.08);
        font-family:Inter, system-ui, sans-serif;
        min-width:190px;
      ">
        <!-- Header -->
        <div style="
          padding:8px 12px;
          font-weight:600;
          font-size:12px;
          color:#1d273b;
          border-bottom:1px solid #e6e7e9;
          line-height:1.4;
        ">
          ${params[0].axisValue}
        </div>
    `;

    params.forEach(item => {
      tooltipHtml += `
        <div style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:6px 12px;
        ">
          <span style="
            font-size:12px;
            color:#64748b;
            display:flex;
            align-items:center;
            gap:6px;
          ">
            <span style="
              width:8px;
              height:8px;
              border-radius:50%;
              background:${item.color};
            "></span>
            ${item.seriesName}
          </span>

          <span style="
            font-weight:700;
            color:#1e293b;
            font-size:13px;
          ">
            ${item.value}
          </span>
        </div>
      `;
    });

    tooltipHtml += `</div>`;
    return tooltipHtml;
  }
},
legend: {
      show: true,
      left: '0%',          // Aligns to the left
      top: '0%',           // Aligns to the top
      icon: 'circle',
      itemGap: 20,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { 
        color: '#9fa6bc', 
        fontWeight: 700, 
        fontSize: 12 
      }
    },
    grid: {
      top: '15%',          // Increased from 10% to 15% to give the legend room
      right: '2%',
      bottom: '10%',
      left: '2%',
      containLabel: true
    },
xAxis: {
  type: 'category',
  data: categories, // Your hours array
  boundaryGap: false,
  // 1. Show the solid line at the bottom
  axisLine: {
    show: true,
    lineStyle: {
      color: '#cbd5e1', // Light slate/grey color
      width: 1
    }
  },
  // 2. Show the small vertical tick marks
  axisTick: {
    show: true,
    alignWithLabel: true,
    lineStyle: {
      color: '#cbd5e1'
    }
  },
  // 3. Style the labels and set the interval
  axisLabel: {
    show: true,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 600,
    margin: 15,
    // This ensures only specific hours show (e.g., every 6 hours)
    interval: function(index, value) {
      // Show label if it's 00:00, 06:00, 12:00, 18:00, or 23:00
      return index % 6 === 0 || index === 23;
    }
  }
},
yAxis: {
  type: 'value',
  // 1. Remove the labels (numbers on the left)
  axisLabel: {
    show: false
  },
  // 2. Remove the background horizontal grid lines
  splitLine: {
    show: false
  },
  // 3. Remove the vertical line of the Y-axis itself (optional)
  axisLine: {
    show: false
  },
  // 4. Remove the small tick marks on the Y-axis (optional)
  axisTick: {
    show: false
  }
},
    series: formattedSeries
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

// ECharts Pie Chart — with destroy

function createEChartPie(containerId, dataArray, colorsArray) {
  const dom = document.getElementById(containerId);
  if (!dom || dataArray.length === 0) return;

  if (chartInstances[containerId]) {
    chartInstances[containerId].dispose();
  }

  const chart = echarts.init(dom);
  chartInstances[containerId] = chart;

  const option = {
    color: colorsArray,
tooltip: {
  trigger: 'item',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: 0,
  confine: true,

  formatter: function (params) {
    return `
      <div style="
        background:rgba(255,255,255,0.98);
        border:1px solid #e2e8f0;
        border-radius:6px;
        box-shadow:0 8px 24px rgba(0,0,0,.08);
        font-family:Inter, system-ui, sans-serif;
        min-width:160px;
      ">

        <!-- Header -->
        <div style="
          padding:8px 12px;
          font-weight:600;
          font-size:12px;
          color:#1d273b;
          border-bottom:1px solid #e6e7e9;
          line-height:1.4;
        ">
          ${params.name}
        </div>

        <!-- Value Row -->
        <div style="
          padding:8px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
        ">
          <span style="
            font-size:12px;
            color:#64748b;
            display:flex;
            align-items:center;
            gap:6px;
          ">
            <span style="
              width:8px;
              height:8px;
              border-radius:50%;
              background:${params.color};
            "></span>
            Value
          </span>

          <span style="
            font-weight:700;
            font-size:13px;
            color:#1e293b;
          ">
            ${params.value}
          </span>
        </div>

      </div>
    `;
  }
},

    legend: {
      top: '5%',
      left: 'center',
      icon: 'circle',
      textStyle: { color: '#9fa6bc', fontWeight: 700, fontSize: 11 }
    },
    series: [
      {
        name: 'Calls by Region',
        type: 'pie',
        radius: ['45%', '75%'],
        avoidLabelOverlap: false,
        // --- SHARP STYLE UPDATES ---
        itemStyle: {
          borderRadius: 0,    // Remove rounded corners
          borderWidth: 0      // Remove gaps between slices
        },
        // ---------------------------
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold',
            color: 'inherit',
            formatter: '{d}%\n{b}' 
          }
        },
        labelLine: {
          show: false
        },
        data: dataArray
      }
    ]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

// Helper to handle the RGBA conversion for the area fill
/*
function hexToRgba(hex, opacity) {
  let r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
*/


    // echarts Butterfly Chart — with destroy
function createButterflyChart(containerId, categories, leftData, rightData, leftColor, rightColor) {
  const dom = document.getElementById(containerId);
  if (!dom) return;

  if (chartInstances[containerId]) chartInstances[containerId].dispose();
  const chart = echarts.init(dom);
  chartInstances[containerId] = chart;

  const option = {
    // 1. Added Legend Configuration
    legend: {
      show: true,
      top: '0%',
      left: 'left',
      icon: 'circle',
      itemGap: 30,
      textStyle: { 
        color: '#9fa6bc', 
        fontWeight: 700, 
        fontSize: 11 
      },

    },
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
      const val = Math.abs(p.value);
      const unit = p.seriesName === 'Avg Duration' ? 's' : ' calls';

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
          <strong>${val}${unit}</strong>
        </div>
      `;
    }).join('');

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
    grid: { 
      top: '15%',    // Increased padding to fit the legend
      bottom: '2%', 
      left: '3%', 
      right: '3%', 
      containLabel: true 
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontWeight: 700, color: '#9fa6bc', fontSize: 10, margin: 15 }
    },
    series: [
      {
        name: 'Avg Duration',
        type: 'bar',
        stack: 'total',
        barWidth: 12,
        itemStyle: { borderRadius: [4, 0, 0, 4], color: leftColor },
        data: leftData
      },
      {
        name: 'Call Volume',
        type: 'bar',
        stack: 'total',
        barWidth: 12,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: rightColor },
        data: rightData
      }
    ]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

// Month-over-Month & FCR Trend — with destroy
function createMonthOverMonthChart() {
  const chartDom = document.getElementById("monthOverMonthChart");
  if (!chartDom) return;

  // Dispose of old instance
  if (chartInstances.monthOverMonthChart) {
    chartInstances.monthOverMonthChart.dispose();
  }

  const chart = echarts.init(chartDom);
  chartInstances.monthOverMonthChart = chart;

  // --- Data Processing ---
  const monthlyStats = {};
  for (const dateKey in groupedData) {
    const [y, m] = dateKey.split('-');
    const monthKey = `${y}-${m}`;
    if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { calls: 0, achtSum: 0, days: 0 };
    
    const day = groupedData[dateKey];
    const dayCalls = Object.keys(day).length;
    let dayAchtSum = 0;
    for (const id in day) dayAchtSum += Number(day[id].acht) || 0;
    
    monthlyStats[monthKey].calls += dayCalls;
    monthlyStats[monthKey].achtSum += dayAchtSum;
    monthlyStats[monthKey].days += 1;
  }

  const sortedMonths = Object.keys(monthlyStats).sort();
  const labels = sortedMonths.map(m => {
    const [y, mNum] = m.split('-');
    return new Date(y, mNum - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const volumeData = sortedMonths.map(m => Math.round(monthlyStats[m].calls / monthlyStats[m].days));
  const ahtData = sortedMonths.map(m => {
    const avg = monthlyStats[m].calls > 0 ? monthlyStats[m].achtSum / monthlyStats[m].calls : 0;
    return Math.round(avg);
  });

  // --- ECharts Configuration ---
  const option = {
    color: ['#3874ff', '#ef4444'],
tooltip: {
  trigger: 'axis',
  backgroundColor: '#fff',
  borderColor: '#e3e6ed',
  borderWidth: 1,
  axisPointer: {
    type: 'shadow',
    shadowStyle: { color: 'rgba(210, 220, 235, 0.2)' }
  },
  formatter: function (params) {
    const title = params[0].axisValue;

    const rows = params.map(p => {
      const value =
        p.seriesIndex === 1
          ? (typeof formatTime === 'function'
              ? formatTime(p.value)
              : `${p.value}s`)
          : p.value.toLocaleString();

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
          <strong>${value}</strong>
        </div>
      `;
    }).join('');

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
      show: true,
      top: '0%',
      left: 'center',
      icon: 'circle',
      textStyle: { color: '#9fa6bc', fontWeight: 700 }
    },
    grid: {
      top: '15%',
      left: '2%',
      right: '2%',
      bottom: '5%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9fa6bc', fontWeight: 700, fontSize: 11, margin: 15 }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Calls',
        nameTextStyle: { color: '#9fa6bc', fontWeight: 700 },
        splitLine: { lineStyle: { type: 'dashed', color: '#eff2f6' } },
        axisLabel: { color: '#9fa6bc', fontWeight: 700 }
      },
      {
        type: 'value',
        name: 'AHT',
        nameTextStyle: { color: '#9fa6bc', fontWeight: 700 },
        splitLine: { show: false },
        axisLabel: { 
          color: '#9fa6bc', 
          fontWeight: 700,
          formatter: (val) => typeof formatTime === 'function' ? formatTime(val) : val 
        }
      }
    ],
    series: [
      {
        name: 'Avg Daily Calls',
        type: 'bar',
        barWidth: '35%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: '#3874ff'
        },
        data: volumeData
      },
      {
        name: 'Avg AHT (sec)',
        type: 'line',
        yAxisIndex: 1, // Use the right Y-axis
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#ef4444' },
        itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.15)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0)' }
          ])
        },
        data: ahtData
      }
    ]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

function createFCRTrendChart() {
  const chartDom = document.getElementById("fcrTrendChart");
  if (!chartDom) return;

  // Dispose of existing instance to prevent memory leaks
  if (chartInstances.fcrTrendChart) {
    chartInstances.fcrTrendChart.dispose();
  }

  const chart = echarts.init(chartDom);
  chartInstances.fcrTrendChart = chart;

  // --- Data Processing ---
  const monthlyFCR = {};
  for (const dateKey in groupedData) {
    const [y, m] = dateKey.split('-');
    const monthKey = `${y}-${m}`;
    if (!monthlyFCR[monthKey]) monthlyFCR[monthKey] = { fcr: 0, total: 0 };
    
    const day = groupedData[dateKey];
    for (const id in day) {
      if ((day[id].status || "").toUpperCase() === "FCR") monthlyFCR[monthKey].fcr++;
      monthlyFCR[monthKey].total++;
    }
  }

  const sorted = Object.keys(monthlyFCR).sort();
  const labels = sorted.map(m => {
    const [y, mNum] = m.split('-');
    return new Date(y, mNum - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const fcrPercent = sorted.map(m => {
    const data = monthlyFCR[m];
    return data.total > 0 ? Math.round((data.fcr / data.total) * 100) : 0;
  });

  // --- ECharts Configuration ---
  const option = {
    color: ['#10b981'],
tooltip: {
  trigger: 'axis',
  backgroundColor: '#fff',
  borderColor: '#e3e6ed',
  borderWidth: 1,
  axisPointer: {
    lineStyle: { color: '#cbd5e1', width: 2 }
  },
  formatter: function (params) {
    const title = params[0].axisValue;
    const value = params[0].value;

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
                background:#10b981;
                margin-right:6px;
              "></span>
              FCR Rate
            </span>
            <strong>${value}%</strong>
          </div>
        </div>
      </div>
    `;
  }
},
    grid: {
      top: '10%',
      left: '3%',
      right: '3%',
      bottom: '5%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false, // Ensures the area fills to the edges
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9fa6bc', fontWeight: 700, fontSize: 11, margin: 15 }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { type: 'dashed', color: '#eff2f6' } },
      axisLabel: { 
        color: '#9fa6bc', 
        fontWeight: 700,
        formatter: '{value}%' 
      }
    },
    series: [{
      name: 'FCR %',
      type: 'line',
      smooth: 0.4, // Phoenix-style smooth curves
      showSymbol: false,
      lineStyle: { width: 4 },
      emphasis: {
        focus: 'series',
        lineStyle: { width: 5 }
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(16, 185, 129, 0.25)' }, // Green gradient top
          { offset: 1, color: 'rgba(16, 185, 129, 0)' }    // Fade to transparent
        ])
      },
      data: fcrPercent
    }]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

function renderSpikingReasons() {
    const container = document.getElementById('spikesContainer');
    
    // 1. CRITICAL SAFETY CHECK
    if (!container) {
        console.warn("Element 'spikesContainer' not found. Skipping render.");
        return;
    }

    if (!selectedDate || !groupedData[selectedDate]) {
        container.innerHTML = '<div class="col-12 text-center py-4 text-muted italic">No data available for comparison</div>';
        return;
    }

    const today = selectedDate;
    const recentDates = availableDates.filter(d => d < today).slice(-7);
    const todayCount = {};
    const historyCount = {};

    // Data Processing
    Object.values(groupedData[today] || {}).forEach(c => {
        const r = c["Call Reason"] || "Unknown";
        todayCount[r] = (todayCount[r] || 0) + 1;
    });

    recentDates.forEach(date => {
        Object.values(groupedData[date] || {}).forEach(c => {
            const r = c["Call Reason"] || "Unknown";
            historyCount[r] = (historyCount[r] || 0) + 1;
        });
    });

    const spikes = [];
    const avgDays = recentDates.length || 1;
    const allReasons = new Set([...Object.keys(todayCount), ...Object.keys(historyCount)]);

    for (const reason of allReasons) {
        const tVal = todayCount[reason] || 0;
        const avg7 = (historyCount[reason] || 0) / avgDays;
        const diff = tVal - avg7;
        const pct = avg7 > 0 ? (tVal / avg7 - 1) * 100 : (tVal > 0 ? 100 : 0);

        // Threshold logic
        if (Math.abs(diff) >= 5 || Math.abs(pct) >= 30) {
            spikes.push({ reason, today: tVal, diff: Math.round(diff), pct: Math.round(pct) });
        }
    }

    // Sort by absolute volume difference
    spikes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    if (spikes.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <span class="badge bg-success-lt fw-bold p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline me-1" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M5 12l5 5l10 -10"></path></svg>
                    No significant spikes – smooth day!
                </span>
            </div>`;
        return;
    }

    // Generate Dynamic Cards
    const topSpikes = spikes.slice(0, 4); // Limit to top 4 cards for a single row
    let html = '';

    topSpikes.forEach(s => {
        const isUp = s.diff > 0;
        const colorClass = isUp ? 'text-danger' : 'text-success';
        const badgeClass = isUp ? 'bg-danger-lt' : 'bg-success-lt';
        const pctText = s.pct >= 1000 ? 'NEW' : (s.pct >= 0 ? '+' + s.pct : s.pct) + '%';
        
        // Trend Icon SVG
        const icon = isUp 
            ? `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline ${colorClass}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M3 17l6 -6l4 4l8 -8"></path><path d="M14 7l7 0l0 7"></path></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline ${colorClass}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M3 7l6 6l4 -4l8 8"></path><path d="M14 17l7 0l0 -7"></path></svg>`;

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
                                    <div class="h3 mb-0 fw-bold ${colorClass}">${s.today.toLocaleString()}</div>
                                    <span class="badge ${badgeClass} ms-2 fw-bold" style="font-size: 0.65rem;">${pctText}</span>
                                </div>
                                <div class="text-secondary small text-truncate" title="${s.reason}">
                                    ${s.reason}
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
  const callsElement = document.getElementById('worstHourCalls');
  const badgeElement = document.getElementById('worstHourBadge');
  
  if (!callsElement || !badgeElement) return;

  // Safety check: if no data for selected date
  if (!selectedDate || !groupedData[selectedDate]) {
    callsElement.textContent = '0';
    badgeElement.textContent = '--:--';
    return;
  }

  // Calculate hourly distribution
  const hourly = Array(24).fill(0);
  const dayCalls = Object.values(groupedData[selectedDate]);

  dayCalls.forEach(c => {
    // Uses your existing getHourFromDate helper
    const h = parseInt(getHourFromDate(c.call_date));
    if (!isNaN(h) && h >= 0 && h < 24) {
      hourly[h]++;
    }
  });

  // Find the peak
  let maxCalls = 0;
  let peakHour = 0;

  for (let h = 0; h < 24; h++) {
    if (hourly[h] > maxCalls) {
      maxCalls = hourly[h];
      peakHour = h;
    }
  }

  // Format the display
  const startTime = String(peakHour).padStart(2, '0') + ":00";
  const endTime = String((peakHour + 1) % 24).padStart(2, '0') + ":00";

  // Update the UI
  callsElement.textContent = maxCalls.toLocaleString();
  badgeElement.textContent = `${startTime}`;
  
  // Optional: Add a tooltip to show the full range
  badgeElement.title = `Peak period: ${startTime} to ${endTime}`;
}



// ===============================
// Local Date Parser (CRITICAL FIX)
// ===============================
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // Local midnight
}


// ===============================
// Call Trend Chart
// ===============================
function createCallTrendChart() {
  const container = document.getElementById('callTrendChart');
  if (!container) {
    console.warn("callTrendChart container not found");
    return;
  }

  if (chartInstances.callTrendChart) {
    chartInstances.callTrendChart.dispose();
  }

  const chart = echarts.init(container);
  chartInstances.callTrendChart = chart;

  let datesToShow = [];
  if (trendDateRange?.start && trendDateRange?.end) {
    const start = parseLocalDate(trendDateRange.start);
    const end = parseLocalDate(trendDateRange.end);
    end.setHours(23, 59, 59, 999);
    datesToShow = availableDates.filter(d => {
      const dd = parseLocalDate(d);
      return dd >= start && dd <= end;
    });
  } else {
    datesToShow = availableDates.slice(-DEFAULT_TREND_DAYS);
  }

  if (datesToShow.length === 0) {
    container.innerHTML = '<div class="text-center py-5 text-muted">No data in selected range</div>';
    return;
  }

  datesToShow.sort();

  const labels = datesToShow.map(d =>
    parseLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  // ────────────────────────────────
  // Data calculations
  // ────────────────────────────────
  const callCounts = datesToShow.map(date => {
    const dayData = groupedData[date] || {};
    return Object.keys(dayData).length;
  });

  const avgAHT = datesToShow.map(date => {
    const dayData = groupedData[date] || {};
    const calls = Object.keys(dayData).length;
    if (!calls) return 0;
    const totalAHT = Object.values(dayData).reduce((sum, c) => sum + Number(c.acht || 0), 0);
    return Math.round(totalAHT / calls);
  });

  const fcrPercent = datesToShow.map(date => {
    const dayData = groupedData[date] || {};
    const totalCalls = Object.keys(dayData).length;
    if (!totalCalls) return 0;
    const fcrCount = Object.values(dayData).filter(c => 
      (c.status || "").toUpperCase() === "FCR"
    ).length;
    return Math.round((fcrCount / totalCalls) * 100);
  });

  // ────────────────────────────────
  // Chart configuration
  // ────────────────────────────────
  const option = {
    color: ['#3b82f6', '#f59e0b', '#10b981'],  // blue, amber, green
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
      const suffix = p.seriesName.includes('FCR')
        ? '%'
        : p.seriesName.includes('AHT')
          ? 's'
          : '';

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
        position: 'left',
        axisLine: { show: false },
        axisLabel: { color: '#3b82f6' },
        splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
      },
      {
        type: 'value',
        name: 'AHT / FCR',
        position: 'right',
        axisLine: { show: false },
        axisLabel: { 
          color: '#64748b',
          formatter: function (val) {
            return val + (val > 100 ? '' : '%'); // rough way to distinguish
          }
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Call Volume',
        type: 'bar',
        barWidth: '60%',
        itemStyle: { 
          borderRadius: [4, 4, 0, 0],
          color: '#3b82f6'
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
        itemStyle: { color: '#f59e0b' },
        data: avgAHT,
        yAxisIndex: 1
      },
      {
        name: 'FCR %',
        type: 'line',
        smooth: 0.35,
        symbolSize: 7,
        lineStyle: { width: 3 },
        itemStyle: { color: '#10b981' },
        data: fcrPercent,
        yAxisIndex: 1
      }
    ]
  };

  chart.setOption(option);

  // Resize handling (already global, but keep for safety)
  if (!chart.__resizeAdded) {
    window.addEventListener('resize', () => chart.resize());
    chart.__resizeAdded = true;
  }

  // Update title with actual range
  updateTrendRangeDisplay();
}


// ===============================
// Trend Range Title
// ===============================
function updateTrendRangeDisplay() {
  const titleEl =
    document.querySelector('.call-trend-title') ||
    document.querySelector('[data-range-display]');

  if (!titleEl) return;

  let text = `Call Volume Trend (Last ${DEFAULT_TREND_DAYS} Days)`;

  if (trendDateRange?.start && trendDateRange?.end) {
    const start = parseLocalDate(trendDateRange.start);
    const end = parseLocalDate(trendDateRange.end);

    const dates = availableDates.filter(d => {
      const dd = parseLocalDate(d);
      return dd >= start && dd <= end;
    });

    if (dates.length) {
      dates.sort();
      const s = parseLocalDate(dates[0]).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const e = parseLocalDate(dates.at(-1)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      text = `Call Volume Trend (${s} to ${e})`;
    } else {
      text = 'Call Volume Trend (No data in range)';
    }
  }

  titleEl.textContent = text;
}

    // Main render function
    function renderDashboard() {
      if (!selectedDate || !groupedData[selectedDate]) return;

      const callsForDate = groupedData[selectedDate];
      const totalCalls = Object.keys(callsForDate).length;

// KPIs
const uniqueCallers = new Set(Object.values(callsForDate).map(c => c.phone_number).filter(Boolean)).size;
const activeAgents = new Set(Object.values(callsForDate).map(c => c.full_name || c.email).filter(Boolean)).size;
const fcrCount = Object.values(callsForDate).filter(c => (c.status || "").toUpperCase() === "FCR").length;
const fcrPercent = totalCalls > 0 ? Math.round((fcrCount / totalCalls) * 100) : 0;
const totalAcht = Object.values(callsForDate).reduce((sum, c) => sum + (Number(c.acht) || 0), 0);
const avgHandle = totalCalls > 0 ? Math.round(totalAcht / totalCalls) : 0;

document.getElementById('kpiTotalCalls').textContent = totalCalls.toLocaleString();
document.getElementById('kpiUniqueCallers').textContent = uniqueCallers.toLocaleString();
document.getElementById('kpiActiveAgents').textContent = activeAgents.toLocaleString();
document.getElementById('kpiFCRPercent').textContent = fcrPercent + '%';
document.getElementById('kpiAvgHandleTime').textContent = formatTime(avgHandle);

      // Monthly Aggregates
      const sumTotal = Array(24).fill(0);
      const sumUnique = Array(24).fill(0);
      const sumAgents = Array(24).fill(0);
      const regionMonth = { Rural: 0, Urban: 0, 'N/A': 0 };
      const reasonStats = {};
      const billingSubReasonStats = {};
      const daysCount = availableDates.length || 1;

      availableDates.forEach(date => {
        const dayCalls = groupedData[date] || {};
        const dayTotals = Array(24).fill(0);
        const dayUnique = Array(24).fill().map(() => new Set());
        const dayAgents = Array(24).fill().map(() => new Set());

        Object.values(dayCalls).forEach(call => {
          const hour = parseInt(getHourFromDate(call.call_date));
          const phone = call.phone_number;
          const agent = call.full_name || "Unknown";
          const region = call.Region;
          const reason = call["Call Reason"] || "Unknown";
          const duration = Number(call.acht) || 0;

          dayTotals[hour]++;
          if (phone) dayUnique[hour].add(phone);
          dayAgents[hour].add(agent);
          regionMonth[region] = (regionMonth[region] || 0) + 1;

          if (!reasonStats[reason]) reasonStats[reason] = { count: 0, sumAcht: 0 };
          reasonStats[reason].count++;
          reasonStats[reason].sumAcht += duration;

          if (reason === BILLING_ISSUE_REASON) {
            const sub = categorizeBillingCall(call);
            if (!billingSubReasonStats[sub]) billingSubReasonStats[sub] = { count: 0, sumAcht: 0 };
            billingSubReasonStats[sub].count++;
            billingSubReasonStats[sub].sumAcht += duration;
          }
        });

        for (let h = 0; h < 24; h++) {
          sumTotal[h] += dayTotals[h];
          sumUnique[h] += dayUnique[h].size;
          sumAgents[h] += dayAgents[h].size;
        }
      });

      const hours = Array.from({length: 24}, (_, i) => `${String(i).padStart(2, '0')}:00`);
      const avgTotalArr = sumTotal.map(v => Math.round(v / daysCount));
      const avgUniqueArr = sumUnique.map(v => Math.round(v / daysCount));
      const avgAgentsArr = sumAgents.map(v => Math.round(v / daysCount));

      // Render charts
      createEChartsAreaChart('avgHourlyChart', [
        { name: 'Avg Calls / Hour', data: avgTotalArr },
        { name: 'Avg Unique Callers', data: avgUniqueArr },
        { name: 'Avg Agents Online', data: avgAgentsArr }
      ], hours);

      createEChartPie('monthRegionPie', [
        { value: regionMonth.Rural, name: 'Rural' },
        { value: regionMonth.Urban, name: 'Urban' },
        { value: regionMonth['N/A'], name: 'N/A' }
      ], Object.values(REGION_COLORS));

      // Daily data
      const dayTotals = Array(24).fill(0);
      const dayUnique = Array(24).fill().map(() => new Set());
      const dayAgents = Array(24).fill().map(() => new Set());
      const dayRegion = { Rural: 0, Urban: 0, 'N/A': 0 };

      Object.values(callsForDate).forEach(call => {
        const hour = parseInt(getHourFromDate(call.call_date));
        const phone = call.phone_number;
        const agent = call.full_name || "Unknown";
        const region = call.Region;

        dayTotals[hour]++;
        if (phone) dayUnique[hour].add(phone);
        dayAgents[hour].add(agent);
        dayRegion[region] = (dayRegion[region] || 0) + 1;
      });

      createEChartsAreaChart('lastDayHourlyChart', [
        { name: 'Total Calls', data: dayTotals },
        { name: 'Unique Callers', data: dayUnique.map(s => s.size) },
        { name: 'Agents Online', data: dayAgents.map(s => s.size) }
      ], hours);

      createEChartPie('lastDayRegionPie', [
        { value: dayRegion.Rural, name: 'Rural' },
        { value: dayRegion.Urban, name: 'Urban' },
        { value: dayRegion['N/A'], name: 'N/A' }
      ], Object.values(REGION_COLORS));

// --- REASONING & BILLING ANALYSIS: BLOCK ---

// 1. Monthly Top 10 Call Reasons
const reasonDataArr = Object.keys(reasonStats || {}).map(r => ({
  reason: r,
  leftMetric: reasonStats[r].count > 0 ? Math.ceil(reasonStats[r].sumAcht / reasonStats[r].count) : 0,
  rightMetric: Math.ceil(reasonStats[r].count / (daysCount || 1))
})).sort((a, b) => b.rightMetric - a.rightMetric).slice(0, 10);

if (reasonDataArr.length > 0) {
  createButterflyChart(
    'monthButterflyCallreason',
    reasonDataArr.map(i => i.reason),
    reasonDataArr.map(i => -i.leftMetric),
    reasonDataArr.map(i => i.rightMetric),
    '#6366f1',
    '#10b981'
  );
}

// 2. Daily Top 10 Call Reasons
const dayReasonStats = {};
Object.values(callsForDate || {}).forEach(call => {
  const reason = call["Call Reason"] || "Unknown";
  const duration = Number(call.acht) || 0;
  if (!dayReasonStats[reason]) dayReasonStats[reason] = { count: 0, sumAcht: 0 };
  dayReasonStats[reason].count++;
  dayReasonStats[reason].sumAcht += duration;
});

const dayTop = Object.keys(dayReasonStats).map(r => ({
  reason: r,
  volume: dayReasonStats[r].count,
  acht: dayReasonStats[r].count > 0 ? Math.ceil(dayReasonStats[r].sumAcht / dayReasonStats[r].count) : 0
})).sort((a, b) => b.volume - a.volume).slice(0, 10);

const dayReasonContainer = document.getElementById('dayButterflyCallreason');
if (dayTop.length > 0) {
  createButterflyChart(
    'dayButterflyCallreason',
    dayTop.map(i => i.reason),
    dayTop.map(i => -i.acht),
    dayTop.map(i => i.volume),
    '#6366f1',
    '#10b981'
  );
} else if (dayReasonContainer) {
  dayReasonContainer.innerHTML = '<div class="text-muted py-5 text-center">No data for this date</div>';
}

// 3. Monthly Billing Sub-Reasons
const billingDataArr = Object.keys(billingSubReasonStats || {}).map(r => ({
  subReason: r,
  leftMetric: billingSubReasonStats[r].count > 0 ? Math.ceil(billingSubReasonStats[r].sumAcht / billingSubReasonStats[r].count) : 0,
  rightMetric: Math.ceil(billingSubReasonStats[r].count / (daysCount || 1))
})).sort((a, b) => b.rightMetric - a.rightMetric).slice(0, 10);

if (billingDataArr.length > 0) {
  createButterflyChart(
    'monthBillingButterfly',
    billingDataArr.map(i => i.subReason),
    billingDataArr.map(i => -i.leftMetric),
    billingDataArr.map(i => i.rightMetric),
    '#14b8a6',
    '#f43f5e'
  );
}

// 4. Daily Billing Sub-Reasons
const dayBillingSubReasonStats = {};
const targetBillingReason = window.BILLING_ISSUE_REASON || "Billing Issue";

Object.values(callsForDate || {}).forEach(call => {
  if (call["Call Reason"] === targetBillingReason) {
    const sub = typeof categorizeBillingCall === 'function' ? categorizeBillingCall(call) : (call["Sub-Reason"] || "Other");
    const duration = Number(call.acht) || 0;
    if (!dayBillingSubReasonStats[sub]) dayBillingSubReasonStats[sub] = { count: 0, sumAcht: 0 };
    dayBillingSubReasonStats[sub].count++;
    dayBillingSubReasonStats[sub].sumAcht += duration;
  }
});

const billingDayTop = Object.keys(dayBillingSubReasonStats).map(r => ({
  subReason: r,
  volume: dayBillingSubReasonStats[r].count,
  acht: dayBillingSubReasonStats[r].count > 0 ? Math.ceil(dayBillingSubReasonStats[r].sumAcht / dayBillingSubReasonStats[r].count) : 0
})).sort((a, b) => b.volume - a.volume).slice(0, 10);

const dayBillingContainer = document.getElementById('dayBillingButterfly');
if (billingDayTop.length > 0) {
  createButterflyChart(
    'dayBillingButterfly',
    billingDayTop.map(i => i.subReason),
    billingDayTop.map(i => -i.acht),
    billingDayTop.map(i => i.volume),
    '#14b8a6',
    '#f43f5e'
  );
} else if (dayBillingContainer) {
  dayBillingContainer.innerHTML = '<div class="text-muted py-5 text-center">No Billing issues for this date</div>';
}

// 5. Finalize UI
if (typeof createMonthOverMonthChart === 'function') createMonthOverMonthChart();
if (typeof createFCRTrendChart === 'function') createFCRTrendChart();
if (typeof renderSpikingReasons === 'function') renderSpikingReasons();
if (typeof renderWorstHourBadge === 'function') renderWorstHourBadge();

document.querySelectorAll('.date-mirror').forEach(el => {
    if (!selectedDate) return;
    
    // Formats 2023-10-24 into Oct 24, 2023
    const formattedDate = new Date(selectedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    el.innerHTML = `
        <span class="badge bg-blue-lt">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline me-1" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"></path><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M4 11h16"></path><path d="M11 15h1"></path><path d="M12 15v3"></path></svg>
            ${formattedDate}
        </span>
    `;
});
}

    // Fetch & Load
async function fetchAndRefresh() {

  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';

  try {

    const { data, error } = await supabase
      .from('all_calls')
      .select('*')
      .range(0, 9999);   // 🔥 THIS IS THE FIX

    if (error) throw error;

    console.log("Rows fetched:", data.length);

    groupedData = normalizeFromRows(data);

    availableDates = Object.keys(groupedData)
      .sort((a, b) => new Date(a) - new Date(b));

    if (availableDates.length) {
      selectedDate = availableDates[availableDates.length - 1];
      document.getElementById('selectedDate').textContent = selectedDate;
      fp.setDate(selectedDate);
    }

    renderDashboard();
    createCallTrendChart();

  } catch (err) {
    console.error(err);
    alert("Failed to load data: " + err.message);
  } finally {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }
}




    const fp = flatpickr("#datePicker", {
      dateFormat: "Y-m-d",
      onChange: (dates, dateStr) => {
        selectedDate = dateStr;
        document.getElementById('selectedDate').textContent = selectedDate;
        document.querySelectorAll('.date-mirror').forEach(el => el.textContent = selectedDate);
        renderDashboard();
        createCallTrendChart();
      }
    });

// ===============================
// Range picker for trend chart
// ===============================
const trendFp = flatpickr("#trendDateRangePicker", {
  mode: "range",
  dateFormat: "Y-m-d",
  maxDate: "today",

  onChange: (selectedDates) => {
    console.log("Picker changed → selectedDates:", selectedDates);

    if (selectedDates.length === 2) {
      // ✅ LOCAL date extraction (NO UTC)
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

      console.log("trendDateRange UPDATED to:", trendDateRange);
      createCallTrendChart();
      updateTrendRangeDisplay();

    } else {
      trendDateRange = null;
      console.log("trendDateRange CLEARED");
      createCallTrendChart();
      updateTrendRangeDisplay();
    }
  }
});


// ===============================
// Reset button
// ===============================
document
  .getElementById('btnResetTrendRange')
  ?.addEventListener('click', () => {
    trendDateRange = null;
    trendFp.clear();
    document.getElementById('trendDateRangePicker').value = '';
    createCallTrendChart();
    updateTrendRangeDisplay();
  });


    document.getElementById('btnReload').addEventListener('click', fetchAndRefresh);

    document.addEventListener('DOMContentLoaded', fetchAndRefresh);