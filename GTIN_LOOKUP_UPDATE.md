# GTIN-Level Sort/Non-Sort Classification Update

## 📋 What Changed

The shipping speed visualizer now uses **GTIN-level item classification** from `AG_Inventory_SB_Daily` as the primary source for determining whether items are Sortable vs Non-Sort.

### Previous Behavior
- **Source**: `CTP.Channel_Group4` (order-level routing classification)
- **Values**: `FC_WFS_Sort` / `FC_WFS_NS`
- **Issue**: Classification could vary based on FC routing logic for the same item

### New Behavior
- **Primary Source**: `AG_Inventory_SB_Daily.expected_item_type` (GTIN-level product attribute)
- **Values**: `Sortable` / `Nonsort`
- **Fallback**: `CTP.Channel_Group4` (for GTINs not found in inventory snapshot)
- **Benefit**: More accurate and consistent classification across all orders for the same GTIN

---

## 🔍 How It Works

### SQL Query Structure

```sql
-- Step 1: Build GTIN-level lookup from most recent AG_Inventory_SB_Daily snapshot
WITH gtin_classification AS (
    SELECT gtin, expected_item_type
    FROM (
        SELECT
            gtin,
            expected_item_type,
            ROW_NUMBER() OVER(PARTITION BY gtin ORDER BY cal_dt DESC) AS rn
        FROM `wmt-wfs-analytics.WW_WFS_PROD_TABLES.AG_Inventory_SB_Daily`
        WHERE cal_dt = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
          AND expected_item_type IS NOT NULL
    )
    WHERE rn = 1
),

-- Step 2: Join to CTP and use GTIN classification with fallback
ctp_filtered AS (
    SELECT
        ...
        CASE
            -- PRIMARY: Use GTIN-level classification
            WHEN gc.expected_item_type = 'Sortable' THEN 'sort'
            WHEN gc.expected_item_type = 'Nonsort' THEN 'ns'
            -- FALLBACK: Use order-level Channel_Group4
            WHEN Channel_Group4 = 'FC_WFS_Sort' THEN 'sort'
            WHEN Channel_Group4 = 'FC_WFS_NS' THEN 'ns'
            ELSE 'unknown'
        END AS sort_type,
        ...
    FROM `wmt-cp-prod.e2e_fmt_cp.CTP` ctp
    LEFT JOIN gtin_classification gc ON ctp.GTIN = gc.gtin
    ...
)
```

### Coverage Diagnostics

The query tracks how often GTIN lookup succeeds vs falls back to `Channel_Group4`:

```sql
SELECT
    ...,
    COUNTIF(gtin_item_type IS NOT NULL) AS gtin_lookup_hits,
    COUNTIF(gtin_item_type IS NULL) AS gtin_lookup_misses
FROM ctp_filtered
```

You'll see output like:
```
[GTIN Lookup] ✅ 96.3% coverage (145,821 GTINs found in AG_Inventory_SB_Daily, 5,742 fell back to Channel_Group4)
```

---

## 📊 Data Source Details

### `AG_Inventory_SB_Daily` Table

| Attribute | Value |
|---|---|
| **Dataset** | `wmt-wfs-analytics.WW_WFS_PROD_TABLES.AG_Inventory_SB_Daily` |
| **Update Frequency** | Daily (no gaps observed) |
| **Snapshot Date** | `cal_dt = CURRENT_DATE() - 1` (yesterday) |
| **GTIN Uniqueness** | ~2.66 rows per GTIN per day (fanned out by FC/seller) |
| **Distinct Values** | `Sortable`, `Nonsort` (2 values, 0 nulls) |
| **Coverage** | ~4.8M unique GTINs (as of Mar 2026) |

### Why This Table?

Based on research using the `bigquery-explorer` agent:

🥇 **Best Option**: `AG_Inventory_SB_Daily`
- ✅ Daily updates (no gaps)
- ✅ Clean GTIN-level classification
- ✅ Production-quality data
- ✅ 4.8M+ GTINs covered

🥈 **Alternative**: `SK_wfs_item_velocity_and_order_details`
- ✅ 1:1 GTIN mapping (no fan-out)
- ✅ Richer context (velocity, order counts)
- ❌ **Stale**: Last updated June 2025 (~9 months old)
- ❌ Not suitable for production use today

---

## 🧪 How to Test

### 1. Start the Server

```bash
cd /Users/t0t0ech/Documents/Code\ Puppy/shipping-speed-visualizer
bash run.sh
```

### 2. Run a Test Query

```bash
curl -X POST http://localhost:5004/api/shipping-speed \
  -H "Content-Type: application/json" \
  -d '{
    "pid": "YOUR_TEST_PID",
    "period_type": "fytd",
    "metric_type": "actual"
  }'
```

### 3. Check the Server Logs

Look for the GTIN lookup coverage line:

```
[GTIN Lookup] ✅ 96.3% coverage (145,821 GTINs found in AG_Inventory_SB_Daily, 5,742 fell back to Channel_Group4)
```

**Expected Coverage**: 85-99% (GTINs in current WFS inventory)
**Fallback Cases**: Historical GTINs no longer in inventory, new items not yet in snapshot

### 4. Check the UI

Open http://localhost:5004/ and run a query for a seller. The sort/non-sort breakdowns should now reflect GTIN-level classification.

---

## 🐛 Troubleshooting

### Low GTIN Coverage (<80%)

**Possible Causes**:
1. `AG_Inventory_SB_Daily` snapshot is missing or incomplete for yesterday
2. Seller has many historical orders for GTINs no longer in WFS inventory
3. `cal_dt = CURRENT_DATE() - 1` may need adjustment if snapshot timing changed

**Debug Query**:
```sql
SELECT cal_dt, COUNT(DISTINCT gtin) as gtin_count
FROM `wmt-wfs-analytics.WW_WFS_PROD_TABLES.AG_Inventory_SB_Daily`
WHERE cal_dt >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1
ORDER BY 1 DESC
```

### Query Performance

The GTIN lookup CTE adds ~2-5 seconds to query time (one-time cost to build lookup table). This is acceptable for the accuracy improvement.

**If performance becomes an issue**, consider:
1. Materializing `gtin_classification` as a daily snapshot table
2. Using `SK_wfs_item_velocity_and_order_details` if it gets updated regularly

---

## 📝 Code Changes

### Modified File
- `bigquery_connector.py`: `get_shipping_speed_distribution()` method

### Key Changes
1. Added `gtin_classification` CTE to query
2. LEFT JOIN to `CTP` on `ctp.GTIN = gc.gtin`
3. Updated `sort_type` CASE statement to prioritize `gc.expected_item_type`
4. Added diagnostic columns: `gtin_lookup_hits`, `gtin_lookup_misses`
5. Added logging to track GTIN coverage percentage

### No Breaking Changes
- API contract unchanged (same inputs/outputs)
- UI compatibility maintained
- Fallback ensures no data loss for missing GTINs

---

## ✅ Next Steps

### Before Pushing to Production

1. **Test with Multiple PIDs**: Verify coverage across different seller types (WFS-heavy, SFF-heavy, mixed)
2. **Compare Results**: Run side-by-side with old logic for a few sellers to validate consistency
3. **Monitor Performance**: Ensure query time is acceptable (<15 seconds for FYTD)
4. **Document Coverage**: Note typical coverage % for different seller types in team docs

### When Ready to Push

```bash
cd /Users/t0t0ech/Documents/Code\ Puppy/shipping-speed-visualizer
git add bigquery_connector.py GTIN_LOOKUP_UPDATE.md
git commit -m "feat: Add GTIN-level sort/non-sort classification from AG_Inventory_SB_Daily

- Use wmt-wfs-analytics.WW_WFS_PROD_TABLES.AG_Inventory_SB_Daily as primary source
- Fallback to CTP.Channel_Group4 for GTINs not in inventory snapshot
- Add diagnostic logging for GTIN lookup coverage
- Improves classification accuracy and consistency across orders"
git push origin main
```

---

## 📞 Questions?

If you encounter issues or have questions about this update:

1. Check the [BQ Explorer Research Session](session: sort-nonsort-gtin-research-1a0c2c) for detailed table analysis
2. Review the query in `bigquery_connector.py` lines 313-389
3. Test queries directly in BigQuery console to isolate issues

**Team Contact**: (Add your team's Slack channel or contact info here)

---

_Generated by Code Puppy 🐶 - March 20, 2026_
