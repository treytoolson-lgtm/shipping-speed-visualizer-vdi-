#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BigQuery Connector for Shipping Speed Data
"""

from google.cloud import bigquery
from datetime import datetime, timedelta
import os


class BigQueryConnector:
    """Connector to fetch shipping speed data from BigQuery"""

    def __init__(self):
        """Initialize BigQuery connector (lazy client initialization)"""
        self.client = None
        self.dataset_id = "WW_GEC_VM"
        self.table_id = "FIN_MP_PYMT_TRANS"
        self.project = "wmt-edw-prod"

    def get_client(self):
        """Lazy initialize BigQuery client"""
        if self.client is None:
            self.client = bigquery.Client(project=self.project)
        return self.client

    async def get_shipping_speed_distribution(
        self,
        pid: str,
        days_back: int = 90
    ) -> dict:
        """
        Get shipping speed distribution for a seller
        Calculates delivery days for 2-day, 3-day, ... 10-day buckets
        Compares WFS vs SFF fulfillment types

        Args:
            pid: Seller/Partner ID
            days_back: Number of days to look back (default 90 = 3 months)

        Returns:
            Dictionary with shipping speed distribution
        """
        # Build query
        query = f"""
        WITH shipping_data AS (
            SELECT
                PRTNR_SRC_ORG_CD,
                FULFMT_TYPE_NM,
                ORDER_PLACED_DT,
                DLVR_TS_UTC,
                -- Calculate delivery days from order placed to delivery
                CAST(DATETIME_DIFF(DLVR_TS_UTC, DATETIME(ORDER_PLACED_DT), DAY) AS INT64) as delivery_days,
                SALES_ORDER_NUM
            FROM `{self.project}.{self.dataset_id}.{self.table_id}`
            WHERE
                PRTNR_SRC_ORG_CD = '{pid}'
                AND ORDER_PLACED_DT >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_back} DAY)
                AND ORDER_PLACED_DT < CURRENT_DATE()
                AND DLVR_TS_UTC IS NOT NULL
                AND FULFMT_TYPE_NM IN ('WFS', 'SFF')
        )
        SELECT
            FULFMT_TYPE_NM,
            delivery_days,
            COUNT(*) as order_count
        FROM shipping_data
        GROUP BY FULFMT_TYPE_NM, delivery_days
        ORDER BY FULFMT_TYPE_NM, delivery_days
        """

        try:
            print(f"Querying BigQuery for PID: {pid}...")
            client = self.get_client()
            query_job = client.query(query)
            results = query_job.result()

            # Parse results into distribution buckets
            wfs_data = {f"{i}-day": 0 for i in range(2, 11)}
            sff_data = {f"{i}-day": 0 for i in range(2, 11)}
            total_wfs = 0
            total_sff = 0

            for row in results:
                fulfillment_type = row.FULFMT_TYPE_NM
                delivery_days = row.delivery_days
                order_count = row.order_count

                # Only track 2-10 day deliveries (cap at 10)
                if 2 <= delivery_days <= 10:
                    key = f"{delivery_days}-day"
                    if fulfillment_type == "WFS":
                        wfs_data[key] = order_count
                        total_wfs += order_count
                    elif fulfillment_type == "SFF":
                        sff_data[key] = order_count
                        total_sff += order_count

            # Return structured response
            return {
                "pid": pid,
                "wfs_data": wfs_data,
                "sff_data": sff_data,
                "total_wfs_orders": total_wfs,
                "total_sff_orders": total_sff,
                "analysis_period": f"Last {days_back} days",
            }

        except Exception as e:
            print(f"BigQuery error: {str(e)}")
            raise