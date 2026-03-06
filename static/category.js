// category.js — Category Analysis Mode
// All rendering logic for category mode kept separate (DRY + SRP).

let catChartInstances = {};   // keyed by canvas id
const SPEED_KEYS  = ['1-day', '2-day', '3-day', '4-7 Day', '7+ Day'];
const SPEED_COLORS = {
    '1-day':   '#2a8703', // green
    '2-day':   '#76c043', // light green
    '3-day':   '#ffc220', // yellow
    '4-7 Day': '#f47321', // orange
    '7+ Day':  '#ea1100', // red
};

// ─── Load L0 Divisions into category dropdown ───────────────────────────
async function loadL0Divisions() {
    try {
        const resp = await fetch('/api/l0-divisions');
        const data = await resp.json();
        const sel  = document.getElementById('cat_division');
        sel.innerHTML = '<option value="">-- Select a Division --</option>' +
            (data.divisions || []).map(d =>
                `<option value="${d}">${d}</option>`
            ).join('');
    } catch (e) {
        console.warn('Could not load L0 divisions:', e);
    }
}

// Load divisions as soon as the page is ready
document.addEventListener('DOMContentLoaded', loadL0Divisions);

// ─── Main entry point ─────────────────────────────────────────────────
async function analyzeCategoryMode() {
    const division = document.getElementById('cat_division').value;
    const period   = document.getElementById('cat_period').value;
    const errorMsg = document.getElementById('errorMsg');
    const loading  = document.getElementById('loading');
    const results  = document.getElementById('results');
    const btn      = document.getElementById('catAnalyzeBtn');

    if (!division) {
        errorMsg.textContent = 'Please select a Division.';
        errorMsg.classList.remove('hidden');
        return;
    }
    errorMsg.classList.add('hidden');
    results.innerHTML = '';
    loading.classList.remove('hidden');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
        const resp = await fetch('/api/category-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ division, period_type: period }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || 'Failed to fetch category data');
        loading.classList.add('hidden');
        displayCategoryResults(data);
    } catch (err) {
        loading.classList.add('hidden');
        errorMsg.textContent = `Error: ${err.message}`;
        errorMsg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze Category';
    }
}

// ─── Results shell with 5 tabs ──────────────────────────────────────────────
function displayCategoryResults(data) {
    Object.values(catChartInstances).forEach(c => c && c.destroy());
    catChartInstances = {};

    const deptCount = Object.keys(data.heatmap || {}).length;
    const deptLabel = `${deptCount} Dept${deptCount !== 1 ? 's' : ''}`;

    document.getElementById('results').innerHTML = `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 fade-in">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 class="text-xl font-bold text-wmt-gray-160">
                        Category Analysis: <span class="text-wmt-blue">${data.division}</span>
                    </h2>
                    <p class="text-sm text-gray-500 mt-0.5">
                        📅 ${data.analysis_period} • ${data.date_range} • ${deptLabel}
                    </p>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-gray-200 px-6 overflow-x-auto">
            ${['heatmap','mix','wow','offenders','benchmark'].map((t, i) => {
                const labels = ['\uD83C\uDF21\uFE0F Heatmap','\u26A4 WFS vs SFF','\uD83D\uDCC5 Week over Week',
                                '\uD83D\uDEA8 Top Offenders','\uD83C\uDFC1 Benchmark'];
                return `<button onclick="catSwitchTab('${t}')" data-cattab="${t}"
                    class="cat-tab whitespace-nowrap px-5 py-3 text-sm font-bold transition-all
                    ${i === 0 ? 'text-wmt-blue border-b-2 border-wmt-blue' : 'text-gray-500 border-b-2 border-transparent hover:text-wmt-blue'}">
                    ${labels[i]}
                </button>`;
            }).join('')}
        </div>

        <!-- Tab panes -->
        <div class="p-6">
            <div id="cat-heatmap">${buildHeatmapHTML(data.heatmap)}</div>
            <div id="cat-mix"     class="hidden"><div class="chart-container" style="height:420px"><canvas id="catMixChart"></canvas></div></div>
            <div id="cat-wow"     class="hidden"><div class="chart-container" style="height:420px"><canvas id="catWowChart"></canvas></div></div>
            <div id="cat-offenders" class="hidden">${buildOffendersHTML(data.top_offenders)}</div>
            <div id="cat-benchmark" class="hidden"><div class="chart-container" style="height:420px"><canvas id="catBenchChart"></canvas></div></div>
        </div>
    </div>`;

    // Mount charts after DOM is ready
    setTimeout(() => {
        mountMixChart(data.channel_mix);
        mountWowChart(data.wow);
        mountBenchChart(data.benchmark);
    }, 0);
}

/** Switch visible category tab. */
function catSwitchTab(tab) {
    ['heatmap','mix','wow','offenders','benchmark'].forEach(t => {
        const pane = document.getElementById(`cat-${t}`);
        if (pane) pane.classList.toggle('hidden', t !== tab);
    });
    document.querySelectorAll('.cat-tab').forEach(btn => {
        const active = btn.dataset.cattab === tab;
        btn.classList.toggle('text-wmt-blue', active);
        btn.classList.toggle('border-wmt-blue', active);
        btn.classList.toggle('text-gray-500', !active);
        btn.classList.toggle('border-transparent', !active);
    });
}

// ─── Tab 1: Heatmap ──────────────────────────────────────────────────────
function heatColor(pct) {
    // 0% = green, 100% = red (for 7+ day: higher % = worse)
    if (pct <= 5)  return 'bg-green-100 text-green-800';
    if (pct <= 15) return 'bg-yellow-100 text-yellow-800';
    if (pct <= 30) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
}

function fastColor(pct) {
    if (pct >= 60) return 'bg-green-100 text-green-800';
    if (pct >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-orange-100 text-orange-800';
}

function buildHeatmapHTML(heatmap) {
    if (!heatmap || !Object.keys(heatmap).length)
        return '<p class="text-gray-400 text-sm">No heatmap data available.</p>';

    const depts = Object.entries(heatmap).sort((a, b) =>
        (b[1]['1-day'] + b[1]['2-day']) - (a[1]['1-day'] + a[1]['2-day'])
    );

    const header = `<thead><tr class="bg-gray-50">
        <th class="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Department</th>
        ${SPEED_KEYS.map(k => `<th class="text-center px-3 py-3 text-xs font-bold uppercase" style="color:${SPEED_COLORS[k]}">${k}</th>`).join('')}
        <th class="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Total Units</th>
    </tr></thead>`;

    const rows = depts.map(([dept, d]) => `<tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="px-4 py-3 font-semibold text-sm text-wmt-gray-160">${dept}</td>
        <td class="px-3 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${fastColor(d['1-day'])}"> ${d['1-day']}%</span></td>
        <td class="px-3 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${fastColor(d['2-day'])}"> ${d['2-day']}%</span></td>
        <td class="px-3 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold bg-yellow-50 text-yellow-700">${d['3-day']}%</span></td>
        <td class="px-3 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${heatColor(d['4-7 Day'])}"> ${d['4-7 Day']}%</span></td>
        <td class="px-3 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${heatColor(d['7+ Day'])}"> ${d['7+ Day']}%</span></td>
        <td class="px-4 py-3 text-right text-sm text-gray-500">${Number(d.total_units).toLocaleString()}</td>
    </tr>`).join('');

    return `<div class="overflow-x-auto"><table class="w-full text-sm">${header}<tbody>${rows}</tbody></table></div>
    <p class="text-xs text-gray-400 mt-3">Sorted by fastest (1-day + 2-day %). Green = fast, Red = slow.</p>`;
}

// ─── Tab 2: WFS vs SFF Mix ───────────────────────────────────────────────
function mountMixChart(channelMix) {
    const ctx = document.getElementById('catMixChart');
    if (!ctx || !channelMix) return;
    const depts  = Object.keys(channelMix);
    const wfsVals = depts.map(d => {
        const tot = channelMix[d].wfs + channelMix[d].sff;
        return tot ? +(channelMix[d].wfs / tot * 100).toFixed(1) : 0;
    });
    const sffVals = depts.map(d => {
        const tot = channelMix[d].wfs + channelMix[d].sff;
        return tot ? +(channelMix[d].sff / tot * 100).toFixed(1) : 0;
    });
    catChartInstances.mix = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: depts,
            datasets: [
                { label: 'WFS %', data: wfsVals, backgroundColor: '#0053e2', borderRadius: 4 },
                { label: 'SFF %', data: sffVals, backgroundColor: '#ffc220', borderRadius: 4 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true }, title: { display: true, text: 'WFS vs SFF Channel Mix by Department (% of Units)', font: { size: 14, weight: 'bold' } } },
            scales: {
                x: { stacked: true, ticks: { maxRotation: 45 } },
                y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
            },
        },
    });
}

// ─── Tab 3: Week over Week ───────────────────────────────────────────────
function mountWowChart(wow) {
    const ctx = document.getElementById('catWowChart');
    if (!ctx || !wow || !wow.length) return;
    const labels  = wow.map(w => `WK ${w.week}`);
    catChartInstances.wow = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '1-day %',   data: wow.map(w => w['1-day']),   borderColor: SPEED_COLORS['1-day'],   backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
                { label: '2-day %',   data: wow.map(w => w['2-day']),   borderColor: SPEED_COLORS['2-day'],   backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
                { label: '3-day %',   data: wow.map(w => w['3-day']),   borderColor: SPEED_COLORS['3-day'],   backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
                { label: '4-7 Day %', data: wow.map(w => w['4-7 Day']), borderColor: SPEED_COLORS['4-7 Day'], backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
                { label: '7+ Day %',  data: wow.map(w => w['7+ Day']),  borderColor: SPEED_COLORS['7+ Day'],  backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top' }, title: { display: true, text: 'Shipping Speed % by WM Fiscal Week', font: { size: 14, weight: 'bold' } } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => v + '%' } },
                x: { ticks: { maxRotation: 45, maxTicksLimit: 20 } },
            },
        },
    });
}

// ─── Tab 4: Top Offenders ─────────────────────────────────────────────────
function buildOffendersHTML(offenders) {
    if (!offenders || !offenders.length)
        return '<p class="text-gray-400 text-sm">No offender data available (min 100 units required).</p>';

    const rows = offenders.map((o, i) => `
    <tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="px-4 py-3 text-sm font-bold text-gray-500">#${i + 1}</td>
        <td class="px-4 py-3 font-semibold text-sm text-wmt-gray-160">${o.seller_name}</td>
        <td class="px-4 py-3 text-right text-sm text-gray-600">${Number(o.total_units).toLocaleString()}</td>
        <td class="px-4 py-3 text-right">
            <span class="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">${o.slow_pct}%</span>
        </td>
        <td class="px-4 py-3 text-center">
            <button onclick="drillToPid('${o.slr_org_id}')"
                class="px-3 py-1 bg-wmt-blue text-white text-xs font-bold rounded-full hover:bg-[#004dc1] transition-all">
                View in PID Mode →
            </button>
        </td>
    </tr>`).join('');

    return `<div class="overflow-x-auto">
    <table class="w-full text-sm">
        <thead><tr class="bg-gray-50">
            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Rank</th>
            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Seller</th>
            <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Total Units</th>
            <th class="px-4 py-3 text-right text-xs font-bold text-red-500 uppercase">7+ Day %</th>
            <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Drill Through</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <p class="text-xs text-gray-400 mt-3">Sellers with ≥100 units, ranked by worst 7+ day rate.</p>`;
}

/** Drill through from Top Offenders into PID mode for a specific seller. */
function drillToPid(slrOrgId) {
    setMode('pid');
    document.getElementById('pid').value = slrOrgId;
    analyzeShippingSpeed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Tab 5: Benchmark (all L0 divisions) ───────────────────────────────────
function mountBenchChart(benchmark) {
    const ctx = document.getElementById('catBenchChart');
    if (!ctx || !benchmark) return;
    const divisions = Object.keys(benchmark).sort();
    catChartInstances.bench = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: divisions,
            datasets: SPEED_KEYS.map(speed => ({
                label: speed,
                data: divisions.map(d => benchmark[d]?.[speed] || 0),
                backgroundColor: SPEED_COLORS[speed],
                borderRadius: 3,
            })),
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'All L0 Divisions — Speed Distribution Benchmark (%)', font: { size: 14, weight: 'bold' } },
            },
            scales: {
                x: { stacked: true, ticks: { maxRotation: 45 } },
                y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
            },
        },
    });
}
