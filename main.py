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
    days_back: int = 365  # Default 12 months


class ShippingSpeedAnalysis(BaseModel):
    """Response model for shipping speed analysis"""
    pid: str
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
                days_back=request.days_back
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


if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*80)
    print("🐾 Shipping Speed Visualizer")
    print("⚙️ Production Mode (Real BigQuery)")
    print("Running on: http://localhost:5003/")
    print("="*80 + "\n")

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=5003,
        reload=True
    )