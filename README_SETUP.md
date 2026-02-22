# 🐾 Shipping Speed Visualizer - Setup & Access Guide

## ✅ Current Status

**Production Mode is ACTIVE!** ⚙️  
The app queries live data from `wmt-cp-prod`.

**Server Running On:** http://localhost:5003/

---

## 🔐 BigQuery Access Requirements

To use this tool, you need two specific AD groups: one to **see** the data, and one to **run** the query.

### 1. Data Access (Reader)
**Group:** `gcp-cp-prod-reader`
*   **Purpose:** Allows you to read the shipping data tables (`wmt-cp-prod`).
*   **[Request Access Here](https://walmartglobal.service-now.com/wm_sp?id=sc_cat_item_guide&sys_id=222d77a3db8a634832af7f698c9619dc)**

### 2. Query Access (Job User)
**Group:** `gcp-marketplace-analytics-users`
*   **Purpose:** Allows you to execute queries in the analytics project (`wmt-marketplace-analytics`).
*   **Request via:** Modify Group in ServiceNow.

*Note: You do NOT need to request special SEC Insider Trading clearance for the data access (`gcp-cp-prod-reader`).*

---

## 🏗️ Tech Stack

- **Backend:** FastAPI (Python)
- **Database:** Google BigQuery (`wmt-cp-prod.e2e_fmt_cp.CTP`)
- **Frontend:** HTML5 + Chart.js
- **Styling:** Tailwind CSS (Walmart Brand Colors)

---

## 📊 Data Analyzed

For each seller (PID), you get:
- **Unit Count Distribution** by actual transit days (1-10 days)
- **WFS vs SFF Comparison**
- **Sort vs Non-Sort Breakdown** (WFS Only)
- **Fiscal Year Grouping** for monthly and quarterly trends
- **Program Indicators** for ICC and ITS participation

---

## 🐛 Troubleshooting

### Server won't start on port 5003
```bash
# Kill any process using port 5003
lsof -i :5003 | tail -n +2 | awk '{print $2}' | xargs kill -9
```

### Getting "BigQuery permission denied" error
Check which permission is missing:
- If it mentions `wmt-cp-prod`, you need `gcp-cp-prod-reader`.
- If it mentions `wmt-marketplace-analytics`, you need `gcp-marketplace-analytics-users`.

### "No Data" for a PID
- The tool checks both `SLR_ORG_ID` (Legacy) and `SRC_SLR_ORG_CD` (Partner ID).
- Ensure the seller has valid marketplace (`MP`) orders in the last 12-24 months.

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
  "pid": "10001025026",
  "days_back": 365
}
```

---

## 🐶 Created by Dave
Your loyal code puppy! 🐕
