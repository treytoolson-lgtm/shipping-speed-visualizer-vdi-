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

# Initialize BigQuery connector (lazy - initializes on first query)
bq = BigQueryConnector()


class ShippingSpeedRequest(BaseModel):
    """Request model for shipping speed analysis"""
    pid: str
    days_back: int = 90  # Default 3 months


class ShippingSpeedAnalysis(BaseModel):
    """Response model for shipping speed analysis"""
    pid: str
    wfs_data: dict
    sff_data: dict
    total_wfs_orders: int
    total_sff_orders: int
    analysis_period: str


@app.get("/")
async def index():
    """Serve the main HTML page"""
    html_path = Path(__file__).parent / "static" / "index.html"
    return FileResponse(html_path)


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "message": "Shipping Speed Visualizer is running!"}


@app.post("/api/shipping-speed")
async def get_shipping_speed(request: ShippingSpeedRequest):
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
            analysis = await bq.get_shipping_speed_distribution(
                pid=request.pid.strip(),
                days_back=request.days_back
            )
        except ValueError as ve:
            print(f"BigQuery error: {str(ve)}")
            raise HTTPException(
                status_code=500,
                detail=f"BigQuery query failed. Make sure you have proper credentials (gcloud auth application-default login) and the PID exists in the data."
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
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*80)
    print("🐾 Shipping Speed Visualizer")
    print("Running on: http://localhost:5003/")
    print("="*80 + "\n")

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=5003,
        reload=False
    )