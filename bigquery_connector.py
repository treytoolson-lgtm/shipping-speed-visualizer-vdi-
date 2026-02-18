#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BigQuery Connector for Shipping Speed Data
Supports both real BigQuery queries and mock data for demos
"""

from google.cloud import bigquery
from datetime import datetime, timedelta
import os
import logging
import random

logger = logging.getLogger(__name__)


class BigQueryConnector:
    """Connector to fetch shipping speed data from BigQuery"""

    @staticmethod
    def get_walmart_fiscal_quarter(date: datetime) -> str:
        """Get Walmart fiscal quarter for a given date
        Walmart fiscal year starts in February
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
            # Q4 fiscal year is in the NEXT year
            if month == 1:
                year -= 1
        
        return f"{quarter} FY{year + 1}"

    def __init__(self, use_mock_data: bool = False):
        """Initialize BigQuery connector (lazy client initialization)
        
        Args:
            use_mock_data: If True, use demo data instead of BigQuery
        """
        self.client = None
        self.dataset_id = "WW_GEC_VM"
        self.table_id = "FIN_MP_PYMT_TRANS"
        self.project = "wmt-edw-prod"
        self.use_mock_data = use_mock_data

    def get_client(self):
        """Lazy initialize BigQuery client with proper authentication"""
        if self.client is None and not self.use_mock_data:
            try:
                self.client = bigquery.Client(project=self.project)
                logger.info(f"BigQuery client initialized for project: {self.project}")
            except Exception as e:
                logger.error(f"Failed to initialize BigQuery client: {str(e)}")
                logger.error(
                    "\nAuthentication required! Please one of:\n"
                    "1. Set GOOGLE_APPLICATION_CREDENTIALS to point to a service account JSON key\n"
                    "2. Use: gcloud auth application-default login (requires gcloud CLI)\n"
                )
                raise
        return self.client

    @staticmethod
    def get_walmart_fiscal_quarter(date_obj: datetime) -> str:
        """
        Get Walmart fiscal quarter for a given date.
        Walmart fiscal year: Feb 1 - Jan 31
        Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
        
        Args:
            date_obj: datetime object
            
        Returns:
            Quarter string like "Q1 FY2026"
        """
        month = date_obj.month
        year = date_obj.year
        
        # Determine fiscal year (Feb 1 onwards)
        fiscal_year = year if month >= 2 else year - 1
        
        # Determine quarter
        if 2 <= month <= 4:
            quarter = "Q1"
        elif 5 <= month <= 7:
            quarter = "Q2"
        elif 8 <= month <= 10:
            quarter = "Q3"
        else:  # 11, 12, 1
            quarter = "Q4"
        
        return f"{quarter} FY{fiscal_year}"

    def _generate_mock_data(self, days_back: int = 90) -> dict:
        """Generate realistic mock shipping data for demo purposes"""
        random.seed(42)  # Consistent seed for reproducibility
        
        wfs_data = {}
        sff_data = {}
        total_wfs = 0
        total_sff = 0
        
        # Generate realistic distribution for WFS (Walmart Fulfillment Services)
        # WFS typically has faster, more consistent delivery
        wfs_distribution = {
            "2-day": 450,
            "3-day": 1200,
            "4-day": 2100,
            "5-day": 1800,
            "6-day": 900,
            "7-day": 450,
            "8-day": 150,
            "9-day": 75,
            "10-day": 25,
        }
        
        # Generate realistic distribution for SFF (Seller Fulfills From)
        # SFF typically has longer, more variable delivery times
        sff_distribution = {
            "2-day": 50,
            "3-day": 150,
            "4-day": 300,
            "5-day": 450,
            "6-day": 600,
            "7-day": 700,
            "8-day": 550,
            "9-day": 350,
            "10-day": 250,
        }
        
        # Add some randomness
        for key in wfs_distribution:
            wfs_data[key] = max(100, wfs_distribution[key] + random.randint(-50, 50))
            total_wfs += wfs_data[key]
            
        for key in sff_distribution:
            sff_data[key] = max(10, sff_distribution[key] + random.randint(-30, 30))
            total_sff += sff_data[key]
        
        # Generate monthly data
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        monthly_data = self._generate_monthly_breakdowns(start_date, end_date)
        
        # Generate fiscal quarter data if looking back 180+ days (6 months+)
        quarterly_data = None
        if days_back >= 180:
            quarterly_data = self._generate_quarterly_breakdowns(start_date, end_date, monthly_data)
        
        result = {
            "wfs_data": wfs_data,
            "sff_data": sff_data,
            "total_wfs_orders": total_wfs,
            "total_sff_orders": total_sff,
            "monthly_data": monthly_data,
        }
        
        if quarterly_data:
            result["quarterly_data"] = quarterly_data
        
        return result
    
    def _generate_monthly_breakdowns(self, start_date: datetime, end_date: datetime) -> dict:
        """Generate monthly breakdown data with realistic variations"""
        monthly_data = {}
        current_date = start_date.replace(day=1)
        
        while current_date <= end_date:
            month_key = current_date.strftime("%b %Y")
            
            # Vary the distribution slightly by month (simulate seasonality)
            variation = random.randint(-10, 10)
            
            monthly_data[month_key] = {
                "2-day": max(20, 481 + variation),
                "3-day": max(50, 1164 + variation * 2),
                "4-day": max(100, 2053 + variation * 3),
                "5-day": max(80, 1844 + variation * 2),
                "6-day": max(40, 885 + variation),
                "7-day": max(20, 431 + variation),
                "8-day": max(10, 128),
                "9-day": max(5, 100),
                "10-day": max(5, 100),
                "wfs": 1800 + variation * 10,
                "sff": 850 + variation * 5,
            }
            
            # Move to next month
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        return monthly_data
    
    def _generate_quarterly_breakdowns(self, start_date: datetime, end_date: datetime, monthly_data: dict) -> dict:
        """Generate quarterly breakdown data by aggregating monthly data"""
        quarterly_data = {}
        current_date = start_date.replace(day=1)
        
        # Collect quarters to include
        quarters_to_include = set()
        temp_date = start_date.replace(day=1)
        while temp_date <= end_date:
            quarter = self.get_walmart_fiscal_quarter(temp_date)
            quarters_to_include.add(quarter)
            # Move to next month
            if temp_date.month == 12:
                temp_date = temp_date.replace(year=temp_date.year + 1, month=1)
            else:
                temp_date = temp_date.replace(month=temp_date.month + 1)
        
        # Initialize quarterly data
        for quarter in quarters_to_include:
            quarterly_data[quarter] = {
                "2-day": 0,
                "3-day": 0,
                "4-day": 0,
                "5-day": 0,
                "6-day": 0,
                "7-day": 0,
                "8-day": 0,
                "9-day": 0,
                "10-day": 0,
                "wfs": 0,
                "sff": 0,
            }
        
        # Aggregate monthly data by quarter
        for month_key, month_data in monthly_data.items():
            # Parse the month key (e.g., "Feb 2026")
            month_obj = datetime.strptime(month_key, "%b %Y")
            quarter = self.get_walmart_fiscal_quarter(month_obj)
            
            if quarter in quarterly_data:
                for day_range in ["2-day", "3-day", "4-day", "5-day", "6-day", "7-day", "8-day", "9-day", "10-day"]:
                    quarterly_data[quarter][day_range] += month_data.get(day_range, 0)
                quarterly_data[quarter]["wfs"] += month_data.get("wfs", 0)
                quarterly_data[quarter]["sff"] += month_data.get("sff", 0)
        
        return quarterly_data

    def get_shipping_speed_distribution(
        self,
        pid: str,
        days_back: int = 90
    ) -> dict:
        """
        Get shipping speed distribution for a seller
        Calculates delivery days for 2-day, 3-day, ... 10-day buckets
        Compares WFS vs SFF fulfillment types

        Args:
            pid: Seller/Partner ID (SLR_ORG_ID)
            days_back: Number of days to look back (default 90 = 3 months)

        Returns:
            Dictionary with shipping speed distribution
        """
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        date_range_str = f"{start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}"
        
        # Use mock data if enabled
        if self.use_mock_data:
            print(f"[DEMO MODE] Using mock data for PID: {pid}")
            mock_result = self._generate_mock_data(days_back)
            response = {
                "pid": pid,
                "wfs_data": mock_result["wfs_data"],
                "sff_data": mock_result["sff_data"],
                "total_wfs_orders": mock_result["total_wfs_orders"],
                "total_sff_orders": mock_result["total_sff_orders"],
                "analysis_period": f"Last {days_back} days (DEMO DATA)",
                "date_range": date_range_str,
            }
            if "monthly_data" in mock_result:
                response["monthly_data"] = mock_result["monthly_data"]
            if "quarterly_data" in mock_result:
                response["quarterly_data"] = mock_result["quarterly_data"]
            return response
        
        # Build query - use SLR_ORG_ID for seller filtering (not PRTNR_SRC_ORG_CD which is for partners)
        query = f"""
        WITH shipping_data AS (
            SELECT
                SLR_ORG_ID,
                FULFMT_TYPE_NM,
                ORDER_PLACED_DT,
                DLVR_TS_UTC,
                -- Calculate delivery days from order placed to delivery
                CAST(DATETIME_DIFF(DLVR_TS_UTC, DATETIME(ORDER_PLACED_DT), DAY) AS INT64) as delivery_days,
                SALES_ORDER_NUM
            FROM `{self.project}.{self.dataset_id}.{self.table_id}`
            WHERE
                CAST(SLR_ORG_ID AS STRING) = @pid
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
            
            # Use parameterized query to prevent SQL injection
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pid", "STRING", pid),
                ]
            )
            query_job = client.query(query, job_config=job_config)
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

            # Build response
            response = {
                "pid": pid,
                "wfs_data": wfs_data,
                "sff_data": sff_data,
                "total_wfs_orders": total_wfs,
                "total_sff_orders": total_sff,
                "analysis_period": f"Last {days_back} days",
                "date_range": date_range_str,
            }
            
            # Fetch quarterly data if looking at 365+ days
            if days_back >= 365:
                quarterly_data = self._get_quarterly_data(pid, days_back)
                if quarterly_data:
                    response["quarterly_data"] = quarterly_data
            
            return response

        except Exception as e:
            error_msg = f"BigQuery error: {str(e)}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            raise ValueError(error_msg) from e
    
    def _get_quarterly_data(self, pid: str, days_back: int) -> dict:
        """
        Get shipping data broken down by Walmart fiscal quarters
        Returns order counts for WFS vs SFF by quarter
        
        Args:
            pid: Seller/Partner ID
            days_back: Number of days to look back
            
        Returns:
            Dictionary with quarterly breakdown or None if error
        """
        if self.use_mock_data:
            return None  # Mock data already has quarterly data built in
        
        try:
            query = f"""
            WITH shipping_data AS (
                SELECT
                    SLR_ORG_ID,
                    FULFMT_TYPE_NM,
                    ORDER_PLACED_DT,
                    DLVR_TS_UTC
                FROM `{self.project}.{self.dataset_id}.{self.table_id}`
                WHERE
                    CAST(SLR_ORG_ID AS STRING) = @pid
                    AND ORDER_PLACED_DT >= DATE_SUB(CURRENT_DATE(), INTERVAL {days_back} DAY)
                    AND ORDER_PLACED_DT < CURRENT_DATE()
                    AND DLVR_TS_UTC IS NOT NULL
                    AND FULFMT_TYPE_NM IN ('WFS', 'SFF')
            )
            SELECT
                FULFMT_TYPE_NM,
                EXTRACT(MONTH FROM ORDER_PLACED_DT) as month,
                EXTRACT(YEAR FROM ORDER_PLACED_DT) as year,
                COUNT(*) as order_count
            FROM shipping_data
            GROUP BY FULFMT_TYPE_NM, month, year
            ORDER BY year DESC, month DESC
            """
            
            client = self.get_client()
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("pid", "STRING", pid),
                ]
            )
            query_job = client.query(query, job_config=job_config)
            results = query_job.result()
            
            # Aggregate by fiscal quarter
            quarterly_totals = {}
            
            for row in results:
                order_date = datetime(row.year, row.month, 1)
                quarter = self.get_walmart_fiscal_quarter(order_date)
                
                if quarter not in quarterly_totals:
                    quarterly_totals[quarter] = {"wfs": 0, "sff": 0}
                
                if row.FULFMT_TYPE_NM == "WFS":
                    quarterly_totals[quarter]["wfs"] += row.order_count
                elif row.FULFMT_TYPE_NM == "SFF":
                    quarterly_totals[quarter]["sff"] += row.order_count
            
            return quarterly_totals if quarterly_totals else None
            
        except Exception as e:
            logger.error(f"Error fetching quarterly data: {str(e)}")
            return None
