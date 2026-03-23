#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BigQuery Connector for Shipping Speed Data
Source: wmt-cp-prod.e2e_fmt_cp.CTP (Committed to Promise — order-line level)
"""

import os
import json
from pathlib import Path
from google.cloud import bigquery
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# UPDATED SPEED KEYS based on Promise Groups
SPEED_KEYS = ["1-day", "2-day", "3-day", "4-7 Day", "7+ Day"]


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
        Walmart FY starts in February (or Jan 31st for FY27).
        Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
        """
        month = date.month
        day = date.day
        year = date.year
        
        # Special case: Jan 31st is treated as start of Q1 for the new FY
        if month == 1 and day >= 31:
            return f"Q1 FY{year + 1}"

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
                # 1. Try environment variable
                project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")

                # 2. Try to find it in gcloud config if not set
                if not project_id:
                    try:
                        gcloud_config = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
                        if gcloud_config.exists():
                            with open(gcloud_config, "r") as f:
                                data = json.load(f)
                                project_id = data.get("quota_project_id")
                                if project_id:
                                    logger.info(f"Found project ID from gcloud config: {project_id}")
                    except Exception as e:
                        logger.warning(f"Could not read gcloud config: {e}")

                # 3. Fallback to wmt-marketplace-analytics
                if not project_id:
                    project_id = "wmt-marketplace-analytics"
                    logger.info(f"Using fallback project ID: {project_id}")

                # Set the project explicitly
                self.client = bigquery.Client(project=project_id)
                logger.info(f"BigQuery client initialized with billing project: {self.client.project}")
            except Exception as e:
                logger.error(f"Failed to initialize BigQuery client: {e}")
                print("\n[ERROR] Could not determine a default Google Cloud project.")
                print("Please run: gcloud config set project YOUR_PROJECT_ID")
                print("Example: gcloud config set project wmt-marketplace-analytics\n")
                raise
        return self.client

    def _resolve_legacy_id(self, pid: str) -> tuple[str, str]:
        """
        Resolve Partner ID to Legacy Seller Org ID (SLR_ORG_ID) and Seller Name.
        Returns (legacy_id, seller_name)
        """
        legacy_id = pid
        seller_name = "Unknown Seller"
        try:
            client = self.get_client()
            query = """
            SELECT legacy_id, partner_name
            FROM `wmt-marketplace-analytics.MPOA.mp_wfs_seller_mart`
            WHERE CAST(partner_id AS STRING) = @pid
            LIMIT 1
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("pid", "STRING", pid)]
            )
            results = list(client.query(query, job_config=job_config).result())
            if results:
                row = results[0]
                if row.legacy_id:
                    legacy_id = str(row.legacy_id)
                    logger.info(f"Mapped PID {pid} -> Legacy ID {legacy_id}")
                if row.partner_name:
                    seller_name = row.partner_name
                    logger.info(f"Found Seller Name: {seller_name}")
            return legacy_id, seller_name
        except Exception as e:
            logger.warning(f"Error resolving legacy ID/Name: {e}")
            return pid, "Unknown Seller"

    def _generate_yearly_breakdowns(self, start_date: datetime, end_date: datetime, monthly_data: dict) -> dict:
        """Aggregate monthly data into Walmart Fiscal Years."""
        years_to_include: set = set()
        temp = start_date.replace(day=1)
        while temp <= end_date:
            years_to_include.add(self.get_walmart_fiscal_quarter(temp).split(' ')[1]) # Extract "FYxxxx"
            temp = temp.replace(month=temp.month + 1) if temp.month < 12 else temp.replace(year=temp.year + 1, month=1)

        yearly_data = {y: _init_monthly_entry() for y in years_to_include}

        for month_key, month_data in monthly_data.items():
            month_obj = datetime.strptime(month_key, "%b %Y")
            fy = self.get_walmart_fiscal_quarter(month_obj).split(' ')[1]
            if fy not in yearly_data:
                continue
            yd = yearly_data[fy]
            yd["wfs"] += month_data["wfs"]
            yd["sff"] += month_data["sff"]
            for key in SPEED_KEYS:
                for sub in ["wfs_breakdown", "sff_breakdown",
                             "wfs_sort_breakdown", "wfs_nonsort_breakdown",
                             "sff_sort_breakdown", "sff_nonsort_breakdown"]:
                    yd[sub][key] += month_data.get(sub, {}).get(key, 0)

        return yearly_data

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
                    programs.append("ICC / ITS")
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
                programs.append("ICC / ITS (Import)")
        except Exception as e:
            logger.warning(f"Error checking ITS program: {e}")

        return programs

    def get_shipping_speed_distribution(self, pid: str, period_type: str = "fytd", metric_type: str = "actual", division_filter: str = "") -> dict:
        """
        Get shipping speed distribution for a seller from CTP.
        
        **Sort/Non-Sort Classification Enhancement (GTIN-Level)**:
        - PRIMARY SOURCE: AG_Inventory_SB_Daily.expected_item_type (GTIN-level, daily snapshot)
        - FALLBACK: CTP.Channel_Group4 (order-level, if GTIN not in inventory)
        - Rationale: GTIN-level classification is more accurate and consistent
          across all orders for the same item, while Channel_Group4 can vary
          by FC routing logic.
        
        Args:
            pid: Seller/Partner ID
            period_type: 'fytd', 'last_1_fy', 'last_2_fys'
            metric_type: 'actual' (Time in Transit) or 'promise' (Customer Promise)
            division_filter: Optional L0 Division to filter by (e.g. 'HOME')
        """
        end_date = datetime.now()
        
        # Determine column based on metric type
        # Actual: CALENDAR_DAY_Actual_TNT_final
        # Promise: CALENDAR_DAY_CTP_Post_Consolidation_final (What customer sees)
        if metric_type == "promise":
            speed_col = "CALENDAR_DAY_CTP_Post_Consolidation_final"
            metric_label = "Promise Speed"
        else:
            speed_col = "CALENDAR_DAY_Actual_TNT_final"
            metric_label = "Actual Speed"
        
        # Calculate Current Fiscal Year Start (Start on Jan 31st)
        if end_date.month >= 2:
            current_fy_start = datetime(end_date.year, 1, 31)
        else:
            current_fy_start = datetime(end_date.year - 1, 1, 31)

        if period_type == "last_2_fys":
            # Current FY + Previous 2 FYs (Go back 2 years from current FY start)
            start_date = current_fy_start.replace(year=current_fy_start.year - 2)
            display_period = "Current FY + Last 2 FYs"
        elif period_type == "last_1_fy":
            # Current FY + Previous 1 FY (Go back 1 year from current FY start)
            start_date = current_fy_start.replace(year=current_fy_start.year - 1)
            display_period = "Current FY + Last FY"
        else: # fytd
            start_date = current_fy_start
            display_period = "Fiscal Year To Date"

        # Calculate exact days back for SQL query efficiency
        days_back = (end_date - start_date).days
        
        date_range_str = f"{start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}"

        # Resolve legacy ID and get seller name
        legacy_id, seller_name = self._resolve_legacy_id(pid)
        
        # Check for programs (ICC/ITS)
        seller_programs = self.check_seller_programs(pid, legacy_id)
        
        target_ids = {pid}
        if legacy_id and legacy_id != pid:
            target_ids.add(legacy_id)
        
        target_ids_list = list(target_ids)
        print(f"[CTP] Querying for PID: {pid} ({period_type}, {metric_type}, {days_back} days) (Targets: {target_ids_list})...")

        # Determine filtering based on metric type
        # For 'actual' speed, we want delivered items.
        # For 'promise' speed (CTP), we want ALL orders (even if not delivered yet).
        delivery_filter = "AND ACTL_DLVR_DT IS NOT NULL" if metric_type == "actual" else ""
        
        # NOTE: With Promise Groups, we don't need to filter by calculated speed buckets (0-30 days)
        # We assume Promise Group is populated. If not, it falls into 'Unknown' or is excluded in aggregation.
        # So we remove the 'speed_col BETWEEN 0 AND 30' check.
        


        query = f"""
        -- GTIN-level sort/non-sort classification from AG_Inventory_SB_Daily
        -- This is the most accurate source for item type (Sortable vs Nonsort)
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
        ctp_filtered AS (
            SELECT
                -- Use Channel_Group3 for WFS/SFF split
                CASE 
                    WHEN Channel_Group3 = 'FC WFS' THEN 'WFS' 
                    ELSE 'SFF' 
                END AS mp_channel,
                
                -- PRIMARY: Use GTIN-level expected_item_type from AG_Inventory_SB_Daily
                -- FALLBACK: Channel_Group4 if GTIN lookup misses
                CASE
                    WHEN gc.expected_item_type = 'Sortable' THEN 'sort'
                    WHEN gc.expected_item_type = 'Nonsort' THEN 'ns'
                    -- Fallback to Channel_Group4 if GTIN not found in AG_Inventory_SB_Daily
                    WHEN Channel_Group4 = 'FC_WFS_Sort' THEN 'sort'
                    WHEN Channel_Group4 = 'FC_WFS_NS' THEN 'ns'
                    ELSE 'unknown'
                END AS sort_type,

                EXTRACT(MONTH FROM ORDER_DATE) AS month,
                EXTRACT(YEAR  FROM ORDER_DATE) AS year,

                -- Use Promise_Group for Speed Buckets
                -- Map 'Same Day' and 'Next Day' to '1-day'
                -- Map others directly
                CASE
                    WHEN Promise_Group IN ('Same Day', 'Next Day') THEN '1-day'
                    WHEN Promise_Group = '2 Day' THEN '2-day'
                    WHEN Promise_Group = '3 Day' THEN '3-day'
                    WHEN Promise_Group = '4-7 Day' THEN '4-7 Day'
                    WHEN Promise_Group = '7+ Day' THEN '7+ Day'
                    ELSE 'Other' -- Handle unexpected values
                END AS speed_bucket,

                COALESCE(Division, '') AS division,
                COALESCE(Total_Ordered_Units, 1) AS units,
                
                -- Debug fields to compare GTIN lookup vs Channel_Group4
                gc.expected_item_type AS gtin_item_type,
                Channel_Group4 AS channel_group4_raw
            FROM `{self.project}.{self.dataset_id}.{self.table_id}` ctp
            -- LEFT JOIN to GTIN classification (not all GTINs may be in inventory snapshot)
            LEFT JOIN gtin_classification gc ON ctp.GTIN = gc.gtin
            WHERE
                FULFMT_TYPE = 'MP'
                AND (
                    CAST(SLR_ORG_ID AS STRING) IN UNNEST(@target_ids)
                    OR
                    SRC_SLR_ORG_CD IN UNNEST(@target_ids)
                )
                AND ORDER_DATE >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_back} DAY)
                AND ORDER_DATE <= CURRENT_DATE()
                {delivery_filter}
        )
        SELECT
            mp_channel,
            sort_type,
            month,
            year,
            speed_bucket,
            division,
            SUM(units) AS unit_count,
            -- Diagnostic metrics for GTIN lookup effectiveness
            COUNTIF(gtin_item_type IS NOT NULL) AS gtin_lookup_hits,
            COUNTIF(gtin_item_type IS NULL) AS gtin_lookup_misses
        FROM ctp_filtered
        WHERE speed_bucket != 'Other'
        GROUP BY 1, 2, 3, 4, 5, 6
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

            # --- GTIN Lookup Diagnostics ---
            total_gtin_hits = sum(row.gtin_lookup_hits for row in results if hasattr(row, 'gtin_lookup_hits'))
            total_gtin_misses = sum(row.gtin_lookup_misses for row in results if hasattr(row, 'gtin_lookup_misses'))
            total_records = total_gtin_hits + total_gtin_misses
            if total_records > 0:
                gtin_coverage_pct = (total_gtin_hits / total_records) * 100
                logger.info(f"[GTIN Lookup] Coverage: {gtin_coverage_pct:.1f}% ({total_gtin_hits:,} hits / {total_gtin_misses:,} misses)")
                print(f"[GTIN Lookup] ✅ {gtin_coverage_pct:.1f}% coverage ({total_gtin_hits:,} GTINs found in AG_Inventory_SB_Daily, {total_gtin_misses:,} fell back to Channel_Group4)")
            else:
                logger.warning("[GTIN Lookup] No diagnostic data available")

            # --- Accumulators ---
            wfs_data, sff_data = _init_speed_dict(), _init_speed_dict()
            wfs_sort_data, wfs_nonsort_data = _init_speed_dict(), _init_speed_dict()
            sff_sort_data, sff_nonsort_data = _init_speed_dict(), _init_speed_dict()
            total_wfs = total_sff = 0.0
            monthly_data_raw: dict = {}
            division_data: dict = {}  # div -> per-channel speed totals

            for row in results:
                channel   = row.mp_channel
                sort_type = row.sort_type
                speed_key = row.speed_bucket
                division  = row.division or ''
                month_key = datetime(int(row.year), int(row.month), 1).strftime("%b %Y")
                count     = float(row.unit_count) if row.unit_count else 0.0

                if month_key not in monthly_data_raw:
                    monthly_data_raw[month_key] = _init_monthly_entry()

                md = monthly_data_raw[month_key]

                if speed_key not in SPEED_KEYS:
                    continue

                # Per-division accumulator (used for client-side L0 filter)
                if division and division not in division_data:
                    division_data[division] = {
                        "wfs_data":        _init_speed_dict(),
                        "sff_data":        _init_speed_dict(),
                        "wfs_sort_data":   _init_speed_dict(),
                        "wfs_nonsort_data": _init_speed_dict(),
                        "total_wfs":       0.0,
                        "total_sff":       0.0,
                    }

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
                    if division and division in division_data:
                        division_data[division]["wfs_data"][speed_key] += count
                        division_data[division]["total_wfs"] += count
                        if sort_type == "sort":
                            division_data[division]["wfs_sort_data"][speed_key] += count
                        elif sort_type == "ns":
                            division_data[division]["wfs_nonsort_data"][speed_key] += count

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
                    if division and division in division_data:
                        division_data[division]["sff_data"][speed_key] += count
                        division_data[division]["total_sff"] += count

            # Derive seller divisions from accumulated data (sorted by volume)
            seller_divisions = sorted(
                division_data.keys(),
                key=lambda d: division_data[d]["total_wfs"] + division_data[d]["total_sff"],
                reverse=True,
            )

            # Convert float totals to int for JSON serialisation
            for dd in division_data.values():
                dd["total_wfs"] = int(dd["total_wfs"])
                dd["total_sff"] = int(dd["total_sff"])

            response = {
                "pid": pid,
                "seller_name": seller_name,
                "programs": seller_programs,
                "seller_divisions": seller_divisions,
                "division_data": division_data,
                "wfs_data": wfs_data,
                "sff_data": sff_data,
                "wfs_sort_data": wfs_sort_data,
                "wfs_nonsort_data": wfs_nonsort_data,
                "sff_sort_data": sff_sort_data,
                "sff_nonsort_data": sff_nonsort_data,
                "total_wfs_orders": int(total_wfs),
                "total_sff_orders": int(total_sff),
                "analysis_period": display_period,
                "metric_label": metric_label,
                "date_range": date_range_str,
                "monthly_data": monthly_data_raw,
            }

            if monthly_data_raw:
                response["quarterly_data"] = self._generate_quarterly_breakdowns(
                    start_date, end_date, monthly_data_raw
                )
                if period_type != "fytd":
                    response["yearly_data"] = self._generate_yearly_breakdowns(
                        start_date, end_date, monthly_data_raw
                    )

            return response

        except Exception as e:
            error_msg = f"CTP BigQuery error: {e}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            raise ValueError(error_msg) from e
