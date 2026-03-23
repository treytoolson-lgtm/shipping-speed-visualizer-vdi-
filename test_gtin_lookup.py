#!/usr/bin/env python3
"""
Test script for GTIN-level sort/non-sort classification.
Verifies the AG_Inventory_SB_Daily lookup is working correctly.

Usage:
    python3 test_gtin_lookup.py [PID]
    
If no PID is provided, prompts for input.
"""

import sys
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:5004"

def test_health():
    """Test if server is running."""
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=5)
        response.raise_for_status()
        print("✅ Server is healthy:", response.json()["message"])
        return True
    except Exception as e:
        print(f"❌ Server health check failed: {e}")
        print("\nPlease start the server first:")
        print("  cd /Users/t0t0ech/Documents/Code\\ Puppy/shipping-speed-visualizer")
        print("  bash run.sh")
        return False

def test_gtin_lookup(pid: str, period_type: str = "fytd", metric_type: str = "actual"):
    """Test GTIN lookup for a specific PID."""
    print(f"\n{'='*80}")
    print(f"🔍 Testing GTIN Lookup for PID: {pid}")
    print(f"   Period: {period_type.upper()} | Metric: {metric_type.capitalize()}")
    print(f"{'='*80}\n")
    
    payload = {
        "pid": pid,
        "period_type": period_type,
        "metric_type": metric_type
    }
    
    try:
        print(f"⏳ Querying BigQuery (this may take 10-30 seconds)...\n")
        response = requests.post(
            f"{BASE_URL}/api/shipping-speed",
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"❌ Query failed (HTTP {response.status_code}):")
            print(json.dumps(response.json(), indent=2))
            return False
        
        data = response.json()
        
        # Display Results
        print("✅ Query Successful!\n")
        print(f"🏯 Seller: {data.get('seller_name', 'Unknown')} (PID: {data['pid']})")
        
        if data.get('programs'):
            print(f"🌟 Programs: {', '.join(data['programs'])}")
        
        print(f"📅 Period: {data['analysis_period']}")
        print(f"📊 Date Range: {data['date_range']}\n")
        
        # Order Totals
        total_wfs = data.get('total_wfs_orders', 0)
        total_sff = data.get('total_sff_orders', 0)
        total_orders = total_wfs + total_sff
        
        print(f"📦 Order Volume:")
        print(f"   WFS: {total_wfs:,} orders ({total_wfs/total_orders*100:.1f}%)" if total_orders > 0 else "   WFS: 0 orders")
        print(f"   SFF: {total_sff:,} orders ({total_sff/total_orders*100:.1f}%)" if total_orders > 0 else "   SFF: 0 orders")
        print(f"   TOTAL: {total_orders:,} orders\n")
        
        # Sort/Non-Sort Breakdown
        if total_wfs > 0:
            wfs_sort = data.get('wfs_sort_data', {})
            wfs_nonsort = data.get('wfs_nonsort_data', {})
            
            wfs_sort_total = sum(wfs_sort.values())
            wfs_nonsort_total = sum(wfs_nonsort.values())
            wfs_classified = wfs_sort_total + wfs_nonsort_total
            
            print(f"📦 WFS Sort/Non-Sort Classification:")
            if wfs_classified > 0:
                print(f"   Sortable:  {wfs_sort_total:,} ({wfs_sort_total/wfs_classified*100:.1f}%)")
                print(f"   Non-Sort:  {wfs_nonsort_total:,} ({wfs_nonsort_total/wfs_classified*100:.1f}%)")
                print(f"   Classified: {wfs_classified:,} / {total_wfs:,} ({wfs_classified/total_wfs*100:.1f}% coverage)\n")
            else:
                print("   ⚠️  No sort/non-sort data available\n")
        
        # Speed Distribution
        if data.get('wfs_data'):
            print("🚀 WFS Speed Distribution:")
            for speed, count in sorted(data['wfs_data'].items(), key=lambda x: x[0]):
                if count > 0:
                    pct = (count / total_wfs * 100) if total_wfs > 0 else 0
                    print(f"   {speed:8s}: {count:8,} ({pct:5.1f}%)")
            print()
        
        # Division Breakdown (if available)
        if data.get('seller_divisions'):
            top_divisions = data['seller_divisions'][:5]
            print(f"🏪 Top Divisions: {', '.join(top_divisions)}\n")
        
        print(f"{'='*80}")
        print("✅ Test Complete!")
        print(f"{'='*80}\n")
        
        # Reminder to check server logs for GTIN coverage
        print("💡 TIP: Check the server logs to see GTIN lookup coverage:")
        print("   Look for: [GTIN Lookup] ✅ X.X% coverage (...)\n")
        
        return True
        
    except requests.exceptions.Timeout:
        print("❌ Query timed out after 60 seconds")
        print("   This may indicate a BigQuery performance issue.")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("🧪 GTIN-Level Sort/Non-Sort Classification Test")
    print("="*80)
    
    # Check server health
    if not test_health():
        sys.exit(1)
    
    # Get PID from command line or prompt
    if len(sys.argv) > 1:
        pid = sys.argv[1]
    else:
        pid = input("\nEnter PID to test: ").strip()
    
    if not pid:
        print("❌ PID is required")
        sys.exit(1)
    
    # Run test
    success = test_gtin_lookup(pid)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
