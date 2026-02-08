 const API_URL = "https://script.google.com/macros/s/AKfycbxMcFQxb_j3uy5jfDRh4roBYwRztBgv2hsKaKZ8IVep9aYGSMqEGAna5Xc70tpnhudO7A/exec";

  const colors = {
    primary: '#4154f1', // Overall
    success: '#2eca6a', // Urban
    warning: '#ff771d', // Rural
    target: '#dc2626'   // Red Target Line
  };

  // Helper to initialize ECharts safely
  const initEChart = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return echarts.init(el);
  };

  fetch(API_URL)
    .then(r => r.json())
    .then(res => {
      // 1. Data Mapping
      const sqi = res.overall.SQI;
      const nps = res.overall.NPS;
      const metrics = res.metrics || {};
      
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      // 2. Process Values
      const currentSQI = (1 + 4 * (parseFloat(sqi.All.pct1) / 100)).toFixed(2);
      const urbanSQIScore = (1 + 4 * (sqi.Urban.pct1 / 100)).toFixed(2);
      const ruralSQIScore = (1 + 4 * (sqi.Rural.pct1 / 100)).toFixed(2);

      // 3. Update KPI & Tables
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

      // 4. SQI Comparison Bar Chart
      const sqiComp = initEChart('sqiComparisonChart');
      if (sqiComp) {
        sqiComp.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { top: '10%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
          xAxis: { type: 'category', data: ['Overall', 'Urban', 'Rural'], axisLabel: { fontWeight: 600 } },
          yAxis: { type: 'value', max: 5, interval: 1 },
          series: [{
            type: 'bar',
            barWidth: '40%',
            data: [
              { value: parseFloat(currentSQI), itemStyle: { color: colors.primary, borderRadius: [5, 5, 0, 0] } },
              { value: parseFloat(urbanSQIScore), itemStyle: { color: colors.success, borderRadius: [5, 5, 0, 0] } },
              { value: parseFloat(ruralSQIScore), itemStyle: { color: colors.warning, borderRadius: [5, 5, 0, 0] } }
            ],
            markLine: {
              symbol: 'none',
              data: [{ yAxis: 4, label: { formatter: 'Target 4.0', position: 'end' } }],
              lineStyle: { color: colors.target, type: 'dashed', width: 2 }
            }
          }]
        });
      }

      // 5. NPS Comparison Bar Chart
      const npsComp = initEChart('npsComparisonChart');
      if (npsComp) {
        npsComp.setOption({
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { top: '10%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
          xAxis: { type: 'category', data: ['Overall', 'Urban', 'Rural'], axisLabel: { fontWeight: 600 } },
          yAxis: { type: 'value', min: -100, max: 100 },
          series: [{
            type: 'bar',
            barWidth: '40%',
            data: [
              { value: nps.All.nps, itemStyle: { color: colors.primary, borderRadius: [5, 5, 0, 0] } },
              { value: nps.Urban.nps, itemStyle: { color: colors.success, borderRadius: [5, 5, 0, 0] } },
              { value: nps.Rural.nps, itemStyle: { color: colors.warning, borderRadius: [5, 5, 0, 0] } }
            ],
            markLine: {
              symbol: 'none',
              data: [{ yAxis: 60, label: { formatter: 'Target 60' } }],
              lineStyle: { color: colors.target, type: 'dashed', width: 2 }
            }
          }]
        });
      }

      // 6. Monthly Trend Processing
      const monthsRaw = Object.keys(res.monthly.SQI).sort();
      const labels = monthsRaw.map(m => {
        const [y, mm] = m.split("-");
        return new Date(y, mm - 1).toLocaleString("en-US", { month: "short" });
      });

      const sqiData = {
        overall: monthsRaw.map(m => res.monthly.SQI[m].All.sqi),
        urban: monthsRaw.map(m => res.monthly.SQI[m].Urban.sqi),
        rural: monthsRaw.map(m => res.monthly.SQI[m].Rural.sqi)
      };

      const npsData = {
        overall: monthsRaw.map(m => res.monthly.NPS[m].All.nps),
        urban: monthsRaw.map(m => res.monthly.NPS[m].Urban.nps),
        rural: monthsRaw.map(m => res.monthly.NPS[m].Rural.nps)
      };

      // 7. SQI Monthly Trend (Area Chart)
      const sqiTrend = initEChart('sqiMonthlyChart');
      if (sqiTrend) {
        sqiTrend.setOption({
          color: [colors.primary, colors.success, colors.warning],
          tooltip: { trigger: 'axis' },
          legend: { top: 0 },
          grid: { top: '10%', bottom: '15%', left: '5%', right: '5%', containLabel: true },
          xAxis: { type: 'category', boundaryGap: false, data: labels },
          yAxis: { type: 'value', min: 0, max: 5 },
          series: [
            { name: 'Overall', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: sqiData.overall },
            { name: 'Urban', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: sqiData.urban },
            { name: 'Rural', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: sqiData.rural }
          ],
          markLine: {
            symbol: 'none',
            data: [{ yAxis: 4 }],
            lineStyle: { color: colors.target, type: 'dashed' }
          }
        });
      }

      // 8. NPS Monthly Trend (Area Chart)
      const npsTrend = initEChart('npsMonthlyChart');
      if (npsTrend) {
        npsTrend.setOption({
          color: [colors.primary, colors.success, colors.warning],
          tooltip: { trigger: 'axis' },
          legend: { bottom: 0 },
          grid: { top: '10%', bottom: '15%', left: '5%', right: '5%', containLabel: true },
          xAxis: { type: 'category', boundaryGap: false, data: labels },
          yAxis: { type: 'value', min: -100, max: 100 },
          series: [
            { name: 'Overall', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: npsData.overall },
            { name: 'Urban', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: npsData.urban },
            { name: 'Rural', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: npsData.rural }
          ],
          markLine: {
            symbol: 'none',
            data: [{ yAxis: 60 }],
            lineStyle: { color: colors.target, type: 'dashed' }
          }
        });
      }

      // Handle responsive resize for all charts
      window.addEventListener('resize', () => {
        [sqiComp, npsComp, sqiTrend, npsTrend].forEach(c => c && c.resize());
      });

      // Hide loading overlay
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.style.display = 'none';

    })
    .catch(err => {
      console.error("Dashboard Load Error:", err);
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.innerHTML = '<div class="text-danger fw-bold">Failed to load data. Please refresh.</div>';
    });