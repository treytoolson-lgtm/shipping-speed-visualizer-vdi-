# 🐾 Shipping Speed Visualizer

A tool to visualize and analyze shipping speeds for WFS (Walmart Fulfilled) vs SFF (Seller Fulfilled) orders by seller PID over a 3-month rolling window.

## Features

✅ **Real-time Analysis**: Query BigQuery for actual shipping data
✅ **WFS vs SFF Comparison**: Side-by-side bar charts comparing fulfillment types
✅ **2-10 Day Breakdown**: Detailed distribution of shipping speeds
✅ **Interactive UI**: Clean, responsive interface with Walmart branding
✅ **Customizable Window**: Analyze 7 to 365 days of data

## Prerequisites

- Python 3.11+
- `uv` package manager (comes with Code Puppy)
- BigQuery access with credentials configured
- Access to `wmt-edw-prod.WW_GEC_VM.FIN_MP_PYMT_TRANS` table

## Setup

### 1. Set Up BigQuery Credentials

```bash
gcloud auth application-default login
```

This will authenticate your local environment to access BigQuery.

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

1. **Enter PID**: Type a seller/partner ID (e.g., `123456`)
2. **Set Analysis Window**: Choose how many days back to analyze (default: 90 days / 3 months)
3. **Click Analyze**: The tool queries BigQuery and displays results
4. **View Results**:
   - Summary stats (WFS orders, SFF orders, total orders)
   - Interactive bar chart showing order count by shipping speed
   - 2-day through 10-day delivery breakdowns

## Data Source

All data comes from:
- **Table**: `wmt-edw-prod.WW_GEC_VM.FIN_MP_PYMT_TRANS`
- **Key Columns**:
  - `PRTNR_SRC_ORG_CD`: Seller/Partner ID
  - `FULFMT_TYPE_NM`: Fulfillment type (WFS or SFF)
  - `ORDER_PLACED_DT`: Order placement date
  - `DLVR_TS_UTC`: Delivery timestamp (UTC)

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
- **Colors**: lors (Blue #0053e2, Spark #ffc220)

## Project Structure

```
shipping-speed-visualizer/
├── main.py                 # FastAPI application
├── bigquery_connector.py   # BigQuery query logic
├── requirements.txt        # Python dependencies
├── run.sh                  # Startup script
├── README.md              # This file
└── static/
    └── index.html         # Frontend UI
```

## Troubleshooting

### "No BigQuery credentials found"

```bash
gcloud auth application-default login
```

### "No shipping data found for PID"

- Verify the PID exists in the system
- Check that orders were placed within the selected date range
- Ensure the seller has both WFS and SFF order types

### Dependencies installation fails

Make sure you're using Walmart's PyPI index:

```bash
HTTP_PROXY=http://sysproxy.wal-mart.com:8080 \nHTTPS_PROXY=http://sysproxy.wal-mart.com:8080 \nuvicorn --version
```

## Performance Notes

- BigQuery queries typically complete in 5-10 seconds
- First query may be slightly slower due to table scan
- Chart rendering is instant with Chart.js

## Support

For questions or issues, reach out to your manager or the Code Puppy team.

---

**Built with 🐾 Code Puppy**