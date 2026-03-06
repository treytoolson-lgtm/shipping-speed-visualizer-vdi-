#!/bin/bash
# Startup script for Shipping Speed Visualizer

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "🐾 Shipping Speed Visualizer"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📍 Working directory: $SCRIPT_DIR"
echo ""

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "🔧 Creating Python virtual environment..."
    uv venv
    echo ""
fi

echo "✅ Activating virtual environment..."
source .venv/bin/activate

echo "📦 Installing dependencies with Walmart PyPI..."
uv pip install --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com -r requirements.txt

if [ $? -ne 0 ]; then
    echo "⚠️  Some dependencies may have failed to install, but continuing..."
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "🚀 Starting Shipping Speed Visualizer..."
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "✅ Application will be available at: http://localhost:5004/"

# Check/Set Google Cloud Project
if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    # Try to find gcloud
    GCLOUD_CMD="gcloud"
    if ! command -v gcloud &> /dev/null; then
        if [ -f "$HOME/google-cloud-sdk/bin/gcloud" ]; then
            GCLOUD_CMD="$HOME/google-cloud-sdk/bin/gcloud"
        fi
    fi

    if command -v $GCLOUD_CMD &> /dev/null; then
        CURRENT_PROJECT=$($GCLOUD_CMD config get-value project 2>/dev/null)
        if [ ! -z "$CURRENT_PROJECT" ]; then
            export GOOGLE_CLOUD_PROJECT="$CURRENT_PROJECT"
            echo "☁️  Using Google Cloud Project: $GOOGLE_CLOUD_PROJECT"
        else
            echo "⚠️  No default Google Cloud project found."
            echo "   Please set GOOGLE_CLOUD_PROJECT or run '$GCLOUD_CMD config set project YOUR_PROJECT_ID'"
        fi
    else
        echo "⚠️  gcloud CLI not found in PATH or standard location."
        echo "   Please ensure GOOGLE_CLOUD_PROJECT environment variable is set for BigQuery billing."
    fi
fi

echo "⚠️  Make sure you have BigQuery credentials configured (gcloud auth application-default login)"
echo ""
echo "Press CTRL+C to stop the server"
echo ""

.venv/bin/python main.py