#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BigQuery Connector for Shipping Speed Data
Source: wmt-cp-prod.e2e_fmt_cp.CTP (Committed to Promise — order-line level)
"""

from google.cloud import bigquery
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

SPEED_KEYS = [f"{i}-day" for i in range(1, 11)]  # 1-day through 10-day


def _init_speed_dict() -> dict:
    return {k: 0 for k in SPEED_KEYS}


def _init_monthly_entry() -> dict:
    return {
        "wfs": 0,
        "sff": 0,
        "wfs_breakdown": _init_speed_dict(),
        "sff_breakdown": _init_speed_dict(),
        "wfs_sort_breakdown": _init_speed_dict(),
        "wfs_nonsort_breakdown": _init_speed_dict(),
        "sff_sort_breakdown": _init_speed_dict(),
        "sff_nonsort_breakdown": _init_speed_dict(),
    }


class BigQueryConnector:
    """Connector to fetch shipping speed data from CTP (Committed to Promise)"""

    @staticmethod
    def get_walmart_fiscal_quarter(date: datetime) -> str:
        """Get Walmart fiscal quarter for a given date.
        Walmart FY starts in February.
        Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
        """
        month = date.month
        year = date.year
        if month in [2, 3, 4]:
            quarter = "Q1"
        elif month in [5, 6, 7]:
            quarter = "Q2"
        elif month in [8, 9, 10]:
            quarter = "Q3"
        else:  # 11, 12, 1
            quarter = "Q4"
            if month == 1:
                year -= 1
        return f"{quarter} FY{year + 1}"

    def __init__(self):
        self.client = None
        self.project = "wmt-cp-prod"
        self.dataset_id = "e2e_fmt_cp"
        self.table_id = "CTP"

    def get_client(self):
        """Lazy-initialize BigQuery client."""
        if self.client is None:
            try:
                # Explicitly set the billing project to wmt-marketplace-analytics
                # We read from wmt-cp-prod, but must bill to our own project
                self.client = bigquery.Client(project="wmt-marketplace-analytics")
                logger.info("BigQuery client initialized with billing project: wmt-marketplace-analytics")
            except Exception as e:
                logger.error(f"Failed to initialize BigQuery client: {e}")
                raise
        return self.client

    def _resolve_legacy_id(self, pid: str) -> str:
        """Resolve Partner ID to Legacy Seller Org ID (SLR_ORG_ID) via mp_wfs_seller_mart."""
        try:
            client = self.get_client()
            query = """
            SELECT legacy_id
            FROM `wmt-marketplace-analytics.MPOA.mp_wfs_seller_mart`
            WHERE CAST(partner_id AS STRING) = @pid
            LIMIT 1
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("pid", "STRING", pid)]
            )
            results = list(client.query(query, job_config=job_config).result())
            if results and results[0].legacy_id:
                legacy_id = str(results[0].legacy_id)
                logger.info(f"Mapped PID {pid} -> Legacy ID {legacy_id}")
                return legacy_id
            return pid
        except Exception as e:
            logger.warning(f"Error resolving legacy ID: {e}")
            return pid

    def _generate_quarterly_breakdowns(self, start_date: datetime, end_date: datetime, monthly_data: dict) -> dict:
        """Aggregate monthly data into Walmart fiscal quarters."""
        quarters_to_include: set = set()
        temp = start_date.replace(day=1)
        while temp <= end_date:
            quarters_to_include.add(self.get_walmart_fiscal_quarter(temp))
            temp = temp.replace(month=temp.month + 1) if temp.month < 12 else temp.replace(year=temp.year + 1, month=1)

        quarterly_data = {q: _init_monthly_entry() for q in quarters_to_include}

        for month_key, month_data in monthly_data.items():
            month_obj = datetime.strptime(month_key, "%b %Y")
            quarter = self.get_walmart_fiscal_quarter(month_obj)
            if quarter not in quarterly_data:
                continue
            qd = quarterly_data[quarter]
            qd["wfs"] += month_data["wfs"]
            qd["sff"] += month_data["sff"]
            for key in SPEED_KEYS:
                for sub in ["wfs_breakdown", "sff_breakdown",
                             "wfs_sort_breakdown", "wfs_nonsort_breakdown",
                             "sff_sort_breakdown", "sff_nonsort_breakdown"]:
                    qd[sub][key] += month_data.get(sub, {}).get(key, 0)

        return quarterly_data

    def check_seller_programs(self, pid: str, legacy_id: str) -> list:
        """
        Check if the seller is in ICC (Internal Consolidation Center) or ITS/Import programs.
        """
        programs = []
        client = self.get_client()
        
        # 1. Check ICC (NAPO_RAMP) using Legacy ID (VP_ID)
        if legacy_id:
            try:
                icc_query = f"""
                SELECT COUNT(*) as cnt 
                FROM `wmt-cp-prod.ICC.NAPO_RAMP` 
                WHERE CAST(VP_ID AS STRING) = @legacy_id
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("legacy_id", "STRING", legacy_id)]
                )
                # Bill to marketplace analytics
                results = list(client.query(icc_query, job_config=job_config).result())
                if results and results[0].cnt > 0:
                    programs.append("ICC")
            except Exception as e:
                logger.warning(f"Error checking ICC program: {e}")

        # 2. Check ITS / CN Inbound using Partner ID
        try:
            # Using the table found by explorer for CN Inbound (proxy for ITS/Import)
            its_query = f"""
            SELECT COUNT(*) as cnt
            FROM `wmt-marketplace-analytics.MP_SELLER_RISK.y0d03t1_cn_inbound_allow_seller`
            WHERE CAST(partner_id AS STRING) = @pid
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("pid", "STRING", pid)]
            )
            results = list(client.query(its_query, job_config=job_config).result())
            if results and results[0].cnt > 0:
                programs.append("ITS (CN Inbound)")
        except Exception as e:
            logger.warning(f"Error checking ITS program: {e}")

        return programs

    def get_shipping_speed_distribution(self, pid: str, days_back: int = 365) -> dict:
        """
        Get shipping speed distribution for a seller from CTP.
        Returns 1–10 day buckets broken down by WFS/SFF and Sort/Nonsort.

        Args:
            pid: Seller/Partner ID
            days_back: Number of days to look back (default 365)
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        date_range_str = f"{start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}"

        # Resolve legacy ID and build target list
        legacy_id = self._resolve_legacy_id(pid)
        
        # Check for programs (ICC/ITS)
        seller_programs = self.check_seller_programs(pid, legacy_id)
        
        target_ids = {pid}
        if legacy_id and legacy_id != pid:
            target_ids.add(legacy_id)
        
        target_ids_list = list(target_ids)
        print(f"[CTP] Querying for PID: {pid} (Targets: {target_ids_list}), last {days_back} days...")

        query = f"""
        WITH ctp_filtered AS (
            SELECT
                CASE WHEN WFS_ENABLED_IND = 1 THEN 'WFS' ELSE 'SFF' END AS mp_channel,
                LOWER(COALESCE(CAST(FC_Sort_Type AS STRING), 'unknown')) AS sort_type,
                EXTRACT(MONTH FROM ORDER_DATE) AS month,
                EXTRACT(YEAR  FROM ORDER_DATE) AS year,
                LEAST(CAST(CALENDAR_DAY_Actual_TNT_final AS INT64), 10) AS speed_bucket,
                COALESCE(Total_Ordered_Units, 1) AS units
            FROM `{self.project}.{self.dataset_id}.{self.table_id}`
            WHERE
                FULFMT_TYPE = 'MP'
                AND (
                    CAST(SLR_ORG_ID AS STRING) IN UNNEST(@target_ids)
                    OR
                    SRC_SLR_ORG_CD IN UNNEST(@target_ids)
                )
                AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_back} DAY)
                AND ORDER_DATE <  CURRENT_DATE()
                AND CALENDAR_DAY_Actual_TNT_final BETWEEN 1 AND 30
                AND ACTL_DLVR_DT IS NOT NULL
        )
        SELECT
            mp_channel,
            sort_type,
            month,
            year,
            speed_bucket,
            SUM(units) AS unit_count
        FROM ctp_filtered
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY year DESC, month DESC, speed_bucket
        """

        try:
            client = self.get_client()
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ArrayQueryParameter("target_ids", "STRING", target_ids_list)
                ]
            )
            results = list(client.query(query, job_config=job_config).result())

            # --- Accumulators ---
            wfs_data, sff_data = _init_speed_dict(), _init_speed_dict()
            wfs_sort_data, wfs_nonsort_data = _init_speed_dict(), _init_speed_dict()
            sff_sort_data, sff_nonsort_data = _init_speed_dict(), _init_speed_dict()
            total_wfs = total_sff = 0.0
            monthly_data_raw: dict = {}

            for row in results:
                channel = row.mp_channel       # 'WFS' | 'SFF'
                sort_type = row.sort_type      # 'sort' | 'ns' | 'unknown'
                speed_key = f"{int(row.speed_bucket)}-day"
                month_key = datetime(int(row.year), int(row.month), 1).strftime("%b %Y")
                count = float(row.unit_count) if row.unit_count else 0.0

                if month_key not in monthly_data_raw:
                    monthly_data_raw[month_key] = _init_monthly_entry()

                md = monthly_data_raw[month_key]

                if channel == "WFS":
                    wfs_data[speed_key] += count
                    total_wfs += count
                    md["wfs"] += count
                    md["wfs_breakdown"][speed_key] += count
                    if sort_type == "sort":
                        wfs_sort_data[speed_key] += count
                        md["wfs_sort_breakdown"][speed_key] += count
                    elif sort_type == "ns":
                        wfs_nonsort_data[speed_key] += count
                        md["wfs_nonsort_breakdown"][speed_key] += count

                elif channel == "SFF":
                    sff_data[speed_key] += count
                    total_sff += count
                    md["sff"] += count
                    md["sff_breakdown"][speed_key] += count
                    if sort_type == "sort":
                        sff_sort_data[speed_key] += count
                        md["sff_sort_breakdown"][speed_key] += count
                    elif sort_type == "ns":
                        sff_nonsort_data[speed_key] += count
                        md["sff_nonsort_breakdown"][speed_key] += count

            response = {
                "pid": pid,
                "programs": seller_programs,
                "wfs_data": wfs_data,
                "sff_data": sff_data,
                "wfs_sort_data": wfs_sort_data,
                "wfs_nonsort_data": wfs_nonsort_data,
                "sff_sort_data": sff_sort_data,
                "sff_nonsort_data": sff_nonsort_data,
                "total_wfs_orders": int(total_wfs),
                "total_sff_orders": int(total_sff),
                "analysis_period": f"Last {days_back} days",
                "date_range": date_range_str,
                "monthly_data": monthly_data_raw,
            }

            if days_back >= 180:
                response["quarterly_data"] = self._generate_quarterly_breakdowns(
                    start_date, end_date, monthly_data_raw
                )

            return response

        except Exception as e:
            error_msg = f"CTP BigQuery error: {e}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            raise ValueError(error_msg) from e
