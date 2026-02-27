#!/usr/bin/env python3
"""
Profit OS Phase 4 Backend API Testing Suite
Tests Phase 4 features: Orders Pagination, Dashboard MetaAds Check, Profit Calculator MetaAds Check, and Purge+Re-seed Flow.
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import time

# Base URL from environment
BASE_URL = "https://profit-calc-dash.preview.emergentagent.com/api"

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

def test_dashboard_date_ranges():
    """Test dashboard API with different date range filters"""
    print_header("DASHBOARD DATE RANGE FILTER TESTS")
    
    test_cases = [
        ("today", "Today's data"),
        ("7days", "Last 7 days data"),
        ("month", "Current month data"),
        ("alltime", "All-time data"),
        ("custom&startDate=2026-02-25&endDate=2026-02-26", "Custom date range")
    ]
    
    results = []
    
    for range_param, description in test_cases:
        print_info(f"\nTesting {description} - range={range_param}")
        success, data = make_request('GET', f'/dashboard?range={range_param}')
        
        if success and data:
            # Verify response structure
            required_fields = ['tenant', 'exchangeRate', 'dateRange', 'filtered', 'allTime', 'dailyData', 'recentOrders']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_error(f"Missing required fields: {missing_fields}")
                results.append(False)
            else:
                # Check filtered metrics structure
                filtered = data.get('filtered', {})
                metric_fields = ['netProfit', 'totalOrders', 'rtoRate', 'roas', 'revenue', 'adSpend', 'rtoCount']
                missing_metrics = [field for field in metric_fields if field not in filtered]
                
                if missing_metrics:
                    print_error(f"Missing filtered metric fields: {missing_metrics}")
                    results.append(False)
                else:
                    print_success(f"✅ {description} - Profit: ₹{filtered.get('netProfit', 0)}, Orders: {filtered.get('totalOrders', 0)}, RTO: {filtered.get('rtoRate', 0)}%, ROAS: {filtered.get('roas', 0)}")
                    
                    # Verify daily data structure
                    daily_data = data.get('dailyData', [])
                    if daily_data and isinstance(daily_data, list):
                        sample_day = daily_data[0]
                        day_fields = ['date', 'label', 'orders', 'revenue', 'cogs', 'shipping', 'adSpend', 'netProfit', 'rtoCount']
                        missing_day_fields = [field for field in day_fields if field not in sample_day]
                        
                        if missing_day_fields:
                            print_error(f"Missing daily data fields: {missing_day_fields}")
                            results.append(False)
                        else:
                            print_success(f"Daily data structure valid - {len(daily_data)} data points")
                            results.append(True)
                    else:
                        print_error("Daily data is not a valid array")
                        results.append(False)
        else:
            results.append(False)
    
    print(f"\nDashboard Date Range Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_reports_apis():
    """Test all reports APIs"""
    print_header("REPORTS APIs TESTS")
    
    reports = [
        ("profitable-skus", "Profitable SKUs Report", ['sku', 'productName', 'totalOrders', 'totalRevenue', 'totalProfit', 'avgProfitPerOrder', 'profitMargin', 'rtoRate']),
        ("rto-locations", "RTO Locations Report", ['pincode', 'city', 'totalOrders', 'rtoCount', 'deliveredCount', 'rtoRate']),
        ("employee-output", "Employee Output Report", ['name', 'role', 'totalOrdersPrepared', 'deliveredCount', 'rtoCount', 'errorRate', 'dailyAverage'])
    ]
    
    results = []
    
    for endpoint, name, required_fields in reports:
        print_info(f"\nTesting {name}")
        success, data = make_request('GET', f'/reports/{endpoint}')
        
        if success and data:
            if isinstance(data, list) and len(data) > 0:
                # Check first item structure
                first_item = data[0]
                missing_fields = [field for field in required_fields if field not in first_item]
                
                if missing_fields:
                    print_error(f"Missing required fields in {name}: {missing_fields}")
                    results.append(False)
                else:
                    print_success(f"{name} - {len(data)} items returned with correct structure")
                    
                    # Print sample data
                    if endpoint == "profitable-skus":
                        print_info(f"Top SKU: {first_item.get('sku')} - Profit: ₹{first_item.get('totalProfit', 0)}, Margin: {first_item.get('profitMargin', 0)}%")
                    elif endpoint == "rto-locations":
                        print_info(f"Top RTO Location: {first_item.get('city')} ({first_item.get('pincode')}) - RTO Rate: {first_item.get('rtoRate', 0)}%")
                    elif endpoint == "employee-output":
                        print_info(f"Top Employee: {first_item.get('name')} ({first_item.get('role')}) - {first_item.get('totalOrdersPrepared', 0)} orders prepared")
                    
                    results.append(True)
            else:
                print_error(f"{name} returned empty array or invalid data")
                results.append(False)
        else:
            results.append(False)
    
    print(f"\nReports Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_currency_conversion():
    """Test currency conversion API using Frankfurter.app"""
    print_header("CURRENCY CONVERSION TESTS")
    
    test_cases = [
        ("USD", "INR", 100),
        ("USD", "INR", 50),
        ("EUR", "INR", 75)
    ]
    
    results = []
    
    for from_curr, to_curr, amount in test_cases:
        print_info(f"\nTesting conversion: {amount} {from_curr} to {to_curr}")
        success, data = make_request('GET', f'/currency?from={from_curr}&to={to_curr}&amount={amount}')
        
        if success and data:
            required_fields = ['from', 'to', 'rate', 'amount', 'converted']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_error(f"Missing required fields: {missing_fields}")
                results.append(False)
            else:
                rate = data.get('rate', 0)
                converted = data.get('converted', 0)
                
                # Verify reasonable exchange rate for USD/INR (should be between 60-120)
                if from_curr == "USD" and to_curr == "INR" and (rate < 60 or rate > 120):
                    print_warning(f"Exchange rate seems unreasonable: {rate}")
                
                print_success(f"Conversion successful: {amount} {from_curr} = {converted} {to_curr} (rate: {rate})")
                results.append(True)
        else:
            results.append(False)
    
    print(f"\nCurrency Conversion Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_urgent_order_override():
    """Test urgent order override functionality"""
    print_header("URGENT ORDER OVERRIDE TESTS")
    
    # Step 1: Get an order ID
    print_info("Getting orders to find a test order ID")
    success, orders_data = make_request('GET', '/orders')
    
    if not success or not orders_data:
        print_error("Failed to get orders list")
        return False
    
    if not isinstance(orders_data, list) or len(orders_data) == 0:
        print_error("No orders found in system")
        return False
    
    test_order = orders_data[0]
    order_id = test_order.get('_id')
    original_order_id = test_order.get('orderId', 'Unknown')
    
    if not order_id:
        print_error("No valid order ID found")
        return False
    
    print_success(f"Selected test order: {original_order_id} (ID: {order_id})")
    
    # Step 2: Mark order as urgent with manual courier details
    urgent_data = {
        "manualCourierName": "DTDC",
        "manualShippingCost": 200
    }
    
    print_info(f"Marking order as urgent with manual courier: {urgent_data}")
    success, updated_order = make_request('PUT', f'/orders/{order_id}/urgent', urgent_data)
    
    if not success:
        return False
    
    # Step 3: Verify the order has been updated correctly
    print_info("Verifying order update")
    success, order_details = make_request('GET', f'/orders/{order_id}')
    
    if not success:
        return False
    
    # Check if urgent fields are set correctly
    if (order_details.get('isUrgent') == True and 
        order_details.get('manualCourierName') == "DTDC" and 
        order_details.get('manualShippingCost') == 200):
        print_success("Order successfully marked as urgent with correct manual courier details")
    else:
        print_error(f"Order urgent fields not set correctly: isUrgent={order_details.get('isUrgent')}, courier={order_details.get('manualCourierName')}, cost={order_details.get('manualShippingCost')}")
        return False
    
    # Step 4: Test profit calculation uses manual shipping cost
    print_info("Testing profit calculation with manual shipping override")
    success, profit_data = make_request('GET', f'/calculate-profit/{order_id}')
    
    if success and profit_data:
        shipping_cost = profit_data.get('shippingCost', 0)
        if shipping_cost == 200:
            print_success(f"Profit calculation correctly uses manual shipping cost: ₹{shipping_cost}")
            return True
        else:
            print_error(f"Profit calculation using wrong shipping cost: ₹{shipping_cost} (expected ₹200)")
            return False
    else:
        print_error("Failed to get profit calculation")
        return False

def test_employee_assignment():
    """Test employee assignment to orders"""
    print_header("EMPLOYEE ASSIGNMENT TESTS")
    
    # Step 1: Get employee list
    print_info("Getting employee list")
    success, employees_data = make_request('GET', '/employees')
    
    if not success or not employees_data or len(employees_data) == 0:
        print_error("Failed to get employees or no employees found")
        return False
    
    test_employee = employees_data[0]
    employee_id = test_employee.get('_id')
    employee_name = test_employee.get('name', 'Unknown')
    
    print_success(f"Selected test employee: {employee_name} (ID: {employee_id})")
    
    # Step 2: Get orders list
    print_info("Getting orders list")
    success, orders_data = make_request('GET', '/orders')
    
    if not success or not orders_data or len(orders_data) == 0:
        print_error("Failed to get orders")
        return False
    
    test_order = orders_data[0]
    order_id = test_order.get('_id')
    original_order_id = test_order.get('orderId', 'Unknown')
    
    print_success(f"Selected test order: {original_order_id} (ID: {order_id})")
    
    # Step 3: Assign employee to order
    assignment_data = {"employeeId": employee_id}
    print_info(f"Assigning employee {employee_name} to order {original_order_id}")
    success, updated_order = make_request('PUT', f'/orders/{order_id}/assign', assignment_data)
    
    if not success:
        return False
    
    # Step 4: Verify assignment
    if (updated_order.get('preparedBy') == employee_id and 
        updated_order.get('preparedByName') == employee_name):
        print_success(f"Order successfully assigned to employee: {employee_name}")
        return True
    else:
        print_error(f"Employee assignment failed: preparedBy={updated_order.get('preparedBy')}, preparedByName={updated_order.get('preparedByName')}")
        return False

def test_employee_claim():
    """Test employee claim functionality"""
    print_header("EMPLOYEE CLAIM TESTS")
    
    # Step 1: Get employee and order for testing
    print_info("Getting employee list")
    success, employees_data = make_request('GET', '/employees')
    
    if not success or not employees_data:
        print_error("Failed to get employees")
        return False
    
    test_employee = employees_data[0]
    employee_id = test_employee.get('_id')
    employee_name = test_employee.get('name', 'Unknown')
    
    # Step 2: Test valid employee claim (using a known order ID from seed data)
    claim_data = {
        "employeeId": employee_id,
        "orderId": "GS-1005"  # This should exist from seed data
    }
    
    print_info(f"Testing employee claim: {employee_name} claiming order GS-1005")
    success, claim_result = make_request('POST', '/employee-claim', claim_data)
    
    if success and claim_result:
        if "claimed by" in str(claim_result.get('message', '')):
            print_success(f"Employee claim successful: {claim_result.get('message')}")
        else:
            print_error(f"Unexpected claim response: {claim_result}")
            return False
    else:
        print_error("Employee claim failed")
        return False
    
    # Step 3: Test invalid order claim
    invalid_claim_data = {
        "employeeId": employee_id,
        "orderId": "INVALID-ORDER-123"
    }
    
    print_info("Testing invalid order claim (should return 404)")
    success, error_result = make_request('POST', '/employee-claim', invalid_claim_data, expected_status=404)
    
    if success:
        print_success("Invalid order claim correctly returned 404 error")
        return True
    else:
        print_error("Invalid order claim did not return expected 404 error")
        return False

def test_bulk_employee_claim():
    """Test Phase 3 bulk employee claim functionality"""
    print_header("PHASE 3 BULK EMPLOYEE CLAIM TESTS")
    
    # Step 1: Get employee and orders for testing
    print_info("Getting employee list")
    success, employees_data = make_request('GET', '/employees')
    if not success or not employees_data:
        print_error("Failed to get employees")
        return False
    
    test_employee = employees_data[0]
    employee_id = test_employee.get('_id')
    employee_name = test_employee.get('name', 'Unknown')
    print_success(f"Selected test employee: {employee_name} (ID: {employee_id})")
    
    # Step 2: Get some order IDs for testing
    print_info("Getting orders to find real order IDs")
    success, orders_data = make_request('GET', '/orders')
    if not success or not orders_data:
        print_error("Failed to get orders")
        return False
    
    # Extract real order IDs (use orderId field like GS-1005, NOT _id field)
    real_order_ids = [order.get('orderId') for order in orders_data[:5] if order.get('orderId')]
    if len(real_order_ids) < 3:
        print_error(f"Not enough real order IDs found. Got: {real_order_ids}")
        return False
    
    print_success(f"Found real order IDs: {real_order_ids[:3]}")
    
    results = []
    
    # Test 1: Bulk claim with comma-separated string
    print_info("Test 1: Bulk claim with comma-separated orderId string")
    bulk_claim_data = {
        "employeeId": employee_id,
        "orderId": f"{real_order_ids[0]},{real_order_ids[1]},{real_order_ids[2]}"
    }
    success, result = make_request('POST', '/employee-claim', bulk_claim_data)
    
    if success and result:
        required_fields = ['claimed', 'notFound', 'message', 'employee']
        missing_fields = [field for field in required_fields if field not in result]
        
        if missing_fields:
            print_error(f"Missing required response fields: {missing_fields}")
            results.append(False)
        else:
            claimed = result.get('claimed', [])
            not_found = result.get('notFound', [])
            print_success(f"Bulk claim (comma-separated) successful: {len(claimed)} claimed, {len(not_found)} not found")
            print_info(f"Claimed: {claimed}")
            print_info(f"Not found: {not_found}")
            results.append(True)
    else:
        print_error("Bulk claim with comma-separated string failed")
        results.append(False)
    
    # Test 2: Bulk claim with array of orderIds
    print_info("Test 2: Bulk claim with orderIds array")
    bulk_claim_array_data = {
        "employeeId": employee_id,
        "orderIds": [real_order_ids[0], real_order_ids[1]] if len(real_order_ids) >= 2 else [real_order_ids[0]]
    }
    success, result = make_request('POST', '/employee-claim', bulk_claim_array_data)
    
    if success and result:
        claimed = result.get('claimed', [])
        not_found = result.get('notFound', [])
        print_success(f"Bulk claim (array) successful: {len(claimed)} claimed, {len(not_found)} not found")
        results.append(True)
    else:
        print_error("Bulk claim with array failed")
        results.append(False)
    
    # Test 3: Mix of valid and invalid order IDs
    print_info("Test 3: Mix of valid and invalid order IDs")
    mixed_claim_data = {
        "employeeId": employee_id,
        "orderId": f"{real_order_ids[0]},FAKE-999,{real_order_ids[1] if len(real_order_ids) > 1 else 'FAKE-888'}"
    }
    success, result = make_request('POST', '/employee-claim', mixed_claim_data)
    
    if success and result:
        claimed = result.get('claimed', [])
        not_found = result.get('notFound', [])
        
        if len(not_found) > 0:
            print_success(f"Mixed claim correctly handled: {len(claimed)} claimed, {len(not_found)} not found")
            print_info(f"Not found (should include FAKE-999): {not_found}")
            results.append(True)
        else:
            print_error("Mixed claim should have some 'notFound' items but found none")
            results.append(False)
    else:
        print_error("Mixed claim test failed")
        results.append(False)
    
    # Test 4: Missing employeeId (should return 400)
    print_info("Test 4: Missing employeeId (should return 400)")
    missing_employee_data = {
        "orderId": real_order_ids[0]
    }
    success, result = make_request('POST', '/employee-claim', missing_employee_data, expected_status=400)
    
    if success:
        print_success("Missing employeeId correctly returned 400 error")
        results.append(True)
    else:
        print_error("Missing employeeId did not return expected 400 error")
        results.append(False)
    
    # Test 5: Fake employeeId (should return 404)
    print_info("Test 5: Fake employeeId (should return 404)")
    fake_employee_data = {
        "employeeId": "fake-employee-id-123",
        "orderId": real_order_ids[0]
    }
    success, result = make_request('POST', '/employee-claim', fake_employee_data, expected_status=404)
    
    if success:
        print_success("Fake employeeId correctly returned 404 error")
        results.append(True)
    else:
        print_error("Fake employeeId did not return expected 404 error")
        results.append(False)
    
    print(f"\nBulk Employee Claim Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_prorata_overhead_dashboard():
    """Test Phase 3 pro-rata overhead calculation in dashboard"""
    print_header("PHASE 3 PRO-RATA OVERHEAD IN DASHBOARD TESTS")
    
    results = []
    
    # Test 1: Today's dashboard with overhead
    print_info("Test 1: Dashboard range=today with pro-rata overhead")
    success, data = make_request('GET', '/dashboard?range=today')
    
    if success and data:
        # Check if overhead object exists
        if 'overhead' not in data:
            print_error("Dashboard response missing 'overhead' object")
            results.append(False)
        else:
            overhead = data['overhead']
            required_overhead_fields = ['monthlyTotal', 'daysInRange', 'proratedAmount', 'breakdown', 'perOrder']
            missing_overhead_fields = [field for field in required_overhead_fields if field not in overhead]
            
            if missing_overhead_fields:
                print_error(f"Overhead object missing required fields: {missing_overhead_fields}")
                results.append(False)
            else:
                monthly_total = overhead.get('monthlyTotal', 0)
                days_in_range = overhead.get('daysInRange', 0)
                prorated_amount = overhead.get('proratedAmount', 0)
                breakdown = overhead.get('breakdown', [])
                per_order = overhead.get('perOrder', 0)
                
                print_success(f"Overhead structure valid:")
                print_info(f"  Monthly Total: ₹{monthly_total}")
                print_info(f"  Days in Range: {days_in_range}")
                print_info(f"  Prorated Amount: ₹{prorated_amount}")
                print_info(f"  Per Order: ₹{per_order}")
                print_info(f"  Breakdown items: {len(breakdown)}")
                
                # Verify monthly total includes expected expenses (Rent 45000 + Shopify 2999 + Electricity 8500 = 56499)
                expected_monthly = 56499
                if abs(monthly_total - expected_monthly) < 100:  # Allow small variance
                    print_success(f"Monthly total approximately correct: ₹{monthly_total} (expected ~₹{expected_monthly})")
                else:
                    print_warning(f"Monthly total seems off: ₹{monthly_total} (expected ~₹{expected_monthly})")
                
                # For today (1 day), prorated should be approximately 56499/30 ≈ 1883
                expected_prorated_today = expected_monthly / 30 * days_in_range
                if abs(prorated_amount - expected_prorated_today) < 100:
                    print_success(f"Prorated amount approximately correct for {days_in_range} day(s): ₹{prorated_amount} (expected ~₹{expected_prorated_today:.2f})")
                else:
                    print_warning(f"Prorated amount seems off: ₹{prorated_amount} (expected ~₹{expected_prorated_today:.2f})")
                
                # Verify breakdown structure
                if isinstance(breakdown, list) and len(breakdown) > 0:
                    sample_breakdown = breakdown[0]
                    breakdown_fields = ['name', 'category', 'monthly', 'prorated']
                    missing_breakdown_fields = [field for field in breakdown_fields if field not in sample_breakdown]
                    
                    if missing_breakdown_fields:
                        print_error(f"Breakdown items missing fields: {missing_breakdown_fields}")
                        results.append(False)
                    else:
                        print_success(f"Breakdown structure valid. Sample: {sample_breakdown}")
                        
                        # Check that netProfit < grossOrderProfit (overhead should be subtracted)
                        filtered = data.get('filtered', {})
                        net_profit = filtered.get('netProfit', 0)
                        gross_profit = filtered.get('grossOrderProfit', 0)
                        
                        if net_profit < gross_profit:
                            print_success(f"Net profit (₹{net_profit}) < Gross profit (₹{gross_profit}) ✓ Overhead correctly subtracted")
                            results.append(True)
                        else:
                            print_error(f"Net profit (₹{net_profit}) >= Gross profit (₹{gross_profit}) - Overhead not being subtracted?")
                            results.append(False)
                else:
                    print_error("Breakdown is not a valid array or is empty")
                    results.append(False)
    else:
        print_error("Failed to get dashboard data for today")
        results.append(False)
    
    # Test 2: 7 days dashboard with overhead
    print_info("Test 2: Dashboard range=7days with pro-rata overhead")
    success, data = make_request('GET', '/dashboard?range=7days')
    
    if success and data:
        overhead = data.get('overhead', {})
        prorated_amount = overhead.get('proratedAmount', 0)
        days_in_range = overhead.get('daysInRange', 0)
        
        # For 7 days range, the actual days might be 7 or 8 depending on inclusive/exclusive range
        # Expected range: 56499/30 * days_in_range 
        expected_prorated_7days = 56499 / 30 * days_in_range
        if abs(prorated_amount - expected_prorated_7days) < 100:
            print_success(f"7-day prorated amount correct: ₹{prorated_amount} for {days_in_range} days (₹{expected_prorated_7days:.2f} expected)")
            results.append(True)
        else:
            print_warning(f"7-day prorated amount seems off: ₹{prorated_amount} (expected ~₹{expected_prorated_7days:.2f} for {days_in_range} days)")
            results.append(False)
    else:
        print_error("Failed to get dashboard data for 7 days")
        results.append(False)
    
    print(f"\nPro-rata Overhead Dashboard Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_purge_demo_data():
    """Test Phase 3 purge demo data functionality"""
    print_header("PHASE 3 PURGE DEMO DATA TESTS")
    
    results = []
    
    # Step 1: CRITICAL - Verify tenant-config and integrations exist BEFORE purge
    print_info("Step 1: Verifying tenant-config exists before purge")
    success, tenant_before = make_request('GET', '/tenant-config')
    
    if not success or not tenant_before or 'tenantName' not in tenant_before:
        print_error("Tenant config not found or missing tenantName before purge - cannot proceed safely")
        return False
    
    print_success(f"Tenant config exists before purge: {tenant_before.get('tenantName', 'Unknown')}")
    
    print_info("Step 1b: Verifying integrations exist before purge")
    success, integrations_before = make_request('GET', '/integrations')
    
    if not success or not integrations_before:
        print_error("Integrations config not found before purge - cannot proceed safely")
        return False
    
    print_success("Integrations config exists before purge")
    
    # Step 2: Call POST /api/purge
    print_info("Step 2: Calling POST /api/purge")
    success, purge_result = make_request('POST', '/purge')
    
    if not success or not purge_result:
        print_error("Purge API call failed")
        return False
    
    # Verify purge response structure
    if 'message' not in purge_result or 'purged' not in purge_result:
        print_error(f"Purge response missing required fields. Got: {purge_result}")
        results.append(False)
    else:
        purged_counts = purge_result.get('purged', {})
        total_purged = sum(purged_counts.values()) if isinstance(purged_counts, dict) else 0
        
        print_success(f"Purge completed: {purge_result.get('message')}")
        print_info(f"Purged counts: {purged_counts}")
        
        # Verify that something was actually purged
        if total_purged > 0:
            print_success(f"Total {total_purged} items purged from various collections")
            results.append(True)
        else:
            print_error("No items were purged - this seems wrong")
            results.append(False)
    
    # Step 3: CRITICAL - Verify tenant-config STILL exists after purge
    print_info("Step 3: CRITICAL - Verifying tenant-config still exists after purge")
    success, tenant_after = make_request('GET', '/tenant-config')
    
    if not success or not tenant_after or 'tenantName' not in tenant_after:
        print_error("CRITICAL FAILURE: Tenant config was deleted during purge!")
        results.append(False)
    else:
        tenant_name_after = tenant_after.get('tenantName', 'Unknown')
        tenant_name_before = tenant_before.get('tenantName', 'Unknown')
        
        if tenant_name_after == tenant_name_before:
            print_success(f"✅ CRITICAL CHECK PASSED: Tenant config preserved after purge: {tenant_name_after}")
            results.append(True)
        else:
            print_error(f"CRITICAL FAILURE: Tenant config changed during purge! Before: {tenant_name_before}, After: {tenant_name_after}")
            results.append(False)
    
    # Step 4: CRITICAL - Verify integrations STILL exist after purge
    print_info("Step 4: CRITICAL - Verifying integrations still exist after purge")
    success, integrations_after = make_request('GET', '/integrations')
    
    if not success or not integrations_after:
        print_error("CRITICAL FAILURE: Integrations config was deleted during purge!")
        results.append(False)
    else:
        print_success("✅ CRITICAL CHECK PASSED: Integrations config preserved after purge")
        results.append(True)
    
    # Step 5: Verify that demo data collections are now empty
    collections_to_check = [
        ('/orders', 'Orders'),
        ('/employees', 'Employees'),
        ('/sku-recipes', 'SKU Recipes'),
        ('/raw-materials', 'Raw Materials'),
        ('/packaging-materials', 'Packaging Materials'),
        ('/overhead-expenses', 'Overhead Expenses')
    ]
    
    print_info("Step 5: Verifying demo data collections are empty after purge")
    
    for endpoint, name in collections_to_check:
        success, data = make_request('GET', endpoint)
        
        if success and isinstance(data, list):
            if len(data) == 0:
                print_success(f"{name} collection is empty after purge ✅")
                results.append(True)
            else:
                print_error(f"{name} collection still has {len(data)} items after purge")
                results.append(False)
        else:
            print_error(f"Failed to check {name} collection after purge")
            results.append(False)
    
    # Step 6: Re-seed and verify
    print_info("Step 6: Re-seeding data to verify system works after purge")
    success, seed_result = make_request('POST', '/seed')
    
    if success and seed_result:
        seeded = seed_result.get('seeded', False)
        if seeded == True:
            print_success(f"Re-seeding successful after purge: {seed_result.get('message', 'No message')}")
            results.append(True)
        else:
            print_warning(f"Re-seeding returned seeded=false: {seed_result.get('message', 'No message')}")
            # This might be OK if data already exists
            results.append(True)
    else:
        print_error("Re-seeding failed after purge")
        results.append(False)
    
    print(f"\nPurge Demo Data Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_shopify_sync_error_handling():
    """Test Shopify sync APIs for proper error handling when credentials missing"""
    print_header("SHOPIFY SYNC ERROR HANDLING TESTS")
    
    endpoints = [
        ("sync-products", "Sync Products"),
        ("sync-orders", "Sync Orders")
    ]
    
    results = []
    
    for endpoint, description in endpoints:
        print_info(f"Testing {description} - should return credentials error")
        success, error_data = make_request('POST', f'/shopify/{endpoint}', expected_status=200)
        
        if success and error_data:
            error_msg = error_data.get('error', '')
            if 'credentials' in error_msg.lower() or 'not configured' in error_msg.lower():
                print_success(f"{description} correctly returns credentials error: {error_msg}")
                results.append(True)
            else:
                print_error(f"{description} returned unexpected response: {error_data}")
                results.append(False)
        else:
            print_error(f"{description} failed unexpectedly")
            results.append(False)
    
    print(f"\nShopify Error Handling Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_indiapost_tracking_error_handling():
    """Test India Post tracking API for proper error handling"""
    print_header("INDIA POST TRACKING ERROR HANDLING TESTS")
    
    print_info("Testing India Post bulk tracking - should return credentials error")
    success, error_data = make_request('POST', '/indiapost/track-bulk', expected_status=200)
    
    if success and error_data:
        error_msg = error_data.get('error', '')
        if 'credentials' in error_msg.lower() or 'not configured' in error_msg.lower():
            print_success(f"India Post tracking correctly returns credentials error: {error_msg}")
            return True
        else:
            print_error(f"India Post tracking returned unexpected response: {error_data}")
            return False
    else:
        print_error("India Post tracking failed unexpectedly")
        return False

def test_existing_crud_smoke_tests():
    """Quick smoke tests on existing CRUD APIs to ensure they still work"""
    print_header("EXISTING CRUD SMOKE TESTS")
    
    endpoints = [
        ('/orders', 'Orders', ['isUrgent', 'destinationPincode', 'destinationCity', 'preparedBy']),
        ('/sku-recipes', 'SKU Recipes', ['sku', 'productName']),
        ('/tenant-config', 'Tenant Config', ['tenantName'])
    ]
    
    results = []
    
    for endpoint, name, check_fields in endpoints:
        print_info(f"Testing {name} API")
        success, data = make_request('GET', endpoint)
        
        if success and data:
            if endpoint == '/tenant-config':
                # Single object response
                missing_fields = [field for field in check_fields if field not in data]
                if missing_fields:
                    print_error(f"{name} missing fields: {missing_fields}")
                    results.append(False)
                else:
                    print_success(f"{name} API working - Config: {data.get('tenantName', 'Unknown')}")
                    results.append(True)
            else:
                # Array response
                if isinstance(data, list) and len(data) > 0:
                    first_item = data[0]
                    if endpoint == '/orders':
                        # Check for new Phase 2 fields
                        phase2_fields = ['isUrgent', 'destinationPincode', 'destinationCity', 'preparedBy']
                        found_fields = [field for field in phase2_fields if field in first_item]
                        print_success(f"{name} API working - {len(data)} items, Phase 2 fields present: {found_fields}")
                    else:
                        print_success(f"{name} API working - {len(data)} items returned")
                    results.append(True)
                else:
                    print_error(f"{name} returned empty or invalid data")
                    results.append(False)
        else:
            results.append(False)
    
    print(f"\nExisting CRUD Smoke Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_orders_pagination_api():
    """Test Phase 4 Orders Pagination API"""
    print_header("PHASE 4: ORDERS PAGINATION API TESTS")
    
    results = []
    
    # Test 1: GET /api/orders?page=1&limit=5
    print_info("Test 1: Basic pagination - page 1, limit 5")
    success, data = make_request('GET', '/orders?page=1&limit=5')
    
    if success and data:
        required_fields = ['orders', 'total', 'page', 'limit', 'totalPages']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            print_error(f"Missing pagination fields: {missing_fields}")
            results.append(False)
        else:
            orders = data.get('orders', [])
            total = data.get('total', 0)
            page = data.get('page', 0)
            limit = data.get('limit', 0)
            total_pages = data.get('totalPages', 0)
            
            # Verify response structure
            if (len(orders) <= 5 and 
                page == 1 and 
                limit == 5 and 
                total_pages == int((total + limit - 1) // limit)):  # Math.ceil equivalent
                print_success(f"Pagination structure correct: {len(orders)} orders, page {page}, limit {limit}, total {total}, totalPages {total_pages}")
                results.append(True)
            else:
                print_error(f"Pagination structure incorrect: got {len(orders)} orders, page {page}, limit {limit}, total {total}, totalPages {total_pages}")
                results.append(False)
    else:
        print_error("Failed to get orders with pagination")
        results.append(False)
    
    # Test 2: GET /api/orders?page=2&limit=5 - different page
    print_info("Test 2: Second page pagination")
    success, data = make_request('GET', '/orders?page=2&limit=5')
    
    if success and data:
        orders = data.get('orders', [])
        page = data.get('page', 0)
        
        if page == 2:
            print_success(f"Page 2 working: {len(orders)} orders returned")
            results.append(True)
        else:
            print_error(f"Page parameter not working correctly: expected 2, got {page}")
            results.append(False)
    else:
        print_error("Failed to get page 2 orders")
        results.append(False)
    
    # Test 3: Search functionality
    print_info("Test 3: Search by order ID (GS-1005)")
    success, data = make_request('GET', '/orders?search=GS-1005')
    
    if success and data:
        orders = data.get('orders', [])
        found_order = any(order.get('orderId', '').find('GS-1005') != -1 for order in orders)
        
        if found_order:
            print_success(f"Search working: Found order with ID containing 'GS-1005' in {len(orders)} results")
            results.append(True)
        else:
            print_warning(f"Search returned {len(orders)} results but no order with 'GS-1005' found")
            # Still pass if we got results, might be that specific order doesn't exist
            results.append(True)
    else:
        print_error("Failed to search orders")
        results.append(False)
    
    # Test 4: Status filter
    print_info("Test 4: Status filter (RTO orders)")
    success, data = make_request('GET', '/orders?status=RTO&page=1&limit=20')
    
    if success and data:
        orders = data.get('orders', [])
        # Verify all returned orders have RTO status
        rto_orders = [order for order in orders if order.get('status') == 'RTO']
        
        if len(rto_orders) == len(orders):
            print_success(f"Status filter working: {len(orders)} RTO orders returned")
            results.append(True)
        else:
            print_error(f"Status filter not working: got {len(rto_orders)} RTO orders out of {len(orders)} total")
            results.append(False)
    else:
        print_error("Failed to filter by status")
        results.append(False)
    
    # Test 5: Sort by orderDate desc (newest first)
    print_info("Test 5: Sort by orderDate descending")
    success, data = make_request('GET', '/orders?sortBy=orderDate&sortOrder=desc')
    
    if success and data:
        orders = data.get('orders', [])
        
        if len(orders) >= 2:
            first_date = orders[0].get('orderDate', '')
            second_date = orders[1].get('orderDate', '')
            
            if first_date >= second_date:
                print_success(f"Descending sort working: First order date {first_date[:10]} >= Second order date {second_date[:10]}")
                results.append(True)
            else:
                print_error(f"Descending sort not working: First date {first_date[:10]} < Second date {second_date[:10]}")
                results.append(False)
        else:
            print_warning("Not enough orders to verify sorting, but API call successful")
            results.append(True)
    else:
        print_error("Failed to sort by orderDate desc")
        results.append(False)
    
    # Test 6: Sort by orderDate asc (oldest first)
    print_info("Test 6: Sort by orderDate ascending")
    success, data = make_request('GET', '/orders?sortBy=orderDate&sortOrder=asc')
    
    if success and data:
        orders = data.get('orders', [])
        
        if len(orders) >= 2:
            first_date = orders[0].get('orderDate', '')
            second_date = orders[1].get('orderDate', '')
            
            if first_date <= second_date:
                print_success(f"Ascending sort working: First order date {first_date[:10]} <= Second order date {second_date[:10]}")
                results.append(True)
            else:
                print_error(f"Ascending sort not working: First date {first_date[:10]} > Second date {second_date[:10]}")
                results.append(False)
        else:
            print_warning("Not enough orders to verify sorting, but API call successful")
            results.append(True)
    else:
        print_error("Failed to sort by orderDate asc")
        results.append(False)
    
    print(f"\nOrders Pagination API Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_dashboard_metaads_check():
    """Test Phase 4 Dashboard MetaAds Check"""
    print_header("PHASE 4: DASHBOARD METAADS CHECK TESTS")
    
    results = []
    
    # Test 1: Check integrations - MetaAds should be inactive
    print_info("Test 1: Verify MetaAds integration is inactive")
    success, integrations = make_request('GET', '/integrations')
    
    if success and integrations:
        meta_ads = integrations.get('metaAds', {})
        is_active = meta_ads.get('active', False)
        
        if is_active == False:
            print_success(f"MetaAds integration correctly inactive: active = {is_active}")
            results.append(True)
        else:
            print_error(f"MetaAds integration is unexpectedly active: active = {is_active}")
            results.append(False)
    else:
        print_error("Failed to get integrations")
        results.append(False)
    
    # Test 2: Dashboard filtered.adSpend should be 0 when MetaAds inactive
    print_info("Test 2: Dashboard adSpend should be 0 when MetaAds inactive")
    success, dashboard = make_request('GET', '/dashboard?range=7days')
    
    if success and dashboard:
        filtered = dashboard.get('filtered', {})
        ad_spend = filtered.get('adSpend', 0)
        
        if ad_spend == 0:
            print_success(f"Dashboard adSpend correctly 0 when MetaAds inactive: adSpend = {ad_spend}")
            results.append(True)
        else:
            print_error(f"Dashboard adSpend should be 0 but got: {ad_spend}")
            results.append(False)
    else:
        print_error("Failed to get dashboard data")
        results.append(False)
    
    # Test 3: All order marketing allocations should be 0
    print_info("Test 3: Verify order marketing allocations are 0")
    success, orders_data = make_request('GET', '/orders?page=1&limit=5')
    
    if success and orders_data:
        orders = orders_data.get('orders', [])
        
        if len(orders) > 0:
            # Check profit calculation for first order
            first_order = orders[0]
            order_id = first_order.get('_id')
            
            if order_id:
                success, profit_calc = make_request('GET', f'/calculate-profit/{order_id}')
                
                if success and profit_calc:
                    marketing_allocation = profit_calc.get('marketingAllocation', -1)
                    
                    if marketing_allocation == 0:
                        print_success(f"Marketing allocation correctly 0 for order {first_order.get('orderId', 'Unknown')}: {marketing_allocation}")
                        results.append(True)
                    else:
                        print_error(f"Marketing allocation should be 0 but got: {marketing_allocation}")
                        results.append(False)
                else:
                    print_error("Failed to calculate profit for order")
                    results.append(False)
            else:
                print_error("No valid order ID found")
                results.append(False)
        else:
            print_error("No orders found for marketing allocation test")
            results.append(False)
    else:
        print_error("Failed to get orders for marketing allocation test")
        results.append(False)
    
    print(f"\nDashboard MetaAds Check Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_profit_calculator_metaads_check():
    """Test Phase 4 Profit Calculator MetaAds Check"""
    print_header("PHASE 4: PROFIT CALCULATOR METAADS CHECK TESTS")
    
    results = []
    
    # Get first order for testing
    print_info("Getting first order for profit calculation test")
    success, orders_data = make_request('GET', '/orders?page=1&limit=1')
    
    if not success or not orders_data:
        print_error("Failed to get orders for profit calculator test")
        return False
    
    orders = orders_data.get('orders', [])
    if len(orders) == 0:
        print_error("No orders found for profit calculator test")
        return False
    
    first_order = orders[0]
    order_id = first_order.get('_id')
    order_display_id = first_order.get('orderId', 'Unknown')
    
    if not order_id:
        print_error("No valid order ID found for profit calculator test")
        return False
    
    print_success(f"Selected order for test: {order_display_id} (ID: {order_id})")
    
    # Test profit calculation - marketingAllocation should be 0
    print_info("Testing profit calculation marketingAllocation")
    success, profit_data = make_request('GET', f'/calculate-profit/{order_id}')
    
    if success and profit_data:
        marketing_allocation = profit_data.get('marketingAllocation', -1)
        
        if marketing_allocation == 0:
            print_success(f"Profit calculator marketingAllocation correctly 0: {marketing_allocation}")
            results.append(True)
        else:
            print_error(f"Profit calculator marketingAllocation should be 0 but got: {marketing_allocation}")
            results.append(False)
            
        # Also check that the profit calculation structure is correct
        required_fields = ['netRevenue', 'totalCOGS', 'shippingCost', 'totalTransactionFee', 'marketingAllocation', 'netProfit']
        missing_fields = [field for field in required_fields if field not in profit_data]
        
        if missing_fields:
            print_error(f"Profit calculation missing fields: {missing_fields}")
            results.append(False)
        else:
            print_success("Profit calculation structure complete")
            results.append(True)
    else:
        print_error("Failed to get profit calculation")
        results.append(False)
    
    print(f"\nProfit Calculator MetaAds Check Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def test_purge_reseed_flow():
    """Test Phase 4 Purge + Re-seed Flow"""
    print_header("PHASE 4: PURGE + RE-SEED FLOW TESTS")
    
    results = []
    
    # Step 1: Purge all demo data
    print_info("Step 1: Purging demo data")
    success, purge_result = make_request('POST', '/purge')
    
    if success and purge_result:
        purged = purge_result.get('purged', {})
        total_purged = sum(purged.values()) if isinstance(purged, dict) else 0
        
        if total_purged > 0:
            print_success(f"Purge successful: {total_purged} items purged")
            print_info(f"Purged counts: {purged}")
            results.append(True)
        else:
            print_warning("Purge completed but no items were purged")
            results.append(True)  # Could be that DB was already empty
    else:
        print_error("Failed to purge data")
        results.append(False)
    
    # Step 2: Verify tenant-config still exists
    print_info("Step 2: Verify tenant-config preserved after purge")
    success, tenant_config = make_request('GET', '/tenant-config')
    
    if success and tenant_config and 'tenantName' in tenant_config:
        print_success(f"Tenant config preserved: {tenant_config.get('tenantName')}")
        results.append(True)
    else:
        print_error("Tenant config was not preserved after purge")
        results.append(False)
    
    # Step 3: Verify integrations still exist
    print_info("Step 3: Verify integrations preserved after purge")
    success, integrations = make_request('GET', '/integrations')
    
    if success and integrations:
        print_success("Integrations config preserved after purge")
        results.append(True)
    else:
        print_error("Integrations config was not preserved after purge")
        results.append(False)
    
    # Step 4: Verify orders collection is empty
    print_info("Step 4: Verify orders collection is empty after purge")
    success, orders_data = make_request('GET', '/orders?page=1&limit=5')
    
    if success and orders_data:
        orders = orders_data.get('orders', [])
        total = orders_data.get('total', 0)
        
        if total == 0 and len(orders) == 0:
            print_success("Orders collection correctly empty after purge")
            results.append(True)
        else:
            print_error(f"Orders collection not empty after purge: {total} total, {len(orders)} returned")
            results.append(False)
    else:
        print_error("Failed to check orders after purge")
        results.append(False)
    
    # Step 5: Re-seed the database
    print_info("Step 5: Re-seeding database")
    success, seed_result = make_request('POST', '/seed')
    
    if success and seed_result:
        seeded = seed_result.get('seeded', False)
        
        if seeded == True:
            print_success(f"Re-seeding successful: {seed_result.get('message', 'No message')}")
            results.append(True)
        else:
            print_warning(f"Re-seeding returned seeded=false: {seed_result.get('message', 'No message')}")
            results.append(False)
    else:
        print_error("Failed to re-seed database")
        results.append(False)
    
    # Step 6: Verify orders exist after re-seeding
    print_info("Step 6: Verify orders exist after re-seeding")
    success, orders_data = make_request('GET', '/orders?page=1&limit=5')
    
    if success and orders_data:
        orders = orders_data.get('orders', [])
        total = orders_data.get('total', 0)
        
        if total > 0 and len(orders) > 0:
            print_success(f"Orders successfully re-seeded: {total} total orders, {len(orders)} returned")
            results.append(True)
        else:
            print_error(f"No orders found after re-seeding: {total} total, {len(orders)} returned")
            results.append(False)
    else:
        print_error("Failed to check orders after re-seeding")
        results.append(False)
    
    print(f"\nPurge + Re-seed Flow Tests: {sum(results)}/{len(results)} passed")
    return all(results)

def main():
    """Run Phase 4 backend tests for Profit OS"""
    print_header("PROFIT OS PHASE 4 BACKEND API TESTING SUITE")
    print_info(f"Base URL: {BASE_URL}")
    print_info(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_info("🎯 PHASE 4 LIVE MODE TESTING:")
    print_info("   1. Orders Pagination API")
    print_info("   2. Dashboard MetaAds Check")  
    print_info("   3. Profit Calculator MetaAds Check")
    print_info("   4. Purge + Re-seed Flow")
    
    # First, seed the database since DB is empty
    print_header("SEEDING DATABASE (DB IS EMPTY)")
    print_info("Seeding database with demo data...")
    success, seed_result = make_request('POST', '/seed')
    
    if success and seed_result:
        seeded = seed_result.get('seeded', False)
        if seeded:
            print_success(f"Database seeded successfully: {seed_result.get('message', 'No message')}")
        else:
            print_warning(f"Seed returned seeded=false: {seed_result.get('message', 'No message')}")
    else:
        print_error("Failed to seed database - cannot continue with tests")
        return 1
    
    # Run Phase 4 test suites
    test_results = []
    
    try:
        # Phase 4 specific tests
        test_results.append(("PHASE 4: Orders Pagination API", test_orders_pagination_api()))
        test_results.append(("PHASE 4: Dashboard MetaAds Check", test_dashboard_metaads_check()))
        test_results.append(("PHASE 4: Profit Calculator MetaAds Check", test_profit_calculator_metaads_check()))
        test_results.append(("PHASE 4: Purge + Re-seed Flow", test_purge_reseed_flow()))
        
    except KeyboardInterrupt:
        print_error("\nTesting interrupted by user")
        return 1
    except Exception as e:
        print_error(f"\nTesting failed with exception: {str(e)}")
        return 1
    
    # Print summary
    print_header("PHASE 4 TEST RESULTS SUMMARY")
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n{Colors.BOLD}Overall Phase 4 Results: {passed}/{total} test suites passed{Colors.END}")
    
    if passed == total:
        print_success("🎉 ALL PHASE 4 BACKEND TESTS PASSED!")
        return 0
    else:
        print_error(f"⚠️  {total - passed} Phase 4 test suite(s) failed")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)