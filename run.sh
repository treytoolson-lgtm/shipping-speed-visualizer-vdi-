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
echo "✅ Application will be available at: http://localhost:5003/"
echo "⚠️  Make sure you have BigQuery credentials configured (gcloud auth application-default login)"
echo ""
echo "Press CTRL+C to stop the server"
echo ""

python main.py