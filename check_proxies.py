from bigquery_connector import BigQueryConnector
from google.cloud import bigquery
import os

# Force billing project
os.environ['GOOGLE_CLOUD_PROJECT'] = 'wmt-marketplace-analytics'

bq = BigQueryConnector()
client = bq.get_client()

query = """
SELECT 
    CASE WHEN WFS_ENABLED_IND = 1 THEN 'WFS' ELSE 'SFF' END AS mp_channel,
    COUNT(*) as total,
    COUNT(PO_CARRIER_MTHD_TYPE) as has_carrier,
    APPROX_TOP_COUNT(COALESCE(PO_CARRIER_MTHD_TYPE, 'NULL'), 5) as top_carriers,
    COUNT(LANE_TYPE) as has_lane,
    APPROX_TOP_COUNT(COALESCE(LANE_TYPE, 'NULL'), 5) as top_lanes,
    COUNT(SHPG_SLA_TIER) as has_sla,
    APPROX_TOP_COUNT(COALESCE(SHPG_SLA_TIER, 'NULL'), 5) as top_slas
FROM `wmt-cp-prod.e2e_fmt_cp.CTP`
WHERE 
    FULFMT_TYPE = 'MP'
    AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1
"""

try:
    print("Running proxy column check...")
    results = list(client.query(query).result())
    for row in results:
        print(f"Channel: {row.mp_channel}")
        print(f"  Total: {row.total}")
        print(f"  Top Carriers: {row.top_carriers}")
        print(f"  Top Lanes: {row.top_lanes}")
        print(f"  Top SLAs: {row.top_slas}")
        print("-" * 30)
except Exception as e:
    print(f"Error: {e}")
