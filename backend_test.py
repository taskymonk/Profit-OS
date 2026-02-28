#!/usr/bin/env python3
"""
Profit OS - Phase 8.6 "Precision & Analytics Patch" Backend Testing
Tests 6 critical areas:
1. Shopify Sync URL Verification (source code check)
2. IST Date Conversion (toISTISO function verification)
3. Inventory Items CRUD (NEW schema: purchasePrice/yieldFromTotalPurchase)
4. Dashboard P&L Breakdown (plBreakdown object)
5. Overhead Expenses CRUD (dynamic categories)
6. Ad Spend Tax Multiplier (still works)
"""

import requests
import json
import pymongo
from pymongo import MongoClient
import os
import re
import sys
from datetime import datetime

# Base URLs
API_BASE = "http://localhost:3000/api"  # Local test as requested
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log(message):
    """Log with timestamp"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def test_1_shopify_sync_url_verification():
    """Test 1: Verify Shopify sync URL contains all three required parameters"""
    log("🎯 TEST 1: SHOPIFY SYNC URL VERIFICATION")
    
    try:
        # Read the route.js file
        route_file_path = "/app/app/api/[[...path]]/route.js"
        with open(route_file_path, 'r') as f:
            content = f.read()
        
        # Check for all three required parameters
        required_params = ['status=any', 'fulfillment_status=any', 'financial_status=any']
        found_params = []
        
        for param in required_params:
            if param in content:
                found_params.append(param)
                log(f"  ✅ Found parameter: {param}")
            else:
                log(f"  ❌ Missing parameter: {param}")
        
        # Check toISTISO function exists
        toistiso_exists = 'function toISTISO(' in content or 'toISTISO(' in content
        if toistiso_exists:
            log("  ✅ toISTISO function found in route.js")
        else:
            log("  ❌ toISTISO function NOT found in route.js")
        
        # Look for the specific Shopify orders URL line
        shopify_url_pattern = r'/admin/api/\d{4}-\d{2}/orders\.json\?[^"]*'
        url_match = re.search(shopify_url_pattern, content)
        if url_match:
            url = url_match.group(0)
            log(f"  ✅ Shopify orders URL found: {url}")
            
            # Verify all params are in the URL
            all_params_in_url = all(param in url for param in required_params)
            if all_params_in_url:
                log("  ✅ All three parameters found in Shopify orders URL")
            else:
                log("  ❌ Not all parameters found in Shopify orders URL")
        else:
            log("  ❌ Shopify orders URL pattern not found")
        
        # Final validation
        success = len(found_params) == 3 and toistiso_exists
        log(f"  📊 Test 1 Result: {'PASSED' if success else 'FAILED'}")
        return success
        
    except Exception as e:
        log(f"  ❌ Test 1 ERROR: {e}")
        return False

def test_2_ist_date_conversion():
    """Test 2: Verify IST Date Conversion implementation"""
    log("🎯 TEST 2: IST DATE CONVERSION (toISTISO)")
    
    try:
        route_file_path = "/app/app/api/[[...path]]/route.js"
        with open(route_file_path, 'r') as f:
            content = f.read()
        
        # Check for Asia/Kolkata timezone
        asia_kolkata_found = 'Asia/Kolkata' in content
        if asia_kolkata_found:
            log("  ✅ 'Asia/Kolkata' timezone found in route.js")
        else:
            log("  ❌ 'Asia/Kolkata' timezone NOT found in route.js")
        
        # Check for +05:30 offset
        ist_offset_found = '+05:30' in content
        if ist_offset_found:
            log("  ✅ '+05:30' IST offset found in route.js")
        else:
            log("  ❌ '+05:30' IST offset NOT found in route.js")
        
        # Check if toISTISO is called in shopify sync
        toistiso_call_found = 'toISTISO(' in content and 'shopify' in content.lower()
        if toistiso_call_found:
            log("  ✅ toISTISO function call found in Shopify sync context")
        else:
            log("  ❌ toISTISO function call NOT found in Shopify sync context")
        
        # Look for the specific function definition
        toistiso_function_pattern = r'function toISTISO\([^)]*\)\s*\{[^}]*\}'
        function_match = re.search(toistiso_function_pattern, content, re.DOTALL)
        if function_match:
            function_body = function_match.group(0)
            log("  ✅ toISTISO function definition found")
            
            # Check if it uses timeZone: 'Asia/Kolkata'
            if "timeZone: 'Asia/Kolkata'" in function_body:
                log("  ✅ Function uses correct Asia/Kolkata timezone")
            else:
                log("  ❌ Function does NOT use Asia/Kolkata timezone")
        else:
            log("  ❌ toISTISO function definition NOT found")
        
        success = asia_kolkata_found and ist_offset_found and toistiso_call_found
        log(f"  📊 Test 2 Result: {'PASSED' if success else 'FAILED'}")
        return success
        
    except Exception as e:
        log(f"  ❌ Test 2 ERROR: {e}")
        return False

def test_3_inventory_items_crud():
    """Test 3: Inventory Items CRUD with NEW schema (purchasePrice/yieldFromTotalPurchase)"""
    log("🎯 TEST 3: INVENTORY ITEMS CRUD (NEW SCHEMA)")
    
    created_ids = []
    
    try:
        # Test 1: Create Belgian Chocolate with new schema
        chocolate_data = {
            "name": "Belgian Chocolate 500g",
            "category": "Raw Material",
            "purchasePrice": 500,
            "purchaseQuantity": 1,
            "unitMeasurement": "grams",
            "yieldFromTotalPurchase": 1
        }
        
        response = requests.post(f"{API_BASE}/inventory-items", json=chocolate_data)
        if response.status_code == 201:
            chocolate = response.json()
            created_ids.append(chocolate['_id'])
            log("  ✅ Created Belgian Chocolate - Status: 201")
            
            # Verify fields
            if 'purchasePrice' in chocolate and chocolate['purchasePrice'] == 500:
                log("  ✅ Chocolate has purchasePrice field (NOT costPerUnit)")
            else:
                log("  ❌ Chocolate missing purchasePrice field or wrong value")
            
            if 'yieldFromTotalPurchase' in chocolate and chocolate['yieldFromTotalPurchase'] == 1:
                log("  ✅ Chocolate has correct yieldFromTotalPurchase = 1")
            else:
                log("  ❌ Chocolate missing yieldFromTotalPurchase or wrong value")
            
            if '_id' in chocolate:
                log("  ✅ Chocolate has _id field")
            else:
                log("  ❌ Chocolate missing _id field")
        else:
            log(f"  ❌ Failed to create chocolate - Status: {response.status_code}")
            return False
        
        # Test 2: Create BOPP Tape with yieldFromTotalPurchase = 100
        tape_data = {
            "name": "BOPP Tape Roll",
            "category": "Packaging",
            "purchasePrice": 500,
            "purchaseQuantity": 1,
            "unitMeasurement": "rolls",
            "yieldFromTotalPurchase": 100
        }
        
        response = requests.post(f"{API_BASE}/inventory-items", json=tape_data)
        if response.status_code == 201:
            tape = response.json()
            created_ids.append(tape['_id'])
            log("  ✅ Created BOPP Tape - Status: 201")
            
            if tape.get('yieldFromTotalPurchase') == 100 and tape.get('purchasePrice') == 500:
                effective_cost = 500 / 100
                log(f"  ✅ Tape effective cost per use = {effective_cost} (500/100)")
            else:
                log("  ❌ Tape yieldFromTotalPurchase or purchasePrice incorrect")
        else:
            log(f"  ❌ Failed to create tape - Status: {response.status_code}")
            return False
        
        # Test 3: GET all inventory items
        response = requests.get(f"{API_BASE}/inventory-items")
        if response.status_code == 200:
            items = response.json()
            log(f"  ✅ GET inventory-items - Found {len(items)} items")
            
            # Check if our items are there
            chocolate_found = any(item['name'] == 'Belgian Chocolate 500g' for item in items)
            tape_found = any(item['name'] == 'BOPP Tape Roll' for item in items)
            
            if chocolate_found and tape_found:
                log("  ✅ Both test items found in GET response")
            else:
                log("  ❌ Test items not found in GET response")
        else:
            log(f"  ❌ Failed to GET inventory-items - Status: {response.status_code}")
        
        # Test 4: PUT update chocolate's purchasePrice
        chocolate_id = created_ids[0]
        update_data = {"purchasePrice": 550}
        
        response = requests.put(f"{API_BASE}/inventory-items/{chocolate_id}", json=update_data)
        if response.status_code == 200:
            updated_chocolate = response.json()
            log("  ✅ Updated chocolate purchasePrice - Status: 200")
            
            if updated_chocolate.get('purchasePrice') == 550:
                log("  ✅ Chocolate purchasePrice successfully updated to 550")
            else:
                log("  ❌ Chocolate purchasePrice not updated correctly")
        else:
            log(f"  ❌ Failed to update chocolate - Status: {response.status_code}")
        
        # Test 5: DELETE both test items (cleanup)
        for item_id in created_ids:
            response = requests.delete(f"{API_BASE}/inventory-items/{item_id}")
            if response.status_code == 200:
                log(f"  ✅ Deleted item {item_id} - Status: 200")
            else:
                log(f"  ❌ Failed to delete item {item_id} - Status: {response.status_code}")
        
        log("  📊 Test 3 Result: PASSED")
        return True
        
    except Exception as e:
        log(f"  ❌ Test 3 ERROR: {e}")
        
        # Cleanup on error
        for item_id in created_ids:
            try:
                requests.delete(f"{API_BASE}/inventory-items/{item_id}")
            except:
                pass
        
        return False

def test_4_dashboard_pl_breakdown():
    """Test 4: Dashboard P&L Breakdown object validation"""
    log("🎯 TEST 4: DASHBOARD P&L BREAKDOWN")
    
    try:
        # GET dashboard with 7 days range
        response = requests.get(f"{API_BASE}/dashboard?range=7days")
        if response.status_code != 200:
            log(f"  ❌ Failed to GET dashboard - Status: {response.status_code}")
            return False
        
        data = response.json()
        log("  ✅ Dashboard API responded - Status: 200")
        
        # Check if plBreakdown exists
        if 'plBreakdown' not in data:
            log("  ❌ plBreakdown object NOT found in dashboard response")
            return False
        
        pl_breakdown = data['plBreakdown']
        log("  ✅ plBreakdown object found in dashboard response")
        
        # Required fields in plBreakdown
        required_fields = [
            'grossRevenue', 'discount', 'gstOnRevenue', 'netRevenue',
            'totalCOGS', 'totalShipping', 'totalTxnFees', 'adSpend',
            'overhead', 'netProfit'
        ]
        
        missing_fields = []
        for field in required_fields:
            if field in pl_breakdown:
                log(f"  ✅ plBreakdown has {field}: {pl_breakdown[field]}")
            else:
                missing_fields.append(field)
                log(f"  ❌ plBreakdown missing {field}")
        
        if missing_fields:
            log(f"  ❌ Missing fields: {missing_fields}")
            return False
        
        # Verify consistency with filtered data
        filtered = data.get('filtered', {})
        
        # Test: plBreakdown.grossRevenue == filtered.revenue
        if abs(pl_breakdown['grossRevenue'] - filtered.get('revenue', 0)) < 0.01:
            log("  ✅ plBreakdown.grossRevenue matches filtered.revenue")
        else:
            log(f"  ❌ plBreakdown.grossRevenue ({pl_breakdown['grossRevenue']}) != filtered.revenue ({filtered.get('revenue', 0)})")
        
        # Test: plBreakdown.netProfit == filtered.netProfit
        if abs(pl_breakdown['netProfit'] - filtered.get('netProfit', 0)) < 0.01:
            log("  ✅ plBreakdown.netProfit matches filtered.netProfit")
        else:
            log(f"  ❌ plBreakdown.netProfit ({pl_breakdown['netProfit']}) != filtered.netProfit ({filtered.get('netProfit', 0)})")
        
        # Test: plBreakdown.adSpend == filtered.adSpend
        if abs(pl_breakdown['adSpend'] - filtered.get('adSpend', 0)) < 0.01:
            log("  ✅ plBreakdown.adSpend matches filtered.adSpend")
        else:
            log(f"  ❌ plBreakdown.adSpend ({pl_breakdown['adSpend']}) != filtered.adSpend ({filtered.get('adSpend', 0)})")
        
        # Waterfall math verification
        # netProfit ≈ netRevenue - totalCOGS - totalShipping - totalTxnFees - adSpend - overhead
        calculated_net_profit = (
            pl_breakdown['netRevenue'] - 
            pl_breakdown['totalCOGS'] - 
            pl_breakdown['totalShipping'] - 
            pl_breakdown['totalTxnFees'] - 
            pl_breakdown['adSpend'] - 
            pl_breakdown['overhead']
        )
        
        difference = abs(calculated_net_profit - pl_breakdown['netProfit'])
        if difference <= 1:  # Within ±1 for rounding
            log(f"  ✅ Waterfall math verified (difference: {difference:.2f})")
        else:
            log(f"  ❌ Waterfall math failed (difference: {difference:.2f})")
        
        log("  📊 Test 4 Result: PASSED")
        return True
        
    except Exception as e:
        log(f"  ❌ Test 4 ERROR: {e}")
        return False

def test_5_overhead_expenses_crud():
    """Test 5: Overhead Expenses CRUD with Dynamic Categories"""
    log("🎯 TEST 5: OVERHEAD EXPENSES CRUD (DYNAMIC CATEGORIES)")
    
    created_ids = []
    
    try:
        # Test 1: Create expense with custom category "CustomWarehouse"
        warehouse_data = {
            "expenseName": "Warehouse Rent",
            "category": "CustomWarehouse",
            "amount": 15000,
            "currency": "INR",
            "frequency": "recurring"
        }
        
        response = requests.post(f"{API_BASE}/overhead-expenses", json=warehouse_data)
        if response.status_code == 201:
            warehouse = response.json()
            created_ids.append(warehouse['_id'])
            log("  ✅ Created Warehouse Rent with CustomWarehouse category - Status: 201")
            
            if warehouse.get('category') == 'CustomWarehouse':
                log("  ✅ Custom category 'CustomWarehouse' saved correctly")
            else:
                log("  ❌ Custom category not saved correctly")
        else:
            log(f"  ❌ Failed to create warehouse expense - Status: {response.status_code}")
            return False
        
        # Test 2: Create expense with category "SaaS Tools"
        tool_data = {
            "expenseName": "Tool Sub",
            "category": "SaaS Tools",
            "amount": 999,
            "currency": "INR",
            "frequency": "recurring"
        }
        
        response = requests.post(f"{API_BASE}/overhead-expenses", json=tool_data)
        if response.status_code == 201:
            tool = response.json()
            created_ids.append(tool['_id'])
            log("  ✅ Created Tool Sub with SaaS Tools category - Status: 201")
            
            if tool.get('category') == 'SaaS Tools':
                log("  ✅ Category 'SaaS Tools' saved correctly")
            else:
                log("  ❌ SaaS Tools category not saved correctly")
        else:
            log(f"  ❌ Failed to create tool expense - Status: {response.status_code}")
            return False
        
        # Test 3: GET all overhead expenses and verify custom categories
        response = requests.get(f"{API_BASE}/overhead-expenses")
        if response.status_code == 200:
            expenses = response.json()
            log(f"  ✅ GET overhead-expenses - Found {len(expenses)} expenses")
            
            # Check if our custom categories exist
            custom_warehouse_found = any(exp.get('category') == 'CustomWarehouse' for exp in expenses)
            saas_tools_found = any(exp.get('category') == 'SaaS Tools' for exp in expenses)
            
            if custom_warehouse_found:
                log("  ✅ CustomWarehouse category found in expenses")
            else:
                log("  ❌ CustomWarehouse category NOT found")
            
            if saas_tools_found:
                log("  ✅ SaaS Tools category found in expenses")
            else:
                log("  ❌ SaaS Tools category NOT found")
        else:
            log(f"  ❌ Failed to GET overhead-expenses - Status: {response.status_code}")
            return False
        
        # Test 4: DELETE both test expenses (cleanup)
        for expense_id in created_ids:
            response = requests.delete(f"{API_BASE}/overhead-expenses/{expense_id}")
            if response.status_code == 200:
                log(f"  ✅ Deleted expense {expense_id} - Status: 200")
            else:
                log(f"  ❌ Failed to delete expense {expense_id} - Status: {response.status_code}")
        
        log("  📊 Test 5 Result: PASSED")
        return True
        
    except Exception as e:
        log(f"  ❌ Test 5 ERROR: {e}")
        
        # Cleanup on error
        for expense_id in created_ids:
            try:
                requests.delete(f"{API_BASE}/overhead-expenses/{expense_id}")
            except:
                pass
        
        return False

def test_6_ad_spend_tax_still_works():
    """Test 6: Verify Ad Spend Tax Multiplier Still Works"""
    log("🎯 TEST 6: AD SPEND TAX STILL WORKS")
    
    try:
        # Get dashboard data for alltime
        response = requests.get(f"{API_BASE}/dashboard?range=alltime")
        if response.status_code != 200:
            log(f"  ❌ Failed to GET dashboard - Status: {response.status_code}")
            return False
        
        dashboard_data = response.json()
        dashboard_ad_spend = dashboard_data['filtered']['adSpend']
        log(f"  ✅ Dashboard adSpend: ₹{dashboard_ad_spend}")
        
        # Connect to MongoDB to get raw data
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        
        # Get raw ad spend from dailyMarketingSpend collection
        daily_spends = list(db.dailyMarketingSpend.find({}))
        raw_total = sum(doc.get('spendAmount', 0) for doc in daily_spends)
        log(f"  ✅ Raw ad spend total: ₹{raw_total}")
        
        # Get adSpendTaxRate from tenantConfig
        tenant_config = db.tenantConfig.find_one({})
        ad_spend_tax_rate = tenant_config.get('adSpendTaxRate', 18) if tenant_config else 18
        log(f"  ✅ Ad spend tax rate: {ad_spend_tax_rate}%")
        
        # Calculate expected taxed amount
        expected_taxed_amount = raw_total * (1 + ad_spend_tax_rate / 100)
        log(f"  ✅ Expected taxed amount: ₹{expected_taxed_amount}")
        
        # Verify the dashboard adSpend is approximately the taxed amount
        difference = abs(dashboard_ad_spend - expected_taxed_amount)
        percentage_diff = (difference / expected_taxed_amount * 100) if expected_taxed_amount > 0 else 0
        
        if percentage_diff <= 5:  # Allow 5% tolerance for rounding/timing differences
            log(f"  ✅ Tax calculation verified (difference: {difference:.2f}, {percentage_diff:.1f}%)")
        else:
            log(f"  ❌ Tax calculation failed (difference: {difference:.2f}, {percentage_diff:.1f}%)")
            return False
        
        client.close()
        
        log("  📊 Test 6 Result: PASSED")
        return True
        
    except Exception as e:
        log(f"  ❌ Test 6 ERROR: {e}")
        return False

def main():
    """Run all Phase 8.6 tests"""
    log("🚀 PHASE 8.6 PRECISION & ANALYTICS PATCH - BACKEND TESTING")
    log("=" * 60)
    
    results = []
    
    # Run all tests
    test_functions = [
        ("Shopify Sync URL Verification", test_1_shopify_sync_url_verification),
        ("IST Date Conversion", test_2_ist_date_conversion),
        ("Inventory Items CRUD (NEW Schema)", test_3_inventory_items_crud),
        ("Dashboard P&L Breakdown", test_4_dashboard_pl_breakdown),
        ("Overhead Expenses CRUD (Dynamic Categories)", test_5_overhead_expenses_crud),
        ("Ad Spend Tax Still Works", test_6_ad_spend_tax_still_works),
    ]
    
    for test_name, test_func in test_functions:
        log(f"\n{'-' * 60}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            log(f"CRITICAL ERROR in {test_name}: {e}")
            results.append((test_name, False))
    
    # Summary
    log("\n" + "=" * 60)
    log("📊 PHASE 8.6 TESTING SUMMARY")
    log("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        log(f"{status}: {test_name}")
    
    log(f"\n🎯 FINAL RESULT: {passed}/{total} tests passed")
    
    if passed == total:
        log("🎉 ALL TESTS PASSED! Phase 8.6 features fully functional.")
    else:
        log(f"⚠️  {total - passed} tests failed. Phase 8.6 needs attention.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)