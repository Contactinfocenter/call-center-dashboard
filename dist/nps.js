const API_URL = "https://script.google.com/macros/s/AKfycbxMcFQxb_j3uy5jfDRh4roBYwRztBgv2hsKaKZ8IVep9aYGSMqEGAna5Xc70tpnhudO7A/exec";

const colors = {
  primary: '#4154f1', // Overall
  success: '#2eca6a', // Urban
  warning: '#ff771d', // Rural
  target: '#dc2626'   // Red Target Line
};

// 1. Tooltip Helper: Keeps your exact style consistent across all charts
const getTooltipOption = () => ({
  trigger: 'axis',
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  borderColor: '#e2e8f0',
  borderWidth: 1,
  padding: 0,
  axisPointer: {
    type: 'shadow',
    shadowStyle: { color: 'rgba(241, 245, 249, 0.6)' }
  },
  formatter: function (params) {
    if (!params || params.length === 0) return '';
    const title = params[0].axisValue;
    const rows = params.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; color:#1d273b; font-size:12px; line-height:1;">
        <span style="display:flex; align-items:center;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${p.color}; margin-right:6px;"></span>
          ${p.seriesName}
        </span>
        <strong style="margin-left:20px;">${p.value}</strong>
      </div>
    `).join('');

    return `
      <div style="min-width:160px; overflow:hidden; border-radius:4px;">
        <div style="
            padding:10px 12px;
            font-weight:600;
            color:#1d273b;
            background-color: #f8fafc; /* Light slate background */
            border-bottom:1px solid #e2e8f0;
        ">
            ${title}
        </div>

        <div style="padding:10px 12px">
            ${rows}
        </div>
      </div>`;
  }
});

// 2. Common Axis Style: Cleans up the grid lines for a modern look
const commonAxisStyle = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#64748b', fontWeight: 600, margin: 12 },
  splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
};

const initEChart = (id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  return echarts.init(el);
};

fetch(API_URL)
  .then(r => r.json())
  .then(res => {
    const sqi = res.overall.SQI;
    const nps = res.overall.NPS;
    const metrics = res.metrics || {};

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const currentSQI = (1 + 4 * (parseFloat(sqi.All.pct1) / 100)).toFixed(2);
    const urbanSQIScore = (1 + 4 * (sqi.Urban.pct1 / 100)).toFixed(2);
    const ruralSQIScore = (1 + 4 * (sqi.Rural.pct1 / 100)).toFixed(2);

    set('currentSQI', currentSQI);
    set('currentNPS', nps.All.nps);
    set('responseRate', metrics.overallResponseRate || "0%");
    set('responseDetails', `Till now (${metrics.totalResponsesAllTime || 0} responses / ${metrics.totalInvitationsAllTime || 0} sent)`);

      set("all1", sqi.All.pct1 + "%"); set("all2", sqi.All.pct2 + "%"); set("allsqiVal", currentSQI);
      set("urban1", sqi.Urban.pct1 + "%"); set("urban2", sqi.Urban.pct2 + "%"); set("urbansqiVal", urbanSQIScore);
      set("rural1", sqi.Rural.pct1 + "%"); set("rural2", sqi.Rural.pct2 + "%"); set("ruralsqiVal", ruralSQIScore);
      
      set("npsAll1", nps.All.p1 + "%"); set("npsAll2", nps.All.p2 + "%"); set("npsAll3", nps.All.p3 + "%"); set("npsAllScoreVal", nps.All.nps);
      set("npsUrban1", nps.Urban.p1 + "%"); set("npsUrban2", nps.Urban.p2 + "%"); set("npsUrban3", nps.Urban.p3 + "%"); set("npsUrbanScoreVal", nps.Urban.nps);
      set("npsRural1", nps.Rural.p1 + "%"); set("npsRural2", nps.Rural.p2 + "%"); set("npsRural3", nps.Rural.p3 + "%"); set("npsRuralScoreVal", nps.Rural.nps);

    // --- 4. SQI Comparison Bar Chart ---
    const sqiComp = initEChart('sqiComparisonChart');
    if (sqiComp) {
      sqiComp.setOption({
        tooltip: getTooltipOption(),
        grid: { top: '15%', bottom: '10%', left: '5%', right: '20%', containLabel: true },
        xAxis: { type: 'category', data: ['Overall', 'Urban', 'Rural'], ...commonAxisStyle, splitLine: { show: false } },
        yAxis: { type: 'value', max: 5, interval: 1, ...commonAxisStyle },
        series: [{
          name: 'SQI',
          type: 'bar',
          barWidth: '40%',
          emphasis: { itemStyle: { opacity: 0.8 } },
          data: [
            { value: parseFloat(currentSQI), itemStyle: { color: colors.primary, borderRadius: [5, 5, 0, 0] } },
            { value: parseFloat(urbanSQIScore), itemStyle: { color: colors.success, borderRadius: [5, 5, 0, 0] } },
            { value: parseFloat(ruralSQIScore), itemStyle: { color: colors.warning, borderRadius: [5, 5, 0, 0] } }
          ],
          markLine: {
            symbol: 'none',
            data: [{ yAxis: 4, label: { formatter: 'Target 4.0', position: 'end', rotate: 90, distance: [10, 15], color: colors.target, fontWeight: 'bold', fontSize: 11, align: 'center' } }],
            lineStyle: { color: colors.target, type: 'dashed', width: 1 }
          }
        }]
      });
    }

    // --- 5. NPS Comparison Bar Chart ---
    const npsComp = initEChart('npsComparisonChart');
    if (npsComp) {
      npsComp.setOption({
        tooltip: getTooltipOption(),
        grid: { top: '15%', bottom: '10%', left: '5%', right: '5%', containLabel: true },
        xAxis: { type: 'category', data: ['Overall', 'Urban', 'Rural'], ...commonAxisStyle, splitLine: { show: false } },
        yAxis: { type: 'value', min: 0, max: (value) => value.max > 80 ? 100 : 80, ...commonAxisStyle },
        series: [{
          name: 'NPS',
          type: 'bar',
          barWidth: '40%',
          emphasis: { itemStyle: { opacity: 0.8 } },
          data: [
            { value: nps.All.nps, itemStyle: { color: colors.primary, borderRadius: [5, 5, 0, 0] } },
            { value: nps.Urban.nps, itemStyle: { color: colors.success, borderRadius: [5, 5, 0, 0] } },
            { value: nps.Rural.nps, itemStyle: { color: colors.warning, borderRadius: [5, 5, 0, 0] } }
          ],
          markLine: {symbol: 'none', data: [{ yAxis: 60,label: {formatter: 'Target 60', position: 'end',
                    rotate: 90,
                    distance: [10, 15],
                    color: colors.target, 
                    fontWeight: 'bold',
                    fontSize: 11,
                    align: 'center'
                } 
            }],
            lineStyle: { color: colors.target, type: 'dashed', width: 1 }
        }
        }]
      });
    }

    // --- 6. Trend Processing ---
    const monthsRaw = Object.keys(res.monthly.SQI).sort();
    const labels = monthsRaw.map(m => {
      const [y, mm] = m.split("-");
      return new Date(y, mm - 1).toLocaleString("en-US", { month: "short" });
    });

    // --- 7. SQI Monthly Trend ---
    const sqiTrend = initEChart('sqiMonthlyChart');
    if (sqiTrend) {
      sqiTrend.setOption({
        color: [colors.primary, colors.success, colors.warning],
        tooltip: getTooltipOption(),
        legend: { top: 0, icon: 'circle', textStyle: { color: '#64748b' } },
        grid: { top: '15%', bottom: '10%', left: '5%', right: '5%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: labels, ...commonAxisStyle, splitLine: { show: false } },
        yAxis: { type: 'value', min: 0, max: 5, ...commonAxisStyle },
        series: [
          { name: 'Overall', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.SQI[m].All.sqi) },
          { name: 'Urban', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.SQI[m].Urban.sqi) },
          { name: 'Rural', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.SQI[m].Rural.sqi) }
        ]
      });
    }

    // --- 8. NPS Monthly Trend ---
    const npsTrend = initEChart('npsMonthlyChart');
    if (npsTrend) {
      npsTrend.setOption({
        color: [colors.primary, colors.success, colors.warning],
        tooltip: getTooltipOption(),
        legend: { bottom: 0, icon: 'circle', textStyle: { color: '#64748b' } },
        grid: { top: '10%', bottom: '15%', left: '5%', right: '5%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: labels, ...commonAxisStyle, splitLine: { show: false } },
        yAxis: { type: 'value', min: 0, max: (value) => value.max > 80 ? 100 : 80, ...commonAxisStyle },
        series: [
          { name: 'Overall', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.NPS[m].All.nps) },
          { name: 'Urban', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.NPS[m].Urban.nps) },
          { name: 'Rural', type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.05 }, data: monthsRaw.map(m => res.monthly.NPS[m].Rural.nps) }
        ]
      });
    }

    window.addEventListener('resize', () => {
      [sqiComp, npsComp, sqiTrend, npsTrend].forEach(c => c && c.resize());
    });

    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';

  })
  .catch(err => {
    console.error("Dashboard Load Error:", err);
  });