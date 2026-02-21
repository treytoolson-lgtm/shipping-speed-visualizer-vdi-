from bigquery_connector import BigQueryConnector
from google.cloud import bigquery

bq = BigQueryConnector()
client = bq.get_client()

query = """
SELECT 
    CASE WHEN WFS_ENABLED_IND = 1 THEN 'WFS' ELSE 'SFF' END AS mp_channel,
    COUNT(*) as total_rows,
    COUNT(FC_Sort_Type) as has_fc_sort,
    APPROX_TOP_COUNT(COALESCE(CAST(FC_Sort_Type AS STRING), 'NULL'), 3) as top_fc_sort,
    COUNT(SKU_Type1) as has_sku_type1,
    APPROX_TOP_COUNT(COALESCE(SKU_Type1, 'NULL'), 3) as top_sku_type1,
    COUNT(PO_CARRIER_MTHD_TYPE) as has_carrier_method,
    APPROX_TOP_COUNT(COALESCE(PO_CARRIER_MTHD_TYPE, 'NULL'), 3) as top_carrier_method
FROM `wmt-cp-prod.e2e_fmt_cp.CTP`
WHERE 
    FULFMT_TYPE = 'MP'
    AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1
"""

try:
    print("Running query...")
    results = list(client.query(query).result())
    for row in results:
        print(f"Channel: {row.mp_channel}")
        print(f"  Total Rows: {row.total_rows}")
        print(f"  Has FC Sort: {row.has_fc_sort}")
        print(f"  Top FC Sort: {row.top_fc_sort}")
        print(f"  Has SKU Type1: {row.has_sku_type1}")
        print(f"  Top SKU Type1: {row.top_sku_type1}")
        print(f"  Has Carrier Method: {row.has_carrier_method}")
        print(f"  Top Carrier Method: {row.top_carrier_method}")
        print("-" * 30)
except Exception as e:
    print(f"Error: {e}")
