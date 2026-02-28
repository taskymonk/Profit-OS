#!/usr/bin/env python3
"""
Phase 8.8 "The Absolute Parity Patch" - Backend Testing
Tests 5 critical areas:
1. BULLETPROOF PAGINATION (source code check)
2. STRICT ACCOUNTING PARITY (Cancelled/Voided/Pending filter)
3. TIMEZONE DOUBLE-SHIFT FIX (source code check) 
4. DASHBOARD DATA INTEGRITY POST-FILTER
5. AD SPEND TAX STILL WORKS
"""

import json
import os
import requests
import sys
from pymongo import MongoClient
from datetime import datetime

# Get base URL from environment  
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def print_test_result(test_name, success, details=""):
    """Print formatted test result"""
    status = "✅ PASSED" if success else "❌ FAILED"
    print(f"[{test_name}] {status} - {details}")

def test_area_1_bulletproof_pagination():
    """Test Area 1: BULLETPROOF PAGINATION (source code check)"""
    print("\n🎯 TESTING AREA 1: BULLETPROOF PAGINATION (source code check)")
    
    try:
        # Read the route.js file to check Shopify pagination
        route_file_path = "/app/app/api/[[...path]]/route.js"
        
        with open(route_file_path, 'r') as f:
            route_content = f.read()
        
        # Find the Shopify pagination section
        print_test_result("Route file access", True, "Successfully read route.js")
        
        # Check 1: Link header is SPLIT by comma before regex matching
        has_link_split = 'linkHeader.split(\',\')' in route_content or 'links = linkHeader.split(\',\')' in route_content
        print_test_result("Link header split by comma", has_link_split,
                         "linkHeader.split(',') found" if has_link_split else "Missing comma split logic")
        
        # Check 2: Each individual link entry matched with regex for rel="next"
        has_individual_match = '/<([^>]+)>;\s*rel="next"/' in route_content
        print_test_result("Individual link regex match", has_individual_match,
                         "/<([^>]+)>;\\s*rel=\"next\"/ pattern found" if has_individual_match else "Missing individual link match")
        
        # Check 3: Loop through splits and breaks after finding rel="next"
        has_loop_break = ('for (const link of links)' in route_content or 'for (const link of linkHeader.split' in route_content) and 'break' in route_content
        print_test_result("Loop with break logic", has_loop_break,
                         "Loop through splits with break found" if has_loop_break else "Missing loop/break logic")
        
        # Check 4: Does NOT just match against full concatenated header
        # This is implicit - if it splits and loops, it's not matching the full string
        avoids_full_match = has_link_split and has_loop_break
        print_test_result("Avoids full header match", avoids_full_match,
                         "Properly splits before matching" if avoids_full_match else "May be matching full header")
        
    except Exception as e:
        print_test_result("Area 1 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 1 COMPLETE: Bulletproof Pagination source code checked")

def test_area_2_strict_accounting_parity():
    """Test Area 2: STRICT ACCOUNTING PARITY (Cancelled/Voided/Pending filter)"""
    print("\n🎯 TESTING AREA 2: STRICT ACCOUNTING PARITY")
    
    try:
        # Check profitCalculator.js for EXCLUDED_STATUSES
        profit_calc_path = "/app/lib/profitCalculator.js"
        
        with open(profit_calc_path, 'r') as f:
            calc_content = f.read()
        
        # Check 1: EXCLUDED_STATUSES array exists
        has_excluded_statuses = 'EXCLUDED_STATUSES' in calc_content
        print_test_result("Has EXCLUDED_STATUSES", has_excluded_statuses,
                         "EXCLUDED_STATUSES array found" if has_excluded_statuses else "Missing EXCLUDED_STATUSES")
        
        # Check 2: Contains required statuses
        has_cancelled = "'Cancelled'" in calc_content or '"Cancelled"' in calc_content
        has_voided = "'Voided'" in calc_content or '"Voided"' in calc_content  
        has_pending = "'Pending'" in calc_content or '"Pending"' in calc_content
        
        print_test_result("Has required statuses", has_cancelled and has_voided and has_pending,
                         f"Cancelled: {has_cancelled}, Voided: {has_voided}, Pending: {has_pending}")
        
        # Check 3: accountingOrders created by filtering
        has_accounting_orders = 'accountingOrders' in calc_content and 'filter' in calc_content
        print_test_result("Has accountingOrders filter", has_accounting_orders,
                         "accountingOrders filtering found" if has_accounting_orders else "Missing accountingOrders")
        
        # Check 4: totalOrders uses accountingOrders.length
        has_accounting_total = 'totalOrders' in calc_content and 'accountingOrders.length' in calc_content
        print_test_result("totalOrders from accountingOrders", has_accounting_total,
                         "totalOrders = accountingOrders.length found" if has_accounting_total else "Wrong totalOrders source")
        
        # Check 5: Revenue sums accountingOrders
        has_accounting_revenue = 'accountingOrders' in calc_content and ('reduce' in calc_content or 'forEach' in calc_content)
        print_test_result("Revenue from accountingOrders", has_accounting_revenue,
                         "Revenue calculation from accountingOrders" if has_accounting_revenue else "Wrong revenue source")
        
        # Check 6: grossOrderProfits maps over accountingOrders
        has_accounting_profits = 'grossOrderProfits' in calc_content and 'accountingOrders.map' in calc_content
        print_test_result("Profits from accountingOrders", has_accounting_profits,
                         "grossOrderProfits from accountingOrders" if has_accounting_profits else "Wrong profits source")
        
        # Check 7: orderProfits still maps ALL filteredOrders (for table)
        has_filtered_table = 'orderProfits' in calc_content and 'filteredOrders.map' in calc_content
        print_test_result("Table from all filteredOrders", has_filtered_table,
                         "orderProfits from filteredOrders for table" if has_filtered_table else "Wrong table source")
        
        # Test API: Check dashboard has cancelledCount
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "alltime"})
        print_test_result("Dashboard API call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            dashboard_data = response.json()
            has_cancelled_count = 'cancelledCount' in dashboard_data.get('filtered', {})
            cancelled_count = dashboard_data.get('filtered', {}).get('cancelledCount', 0)
            print_test_result("Dashboard has cancelledCount", has_cancelled_count,
                             f"cancelledCount: {cancelled_count}")
        
        # Test MongoDB: Count cancelled orders
        try:
            client = MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            cancelled_orders_db = db.orders.count_documents({'status': 'Cancelled'})
            total_orders_db = db.orders.count_documents({})
            
            print_test_result("MongoDB cancelled count", True, 
                             f"Cancelled: {cancelled_orders_db}, Total: {total_orders_db}")
            
            # If cancelled orders exist, dashboard totalOrders should be less than total in DB
            if cancelled_orders_db > 0 and response.status_code == 200:
                dashboard_total = dashboard_data.get('filtered', {}).get('totalOrders', 0)
                total_less_than_db = dashboard_total < total_orders_db
                print_test_result("Dashboard excludes cancelled", total_less_than_db,
                                 f"Dashboard: {dashboard_total} < DB: {total_orders_db}")
            
            client.close()
            
        except Exception as mongo_e:
            print_test_result("MongoDB check", False, f"MongoDB error: {str(mongo_e)}")
    
    except Exception as e:
        print_test_result("Area 2 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 2 COMPLETE: Strict Accounting Parity checked")

def test_area_3_timezone_double_shift_fix():
    """Test Area 3: TIMEZONE DOUBLE-SHIFT FIX (source code check)"""
    print("\n🎯 TESTING AREA 3: TIMEZONE DOUBLE-SHIFT FIX")
    
    try:
        # Read the route.js file to check Shopify date mapping
        route_file_path = "/app/app/api/[[...path]]/route.js"
        
        with open(route_file_path, 'r') as f:
            route_content = f.read()
        
        # Check 1: Find Shopify date mapping section
        has_shopify_date = 'shopifyDateRaw' in route_content or 'shopifyDate' in route_content
        print_test_result("Has Shopify date handling", has_shopify_date,
                         "Shopify date variables found" if has_shopify_date else "No Shopify date handling")
        
        # Check 2: Does NOT call toISTISO on Shopify date
        has_no_toistiso_call = 'toISTISO(shopify' not in route_content
        print_test_result("No toISTISO on Shopify date", has_no_toistiso_call,
                         "No toISTISO call on Shopify date" if has_no_toistiso_call else "Found toISTISO on Shopify date")
        
        # Check 3: Uses new Date().toISOString() directly
        has_direct_iso = 'new Date(shopifyDateRaw).toISOString()' in route_content or 'new Date(' in route_content and '.toISOString()' in route_content
        print_test_result("Direct ISO conversion", has_direct_iso,
                         "Direct new Date().toISOString() found" if has_direct_iso else "Missing direct ISO conversion")
        
        # Check 4: Comment mentions no artificial IST shift or double-shift
        has_comment = ('no artificial IST shift' in route_content or 
                      'double-shift' in route_content or 
                      'Direct parsing' in route_content)
        print_test_result("Has explanatory comment", has_comment,
                         "Comment about IST/double-shift found" if has_comment else "Missing explanatory comment")
        
    except Exception as e:
        print_test_result("Area 3 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 3 COMPLETE: Timezone Double-Shift Fix checked")

def test_area_4_dashboard_data_integrity():
    """Test Area 4: DASHBOARD DATA INTEGRITY POST-FILTER"""
    print("\n🎯 TESTING AREA 4: DASHBOARD DATA INTEGRITY POST-FILTER")
    
    try:
        # Test with alltime range for comprehensive data
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "alltime"})
        print_test_result("Dashboard alltime call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            dashboard_data = response.json()
            
            # Check required sections exist
            if 'plBreakdown' not in dashboard_data or 'filtered' not in dashboard_data:
                print_test_result("Dashboard structure", False, "Missing plBreakdown or filtered section")
                return
            
            pl_breakdown = dashboard_data['plBreakdown']
            filtered = dashboard_data['filtered']
            
            # Test a: plBreakdown.grossRevenue == filtered.revenue (exact match)
            pl_revenue = pl_breakdown.get('grossRevenue', 0)
            filtered_revenue = filtered.get('revenue', 0)
            revenue_exact = pl_revenue == filtered_revenue
            print_test_result("Revenue exact match", revenue_exact,
                            f"plBreakdown: {pl_revenue}, filtered: {filtered_revenue}")
            
            # Test b: plBreakdown.netProfit == filtered.netProfit (exact match)  
            pl_net_profit = pl_breakdown.get('netProfit', 0)
            filtered_net_profit = filtered.get('netProfit', 0)
            profit_exact = pl_net_profit == filtered_net_profit
            print_test_result("Net profit exact match", profit_exact,
                            f"plBreakdown: {pl_net_profit}, filtered: {filtered_net_profit}")
            
            # Test c: Waterfall math within ±1
            # netProfit ≈ netRevenue - totalCOGS - totalShipping - totalTxnFees - adSpend - overhead
            net_revenue = pl_breakdown.get('netRevenue', 0)
            total_cogs = pl_breakdown.get('totalCOGS', 0)
            total_shipping = pl_breakdown.get('totalShipping', 0)
            total_txn_fees = pl_breakdown.get('totalTxnFees', 0)
            ad_spend = pl_breakdown.get('adSpend', 0)
            overhead = pl_breakdown.get('overhead', 0)
            
            calculated_profit = net_revenue - total_cogs - total_shipping - total_txn_fees - ad_spend - overhead
            actual_profit = pl_breakdown.get('netProfit', 0)
            
            waterfall_diff = abs(calculated_profit - actual_profit)
            waterfall_correct = waterfall_diff <= 1  # Within ±1
            
            print_test_result("Waterfall math (±1)", waterfall_correct,
                            f"Calc: {calculated_profit:.2f}, Actual: {actual_profit:.2f}, Diff: {waterfall_diff:.2f}")
            
            # Test d: totalOrders > 0
            total_orders = filtered.get('totalOrders', 0)
            orders_positive = total_orders > 0
            print_test_result("Total orders > 0", orders_positive,
                            f"totalOrders: {total_orders}")
            
    except Exception as e:
        print_test_result("Area 4 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 4 COMPLETE: Dashboard Data Integrity checked")

def test_area_5_ad_spend_tax_works():
    """Test Area 5: AD SPEND TAX STILL WORKS"""
    print("\n🎯 TESTING AREA 5: AD SPEND TAX STILL WORKS")
    
    try:
        # Get dashboard ad spend
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "alltime"})
        print_test_result("Dashboard call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return
        
        dashboard_data = response.json()
        filtered = dashboard_data.get('filtered', {})
        dashboard_ad_spend = filtered.get('adSpend', 0)
        
        print_test_result("Dashboard ad spend", dashboard_ad_spend >= 0, 
                         f"Ad spend: ₹{dashboard_ad_spend:.2f}")
        
        # Connect to MongoDB to get raw data
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Get raw ad spend from dailyMarketingSpend collection
        daily_spends = list(db.dailyMarketingSpend.find({}))
        raw_ad_total = sum(spend.get('spendAmount', 0) for spend in daily_spends)
        
        print_test_result("Raw ad spend from MongoDB", raw_ad_total >= 0,
                         f"Raw total: ₹{raw_ad_total:.2f}")
        
        # Get tenant config for ad spend tax rate
        tenant_config = db.tenantConfig.find_one({})
        ad_spend_tax_rate = 18  # Default
        if tenant_config and 'adSpendTaxRate' in tenant_config:
            ad_spend_tax_rate = tenant_config['adSpendTaxRate']
        
        print_test_result("Ad spend tax rate", True, f"Tax rate: {ad_spend_tax_rate}%")
        
        # Calculate expected dashboard ad spend with tax
        expected_ad_spend = raw_ad_total * (1 + ad_spend_tax_rate / 100)
        
        # Verify calculation (allowing small rounding differences)
        if expected_ad_spend > 0:
            ad_spend_diff = abs(dashboard_ad_spend - expected_ad_spend)
            ad_spend_diff_percent = (ad_spend_diff / expected_ad_spend * 100)
            
            tax_calc_correct = ad_spend_diff_percent < 1.0  # Less than 1% difference
            
            print_test_result("Tax calculation accuracy", tax_calc_correct,
                             f"Expected: ₹{expected_ad_spend:.2f}, Got: ₹{dashboard_ad_spend:.2f}, " +
                             f"Diff: {ad_spend_diff:.2f} ({ad_spend_diff_percent:.1f}%)")
        else:
            print_test_result("Tax calculation (no ads)", dashboard_ad_spend == 0,
                             "No ad spend data, dashboard correctly shows 0")
        
        client.close()
    
    except Exception as e:
        print_test_result("Area 5 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 5 COMPLETE: Ad Spend Tax verified")

def main():
    """Run all Phase 8.8 backend tests"""
    print("🎉 PHASE 8.8 'THE ABSOLUTE PARITY PATCH' - BACKEND TESTING")
    print(f"Base URL: {BASE_URL}")
    print("Real Shopify data (1962+ orders incl. cancelled) and Meta Ads data expected")
    print("=" * 80)
    
    # Run all 5 test areas for Phase 8.8
    test_area_1_bulletproof_pagination()
    test_area_2_strict_accounting_parity()
    test_area_3_timezone_double_shift_fix()
    test_area_4_dashboard_data_integrity()
    test_area_5_ad_spend_tax_works()
    
    print("\n" + "=" * 80)
    print("🎉 PHASE 8.8 'THE ABSOLUTE PARITY PATCH' BACKEND TESTING COMPLETE!")
    print("All 5 critical areas tested: Bulletproof Pagination, Strict Accounting, Timezone Fix, Data Integrity, Ad Tax")

if __name__ == "__main__":
    main()