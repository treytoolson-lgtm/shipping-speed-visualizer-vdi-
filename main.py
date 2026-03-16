#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shipping Speed Visualizer
Analyze WFS vs SFF shipping speeds by seller/PID
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
from pathlib import Path

from bigquery_connector import BigQueryConnector
from bigquery_category import get_l0_divisions, get_category_analysis

# Initialize FastAPI
app = FastAPI(title="Shipping Speed Visualizer")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_path = Path(__file__).parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_path), name="static")

# Initialize BigQuery connector
bq = BigQueryConnector()


class ShippingSpeedRequest(BaseModel):
    """Request model for shipping speed analysis"""
    pid: str
    period_type: str = "fytd"
    metric_type: str = "actual"
    division_filter: str = ""   # L0 category filter (empty = Total Book)


class CategoryAnalysisRequest(BaseModel):
    """Request model for category mode analysis"""
    division: str
    period_type: str = "fytd"


class ShippingSpeedAnalysis(BaseModel):
    """Response model for shipping speed analysis"""
    pid: str
    seller_name: str
    programs: list = []
    metric_label: str = "Actual Speed"
    wfs_data: dict
    sff_data: dict
    wfs_sort_data: dict = None
    wfs_nonsort_data: dict = None
    sff_sort_data: dict = None
    sff_nonsort_data: dict = None
    total_wfs_orders: int
    total_sff_orders: int
    analysis_period: str
    date_range: str
    monthly_data: dict = None
    quarterly_data: dict = None
    yearly_data: dict = None


@app.get("/")
async def index():
    """Serve the main HTML page"""
    html_path = Path(__file__).parent / "static" / "index.html"
    return FileResponse(html_path)


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "message": "Shipping Speed Visualizer is running! [Production Mode]"}


@app.post("/api/shipping-speed")
def get_shipping_speed(request: ShippingSpeedRequest):
    """
    Get shipping speed distribution for a seller (PID)
    Returns 2-10 day breakdown for WFS vs SFF
    """
    try:
        # Validate PID
        if not request.pid or not request.pid.strip():
            raise HTTPException(status_code=400, detail="PID is required")

        # Fetch data from BigQuery
        try:
            print(f"[DEBUG] Fetching data for PID: {request.pid}", flush=True)
            import sys
            sys.stderr.flush()
            analysis = bq.get_shipping_speed_distribution(
                pid=request.pid.strip(),
                period_type=request.period_type,
                metric_type=request.metric_type,
                division_filter=request.division_filter.strip(),
            )
            print(f"[DEBUG] Successfully fetched analysis data", flush=True)
        except ValueError as ve:
            error_detail = f"BigQuery error: {str(ve)}"
            print(f"[ERROR] {error_detail}", flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            raise HTTPException(
                status_code=500,
                detail=error_detail
            )
        except Exception as bq_error:
            error_msg = f"BigQuery error: {str(bq_error)}"
            print(f"[ERROR] {error_msg}", flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            raise HTTPException(
                status_code=500,
                detail=error_msg
            )

        if not analysis:
            raise HTTPException(
                status_code=404,
                detail=f"No shipping data found for PID: {request.pid}. This seller may not have orders in the selected date range."
            )

        return JSONResponse(content=analysis)

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/api/l0-divisions")
def list_l0_divisions():
    """Return all distinct L0 Divisions from CTP (for the category dropdown)."""
    try:
        divisions = get_l0_divisions()
        return JSONResponse(content={"divisions": divisions})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/category-analysis")
def run_category_analysis(request: CategoryAnalysisRequest):
    """Run all 4 category-mode analyses for the selected L0 Division."""
    if not request.division:
        raise HTTPException(status_code=400, detail="Division is required")
    try:
        result = get_category_analysis(
            division=request.division,
            period_type=request.period_type,
        )
        return JSONResponse(content=result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*80)
    print("Shipping Speed Visualizer")
    print("Production Mode (Real BigQuery)")
    print("Running on: http://localhost:5004/")
    print("="*80 + "\n")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5004,
        reload=True
    )