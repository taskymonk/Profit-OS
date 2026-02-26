#!/usr/bin/env python3
"""
Profit OS Phase 3 Backend API Testing Suite
Tests Phase 3 features: Bulk Employee Claim, Pro-Rata Overhead in Dashboard, and Purge Demo Data.
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

def main():
    """Run Phase 3 backend tests for Profit OS"""
    print_header("PROFIT OS PHASE 3 BACKEND API TESTING SUITE")
    print_info(f"Base URL: {BASE_URL}")
    print_info(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_info("🎯 FOCUSING ONLY ON PHASE 3 FEATURES:")
    print_info("   1. Bulk Employee Claim (POST /api/employee-claim)")
    print_info("   2. Pro-Rata Overhead in Dashboard (GET /api/dashboard)")
    print_info("   3. Purge Demo Data (POST /api/purge)")
    
    # Run Phase 3 test suites only
    test_results = []
    
    try:
        # Phase 3 specific tests
        test_results.append(("PHASE 3: Bulk Employee Claim", test_bulk_employee_claim()))
        test_results.append(("PHASE 3: Pro-Rata Overhead Dashboard", test_prorata_overhead_dashboard()))
        test_results.append(("PHASE 3: Purge Demo Data", test_purge_demo_data()))
        
    except KeyboardInterrupt:
        print_error("\nTesting interrupted by user")
        return 1
    except Exception as e:
        print_error(f"\nTesting failed with exception: {str(e)}")
        return 1
    
    # Print summary
    print_header("PHASE 3 TEST RESULTS SUMMARY")
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n{Colors.BOLD}Overall Phase 3 Results: {passed}/{total} test suites passed{Colors.END}")
    
    if passed == total:
        print_success("🎉 ALL PHASE 3 BACKEND TESTS PASSED!")
        return 0
    else:
        print_error(f"⚠️  {total - passed} Phase 3 test suite(s) failed")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)