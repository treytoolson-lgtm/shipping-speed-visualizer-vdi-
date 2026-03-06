// category.js — Category Analysis Mode
// All rendering logic for category mode kept separate (DRY + SRP).

let catChartInstances = {};   // keyed by canvas id
let catAllDepts = [];         // full dept list for Show All toggle
let catShowAll  = false;      // toggle state
const TOP_N = 15;

const SPEED_KEYS   = ['1-day', '2-day', '3-day', '4-7 Day', '7+ Day'];
const SPEED_COLORS = {
    '1-day':   '#2a8703',
    '2-day':   '#76c043',
    '3-day':   '#ffc220',
    '4-7 Day': '#f47321',
    '7+ Day':  '#ea1100',
};
const SPEED_LABELS_MAP = {
    '1-day':   '1-day (Green)',
    '2-day':   '2-day (Light Green)',
    '3-day':   '3-day (Yellow)',
    '4-7 Day': '4-7 Day (Orange)',
    '7+ Day':  '7+ Day (Red)',
};

// Tab order per spec
const CAT_TABS = [
    { id: 'mix',       label: 'WFS vs SFF'    },
    { id: 'wow',       label: 'Week over Week' },
    { id: 'heatmap',   label: 'Heatmap'        },
    { id: 'benchmark', label: 'All Categories' },
];

// ─── Load L0 Divisions into category dropdown ────────────────────────────────
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
document.addEventListener('DOMContentLoaded', loadL0Divisions);

// ─── Main entry point ────────────────────────────────────────────────────────
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
    btn.disabled    = true;
    btn.textContent = 'Analyzing...';

    try {
        const resp = await fetch('/api/category-analysis', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ division, period_type: period }),
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
        btn.disabled    = false;
        btn.textContent = 'Analyze Category';
    }
}

// ─── Results shell ───────────────────────────────────────────────────────────
function displayCategoryResults(data) {
    Object.values(catChartInstances).forEach(c => c && c.destroy());
    catChartInstances = {};
    catShowAll = false;

    const deptCount = Object.keys(data.heatmap || {}).length;
    const deptLabel = `${deptCount} Dept${deptCount !== 1 ? 's' : ''}`;

    const tabHTML = CAT_TABS.map((t, i) =>
        `<button onclick="catSwitchTab('${t.id}')" data-cattab="${t.id}"
            class="cat-tab flex-1 text-center whitespace-nowrap px-4 py-3 text-sm font-bold transition-all
            ${i === 0
                ? 'text-wmt-blue border-b-2 border-wmt-blue'
                : 'text-gray-500 border-b-2 border-transparent hover:text-wmt-blue'}">
            ${t.label}
        </button>`
    ).join('');

    document.getElementById('results').innerHTML = `
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 fade-in">
            <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-xl font-bold text-wmt-gray-160">
                    Category Analysis: <span class="text-wmt-blue">${data.division}</span>
                </h2>
                <p class="text-sm text-gray-500 mt-0.5">
                    ${data.analysis_period} &bull; ${data.date_range} &bull; ${deptLabel}
                </p>
            </div>

            <div class="flex border-b border-gray-200">${tabHTML}</div>

            <div class="p-6">
                <!-- WFS vs SFF -->
                <div id="cat-mix">
                    <!-- Legend -->
                    <div class="flex gap-6 mb-4">
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 rounded-full" style="background:#0053e2"></div>
                            <span class="text-sm font-medium text-wmt-gray-160">WFS (Walmart Fulfilled)</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 rounded-full" style="background:#ffc220"></div>
                            <span class="text-sm font-medium text-wmt-gray-160">SFF (Seller Fulfilled)</span>
                        </div>
                    </div>
                    <div class="chart-container" style="height:420px">
                        <canvas id="catMixChart"></canvas>
                    </div>
                    <!-- Dept drill-down buttons -->
                    <div class="mt-4">
                        <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Drill down by Department:</p>
                        <div id="mixDeptButtons" class="flex flex-wrap gap-2"></div>
                    </div>
                </div>

                <!-- Week over Week -->
                <div id="cat-wow" class="hidden">
                    <div class="chart-container" style="height:420px">
                        <canvas id="catWowChart"></canvas>
                    </div>
                </div>

                <!-- Heatmap = US Map -->
                <div id="cat-heatmap" class="hidden">
                    <p class="text-sm text-gray-500 mb-4">
                        This map shows which areas of the country are experiencing each shipping speed
                        for orders in the <strong>${data.division}</strong> division.
                        States are colored by their most common speed bucket.
                    </p>
                    <div id="cat-us-map" style="width:100%; min-height:420px;"></div>
                    <div class="flex flex-wrap gap-4 mt-4 justify-center">
                        ${Object.entries(SPEED_COLORS).map(([k, c]) =>
                            `<div class="flex items-center gap-2">
                                <div class="w-4 h-4 rounded" style="background:${c}"></div>
                                <span class="text-xs font-medium text-gray-600">${k}</span>
                            </div>`
                        ).join('')}
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 rounded bg-gray-200"></div>
                            <span class="text-xs font-medium text-gray-600">No data</span>
                        </div>
                    </div>
                </div>

                <!-- All Categories (benchmark) -->
                <div id="cat-benchmark" class="hidden">
                    <div class="chart-container" style="height:420px">
                        <canvas id="catBenchChart"></canvas>
                    </div>
                </div>
            </div>
        </div>`;

    // Store data for dept drill-down
    _catDivisionSpeed = data.division_speed || null;
    _catDeptSpeed     = data.dept_speed     || {};
    _catActiveDept    = null;

    setTimeout(() => {
        mountSpeedMixChart(_catDivisionSpeed, 'All Departments');
        renderDeptFilterButtons(_catDeptSpeed, null);
        mountWowChart(data.wow);
        mountUSMap(data.state_data || {});
        mountBenchChart(data.benchmark);
    }, 0);
}

// ─── Tab switcher ────────────────────────────────────────────────────────────
function catSwitchTab(tab) {
    CAT_TABS.forEach(t => {
        const pane = document.getElementById(`cat-${t.id}`);
        if (pane) pane.classList.toggle('hidden', t.id !== tab);
    });
    document.querySelectorAll('.cat-tab').forEach(btn => {
        const active = btn.dataset.cattab === tab;
        btn.classList.toggle('text-wmt-blue',        active);
        btn.classList.toggle('border-wmt-blue',      active);
        btn.classList.toggle('border-b-2',           active);
        btn.classList.toggle('text-gray-500',        !active);
        btn.classList.toggle('border-transparent',   !active);
    });
}

// ─── Tab 1: WFS vs SFF — PID-style speed distribution chart ────────────────────
/**
 * speedData: { wfs: {speed: pct}, sff: {speed: pct}, total_wfs: n, total_sff: n }
 * label: display name (division name or dept name)
 */
function mountSpeedMixChart(speedData, label) {
    if (!speedData) return;
    const ctx = document.getElementById('catMixChart');
    if (!ctx) return;
    if (catChartInstances.mix) catChartInstances.mix.destroy();

    const wfsData = SPEED_KEYS.map(k => speedData.wfs[k] || 0);
    const sffData = SPEED_KEYS.map(k => speedData.sff[k] || 0);
    const totalWfs = speedData.total_wfs || 0;
    const totalSff = speedData.total_sff || 0;

    catChartInstances.mix = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: SPEED_KEYS,
            datasets: [
                {
                    label: 'WFS (Walmart Fulfilled)',
                    data: wfsData,
                    backgroundColor: '#0053e2',
                    hoverBackgroundColor: '#003da8',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                },
                {
                    label: 'SFF (Seller Fulfilled)',
                    data: sffData,
                    backgroundColor: '#ffc220',
                    hoverBackgroundColor: '#e5ad1d',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `WFS vs SFF Shipping Speed — ${label}`,
                    font: { size: 14, weight: 'bold' },
                    padding: 16,
                    color: '#2e2f32',
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.label.includes('WFS') ? totalWfs : totalSff;
                            const raw   = total ? Math.round(ctx.parsed.y / 100 * total) : 0;
                            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}% (${raw.toLocaleString()} units)`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '% of Channel Volume', font: { weight: 'bold' }, color: '#959595' },
                    ticks: { callback: v => v + '%' },
                    grid: { color: '#f2f2f2' },
                    border: { display: false },
                },
                x: {
                    title: { display: true, text: 'Shipping Speed', font: { weight: 'bold' }, color: '#959595' },
                    grid: { display: false },
                    border: { display: false },
                },
            },
        },
    });
}

// Stored data for drill-down
let _catDivisionSpeed = null;
let _catDeptSpeed     = null;
let _catActiveDept    = null;

/** Render dept filter buttons below the WFS vs SFF chart. */
function renderDeptFilterButtons(deptSpeed, activeDept) {
    const wrap = document.getElementById('mixDeptButtons');
    if (!wrap) return;
    const depts = Object.keys(deptSpeed).sort(
        (a, b) => ((deptSpeed[b].total_wfs || 0) + (deptSpeed[b].total_sff || 0))
                - ((deptSpeed[a].total_wfs || 0) + (deptSpeed[a].total_sff || 0))
    );
    const btns = [{ label: 'All Depts', value: null }, ...depts.map(d => ({ label: d, value: d }))];
    wrap.innerHTML = btns.map(({ label, value }) => {
        const isActive = value === activeDept;
        return `<button onclick="catDrillDept(${value ? `'${value}'` : 'null'})" 
            class="px-3 py-1.5 rounded-full text-xs font-bold transition-all border
                   ${isActive
                       ? 'bg-wmt-blue text-white border-wmt-blue'
                       : 'bg-white text-wmt-gray-160 border-gray-300 hover:border-wmt-blue hover:text-wmt-blue'}">
            ${label}
        </button>`;
    }).join('');
}

/** Drill into a specific dept (or null = back to division total). */
function catDrillDept(dept) {
    _catActiveDept = dept;
    const speedData = dept ? _catDeptSpeed[dept] : _catDivisionSpeed;
    const label     = dept || 'All Departments';
    mountSpeedMixChart(speedData, label);
    renderDeptFilterButtons(_catDeptSpeed, dept);
}

// ─── Tab 2: Week over Week ────────────────────────────────────────────────────
function mountWowChart(wow) {
    const ctx = document.getElementById('catWowChart');
    if (!ctx || !wow || !wow.length) return;
    const labels = wow.map(w => `WK ${w.week}`);
    catChartInstances.wow = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: SPEED_KEYS.map(k => ({
                label:           `${k} %`,
                data:            wow.map(w => w[k]),
                borderColor:     SPEED_COLORS[k],
                backgroundColor: 'transparent',
                tension:         0.3,
                pointRadius:     3,
            })),
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                title:  { display: true, text: 'Shipping Speed % by WM Fiscal Week', font: { size: 14, weight: 'bold' } },
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => v + '%' } },
                x: { ticks: { maxRotation: 45, maxTicksLimit: 20 } },
            },
        },
    });
}

// ─── Tab 3: US ZIP-level dot map ──────────────────────────────────────────────────
let _zipCentroids = null; // cache after first load

async function mountUSMap(zipData) {
    const container = document.getElementById('cat-us-map');
    if (!container) return;

    if (!Object.keys(zipData).length) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No geographic data available for this division.</p>';
        return;
    }

    try {
        // Load both files in parallel, centroid JSON cached after first load
        const [us, centroids] = await Promise.all([
            d3.json('/static/vendor/us-states.json'),
            _zipCentroids
                ? Promise.resolve(_zipCentroids)
                : d3.json('/static/vendor/us_zip_centroids.json').then(c => { _zipCentroids = c; return c; }),
        ]);

        // Clear previous render
        container.innerHTML = '';
        d3.select(container).style('position', 'relative');

        const width  = container.clientWidth || 800;
        const height = Math.round(width * 0.62);

        const projection = d3.geoAlbersUsa()
            .scale(width * 1.25)
            .translate([width / 2, height / 2]);

        const path = d3.geoPath().projection(projection);

        const svg = d3.select(container)
            .append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('width', '100%');

        // State outlines as a neutral base
        svg.append('g')
            .selectAll('path')
            .data(topojson.feature(us, us.objects.states).features)
            .join('path')
            .attr('d', path)
            .attr('fill', '#f8f9fa')
            .attr('stroke', '#cbd5e1')
            .attr('stroke-width', 0.6);

        // Tooltip
        const tip = d3.select(container)
            .append('div')
            .style('position', 'absolute')
            .style('background', 'rgba(46,47,50,0.92)')
            .style('color', '#fff')
            .style('padding', '8px 12px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('display', 'none')
            .style('white-space', 'nowrap');

        // Size scale: log-based radius 2–8px
        const volumes = Object.values(zipData).map(d => d.total_units).filter(Boolean);
        const maxVol  = Math.max(...volumes);
        const rScale  = v => Math.max(2, Math.min(8, 2 + 6 * Math.log1p(v) / Math.log1p(maxVol)));

        // Build dot data — only ZIPs we have centroids for
        const dots = Object.entries(zipData)
            .filter(([z]) => centroids[z])
            .map(([z, d]) => {
                const [lat, lon] = centroids[z];
                const proj = projection([lon, lat]);
                return proj ? { zip: z, x: proj[0], y: proj[1], ...d } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.total_units - b.total_units); // draw small dots first so big ones are on top

        svg.append('g')
            .selectAll('circle')
            .data(dots)
            .join('circle')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r',  d => rScale(d.total_units))
            .attr('fill',    d => SPEED_COLORS[d.dominant] || '#94a3b8')
            .attr('opacity', 0.78)
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.4)
            .on('mouseover', function(event, d) {
                d3.select(this).attr('opacity', 1).attr('stroke-width', 1.5);
                const rows = SPEED_KEYS.map(k =>
                    `<div style="color:${SPEED_COLORS[k]}">${k}: ${d[k] || 0}%</div>`
                ).join('');
                tip.style('display', 'block')
                   .html(`<strong>ZIP ${d.zip}</strong><br>${rows}<div style="color:#aaa;font-size:10px">${d.total_units.toLocaleString()} units</div>`);
            })
            .on('mousemove', function(event) {
                const rect = container.getBoundingClientRect();
                tip.style('left', (event.clientX - rect.left + 12) + 'px')
                   .style('top',  (event.clientY - rect.top  - 50) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this).attr('opacity', 0.78).attr('stroke-width', 0.4);
                tip.style('display', 'none');
            });

        // Dot count badge
        const matched = dots.length;
        const total   = Object.keys(zipData).length;
        d3.select(container)
            .append('p')
            .attr('class', 'text-xs text-gray-400 text-right mt-1')
            .text(`${matched.toLocaleString()} of ${total.toLocaleString()} ZIPs plotted — dot size = order volume`);

    } catch (e) {
        console.error('ZIP dot map error:', e);
        container.innerHTML = '<p class="text-sm text-red-400 text-center py-8">Map could not be rendered.</p>';
    }
}

// ─── Tab 4: All Categories benchmark ─────────────────────────────────────────
function mountBenchChart(benchmark) {
    const ctx = document.getElementById('catBenchChart');
    if (!ctx || !benchmark) return;
    const divisions = Object.keys(benchmark).sort();
    catChartInstances.bench = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: divisions,
            datasets: SPEED_KEYS.map(speed => ({
                label:           speed,
                data:            divisions.map(d => benchmark[d]?.[speed] || 0),
                backgroundColor: SPEED_COLORS[speed],
                borderRadius:    3,
            })),
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                title:  { display: true, text: 'All L0 Divisions — Speed Distribution (%)', font: { size: 14, weight: 'bold' } },
            },
            scales: {
                x: { stacked: true, ticks: { maxRotation: 45 } },
                y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
            },
        },
    });
}
