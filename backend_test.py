#!/usr/bin/env python3
"""
PHASE 9 - RAZORPAY INTEGRATION BACKEND TESTING
Base URL: https://profit-os.preview.emergentagent.com/api

Tests the following NEW Razorpay endpoints and features:
1. GET /api/razorpay/settlements - Should return inactive response when no keys configured
2. POST /api/razorpay/sync-payments - Should return error about missing credentials
3. GET /api/dashboard?range=7days - Should include revenueSplit object
4. PUT /api/integrations - Save Razorpay credentials with proper structure
5. GET /api/integrations - Verify credential masking after saving
6. Profit calculator verification - totalTxnFees present with predictive 2%+GST
"""

import requests
import json
import sys

BASE_URL = "https://profit-os.preview.emergentagent.com/api"

def print_test_result(test_name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"   Details: {details}")
    return passed

def safe_request(method, url, **kwargs):
    try:
        response = requests.request(method, url, timeout=30, **kwargs)
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error for {url}: {e}")
        return None

def test_razorpay_settlements_no_keys():
    """Test GET /api/razorpay/settlements with no Razorpay keys configured"""
    print("\n🎯 TEST 1: RAZORPAY SETTLEMENTS - NO KEYS CONFIGURED")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/razorpay/settlements")
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Razorpay settlements endpoint", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check structure
        required_fields = ['settlements', 'error', 'active']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return print_test_result("Response structure", False, f"Missing fields: {missing_fields}")
        
        # Check expected values for no keys
        tests_passed = 0
        total_tests = 3
        
        if data.get('settlements') == []:
            tests_passed += 1
            print("✓ settlements is empty array")
        else:
            print(f"✗ settlements expected [], got {data.get('settlements')}")
        
        if data.get('error') is None:
            tests_passed += 1
            print("✓ error is null")
        else:
            print(f"✗ error expected null, got {data.get('error')}")
        
        if data.get('active') == False:
            tests_passed += 1
            print("✓ active is false")
        else:
            print(f"✗ active expected false, got {data.get('active')}")
        
        return print_test_result("Razorpay settlements (no keys)", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Razorpay settlements", False, f"Exception: {e}")

def test_razorpay_sync_payments_no_credentials():
    """Test POST /api/razorpay/sync-payments with missing credentials"""
    print("\n🎯 TEST 2: RAZORPAY SYNC PAYMENTS - NO CREDENTIALS")
    
    try:
        response = safe_request('POST', f"{BASE_URL}/razorpay/sync-payments", 
                              json={}, 
                              headers={'Content-Type': 'application/json'})
        if not response:
            return False
            
        data = response.json()
        
        # Should return an error about missing credentials
        if 'error' not in data:
            return print_test_result("Sync payments error handling", False, "No error field in response")
        
        error_msg = data.get('error', '').lower()
        has_credential_error = any(keyword in error_msg for keyword in ['credential', 'key', 'secret', 'razorpay'])
        
        if not has_credential_error:
            return print_test_result("Sync payments error message", False, f"Expected credentials error, got: {data.get('error')}")
        
        # Check synced count is 0
        synced_value = data.get('synced', None)
        if synced_value != 0:
            return print_test_result("Sync count when no credentials", False, f"Expected synced=0, got {synced_value}")
        
        return print_test_result("Razorpay sync payments (no credentials)", True, f"Proper error: {data.get('error')}")
        
    except Exception as e:
        return print_test_result("Razorpay sync payments", False, f"Exception: {e}")

def test_dashboard_revenue_split():
    """Test GET /api/dashboard?range=7days includes revenueSplit object"""
    print("\n🎯 TEST 3: DASHBOARD REVENUE SPLIT OBJECT")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/dashboard", 
                              params={'range': '7days'})
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Dashboard API", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check revenueSplit exists
        if 'revenueSplit' not in data:
            return print_test_result("Revenue split object", False, "Missing revenueSplit in dashboard response")
        
        revenue_split = data['revenueSplit']
        
        # Check required structure
        required_keys = ['prepaid', 'cod', 'unknown', 'totalRevenue']
        missing_keys = [key for key in required_keys if key not in revenue_split]
        if missing_keys:
            return print_test_result("Revenue split structure", False, f"Missing keys: {missing_keys}")
        
        # Check prepaid structure
        prepaid = revenue_split['prepaid']
        required_prepaid_keys = ['revenue', 'count', 'percent']
        missing_prepaid = [key for key in required_prepaid_keys if key not in prepaid]
        if missing_prepaid:
            return print_test_result("Prepaid structure", False, f"Missing prepaid keys: {missing_prepaid}")
        
        # Check cod structure  
        cod = revenue_split['cod']
        required_cod_keys = ['revenue', 'count', 'percent']
        missing_cod = [key for key in required_cod_keys if key not in cod]
        if missing_cod:
            return print_test_result("COD structure", False, f"Missing cod keys: {missing_cod}")
        
        # Check unknown structure
        unknown = revenue_split['unknown']
        required_unknown_keys = ['revenue', 'count']
        missing_unknown = [key for key in required_unknown_keys if key not in unknown]
        if missing_unknown:
            return print_test_result("Unknown structure", False, f"Missing unknown keys: {missing_unknown}")
        
        # Verify totalRevenue calculation
        calculated_total = prepaid['revenue'] + cod['revenue'] + unknown['revenue']
        actual_total = revenue_split['totalRevenue']
        
        if abs(calculated_total - actual_total) > 0.01:
            return print_test_result("Total revenue calculation", False, 
                                   f"Calculated {calculated_total} != Actual {actual_total}")
        
        # Since Razorpay hasn't been synced, most should be in "unknown" category
        print(f"   Revenue split: Prepaid: ₹{prepaid['revenue']} ({prepaid['count']} orders), COD: ₹{cod['revenue']} ({cod['count']} orders), Unknown: ₹{unknown['revenue']} ({unknown['count']} orders)")
        
        return print_test_result("Dashboard revenue split", True, f"Total revenue: ₹{actual_total}")
        
    except Exception as e:
        return print_test_result("Dashboard revenue split", False, f"Exception: {e}")

def test_save_razorpay_integrations():
    """Test PUT /api/integrations with Razorpay credentials"""
    print("\n🎯 TEST 4: SAVE RAZORPAY CREDENTIALS")
    
    try:
        # First get current integrations to preserve other settings
        response = safe_request('GET', f"{BASE_URL}/integrations")
        if not response or response.status_code != 200:
            return print_test_result("Get integrations before save", False, "Could not fetch current integrations")
        
        current_integrations = response.json()
        
        # Update with test Razorpay credentials
        updated_integrations = {
            **current_integrations,
            'razorpay': {
                'keyId': 'rzp_test_123',
                'keySecret': 'test_secret_123'
            }
        }
        
        # Save the updated integrations
        response = safe_request('PUT', f"{BASE_URL}/integrations",
                              json=updated_integrations,
                              headers={'Content-Type': 'application/json'})
        
        if not response:
            return False
            
        if response.status_code not in [200, 201]:
            return print_test_result("Save Razorpay credentials", False, f"Expected 200/201, got {response.status_code}")
        
        return print_test_result("Save Razorpay credentials", True, "Credentials saved successfully")
        
    except Exception as e:
        return print_test_result("Save Razorpay credentials", False, f"Exception: {e}")

def test_get_masked_integrations():
    """Test GET /api/integrations shows masked Razorpay credentials"""
    print("\n🎯 TEST 5: GET MASKED RAZORPAY CREDENTIALS")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/integrations")
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Get integrations", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check if razorpay section exists
        if 'razorpay' not in data:
            return print_test_result("Razorpay integration section", False, "No razorpay section in integrations")
        
        razorpay = data['razorpay']
        
        # Check keyId is visible
        if 'keyId' not in razorpay:
            return print_test_result("Razorpay keyId", False, "keyId missing from razorpay section")
        
        key_id = razorpay['keyId']
        if key_id != 'rzp_test_123':
            return print_test_result("Razorpay keyId value", False, f"Expected 'rzp_test_123', got '{key_id}'")
        
        # Check keySecret is masked
        if 'keySecret' not in razorpay:
            return print_test_result("Razorpay keySecret", False, "keySecret missing from razorpay section")
        
        key_secret = razorpay['keySecret']
        
        # Should be masked (e.g., "***********123")
        is_masked = '*' in key_secret and key_secret.endswith('123')
        
        if not is_masked:
            return print_test_result("Razorpay keySecret masking", False, f"Expected masked secret ending with '123', got '{key_secret}'")
        
        print(f"   KeyId: {key_id}")
        print(f"   KeySecret: {key_secret} (properly masked)")
        
        return print_test_result("Razorpay credentials masking", True, "keyId visible, keySecret properly masked")
        
    except Exception as e:
        return print_test_result("Get masked integrations", False, f"Exception: {e}")

def test_profit_calculator_txn_fees():
    """Test profit calculator still has totalTxnFees present"""
    print("\n🎯 TEST 6: PROFIT CALCULATOR TXN FEES VERIFICATION")
    
    try:
        # First get some orders to test with
        response = safe_request('GET', f"{BASE_URL}/orders", params={'page': 1, 'limit': 1})
        if not response or response.status_code != 200:
            return print_test_result("Get orders for profit test", False, "Could not fetch orders")
        
        data = response.json()
        if not data.get('orders') or len(data['orders']) == 0:
            return print_test_result("Orders available", False, "No orders available for profit calculation test")
        
        order = data['orders'][0]
        order_id = order['_id']
        
        # Test profit calculation
        response = safe_request('GET', f"{BASE_URL}/calculate-profit/{order_id}")
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Profit calculation API", False, f"Expected 200, got {response.status_code}")
        
        profit_data = response.json()
        
        # Check totalTxnFees is present and > 0 (using predictive 2%+GST)
        if 'totalTransactionFee' not in profit_data:
            return print_test_result("Transaction fees field", False, "totalTransactionFee missing from profit calculation")
        
        txn_fee = profit_data['totalTransactionFee']
        if not isinstance(txn_fee, (int, float)) or txn_fee <= 0:
            return print_test_result("Transaction fees value", False, f"Expected positive number, got {txn_fee}")
        
        # Verify it's using predictive calculation (approximately 2% + GST)
        net_revenue = profit_data.get('netRevenue', 0)
        if net_revenue > 0:
            expected_fee = net_revenue * 0.02 * 1.18  # 2% + 18% GST
            fee_ratio = txn_fee / expected_fee if expected_fee > 0 else 0
            
            # Should be close to 1.0 (within reasonable range for predictive calculation)
            if 0.8 <= fee_ratio <= 1.2:
                print(f"   Transaction fee: ₹{txn_fee:.2f} (predictive 2%+GST calculation)")
                return print_test_result("Profit calculator transaction fees", True, f"Predictive fees working: ₹{txn_fee:.2f}")
            else:
                return print_test_result("Predictive fee calculation", False, f"Fee ratio {fee_ratio:.2f} outside expected range")
        else:
            return print_test_result("Net revenue for calculation", False, f"Invalid net revenue: {net_revenue}")
        
    except Exception as e:
        return print_test_result("Profit calculator transaction fees", False, f"Exception: {e}")

def cleanup_test_data():
    """Clean up test data by restoring original integrations"""
    print("\n🧹 CLEANUP: Restoring Original Integrations")
    
    try:
        # Get current integrations
        response = safe_request('GET', f"{BASE_URL}/integrations")
        if not response or response.status_code != 200:
            print("⚠️  Could not fetch integrations for cleanup")
            return False
        
        current_integrations = response.json()
        
        # Reset Razorpay to empty state
        updated_integrations = {
            **current_integrations,
            'razorpay': {
                'keyId': '',
                'keySecret': '', 
                'active': False
            }
        }
        
        # Save the cleaned integrations
        response = safe_request('PUT', f"{BASE_URL}/integrations",
                              json=updated_integrations,
                              headers={'Content-Type': 'application/json'})
        
        if response and response.status_code in [200, 201]:
            print("✅ Razorpay credentials cleared successfully")
            return True
        else:
            print(f"⚠️  Failed to clear Razorpay credentials: {response.status_code if response else 'No response'}")
            return False
        
    except Exception as e:
        print(f"⚠️  Cleanup exception: {e}")
        return False

def main():
    print("🚀 PHASE 9 - RAZORPAY INTEGRATION BACKEND TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print("Testing Razorpay integration endpoints and features...")
    
    all_tests = []
    
    # Test 1: Razorpay settlements with no keys
    all_tests.append(test_razorpay_settlements_no_keys())
    
    # Test 2: Razorpay sync payments error handling
    all_tests.append(test_razorpay_sync_payments_no_credentials())
    
    # Test 3: Dashboard revenue split 
    all_tests.append(test_dashboard_revenue_split())
    
    # Test 4: Save Razorpay credentials
    all_tests.append(test_save_razorpay_integrations())
    
    # Test 5: Get masked credentials
    all_tests.append(test_get_masked_integrations())
    
    # Test 6: Profit calculator transaction fees
    all_tests.append(test_profit_calculator_txn_fees())
    
    # Cleanup
    cleanup_success = cleanup_test_data()
    
    # Summary
    passed_tests = sum(all_tests)
    total_tests = len(all_tests)
    
    print("\n" + "=" * 60)
    print("📊 RAZORPAY INTEGRATION TEST RESULTS")
    print("=" * 60)
    print(f"✅ Passed: {passed_tests}/{total_tests} tests")
    
    if passed_tests == total_tests:
        print("🎉 ALL RAZORPAY INTEGRATION TESTS PASSED!")
        if cleanup_success:
            print("🧹 Cleanup completed successfully")
        else:
            print("⚠️  Cleanup had issues but tests passed")
    else:
        print("❌ Some tests failed - check details above")
        failed_tests = total_tests - passed_tests
        print(f"🔍 {failed_tests} test(s) need attention")
    
    print("=" * 60)
    
    return passed_tests == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)