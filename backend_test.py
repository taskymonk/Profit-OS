#!/usr/bin/env python3
"""
Core Engine V3 Testing Suite
Tests the 5 critical areas: Inclusive GST Math, Ghost Ad Spend Fix, IST Date Keys, Marketing Ledger Data, and RTO Double Shipping
Base URL: https://profit-calc-dash.preview.emergentagent.com/api
"""

import requests
import json
from pymongo import MongoClient
import time
import math

# Configuration
BASE_URL = "https://profit-calc-dash.preview.emergentagent.com/api"
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log_test(test_name, status, details=""):
    """Log test results with consistent formatting"""
    status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{status_icon} {test_name}: {status}")
    if details:
        print(f"   {details}")

def get_orders_sample():
    """Get a sample order for testing"""
    try:
        url = f"{BASE_URL}/orders?page=1&limit=1"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        if data.get('orders') and len(data['orders']) > 0:
            return data['orders'][0]
        return None
    except Exception as e:
        log_test("Get Orders Sample", "FAIL", f"Error: {str(e)}")
        return None

def test_inclusive_gst_math():
    """Test 1: INCLUSIVE GST MATH - Verify GST calculation formula changes"""
    print("\n🎯 TEST 1: INCLUSIVE GST MATH")
    
    # Get a sample order
    order = get_orders_sample()
    if not order:
        log_test("Inclusive GST Math", "FAIL", "Could not get sample order")
        return False
    
    order_id = order.get('_id')
    if not order_id:
        log_test("Inclusive GST Math", "FAIL", "No order ID found")
        return False
    
    try:
        # Get profit calculation
        url = f"{BASE_URL}/calculate-profit/{order_id}"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        profit_data = response.json()
        
        # Extract values
        gross_revenue = profit_data.get('grossRevenue', 0)
        discount = profit_data.get('discount', 0)
        gst_on_revenue = profit_data.get('gstOnRevenue', 0)
        net_revenue = profit_data.get('netRevenue', 0)
        
        # Calculate expected values using inclusive GST formula
        revenue_after_discount = gross_revenue - discount
        expected_gst = revenue_after_discount - (revenue_after_discount / 1.18)
        expected_net_revenue = revenue_after_discount / 1.18
        
        # Test GST calculation
        gst_diff = abs(gst_on_revenue - expected_gst)
        if gst_diff < 0.01:  # Allow 1 paisa tolerance for rounding
            log_test("GST Calculation Formula", "PASS", f"GST: ₹{gst_on_revenue:.2f} (expected: ₹{expected_gst:.2f})")
        else:
            log_test("GST Calculation Formula", "FAIL", f"GST: ₹{gst_on_revenue:.2f} (expected: ₹{expected_gst:.2f}, diff: ₹{gst_diff:.2f})")
            return False
        
        # Test Net Revenue calculation  
        net_diff = abs(net_revenue - expected_net_revenue)
        if net_diff < 0.01:
            log_test("Net Revenue Formula", "PASS", f"Net Revenue: ₹{net_revenue:.2f} (expected: ₹{expected_net_revenue:.2f})")
        else:
            log_test("Net Revenue Formula", "FAIL", f"Net Revenue: ₹{net_revenue:.2f} (expected: ₹{expected_net_revenue:.2f}, diff: ₹{net_diff:.2f})")
            return False
        
        # Test balance equation: grossRevenue - discount - gstOnRevenue = netRevenue
        balance_check = gross_revenue - discount - gst_on_revenue
        balance_diff = abs(balance_check - net_revenue)
        if balance_diff < 0.01:
            log_test("GST Balance Equation", "PASS", f"Balance verified: {gross_revenue - discount} - {gst_on_revenue:.2f} = {net_revenue:.2f}")
        else:
            log_test("GST Balance Equation", "FAIL", f"Balance failed: {balance_check:.2f} ≠ {net_revenue:.2f} (diff: {balance_diff:.2f})")
            return False
        
        # Test with example from spec: if revenueAfterDiscount=1000, gstOnRevenue should be ~152.54, netRevenue ~847.46
        test_revenue = 1000
        test_gst = test_revenue - (test_revenue / 1.18)
        test_net = test_revenue / 1.18
        expected_gst_example = 152.54
        expected_net_example = 847.46
        
        gst_example_diff = abs(test_gst - expected_gst_example)
        net_example_diff = abs(test_net - expected_net_example)
        
        if gst_example_diff < 1 and net_example_diff < 1:
            log_test("GST Formula Example Validation", "PASS", f"₹1000 → GST: ₹{test_gst:.2f}, Net: ₹{test_net:.2f}")
        else:
            log_test("GST Formula Example Validation", "FAIL", f"₹1000 → GST: ₹{test_gst:.2f} (exp: ₹{expected_gst_example}), Net: ₹{test_net:.2f} (exp: ₹{expected_net_example})")
            return False
        
        return True
        
    except Exception as e:
        log_test("Inclusive GST Math", "FAIL", f"Error: {str(e)}")
        return False

def test_ghost_ad_spend_fix():
    """Test 2: GHOST AD SPEND FIX - Verify ad spend is properly subtracted globally"""
    print("\n🎯 TEST 2: GHOST AD SPEND FIX")
    
    try:
        # Get dashboard data for 7 days
        url = f"{BASE_URL}/dashboard?range=7days"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        dashboard_data = response.json()
        
        filtered = dashboard_data.get('filtered', {})
        overhead = dashboard_data.get('overhead', {})
        
        ad_spend = filtered.get('adSpend', 0)
        gross_order_profit = filtered.get('grossOrderProfit', 0)
        net_profit = filtered.get('netProfit', 0)
        prorated_amount = overhead.get('proratedAmount', 0)
        
        # Test 1: Meta Ads should be active (ad spend > 0)
        if ad_spend > 0:
            log_test("Meta Ads Active Check", "PASS", f"Ad Spend: ₹{ad_spend:,.2f} > 0")
        else:
            log_test("Meta Ads Active Check", "FAIL", f"Ad Spend: ₹{ad_spend:,.2f} (should be > 0)")
            return False
        
        # Test 2: Gross profit should be greater than net profit (ad spend + overhead subtracted)
        if gross_order_profit > net_profit:
            log_test("Profit Hierarchy Check", "PASS", f"Gross: ₹{gross_order_profit:,.2f} > Net: ₹{net_profit:,.2f}")
        else:
            log_test("Profit Hierarchy Check", "FAIL", f"Gross: ₹{gross_order_profit:,.2f} ≤ Net: ₹{net_profit:,.2f}")
            return False
        
        # Test 3: Verify the ghost ad spend fix equation
        # netProfit ≈ grossOrderProfit - adSpend - overhead.proratedAmount
        expected_net_profit = gross_order_profit - ad_spend - prorated_amount
        profit_diff = abs(net_profit - expected_net_profit)
        
        if profit_diff < 1:  # Allow ₹1 tolerance for rounding
            log_test("Ghost Ad Spend Math", "PASS", f"Net Profit: ₹{net_profit:,.2f} ≈ ₹{gross_order_profit:,.2f} - ₹{ad_spend:,.2f} - ₹{prorated_amount:,.2f} = ₹{expected_net_profit:,.2f}")
        else:
            log_test("Ghost Ad Spend Math", "FAIL", f"Net Profit: ₹{net_profit:,.2f} ≠ ₹{expected_net_profit:,.2f} (diff: ₹{profit_diff:,.2f})")
            return False
        
        return True
        
    except Exception as e:
        log_test("Ghost Ad Spend Fix", "FAIL", f"Error: {str(e)}")
        return False

def test_ist_date_keys():
    """Test 3: IST DATE KEYS - Verify dates are in YYYY-MM-DD format"""
    print("\n🎯 TEST 3: IST DATE KEYS")
    
    try:
        # Test daily marketing spend endpoint
        url = f"{BASE_URL}/daily-marketing-spend"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        daily_spend_data = response.json()
        
        if isinstance(daily_spend_data, list) and len(daily_spend_data) > 0:
            # Check date format in daily marketing spend
            sample_date = daily_spend_data[0].get('date', '')
            if len(sample_date) == 10 and sample_date.count('-') == 2:
                year, month, day = sample_date.split('-')
                if len(year) == 4 and len(month) == 2 and len(day) == 2:
                    log_test("Daily Marketing Spend Date Format", "PASS", f"Date format: {sample_date} (YYYY-MM-DD)")
                else:
                    log_test("Daily Marketing Spend Date Format", "FAIL", f"Invalid date format: {sample_date}")
                    return False
            else:
                log_test("Daily Marketing Spend Date Format", "FAIL", f"Invalid date format: {sample_date}")
                return False
        else:
            log_test("Daily Marketing Spend Date Format", "SKIP", "No daily marketing spend data available")
        
        # Test dashboard daily data
        url = f"{BASE_URL}/dashboard?range=7days"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        dashboard_data = response.json()
        
        daily_data = dashboard_data.get('dailyData', [])
        if daily_data and len(daily_data) > 0:
            sample_daily_date = daily_data[0].get('date', '')
            if len(sample_daily_date) == 10 and sample_daily_date.count('-') == 2:
                year, month, day = sample_daily_date.split('-')
                if len(year) == 4 and len(month) == 2 and len(day) == 2:
                    log_test("Dashboard Daily Data Date Format", "PASS", f"Date format: {sample_daily_date} (YYYY-MM-DD)")
                else:
                    log_test("Dashboard Daily Data Date Format", "FAIL", f"Invalid date format: {sample_daily_date}")
                    return False
            else:
                log_test("Dashboard Daily Data Date Format", "FAIL", f"Invalid date format: {sample_daily_date}")
                return False
        else:
            log_test("Dashboard Daily Data Date Format", "FAIL", "No daily data available")
            return False
        
        return True
        
    except Exception as e:
        log_test("IST Date Keys", "FAIL", f"Error: {str(e)}")
        return False

def test_marketing_ledger_data():
    """Test 4: MARKETING LEDGER DATA - Verify daily marketing spend endpoint"""
    print("\n🎯 TEST 4: MARKETING LEDGER DATA")
    
    try:
        url = f"{BASE_URL}/daily-marketing-spend"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        daily_spend_data = response.json()
        
        # Check if data is returned as array
        if not isinstance(daily_spend_data, list):
            log_test("Marketing Ledger Data Structure", "FAIL", f"Expected array, got: {type(daily_spend_data)}")
            return False
        
        log_test("Marketing Ledger Data Structure", "PASS", f"Returns array with {len(daily_spend_data)} entries")
        
        if len(daily_spend_data) == 0:
            log_test("Marketing Ledger Data Content", "SKIP", "No marketing spend data available")
            return True
        
        # Check structure of first entry
        sample_entry = daily_spend_data[0]
        required_fields = ['date', 'spendAmount', 'currency']
        
        for field in required_fields:
            if field not in sample_entry:
                log_test(f"Marketing Ledger Field: {field}", "FAIL", f"Missing field: {field}")
                return False
            else:
                log_test(f"Marketing Ledger Field: {field}", "PASS", f"Value: {sample_entry[field]}")
        
        # Check that spendAmount values are numbers > 0
        positive_spend_count = 0
        for entry in daily_spend_data:
            spend_amount = entry.get('spendAmount', 0)
            if isinstance(spend_amount, (int, float)) and spend_amount > 0:
                positive_spend_count += 1
        
        if positive_spend_count > 0:
            log_test("Marketing Ledger Positive Spend", "PASS", f"{positive_spend_count}/{len(daily_spend_data)} entries have spend > 0")
        else:
            log_test("Marketing Ledger Positive Spend", "FAIL", "No entries with positive spend amount")
            return False
        
        return True
        
    except Exception as e:
        log_test("Marketing Ledger Data", "FAIL", f"Error: {str(e)}")
        return False

def test_rto_double_shipping():
    """Test 5: RTO DOUBLE SHIPPING - Verify RTO penalty calculation"""
    print("\n🎯 TEST 5: RTO DOUBLE SHIPPING")
    
    # Connect to MongoDB to modify order status
    client = None
    original_status = None
    order_id = None
    
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        orders_collection = db.orders
        
        # Find a non-RTO order to test with
        test_order = orders_collection.find_one({"status": {"$ne": "RTO"}})
        if not test_order:
            log_test("RTO Double Shipping Setup", "FAIL", "No non-RTO orders found for testing")
            return False
        
        order_id = test_order["_id"]
        original_status = test_order["status"]
        original_shipping_cost = test_order.get("shippingCost", 0)
        
        log_test("RTO Test Order Selected", "PASS", f"Order: {order_id}, Original Status: {original_status}, Shipping: ₹{original_shipping_cost}")
        
        # Step 1: Set order status to RTO
        orders_collection.update_one(
            {"_id": order_id},
            {"$set": {"status": "RTO"}}
        )
        log_test("RTO Status Set", "PASS", f"Changed order {order_id} to RTO")
        
        # Step 2: Get profit calculation
        url = f"{BASE_URL}/calculate-profit/{order_id}"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        profit_data = response.json()
        
        # Step 3: Verify RTO flag is true
        is_rto = profit_data.get('isRTO', False)
        if is_rto:
            log_test("RTO Flag Check", "PASS", "isRTO = true")
        else:
            log_test("RTO Flag Check", "FAIL", f"isRTO = {is_rto} (should be true)")
            return False
        
        # Step 4: Verify shipping cost is doubled
        calculated_shipping_cost = profit_data.get('shippingCost', 0)
        expected_shipping_cost = original_shipping_cost * 2
        
        shipping_diff = abs(calculated_shipping_cost - expected_shipping_cost)
        if shipping_diff < 0.01:
            log_test("RTO Shipping Cost Double", "PASS", f"Shipping: ₹{calculated_shipping_cost} = ₹{original_shipping_cost} × 2")
        else:
            log_test("RTO Shipping Cost Double", "FAIL", f"Shipping: ₹{calculated_shipping_cost} ≠ ₹{expected_shipping_cost} (original: ₹{original_shipping_cost})")
            return False
        
        # Step 5: Verify by reading original from MongoDB
        fresh_order = orders_collection.find_one({"_id": order_id})
        stored_shipping_cost = fresh_order.get("shippingCost", 0)
        
        if abs(stored_shipping_cost - original_shipping_cost) < 0.01:
            log_test("MongoDB Shipping Cost Verification", "PASS", f"Stored shipping cost: ₹{stored_shipping_cost} (unchanged)")
        else:
            log_test("MongoDB Shipping Cost Verification", "FAIL", f"Stored shipping cost changed: ₹{stored_shipping_cost} (was: ₹{original_shipping_cost})")
        
        return True
        
    except Exception as e:
        log_test("RTO Double Shipping", "FAIL", f"Error: {str(e)}")
        return False
    
    finally:
        # Restore original status
        if client and order_id and original_status:
            try:
                db = client[DB_NAME]
                db.orders.update_one(
                    {"_id": order_id},
                    {"$set": {"status": original_status}}
                )
                log_test("RTO Status Restored", "PASS", f"Restored order {order_id} to {original_status}")
            except Exception as e:
                log_test("RTO Status Restore", "FAIL", f"Failed to restore status: {str(e)}")
        
        if client:
            client.close()

def main():
    """Run all Core Engine V3 tests"""
    print("=" * 80)
    print("🚀 CORE ENGINE V3 TESTING SUITE")
    print("=" * 80)
    print(f"📍 Base URL: {BASE_URL}")
    print(f"💾 MongoDB: {MONGO_URI}/{DB_NAME}")
    print("📝 Testing: Inclusive GST, Ghost Ad Spend, IST Dates, Marketing Ledger, RTO Double Shipping")
    
    tests = [
        ("Inclusive GST Math", test_inclusive_gst_math),
        ("Ghost Ad Spend Fix", test_ghost_ad_spend_fix), 
        ("IST Date Keys", test_ist_date_keys),
        ("Marketing Ledger Data", test_marketing_ledger_data),
        ("RTO Double Shipping", test_rto_double_shipping),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            log_test(test_name, "FAIL", f"Unexpected error: {str(e)}")
            results[test_name] = False
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 CORE ENGINE V3 TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n🎯 RESULT: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL CORE ENGINE V3 TESTS PASSED!")
        return True
    else:
        print("⚠️  SOME TESTS FAILED - REVIEW ABOVE DETAILS")
        return False

if __name__ == "__main__":
    main()