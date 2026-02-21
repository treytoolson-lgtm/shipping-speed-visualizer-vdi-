// Shipping Speed Visualizer — Application Logic
// Separated from index.html to keep files under 600 lines.

let chartInstance = null;
let monthlyChartInstance = null;
let quarterlyChartInstance = null;
let currentView = 'overall';
let globalMonthlyData = {};
let globalQuarterlyData = {};
let globalData = null;        // full API response
let sortModeOn = false;       // sort/nonsort toggle state

const SPEED_LABELS = ['1-day','2-day','3-day','4-day','5-day','6-day','7-day','8-day','9-day','10-day'];

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

    const barOpts = (bg, hover) => ({
        backgroundColor: bg,
        hoverBackgroundColor: hover,
        borderRadius: 4,
        barPercentage: sortModeOn ? 0.5 : 0.6,
        categoryPercentage: 0.8,
    });

    if (!sortModeOn) {
        return [
            { label: 'WFS (Walmart Fulfilled)', data: vals(wfsBk, wfsTotal),
              ...barOpts(COLORS.wfsSortBg, COLORS.wfsSortHover) },
            { label: 'SFF (Seller Fulfilled)',  data: vals(sffBk, sffTotal),
              ...barOpts(COLORS.sffSortBg, COLORS.sffSortHover) },
        ];
    }
    return [
        { label: 'WFS — Sort',     data: vals(wfsSortBk  || {}, wfsSortTotal),
          ...barOpts(COLORS.wfsSortBg,    COLORS.wfsSortHover) },
        { label: 'WFS — Non-Sort', data: vals(wfsNonsortBk || {}, wfsNsTotal),
          ...barOpts(COLORS.wfsNonsortBg, COLORS.wfsNonsortHover) },
        { label: 'SFF — Sort',     data: vals(sffSortBk  || {}, sffSortTotal),
          ...barOpts(COLORS.sffSortBg,    COLORS.sffSortHover) },
        { label: 'SFF — Non-Sort', data: vals(sffNonsortBk || {}, sffNsTotal),
          ...barOpts(COLORS.sffNonsortBg, COLORS.sffNonsortHover) },
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
                    label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`
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
            { color: COLORS.sffSortBg,    label: 'SFF — Sort' },
            { color: COLORS.sffNonsortBg, label: 'SFF — Non-Sort' },
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
    ['overall-view', 'quarterly-view', 'monthly-view'].forEach(id => {
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
}

async function analyzeShippingSpeed() {
    const pid       = document.getElementById('pid').value.trim();
    const daysBack  = parseInt(document.getElementById('time_period').value);
    const errorMsg  = document.getElementById('errorMsg');
    const loading   = document.getElementById('loading');
    const results   = document.getElementById('results');
    const analyzeBtn = document.getElementById('analyzeBtn');

    if (!pid) {
        errorMsg.textContent = 'Please enter a PID';
        errorMsg.classList.remove('hidden');
        return;
    }

    errorMsg.classList.add('hidden');
    results.innerHTML = '';
    loading.classList.remove('hidden');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `Analyze
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
            body: JSON.stringify({ pid, days_back: daysBack }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to fetch data');
        loading.classList.add('hidden');
        displayResults(data);
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

function displayResults(data) {
    globalData = data;
    sortModeOn = false;
    if (data.monthly_data)   globalMonthlyData   = data.monthly_data;
    if (data.quarterly_data) globalQuarterlyData = data.quarterly_data;

    const results      = document.getElementById('results');
    const totalWfs     = data.total_wfs_orders;
    const totalSff     = data.total_sff_orders;
    const hasSort      = !!(data.wfs_sort_data || data.sff_sort_data);
    const hasQuarterly = data.quarterly_data && Object.keys(data.quarterly_data).length > 0;

    results.innerHTML = `
        <div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200 card-hover fade-in">
            <h2 class="text-xl font-bold mb-2 text-wmt-gray-160">Results for PID: <span class="text-wmt-blue">${data.pid}</span></h2>
            <p class="text-wmt-gray-160 text-sm mb-6 font-medium">📅 Date Range: <span class="font-bold">${data.date_range}</span></p>

            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white rounded-lg p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-blue"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">WFS Units</div>
                    <div class="text-2xl font-bold text-wmt-blue">${totalWfs.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-lg p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-spark"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">SFF Units</div>
                    <div class="text-2xl font-bold text-wmt-spark">${totalSff.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-lg p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-wmt-green"></div>
                    <div class="text-wmt-gray-160 text-xs font-bold uppercase tracking-wider mb-1">Total Units</div>
                    <div class="text-2xl font-bold text-wmt-green">${(totalWfs + totalSff).toLocaleString()}</div>
                </div>
            </div>

            <!-- Legend + Sort Toggle -->
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
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
            <div class="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-1">
                <button onclick="switchView('overall')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-wmt-blue border-b-2 border-wmt-blue" data-view="overall">Overall</button>
                ${hasQuarterly ? `<button onclick="switchView('quarterly')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-gray-500 hover:text-wmt-blue border-b-2 border-transparent" data-view="quarterly">Quarterly</button>` : ''}
                ${data.monthly_data ? `<button onclick="switchView('monthly')" class="view-tab px-6 py-2 rounded-t-lg font-bold text-sm transition-all text-gray-500 hover:text-wmt-blue border-b-2 border-transparent" data-view="monthly">Monthly</button>` : ''}
            </div>

            <!-- Overall -->
            <div id="overall-view" class="bg-white rounded-lg border border-gray-200 chart-container mb-8 shadow-sm">
                <canvas id="shippingChart"></canvas>
            </div>

            ${hasQuarterly ? `
            <div id="quarterly-view" class="hidden">
                <div class="flex flex-wrap gap-2 mb-6">
                    ${sortQuarters(Object.keys(data.quarterly_data)).map((q, i) =>
                        `<button onclick="showQuarterlyChart('${q}')" data-quarter="${q}"
                            class="quarterly-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all ${i === 0 ? 'bg-wmt-blue text-white' : 'bg-gray-100 text-wmt-gray-160 hover:bg-gray-200'}">${q}</button>`
                    ).join('')}
                </div>
                <div class="bg-white rounded-lg border border-gray-200 chart-container mb-6 shadow-sm">
                    <canvas id="quarterlyChartMain"></canvas>
                </div>
            </div>` : ''}

            ${data.monthly_data ? `
            <div id="monthly-view" class="hidden">
                <div class="flex flex-wrap gap-2 mb-6">
                    ${sortMonths(Object.keys(data.monthly_data)).map((m, i) =>
                        `<button onclick="showMonthlyChart('${m}')" data-month="${m}"
                            class="monthly-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all ${i === 0 ? 'bg-wmt-blue text-white' : 'bg-gray-100 text-wmt-gray-160 hover:bg-gray-200'}">${m}</button>`
                    ).join('')}
                </div>
                <div class="bg-white rounded-lg border border-gray-200 chart-container mb-6 shadow-sm">
                    <canvas id="monthlyChart"></canvas>
                </div>
            </div>` : ''}
        </div>
    `;

    Chart.register(ChartDataLabels);
    setTimeout(() => {
        displayOverallChart(data);
        if (data.monthly_data && Object.keys(data.monthly_data).length > 0)
            setTimeout(() => showMonthlyChart(sortMonths(Object.keys(data.monthly_data))[0]), 100);
        if (data.quarterly_data && Object.keys(data.quarterly_data).length > 0)
            setTimeout(() => showQuarterlyChart(sortQuarters(Object.keys(data.quarterly_data))[0]), 200);
    }, 0);
}

function displayOverallChart(data) {
    const ctx = document.getElementById('shippingChart');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();
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
        options: buildChartOptions('Overall Shipping Speed Distribution'),
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
        options: buildChartOptions(`${quarterName} — Shipping Speed Distribution`),
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
        options: buildChartOptions(`${monthName} — Shipping Speed Distribution`),
    });
}

// Enter key shortcut
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pid').addEventListener('keypress', e => {
        if (e.key === 'Enter') analyzeShippingSpeed();
    });
});
