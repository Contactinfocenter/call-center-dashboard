    const CSV_URL = "https://raw.githubusercontent.com/Contactinfocenter/audit/main/AuditData.csv";

    const colors = {
      primary: '#4154f1',
      success: '#2eca6a',
      warning: '#ff771d',
      danger: '#dc2626',
      info: '#0dcaf0'
    };

    const targetLine = (value, label) => ({
      type: 'line',
      yMin: value,
      yMax: value,
      borderColor: colors.danger,
      borderWidth: 2,
      borderDash: [6, 6],
      label: { content: label, position: 'end', backgroundColor: 'rgba(220,38,38,0.9)', color: '#fff', font: { weight: 'bold' } }
    });

    const beautifulTooltip = {
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      titleColor: '#012970',
      bodyColor: '#333',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      cornerRadius: 10,
      padding: 12,
      titleFont: { size: 15, weight: 'bold' },
      bodyFont: { size: 14 },
      displayColors: true,
      caretPadding: 10
    };

    const mapping = {
      "Empathize with the client": "Lack of Empathy",
      "empathize": "Lack of Empathy",
      "Make client feel better than before": "Lack of Empathy",
      "Make client feel better": "Lack of Empathy",
      "Willingness to help": "Lack of Willingness to Help",
      "helping attitude": "Lack of Willingness to Help",
      "Avoid interrupting the client": "Interruption / Restlessness",
      "Interrupting the client": "Interruption / Restlessness",
      "Restlessness": "Interruption / Restlessness",
      "Hurriedness": "Interruption / Restlessness",
      "hurriedness": "Interruption / Restlessness",
      "Pach was fast": "Interruption / Restlessness",
      "pach was fast": "Interruption / Restlessness",
      "pach was little fast": "Interruption / Restlessness",
      "Apology sincerely": "Sincere Apology Missing",
      "apologize sincerely": "Sincere Apology Missing",
      "intensify": "Sincere Apology Missing",
      "Use Carnival Internet's unique welcome process": "Greeting Issue",
      "welcome process": "Greeting Issue",
      "Greeting Issue": "Greeting Issue",
      "late greeting": "Greeting Issue",
      "Late response": "Greeting Issue",
      "late response": "Greeting Issue",
      "Salam not answer": "Greeting Issue",
      "Salam not provided": "Greeting Issue",
      "Own name": "Greeting Issue",
      "company name": "Greeting Issue",
      "Offer an appropriate solution/ Provide Right Info": "Incorrect Info / Solution",
      "Provide Right Info": "Incorrect Info / Solution",
      "Right Info": "Incorrect Info / Solution",
      "SLA not share": "Incorrect Info / Solution",
      "VIVR": "VIVR Missing",
      "VIVR miss": "VIVR Missing",
      "VIVR info": "VIVR Missing",
      "VVIR": "VIVR Missing",
      "VIVR Info share missing": "VIVR Missing",
      "further assistance": "Further Assistance Missing",
      "Further Assistance miss": "Further Assistance Missing",
      "Offer further assistance miss": "Further Assistance Missing",
      "dead timer": "Dead Timer / Lack of Focus",
      "Dead timer": "Dead Timer / Lack of Focus",
      "Have focus on dead timer": "Dead Timer / Lack of Focus",
      "Have focus on client's statements": "Dead Timer / Lack of Focus",
      "Actively Listen": "Dead Timer / Lack of Focus",
      "Speak clearly": "Speech Clarity / Pronunciation Issue",
      "Speech Rate": "Speech Clarity / Pronunciation Issue",
      "pronunciation": "Speech Clarity / Pronunciation Issue",
      "Spelling": "Speech Clarity / Pronunciation Issue",
      "Mumbling": "Speech Clarity / Pronunciation Issue",
      "Speak politely, calmly & warmly": "Inappropriate Tone",
      "appropriate tone & terms": "Inappropriate Tone",
      "Casual way of talking": "Inappropriate Tone",
      "pause/hold etiquettes": "Pause/Hold Etiquette Violation",
      "Max. pause": "Pause/Hold Etiquette Violation",
      "Follow proper closing process": "Improper Closing",
      "Confirm client's Name": "ID Confirmation Issue",
      "Confirm Client Identity": "ID Confirmation Issue",
      "magical words": "Missing Magic Words",
      "Thank you, please , kindly, sorry": "Missing Magic Words",
      "Follow service guidelines properly": "Did Not Follow Guidelines",
      "Solving Skill": "Did Not Follow Guidelines",
      "sufficient product/resource knowledge": "Insufficient Product Knowledge",
      "Stand by any given commitment": "Commitment Not Honored",
      "call back not found": "Commitment Not Honored",
      "Incomp. Info/Service": "Incomplete Info/Service",
      "Miscommunication": "Miscommunication",
      "Unusual Silence or Hangup": "Unusual Silence / Hangup"
    };

    
/* =====================================================
   2. REMARK → IMPROVEMENT MAPPING
   ===================================================== */

function mapRemarkToImprovement(remark) {
      if (!remark) return null;
      const lowerRemark = remark.toLowerCase();
      for (const key in mapping) {
        if (lowerRemark.includes(key.toLowerCase())) {
          return mapping[key];
        }
      }
      return null;
    }

    let agentTrendChart = null;
    let allAudits = [];
    let sortedMonths = [];

    
/* =====================================================
   3. DATA LOADING & INITIALIZATION
   ===================================================== */

async function loadDashboard() {
      //document.getElementById('loadingOverlay').style.display = 'flex';

      try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error('Failed to load CSV');
        const text = await response.text();

        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        const audits = [];
        for (let i = 1; i < lines.length; i++) {
          const values = [];
          let current = '';
          let inQuotes = false;
          for (const char of lines[i] + ',') {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              values.push(current.trim().replace(/^"|"$/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          if (values.length === headers.length) {
            const obj = {};
            headers.forEach((h, j) => obj[h] = values[j]);
            audits.push(obj);
          }
        }

        const dateCol = 'Call Date:';
        const agentIdCol = 'Agent ID';
        const agentNameCol = 'Agent Name';
        const totalMarkCol = 'Total Mark';
        const gradeCol = 'Grade';
        const remarkCol = 'Remark';
        const clientAreaCol = 'Client Area';
        const fcrCol = 'Right FCR Staus Selected';

        const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        audits.forEach(a => {
          const dateStr = a[dateCol] || '';
          const parts = dateStr.split(' ');
          const datePart = parts[0];
          const timePart = parts[1] || '';
          const [month, day, year] = datePart.split('/');
          let date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart || '00:00:00'}`);
          if (isNaN(date.getTime())) date = new Date(dateStr);
          a.date = isNaN(date.getTime()) ? null : date;
          a.month = a.date ? a.date.toLocaleString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
          a.score = parseFloat(a[totalMarkCol]) || 0;
          a.grade = a[gradeCol]?.trim() || '';
          a.remark = a[remarkCol] || '';
          a.location = a[clientAreaCol] || '';
          a.fcr = a[fcrCol] || '';
          a.agentKey = `${a[agentIdCol]?.trim()} - ${a[agentNameCol]?.trim()}`;
          a.agentNameLower = a[agentNameCol]?.trim().toLowerCase() || '';
        });

        const validAudits = audits.filter(a => a.date && a.score > 0);
        allAudits = validAudits;

        // Populate month dropdowns for agent table filter
        const uniqueMonths = [...new Set(validAudits.map(a => a.month))].filter(m => m !== 'Unknown');
        sortedMonths = uniqueMonths.sort((a, b) => {
          const [aM, aY] = a.split(' ');
          const [bM, bY] = b.split(' ');
          if (aY !== bY) return aY.localeCompare(bY);
          return monthOrder.indexOf(aM) - monthOrder.indexOf(bM);
        });

        const fromSelect = document.getElementById('agentFromMonth');
        const toSelect = document.getElementById('agentToMonth');

        fromSelect.innerHTML = '<option value="all">All Months</option>';
        toSelect.innerHTML = '<option value="all">All Months</option>';

        sortedMonths.forEach(m => {
          const optFrom = document.createElement('option');
          optFrom.value = m;
          optFrom.textContent = m;
          fromSelect.appendChild(optFrom);

          const optTo = optFrom.cloneNode(true);
          toSelect.appendChild(optTo);
        });

        fromSelect.value = 'all';
        toSelect.value = 'all';

        // Initial load of agent table
        updateAgentTable();

        // Search, Apply, Reset handlers
        document.getElementById('agentSearch').addEventListener('input', updateAgentTable);
        document.getElementById('applyAgentFilter').onclick = updateAgentTable;
        document.getElementById('resetAgentFilter').onclick = () => {
          document.getElementById('agentSearch').value = '';
          fromSelect.value = 'all';
          toSelect.value = 'all';
          updateAgentTable();
        };

        // KPIs
        const totalCalls = validAudits.length;
        const avgScore = totalCalls ? (validAudits.reduce((sum, a) => sum + a.score, 0) / totalCalls).toFixed(1) : '0.0';
        const passCount = validAudits.filter(a => ['Excellent', 'Good', 'Average'].includes(a.grade)).length;
        const passRate = totalCalls ? ((passCount / totalCalls) * 100).toFixed(1) : '0.0';
        const goodCount = validAudits.filter(a => ['Excellent', 'Good'].includes(a.grade)).length;
        const excellentGoodRate = totalCalls ? ((goodCount / totalCalls) * 100).toFixed(1) : '0.0';
        const fcrCount = validAudits.filter(a => a.fcr.toLowerCase().includes('yes')).length;
        const fcrRate = totalCalls ? ((fcrCount / totalCalls) * 100).toFixed(1) : '0.0';

        document.getElementById('totalCalls').textContent = totalCalls.toLocaleString();
        document.getElementById('avgScore').textContent = avgScore;
        document.getElementById('passRate').textContent = passRate + '%';
        document.getElementById('excellentGoodRate').textContent = excellentGoodRate + '%';
        document.getElementById('fcrRate').textContent = fcrRate;

        // Location
        const isUrban = loc => /urban|city/i.test(loc);
        const isRural = loc => /rural/i.test(loc);

        const getLocationStats = filterFn => {
          const list = filterFn ? validAudits.filter(a => filterFn(a.location)) : validAudits;
          if (list.length === 0) return { avg: 'N/A', pass: 'N/A', good: 'N/A' };
          const avg = (list.reduce((sum, a) => sum + a.score, 0) / list.length).toFixed(1);
          const pass = ((list.filter(a => ['Excellent','Good','Average'].includes(a.grade)).length / list.length) * 100).toFixed(1);
          const good = ((list.filter(a => ['Excellent','Good'].includes(a.grade)).length / list.length) * 100).toFixed(1);
          return { avg, pass, good };
        };

        const location = {
          overall: getLocationStats(),
          urban: getLocationStats(isUrban),
          rural: getLocationStats(isRural)
        };

        document.getElementById('overallAvg').textContent = location.overall.avg;
        document.getElementById('overallPass').textContent = location.overall.pass + '%';
        document.getElementById('overallGood').textContent = location.overall.good + '%';
        document.getElementById('urbanAvg').textContent = location.urban.avg;
        document.getElementById('urbanPass').textContent = location.urban.pass + '%';
        document.getElementById('urbanGood').textContent = location.urban.good + '%';
        document.getElementById('ruralAvg').textContent = location.rural.avg;
        document.getElementById('ruralPass').textContent = location.rural.pass + '%';
        document.getElementById('ruralGood').textContent = location.rural.good + '%';


// Grade Distribution Donut Chart (ECharts)

// Grades Configuration
const grades = ['Excellent', 'Good', 'Average', 'Below Average', 'Fail'];
const gradeCounts = grades.map(g => validAudits.filter(a => a.grade === g).length);

if (gradeCounts.some(v => v > 0)) {
    const gradeChartDom = document.getElementById('gradeChart');
    const gradeChart = echarts.init(gradeChartDom);
    const totalAudits = gradeCounts.reduce((a, b) => a + b, 0);

    function setCenterText(main, sub, color = '#1e293b') {
        gradeChart.setOption({
            series: [{
                label: {
                    formatter: `{main|${main}}\n{sub|${sub}}`,
                    rich: {
                        main: { color: color }
                    }
                }
            }]
        });
    }

    function resetView() {
        gradeChart.setOption({
            series: [{
                data: grades.map((g, i) => ({
                    name: g,
                    value: gradeCounts[i],
                    itemStyle: { 
                        opacity: 1,
                        borderRadius: 0,
                        borderWidth: 0 
                    }
                }))
            }]
        });
        setCenterText(totalAudits.toLocaleString(), 'Total Audits');
    }

    const option = {
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 8,
            borderWidth: 0,
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.1)'
        },
        legend: {
            orient: 'vertical',
            right: '5%', // Adjusted for smaller chart
            top: 'middle',
            icon: 'rect',
            itemGap: 12,
            textStyle: { fontWeight: '600', color: '#475569', fontSize: 12 }
        },
        series: [{
            name: 'Audit Quality',
            type: 'pie',
            /* --- SIZE REDUCTION START --- */
            radius: ['50%', '70%'], // Reduced from 62%-85%
            center: ['40%', '50%'], // Centered slightly more
            /* --- SIZE REDUCTION END --- */
            avoidLabelOverlap: true,
            itemStyle: { 
                borderRadius: 0, 
                borderWidth: 0 
            },
            label: {
                show: true,
                position: 'center',
                formatter: `{main|${totalAudits.toLocaleString()}}\n{sub|Total Audits}`,
                rich: {
                    main: { fontSize: 22, fontWeight: '800', color: '#1e293b', lineHeight: 28 }, // Slightly smaller font
                    sub: { fontSize: 11, color: '#64748b' } // Slightly smaller font
                }
            },
            emphasis: {
                scaleSize: 5, // Reduced scale effect for smaller chart
                label: { show: true }
            },
            data: grades.map((g, i) => ({ name: g, value: gradeCounts[i] }))
        }],
        color: ['#4f46e5', '#0891b2', '#10b981', '#f59e0b', '#ef4444']
    };

    gradeChart.setOption(option);

    // Legend Hover Events
    gradeChart.on('legendmouseover', (params) => {
        const name = params.name;
        const idx = grades.indexOf(name);
        const value = gradeCounts[idx];
        const percent = totalAudits ? ((value / totalAudits) * 100).toFixed(1) : 0;
        
        setCenterText(value.toLocaleString(), `${name} (${percent}%)`, option.color[idx]);

        gradeChart.setOption({
            series: [{
                data: grades.map((g, i) => ({
                    name: g,
                    value: gradeCounts[i],
                    itemStyle: { 
                        opacity: g === name ? 1 : 0.2,
                        borderRadius: 0,
                        borderWidth: 0
                    }
                }))
            }]
        });
    });

    gradeChart.on('legendmouseout', () => { resetView(); });

    // Chart Hover Events
    gradeChart.on('mouseover', 'series', (params) => {
        const percent = params.percent.toFixed(1);
        setCenterText(params.value.toLocaleString(), `${params.name} (${percent}%)`, params.color);
    });

    gradeChart.on('mouseout', 'series', () => { resetView(); });

    window.addEventListener('resize', () => gradeChart.resize());
}


        // Monthly Trends
        const monthlyMap = {};
        validAudits.forEach(a => {
          if (!monthlyMap[a.month]) monthlyMap[a.month] = { scores: [], pass: 0, total: 0 };
          monthlyMap[a.month].scores.push(a.score);
          monthlyMap[a.month].total++;
          if (['Excellent','Good','Average'].includes(a.grade)) monthlyMap[a.month].pass++;
        });

        const sortedMonthsTrend = Object.keys(monthlyMap).sort((a, b) => {
          const [aM, aY] = a.split(' ');
          const [bM, bY] = b.split(' ');
          if (aY !== bY) return aY.localeCompare(bY);
          return monthOrder.indexOf(aM) - monthOrder.indexOf(bM);
        });

        const monthlyTrend = sortedMonthsTrend.map(m => ({
          month: m,
          avgScore: (monthlyMap[m].scores.reduce((s, v) => s + v, 0) / monthlyMap[m].scores.length).toFixed(1),
          passRate: ((monthlyMap[m].pass / monthlyMap[m].total) * 100).toFixed(1)
        }));

        // Average Score Trend 
// 1. Initialize
const scoreChartDom = document.getElementById('scoreTrendChart');
const scoreTrendChart = echarts.init(scoreChartDom);

// 2. Data Preparation
const months = monthlyTrend.map(m => m.month);
const scores = monthlyTrend.map(m => parseFloat(m.avgScore));

// 3. Phoenix Styled Options
const scoreOption = {
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'transparent', // Custom HTML tooltip
    borderWidth: 0,
    padding: 0,
    axisPointer: {
      type: 'line',
      lineStyle: { color: '#cbd5e1', width: 1 }
    },
    // The exact tooltip style from your previous dashboard
    formatter: function (params) {
      const p = params[0];
      return `
        <div style="
          padding:10px 14px;
          background:rgba(255,255,255,0.96);
          border:1px solid #e2e8f0;
          border-radius:6px;
          box-shadow:0 4px 16px rgba(0,0,0,0.12);
          font-family:Inter, system-ui, sans-serif;
          min-width:180px;
        ">
          <div style="font-weight:600; 
            color:#1e293b; 
            margin-bottom:12px; 
            border-bottom: 1px solid #f1f5f9; 
            font-size:14px; 
            padding-bottom: 4px;">
            ${p.name}
          </div>
          <div style="display:flex; align-items:center;">
            <span style="
              display:inline-block;
              width:10px;
              height:10px;
              border-radius:50%;
              background:${p.color};
              margin-right:10px;
            "></span>
            <span style="color:#64748b; font-size:13px;">Average Score:</span>
            <span style="font-weight:700; margin-left:8px; color:#1e293b;">
              ${p.value.toFixed(2)}
            </span>
          </div>
        </div>
      `;
    }
  },
  grid: {
    left: '2%',
    right: '2%',
    top: '10%',
    bottom: '5%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: months,
    boundaryGap: false, // Clean start from edge
    axisLine: { lineStyle: { color: '#f1f5f9' } },
    axisLabel: { 
      color: '#64748b', 
      fontSize: 12, 
      fontWeight: 500,
      margin: 15
    },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    min: 9.0,
    max: 10.0,
    interval: 0.2, // Cleaner steps for a 9-10 range
    splitLine: { 
      show: true, 
      lineStyle: { color: '#f1f5f9', type: 'dashed' } 
    },
    axisLabel: { 
      color: '#64748b', 
      fontSize: 11,
      formatter: (val) => val.toFixed(1)
    }
  },
  series: [{
    name: 'Average Score',
    type: 'line',
    data: scores,
    smooth: true,
    showSymbol: false, // Symbols only appear on hover
    symbol: 'circle',
    symbolSize: 10,
    itemStyle: {
      color: '#3874ff', // Tabler Blue
      borderColor: '#fff',
      borderWidth: 2
    },
    lineStyle: {
      width: 3,
      color: '#3874ff',
      shadowBlur: 8,
      shadowColor: 'rgba(56, 116, 255, 0.2)'
    },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(56, 116, 255, 0.15)' },
        { offset: 1, color: 'rgba(56, 116, 255, 0)' }
      ])
    },
    emphasis: {
      scale: true,
      lineStyle: { width: 3 }
    }
  }]
};

scoreTrendChart.setOption(scoreOption);
window.addEventListener('resize', () => scoreTrendChart.resize());

// Pass Rate Trend
// Check if the container exists before initializing to avoid "null" errors
const passChartDom = document.getElementById('passTrendChart');

if (passChartDom) {
    // Clear existing instance if it's already initialized (prevents "already initialized" error)
    let passTrendChart = echarts.getInstanceByDom(passChartDom);
    if (!passTrendChart) {
        passTrendChart = echarts.init(passChartDom);
    }

    const months = monthlyTrend.map(m => m.month);
    const passRates = monthlyTrend.map(m => parseFloat(m.passRate));

    const passOption = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: 0,
            axisPointer: {
                type: 'line',
                lineStyle: { color: '#cbd5e1', width: 1 }
            },
            formatter: function (params) {
                const p = params[0];
                return `
                    <div style="padding: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); font-family: 'Inter', sans-serif; min-width: 200px;">
                        <div style="font-weight:600; color:#1e293b; margin-bottom:12px; border-bottom: 1px solid #f1f5f9; font-size:14px; padding-bottom: 4px; text-transform: uppercase;">
                            ${p.name}
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center;">
                                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #2eca6a; margin-right: 12px;"></span>
                                <span style="color:#64748b; font-size:13px;">Pass Rate:</span>
                            </div>
                            <span style="font-weight:700; margin-left:8px; color:#1e293b;">
                                ${p.value.toFixed(1)}%
                            </span>
                        </div>

                    </div>
                `;
            }
        },
        grid: { left: '2%', right: '4%', top: '12%', bottom: '5%', containLabel: true },
        xAxis: {
            type: 'category',
            data: months,
            boundaryGap: false,
            axisLine: { lineStyle: { color: '#f1f5f9' } },
            axisLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 500, margin: 15 },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'value',
            min: 80,
            max: 100,
            interval: 5,
            splitLine: { show: true, lineStyle: { color: '#f1f5f9', type: 'dashed' } },
            axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (val) => val + '%' }
        },
        series: [{
            name: 'Pass Rate',
            type: 'line',
            data: passRates,
            smooth: true,
            showSymbol: false,
            symbol: 'circle',
            symbolSize: 10,
            itemStyle: { color: '#2eca6a', borderColor: '#fff', borderWidth: 2 },
            lineStyle: { 
                width: 3, 
                color: '#2eca6a',
                shadowBlur: 10,
                shadowColor: 'rgba(46, 202, 106, 0.25)' 
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(46, 202, 106, 0.15)' },
                    { offset: 1, color: 'rgba(46, 202, 106, 0)' }
                ])
            }
        }]
    };

    passTrendChart.setOption(passOption);
    window.addEventListener('resize', () => passTrendChart.resize());
} else {
    console.error("Error: Element #passTrendChart not found.");
}

// 7 top lost resoan chArt

// 1. Data Calculation (Logic remains the same as your snippet)
const parameterColumns = headers.filter(h => 
    h.includes('/') || h.includes('process') || h.includes('etiquettes') || 
    h.includes('profanity') || h.includes('urgency') || h.includes('assistance') || 
    h.includes('closing') || h.includes('SLA') || h.includes('knowledge')
);

const lowestParameters = parameterColumns.map(p => {
    const values = validAudits.map(a => parseFloat(a[p]) || 10);
    const avgScore = values.reduce((a, b) => a + b, 0) / (totalCalls || 1);
    const lostMarks = (10 - avgScore).toFixed(1);
    return { parameter: p, lostMarks: parseFloat(lostMarks), avgScore: avgScore.toFixed(1) };
}).sort((a, b) => b.lostMarks - a.lostMarks).slice(0, 7);

// 2. Initialize Chart
const lowParamsDom = document.getElementById('lowParamsChart');
const lowParamsChart = echarts.init(lowParamsDom);

// Data mapping
const values = lowestParameters.map(p => Number(p.lostMarks.toFixed(1)));
const labels = lowestParameters.map(p => p.parameter);

const lowParamsOption = {
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    backgroundColor: 'transparent', // Set to transparent because you have a custom div inside
    borderWidth: 0,
    padding: 0,
    confine: true,
    formatter: (params) => {
      // FIX: Use params[0] because trigger is 'axis'
      const p = lowestParameters[params[0].dataIndex];
      return `
        <div style="padding:16px; background:#ffffff; border:1px solid #e0e7ff; border-radius:12px; box-shadow:0 10px 15px -3px rgba(0,0,0,.1); font-family:Inter,sans-serif; min-width:280px;">
          <div style="font-weight:700; color:#012970; font-size:14px; margin-bottom:10px; border-bottom:2px solid #f0f4ff; padding-bottom:8px; line-height:1.4;">
            ${p.parameter}
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="color:#64748b;font-size:13px;">Average Score:</span>
            <span style="font-weight:700;color:#1e293b;">${p.avgScore} / 10</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="color:#dc2626;font-size:13px;font-weight:600;">Marks Lost:</span>
            <span style="font-weight:800;color:#dc2626;">${p.lostMarks} / 10</span>
          </div>
          <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0; display:flex; justify-content:space-between;">
            <span style="color:#475569;font-size:12px;">Improvement Potential:</span>
            <span style="font-weight:700;color:#dc2626;">+${p.lostMarks} points</span>
          </div>
        </div>
      `;
    }
  },

  grid: {
    left: '3%',
    right: '4%',
    top: '12%',
    bottom: '8%',
    containLabel: true
  },

  xAxis: {
    type: 'category',
    data: labels,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#f1f5f9' } },
    axisLabel: { show: false }
  },

  yAxis: {
    type: 'value',
    min: 0,
    max: 10,
    splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
    axisLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8' }
  },

  series: [{
    name: 'Impact Analysis',
    type: 'bar',
    barWidth: '65%',
    data: values,
    itemStyle: {
      color: '#fb628b', // Your pinkish-red Phoenix color
      borderRadius: [6, 6, 0, 0]
    },
    label: {
      show: true,
      rotate: 90,
      position: 'insideBottom',
      align: 'left',
      verticalAlign: 'middle',
      distance: 15,
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 700,
      formatter: (params) => {
        const label = labels[params.dataIndex] || '';
        return label.length > 40 ? label.slice(0, 37) + '...' : label;
      }
    },
    emphasis: {
      focus: 'series',
      itemStyle: {
        color: '#f43f5e' // Slightly darker highlight
      }
    }
  }]
};

lowParamsChart.setOption(lowParamsOption);
window.addEventListener('resize', () => lowParamsChart.resize());


// Top 10 Issues from Remarks - Exclude Positive Remarks
const remarkCounts = {};
validAudits.forEach(a => {
  if (a.remark) {
    a.remark.split('#')
      .map(r => r.trim())
      .filter(r => r.length > 3)
      .filter(r => {
        const lower = r.toLowerCase();
        return ![
          'all good', 'okay', 'ok', 'good', 'perfect',
          'no issue', 'no issues', 'everything ok', 'all okay'
        ].some(positive => lower.includes(positive));
      })  // ← PLACE IT HERE
      .forEach(r => {
        remarkCounts[r] = (remarkCounts[r] || 0) + 1;
      });
  }
});

const topRemarks = Object.entries(remarkCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([issue, count]) => ({ issue, count }));

// ApexCharts - Top Remarks Chart (remains unchanged below)
const remarksDom = document.getElementById('topRemarksChart');
if (remarksDom && typeof topRemarks !== 'undefined') {
    const remarksChart = echarts.init(remarksDom);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: 0,
            axisPointer: { 
                type: 'shadow', 
                shadowStyle: { color: 'rgba(241, 245, 249, 0.5)' } 
            },
            formatter: function(params) {
                const dataIndex = params[0].dataIndex;
                const r = topRemarks[dataIndex];
                return `
                    <div style="padding: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); font-family: 'Inter', sans-serif; max-width: 350px;">
                        <div style="font-weight:700; color:#012970; margin-bottom:8px; border-bottom: 1px solid #f1f5f9; font-size:13px; padding-bottom: 6px; line-height:1.4;">
                            ${r.issue}
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <span style="color: #64748b; font-size: 13px;">Frequency:</span>
                            <span style="font-weight: 800; color: #dc2626; font-size: 16px;">
                                ${r.count} <small style="font-size: 10px; font-weight: 400;">times</small>
                            </span>
                        </div>
                    </div>
                `;
            }
        },
        grid: {
            left: '3%',
            right: '10%',
            top: '5%',
            bottom: '5%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false }
        },
        yAxis: {
            type: 'category',
            // Map labels and truncate for the Y-axis display
            data: topRemarks.map(r => r.issue.length > 45 ? r.issue.substring(0, 42) + '...' : r.issue),
            inverse: true, // Highest occurrences at the top
            axisLine: { show: true, lineStyle: { color: '#f1f5f9' } },
            axisTick: { show: false },
            axisLabel: {
                color: '#012970',
                fontSize: 12,
                fontWeight: 600,
                margin: 15
            }
        },
        series: [{
            name: 'Occurrences',
            type: 'bar',
            data: topRemarks.map(r => r.count),
            barWidth: 22,
            itemStyle: {
                // Phoenix Red Gradient
                color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                    { offset: 0, color: '#ef4444' }, // Light red end
                    { offset: 1, color: '#b91c1c' }  // Dark red start
                ]),
                borderRadius: [0, 6, 6, 0] // Rounded on the right side only
            },
            label: {
                show: true,
                position: 'right',
                formatter: '{c}',
                fontWeight: 700,
                color: '#b91c1c',
                fontSize: 13,
                distance: 10
            },
            emphasis: {
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                        { offset: 0, color: '#f87171' },
                        { offset: 1, color: '#991b1b' }
                    ])
                }
            }
        }]
    };

    remarksChart.setOption(option);
    window.addEventListener('resize', () => remarksChart.resize());
} 

// Individual Agent Trend
        const agentMonthly = {};
        validAudits.forEach(a => {
          const key = a.agentKey;
          if (!agentMonthly[key]) agentMonthly[key] = {};
          if (!agentMonthly[key][a.month]) agentMonthly[key][a.month] = { scores: [], remarks: [] };
          agentMonthly[key][a.month].scores.push(a.score);
          if (a.remark) agentMonthly[key][a.month].remarks.push(...a.remark.split('#').map(r => r.trim()).filter(r => r.length > 3));
        });

        const agentMonthlyData = {};
        Object.keys(agentMonthly).forEach(key => {
          agentMonthlyData[key] = Object.keys(agentMonthly[key]).map(m => ({
            month: m,
            avgScore: (agentMonthly[key][m].scores.reduce((s, v) => s + v, 0) / agentMonthly[key][m].scores.length).toFixed(2),
            remarks: agentMonthly[key][m].remarks
          })).sort((a, b) => {
            const [aM, aY] = a.month.split(' ');
            const [bM, bY] = b.month.split(' ');
            if (aY !== bY) return aY.localeCompare(bY);
            return monthOrder.indexOf(aM) - monthOrder.indexOf(bM);
          });
        });

        const agentChipsContainer = document.getElementById('agentChips');
const noAgentsMsg = document.getElementById('noAgentsMessage');

if (!agentChipsContainer) return;

agentChipsContainer.innerHTML = '';

const agentKeys = Object.keys(agentMonthlyData || {}).sort(
  (a, b) => a.split(' - ')[1].localeCompare(b.split(' - ')[1])
);

if (agentKeys.length === 0) {
  if (noAgentsMsg) noAgentsMsg.style.display = 'block';
  return;
}

if (noAgentsMsg) noAgentsMsg.style.display = 'none';

agentKeys.forEach((key, index) => {
  const name = key.split(' - ')[1];

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-pill btn-outline-primary';

  if (index === 0) {
    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-primary', 'active');
  }

  btn.textContent = name;
  btn.dataset.key = key;

  btn.addEventListener('click', () => {
    agentChipsContainer.querySelectorAll('button').forEach(b => {
      b.classList.remove('btn-primary', 'active');
      b.classList.add('btn-outline-primary');
    });

    btn.classList.remove('btn-outline-primary');
    btn.classList.add('btn-primary', 'active');

    renderAgentTrend(key, agentMonthlyData[key]);
  });

  agentChipsContainer.appendChild(btn);
});

// Auto-load first agent
renderAgentTrend(agentKeys[0], agentMonthlyData[agentKeys[0]]);


        //document.getElementById('loadingOverlay').style.display = 'none';
      } catch (err) {
        console.error(err);
        alert('Error loading data: ' + err.message);
        //document.getElementById('loadingOverlay').style.display = 'none';
      }
    }

    
/* =====================================================
   6. AGENT TABLE (FILTER + RENDER)
   ===================================================== */

function updateAgentTable() {
      const searchTerm = document.getElementById('agentSearch').value.toLowerCase();
      const from = document.getElementById('agentFromMonth').value;
      const to = document.getElementById('agentToMonth').value;

      let filtered = allAudits;

      if (from !== 'all' || to !== 'all') {
        const fromIdx = from === 'all' ? 0 : sortedMonths.indexOf(from);
        const toIdx = to === 'all' ? sortedMonths.length : sortedMonths.indexOf(to) + 1;
        const selectedMonths = sortedMonths.slice(fromIdx, toIdx);
        filtered = filtered.filter(a => selectedMonths.includes(a.month));
      }

      if (searchTerm) {
        filtered = filtered.filter(a => a.agentNameLower.includes(searchTerm));
      }

      const agents = {};
      filtered.forEach(a => {
        const key = a.agentKey;
        if (!agents[key]) agents[key] = { id: a['Agent ID'], name: a['Agent Name'], scores: [], grades: [] };
        agents[key].scores.push(a.score);
        agents[key].grades.push(a.grade);
      });

      const agentList = Object.values(agents).map(ag => ({
        id: ag.id,
        name: ag.name,
        numAudits: ag.scores.length,
        avgScore: (ag.scores.reduce((s, v) => s + v, 0) / ag.scores.length).toFixed(2),
        passRate: ((ag.grades.filter(g => ['Excellent','Good','Average'].includes(g)).length / ag.grades.length) * 100).toFixed(1)
      })).sort((a, b) => b.avgScore - a.avgScore);

      const agentTable = document.getElementById('agentTableBody');
      agentTable.innerHTML = '';
      agentList.forEach((agent, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="text-center font-medium text-gray-600">${i+1}</td>
          <td class="label">${agent.name} (${agent.id})</td>
          <td class="text-center">${agent.numAudits}</td>
          <td class="text-center font-semibold text-blue-600">${agent.avgScore}</td>
          <td class="text-center text-green-600 font-medium">${agent.passRate}%</td>
        `;
        agentTable.appendChild(row);
      });

      if (agentList.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center text-gray-500 py-8">No agents match the current filters</td>';
        agentTable.appendChild(row);
      }
    }

let agentTrendChartInstance = null; 


/* =====================================================
   7. INDIVIDUAL AGENT TREND CHART
   ===================================================== */

function renderAgentTrend(agentKey, agentData) {
    const chartDom = document.getElementById('agentTrendChart');
    if (!chartDom) return;

    if (agentTrendChartInstance) {
        if (typeof agentTrendChartInstance.dispose === 'function') agentTrendChartInstance.dispose();
    }

    if (!agentData || agentData.length === 0) {
        chartDom.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-gray-500 font-medium">No data available</p></div>`;
        return;
    }

    agentTrendChartInstance = echarts.init(chartDom);

    const months = agentData.map(d => d.month);
    const scores = agentData.map(d => parseFloat(d.avgScore));

    const improvementPerMonth = agentData.map(d => {
        const issues = {};
        if (d.remarks) {
            d.remarks.forEach(r => {
                const issue = typeof mapRemarkToImprovement === 'function' ? mapRemarkToImprovement(r) : r;
                if (issue) issues[issue] = (issues[issue] || 0) + 1;
            });
        }
        return Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([issue, count]) => `• ${issue} (${count})`);
    });

    const option = {
        backgroundColor: 'transparent',
        // 1. DYNAMIC LEGEND
        legend: {
            show: true,
            right: '5%',
            top: '0%',
            icon: 'circle', // Using circle for a cleaner look
            textStyle: { 
                color: '#012970', 
                fontWeight: 700, 
                fontSize: 12, 
                fontFamily: 'Inter' 
            }
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: 0,
            confine: true,
            axisPointer: { type: 'line', lineStyle: { color: '#4154f1', width: 2, type: 'dashed' } },
            formatter: function (params) {
                const idx = params[0].dataIndex;
                const month = months[idx];
                const score = scores[idx].toFixed(2);
                const areas = improvementPerMonth[idx];
                
                let areasHTML = areas.length > 0 
                    ? areas.map(a => `<div style="color:#475569; font-size:11px; margin-top:3px;">${a}</div>`).join('')
                    : `<div style="color:#94a3b8; font-size:11px; margin-top:3px; font-style:italic;">Consistent Performance</div>`;

                return `
                    <div style="padding: 14px; background: #ffffff; border: 1px solid #e0e7ff; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); font-family: 'Inter', sans-serif; min-width: 260px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0f4ff; padding-bottom: 8px; margin-bottom: 10px;">
                            <span style="font-weight:700; color:#012970; font-size:14px;">${month}</span>
                            <span style="font-weight:800; color:#4154f1; font-size:14px;">${score} <span style="font-size:10px; font-weight:500; color:#94a3b8;">/ 10</span></span>
                        </div>
                        <div>
                            <div style="font-weight: 700; color: #1e293b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Improvement Focus:</div>
                            ${areasHTML}
                        </div>
                    </div>`;
            }
        },
        grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
        xAxis: {
            type: 'category',
            data: months,
            boundaryGap: false,
            axisLine: { lineStyle: { color: '#f1f5f9' } },
            axisLabel: { color: '#012970', fontWeight: 600, fontSize: 11 }
        },
        yAxis: {
            type: 'value',
            min: 8.0,
            max: 10.0,
            interval: 0.4,
            splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
            axisLabel: { color: '#94a3b8', fontWeight: 500, fontSize: 10, formatter: (v) => v.toFixed(1) }
        },
        series: [{
            // 2. SET SERIES NAME TO AGENT NAME
            name: agentKey, 
            type: 'line',
            data: scores,
            smooth: true,
            symbolSize: 8,
            showSymbol: false,
            itemStyle: { color: '#4154f1', borderColor: '#fff', borderWidth: 2 },
            lineStyle: { width: 3, color: '#4154f1' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(65, 84, 241, 0.3)' },
                    { offset: 1, color: 'rgba(65, 84, 241, 0)' }
                ])
            },
            emphasis: { showSymbol: true, scale: true }
        }]
    };

    agentTrendChartInstance.setOption(option);
}

    loadDashboard();
    const criteriaFullNames = [
    "Right Call Reason Selected?", "Gap over 5sec after call end", "Use Carnival Internet's unique welcome process promptly",
    "Politely ask client's problem/ Clearly state the reason of calling", "Actively Listen to the client so that no voice remain unheard",
    "Use the appropriate tone & terms / Speak politely & warmly", "Apology sincerely if required & Intensify the way of apology upon problem/dissatisfaction's Intensity",
    "Empathize with the client/ Make client feel better than before", "Avoid interrupting the client/Restlessness",
    "Respond promptly to client's questions/ Have foucs on client's statements", "Speak clearly maintaining Speech Rate with proper pronunciation",
    "Follow pause/hold etiquettes properly (Max. pause 5sec without permission & 25sec with permission)", "Use of profanity/ Sarcasm/ Rudeness/ Shouting/ Unusual Silence or Hangup",
    "Understand client's pace/urgency", "Confirm client's Name to make sure we are working on right ID",
    "Verify the client when required if client call's from unreg. number", "Properly identify the problem/client's voice",
    "Follow troubleshooting guidelines properly/ Solving Skill", "Resolve the client’s issues or Transfer the issue to the right channel stating SLA",
    "Offer an appropriate solution/ Provide Right Info", "Have sufficient product/resource knowledge & Share complete info with the client",
    "Manage client’s expectations ANYHOW & Never leave client dissatisfied", "Offer further assistance", "Follow proper closing process", "Stand by any given commitment"
];

const shortLabels = [
    "Right Call Reason", "Dead Call >5s", "Welcome Process", "Ask Problem", "Active Listening",
    "Tone & Terms", "Sincere Apology", "Empathy", "No Interruption", "Prompt Response",
    "Speech Clarity", "Pause/Hold Rules", "Professionalism", "Pace/Urgency", "Confirm Name",
    "Verify Unreg", "Problem ID", "Troubleshooting", "Issue Resolution", "Right Info",
    "Product Knowledge", "Manage Expectations", "Offer Assist", "Closing Process", "Commitment"
];

async function loadAndRender() {
    const container = document.getElementById('chart-container');
    if (!container) return;

    try {
        const response = await fetch('https://raw.githubusercontent.com/Contactinfocenter/audit/main/AuditData.csv');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();

        const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            transform: val => (typeof val === 'string' ? val.trim() : val)
        });

        const rows = parsed.data.filter(row => Object.keys(row).length > 10);
        
        // Process Data
        const chartData = criteriaFullNames.map((full, i) => {
            let sumLost = 0, count = 0;
            rows.forEach(row => {
                let val = row[full];
                let score = (typeof val === 'number') ? val : 
                            (val === 'OK' || val === 'Yes' || val === '1' ? 1 : 0);
                
                sumLost += (1 - score);
                count++;
            });
            return { 
                short: shortLabels[i], 
                full: full, 
                lost: count > 0 ? parseFloat((sumLost / count).toFixed(3)) : 0 
            };
        })
        .filter(d => d.lost > 0)
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 10);

        const myChart = echarts.init(container);

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'transparent',
                borderWidth: 0,
                padding: 0,
                confine: true,
                formatter: (params) => {
                    const d = chartData[params[0].dataIndex];
                    return `
                        <div style="padding:16px; background:#ffffff; border:1px solid #e0e7ff; border-radius:12px; box-shadow:0 10px 15px -3px rgba(0,0,0,.1); font-family:Inter,sans-serif; min-width:280px;">
                            <div style="font-weight:700; color:#012970; font-size:13px; margin-bottom:10px; border-bottom:2px solid #f0f4ff; padding-bottom:8px; line-height:1.4;">
                                ${d.full}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:#64748b; font-size:13px;">Avg Points Lost:</span>
                                <span style="font-weight:800; color:#dc2626; font-size:16px;">${d.lost.toFixed(3)}</span>
                            </div>
                            <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0; color:#475569; font-size:11px; font-style:italic;">
                                Based on ${rows.length} audits
                            </div>
                        </div>`;
                }
            },
            grid: { 
                left: '3%', 
                right: '4%', 
                top: '12%', 
                bottom: '5%', 
                containLabel: true 
            },
            xAxis: {
                type: 'category',
                data: chartData.map(d => d.short),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: '#f1f5f9' } },
                axisLabel: { show: false } // Labels are now inside the bars
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: '#94a3b8', fontWeight: 600 }
            },
            series: [
                {
                    name: 'Points Lost',
                    type: 'bar',
                    barWidth: '65%',
                    data: chartData.map(d => d.lost),
                    itemStyle: {
                        // Using your Phoenix Pink color
                        color: '#fb628b', 
                        borderRadius: [6, 6, 0, 0]
                    },
                    label: {
                        show: true,
                        rotate: 90,
                        position: 'insideBottom',
                        align: 'left',
                        verticalAlign: 'middle',
                        distance: 15,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'Inter',
                        formatter: (params) => {
                            const label = chartData[params.dataIndex].full;
                            return label.length > 35 ? label.slice(0, 32) + '...' : label;
                        }
                    },
                    emphasis: {
                        itemStyle: { color: '#f43f5e' }
                    }
                }
            ]
        };

        myChart.setOption(option);
        window.addEventListener('resize', () => myChart.resize());

    } catch (err) {
        container.innerHTML = `<div style="color:#ef4444; padding:20px;">Data Load Failed: ${err.message}</div>`;
    }
}

loadAndRender();