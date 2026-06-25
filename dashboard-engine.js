// ==========================================
// DASHBOARD ENGINE
// Random data generation + auto-question creation
// ==========================================

const SCENARIOS = [
    { title: "Regional Sales Performance", metric: "Revenue", unit: "$", unitSuffix: "K",
      labels: ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"], range: [120, 580], chartTypes: ["bar", "horizontalBar", "pie", "polarArea", "kpi"] },
    { title: "Monthly Revenue Trend", metric: "Revenue", unit: "$", unitSuffix: "K",
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], range: [50, 400], chartTypes: ["line", "bar"] },
    { title: "Product Category Performance", metric: "Units Sold", unit: "", unitSuffix: "",
      labels: ["Electronics", "Clothing", "Food & Beverage", "Home & Garden", "Sports"], range: [200, 900], chartTypes: ["bar", "horizontalBar", "pie", "polarArea", "kpi"] },
    { title: "Department Budget Allocation", metric: "Budget", unit: "$", unitSuffix: "K",
      labels: ["Marketing", "Engineering", "Sales", "HR", "Operations", "Finance"], range: [80, 450], chartTypes: ["bar", "horizontalBar", "pie", "polarArea", "kpi"] },
    { title: "Customer Satisfaction Scores", metric: "Score", unit: "", unitSuffix: " pts",
      labels: ["Product Quality", "Customer Service", "Delivery Speed", "Value for Money", "User Experience"], range: [55, 95], chartTypes: ["bar", "horizontalBar", "polarArea"] },
    { title: "Quarterly Profit Margins", metric: "Profit", unit: "$", unitSuffix: "K",
      labels: ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026"], range: [100, 600], chartTypes: ["bar", "line"] },
    { title: "Website Traffic by Source", metric: "Visitors", unit: "", unitSuffix: "K",
      labels: ["Organic Search", "Direct", "Social Media", "Email", "Referral"], range: [30, 250], chartTypes: ["pie", "bar", "horizontalBar", "polarArea", "kpi"] },
    { title: "Employee Headcount by Division", metric: "Employees", unit: "", unitSuffix: "",
      labels: ["Technology", "Operations", "Sales", "Marketing", "Support", "Admin"], range: [25, 180], chartTypes: ["bar", "horizontalBar", "pie", "polarArea", "kpi"] }
];

const CHART_COLORS = [
    'rgba(255, 99, 132, 0.85)', 'rgba(54, 162, 235, 0.85)', 'rgba(255, 206, 86, 0.85)',
    'rgba(75, 192, 192, 0.85)', 'rgba(153, 102, 255, 0.85)', 'rgba(255, 159, 64, 0.85)',
    'rgba(46, 204, 113, 0.85)', 'rgba(231, 76, 60, 0.85)', 'rgba(52, 152, 219, 0.85)',
    'rgba(155, 89, 182, 0.85)', 'rgba(241, 196, 15, 0.85)', 'rgba(26, 188, 156, 0.85)'
];
const CHART_BORDERS = CHART_COLORS.map(c => c.replace('0.85', '1'));

const QUESTION_TYPES_NORMAL = [
    { type: 'highest', template: (metric) => `Tap the category with the HIGHEST ${metric}` },
    { type: 'lowest', template: (metric) => `Tap the category with the LOWEST ${metric}` },
];

const QUESTION_TYPES_HARD = [
    { type: 'closest_average', template: (metric) => `Tap the category closest to the AVERAGE ${metric}` },
    { type: 'second_highest', template: (metric) => `Tap the category with the 2ND HIGHEST ${metric}` },
    { type: 'second_lowest', template: (metric) => `Tap the category with the 2ND LOWEST ${metric}` },
];

function generateData(count, range) {
    const [min, max] = range;
    const spread = max - min;
    const values = [];
    for (let i = 0; i < count; i++) {
        values.push(Math.floor(min + Math.random() * spread * 0.6 + spread * 0.15));
    }
    const highIdx = Math.floor(Math.random() * count);
    let lowIdx;
    do { lowIdx = Math.floor(Math.random() * count); } while (lowIdx === highIdx);
    values[highIdx] = Math.floor(max - Math.random() * spread * 0.1);
    values[lowIdx] = Math.floor(min + Math.random() * spread * 0.1);
    for (let i = 0; i < count; i++) {
        if (i !== highIdx && values[i] >= values[highIdx]) values[i] = values[highIdx] - Math.floor(Math.random() * spread * 0.1) - 5;
        if (i !== lowIdx && values[i] <= values[lowIdx]) values[i] = values[lowIdx] + Math.floor(Math.random() * spread * 0.1) + 5;
    }
    return { values, highIdx, lowIdx };
}

function buildChartOptions(scenario, type) {
    const isHorizontal = type === 'horizontalBar';
    const isPie = type === 'pie' || type === 'polarArea';
    return {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: isPie, position: 'bottom', labels: { color: '#f8fafc', font: { family: "'Outfit', sans-serif", size: 11 }, padding: 12, usePointStyle: true } },
            title: { display: true, text: scenario.title, color: '#FFE600', font: { family: "'Space Grotesk', sans-serif", size: 16, weight: '700' }, padding: { bottom: 16 } },
            tooltip: {
                backgroundColor: 'rgba(26,26,36,0.95)', titleColor: '#FFE600', bodyColor: '#f8fafc', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, cornerRadius: 8,
                callbacks: { label: function(ctx) { const val = typeof ctx.parsed === 'object' ? (isHorizontal ? ctx.parsed.x : ctx.parsed.y) : (ctx.parsed ?? ctx.raw); return ` ${scenario.unit}${val}${scenario.unitSuffix}`; } }
            },
            datalabels: {
                color: '#ffffff',
                font: { family: "'Space Grotesk', sans-serif", size: 11, weight: '700' },
                formatter: function(value) { return `${scenario.unit}${value}${scenario.unitSuffix}`; },
                anchor: 'center',
                align: 'center',
                textStrokeColor: 'rgba(0,0,0,0.8)',
                textStrokeWidth: 2,
                display: function(context) {
                    return context.dataset.data[context.dataIndex] > 0;
                }
            }
        },
        scales: isPie ? (type === 'polarArea' ? { r: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' } } } : {}) : {
            x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
    };
}

export function generateDashboardRound(usedScenarioIndices = [], difficulty = 'normal') {
    const available = SCENARIOS.map((_, i) => i).filter(i => !usedScenarioIndices.includes(i));
    const scenarioIdx = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : Math.floor(Math.random() * SCENARIOS.length);
    const scenario = SCENARIOS[scenarioIdx];
    const chartType = scenario.chartTypes[Math.floor(Math.random() * scenario.chartTypes.length)];
    let labelCount = chartType === 'line' ? Math.min(scenario.labels.length, 6 + Math.floor(Math.random() * 4))
        : chartType === 'pie' || chartType === 'polarArea' || chartType === 'kpi' ? Math.min(scenario.labels.length, 4)
        : Math.min(scenario.labels.length, 4 + Math.floor(Math.random() * 3));
    const shuffledLabels = [...scenario.labels].sort(() => Math.random() - 0.5).slice(0, labelCount);
    const { values, highIdx, lowIdx } = generateData(labelCount, scenario.range);
    
    const qTypes = difficulty === 'hard' ? QUESTION_TYPES_HARD : QUESTION_TYPES_NORMAL;
    const qType = qTypes[Math.floor(Math.random() * qTypes.length)];
    
    let correctIndex = 0;
    if (qType.type === 'highest') correctIndex = highIdx;
    else if (qType.type === 'lowest') correctIndex = lowIdx;
    else if (qType.type === 'second_highest') {
        const sorted = [...values].map((v, i) => ({v, i})).sort((a,b) => b.v - a.v);
        correctIndex = sorted[1].i;
    }
    else if (qType.type === 'second_lowest') {
        const sorted = [...values].map((v, i) => ({v, i})).sort((a,b) => a.v - b.v);
        correctIndex = sorted[1].i;
    }
    else if (qType.type === 'closest_average') {
        const avg = values.reduce((a,b) => a + b, 0) / values.length;
        let minDiff = Infinity;
        for (let i = 0; i < values.length; i++) {
            const diff = Math.abs(values[i] - avg);
            if (diff < minDiff) { minDiff = diff; correctIndex = i; }
        }
    }

    return { 
        scenarioIdx, 
        scenario: { ...scenario, labels: shuffledLabels }, 
        chartType, 
        question: qType.template(scenario.metric), 
        correctIndex, 
        values, 
        labels: shuffledLabels, 
        timeLimit: difficulty === 'hard' ? 45 : 30,
        isDoublePoints: Math.random() < 0.25,
        isPowerDrop: Math.random() < 0.25
    };
}

export function generateDashboardGame(roundCount = 5, difficulty = 'normal') {
    const rounds = [], used = [];
    for (let i = 0; i < roundCount; i++) { const r = generateDashboardRound(used, difficulty); used.push(r.scenarioIdx); rounds.push(r); }
    return rounds;
}

export function getRandomScenarioPreset() {
    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    const count = 4;
    const shuffledLabels = [...scenario.labels].sort(() => Math.random() - 0.5).slice(0, count);
    const { values } = generateData(count, scenario.range);
    return { scenarioTitle: scenario.title, metric: scenario.metric, unit: scenario.unit, unitSuffix: scenario.unitSuffix, labels: shuffledLabels, values: values };
}

export function getTutorialRounds() {
    return [
        {
            text: "Practice: Tap the category with the HIGHEST Score!",
            correctIndex: 1, timeLimit: 20, isPowerDrop: true,
            dashboardData: { scenarioTitle: "Customer Satisfaction Warm-Up", metric: "Score", unit: "", unitSuffix: " pts", chartType: "polarArea", labels: ["Product Quality", "Customer Service", "Delivery Speed", "User Experience"], values: [72, 94, 61, 80], correctIndex: 1, timeLimit: 20 }
        },
        {
            text: "Practice: Tap the KPI with the HIGHEST Revenue!",
            correctIndex: 0, timeLimit: 30,
            dashboardData: { scenarioTitle: "Executive Performance Check", metric: "Revenue", unit: "$", unitSuffix: "K", chartType: "bar", labels: ["Electronics Division", "Apparel Division", "Home Division", "Digital Services"], values: [480, 290, 150, 340], correctIndex: 0, timeLimit: 30 }
        },
        {
            text: "Practice: Tap the category with the LOWEST Budget!",
            correctIndex: 2, timeLimit: 25, isPowerDrop: true,
            dashboardData: { scenarioTitle: "Department Budget Overview", metric: "Budget", unit: "$", unitSuffix: "K", chartType: "pie", labels: ["Marketing", "Engineering", "HR", "Operations"], values: [320, 450, 120, 280], correctIndex: 2, timeLimit: 25 }
        },
        {
            text: "Practice: Tap the month with the HIGHEST Visitors!",
            correctIndex: 3, timeLimit: 25,
            dashboardData: { scenarioTitle: "Website Traffic Trend", metric: "Visitors", unit: "", unitSuffix: "K", chartType: "line", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], values: [85, 110, 95, 210, 140, 160], correctIndex: 3, timeLimit: 25 }
        },
        {
            text: "Practice: Tap the region with the LOWEST Sales!",
            correctIndex: 3, timeLimit: 20,
            dashboardData: { scenarioTitle: "Regional Sales Dashboard", metric: "Sales", unit: "$", unitSuffix: "K", chartType: "bar", labels: ["North America", "Europe", "Asia Pacific", "Latin America"], values: [520, 380, 410, 145], correctIndex: 3, timeLimit: 20 }
        }
    ];
}

export function serializeRound(round) {
    return { scenarioTitle: round.scenario.title, metric: round.scenario.metric, unit: round.scenario.unit, unitSuffix: round.scenario.unitSuffix, chartType: round.chartType, labels: round.labels, values: round.values, question: round.question, correctIndex: round.correctIndex, timeLimit: round.timeLimit, isDoublePoints: round.isDoublePoints || false, isPowerDrop: round.isPowerDrop || false };
}

export function deserializeToChartConfig(data) {
    const scenario = { title: data.scenarioTitle, metric: data.metric, unit: data.unit, unitSuffix: data.unitSuffix };
    const colors = CHART_COLORS.slice(0, data.labels.length);
    const borders = CHART_BORDERS.slice(0, data.labels.length);
    if (data.chartType === 'bar' || data.chartType === 'horizontalBar') {
        const isHorizontal = data.chartType === 'horizontalBar';
        const opts = buildChartOptions(scenario, data.chartType);
        if (isHorizontal) opts.indexAxis = 'y';
        return { type: 'bar', data: { labels: data.labels, datasets: [{ label: data.metric, data: data.values, backgroundColor: colors, borderColor: borders, borderWidth: 2, borderRadius: 6, barPercentage: 0.7 }] }, options: opts };
    } else if (data.chartType === 'pie') {
        return { type: 'doughnut', data: { labels: data.labels, datasets: [{ data: data.values, backgroundColor: colors, borderColor: 'rgba(26,26,36,0.8)', borderWidth: 3, hoverOffset: 15 }] }, options: buildChartOptions(scenario, 'pie') };
    } else if (data.chartType === 'polarArea') {
        return { type: 'polarArea', data: { labels: data.labels, datasets: [{ data: data.values, backgroundColor: colors.map(c => c.replace('0.85', '0.6')), borderColor: 'rgba(26,26,36,0.8)', borderWidth: 2 }] }, options: buildChartOptions(scenario, 'polarArea') };
    } else if (data.chartType === 'line') {
        return { type: 'line', data: { labels: data.labels, datasets: [{ label: data.metric, data: data.values, borderColor: 'rgba(255,230,0,1)', backgroundColor: 'rgba(255,230,0,0.1)', borderWidth: 3, pointBackgroundColor: colors, pointBorderColor: borders, pointBorderWidth: 2, pointRadius: 8, pointHoverRadius: 12, fill: true, tension: 0.3 }] }, options: buildChartOptions(scenario, 'line') };
    }
    return null;
}
