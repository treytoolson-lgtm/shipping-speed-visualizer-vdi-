# 🐾 Shipping Speed Visualizer - Setup & Access Guide

## ✅ Current Status

**Demo Mode is ACTIVE!** 🎬  
The app is running with realistic mock data so you can see the full functionality.

**Server Running On:** http://localhost:5003/

---

## 🔗 BigQuery Access Request

When you're ready to use **real production data**, you'll need to request access to the `wmt-edw-prod` BigQuery project.

### 📋 Main Documentation
**[Access to Datasets/Tables in wmt-edw-prod](https://confluence.walmart.com/pages/viewpage.action?pageId=3070433988)**

### 🔑 ServiceNow Access Request (Most Common)
**[Request gcp-prod-ww-reader Access](https://walmartglobal.service-now.com/wm_sp?id=ticket&table=sc_req_item&sys_id=9223f8c4974cb690a6f33fb71153afe5)**

This will grant you read access to production BigQuery datasets including `wmt-edw-prod`.

### 📝 Steps to Request Access
1. Click the ServiceNow link above
2. Fill out the access request form
3. In "Business Justification" mention you need read access to:
   - Dataset: `WW_GEC_VM`
   - Table: `FIN_MP_PYMT_TRANS`
   - For shipping speed analysis
4. Submit and wait for approval (usually 1-2 business days)

---

## 🎬 Demo vs Production Mode

### Switching Modes

Edit `/Users/t0t0ech/Documents/shipping-speed-visualizer/main.py` line ~27:

**DEMO MODE (Current):**
```python
bq = BigQueryConnector(use_mock_data=True)  # Uses realistic mock data
```

**PRODUCTION MODE (After BigQuery Access):**
```python
bq = BigQueryConnector(use_mock_data=False)  # Queries real wmt-edw-prod data
```

Then restart the server with Ctrl+C and run:
```bash
cd /Users/t0t0ech/Documents/shipping-speed-visualizer
source .venv/bin/activate
python main.py
```

---

## 🏗️ Tech Stack

- **Backend:** FastAPI (Python)
- **Database:** Google BigQuery (wmt-edw-prod)
- **Frontend:** HTML5 + Chart.js
- **Styling:** Tailwind CSS
- **Data Structure:**
  - **WFS**: Walmart Fulfillment Services (faster delivery)
  - **SFF**: Seller Fulfills From (variable delivery times)

---

## 📊 Data Analyzed

For each seller (PID), you get:
- **Order Count Distribution** by delivery speed (2-10 days)
- **WFS vs SFF Comparison**
- **Total Orders** in the analysis period
- **Analysis Period** (customizable, default 90 days)

---

## 🐛 Troubleshooting

### Server won't start on port 5003
```bash
# Kill any process using port 5003
lsof -i :5003 | tail -n +2 | awk '{print $2}' | xargs kill -9
```

### Getting "BigQuery permission denied" error
Your user account doesn't have the right permissions yet. This is expected until BigQuery access is approved.

### Charts not showing
Make sure you have an internet connection for Chart.js library (loaded from CDN).

---

## 📚 API Endpoints

### Health Check
```bash
GET /api/health
```

### Shipping Speed Analysis
```bash
POST /api/shipping-speed
Content-Type: application/json

{
  "pid": "10000002874",
  "days_back": 90
}
```

**Response:**
```json
{
  "pid": "10000002874",
  "wfs_data": { "2-day": 481, "3-day": 1164, ... },
  "sff_data": { "2-day": 26, "3-day": 163, ... },
  "total_wfs_orders": 7186,
  "total_sff_orders": 3388,
  "analysis_period": "Last 90 days (DEMO DATA)"
}
```

---

## 🎯 Next Steps

1. ✅ **Test the demo** at http://localhost:5003/
2. 📋 **Request BigQuery access** using the ServiceNow link
3. 🔄 **Switch to production mode** once access is approved
4. 📊 **Analyze real seller shipping data!**

---

## 🐶 Created by Dave
Your loyal code puppy! 🐕
