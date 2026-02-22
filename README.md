# 🐾 Shipping Speed Visualizer

A tool to visualize and analyze shipping speeds for WFS (Walmart Fulfilled) vs SFF (Seller Fulfilled) orders by seller PID.

## Features

✅ **Real-time Analysis**: Query BigQuery for actual shipping data from the CTP (Committed to Promise) table
✅ **WFS vs SFF Comparison**: Side-by-side bar charts comparing fulfillment types
✅ **Granular Breakdowns**: 1-10 day delivery speed distribution
✅ **Sort vs Non-Sort**: Toggle to see WFS sortation breakdowns
✅ **Program Detection**: Badges for ICC (Internal Consolidation) and ITS (Import) sellers
✅ **Interactive UI**: Clean, responsive interface with Walmart branding
✅ **Historical Views**: 12, 18, or 24-month rolling windows with Quarterly and Monthly drill-downs

## Prerequisites

- Python 3.11+
- `uv` package manager (comes with Code Puppy)
- BigQuery access (see below)

## 🔐 Access Requirements

To use this tool, you need two types of access: **Reader** (to see the data) and **Job User** (to run the query).

### 1. Data Access (Reader)
**Required Group:** `gcp-cp-prod-reader`
*   Grants read access to the shipping data (`wmt-cp-prod`).
*   **[Request here](https://walmartglobal.service-now.com/wm_sp?id=sc_cat_item_guide&sys_id=222d77a3db8a634832af7f698c9619dc)**

### 2. Query Access (Billing)
**Required Group:** `gcp-marketplace-analytics-users`
*   Allows you to *execute* queries in the analytics project (`wmt-marketplace-analytics`).
*   *Note: If you already have query access through another team project (e.g., WFS Analytics), that may also work.*

## Setup

### 1. Set Up BigQuery Credentials

```bash
gcloud auth application-default login
```

This authenticates your local environment to access BigQuery.

### 2. Install Dependencies

Run the startup script (recommended):

```bash
bash run.sh
```

Or manually:

```bash
uv venv
source .venv/bin/activate
uv pip install --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com -r requirements.txt
```

## Running the Application

### Option 1: Using the startup script (Recommended)

```bash
bash run.sh
```

### Option 2: Manual startup

```bash
source .venv/bin/activate
python main.py
```

The application will be available at: **http://localhost:5003/**

## Usage

1. **Enter PID**: Type a seller/partner ID (e.g., `10001025026`)
2. **Set Analysis Window**: Choose 12, 18, or 24 months
3. **Click Analyze**: The tool queries BigQuery and displays results
4. **View Results**:
   - Summary stats (WFS Units, SFF Units, Total Units)
   - Sort/Non-Sort Toggle (WFS only)
   - Program Indicators (ICC / ITS)
   - Interactive bar charts for Overall, Quarterly, and Monthly views

## Data Source

All data comes from:
- **Table**: `wmt-cp-prod.e2e_fmt_cp.CTP`
- **Key Columns**:
  - `SLR_ORG_ID` / `SRC_SLR_ORG_CD`: Seller/Partner ID
  - `FULFMT_TYPE`: 'MP' (Marketplace)
  - `WFS_ENABLED_IND`: Distinguishes WFS vs SFF
  - `CALENDAR_DAY_Actual_TNT_final`: Actual transit days
  - `FC_Sort_Type`: Sort vs Non-Sort classification (WFS only)

## Architecture

### Backend
- **Framework**: FastAPI
- **Database**: Google BigQuery
- **Port**: 5003
- **Key Endpoint**: `POST /api/shipping-speed`

### Frontend
- **Template**: HTML + Tailwind CSS
- **Charts**: Chart.js
- **Interactivity**: Vanilla JavaScript (fetch API)
- **Colors**: Walmart Brand Colors (Blue #0053e2, Spark #ffc220)

## Project Structure

```
shipping-speed-visualizer/
├── main.py                 # FastAPI application
├── bigquery_connector.py   # BigQuery query logic
├── requirements.txt        # Python dependencies
├── run.sh                  # Startup script
├── README.md              # This file
└── static/
    ├── index.html         # Frontend UI structure
    └── app.js             # Frontend logic & charts
```

## Troubleshooting

### "No BigQuery credentials found"

```bash
gcloud auth application-default login
```

### "Access Denied: wmt-cp-prod"

Ensure you have joined `gcp-cp-prod-reader`.

### "Access Denied: wmt-marketplace-analytics"

Ensure you have joined `gcp-marketplace-analytics-users` to run queries.

### "No shipping data found for PID"

- Verify the PID exists in the system
- Try checking if the PID is a Legacy ID vs Partner ID (the tool checks both, but verify your input)
- Ensure the seller had orders in the selected date range

## Support

For questions or issues, reach out to your manager or the Code Puppy team.

---

**Built with 🐾 Code Puppy**
