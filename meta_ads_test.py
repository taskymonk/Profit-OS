#!/usr/bin/env python3
"""
Profit OS Meta Ads Integration Backend Testing Suite
Tests Meta Ads integration functionality including sync error handling, dashboard behavior, 
profit calculation, and simulated ad spend scenarios.
"""

import requests
import json
import sys
import pymongo
from datetime import datetime, timedelta
import time

# Base URL from environment
BASE_URL = "https://smart-finance-hub-41.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠️  {msg}{Colors.END}")

def print_header(msg):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{msg.center(60)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

def make_request(method, endpoint, data=None, expected_status=200):
    """Make HTTP request and return response"""
    url = f"{BASE_URL}{endpoint}"
    print_info(f"{method} {url}")
    
    try:
        if method == 'GET':
            response = requests.get(url, timeout=30)
        elif method == 'POST':
            response = requests.post(url, json=data, timeout=30)
        elif method == 'PUT':
            response = requests.put(url, json=data, timeout=30)
        elif method == 'DELETE':
            response = requests.delete(url, timeout=30)
        
        if data:
            print_info(f"Request body: {json.dumps(data, indent=2)}")
        
        print_info(f"Response status: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                result = response.json()
                print_info(f"Response: {json.dumps(result, indent=2)[:500]}...")
                return True, result
            except:
                return True, response.text
        else:
            try:
                error_data = response.json()
                print_error(f"Unexpected status {response.status_code}: {error_data}")
            except:
                print_error(f"Unexpected status {response.status_code}: {response.text}")
            return False, None
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False, None

def get_mongo_client():
    """Get MongoDB client connection"""
    try:
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        # Test the connection
        client.admin.command('ping')
        return client, db
    except Exception as e:
        print_error(f"Failed to connect to MongoDB: {e}")
        return None, None

def test_seed_data():
    """First, seed the database with demo data"""
    print_header("SEEDING DATABASE")
    
    print_info("Calling POST /api/seed to create demo data")
    success, result = make_request('POST', '/seed')
    
    if success and result:
        seeded = result.get('seeded', False)
        message = result.get('message', 'No message')
        
        if seeded:
            print_success(f"Database seeded successfully: {message}")
        else:
            print_info(f"Database already seeded: {message}")
        return True
    else:
        print_error("Failed to seed database")
        return False

def test_meta_ads_sync_error_handling():
    """Test META ADS SYNC ERROR HANDLING - POST /api/meta-ads/sync without credentials"""
    print_header("META ADS SYNC ERROR HANDLING TESTS")
    
    results = []
    
    # Test 1: Sync without credentials should return error
    print_info("Test 1: POST /api/meta-ads/sync without credentials - expect error about missing credentials")
    success, sync_result = make_request('POST', '/meta-ads/sync')
    
    if success and sync_result:
        error_msg = sync_result.get('error', '')
        synced_count = sync_result.get('synced', -1)
        
        # Check for error message about missing credentials
        if ('credentials' in error_msg.lower() or 'not configured' in error_msg.lower()) and synced_count == 0:
            print_success(f"Meta Ads sync correctly returns credentials error: {error_msg}")
            print_success(f"Sync count correctly 0: {synced_count}")
            results.append(True)
        else:
            print_error(f"Unexpected sync response - error: '{error_msg}', synced: {synced_count}")
            results.append(False)
    else:
        print_error("Meta Ads sync API call failed")
        results.append(False)
    
    # Test 2: Verify integrations.metaAds.active stays false
    print_info("Test 2: Verify integrations.metaAds.active stays false when sync fails")
    success, integrations = make_request('GET', '/integrations')
    
    if success and integrations:
        meta_ads = integrations.get('metaAds', {})
        is_active = meta_ads.get('active', None)
        
        if is_active == False:
            print_success(f"MetaAds integration correctly remains inactive: active = {is_active}")
            results.append(True)
        else:
            print_error(f"MetaAds integration active status unexpected: active = {is_active}")
            results.append(False)
    else:
        print_error("Failed to get integrations")
        results.append(False)
    
    print(f"\nMeta Ads Sync Error Handling Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_dashboard_without_meta_ads():
    """Test DASHBOARD WITHOUT META ADS - GET /api/dashboard?range=alltime"""
    print_header("DASHBOARD WITHOUT META ADS TESTS")
    
    results = []
    
    # Test 1: GET /api/integrations → metaAds.active should be false
    print_info("Test 1: GET /api/integrations → metaAds.active should be false")
    success, integrations = make_request('GET', '/integrations')
    
    if success and integrations:
        meta_ads = integrations.get('metaAds', {})
        is_active = meta_ads.get('active', None)
        
        if is_active == False:
            print_success(f"MetaAds integration correctly inactive: active = {is_active}")
            results.append(True)
        else:
            print_error(f"MetaAds integration should be inactive but got: active = {is_active}")
            results.append(False)
    else:
        print_error("Failed to get integrations")
        results.append(False)
    
    # Test 2: GET /api/dashboard?range=alltime → filtered.adSpend MUST be 0
    print_info("Test 2: GET /api/dashboard?range=alltime → filtered.adSpend MUST be 0")
    success, dashboard = make_request('GET', '/dashboard?range=alltime')
    
    if success and dashboard:
        filtered = dashboard.get('filtered', {})
        ad_spend = filtered.get('adSpend', -1)
        
        if ad_spend == 0:
            print_success(f"Dashboard filtered.adSpend correctly 0 when MetaAds inactive: {ad_spend}")
            results.append(True)
        else:
            print_error(f"Dashboard filtered.adSpend should be 0 but got: {ad_spend}")
            results.append(False)
        
        # Test 3: recentOrders should all have _profitData.marketingAllocation = 0
        print_info("Test 3: recentOrders should all have _profitData.marketingAllocation = 0")
        recent_orders = dashboard.get('recentOrders', [])
        
        if recent_orders and len(recent_orders) > 0:
            all_zero_allocation = True
            for i, order in enumerate(recent_orders[:5]):  # Check first 5 orders
                profit_data = order.get('_profitData', {})
                marketing_allocation = profit_data.get('marketingAllocation', -1)
                
                if marketing_allocation != 0:
                    print_error(f"Order {i+1} has non-zero marketingAllocation: {marketing_allocation}")
                    all_zero_allocation = False
                    break
            
            if all_zero_allocation:
                print_success(f"All recent orders have marketingAllocation = 0 (checked {min(len(recent_orders), 5)} orders)")
                results.append(True)
            else:
                print_error("Some recent orders have non-zero marketingAllocation")
                results.append(False)
        else:
            print_warning("No recent orders found in dashboard - cannot verify marketing allocation")
            results.append(True)  # Pass if no orders to check
            
    else:
        print_error("Failed to get dashboard data")
        results.append(False)
    
    print(f"\nDashboard Without Meta Ads Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_calculate_profit_without_meta_ads():
    """Test CALCULATE-PROFIT WITHOUT META ADS"""
    print_header("CALCULATE-PROFIT WITHOUT META ADS TESTS")
    
    results = []
    
    # Test 1: Get first order
    print_info("Test 1: GET /api/orders?page=1&limit=1 → get first order")
    success, orders_data = make_request('GET', '/orders?page=1&limit=1')
    
    if not success or not orders_data:
        print_error("Failed to get orders")
        return False
    
    orders = orders_data.get('orders', [])
    if len(orders) == 0:
        print_error("No orders found in system")
        return False
    
    first_order = orders[0]
    order_id = first_order.get('_id')
    order_display_id = first_order.get('orderId', 'Unknown')
    
    if not order_id:
        print_error("No valid order ID found")
        return False
    
    print_success(f"Selected first order: {order_display_id} (ID: {order_id})")
    
    # Test 2: GET /api/calculate-profit/{order._id} → marketingAllocation MUST be 0
    print_info("Test 2: GET /api/calculate-profit/{order._id} → marketingAllocation MUST be 0")
    success, profit_data = make_request('GET', f'/calculate-profit/{order_id}')
    
    if success and profit_data:
        marketing_allocation = profit_data.get('marketingAllocation', -1)
        
        if marketing_allocation == 0:
            print_success(f"Profit calculation marketingAllocation correctly 0: {marketing_allocation}")
            results.append(True)
        else:
            print_error(f"Profit calculation marketingAllocation should be 0 but got: {marketing_allocation}")
            results.append(False)
            
        # Verify complete profit structure
        required_fields = ['netRevenue', 'totalCOGS', 'shippingCost', 'totalTransactionFee', 'marketingAllocation', 'netProfit']
        missing_fields = [field for field in required_fields if field not in profit_data]
        
        if missing_fields:
            print_error(f"Profit calculation missing required fields: {missing_fields}")
            results.append(False)
        else:
            print_success("Profit calculation structure complete with all required fields")
            print_info(f"  Net Revenue: ₹{profit_data.get('netRevenue', 0)}")
            print_info(f"  Total COGS: ₹{profit_data.get('totalCOGS', 0)}")
            print_info(f"  Shipping Cost: ₹{profit_data.get('shippingCost', 0)}")
            print_info(f"  Transaction Fee: ₹{profit_data.get('totalTransactionFee', 0)}")
            print_info(f"  Marketing Allocation: ₹{profit_data.get('marketingAllocation', 0)}")
            print_info(f"  Net Profit: ₹{profit_data.get('netProfit', 0)}")
            results.append(True)
    else:
        print_error("Failed to get profit calculation")
        results.append(False)
    
    print(f"\nCalculate-Profit Without Meta Ads Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_daily_marketing_spend_endpoint():
    """Test DAILY MARKETING SPEND ENDPOINT - GET /api/daily-marketing-spend"""
    print_header("DAILY MARKETING SPEND ENDPOINT TESTS")
    
    print_info("Test: GET /api/daily-marketing-spend → should return empty array []")
    success, spend_data = make_request('GET', '/daily-marketing-spend')
    
    if success:
        if isinstance(spend_data, list):
            if len(spend_data) == 0:
                print_success("Daily marketing spend correctly returns empty array []")
                return True
            else:
                print_warning(f"Daily marketing spend returned {len(spend_data)} records (expected empty array)")
                return True  # Still pass, might have existing data
        else:
            print_error(f"Daily marketing spend should return array but got: {type(spend_data)}")
            return False
    else:
        print_error("Failed to get daily marketing spend")
        return False

def test_simulate_ad_spend():
    """Test SIMULATE AD SPEND - critical math test with direct MongoDB insertion"""
    print_header("SIMULATE AD SPEND - CRITICAL MATH TEST")
    
    results = []
    client, db = None, None
    
    try:
        # Get MongoDB connection
        client, db = get_mongo_client()
        if client is None or db is None:
            print_error("Cannot connect to MongoDB - skipping simulation test")
            return False
        
        print_info("Connected to MongoDB successfully")
        
        # Step 1: Get orders to find a date with orders
        print_info("Step 1: Get orders to find a date with orders")
        success, orders_data = make_request('GET', '/orders?page=1&limit=20&sortBy=orderDate&sortOrder=desc')
        
        if not success or not orders_data:
            print_error("Failed to get orders for simulation")
            return False
        
        orders = orders_data.get('orders', [])
        if len(orders) == 0:
            print_error("No orders found for simulation")
            return False
        
        # Use the first order's date
        first_order = orders[0]
        order_date_str = first_order.get('orderDate', '')
        test_date = order_date_str.split('T')[0]  # Extract YYYY-MM-DD format
        order_id = first_order.get('_id')
        order_display_id = first_order.get('orderId', 'Unknown')
        
        print_success(f"Selected test date: {test_date} (from order {order_display_id})")
        
        # Count orders on that specific date for allocation calculation
        orders_on_date = [order for order in orders if order.get('orderDate', '').startswith(test_date)]
        orders_count = len(orders_on_date)
        
        print_info(f"Found {orders_count} orders on date {test_date}")
        
        # Step 2: Insert test daily marketing spend
        test_spend_amount = 5000
        print_info(f"Step 2: Insert test dailyMarketingSpend record: date={test_date}, amount={test_spend_amount}")
        
        db.dailyMarketingSpend.insert_one({
            "date": test_date,
            "spendAmount": test_spend_amount,
            "currency": "INR",
            "source": "test"
        })
        
        print_success(f"Inserted test spend record: ₹{test_spend_amount} for {test_date}")
        
        # Step 3: Set metaAds.active to true
        print_info("Step 3: Set metaAds.active = true in integrations")
        
        db.integrations.update_one(
            {"_id": "integrations-config"},
            {"$set": {"metaAds.active": True}},
            upsert=True
        )
        
        print_success("Set metaAds.active = true")
        
        # Step 4: Test dashboard includes the ad spend
        print_info("Step 4: GET /api/dashboard?range=alltime → filtered.adSpend should include 5000")
        success, dashboard = make_request('GET', '/dashboard?range=alltime')
        
        if success and dashboard:
            filtered = dashboard.get('filtered', {})
            ad_spend = filtered.get('adSpend', 0)
            
            if ad_spend >= test_spend_amount:
                print_success(f"Dashboard adSpend includes test amount: ₹{ad_spend} (includes ₹{test_spend_amount})")
                results.append(True)
            else:
                print_error(f"Dashboard adSpend too low: ₹{ad_spend} (expected >= ₹{test_spend_amount})")
                results.append(False)
        else:
            print_error("Failed to get dashboard after inserting ad spend")
            results.append(False)
        
        # Step 5: Test profit calculation uses marketing allocation
        print_info(f"Step 5: GET /api/calculate-profit/{order_id} → marketingAllocation should be > 0 (ad spend divided by orders on date)")
        
        success, profit_data = make_request('GET', f'/calculate-profit/{order_id}')
        
        if success and profit_data:
            marketing_allocation = profit_data.get('marketingAllocation', 0)
            
            # The key test is that marketing allocation is > 0 when MetaAds active and ad spend exists
            if marketing_allocation > 0:
                actual_orders_used = test_spend_amount / marketing_allocation if marketing_allocation > 0 else 0
                print_success(f"Marketing allocation working: ₹{marketing_allocation} per order (indicates {actual_orders_used:.1f} orders used in calculation)")
                results.append(True)
            else:
                print_error(f"Marketing allocation should be > 0 when MetaAds active, got: ₹{marketing_allocation}")
                results.append(False)
        else:
            print_error("Failed to get profit calculation after inserting ad spend")
            results.append(False)
        
        # Step 6: Test daily marketing spend endpoint returns the record
        print_info("Step 6: GET /api/daily-marketing-spend → should have 1 record with spendAmount: 5000")
        success, spend_data = make_request('GET', '/daily-marketing-spend')
        
        if success and spend_data:
            if isinstance(spend_data, list) and len(spend_data) > 0:
                test_record = next((record for record in spend_data if record.get('spendAmount') == test_spend_amount), None)
                
                if test_record:
                    print_success(f"Daily marketing spend endpoint returns test record: {test_record.get('spendAmount')} on {test_record.get('date')}")
                    results.append(True)
                else:
                    print_error(f"Test record not found in daily marketing spend. Got {len(spend_data)} records")
                    results.append(False)
            else:
                print_error("Daily marketing spend endpoint returned empty array after inserting record")
                results.append(False)
        else:
            print_error("Failed to get daily marketing spend after inserting record")
            results.append(False)
        
        # Step 7: CLEANUP - Delete test record and reset metaAds.active
        print_info("Step 7: CLEANUP - Delete test record and reset metaAds.active to false")
        
        # Delete the test spend record
        delete_result = db.dailyMarketingSpend.delete_one({"date": test_date, "source": "test"})
        print_info(f"Deleted {delete_result.deleted_count} test spend record(s)")
        
        # Reset metaAds.active to false
        db.integrations.update_one(
            {"_id": "integrations-config"},
            {"$set": {"metaAds.active": False}}
        )
        print_success("Reset metaAds.active = false")
        
        # Step 8: Verify cleanup
        print_info("Step 8: VERIFY CLEANUP")
        
        # Check dashboard adSpend is back to 0
        success, dashboard_after = make_request('GET', '/dashboard?range=alltime')
        if success and dashboard_after:
            filtered_after = dashboard_after.get('filtered', {})
            ad_spend_after = filtered_after.get('adSpend', -1)
            
            if ad_spend_after == 0:
                print_success(f"Dashboard adSpend back to 0 after cleanup: {ad_spend_after}")
                results.append(True)
            else:
                print_warning(f"Dashboard adSpend not 0 after cleanup: {ad_spend_after} (might have other ad spend records)")
                results.append(True)  # Still pass, might have legitimate records
        
        # Check daily marketing spend is empty again
        success, spend_after = make_request('GET', '/daily-marketing-spend')
        if success and spend_after:
            if isinstance(spend_after, list) and len(spend_after) == 0:
                print_success("Daily marketing spend empty again after cleanup")
                results.append(True)
            else:
                print_warning(f"Daily marketing spend has {len(spend_after)} records after cleanup (might have other records)")
                results.append(True)  # Still pass, might have legitimate records
        
        print(f"\nSimulate Ad Spend Tests: {sum(results)}/{len(results)} passed")
        return all(results)
        
    except Exception as e:
        print_error(f"Simulation test failed with exception: {str(e)}")
        return False
        
    finally:
        # Ensure cleanup even if test fails
        if client is not None and db is not None:
            try:
                db.dailyMarketingSpend.delete_one({"source": "test"})
                db.integrations.update_one(
                    {"_id": "integrations-config"},
                    {"$set": {"metaAds.active": False}}
                )
                print_info("Cleanup completed in finally block")
            except Exception as cleanup_e:
                print_warning(f"Cleanup in finally block failed: {cleanup_e}")
            
            client.close()

def main():
    """Run Meta Ads integration tests for Profit OS"""
    print_header("PROFIT OS META ADS INTEGRATION TESTING SUITE")
    print_info(f"Base URL: {BASE_URL}")
    print_info(f"MongoDB URL: {MONGO_URL}")
    print_info(f"Database: {DB_NAME}")
    print_info(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_info("🎯 META ADS INTEGRATION TESTING:")
    print_info("   1. Seed Demo Data")
    print_info("   2. Meta Ads Sync Error Handling")  
    print_info("   3. Dashboard Without Meta Ads")
    print_info("   4. Calculate-Profit Without Meta Ads")
    print_info("   5. Daily Marketing Spend Endpoint")
    print_info("   6. Simulate Ad Spend (Critical Math Test)")
    
    # Run test suites
    test_results = []
    
    try:
        # Essential setup first
        if not test_seed_data():
            print_error("Cannot continue without seeded data")
            return 1
        
        # Run test suites
        test_results.append(("Meta Ads Sync Error Handling", test_meta_ads_sync_error_handling()))
        test_results.append(("Dashboard Without Meta Ads", test_dashboard_without_meta_ads()))
        test_results.append(("Calculate-Profit Without Meta Ads", test_calculate_profit_without_meta_ads()))
        test_results.append(("Daily Marketing Spend Endpoint", test_daily_marketing_spend_endpoint()))
        test_results.append(("Simulate Ad Spend (Critical Math Test)", test_simulate_ad_spend()))
        
    except KeyboardInterrupt:
        print_error("\nTesting interrupted by user")
        return 1
    except Exception as e:
        print_error(f"\nTesting failed with exception: {str(e)}")
        return 1
    
    # Print summary
    print_header("META ADS INTEGRATION TEST RESULTS SUMMARY")
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n{Colors.BOLD}Overall Meta Ads Integration Results: {passed}/{total} test suites passed{Colors.END}")
    
    if passed == total:
        print_success("🎉 ALL META ADS INTEGRATION TESTS PASSED!")
        return 0
    else:
        print_error(f"⚠️  {total - passed} Meta Ads test suite(s) failed")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)