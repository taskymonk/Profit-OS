#!/usr/bin/env python3
"""
Phase 9C/9D/9E Backend Testing
Testing 7 critical areas:
1. Shopify Txn Fee Rate (Settings)
2. Shopify Bills Code Removed (source code check)  
3. Expense Categories API
4. Enhanced Expense Creation
5. Recurring Expense Generation
6. P&L Waterfall Breakdown
7. Expense Categories Save

Base URL: http://localhost:3000/api
Real Shopify data (2049+ orders) and Meta Ads data exist
"""

import requests
import json
import os
import re
from datetime import datetime, timedelta
import pymongo
from bson import ObjectId

# Configuration
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def make_request(method, endpoint, data=None, params=None):
    """Make HTTP request with error handling"""
    try:
        url = f"{BASE_URL}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if method.upper() == 'GET':
            response = requests.get(url, params=params, headers=headers)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, headers=headers)
        elif method.upper() == 'PUT':
            response = requests.put(url, json=data, headers=headers)
        elif method.upper() == 'DELETE':
            response = requests.delete(url, headers=headers)
        
        print(f"{method} {url} -> Status: {response.status_code}")
        return response
    except Exception as e:
        print(f"Request error: {e}")
        return None

def get_mongo_client():
    """Get MongoDB client"""
    try:
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        return client, db
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return None, None

def read_source_file(file_path):
    """Read source code file for verification"""
    try:
        with open(file_path, 'r') as f:
            return f.read()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return ""

# Test tracking variables
created_test_data = []
original_shopify_rate = None

def cleanup_test_data():
    """Clean up all test data created during testing"""
    print("\n🧹 CLEANING UP TEST DATA...")
    
    try:
        # Delete test expenses
        for item in created_test_data:
            if item['type'] == 'expense':
                response = make_request('DELETE', f"/overhead-expenses/{item['id']}")
                if response and response.status_code in [200, 204]:
                    print(f"✅ Deleted test expense: {item['name']}")
                else:
                    print(f"⚠️ Failed to delete expense: {item['name']}")
        
        # Restore original Shopify txn fee rate
        if original_shopify_rate is not None:
            response = make_request('PUT', '/tenant-config', {"shopifyTxnFeeRate": original_shopify_rate})
            if response and response.status_code == 200:
                print(f"✅ Restored original shopifyTxnFeeRate: {original_shopify_rate}")
        
        created_test_data.clear()
        print("✅ Cleanup completed")
        
    except Exception as e:
        print(f"❌ Cleanup error: {e}")

def test_1_shopify_txn_fee_rate():
    """Test 1: Shopify Txn Fee Rate in Settings"""
    print("\n🎯 TEST 1: SHOPIFY TXN FEE RATE (SETTINGS)")
    global original_shopify_rate
    
    try:
        # Step 1: Get current tenant config and save original rate
        print("Step 1: Getting current tenant config...")
        response = make_request('GET', '/tenant-config')
        if not response or response.status_code != 200:
            print("❌ Failed to get tenant config")
            return False
        
        config = response.json()
        original_shopify_rate = config.get('shopifyTxnFeeRate', 2)
        print(f"✅ Current shopifyTxnFeeRate: {original_shopify_rate}")
        
        # Step 2: Update shopifyTxnFeeRate to 3%
        print("Step 2: Updating shopifyTxnFeeRate to 3%...")
        response = make_request('PUT', '/tenant-config', {"shopifyTxnFeeRate": 3})
        if not response or response.status_code != 200:
            print("❌ Failed to update shopifyTxnFeeRate")
            return False
        print("✅ shopifyTxnFeeRate updated to 3%")
        
        # Step 3: Verify dashboard calculates fees correctly
        print("Step 3: Checking dashboard P&L breakdown...")
        response = make_request('GET', '/dashboard', {'range': '7days'})
        if not response or response.status_code != 200:
            print("❌ Failed to get dashboard data")
            return False
        
        dashboard = response.json()
        pl_breakdown = dashboard.get('plBreakdown', {})
        
        # Verify Shopify fees are calculated
        shopify_txn_fee = pl_breakdown.get('shopifyTxnFee', 0)
        shopify_txn_gst = pl_breakdown.get('shopifyTxnGST', 0)
        total_revenue = pl_breakdown.get('grossRevenue', 0)
        
        print(f"   Total Revenue: ₹{total_revenue}")
        print(f"   Shopify Txn Fee (3%): ₹{shopify_txn_fee}")
        print(f"   Shopify GST (18%): ₹{shopify_txn_gst}")
        
        # Verify fee calculation: shopifyTxnFee ≈ totalRevenue * 0.03
        expected_fee = total_revenue * 0.03
        fee_diff = abs(shopify_txn_fee - expected_fee)
        
        if fee_diff < 1:  # Allow ₹1 difference for rounding
            print("✅ Shopify txn fee calculation correct")
        else:
            print(f"❌ Fee calculation mismatch. Expected: ₹{expected_fee}, Got: ₹{shopify_txn_fee}")
            return False
        
        # Verify GST: shopifyTxnGST ≈ shopifyTxnFee * 0.18
        expected_gst = shopify_txn_fee * 0.18
        gst_diff = abs(shopify_txn_gst - expected_gst)
        
        if gst_diff < 0.5:  # Allow ₹0.50 difference for rounding
            print("✅ Shopify GST calculation correct")
        else:
            print(f"❌ GST calculation mismatch. Expected: ₹{expected_gst}, Got: ₹{shopify_txn_gst}")
            return False
        
        # Step 4: Restore original rate (will be done in cleanup)
        print("✅ TEST 1 PASSED - Shopify Txn Fee Rate working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {e}")
        return False

def test_2_shopify_bills_code_removed():
    """Test 2: Shopify Bills Code Removed (source code check)"""
    print("\n🎯 TEST 2: SHOPIFY BILLS CODE REMOVED (SOURCE CODE CHECK)")
    
    try:
        # Read the route.js file
        route_file_path = "/app/app/api/[[...path]]/route.js"
        source_code = read_source_file(route_file_path)
        
        if not source_code:
            print("❌ Could not read route.js file")
            return False
        
        # List of functions that should be removed
        removed_functions = [
            'importShopifyBills',
            'getShopifyBillsSummary', 
            'parseCSV',
            'shopifyCharges',
            'getShopifyChargesForDateRange'
        ]
        
        all_removed = True
        
        for func_name in removed_functions:
            if func_name in source_code:
                print(f"❌ Found {func_name} in source code - should be removed")
                all_removed = False
            else:
                print(f"✅ {func_name} not found - correctly removed")
        
        if all_removed:
            print("✅ TEST 2 PASSED - All Shopify bills functions removed")
            return True
        else:
            print("❌ TEST 2 FAILED - Some functions still exist")
            return False
            
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {e}")
        return False

def test_3_expense_categories_api():
    """Test 3: Expense Categories API"""
    print("\n🎯 TEST 3: EXPENSE CATEGORIES API")
    
    try:
        # Get expense categories
        print("Getting expense categories...")
        response = make_request('GET', '/expense-categories')
        if not response or response.status_code != 200:
            print("❌ Failed to get expense categories")
            return False
        
        categories = response.json()
        print(f"✅ Got {len(categories)} categories")
        
        # Verify structure
        if not isinstance(categories, list):
            print("❌ Categories should be an array")
            return False
        
        # Check required categories exist
        required_categories = [
            'Platform Fees', 'Salary', 'Raw Material Purchases', 
            'Operations', 'Utilities'
        ]
        
        category_names = [cat.get('name', '') for cat in categories]
        
        for req_cat in required_categories:
            if req_cat in category_names:
                print(f"✅ Required category '{req_cat}' exists")
            else:
                print(f"❌ Required category '{req_cat}' missing")
                return False
        
        # Verify Platform Fees has required subcategories
        platform_fees = next((cat for cat in categories if cat.get('name') == 'Platform Fees'), None)
        if platform_fees:
            sub_categories = platform_fees.get('subCategories', [])
            required_subs = ['Shopify Subscription', 'Shopify App Fees']
            
            for req_sub in required_subs:
                if req_sub in sub_categories:
                    print(f"✅ Platform Fees has subcategory '{req_sub}'")
                else:
                    print(f"❌ Platform Fees missing subcategory '{req_sub}'")
                    return False
        else:
            print("❌ Platform Fees category not found")
            return False
        
        print("✅ TEST 3 PASSED - Expense Categories API working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {e}")
        return False

def test_4_enhanced_expense_creation():
    """Test 4: Enhanced Expense Creation"""
    print("\n🎯 TEST 4: ENHANCED EXPENSE CREATION")
    
    try:
        # Test 1: Create monthly recurring expense
        print("Test 4a: Creating monthly recurring expense...")
        expense_1_data = {
            "expenseName": "Shopify Plan",
            "category": "Platform Fees",
            "subCategory": "Shopify Subscription", 
            "amount": 2999,
            "gstInclusive": True,
            "frequency": "monthly",
            "totalCycles": 12,
            "infiniteCycles": False,
            "date": "2026-03-01"
        }
        
        response = make_request('POST', '/overhead-expenses', expense_1_data)
        if not response or response.status_code != 201:
            print("❌ Failed to create monthly expense")
            return False
        
        expense_1 = response.json()
        created_test_data.append({
            'type': 'expense', 
            'id': expense_1.get('_id'), 
            'name': expense_1_data['expenseName']
        })
        
        # Verify fields
        required_fields = [
            'category', 'subCategory', 'gstInclusive', 'frequency', 
            'totalCycles', 'infiniteCycles', 'currentCycle', 
            'nextGenerationDate', 'autoGenerated', 'stopped'
        ]
        
        for field in required_fields:
            if field in expense_1:
                print(f"✅ Field '{field}' present: {expense_1.get(field)}")
            else:
                print(f"❌ Field '{field}' missing")
                return False
        
        # Verify nextGenerationDate is approximately 2026-04-01
        next_gen_date = expense_1.get('nextGenerationDate', '')
        if next_gen_date.startswith('2026-04'):
            print("✅ nextGenerationDate correctly set for next month")
        else:
            print(f"❌ nextGenerationDate incorrect: {next_gen_date}")
            return False
        
        # Test 2: Create yearly infinite expense
        print("Test 4b: Creating yearly infinite expense...")
        expense_2_data = {
            "expenseName": "Yearly Insurance",
            "category": "Operations",
            "amount": 24000,
            "frequency": "yearly",
            "infiniteCycles": True,
            "date": "2026-01-01"
        }
        
        response = make_request('POST', '/overhead-expenses', expense_2_data)
        if not response or response.status_code != 201:
            print("❌ Failed to create yearly expense")
            return False
        
        expense_2 = response.json()
        created_test_data.append({
            'type': 'expense', 
            'id': expense_2.get('_id'), 
            'name': expense_2_data['expenseName']
        })
        
        # Verify infiniteCycles is true
        if expense_2.get('infiniteCycles') == True:
            print("✅ infiniteCycles correctly set to true")
        else:
            print(f"❌ infiniteCycles incorrect: {expense_2.get('infiniteCycles')}")
            return False
        
        print("✅ TEST 4 PASSED - Enhanced Expense Creation working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {e}")
        return False

def test_5_recurring_expense_generation():
    """Test 5: Recurring Expense Generation"""
    print("\n🎯 TEST 5: RECURRING EXPENSE GENERATION")
    
    try:
        # Step 1: Create a monthly recurring expense with past start date
        print("Step 1: Creating past-dated monthly expense...")
        parent_expense_data = {
            "expenseName": "Test Monthly",
            "category": "Utilities", 
            "amount": 500,
            "frequency": "monthly",
            "totalCycles": 3,
            "date": "2026-01-01"  # Past date
        }
        
        response = make_request('POST', '/overhead-expenses', parent_expense_data)
        if not response or response.status_code != 201:
            print("❌ Failed to create parent expense")
            return False
        
        parent_expense = response.json()
        parent_id = parent_expense.get('_id')
        created_test_data.append({
            'type': 'expense', 
            'id': parent_id, 
            'name': parent_expense_data['expenseName']
        })
        
        print(f"✅ Created parent expense with ID: {parent_id}")
        
        # Step 2: Trigger recurring expense generation
        print("Step 2: Triggering recurring generation...")
        response = make_request('POST', '/expense-recurring/generate', {})
        if not response or response.status_code != 200:
            print("❌ Failed to trigger generation")
            return False
        
        generation_result = response.json()
        print(f"✅ Generation result: {generation_result}")
        
        # Step 3: Verify child expenses were created
        print("Step 3: Checking for child expenses...")
        response = make_request('GET', '/overhead-expenses')
        if not response or response.status_code != 200:
            print("❌ Failed to get expenses")
            return False
        
        all_expenses = response.json()
        
        # Find child expenses (autoGenerated=true, parentExpenseId matches)
        child_expenses = [
            exp for exp in all_expenses 
            if exp.get('autoGenerated') == True and exp.get('parentExpenseId') == parent_id
        ]
        
        if len(child_expenses) > 0:
            print(f"✅ Found {len(child_expenses)} child expenses")
            
            # Add child expenses to cleanup list
            for child in child_expenses:
                created_test_data.append({
                    'type': 'expense', 
                    'id': child.get('_id'), 
                    'name': child.get('expenseName', 'Child Expense')
                })
        else:
            print("❌ No child expenses found")
            return False
        
        # Step 4: Stop the recurring series
        print("Step 4: Stopping recurring series...")
        response = make_request('POST', '/expense-recurring/stop', {"expenseId": parent_id})
        if not response or response.status_code != 200:
            print("❌ Failed to stop recurring series")
            return False
        
        print("✅ Stopped recurring series")
        
        # Step 5: Verify parent expense is marked as stopped
        print("Step 5: Verifying stopped status...")
        response = make_request('GET', f'/overhead-expenses/{parent_id}')
        if not response or response.status_code != 200:
            print("❌ Failed to get parent expense")
            return False
        
        updated_parent = response.json()
        if updated_parent.get('stopped') == True:
            print("✅ Parent expense correctly marked as stopped")
        else:
            print(f"❌ Parent expense not stopped: {updated_parent.get('stopped')}")
            return False
        
        print("✅ TEST 5 PASSED - Recurring Expense Generation working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED: {e}")
        return False

def test_6_pl_waterfall_breakdown():
    """Test 6: P&L Waterfall Breakdown"""
    print("\n🎯 TEST 6: P&L WATERFALL BREAKDOWN")
    
    try:
        # Get dashboard data with P&L breakdown
        print("Getting dashboard P&L breakdown...")
        response = make_request('GET', '/dashboard', {'range': '7days'})
        if not response or response.status_code != 200:
            print("❌ Failed to get dashboard data")
            return False
        
        dashboard = response.json()
        pl_breakdown = dashboard.get('plBreakdown', {})
        
        # Check all required 17 keys
        required_keys = [
            'grossRevenue', 'discount', 'refunds', 'gstOnRevenue', 'netRevenue',
            'totalCOGS', 'totalShipping', 'totalTxnFees', 'razorpayFee', 'razorpayTax',
            'shopifyTxnFee', 'shopifyTxnGST', 'totalShopifyFee', 'adSpend', 
            'overhead', 'overheadCategoryBreakdown', 'netProfit'
        ]
        
        missing_keys = []
        for key in required_keys:
            if key in pl_breakdown:
                print(f"✅ Key '{key}' present: {pl_breakdown.get(key)}")
            else:
                print(f"❌ Key '{key}' missing")
                missing_keys.append(key)
        
        if missing_keys:
            print(f"❌ Missing keys: {missing_keys}")
            return False
        
        # Verify overheadCategoryBreakdown is an array
        category_breakdown = pl_breakdown.get('overheadCategoryBreakdown', [])
        if isinstance(category_breakdown, list):
            print(f"✅ overheadCategoryBreakdown is array with {len(category_breakdown)} categories")
            
            # Check structure of first category if exists
            if len(category_breakdown) > 0:
                first_cat = category_breakdown[0]
                required_cat_fields = ['category', 'total', 'items']
                
                for field in required_cat_fields:
                    if field in first_cat:
                        print(f"✅ Category has field '{field}': {first_cat.get(field)}")
                    else:
                        print(f"❌ Category missing field '{field}'")
                        return False
        else:
            print("❌ overheadCategoryBreakdown is not an array")
            return False
        
        # Verify waterfall math
        print("Verifying waterfall math...")
        net_revenue = pl_breakdown.get('netRevenue', 0)
        total_cogs = pl_breakdown.get('totalCOGS', 0)
        total_shipping = pl_breakdown.get('totalShipping', 0)
        razorpay_fee = pl_breakdown.get('razorpayFee', 0)
        razorpay_tax = pl_breakdown.get('razorpayTax', 0)
        shopify_txn_fee = pl_breakdown.get('shopifyTxnFee', 0)
        shopify_txn_gst = pl_breakdown.get('shopifyTxnGST', 0)
        ad_spend = pl_breakdown.get('adSpend', 0)
        overhead = pl_breakdown.get('overhead', 0)
        net_profit = pl_breakdown.get('netProfit', 0)
        
        # Correct formula: NetRevenue - COGS - Shipping - RazorpayFees - ShopifyFees - AdSpend - Overhead
        total_razorpay = razorpay_fee + razorpay_tax
        total_shopify = shopify_txn_fee + shopify_txn_gst
        calculated_profit = net_revenue - total_cogs - total_shipping - total_razorpay - total_shopify - ad_spend - overhead
        profit_diff = abs(net_profit - calculated_profit)
        
        print(f"   Net Revenue: ₹{net_revenue}")
        print(f"   Total COGS: ₹{total_cogs}")
        print(f"   Total Shipping: ₹{total_shipping}")
        print(f"   Total Txn Fees: ₹{total_txn_fees}")
        print(f"   Total Shopify Fee: ₹{total_shopify_fee}")
        print(f"   Ad Spend: ₹{ad_spend}")
        print(f"   Overhead: ₹{overhead}")
        print(f"   Calculated Profit: ₹{calculated_profit}")
        print(f"   Actual Net Profit: ₹{net_profit}")
        print(f"   Difference: ₹{profit_diff}")
        
        if profit_diff <= 1:  # Allow ₹1 difference for rounding
            print("✅ Waterfall math verified (within ±1)")
        else:
            print("❌ Waterfall math mismatch")
            return False
        
        print("✅ TEST 6 PASSED - P&L Waterfall Breakdown working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED: {e}")
        return False

def test_7_expense_categories_save():
    """Test 7: Expense Categories Save"""
    print("\n🎯 TEST 7: EXPENSE CATEGORIES SAVE")
    
    try:
        # Step 1: Save custom category
        print("Step 1: Saving custom category...")
        custom_categories = {
            "categories": [
                {
                    "name": "TestCat",
                    "subCategories": ["Sub1", "Sub2"]
                }
            ]
        }
        
        response = make_request('POST', '/expense-categories/save', custom_categories)
        if not response or response.status_code != 200:
            print("❌ Failed to save custom categories")
            return False
        
        print("✅ Custom categories saved")
        
        # Step 2: Verify custom category exists
        print("Step 2: Verifying custom category...")
        response = make_request('GET', '/expense-categories')
        if not response or response.status_code != 200:
            print("❌ Failed to get categories")
            return False
        
        categories = response.json()
        test_cat = next((cat for cat in categories if cat.get('name') == 'TestCat'), None)
        
        if test_cat:
            print("✅ TestCat category found")
            
            sub_categories = test_cat.get('subCategories', [])
            if 'Sub1' in sub_categories and 'Sub2' in sub_categories:
                print("✅ Sub1 and Sub2 subcategories found")
            else:
                print(f"❌ Subcategories incorrect: {sub_categories}")
                return False
        else:
            print("❌ TestCat category not found")
            return False
        
        # Step 3: Restore original categories (if seed endpoint exists)
        print("Step 3: Attempting to restore original categories...")
        
        # Try seeding endpoint first
        seed_response = make_request('POST', '/expense-categories', {"action": "seed"})
        if seed_response and seed_response.status_code == 200:
            print("✅ Restored via seed endpoint")
        else:
            # Fallback: save the original required categories
            print("Falling back to manual restoration...")
            original_categories = {
                "categories": [
                    {
                        "name": "Platform Fees",
                        "subCategories": ["Shopify Subscription", "Shopify App Fees", "Payment Gateway", "Third Party Tools"]
                    },
                    {
                        "name": "Salary", 
                        "subCategories": ["Production Staff", "Management", "Contractors", "Freelancers"]
                    },
                    {
                        "name": "Raw Material Purchases",
                        "subCategories": ["Primary Ingredients", "Secondary Ingredients", "Packaging Materials", "Consumables"]
                    },
                    {
                        "name": "Operations",
                        "subCategories": ["Rent", "Insurance", "Legal & Compliance", "Equipment"]
                    },
                    {
                        "name": "Utilities",
                        "subCategories": ["Electricity", "Water", "Internet", "Phone"]
                    }
                ]
            }
            
            restore_response = make_request('POST', '/expense-categories/save', original_categories)
            if restore_response and restore_response.status_code == 200:
                print("✅ Restored original categories manually")
            else:
                print("⚠️ Could not restore original categories - manual cleanup may be needed")
        
        print("✅ TEST 7 PASSED - Expense Categories Save working correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 7 FAILED: {e}")
        return False

def main():
    """Run all Phase 9C/9D/9E tests"""
    print("🚀 STARTING PHASE 9C/9D/9E BACKEND TESTING")
    print("=" * 60)
    
    # Test results tracking
    test_results = {}
    
    try:
        # Run all tests
        test_results['test_1_shopify_txn_fee'] = test_1_shopify_txn_fee_rate()
        test_results['test_2_bills_code_removed'] = test_2_shopify_bills_code_removed()
        test_results['test_3_expense_categories'] = test_3_expense_categories_api()
        test_results['test_4_enhanced_expenses'] = test_4_enhanced_expense_creation()
        test_results['test_5_recurring_generation'] = test_5_recurring_expense_generation()
        test_results['test_6_pl_waterfall'] = test_6_pl_waterfall_breakdown()
        test_results['test_7_categories_save'] = test_7_expense_categories_save()
        
    except KeyboardInterrupt:
        print("\n⚠️ Testing interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error during testing: {e}")
    finally:
        # Always run cleanup
        cleanup_test_data()
    
    # Print final results
    print("\n" + "=" * 60)
    print("📊 FINAL TEST RESULTS")
    print("=" * 60)
    
    passed_tests = sum(1 for result in test_results.values() if result)
    total_tests = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print("-" * 60)
    print(f"SUMMARY: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 ALL TESTS PASSED - Phase 9C/9D/9E backend is fully functional!")
        return True
    else:
        print("⚠️ Some tests failed - review the output above for details")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)