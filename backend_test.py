#!/usr/bin/env python3
"""
Shopify Absolute Parity Restoration Backend Testing
Testing 5 critical areas for exact Shopify parity restoration.
"""

import requests
import json
import sys
from datetime import datetime
import pymongo

# Configuration
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

class TestResults:
    def __init__(self):
        self.results = []
        self.total_tests = 0
        self.passed_tests = 0
    
    def add_result(self, test_name, passed, message="", details=None):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
        
        result = {
            "test": test_name,
            "status": "✅ PASSED" if passed else "❌ FAILED",
            "message": message,
            "details": details or {}
        }
        self.results.append(result)
        print(f"{result['status']}: {test_name} - {message}")
        
        if details:
            for key, value in details.items():
                print(f"  - {key}: {value}")
    
    def get_summary(self):
        return f"{self.passed_tests}/{self.total_tests} tests passed ({(self.passed_tests/self.total_tests)*100:.1f}%)"

def test_exact_order_count_parity(results: TestResults):
    """Test 1: Exact Order Count Parity"""
    print("\n🎯 Testing Exact Order Count Parity...")
    
    try:
        # Get dashboard data for 7 days
        response = requests.get(f"{BASE_URL}/dashboard?range=7days")
        if response.status_code != 200:
            results.add_result("Dashboard API Call", False, f"HTTP {response.status_code}")
            return
            
        data = response.json()
        filtered_total_orders = data.get("filtered", {}).get("totalOrders", 0)
        
        # Verify it should be exactly 39
        expected_orders = 39
        if filtered_total_orders == expected_orders:
            results.add_result("7-day Order Count", True, 
                             f"Dashboard shows {filtered_total_orders} orders (matches Shopify exactly)",
                             {"expected": expected_orders, "actual": filtered_total_orders})
        else:
            results.add_result("7-day Order Count", False,
                             f"Expected {expected_orders}, got {filtered_total_orders}",
                             {"expected": expected_orders, "actual": filtered_total_orders})
        
        # Verify with MongoDB directly
        try:
            client = pymongo.MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            # Query unique shopifyOrderId with proper date range and status filters
            query = {
                'orderDate': {
                    '$gte': '2026-02-27T18:30:00.000Z',
                    '$lte': '2026-03-06T18:29:59.999Z'
                },
                'status': {'$nin': ['Cancelled', 'Voided', 'Pending']}
            }
            
            unique_order_ids = db.orders.distinct('shopifyOrderId', query)
            mongodb_count = len(unique_order_ids)
            
            if mongodb_count == expected_orders:
                results.add_result("MongoDB Order Count Verification", True,
                                 f"MongoDB shows {mongodb_count} unique shopifyOrderIds",
                                 {"query_result": mongodb_count, "expected": expected_orders})
            else:
                results.add_result("MongoDB Order Count Verification", False,
                                 f"Expected {expected_orders}, MongoDB shows {mongodb_count}",
                                 {"query_result": mongodb_count, "expected": expected_orders})
            
            client.close()
            
        except Exception as e:
            results.add_result("MongoDB Verification", False, f"MongoDB error: {str(e)}")
            
    except Exception as e:
        results.add_result("Order Count Parity Test", False, f"Error: {str(e)}")

def test_exact_revenue_parity(results: TestResults):
    """Test 2: Exact Revenue Parity"""
    print("\n🎯 Testing Exact Revenue Parity...")
    
    try:
        response = requests.get(f"{BASE_URL}/dashboard?range=7days")
        if response.status_code != 200:
            results.add_result("Revenue Parity API Call", False, f"HTTP {response.status_code}")
            return
            
        data = response.json()
        filtered_data = data.get("filtered", {})
        pl_breakdown = data.get("plBreakdown", {})
        
        # Check filtered.revenue should be exactly 21990
        expected_revenue = 21990
        actual_revenue = filtered_data.get("revenue", 0)
        
        if actual_revenue == expected_revenue:
            results.add_result("Filtered Revenue Match", True,
                             f"filtered.revenue = ₹{actual_revenue} (matches Shopify Total Sales)",
                             {"expected": expected_revenue, "actual": actual_revenue})
        else:
            results.add_result("Filtered Revenue Match", False,
                             f"Expected ₹{expected_revenue}, got ₹{actual_revenue}",
                             {"expected": expected_revenue, "actual": actual_revenue})
        
        # Check plBreakdown.gstOnRevenue should be exactly 3354.43
        expected_gst = 3354.43
        actual_gst = pl_breakdown.get("gstOnRevenue", 0)
        
        if abs(actual_gst - expected_gst) < 0.01:
            results.add_result("GST on Revenue Match", True,
                             f"plBreakdown.gstOnRevenue = ₹{actual_gst} (matches Shopify Taxes)",
                             {"expected": expected_gst, "actual": actual_gst})
        else:
            results.add_result("GST on Revenue Match", False,
                             f"Expected ₹{expected_gst}, got ₹{actual_gst}",
                             {"expected": expected_gst, "actual": actual_gst})
        
        # Check plBreakdown.netRevenue should be exactly 18635.57
        expected_net = 18635.57
        actual_net = pl_breakdown.get("netRevenue", 0)
        
        if abs(actual_net - expected_net) < 0.01:
            results.add_result("Net Revenue Match", True,
                             f"plBreakdown.netRevenue = ₹{actual_net} (matches Shopify Gross Sales)",
                             {"expected": expected_net, "actual": actual_net})
        else:
            results.add_result("Net Revenue Match", False,
                             f"Expected ₹{expected_net}, got ₹{actual_net}",
                             {"expected": expected_net, "actual": actual_net})
        
        # Verify plBreakdown.grossRevenue == filtered.revenue
        pl_gross = pl_breakdown.get("grossRevenue", 0)
        if pl_gross == actual_revenue:
            results.add_result("Revenue Consistency", True,
                             f"plBreakdown.grossRevenue = filtered.revenue (₹{pl_gross})")
        else:
            results.add_result("Revenue Consistency", False,
                             f"plBreakdown.grossRevenue (₹{pl_gross}) ≠ filtered.revenue (₹{actual_revenue})")
            
    except Exception as e:
        results.add_result("Revenue Parity Test", False, f"Error: {str(e)}")

def test_tip_exclusion_verification(results: TestResults):
    """Test 3: Tip Exclusion Verification"""
    print("\n🎯 Testing Tip Exclusion Verification...")
    
    try:
        # Read source code to verify tip exclusion logic
        try:
            with open("/app/lib/profitCalculator.js", "r") as f:
                profit_calc_code = f.read()
            
            # Check for correct grossRevenue calculation (excluding tips)
            if "(order.salePrice || 0) - (order.tipAmount || 0)" in profit_calc_code:
                results.add_result("Tip Exclusion in grossRevenue", True,
                                 "Found correct grossRevenue = salePrice - tipAmount formula")
            else:
                results.add_result("Tip Exclusion in grossRevenue", False,
                                 "Tip exclusion formula not found in grossRevenue calculation")
            
            # Check that netRevenue does NOT add tipAmount back
            lines = profit_calc_code.split('\n')
            net_revenue_calc_lines = [line for line in lines if 'netRevenue' in line and '=' in line]
            
            tip_added_back = any('+ result.tipAmount' in line or '+ tipAmount' in line 
                               for line in net_revenue_calc_lines)
            
            if not tip_added_back:
                results.add_result("Tip NOT Added to netRevenue", True,
                                 "Verified netRevenue does NOT add tipAmount back")
            else:
                results.add_result("Tip NOT Added to netRevenue", False,
                                 "Found tipAmount being added to netRevenue (incorrect)")
            
        except Exception as e:
            results.add_result("Source Code Verification", False, f"Error reading source: {str(e)}")
        
        # Verify tip amounts in database for 7-day range
        try:
            client = pymongo.MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            # Sum tipAmount for orders in 7-day range  
            pipeline = [
                {
                    '$match': {
                        'orderDate': {
                            '$gte': '2026-02-27T18:30:00.000Z',
                            '$lte': '2026-03-06T18:29:59.999Z'
                        }
                    }
                },
                {
                    '$group': {
                        '_id': None,
                        'totalTips': {'$sum': {'$ifNull': ['$tipAmount', 0]}}
                    }
                }
            ]
            
            result = list(db.orders.aggregate(pipeline))
            total_tips = result[0]['totalTips'] if result else 0
            
            # Tips should be around 20 as mentioned in task
            expected_tip_range = (15, 25)
            if expected_tip_range[0] <= total_tips <= expected_tip_range[1]:
                results.add_result("7-day Tip Amount Verification", True,
                                 f"Total tips in range: ₹{total_tips} (expected ~₹20)",
                                 {"total_tips": total_tips, "expected_range": expected_tip_range})
            else:
                results.add_result("7-day Tip Amount Verification", False,
                                 f"Total tips ₹{total_tips} outside expected range {expected_tip_range}",
                                 {"total_tips": total_tips, "expected_range": expected_tip_range})
            
            client.close()
            
        except Exception as e:
            results.add_result("Tip Amount MongoDB Verification", False, f"MongoDB error: {str(e)}")
            
    except Exception as e:
        results.add_result("Tip Exclusion Test", False, f"Error: {str(e)}")

def test_waterfall_math(results: TestResults):
    """Test 4: Waterfall Math Verification"""
    print("\n🎯 Testing Waterfall Math...")
    
    try:
        response = requests.get(f"{BASE_URL}/dashboard?range=7days")
        if response.status_code != 200:
            results.add_result("Waterfall Math API Call", False, f"HTTP {response.status_code}")
            return
            
        data = response.json()
        pl_breakdown = data.get("plBreakdown", {})
        
        # Extract components for waterfall calculation
        net_revenue = pl_breakdown.get("netRevenue", 0)
        total_cogs = pl_breakdown.get("totalCOGS", 0)
        total_shipping = pl_breakdown.get("totalShipping", 0)
        total_txn_fees = pl_breakdown.get("totalTxnFees", 0)
        total_shopify_fee = pl_breakdown.get("totalShopifyFee", 0)
        ad_spend = pl_breakdown.get("adSpend", 0)
        overhead = pl_breakdown.get("overhead", 0)
        actual_net_profit = pl_breakdown.get("netProfit", 0)
        
        # Calculate expected net profit using waterfall formula
        calculated_net_profit = (net_revenue - total_cogs - total_shipping - 
                               total_txn_fees - total_shopify_fee - ad_spend - overhead)
        
        # Check if difference is less than 1
        difference = abs(calculated_net_profit - actual_net_profit)
        
        if difference < 1:
            results.add_result("Waterfall Math Accuracy", True,
                             f"Waterfall calculation accurate (diff: ₹{difference:.2f})",
                             {
                                 "calculated_net_profit": round(calculated_net_profit, 2),
                                 "actual_net_profit": round(actual_net_profit, 2),
                                 "difference": round(difference, 2),
                                 "components": {
                                     "net_revenue": net_revenue,
                                     "total_cogs": total_cogs,
                                     "total_shipping": total_shipping,
                                     "total_txn_fees": total_txn_fees,
                                     "total_shopify_fee": total_shopify_fee,
                                     "ad_spend": ad_spend,
                                     "overhead": overhead
                                 }
                             })
        else:
            results.add_result("Waterfall Math Accuracy", False,
                             f"Waterfall calculation off by ₹{difference:.2f} (exceeds ±1 tolerance)",
                             {
                                 "calculated_net_profit": round(calculated_net_profit, 2),
                                 "actual_net_profit": round(actual_net_profit, 2),
                                 "difference": round(difference, 2),
                                 "tolerance": "±1"
                             })
            
    except Exception as e:
        results.add_result("Waterfall Math Test", False, f"Error: {str(e)}")

def test_alltime_unique_order_count(results: TestResults):
    """Test 5: All-Time Unique Order Count"""
    print("\n🎯 Testing All-Time Unique Order Count...")
    
    try:
        response = requests.get(f"{BASE_URL}/dashboard?range=7days")
        if response.status_code != 200:
            results.add_result("All-Time API Call", False, f"HTTP {response.status_code}")
            return
            
        data = response.json()
        all_time_data = data.get("allTime", {})
        all_time_total_orders = all_time_data.get("totalOrders", 0)
        
        # Expected to be around 2015 unique orders
        expected_range = (2000, 2050)
        if expected_range[0] <= all_time_total_orders <= expected_range[1]:
            results.add_result("Dashboard All-Time Order Count", True,
                             f"allTime.totalOrders = {all_time_total_orders} (expected ~2015)",
                             {"actual": all_time_total_orders, "expected_range": expected_range})
        else:
            results.add_result("Dashboard All-Time Order Count", False,
                             f"allTime.totalOrders = {all_time_total_orders} outside expected range {expected_range}",
                             {"actual": all_time_total_orders, "expected_range": expected_range})
        
        # Verify with MongoDB directly
        try:
            client = pymongo.MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            # Count unique shopifyOrderId values excluding cancelled/voided/pending
            unique_order_ids = db.orders.distinct('shopifyOrderId', {
                'status': {'$nin': ['Cancelled', 'Voided', 'Pending']}
            })
            mongodb_count = len(unique_order_ids)
            
            # Compare dashboard vs MongoDB
            if abs(all_time_total_orders - mongodb_count) <= 5:
                results.add_result("MongoDB All-Time Count Verification", True,
                                 f"MongoDB shows {mongodb_count} unique orders (dashboard: {all_time_total_orders})",
                                 {"mongodb_count": mongodb_count, "dashboard_count": all_time_total_orders})
            else:
                results.add_result("MongoDB All-Time Count Verification", False,
                                 f"Dashboard ({all_time_total_orders}) vs MongoDB ({mongodb_count}) mismatch",
                                 {"mongodb_count": mongodb_count, "dashboard_count": all_time_total_orders})
            
            client.close()
            
        except Exception as e:
            results.add_result("All-Time MongoDB Verification", False, f"MongoDB error: {str(e)}")
            
    except Exception as e:
        results.add_result("All-Time Order Count Test", False, f"Error: {str(e)}")

def main():
    """Main test execution"""
    print("=" * 80)
    print("🎯 SHOPIFY ABSOLUTE PARITY RESTORATION - BACKEND TESTING")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print("=" * 80)
    
    results = TestResults()
    
    # Execute all 5 critical tests
    test_exact_order_count_parity(results)
    test_exact_revenue_parity(results)
    test_tip_exclusion_verification(results)
    test_waterfall_math(results)
    test_alltime_unique_order_count(results)
    
    # Final summary
    print("\n" + "=" * 80)
    print("🎯 TEST SUMMARY")
    print("=" * 80)
    print(f"Overall Result: {results.get_summary()}")
    print()
    
    # Print detailed results
    for i, result in enumerate(results.results, 1):
        print(f"{i:2d}. {result['status']} {result['test']}")
        if result['message']:
            print(f"     {result['message']}")
    
    print("=" * 80)
    
    # Exit with appropriate code
    if results.passed_tests == results.total_tests:
        print("✅ ALL TESTS PASSED - Shopify Absolute Parity Restoration Working!")
        sys.exit(0)
    else:
        print("❌ SOME TESTS FAILED - Issues found in Shopify parity")
        sys.exit(1)

if __name__ == "__main__":
    main()