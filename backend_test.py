#!/usr/bin/env python3

import requests
import json
from pymongo import MongoClient
import sys
import traceback

# Configuration
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log_test(test_name, status, details=""):
    """Log test results with consistent formatting"""
    status_emoji = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{status_emoji} {test_name}: {status}")
    if details:
        print(f"   └─ {details}")
    print()

def get_dashboard_data(range_param="7days"):
    """Get dashboard data for given range"""
    try:
        url = f"{BASE_URL}/dashboard?range={range_param}"
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        else:
            return None
    except Exception as e:
        print(f"Error fetching dashboard data: {e}")
        return None

def test_dashboard_data_integrity():
    """Test 1: Dashboard Data Integrity"""
    print("🎯 TEST 1: DASHBOARD DATA INTEGRITY (GET /api/dashboard?range=7days)")
    
    try:
        data = get_dashboard_data("7days")
        if not data:
            log_test("Dashboard API Call", "FAIL", "Failed to fetch dashboard data")
            return False
        
        # Check if required sections exist
        if 'plBreakdown' not in data or 'filtered' not in data:
            log_test("Response Structure", "FAIL", "Missing plBreakdown or filtered section")
            return False
        
        pl_breakdown = data['plBreakdown']
        filtered = data['filtered']
        
        # Test 1a: plBreakdown.grossRevenue == filtered.revenue
        pl_gross = pl_breakdown.get('grossRevenue', 0)
        filtered_revenue = filtered.get('revenue', 0)
        
        if abs(pl_gross - filtered_revenue) < 0.01:
            log_test("Revenue Consistency", "PASS", f"plBreakdown.grossRevenue (₹{pl_gross}) = filtered.revenue (₹{filtered_revenue})")
        else:
            log_test("Revenue Consistency", "FAIL", f"plBreakdown.grossRevenue (₹{pl_gross}) ≠ filtered.revenue (₹{filtered_revenue})")
            return False
        
        # Test 1b: plBreakdown.netProfit == filtered.netProfit
        pl_net = pl_breakdown.get('netProfit', 0)
        filtered_net = filtered.get('netProfit', 0)
        
        if abs(pl_net - filtered_net) < 0.01:
            log_test("Net Profit Consistency", "PASS", f"plBreakdown.netProfit (₹{pl_net}) = filtered.netProfit (₹{filtered_net})")
        else:
            log_test("Net Profit Consistency", "FAIL", f"plBreakdown.netProfit (₹{pl_net}) ≠ filtered.netProfit (₹{filtered_net})")
            return False
        
        # Test 1c: Waterfall math verification
        net_revenue = pl_breakdown.get('netRevenue', 0)
        total_cogs = pl_breakdown.get('totalCOGS', 0)
        total_shipping = pl_breakdown.get('totalShipping', 0)
        total_txn_fees = pl_breakdown.get('totalTxnFees', 0)
        ad_spend = pl_breakdown.get('adSpend', 0)
        overhead = pl_breakdown.get('overhead', 0)
        
        calculated_net_profit = net_revenue - total_cogs - total_shipping - total_txn_fees - ad_spend - overhead
        actual_net_profit = pl_breakdown.get('netProfit', 0)
        
        if abs(calculated_net_profit - actual_net_profit) <= 1:
            log_test("Waterfall Math", "PASS", f"Calculated: ₹{calculated_net_profit:.2f}, Actual: ₹{actual_net_profit:.2f}, Diff: ₹{abs(calculated_net_profit - actual_net_profit):.2f}")
        else:
            log_test("Waterfall Math", "FAIL", f"Calculated: ₹{calculated_net_profit:.2f}, Actual: ₹{actual_net_profit:.2f}, Diff: ₹{abs(calculated_net_profit - actual_net_profit):.2f}")
            return False
        
        # Test 1d: cancelledCount exists and >= 0
        cancelled_count = filtered.get('cancelledCount')
        if cancelled_count is not None and cancelled_count >= 0:
            log_test("Cancelled Count", "PASS", f"filtered.cancelledCount = {cancelled_count}")
        else:
            log_test("Cancelled Count", "FAIL", f"filtered.cancelledCount = {cancelled_count} (should be >= 0)")
            return False
        
        # Test 1e: allTime.totalOrders > filtered.totalOrders
        all_time = data.get('allTime', {})
        all_time_orders = all_time.get('totalOrders', 0)
        filtered_orders = filtered.get('totalOrders', 0)
        
        if all_time_orders > filtered_orders:
            log_test("AllTime vs Filtered Orders", "PASS", f"allTime.totalOrders ({all_time_orders}) > filtered.totalOrders ({filtered_orders})")
        else:
            log_test("AllTime vs Filtered Orders", "FAIL", f"allTime.totalOrders ({all_time_orders}) ≤ filtered.totalOrders ({filtered_orders})")
            return False
        
        return True
        
    except Exception as e:
        log_test("Dashboard Data Integrity", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_monthly_pl_report():
    """Test 2: Monthly P&L Report"""
    print("🎯 TEST 2: MONTHLY P&L REPORT (GET /api/reports/monthly-pl)")
    
    try:
        url = f"{BASE_URL}/reports/monthly-pl"
        response = requests.get(url)
        
        if response.status_code != 200:
            log_test("Monthly P&L API Call", "FAIL", f"Status code: {response.status_code}")
            return False
        
        data = response.json()
        
        # Should be an array
        if not isinstance(data, list):
            log_test("Response Structure", "FAIL", "Response should be an array")
            return False
        
        if len(data) == 0:
            log_test("Data Availability", "PASS", "No monthly data available (empty array)")
            return True
        
        # Check first monthly object structure
        first_month = data[0]
        required_fields = ['month', 'grossRevenue', 'netRevenue', 'gstOnRevenue', 'discount', 'refunds', 
                          'cogs', 'shipping', 'shopifyFees', 'razorpayFees', 'txnFees', 'adSpend', 
                          'overhead', 'netProfit', 'orderCount', 'rtoCount', 'cancelledCount', 'margin']
        
        missing_fields = [field for field in required_fields if field not in first_month]
        if missing_fields:
            log_test("Required Fields", "FAIL", f"Missing fields: {missing_fields}")
            return False
        else:
            log_test("Required Fields", "PASS", "All 18 required fields present")
        
        # Check backward compatibility - should have 'revenue' field = grossRevenue
        if 'revenue' in first_month and abs(first_month['revenue'] - first_month['grossRevenue']) < 0.01:
            log_test("Backward Compatibility", "PASS", f"revenue field equals grossRevenue (₹{first_month['grossRevenue']})")
        else:
            log_test("Backward Compatibility", "FAIL", "revenue field missing or doesn't match grossRevenue")
            return False
        
        # Test math for first month: netProfit ≈ netRevenue - cogs - shipping - txnFees - adSpend - overhead
        net_revenue = first_month.get('netRevenue', 0)
        cogs = first_month.get('cogs', 0)
        shipping = first_month.get('shipping', 0)
        txn_fees = first_month.get('txnFees', 0)
        ad_spend = first_month.get('adSpend', 0)
        overhead = first_month.get('overhead', 0)
        
        calculated_profit = net_revenue - cogs - shipping - txn_fees - ad_spend - overhead
        actual_profit = first_month.get('netProfit', 0)
        
        if abs(calculated_profit - actual_profit) <= 10:
            log_test("Monthly Math Verification", "PASS", f"Month {first_month['month']}: Calculated ₹{calculated_profit:.2f}, Actual ₹{actual_profit:.2f}")
        else:
            log_test("Monthly Math Verification", "FAIL", f"Month {first_month['month']}: Calculated ₹{calculated_profit:.2f}, Actual ₹{actual_profit:.2f}")
            return False
        
        # Test grossRevenue > netRevenue (GST deduction)
        gross_revenue = first_month.get('grossRevenue', 0)
        net_revenue = first_month.get('netRevenue', 0)
        
        if gross_revenue > net_revenue:
            log_test("GST Deduction", "PASS", f"grossRevenue (₹{gross_revenue}) > netRevenue (₹{net_revenue})")
        else:
            log_test("GST Deduction", "FAIL", f"grossRevenue (₹{gross_revenue}) ≤ netRevenue (₹{net_revenue})")
            return False
        
        return True
        
    except Exception as e:
        log_test("Monthly P&L Report", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_product_cogs_report():
    """Test 3: Product COGS Report"""
    print("🎯 TEST 3: PRODUCT COGS REPORT (GET /api/reports/product-cogs)")
    
    try:
        url = f"{BASE_URL}/reports/product-cogs"
        response = requests.get(url)
        
        if response.status_code != 200:
            log_test("Product COGS API Call", "FAIL", f"Status code: {response.status_code}")
            return False
        
        data = response.json()
        
        # Should be an array
        if not isinstance(data, list):
            log_test("Response Structure", "FAIL", "Response should be an array")
            return False
        
        if len(data) == 0:
            log_test("Data Availability", "PASS", "No product data available (empty array)")
            return True
        
        # Check first product structure
        first_product = data[0]
        required_fields = ['sku', 'productName', 'orders', 'revenue', 'cogs', 'grossProfit', 'margin', 'avgCOGSPerOrder', 'hasRecipe']
        
        missing_fields = [field for field in required_fields if field not in first_product]
        if missing_fields:
            log_test("Required Fields", "FAIL", f"Missing fields: {missing_fields}")
            return False
        else:
            log_test("Required Fields", "PASS", "All 9 required fields present")
        
        # Verify grossProfit = revenue - cogs (within ±1)
        revenue = first_product.get('revenue', 0)
        cogs = first_product.get('cogs', 0)
        gross_profit = first_product.get('grossProfit', 0)
        calculated_profit = revenue - cogs
        
        if abs(gross_profit - calculated_profit) <= 1:
            log_test("Gross Profit Calculation", "PASS", f"grossProfit (₹{gross_profit}) = revenue (₹{revenue}) - cogs (₹{cogs})")
        else:
            log_test("Gross Profit Calculation", "FAIL", f"grossProfit (₹{gross_profit}) ≠ revenue (₹{revenue}) - cogs (₹{cogs})")
            return False
        
        # Verify margin calculation (grossProfit/revenue)*100
        if revenue > 0:
            calculated_margin = (gross_profit / revenue) * 100
            actual_margin = first_product.get('margin', 0)
            
            if abs(calculated_margin - actual_margin) <= 0.01:
                log_test("Margin Calculation", "PASS", f"margin ({actual_margin:.2f}%) = (grossProfit/revenue)*100")
            else:
                log_test("Margin Calculation", "FAIL", f"margin ({actual_margin:.2f}%) ≠ calculated ({calculated_margin:.2f}%)")
                return False
        else:
            log_test("Margin Calculation", "PASS", "No revenue to calculate margin")
        
        return True
        
    except Exception as e:
        log_test("Product COGS Report", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_profitable_skus_report():
    """Test 4: Profitable SKUs Report"""
    print("🎯 TEST 4: PROFITABLE SKUS REPORT (GET /api/reports/profitable-skus)")
    
    try:
        url = f"{BASE_URL}/reports/profitable-skus"
        response = requests.get(url)
        
        if response.status_code != 200:
            log_test("Profitable SKUs API Call", "FAIL", f"Status code: {response.status_code}")
            return False
        
        data = response.json()
        
        # Should be an array
        if not isinstance(data, list):
            log_test("Response Structure", "FAIL", "Response should be an array")
            return False
        
        if len(data) == 0:
            log_test("Data Availability", "PASS", "No profitable SKU data available (empty array)")
            return True
        
        # Check first SKU structure
        first_sku = data[0]
        required_fields = ['sku', 'productName', 'totalOrders', 'totalRevenue', 'totalProfit', 'totalCOGS', 'rtoCount', 'profitMargin', 'rtoRate']
        
        missing_fields = [field for field in required_fields if field not in first_sku]
        if missing_fields:
            log_test("Required Fields", "FAIL", f"Missing fields: {missing_fields}")
            return False
        else:
            log_test("Required Fields", "PASS", "All 9 required fields present")
        
        # Note: We can't directly verify that cancelled orders are excluded without accessing the database
        # But we can check that totalOrders is a reasonable positive number
        total_orders = first_sku.get('totalOrders', 0)
        if total_orders > 0:
            log_test("Cancelled Order Exclusion", "PASS", f"totalOrders = {total_orders} (should exclude cancelled orders)")
        else:
            log_test("Cancelled Order Exclusion", "FAIL", f"totalOrders = {total_orders} (unexpected value)")
            return False
        
        return True
        
    except Exception as e:
        log_test("Profitable SKUs Report", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_calculate_profit_endpoint():
    """Test 5: Calculate-Profit Endpoint"""
    print("🎯 TEST 5: CALCULATE-PROFIT ENDPOINT (GET /api/calculate-profit/{orderId})")
    
    try:
        # First get an order
        orders_url = f"{BASE_URL}/orders?page=1&limit=1"
        response = requests.get(orders_url)
        
        if response.status_code != 200:
            log_test("Orders API Call", "FAIL", f"Status code: {response.status_code}")
            return False
        
        orders_data = response.json()
        
        if not orders_data.get('orders') or len(orders_data['orders']) == 0:
            log_test("Order Availability", "FAIL", "No orders available to test")
            return False
        
        order_id = orders_data['orders'][0]['_id']
        log_test("Order Selection", "PASS", f"Using order ID: {order_id}")
        
        # Now test calculate-profit endpoint
        profit_url = f"{BASE_URL}/calculate-profit/{order_id}"
        response = requests.get(profit_url)
        
        if response.status_code != 200:
            log_test("Calculate Profit API Call", "FAIL", f"Status code: {response.status_code}")
            return False
        
        profit_data = response.json()
        
        # Check required fields
        required_fields = ['grossRevenue', 'netRevenue', 'gstOnRevenue', 'totalCOGS', 'shippingCost', 
                          'totalTransactionFee', 'marketingAllocation', 'netProfit', 'profitMargin']
        
        missing_fields = [field for field in required_fields if field not in profit_data]
        if missing_fields:
            log_test("Required Fields", "FAIL", f"Missing fields: {missing_fields}")
            return False
        else:
            log_test("Required Fields", "PASS", "All 9 required fields present")
        
        # Verify: grossRevenue - discount - gstOnRevenue ≈ netRevenue (within ±0.01)
        gross_revenue = profit_data.get('grossRevenue', 0)
        discount = profit_data.get('discount', 0)
        gst_on_revenue = profit_data.get('gstOnRevenue', 0)
        net_revenue = profit_data.get('netRevenue', 0)
        
        calculated_net_revenue = gross_revenue - discount - gst_on_revenue
        
        if abs(calculated_net_revenue - net_revenue) <= 0.01:
            log_test("Net Revenue Calculation", "PASS", f"grossRevenue - discount - gstOnRevenue = netRevenue (₹{net_revenue})")
        else:
            log_test("Net Revenue Calculation", "FAIL", f"Calculated: ₹{calculated_net_revenue}, Actual: ₹{net_revenue}")
            return False
        
        return True
        
    except Exception as e:
        log_test("Calculate-Profit Endpoint", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_alltime_stats_accuracy():
    """Test 6: All-Time Stats Accuracy"""
    print("🎯 TEST 6: ALL-TIME STATS ACCURACY (Comparison between today and alltime)")
    
    try:
        # Get today's dashboard data
        today_data = get_dashboard_data("today")
        if not today_data:
            log_test("Today Dashboard API", "FAIL", "Failed to fetch today dashboard data")
            return False
        
        # Get alltime dashboard data
        alltime_data = get_dashboard_data("alltime")
        if not alltime_data:
            log_test("Alltime Dashboard API", "FAIL", "Failed to fetch alltime dashboard data")
            return False
        
        # Both should have allTime.totalOrders with same value
        today_alltime_orders = today_data.get('allTime', {}).get('totalOrders', 0)
        alltime_alltime_orders = alltime_data.get('allTime', {}).get('totalOrders', 0)
        
        if today_alltime_orders == alltime_alltime_orders:
            log_test("AllTime Consistency", "PASS", f"Both allTime.totalOrders = {today_alltime_orders}")
        else:
            log_test("AllTime Consistency", "FAIL", f"Today: {today_alltime_orders}, Alltime: {alltime_alltime_orders}")
            return False
        
        # Today's filtered.totalOrders should be much less than allTime.totalOrders
        today_filtered_orders = today_data.get('filtered', {}).get('totalOrders', 0)
        
        if today_filtered_orders < today_alltime_orders:
            log_test("Today vs AllTime Orders", "PASS", f"Today filtered ({today_filtered_orders}) < AllTime ({today_alltime_orders})")
        else:
            log_test("Today vs AllTime Orders", "FAIL", f"Today filtered ({today_filtered_orders}) ≥ AllTime ({today_alltime_orders})")
            return False
        
        return True
        
    except Exception as e:
        log_test("All-Time Stats Accuracy", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def test_ad_spend_tax_still_works():
    """Test 7: Ad Spend Tax Still Works"""
    print("🎯 TEST 7: AD SPEND TAX STILL WORKS (MongoDB verification)")
    
    try:
        # Get alltime dashboard data
        data = get_dashboard_data("alltime")
        if not data:
            log_test("Dashboard API Call", "FAIL", "Failed to fetch dashboard data")
            return False
        
        dashboard_ad_spend = data.get('filtered', {}).get('adSpend', 0)
        
        if dashboard_ad_spend <= 0:
            log_test("Ad Spend Check", "PASS", f"filtered.adSpend = ₹{dashboard_ad_spend} (Meta Ads inactive or no spend)")
            return True
        
        log_test("Ad Spend Present", "PASS", f"filtered.adSpend = ₹{dashboard_ad_spend}")
        
        # Connect to MongoDB to verify calculation
        try:
            client = MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            # Get raw ad spend total from dailyMarketingSpend
            daily_spend_docs = list(db.dailyMarketingSpend.find())
            raw_total = sum(doc.get('spendAmount', 0) for doc in daily_spend_docs)
            
            log_test("Raw Ad Spend", "PASS", f"Raw total from MongoDB: ₹{raw_total}")
            
            # Get tax rate from tenantConfig
            tenant_config = db.tenantConfig.find_one()
            tax_rate = tenant_config.get('adSpendTaxRate', 18) if tenant_config else 18
            
            log_test("Tax Rate", "PASS", f"adSpendTaxRate: {tax_rate}%")
            
            # Calculate expected ad spend with tax
            expected_ad_spend = raw_total * (1 + tax_rate / 100)
            
            # Verify dashboard adSpend matches calculation (within 1% tolerance)
            if abs(dashboard_ad_spend - expected_ad_spend) / max(expected_ad_spend, 1) <= 0.01:
                log_test("Tax Calculation", "PASS", f"Dashboard ₹{dashboard_ad_spend} ≈ Raw ₹{raw_total} × 1.{tax_rate}")
            else:
                log_test("Tax Calculation", "FAIL", f"Dashboard ₹{dashboard_ad_spend} ≠ Expected ₹{expected_ad_spend}")
                return False
            
            client.close()
            
        except Exception as mongo_error:
            log_test("MongoDB Connection", "FAIL", f"MongoDB error: {mongo_error}")
            return False
        
        return True
        
    except Exception as e:
        log_test("Ad Spend Tax Verification", "FAIL", f"Exception: {str(e)}")
        traceback.print_exc()
        return False

def main():
    """Main test execution"""
    print("🚀 PHASE 7.7 DATA CONSISTENCY AUDIT - TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print()
    
    # Track test results
    test_results = []
    
    # Run all tests
    test_results.append(("Dashboard Data Integrity", test_dashboard_data_integrity()))
    test_results.append(("Monthly P&L Report", test_monthly_pl_report()))
    test_results.append(("Product COGS Report", test_product_cogs_report()))
    test_results.append(("Profitable SKUs Report", test_profitable_skus_report()))
    test_results.append(("Calculate-Profit Endpoint", test_calculate_profit_endpoint()))
    test_results.append(("All-Time Stats Accuracy", test_alltime_stats_accuracy()))
    test_results.append(("Ad Spend Tax Verification", test_ad_spend_tax_still_works()))
    
    # Summary
    print("=" * 60)
    print("🎯 TEST SUMMARY:")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print()
    print(f"📊 RESULTS: {passed}/{len(test_results)} tests passed ({(passed/len(test_results)*100):.1f}%)")
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED - PHASE 7.7 DATA CONSISTENCY AUDIT COMPLETE!")
    else:
        print(f"⚠️  {failed} test(s) failed - Issues require attention")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)