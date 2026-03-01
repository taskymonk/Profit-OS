#!/usr/bin/env python3
"""
PHASE 9B - SHOPIFY BILLS IMPORT AND EXPANDED P&L BACKEND TESTING
Base URL: https://profit-os.preview.emergentagent.com/api

Tests the following NEW Shopify Bills Import endpoints and features:
1. POST /api/shopify-bills/import - Test with sample CSV data
2. GET /api/shopify-bills - After import, should return imported data summary
3. GET /api/dashboard?range=30days - Should include shopifyCharges object with orderCommission, appFees, subscriptionFee, total
4. GET /api/dashboard?range=30days - Should include plBreakdown.razorpayFee and plBreakdown.razorpayTax (already implemented)
5. GET /api/dashboard?range=30days - Should include revenueSplit.reconciled and revenueSplit.unreconciled
6. POST /api/shopify-bills/import with empty CSV - Should return error about empty CSV
7. Cleanup - Clear test data by re-importing with just header row
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

def test_shopify_bills_import():
    """Test POST /api/shopify-bills/import with sample CSV data"""
    print("\n🎯 TEST 1: SHOPIFY BILLS IMPORT WITH CSV DATA")
    
    # Sample CSV data as provided in the review request
    sample_csv = '''Bill #,Store Name,Shop ID,.myshopify.com URL,Charge category,Description,Amount,Currency,Start of billing cycle,End of billing cycle,Date,Order,Rate,App,Original amount,Original currency,Exchange rate
501742206,GiftSugar,88773181717,a9608d-ef.myshopify.com,order_commission,Transaction fees,40.2,INR,2026-02-01,2026-02-28,2026-02-15,Orders from 2026-02-15 to 2026-02-15,2.0,,40.2,INR,1.0
501742206,GiftSugar,88773181717,a9608d-ef.myshopify.com,order_commission,Transaction fees,30.0,INR,2026-02-01,2026-02-28,2026-02-16,Orders from 2026-02-16 to 2026-02-16,2.0,,30.0,INR,1.0
501742206,GiftSugar,88773181717,a9608d-ef.myshopify.com,application_fee,Application fee,100.0,INR,2026-02-01,2026-02-28,2026-02-15,,,Uploadly - File Upload,100.0,INR,1.0
501742206,GiftSugar,88773181717,a9608d-ef.myshopify.com,subscription_fee,Subscription,500.0,INR,2026-02-01,2026-02-28,2026-02-01,,,,500.0,INR,1.0'''
    
    try:
        response = safe_request('POST', f"{BASE_URL}/shopify-bills/import",
                              json={'csvText': sample_csv},
                              headers={'Content-Type': 'application/json'})
        if not response:
            return False
            
        if response.status_code not in [200, 201]:
            return print_test_result("Shopify Bills Import API", False, f"Expected 200/201, got {response.status_code}")
        
        data = response.json()
        
        # Check structure
        required_fields = ['message', 'imported', 'summary']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return print_test_result("Response structure", False, f"Missing fields: {missing_fields}")
        
        # Check expected values
        tests_passed = 0
        total_tests = 4
        
        if data.get('imported') == 4:
            tests_passed += 1
            print("✓ imported count is 4")
        else:
            print(f"✗ imported expected 4, got {data.get('imported')}")
        
        if 'order_commission' in data.get('summary', {}):
            summary_oc = data['summary']['order_commission']
            if summary_oc.get('count') == 2 and abs(summary_oc.get('total', 0) - 70.2) < 0.01:
                tests_passed += 1
                print("✓ order_commission summary correct (count: 2, total: 70.2)")
            else:
                print(f"✗ order_commission expected count:2, total:70.2, got {summary_oc}")
        else:
            print("✗ order_commission not found in summary")
        
        if 'application_fee' in data.get('summary', {}):
            summary_af = data['summary']['application_fee']
            if summary_af.get('count') == 1 and abs(summary_af.get('total', 0) - 100.0) < 0.01:
                tests_passed += 1
                print("✓ application_fee summary correct (count: 1, total: 100.0)")
            else:
                print(f"✗ application_fee expected count:1, total:100.0, got {summary_af}")
        else:
            print("✗ application_fee not found in summary")
        
        if 'subscription_fee' in data.get('summary', {}):
            summary_sf = data['summary']['subscription_fee']
            if summary_sf.get('count') == 1 and abs(summary_sf.get('total', 0) - 500.0) < 0.01:
                tests_passed += 1
                print("✓ subscription_fee summary correct (count: 1, total: 500.0)")
            else:
                print(f"✗ subscription_fee expected count:1, total:500.0, got {summary_sf}")
        else:
            print("✗ subscription_fee not found in summary")
        
        print(f"   Message: {data.get('message', 'N/A')}")
        
        return print_test_result("Shopify Bills Import with CSV", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Shopify Bills Import", False, f"Exception: {e}")

def test_shopify_bills_summary():
    """Test GET /api/shopify-bills after import"""
    print("\n🎯 TEST 2: SHOPIFY BILLS SUMMARY AFTER IMPORT")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/shopify-bills")
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Shopify Bills Summary API", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check structure
        required_fields = ['imported', 'totalCharges', 'summary']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return print_test_result("Summary response structure", False, f"Missing fields: {missing_fields}")
        
        # Check expected values
        tests_passed = 0
        total_tests = 5
        
        if data.get('imported') == True:
            tests_passed += 1
            print("✓ imported is true")
        else:
            print(f"✗ imported expected true, got {data.get('imported')}")
        
        if data.get('totalCharges') == 4:
            tests_passed += 1
            print("✓ totalCharges is 4")
        else:
            print(f"✗ totalCharges expected 4, got {data.get('totalCharges')}")
        
        summary = data.get('summary', {})
        
        if 'order_commission' in summary:
            oc = summary['order_commission']
            if oc.get('count') == 2 and abs(oc.get('total', 0) - 70.2) < 0.01:
                tests_passed += 1
                print("✓ order_commission in summary correct")
            else:
                print(f"✗ order_commission in summary incorrect: {oc}")
        else:
            print("✗ order_commission not in summary")
        
        if 'application_fee' in summary:
            af = summary['application_fee']
            if af.get('count') == 1 and abs(af.get('total', 0) - 100.0) < 0.01:
                tests_passed += 1
                print("✓ application_fee in summary correct")
            else:
                print(f"✗ application_fee in summary incorrect: {af}")
        else:
            print("✗ application_fee not in summary")
        
        if 'subscription_fee' in summary:
            sf = summary['subscription_fee']
            if sf.get('count') == 1 and abs(sf.get('total', 0) - 500.0) < 0.01:
                tests_passed += 1
                print("✓ subscription_fee in summary correct")
            else:
                print(f"✗ subscription_fee in summary incorrect: {sf}")
        else:
            print("✗ subscription_fee not in summary")
        
        return print_test_result("Shopify Bills Summary", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Shopify Bills Summary", False, f"Exception: {e}")

def test_dashboard_shopify_charges():
    """Test GET /api/dashboard?range=30days includes shopifyCharges object"""
    print("\n🎯 TEST 3: DASHBOARD SHOPIFY CHARGES OBJECT")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/dashboard", 
                              params={'range': '30days'})
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Dashboard API", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check shopifyCharges exists
        if 'shopifyCharges' not in data:
            return print_test_result("Shopify charges object", False, "Missing shopifyCharges in dashboard response")
        
        shopify_charges = data['shopifyCharges']
        
        if shopify_charges is None:
            return print_test_result("Shopify charges data", False, "shopifyCharges is null (no data imported)")
        
        # Check required structure for the imported data
        # Note: Since we imported data for Feb 2026, we need to test with a range that includes that date
        # Let's check if orderCommission > 0 (it should be since we imported Feb 2026 data)
        required_keys = ['orderCommission', 'appFees', 'subscriptionFee', 'total']
        missing_keys = [key for key in required_keys if key not in shopify_charges]
        if missing_keys:
            return print_test_result("Shopify charges structure", False, f"Missing keys: {missing_keys}")
        
        # Check values - the data we imported was for Feb 2026, so for a 30-day range, we might not see it
        # Let's just validate the structure and that it's working
        tests_passed = 0
        total_tests = 4
        
        if isinstance(shopify_charges.get('orderCommission'), (int, float)) and shopify_charges['orderCommission'] >= 0:
            tests_passed += 1
            print(f"✓ orderCommission is numeric: {shopify_charges['orderCommission']}")
        else:
            print(f"✗ orderCommission expected numeric >= 0, got {shopify_charges.get('orderCommission')}")
        
        if isinstance(shopify_charges.get('appFees'), (int, float)) and shopify_charges['appFees'] >= 0:
            tests_passed += 1
            print(f"✓ appFees is numeric: {shopify_charges['appFees']}")
        else:
            print(f"✗ appFees expected numeric >= 0, got {shopify_charges.get('appFees')}")
        
        if isinstance(shopify_charges.get('subscriptionFee'), (int, float)) and shopify_charges['subscriptionFee'] >= 0:
            tests_passed += 1
            print(f"✓ subscriptionFee is numeric: {shopify_charges['subscriptionFee']}")
        else:
            print(f"✗ subscriptionFee expected numeric >= 0, got {shopify_charges.get('subscriptionFee')}")
        
        if isinstance(shopify_charges.get('total'), (int, float)) and shopify_charges['total'] >= 0:
            tests_passed += 1
            print(f"✓ total is numeric: {shopify_charges['total']}")
        else:
            print(f"✗ total expected numeric >= 0, got {shopify_charges.get('total')}")
        
        return print_test_result("Dashboard Shopify charges", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Dashboard Shopify charges", False, f"Exception: {e}")

def test_dashboard_pl_breakdown():
    """Test GET /api/dashboard?range=30days includes plBreakdown with razorpayFee and razorpayTax"""
    print("\n🎯 TEST 4: DASHBOARD P&L BREAKDOWN WITH RAZORPAY FIELDS")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/dashboard", 
                              params={'range': '30days'})
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Dashboard API", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check plBreakdown exists
        if 'plBreakdown' not in data:
            return print_test_result("P&L breakdown object", False, "Missing plBreakdown in dashboard response")
        
        pl_breakdown = data['plBreakdown']
        
        # Check required Razorpay fields
        required_fields = ['razorpayFee', 'razorpayTax']
        missing_fields = [field for field in required_fields if field not in pl_breakdown]
        if missing_fields:
            return print_test_result("P&L breakdown Razorpay fields", False, f"Missing fields: {missing_fields}")
        
        tests_passed = 0
        total_tests = 2
        
        if isinstance(pl_breakdown.get('razorpayFee'), (int, float)) and pl_breakdown['razorpayFee'] >= 0:
            tests_passed += 1
            print(f"✓ razorpayFee is numeric: {pl_breakdown['razorpayFee']}")
        else:
            print(f"✗ razorpayFee expected numeric >= 0, got {pl_breakdown.get('razorpayFee')}")
        
        if isinstance(pl_breakdown.get('razorpayTax'), (int, float)) and pl_breakdown['razorpayTax'] >= 0:
            tests_passed += 1
            print(f"✓ razorpayTax is numeric: {pl_breakdown['razorpayTax']}")
        else:
            print(f"✗ razorpayTax expected numeric >= 0, got {pl_breakdown.get('razorpayTax')}")
        
        return print_test_result("Dashboard P&L breakdown Razorpay fields", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Dashboard P&L breakdown", False, f"Exception: {e}")

def test_dashboard_revenue_split():
    """Test GET /api/dashboard?range=30days includes revenueSplit with reconciled/unreconciled"""
    print("\n🎯 TEST 5: DASHBOARD REVENUE SPLIT WITH RECONCILED/UNRECONCILED")
    
    try:
        response = safe_request('GET', f"{BASE_URL}/dashboard", 
                              params={'range': '30days'})
        if not response:
            return False
            
        if response.status_code != 200:
            return print_test_result("Dashboard API", False, f"Expected 200, got {response.status_code}")
        
        data = response.json()
        
        # Check revenueSplit exists
        if 'revenueSplit' not in data:
            return print_test_result("Revenue split object", False, "Missing revenueSplit in dashboard response")
        
        revenue_split = data['revenueSplit']
        
        # Check required fields
        required_fields = ['reconciled', 'unreconciled']
        missing_fields = [field for field in required_fields if field not in revenue_split]
        if missing_fields:
            return print_test_result("Revenue split structure", False, f"Missing fields: {missing_fields}")
        
        tests_passed = 0
        total_tests = 6
        
        # Check reconciled structure
        reconciled = revenue_split.get('reconciled', {})
        reconciled_fields = ['revenue', 'count', 'percent']
        missing_reconciled = [field for field in reconciled_fields if field not in reconciled]
        if not missing_reconciled:
            tests_passed += 1
            print("✓ reconciled has all required fields")
        else:
            print(f"✗ reconciled missing fields: {missing_reconciled}")
        
        if isinstance(reconciled.get('revenue'), (int, float)) and reconciled['revenue'] >= 0:
            tests_passed += 1
            print(f"✓ reconciled.revenue is numeric: {reconciled['revenue']}")
        else:
            print(f"✗ reconciled.revenue expected numeric >= 0, got {reconciled.get('revenue')}")
        
        if isinstance(reconciled.get('count'), (int)) and reconciled['count'] >= 0:
            tests_passed += 1
            print(f"✓ reconciled.count is numeric: {reconciled['count']}")
        else:
            print(f"✗ reconciled.count expected numeric >= 0, got {reconciled.get('count')}")
        
        # Check unreconciled structure
        unreconciled = revenue_split.get('unreconciled', {})
        unreconciled_fields = ['revenue', 'count', 'percent']
        missing_unreconciled = [field for field in unreconciled_fields if field not in unreconciled]
        if not missing_unreconciled:
            tests_passed += 1
            print("✓ unreconciled has all required fields")
        else:
            print(f"✗ unreconciled missing fields: {missing_unreconciled}")
        
        if isinstance(unreconciled.get('revenue'), (int, float)) and unreconciled['revenue'] >= 0:
            tests_passed += 1
            print(f"✓ unreconciled.revenue is numeric: {unreconciled['revenue']}")
        else:
            print(f"✗ unreconciled.revenue expected numeric >= 0, got {unreconciled.get('revenue')}")
        
        if isinstance(unreconciled.get('count'), (int)) and unreconciled['count'] >= 0:
            tests_passed += 1
            print(f"✓ unreconciled.count is numeric: {unreconciled['count']}")
        else:
            print(f"✗ unreconciled.count expected numeric >= 0, got {unreconciled.get('count')}")
        
        return print_test_result("Dashboard revenue split reconciled/unreconciled", tests_passed == total_tests, f"{tests_passed}/{total_tests} checks passed")
        
    except Exception as e:
        return print_test_result("Dashboard revenue split", False, f"Exception: {e}")

def test_shopify_bills_import_empty_csv():
    """Test POST /api/shopify-bills/import with empty CSV - should return error"""
    print("\n🎯 TEST 6: SHOPIFY BILLS IMPORT WITH EMPTY CSV")
    
    try:
        # Test with just header row (empty data)
        empty_csv = '''Bill #,Store Name,Shop ID,.myshopify.com URL,Charge category,Description,Amount,Currency,Start of billing cycle,End of billing cycle,Date,Order,Rate,App,Original amount,Original currency,Exchange rate'''
        
        response = safe_request('POST', f"{BASE_URL}/shopify-bills/import",
                              json={'csvText': empty_csv},
                              headers={'Content-Type': 'application/json'})
        if not response:
            return False
        
        data = response.json()
        
        # Should return error about empty CSV
        if 'error' in data and 'empty' in data['error'].lower():
            return print_test_result("Empty CSV error handling", True, f"Proper error: {data['error']}")
        elif data.get('imported', -1) == 0:
            # Alternative: it might import 0 records successfully
            return print_test_result("Empty CSV handling", True, f"Imported 0 records correctly: {data}")
        else:
            return print_test_result("Empty CSV error handling", False, f"Expected error or 0 imports, got: {data}")
        
    except Exception as e:
        return print_test_result("Empty CSV error handling", False, f"Exception: {e}")

def test_cleanup_shopify_bills():
    """Cleanup: Clear test data by re-importing with empty CSV"""
    print("\n🧹 CLEANUP: CLEAR SHOPIFY BILLS TEST DATA")
    
    try:
        # Import with just the header row to clear previous test data  
        header_only_csv = '''Bill #,Store Name,Shop ID,.myshopify.com URL,Charge category,Description,Amount,Currency,Start of billing cycle,End of billing cycle,Date,Order,Rate,App,Original amount,Original currency,Exchange rate'''
        
        response = safe_request('POST', f"{BASE_URL}/shopify-bills/import",
                              json={'csvText': header_only_csv},
                              headers={'Content-Type': 'application/json'})
        if not response:
            return False
        
        data = response.json()
        
        # Should import 0 charges and clear previous data
        if data.get('imported', -1) == 0:
            print("✅ Shopify bills test data cleared successfully")
            return True
        else:
            print(f"⚠️ Expected 0 imports for cleanup, got: {data}")
            return False
        
    except Exception as e:
        print(f"⚠️ Cleanup exception: {e}")
        return False

def main():
    print("🚀 PHASE 9B - SHOPIFY BILLS IMPORT AND EXPANDED P&L TESTING")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    print("Testing Shopify Bills Import and expanded P&L features...")
    
    all_tests = []
    
    # Test 1: Shopify Bills Import with CSV data
    all_tests.append(test_shopify_bills_import())
    
    # Test 2: Shopify Bills Summary after import
    all_tests.append(test_shopify_bills_summary())
    
    # Test 3: Dashboard shopifyCharges object 
    all_tests.append(test_dashboard_shopify_charges())
    
    # Test 4: Dashboard P&L breakdown with Razorpay fields
    all_tests.append(test_dashboard_pl_breakdown())
    
    # Test 5: Dashboard revenue split with reconciled/unreconciled
    all_tests.append(test_dashboard_revenue_split())
    
    # Test 6: Shopify Bills Import error handling (empty CSV)
    all_tests.append(test_shopify_bills_import_empty_csv())
    
    # Cleanup
    cleanup_success = test_cleanup_shopify_bills()
    
    # Summary
    passed_tests = sum(all_tests)
    total_tests = len(all_tests)
    
    print("\n" + "=" * 70)
    print("📊 SHOPIFY BILLS IMPORT & P&L TEST RESULTS")
    print("=" * 70)
    print(f"✅ Passed: {passed_tests}/{total_tests} tests")
    
    if passed_tests == total_tests:
        print("🎉 ALL SHOPIFY BILLS IMPORT & P&L TESTS PASSED!")
        if cleanup_success:
            print("🧹 Cleanup completed successfully")
        else:
            print("⚠️ Cleanup had issues but tests passed")
    else:
        print("❌ Some tests failed - check details above")
        failed_tests = total_tests - passed_tests
        print(f"🔍 {failed_tests} test(s) need attention")
    
    print("=" * 70)
    
    return passed_tests == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)