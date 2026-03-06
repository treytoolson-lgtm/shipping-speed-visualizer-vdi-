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
                    <div class="chart-container" style="height:460px">
                        <canvas id="catMixChart"></canvas>
                    </div>
                    <div class="flex justify-center mt-4" id="mixShowAllWrap">
                        <button onclick="mixToggleAll()" id="mixShowAllBtn"
                            class="px-5 py-2 rounded-full text-sm font-bold border border-gray-300
                                   text-gray-600 hover:border-wmt-blue hover:text-wmt-blue transition-all">
                            Show All Departments
                        </button>
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

    // Store full dept list for Show All toggle
    catAllDepts = Object.keys(data.channel_mix || {});

    setTimeout(() => {
        mountMixChart(data.channel_mix, false);
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

// ─── Tab 1: WFS vs SFF Mix chart ─────────────────────────────────────────────
function mountMixChart(channelMix, showAll) {
    if (!channelMix) return;
    _lastChannelMix = channelMix; // cache for Show All toggle

    // Sort depts by total volume, slice to TOP_N unless showAll
    let depts = Object.keys(channelMix).sort(
        (a, b) => (channelMix[b].wfs + channelMix[b].sff) - (channelMix[a].wfs + channelMix[a].sff)
    );
    const totalDepts = depts.length;
    if (!showAll) depts = depts.slice(0, TOP_N);

    const wfsVals = depts.map(d => {
        const tot = channelMix[d].wfs + channelMix[d].sff;
        return tot ? +(channelMix[d].wfs / tot * 100).toFixed(1) : 0;
    });
    const sffVals = depts.map(d => {
        const tot = channelMix[d].wfs + channelMix[d].sff;
        return tot ? +(channelMix[d].sff / tot * 100).toFixed(1) : 0;
    });

    const ctx = document.getElementById('catMixChart');
    if (!ctx) return;
    if (catChartInstances.mix) catChartInstances.mix.destroy();

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
            plugins: {
                legend: { display: true },
                title: {
                    display: true,
                    text: `WFS vs SFF Channel Mix by Department (% of Units)${
                        !showAll && totalDepts > TOP_N ? ` — Top ${TOP_N} of ${totalDepts}` : ''
                    }`,
                    font: { size: 14, weight: 'bold' },
                },
            },
            scales: {
                x: { stacked: true, ticks: { maxRotation: 45 } },
                y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
            },
        },
    });

    // Update Show All button
    const btn = document.getElementById('mixShowAllBtn');
    const wrap = document.getElementById('mixShowAllWrap');
    if (wrap) wrap.classList.toggle('hidden', totalDepts <= TOP_N);
    if (btn) btn.textContent = showAll ? 'Show Top 15' : 'Show All Departments';
}

// Stored channel mix for toggle
let _lastChannelMix = null;
function mixToggleAll() {
    catShowAll = !catShowAll;
    mountMixChart(_lastChannelMix, catShowAll);
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

// ─── Tab 3: US Geographic Heatmap ────────────────────────────────────────────
async function mountUSMap(stateData) {
    const container = document.getElementById('cat-us-map');
    if (!container) return;

    if (!Object.keys(stateData).length) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No geographic data available for this division.</p>';
        return;
    }

    try {
        const us = await d3.json('/static/vendor/us-states.json');
        const width = container.clientWidth || 800;
        const height = Math.round(width * 0.6);

        const svg = d3.select(container)
            .append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('width', '100%');

        const projection = d3.geoAlbersUsa()
            .scale(width * 1.25)
            .translate([width / 2, height / 2]);

        const path = d3.geoPath().projection(projection);

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
            .style('display', 'none');

        d3.select(container).style('position', 'relative');

        const stateNames = {
            AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
            CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
            HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
            KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
            MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
            MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
            NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
            ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
            RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',
            TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
            WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'D.C.',
        };

        svg.append('g')
            .selectAll('path')
            .data(topojson.feature(us, us.objects.states).features)
            .join('path')
            .attr('d', path)
            .attr('fill', d => {
                // Match by state name from properties
                const stateName = d.properties.name;
                // Find matching state code
                const stateCode = Object.entries(stateNames).find(([, n]) => n === stateName)?.[0];
                const sd = stateCode ? stateData[stateCode] : null;
                return sd ? SPEED_COLORS[sd.dominant] || '#e2e8f0' : '#e2e8f0';
            })
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.5)
            .on('mouseover', function(event, d) {
                d3.select(this).attr('opacity', 0.75);
                const stateName = d.properties.name;
                const stateCode = Object.entries(stateNames).find(([, n]) => n === stateName)?.[0];
                const sd = stateCode ? stateData[stateCode] : null;
                if (!sd) return;
                const rows = SPEED_KEYS.map(k =>
                    `<div style="color:${SPEED_COLORS[k]}">${k}: ${sd[k] || 0}%</div>`
                ).join('');
                tip.style('display', 'block')
                    .html(`<strong>${stateName}</strong><br>${rows}<div style="color:#aaa;font-size:10px">${sd.total_units.toLocaleString()} units</div>`);
            })
            .on('mousemove', function(event) {
                const rect = container.getBoundingClientRect();
                tip.style('left', (event.clientX - rect.left + 10) + 'px')
                    .style('top',  (event.clientY - rect.top  - 40) + 'px');
            })
            .on('mouseout', function() {
                d3.select(this).attr('opacity', 1);
                tip.style('display', 'none');
            });

    } catch (e) {
        console.error('US map render error:', e);
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
