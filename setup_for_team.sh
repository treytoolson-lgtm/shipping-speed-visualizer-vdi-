#!/bin/bash

# Shipping Speed Visualizer - Team Setup Script
# This script ensures you have the right access and credentials to run the tool.

echo ""
echo "📦 ════════════════════════════════════════════════════════════════════════════════ 📦"
echo "   Welcome to the Shipping Speed Visualizer Setup!"
echo "   Let's get you connected to the data."
echo "📦 ════════════════════════════════════════════════════════════════════════════════ 📦"
echo ""

# 1. Check for GCloud CLI
echo "🔍 Step 1: Checking for Google Cloud CLI..."
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: 'gcloud' CLI is not installed or not in your PATH."
    echo "   Please install the Google Cloud SDK first."
    exit 1
fi
echo "✅ GCloud CLI found."
echo ""

# 2. Check Authentication
echo "🔐 Step 2: Checking Google Cloud Authentication..."
# Try to get the current account
CURRENT_USER=$(gcloud config get-value account 2>/dev/null)

if [ -z "$CURRENT_USER" ]; then
    echo "⚠️  You are not logged in."
    echo "   Launching login process..."
    gcloud auth login
    gcloud auth application-default login
else
    echo "✅ You are logged in as: $CURRENT_USER"
    # Check for Application Default Credentials (ADC) specifically
    if [ ! -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
        echo "⚠️  Application Default Credentials not found. fixing..."
        gcloud auth application-default login
    else 
        echo "✅ Application Default Credentials found."
    fi
fi
echo ""

# 3. Check BigQuery Access (The Dry Run)
echo "🕵️  Step 3: Verifying Access to Walmart Data..."
echo "   Checking access to: wmt-marketplace-analytics.MPOA.UNIFIED_SELF_SERVICE"

# We use a python one-liner to check access because it's cleaner than parsing bq output
# We assume python3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is missing. Please install Python 3."
    exit 1
fi

# Create a temporary python script to check access
cat <<EOF > check_access.py
from google.cloud import bigquery
import sys

try:
    client = bigquery.Client(project="wmt-marketplace-analytics")
    query = "SELECT * FROM \`wmt-marketplace-analytics.MPOA.UNIFIED_SELF_SERVICE\` LIMIT 1"
    job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
    query_job = client.query(query, job_config=job_config)
    print(f"✅ Access Confirmed! Query would process {query_job.total_bytes_processed} bytes.")
    sys.exit(0)
except Exception as e:
    print(f"❌ Access Denied or Error: {e}")
    sys.exit(1)
EOF

# Ensure we have the library to run the check
# We can use the existing venv if it exists, or try global
if [ -d ".venv" ]; then
    source .venv/bin/activate
    python3 check_access.py
    ACCESS_STATUS=$?
    deactivate
else
    # Try creating a temp venv just for this check if main one doesn't exist
    echo "   (Setting up temporary check environment...)"
    uv venv .temp_check_venv > /dev/null 2>&1
    source .temp_check_venv/bin/activate > /dev/null 2>&1
    uv pip install --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com google-cloud-bigquery > /dev/null 2>&1
    python3 check_access.py
    ACCESS_STATUS=$?
    deactivate
    rm -rf .temp_check_venv
fi

rm check_access.py

echo ""
if [ $ACCESS_STATUS -ne 0 ]; then
    echo "🛑 ACCESS DENIED 🛑"
    echo "You do not have permission to query the required table."
    echo ""
    echo "👉 ACTION REQUIRED: REQUEST AD GROUP ACCESS"
    echo "   You need to be added to the AD Group: gcp-marketplace-analytics-users"
    echo ""
    echo "   Follow these exact steps:"
    echo "   1. Go to: https://walmartglobal.service-now.com/wm_sp?id=sc_cat_item_guide&sys_id=b3234c3b4fab8700e4cd49cf0310c7d7"
    echo "   2. Scroll below the table to the dropdowns."
    echo "   3. Select 'Production' -> 'Group' -> 'Modify an Existing AD Group'."
    echo "   4. Select 'One Group' -> Click 'Next'."
    echo "   5. Click 'Modify Active Directory Group Membership' to expand options."
    echo "   6. In 'Group Name', enter: gcp-marketplace-analytics-users"
    echo "      (Note: Copy the WMlink address from the description and follow those steps after this!)"
    echo "   7. In 'Choose members to add', enter YOUR Name -> Select 'Add Users'."
    echo "   8. In 'Business Justification', enter: 'Access to shipping data is essential as a WFS Account Manager.'"
    echo "   9. Click 'Next', then 'Submit'."
    echo ""
    echo "   🕒 Once approved (usually 1-24 hours), run this script again."
    exit 1
else
    echo "✅ Great! You have full access."
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "🎉 Setup Complete! You are ready to go."
echo "   Run './run.sh' to start the tool."
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
