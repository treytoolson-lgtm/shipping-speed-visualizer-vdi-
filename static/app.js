// Shipping Speed Visualizer — Application Logic
// Separated from index.html to keep files under 600 lines.

let chartInstance = null;
let monthlyChartInstance = null;
let quarterlyChartInstance = null;
let yearlyChartInstance = null;
let currentView = 'overall';
let globalMonthlyData = {};
let globalQuarterlyData = {};
let globalYearlyData = {};
let globalData     = null;  // current view (may be filtered)
let _baseGlobalData = null; // original full fetch — never overwritten by filters
let sortModeOn = false;

// Mode + L0 filter state
let currentMode = 'pid';          // 'pid' | 'category'
let currentL0Filter = '';         // '' = Total Book, 'HOME' = filtered
let lastPid = '';
let lastPeriod = 'fytd';
let lastMetric = 'promise';

/** Toggle between PID and Category modes. */
function setMode(mode) {
    currentMode = mode;
    const pidInputs = document.getElementById('pidInputs');
    const catInputs = document.getElementById('categoryInputs');
    const pidBtn    = document.getElementById('modePidBtn');
    const catBtn    = document.getElementById('modeCatBtn');
    const l0Bar     = document.getElementById('l0FilterBar');
    const results   = document.getElementById('results');

    if (mode === 'pid') {
        pidInputs.classList.remove('hidden'); pidInputs.classList.add('flex');
        catInputs.classList.add('hidden');    catInputs.classList.remove('flex');
        pidBtn.classList.add('bg-wmt-blue', 'text-white');
        pidBtn.classList.remove('bg-white', 'text-gray-500');
        catBtn.classList.remove('bg-wmt-blue', 'text-white');
        catBtn.classList.add('bg-white', 'text-gray-500');
    } else {
        catInputs.classList.remove('hidden'); catInputs.classList.add('flex');
        pidInputs.classList.add('hidden');    pidInputs.classList.remove('flex');
        catBtn.classList.add('bg-wmt-blue', 'text-white');
        catBtn.classList.remove('bg-white', 'text-gray-500');
        pidBtn.classList.remove('bg-wmt-blue', 'text-white');
        pidBtn.classList.add('bg-white', 'text-gray-500');
    }
    l0Bar.classList.add('hidden');
    results.innerHTML = '';
    currentL0Filter = '';
}

/** Render L0 filter buttons below PID results. */
function renderL0FilterBar(divisions, activeFilter) {
    const bar  = document.getElementById('l0FilterBar');
    const btns = document.getElementById('l0FilterButtons');
    if (!divisions || divisions.length <= 1) { bar.classList.add('hidden'); return; }

    const all = ['Total Book', ...divisions];
    btns.innerHTML = all.map(div => {
        const isActive = (div === 'Total Book' && !activeFilter) || div === activeFilter;
        return `<button
            onclick="applyL0Filter('${div === 'Total Book' ? '' : div}')"
            class="px-4 py-1.5 rounded-full text-sm font-bold transition-all border
                   ${isActive ? 'bg-wmt-blue text-white border-wmt-blue' : 'bg-white text-wmt-gray-160 border-gray-300 hover:border-wmt-blue hover:text-wmt-blue'}">
            ${div}
        </button>`;
    }).join('');
    bar.classList.remove('hidden');
}

/** Filter already-loaded PID data by L0 division — no BQ re-fetch. */
function applyL0Filter(division) {
    currentL0Filter = division;

    // Always derive view from the pristine base fetch, never from the
    // already-filtered globalData (which has monthly/quarterly nulled out).
    const base = _baseGlobalData || globalData;
    let viewData = base;

    if (division && base.division_data && base.division_data[division]) {
        const dd = base.division_data[division];
        // Build a slimmed-down view from cached division data (no monthly/quarterly)
        viewData = {
            ...base,
            wfs_data:         dd.wfs_data,
            sff_data:         dd.sff_data,
            wfs_sort_data:    dd.wfs_sort_data,
            wfs_nonsort_data: dd.wfs_nonsort_data,
            sff_sort_data:    null,
            sff_nonsort_data: null,
            total_wfs_orders: dd.total_wfs,
            total_sff_orders: dd.total_sff,
            // Hide time-series tabs when filtered — division data is aggregate only
            monthly_data:   null,
            quarterly_data: null,
            yearly_data:    null,
        };
    }

    displayResults(viewData);
    // Re-render filter bar so active state updates
    renderL0FilterBar(base.seller_divisions || [], division);
}

const SPEED_LABELS = ['1-day', '2-day', '3-day', '4-7 Day', '7+ Day'];

// Walmart palette constants
const COLORS = {
    wfsSortBg:     '#0053e2', wfsSortHover:     '#003da8',
    wfsNonsortBg:  '#6fa8f8', wfsNonsortHover:  '#4d8de0',
    sffSortBg:     '#ffc220', sffSortHover:     '#e5ad1d',
    sffNonsortBg:  '#ffd966', sffNonsortHover:  '#e0c040',
};

/**
 * Build Chart.js datasets based on sort mode and the provided bucket data.
 * Percentages are calculated relative to each channel/sort-type total.
 */
function buildDatasets(wfsBk, sffBk, wfsSortBk, wfsNonsortBk, sffSortBk, sffNonsortBk) {
    const wfsTotal     = Object.values(wfsBk).reduce((a, v) => a + v, 0);
    const sffTotal     = Object.values(sffBk).reduce((a, v) => a + v, 0);
    const wfsSortTotal = Object.values(wfsSortBk  || {}).reduce((a, v) => a + v, 0);
    const wfsNsTotal   = Object.values(wfsNonsortBk || {}).reduce((a, v) => a + v, 0);
    const sffSortTotal = Object.values(sffSortBk  || {}).reduce((a, v) => a + v, 0);
    const sffNsTotal   = Object.values(sffNonsortBk || {}).reduce((a, v) => a + v, 0);

    const pct  = (val, total) => total > 0 ? (val / total) * 100 : 0;
    const vals = (bk, total)  => SPEED_LABELS.map(l => pct(bk[l] || 0, total));
    const counts = (bk)       => SPEED_LABELS.map(l => bk[l] || 0);

    const barOpts = (bg, hover) => ({
        backgroundColor: bg,
        hoverBackgroundColor: hover,
        borderRadius: 4,
        barPercentage: sortModeOn ? 0.5 : 0.6,
        categoryPercentage: 0.8,
    });

    if (!sortModeOn) {
        return [
            { label: 'WFS (Walmart Fulfilled)', data: vals(wfsBk, wfsTotal), rawCounts: counts(wfsBk),
              ...barOpts(COLORS.wfsSortBg, COLORS.wfsSortHover) },
            { label: 'SFF (Seller Fulfilled)',  data: vals(sffBk, sffTotal), rawCounts: counts(sffBk),
              ...barOpts(COLORS.sffSortBg, COLORS.sffSortHover) },
        ];
    }
    // Sort Mode: Show ONLY WFS breakdown (since SFF sort data is unavailable)
    return [
        { label: 'WFS — Sort',     data: vals(wfsSortBk  || {}, wfsSortTotal), rawCounts: counts(wfsSortBk || {}),
          ...barOpts(COLORS.wfsSortBg,    COLORS.wfsSortHover) },
        { label: 'WFS — Non-Sort', data: vals(wfsNonsortBk || {}, wfsNsTotal), rawCounts: counts(wfsNonsortBk || {}),
          ...barOpts(COLORS.wfsNonsortBg, COLORS.wfsNonsortHover) },
    ];
}

/** Shared Chart.js options factory — title injected per chart. */
function buildChartOptions(titleText) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            datalabels: {
                display: ctx => ctx.dataset.data[ctx.dataIndex] >= 1,
                align: 'end', anchor: 'end',
                color: '#2e2f32',
                font: { family: 'Bogle', weight: 'bold', size: 10 },
                formatter: v => Math.round(v) + '%',
            },
            title: {
                display: true, text: titleText,
                font: { size: 16, weight: 'bold', family: 'Bogle' },
                padding: 20, color: '#2e2f32',
            },
            tooltip: {
                backgroundColor: 'rgba(46,47,50,0.9)',
                titleFont: { family: 'Bogle', size: 13 },
                bodyFont:  { family: 'Bogle', size: 12 },
                padding: 12, cornerRadius: 4,
                callbacks: {
                    label: ctx => {
                        const raw = ctx.dataset.rawCounts ? ctx.dataset.rawCounts[ctx.dataIndex] : 0;
                        return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}% (${Number(raw).toLocaleString()} units)`;
                    }
                },
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: '% of Channel Volume',
                         font: { weight: 'bold', family: 'Bogle' }, color: '#959595' },
                grid:  { color: '#f2f2f2' },
                ticks: { color: '#6f7174', font: { family: 'Bogle' },
                         callback: v => v.toFixed(0) + '%' },
                border: { display: false },
            },
            x: {
                title: { display: true, text: 'Shipping Speed',
                         font: { weight: 'bold', family: 'Bogle' }, color: '#959595' },
                grid:   { display: false },
                ticks:  { color: '#2e2f32', font: { family: 'Bogle', weight: 'bold' } },
                border: { display: false },
            },
        },
    };
}

/** Toggle sort/nonsort mode and re-render the current active chart. */
function toggleSortMode() {
    sortModeOn = !sortModeOn;
    const btn = document.getElementById('sortToggleBtn');
    if (sortModeOn) {
        btn.classList.replace('bg-gray-100', 'bg-wmt-blue');
        btn.classList.replace('text-wmt-gray-160', 'text-white');
        btn.textContent = 'Sort / Non-Sort: ON';
    } else {
        btn.classList.replace('bg-wmt-blue', 'bg-gray-100');
        btn.classList.replace('text-white', 'text-wmt-gray-160');
        btn.textContent = 'Sort / Non-Sort: OFF';
    }
    refreshLegend();
    if (currentView === 'overall' && globalData) displayOverallChart(globalData);
    if (currentView === 'yearly') {
        const activeY = document.querySelector('.yearly-btn.bg-wmt-blue');
        if (activeY) showYearlyChart(activeY.dataset.fy);
    }
    if (currentView === 'quarterly') {
        const activeQ = document.querySelector('.quarterly-btn.bg-wmt-blue');
        if (activeQ) showQuarterlyChart(activeQ.dataset.quarter);
    }
    if (currentView === 'monthly') {
        const activeM = document.querySelector('.monthly-btn.bg-wmt-blue');
        if (activeM) showMonthlyChart(activeM.dataset.month);
    }
}

/** Rebuild the legend to reflect the current sort mode. */
function refreshLegend() {
    const legend = document.getElementById('chartLegend');
    if (!legend) return;
    const items = sortModeOn
        ? [
            { color: COLORS.wfsSortBg,    label: 'WFS — Sort' },
            { color: COLORS.wfsNonsortBg, label: 'WFS — Non-Sort' },
          ]
        : [
            { color: COLORS.wfsSortBg, label: 'WFS (Walmart Fulfilled)' },
            { color: COLORS.sffSortBg, label: 'SFF (Seller Fulfilled)'  },
          ];
    legend.innerHTML = items.map(i =>
        `<div class="flex items-center gap-2">
           <div class="w-3 h-3 rounded-full" style="background:${i.color}"></div>
           <span class="text-wmt-gray-160 text-sm font-medium">${i.label}</span>
         </div>`
    ).join('');
}

function sortMonths(months) {
    return months.sort((a, b) => new Date(b) - new Date(a));
}

function sortQuarters(quarters) {
    return quarters.sort((a, b) => {
        const [qA, fyA] = a.split(' ');
        const [qB, fyB] = b.split(' ');
        const yA = parseInt(fyA.substring(2)), yB = parseInt(fyB.substring(2));
        const nA = parseInt(qA.substring(1)), nB = parseInt(qB.substring(1));
        return yA !== yB ? yB - yA : nB - nA;
    });
}

function switchView(viewName) {
    ['overall-view', 'yearly-view', 'quarterly-view', 'monthly-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.remove('text-wmt-blue', 'border-b-2', 'border-b-wmt-blue');
        tab.classList.add('text-gray-500', 'border-b-transparent');
    });
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) targetView.classList.remove('hidden');
    const activeTab = document.querySelector(`[data-view="${viewName}"]`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-500', 'border-b-transparent');
        activeTab.classList.add('text-wmt-blue', 'border-b-2', 'border-b-wmt-blue');
    }
    currentView = viewName;

    // FORCE REFRESH: Ensure the newly visible chart matches the current sortModeOn state
    if (viewName === 'overall' && globalData) {
        displayOverallChart(globalData);
    } else if (viewName === 'yearly') {
        const activeY = document.querySelector('.yearly-btn.bg-wmt-blue');
        if (activeY) showYearlyChart(activeY.dataset.fy);
    } else if (viewName === 'quarterly') {
        const activeQ = document.querySelector('.quarterly-btn.bg-wmt-blue');
        if (activeQ) showQuarterlyChart(activeQ.dataset.quarter);
    } else if (viewName === 'monthly') {
        const activeM = document.querySelector('.monthly-btn.bg-wmt-blue');
        if (activeM) showMonthlyChart(activeM.dataset.month);
    }
}

async function analyzeShippingSpeed() {
    const pid        = document.getElementById('pid').value.trim();
    const periodType = document.getElementById('time_period').value;
    const metricType = 'promise'; // hardcoded — no UI dropdown
    const errorMsg   = document.getElementById('errorMsg');
    const loading    = document.getElementById('loading');
    const results    = document.getElementById('results');
    const analyzeBtn = document.getElementById('analyzeBtn');

    if (!pid) {
        errorMsg.textContent = 'Please enter a PID';
        errorMsg.classList.remove('hidden');
        return;
    }

    // Save state for L0 filter re-fetches
    lastPid    = pid;
    lastPeriod = periodType;
    lastMetric = metricType;
    currentL0Filter = '';

    errorMsg.classList.add('hidden');
    results.innerHTML = '';
    document.getElementById('l0FilterBar').classList.add('hidden');
    loading.classList.remove('hidden');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `Analyzing
        <svg class="animate-spin-spark h-5 w-5 text-wmt-spark" viewBox="0 0 24 24" fill="currentColor">
            <g>
                <rect x="11" y="1" width="2" height="8" rx="1"/>
                <rect x="11" y="1" width="2" height="8" rx="1" transform="rotate(60 12 12)"/>
                <rect x="11" y="1" width="2" height="8" rx="1" transform="rotate(120 12 12)"/>
                <rect x="11" y="1" width="2" height="8" rx="1" transform="rotate(180 12 12)"/>
                <rect x="11" y="1" width="2" height="8" rx="1" transform="rotate(240 12 12)"/>
                <rect x="11" y="1" width="2" height="8" rx="1" transform="rotate(300 12 12)"/>
            </g>
        </svg>`;

    try {
        const response = await fetch('/api/shipping-speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid, period_type: periodType, metric_type: metricType, division_filter: '' }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to fetch data');
        loading.classList.add('hidden');
        // Store the pristine full response so category filters can always restore it
        _baseGlobalData = data;
        displayResults(data);
        // Show L0 filter bar if seller spans multiple divisions
        renderL0FilterBar(data.seller_divisions || [], '');
    } catch (error) {
        loading.classList.add('hidden');
        errorMsg.textContent = `Error: ${error.message}`;
        errorMsg.classList.remove('hidden');
        console.error('Error:', error);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = 'Analyze';
    }
}

function groupKeysByFY(keys, type) {
    const sortedKeys = type === 'quarter' ? sortQuarters(keys) : sortMonths(keys);
    const groups = {};
    
    sortedKeys.forEach(key => {
        let fy;
        if (type === 'quarter') {
            // "Q1 FY2026" -> "FY2026"
            fy = key.split(' ')[1];
        } else {
            // "Feb 2025" -> FY logic (Feb starts new FY)
            const [mStr, yStr] = key.split(' ');
            const y = parseInt(yStr);
            const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mStr) + 1;
            // Feb (2) starts next FY in Walmart calendar
            fy = `FY${m >= 2 ? y + 1 : y}`;
        }
        if (!groups[fy]) groups[fy] = [];
        groups[fy].push(key);
    });
    
    // Sort FYs descending (FY2026, FY2025...)
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function displayResults(data) {
    globalData = data;
    sortModeOn = false;
    if (data.monthly_data)   globalMonthlyData   = data.monthly_data;
    if (data.quarterly_data) globalQuarterlyData = data.quarterly_data;
    if (data.yearly_data)    globalYearlyData    = data.yearly_data;

    const results      = document.getElementById('results');
    const totalWfs     = data.total_wfs_orders;
    const totalSff     = data.total_sff_orders;
    const hasSort      = !!(data.wfs_sort_data || data.sff_sort_data);
    const hasQuarterly = data.quarterly_data && Object.keys(data.quarterly_data).length > 0;
    const hasYearly    = data.yearly_data && Object.keys(data.yearly_data).length > 0;
    
    // Pre-sort for finding active button
    const sortedQ = hasQuarterly ? sortQuarters(Object.keys(data.quarterly_data)) : [];
    const sortedM = data.monthly_data ? sortMonths(Object.keys(data.monthly_data)) : [];
    const sortedY = hasYearly ? Object.keys(data.yearly_data).sort().reverse() : [];

    // Program Badges
    const programBadges = (data.programs || []).map(p => 
        `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2 border border-purple-200">
            ${p}
        </span>`
    ).join('');

    results.innerHTML = `
        <div class="bg-white rounded-lg shadow-sm p-4 border border-gray-200 card-hover fade-in h-full flex flex-col">
            <div class="flex flex-wrap items-center gap-2 mb-2">
                <h2 class="text-xl font-bold text-wmt-gray-160">Results for: <span class="text-wmt-blue">${data.seller_name}</span> <span class="text-gray-400 text-sm font-normal">(PID: ${data.pid})</span></h2>
                ${programBadges}
                ${data.division_filter ? `<span class="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold bg-wmt-blue/10 text-wmt-blue border border-wmt-blue/20">🏷️ ${data.division_filter}</span>` : ''}
            </div>
            <p class="text-wmt-gray-160 text-sm mb-6 font-medium">Date Range: <span class="font-bold">${data.date_range}</span> <span class="text-gray-400 text-xs">(${data.analysis_period} • <span class="text-wmt-blue font-bold">${data.metric_label || 'Actual Speed'}</span>)</span></p>

            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-blue"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">WFS Units</div>
                    <div class="text-xl font-bold text-wmt-blue">${totalWfs.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-spark"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">SFF Units</div>
                    <div class="text-xl font-bold text-wmt-spark">${totalSff.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-lg p-3 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-green"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">Total Units</div>
                    <div class="text-xl font-bold text-wmt-green">${(totalWfs + totalSff).toLocaleString()}</div>
                </div>
            </div>

            <!-- Legend + Sort Toggle -->
            <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div id="chartLegend" class="flex gap-6 flex-wrap">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background:#0053e2"></div>
                        <span class="text-wmt-gray-160 text-sm font-medium">WFS (Walmart Fulfilled)</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background:#ffc220"></div>
                        <span class="text-wmt-gray-160 text-sm font-medium">SFF (Seller Fulfilled)</span>
                    </div>
                </div>
                ${hasSort ? `<button id="sortToggleBtn" onclick="toggleSortMode()"
                    class="px-4 py-2 rounded-full text-sm font-bold transition-all bg-gray-100 text-wmt-gray-160 hover:bg-gray-200 border border-gray-300">
                    Sort / Non-Sort: OFF
                </button>` : ''}
            </div>

            <!-- View Tabs -->
            <div class="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-1">
                <button onclick="switchView('overall')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-wmt-blue border-b-2 border-wmt-blue" data-view="overall">Overall</button>
                ${hasYearly ? `<button onclick="switchView('yearly')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-gray-500 hover:text-wmt-blue border-b-2 border-transparent" data-view="yearly">Yearly</button>` : ''}
                ${hasQuarterly ? `<button onclick="switchView('quarterly')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-gray-500 hover:text-wmt-blue border-b-2 border-transparent" data-view="quarterly">Quarterly</button>` : ''}
                ${data.monthly_data ? `<button onclick="switchView('monthly')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-gray-500 hover:text-wmt-blue border-b-2 border-transparent" data-view="monthly">Monthly</button>` : ''}
            </div>

            <!-- Overall -->
            <div id="overall-view" class="bg-white rounded-lg border border-gray-200 chart-container mb-0 shadow-sm flex-grow">
                <canvas id="shippingChart"></canvas>
            </div>

            ${hasYearly ? `
            <div id="yearly-view" class="hidden">
                <div class="mb-3 flex flex-wrap gap-2">
                    ${sortedY.map(fy => 
                        `<button onclick="showYearlyChart('${fy}')" data-fy="${fy}"
                            class="yearly-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all ${fy === sortedY[0] ? 'bg-wmt-blue text-white' : 'bg-gray-100 text-wmt-gray-160 hover:bg-gray-200'}">${fy}</button>`
                    ).join('')}
                </div>
                <div class="bg-white rounded-lg border border-gray-200 chart-container mb-0 shadow-sm flex-grow">
                    <canvas id="yearlyChartMain"></canvas>
                </div>
            </div>` : ''}

            ${hasQuarterly ? `
            <div id="quarterly-view" class="hidden">
                <div class="space-y-3 mb-3">
                    ${groupKeysByFY(Object.keys(data.quarterly_data), 'quarter').map(([fy, keys]) => `
                        <div>
                            <h3 class="text-xs font-bold text-wmt-gray-160 uppercase tracking-wider mb-3 border-l-4 border-wmt-blue pl-2">${fy}</h3>
                            <div class="flex flex-wrap gap-2">
                                ${keys.map(q => 
                                    `<button onclick="showQuarterlyChart('${q}')" data-quarter="${q}"
                                        class="quarterly-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all ${q === sortedQ[0] ? 'bg-wmt-blue text-white' : 'bg-gray-100 text-wmt-gray-160 hover:bg-gray-200'}">${q}</button>`
                                ).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="bg-white rounded-lg border border-gray-200 chart-container mb-0 shadow-sm flex-grow">
                    <canvas id="quarterlyChartMain"></canvas>
                </div>
            </div>` : ''}

            ${data.monthly_data ? `
            <div id="monthly-view" class="hidden">
                 <div class="space-y-3 mb-3">
                    ${groupKeysByFY(Object.keys(data.monthly_data), 'month').map(([fy, keys]) => `
                        <div>
                            <h3 class="text-xs font-bold text-wmt-gray-160 uppercase tracking-wider mb-3 border-l-4 border-wmt-blue pl-2">${fy}</h3>
                            <div class="flex flex-wrap gap-2">
                                ${keys.map(m => 
                                    `<button onclick="showMonthlyChart('${m}')" data-month="${m}"
                                        class="monthly-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all ${m === sortedM[0] ? 'bg-wmt-blue text-white' : 'bg-gray-100 text-wmt-gray-160 hover:bg-gray-200'}">${m}</button>`
                                ).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="bg-white rounded-lg border border-gray-200 chart-container mb-0 shadow-sm flex-grow">
                    <canvas id="monthlyChart"></canvas>
                </div>
            </div>` : ''}
        </div>
    `;

    Chart.register(ChartDataLabels);
    setTimeout(() => {
        displayOverallChart(data);
        if (hasYearly)
            setTimeout(() => showYearlyChart(sortedY[0]), 50);
        if (hasQuarterly)
            setTimeout(() => showQuarterlyChart(sortedQ[0]), 200);
        if (data.monthly_data && Object.keys(data.monthly_data).length > 0)
            setTimeout(() => showMonthlyChart(sortedM[0]), 300);
    }, 0);
}

function displayOverallChart(data) {
    const ctx = document.getElementById('shippingChart');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();
    
    const totalOrders = (data.total_wfs_orders || 0) + (data.total_sff_orders || 0);
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SPEED_LABELS,
            datasets: buildDatasets(
                data.wfs_data, data.sff_data,
                data.wfs_sort_data, data.wfs_nonsort_data,
                data.sff_sort_data, data.sff_nonsort_data
            ),
        },
        options: buildChartOptions(`Overall Shipping Speed Distribution (Total Units: ${totalOrders.toLocaleString()})`),  
    });
}

function showQuarterlyChart(quarterName) {
    const qd = globalQuarterlyData[quarterName];
    if (!qd) return;
    document.querySelectorAll('.quarterly-btn').forEach(b => {
        b.classList.remove('bg-wmt-blue', 'text-white');
        b.classList.add('bg-gray-100', 'text-wmt-gray-160');
    });
    const btn = document.querySelector(`[data-quarter="${quarterName}"]`);
    if (btn) { btn.classList.remove('bg-gray-100','text-wmt-gray-160'); btn.classList.add('bg-wmt-blue','text-white'); }

    const ctx = document.getElementById('quarterlyChartMain');
    if (!ctx) return;
    if (quarterlyChartInstance) quarterlyChartInstance.destroy();

    const totalOrders = (qd.wfs || 0) + (qd.sff || 0);

    quarterlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SPEED_LABELS,
            datasets: buildDatasets(
                qd.wfs_breakdown || {}, qd.sff_breakdown || {},
                qd.wfs_sort_breakdown || {}, qd.wfs_nonsort_breakdown || {},
                qd.sff_sort_breakdown || {}, qd.sff_nonsort_breakdown || {}
            ),
        },
        options: buildChartOptions(`${quarterName} — Shipping Speed Distribution (Total Units: ${totalOrders.toLocaleString()})`), 
    });
}

function showMonthlyChart(monthName) {
    const md = globalMonthlyData[monthName];
    if (!md) return;
    document.querySelectorAll('.monthly-btn').forEach(b => {
        b.classList.remove('bg-wmt-blue', 'text-white');
        b.classList.add('bg-gray-100', 'text-wmt-gray-160');
    });
    const btn = document.querySelector(`[data-month="${monthName}"]`);
    if (btn) { btn.classList.remove('bg-gray-100','text-wmt-gray-160'); btn.classList.add('bg-wmt-blue','text-white'); }

    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    const totalOrders = (md.wfs || 0) + (md.sff || 0);

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SPEED_LABELS,
            datasets: buildDatasets(
                md.wfs_breakdown || {}, md.sff_breakdown || {},
                md.wfs_sort_breakdown || {}, md.wfs_nonsort_breakdown || {},
                md.sff_sort_breakdown || {}, md.sff_nonsort_breakdown || {}
            ),
        },
        options: buildChartOptions(`${monthName} — Shipping Speed Distribution (Total Units: ${totalOrders.toLocaleString()})`), 
    });
}

function showYearlyChart(fyName) {
    const yd = globalYearlyData[fyName];
    if (!yd) return;
    document.querySelectorAll('.yearly-btn').forEach(b => {
        b.classList.remove('bg-wmt-blue', 'text-white');
        b.classList.add('bg-gray-100', 'text-wmt-gray-160');
    });
    const btn = document.querySelector(`[data-fy="${fyName}"]`);
    if (btn) { btn.classList.remove('bg-gray-100','text-wmt-gray-160'); btn.classList.add('bg-wmt-blue','text-white'); }

    const ctx = document.getElementById('yearlyChartMain');
    if (!ctx) return;
    if (yearlyChartInstance) yearlyChartInstance.destroy();

    const totalOrders = (yd.wfs || 0) + (yd.sff || 0);

    yearlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SPEED_LABELS,
            datasets: buildDatasets(
                yd.wfs_breakdown || {}, yd.sff_breakdown || {},
                yd.wfs_sort_breakdown || {}, yd.wfs_nonsort_breakdown || {},
                yd.sff_sort_breakdown || {}, yd.sff_nonsort_breakdown || {}
            ),
        },
        options: buildChartOptions(`${fyName} — Shipping Speed Distribution (Total Units: ${totalOrders.toLocaleString()})`),  
    });
}

// Enter key shortcuts + load L0 divisions on startup
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pid').addEventListener('keypress', e => {
        if (e.key === 'Enter') analyzeShippingSpeed();
    });
});
