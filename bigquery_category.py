#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bigquery_category.py
All BigQuery queries for Category Analysis mode.
Kept separate from bigquery_connector.py (PID mode) to honour SRP.
"""

import logging
from datetime import datetime
from google.cloud import bigquery
from bigquery_connector import BigQueryConnector

logger = logging.getLogger(__name__)

SPEED_KEYS   = ["1-day", "2-day", "3-day", "4-7 Day", "7+ Day"]
SPEED_SQL    = """
    CASE
        WHEN Promise_Group IN ('Same Day', 'Next Day') THEN '1-day'
        WHEN Promise_Group = '2 Day'   THEN '2-day'
        WHEN Promise_Group = '3 Day'   THEN '3-day'
        WHEN Promise_Group = '4-7 Day' THEN '4-7 Day'
        WHEN Promise_Group = '7+ Day'  THEN '7+ Day'
        ELSE 'Other'
    END
"""
BASE_TABLE   = "`wmt-cp-prod.e2e_fmt_cp.CTP`"
FULFMT_WHERE = "FULFMT_TYPE = 'MP'"


def _days_back(period_type: str) -> int:
    """Return how many days back to query based on period type."""
    now = datetime.now()
    if now.month >= 2:
        fy_start = datetime(now.year, 1, 31)
    else:
        fy_start = datetime(now.year - 1, 1, 31)

    if period_type == "last_2_fys":
        start = fy_start.replace(year=fy_start.year - 2)
    elif period_type == "last_1_fy":
        start = fy_start.replace(year=fy_start.year - 1)
    else:  # fytd
        start = fy_start
    return (now - start).days


# ─── Shared BQ client via connector ─────────────────────────────────────────
def _client():
    return BigQueryConnector().get_client()


# ─── 1. L0 Division list (for the dropdown) ───────────────────────────────
def get_l0_divisions() -> list[str]:
    """Fetch all distinct L0 Divisions from CTP (WFS/SFF MP orders)."""
    query = f"""
    SELECT Division, SUM(COALESCE(Total_Ordered_Units,1)) AS units
    FROM {BASE_TABLE}
    WHERE {FULFMT_WHERE}
      AND Division IS NOT NULL AND Division != ''
      AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 395 DAY)
    GROUP BY Division
    ORDER BY units DESC
    """
    rows = list(_client().query(query).result())
    return [r.Division for r in rows if r.Division]


# ─── 2. Seller Divisions (for PID mode L0 filter buttons) ────────────────────
def get_seller_divisions(target_ids: list[str], days_back: int) -> list[str]:
    """Return distinct L0 Divisions a seller has sold in during the period."""
    query = f"""
    SELECT Division, SUM(COALESCE(Total_Ordered_Units,1)) AS units
    FROM {BASE_TABLE}
    WHERE {FULFMT_WHERE}
      AND (
          CAST(SLR_ORG_ID AS STRING) IN UNNEST(@target_ids)
          OR SRC_SLR_ORG_CD IN UNNEST(@target_ids)
      )
      AND Division IS NOT NULL AND Division != ''
      AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_back} DAY)
    GROUP BY Division
    ORDER BY units DESC
    """
    job_cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("target_ids", "STRING", target_ids)]
    )
    rows = list(_client().query(query, job_config=job_cfg).result())
    return [r.Division for r in rows if r.Division]


# ─── 3. ZIP3 → State mapping (USPS ranges) ─────────────────────────────────
_ZIP3_STATE: dict[str, str] = {}
for _z in range(10,  28): _ZIP3_STATE[str(_z).zfill(3)] = 'MA'
for _z in range(28,  30): _ZIP3_STATE[str(_z).zfill(3)] = 'RI'
for _z in range(30,  40): _ZIP3_STATE[str(_z).zfill(3)] = 'NH'
for _z in range(50,  60): _ZIP3_STATE[str(_z).zfill(3)] = 'VT'
for _z in range(60,  70): _ZIP3_STATE[str(_z).zfill(3)] = 'CT'
for _z in range(70,  90): _ZIP3_STATE[str(_z).zfill(3)] = 'NJ'
for _z in range(100, 150): _ZIP3_STATE[str(_z)] = 'NY'
for _z in range(150, 197): _ZIP3_STATE[str(_z)] = 'PA'
for _z in range(197, 200): _ZIP3_STATE[str(_z)] = 'DE'
for _z in range(200, 220): _ZIP3_STATE[str(_z)] = 'MD'
for _z in range(220, 247): _ZIP3_STATE[str(_z)] = 'VA'
for _z in range(247, 270): _ZIP3_STATE[str(_z)] = 'WV'
for _z in range(270, 290): _ZIP3_STATE[str(_z)] = 'NC'
for _z in range(290, 300): _ZIP3_STATE[str(_z)] = 'SC'
for _z in range(300, 320): _ZIP3_STATE[str(_z)] = 'GA'
for _z in range(320, 350): _ZIP3_STATE[str(_z)] = 'FL'
for _z in range(350, 370): _ZIP3_STATE[str(_z)] = 'AL'
for _z in range(370, 386): _ZIP3_STATE[str(_z)] = 'TN'
for _z in range(386, 398): _ZIP3_STATE[str(_z)] = 'MS'
for _z in range(400, 430): _ZIP3_STATE[str(_z)] = 'KY'
for _z in range(430, 460): _ZIP3_STATE[str(_z)] = 'OH'
for _z in range(460, 480): _ZIP3_STATE[str(_z)] = 'IN'
for _z in range(480, 500): _ZIP3_STATE[str(_z)] = 'MI'
for _z in range(500, 530): _ZIP3_STATE[str(_z)] = 'IA'
for _z in range(530, 550): _ZIP3_STATE[str(_z)] = 'WI'
for _z in range(550, 568): _ZIP3_STATE[str(_z)] = 'MN'
for _z in range(570, 578): _ZIP3_STATE[str(_z)] = 'SD'
for _z in range(580, 589): _ZIP3_STATE[str(_z)] = 'ND'
for _z in range(590, 600): _ZIP3_STATE[str(_z)] = 'MT'
for _z in range(600, 630): _ZIP3_STATE[str(_z)] = 'IL'
for _z in range(630, 659): _ZIP3_STATE[str(_z)] = 'MO'
for _z in range(660, 680): _ZIP3_STATE[str(_z)] = 'KS'
for _z in range(680, 694): _ZIP3_STATE[str(_z)] = 'NE'
for _z in range(700, 715): _ZIP3_STATE[str(_z)] = 'LA'
for _z in range(716, 730): _ZIP3_STATE[str(_z)] = 'AR'
for _z in range(730, 750): _ZIP3_STATE[str(_z)] = 'OK'
for _z in range(750, 800): _ZIP3_STATE[str(_z)] = 'TX'
for _z in range(800, 817): _ZIP3_STATE[str(_z)] = 'CO'
for _z in range(820, 832): _ZIP3_STATE[str(_z)] = 'WY'
for _z in range(832, 839): _ZIP3_STATE[str(_z)] = 'ID'
for _z in range(840, 848): _ZIP3_STATE[str(_z)] = 'UT'
for _z in range(850, 866): _ZIP3_STATE[str(_z)] = 'AZ'
for _z in range(870, 885): _ZIP3_STATE[str(_z)] = 'NM'
for _z in range(889, 899): _ZIP3_STATE[str(_z)] = 'NV'
for _z in range(900, 962): _ZIP3_STATE[str(_z)] = 'CA'
for _z in range(967, 969): _ZIP3_STATE[str(_z)] = 'HI'
for _z in range(970, 980): _ZIP3_STATE[str(_z)] = 'OR'
for _z in range(980, 995): _ZIP3_STATE[str(_z)] = 'WA'
for _z in range(995, 1000): _ZIP3_STATE[str(_z)] = 'AK'


# ─── 4. Full category analysis ───────────────────────────────────────────────
def get_category_analysis(division: str, period_type: str = "fytd") -> dict:
    """
    Run all 4 queries for category mode and return structured data.
    """
    days  = _days_back(period_type)
    client = _client()

    div_param = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("division", "STRING", division)]
    )

    # ─ Query 1: Heatmap + Channel Mix (Dept × speed × channel) ─────────────
    q_heat = f"""
    SELECT
        COALESCE(Dept, 'Unknown') AS dept,
        {SPEED_SQL} AS speed_bucket,
        CASE WHEN Channel_Group3 = 'FC WFS' THEN 'WFS' ELSE 'SFF' END AS channel,
        SUM(COALESCE(Total_Ordered_Units, 1)) AS units
    FROM {BASE_TABLE}
    WHERE {FULFMT_WHERE}
      AND Division = @division
      AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
    GROUP BY 1, 2, 3
    """
    heatmap      = {}   # dept → speed → units
    channel_mix  = {}   # dept → {wfs, sff}  (totals, kept for compat)
    dept_speed   = {}   # dept → {wfs: {speed: n}, sff: {speed: n}}
    div_wfs_spd  = {k: 0.0 for k in SPEED_KEYS}  # division-level WFS by speed
    div_sff_spd  = {k: 0.0 for k in SPEED_KEYS}  # division-level SFF by speed

    for row in client.query(q_heat, job_config=div_param).result():
        dept, speed, ch, units = row.dept, row.speed_bucket, row.channel, float(row.units or 0)
        if speed == "Other":
            continue
        if dept not in heatmap:
            heatmap[dept]     = {k: 0.0 for k in SPEED_KEYS}
            channel_mix[dept] = {"wfs": 0.0, "sff": 0.0}
            dept_speed[dept]  = {
                "wfs": {k: 0.0 for k in SPEED_KEYS},
                "sff": {k: 0.0 for k in SPEED_KEYS},
            }
        heatmap[dept][speed] += units
        if ch == "WFS":
            channel_mix[dept]["wfs"]       += units
            dept_speed[dept]["wfs"][speed] += units
            div_wfs_spd[speed]             += units
        else:
            channel_mix[dept]["sff"]       += units
            dept_speed[dept]["sff"][speed] += units
            div_sff_spd[speed]             += units

    # Convert dept_speed raw counts → percentages + include totals for sorting
    dept_speed_pct = {}
    for dept, ch_data in dept_speed.items():
        wfs_total = sum(ch_data["wfs"].values())
        sff_total = sum(ch_data["sff"].values())
        dept_speed_pct[dept] = {
            "wfs": {k: round(v / wfs_total * 100, 1) if wfs_total else 0 for k, v in ch_data["wfs"].items()},
            "sff": {k: round(v / sff_total * 100, 1) if sff_total else 0 for k, v in ch_data["sff"].items()},
            "total_wfs": int(wfs_total),
            "total_sff": int(sff_total),
        }

    # Division-level channel speed (percentages)
    wfs_total_div = sum(div_wfs_spd.values())
    sff_total_div = sum(div_sff_spd.values())
    division_speed = {
        "wfs": {k: round(v / wfs_total_div * 100, 1) if wfs_total_div else 0 for k, v in div_wfs_spd.items()},
        "sff": {k: round(v / sff_total_div * 100, 1) if sff_total_div else 0 for k, v in div_sff_spd.items()},
        "total_wfs": int(wfs_total_div),
        "total_sff": int(sff_total_div),
    }

    # Convert heatmap raw counts to percentages per dept
    heatmap_pct = {}
    for dept, buckets in heatmap.items():
        total = sum(buckets.values())
        heatmap_pct[dept] = {
            **{k: round(v / total * 100, 1) if total else 0 for k, v in buckets.items()},
            "total_units": int(total),
        }

    # ─ Query 2: Week-over-Week (WM week × speed) ────────────────────────
    q_wow = f"""
    SELECT
        CAST(Order_WM_WK AS STRING) AS wm_week,
        {SPEED_SQL} AS speed_bucket,
        SUM(COALESCE(Total_Ordered_Units, 1)) AS units
    FROM {BASE_TABLE}
    WHERE {FULFMT_WHERE}
      AND Division = @division
      AND Order_WM_WK IS NOT NULL
      AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
    GROUP BY 1, 2
    ORDER BY wm_week DESC
    """
    wow_raw = {}  # week → speed → units
    for row in client.query(q_wow, job_config=div_param).result():
        wk, speed, units = str(row.wm_week), row.speed_bucket, float(row.units or 0)
        if speed == "Other":
            continue
        if wk not in wow_raw:
            wow_raw[wk] = {k: 0.0 for k in SPEED_KEYS}
        wow_raw[wk][speed] += units

    wow = []
    for wk in sorted(wow_raw.keys(), reverse=True)[:26]:  # last 26 weeks
        total = sum(wow_raw[wk].values())
        entry = {"week": wk, "total_units": int(total)}
        for k in SPEED_KEYS:
            entry[k] = round(wow_raw[wk][k] / total * 100, 1) if total else 0
        wow.append(entry)
    wow.reverse()  # chronological for the chart

    # ─ Query 3: ZIP3-based state speed distribution (for US map) ──────────
    state_data = {}
    try:
        q_state = f"""
        SELECT
            CAST(SHIP_TO_ZIP_CD3 AS STRING) AS zip3,
            {SPEED_SQL} AS speed_bucket,
            SUM(COALESCE(Total_Ordered_Units, 1)) AS units
        FROM {BASE_TABLE}
        WHERE {FULFMT_WHERE}
          AND Division = @division
          AND SHIP_TO_ZIP_CD3 IS NOT NULL
          AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY 1, 2
        """
        state_raw: dict[str, dict] = {}
        for row in client.query(q_state, job_config=div_param).result():
            zip3  = str(row.zip3 or '').zfill(3)
            speed = row.speed_bucket
            units = float(row.units or 0)
            state = _ZIP3_STATE.get(zip3)
            if speed == 'Other' or not state:
                continue
            if state not in state_raw:
                state_raw[state] = {k: 0.0 for k in SPEED_KEYS}
            state_raw[state][speed] += units
        for st, buckets in state_raw.items():
            total = sum(buckets.values())
            if total == 0:
                continue
            state_data[st] = {
                **{k: round(v / total * 100, 1) for k, v in buckets.items()},
                "total_units": int(total),
                "dominant":    max(buckets, key=buckets.get),
            }
    except Exception as e:
        logger.warning(f"State map query failed: {e}")

    # ─ Query 4: Benchmark — all L0 Divisions side-by-side ────────────────
    q_bench = f"""
    SELECT
        Division,
        {SPEED_SQL} AS speed_bucket,
        SUM(COALESCE(Total_Ordered_Units, 1)) AS units
    FROM {BASE_TABLE}
    WHERE {FULFMT_WHERE}
      AND Division IS NOT NULL AND Division != ''
      AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
    GROUP BY 1, 2
    """
    bench_raw = {}
    for row in client.query(q_bench).result():
        div, speed, units = row.Division, row.speed_bucket, float(row.units or 0)
        if speed == "Other" or not div:
            continue
        if div not in bench_raw:
            bench_raw[div] = {k: 0.0 for k in SPEED_KEYS}
        bench_raw[div][speed] += units

    benchmark = {}
    for div, buckets in bench_raw.items():
        total = sum(buckets.values())
        benchmark[div] = {
            **{k: round(v / total * 100, 1) if total else 0 for k, v in buckets.items()},
            "total_units": int(total),
        }

    # ─ Build final response ──────────────────────────────────────────
    now = datetime.now()
    period_labels = {"fytd": "FY To Date", "last_1_fy": "Current + Last FY", "last_2_fys": "Current + Last 2 FYs"}
    return {
        "division":        division,
        "period_type":     period_type,
        "analysis_period": period_labels.get(period_type, period_type),
        "date_range":      f"{days} days ending {now.strftime('%m/%d/%Y')}",
        "heatmap":        heatmap_pct,
        "channel_mix":     channel_mix,
        "division_speed":  division_speed,
        "dept_speed":      dept_speed_pct,
        "wow":             wow,
        "state_data":      state_data,
        "benchmark":       benchmark,
    }
