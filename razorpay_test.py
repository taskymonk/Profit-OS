#!/usr/bin/env python3
"""
Razorpay API Endpoints Testing
Base URL: https://erp-ocr-fix-1.preview.emergentagent.com/api

Tests 3 new Razorpay API endpoints:
1. GET /api/razorpay/reconciliation-summary - Reconciliation Summary
2. GET /api/razorpay/unmatched - Unmatched Payments List  
3. GET /api/razorpay/settlements - Settlements (verify data)
"""

import requests
import json
import sys

# Base URL from review request
BASE_URL = "https://erp-ocr-fix-1.preview.emergentagent.com/api"

def test_reconciliation_summary():
    """Test GET /api/razorpay/reconciliation-summary endpoint"""
    print("🎯 TESTING RECONCILIATION SUMMARY API...")
    
    try:
        print("  • Calling GET /api/razorpay/reconciliation-summary...")
        response = requests.get(f"{BASE_URL}/razorpay/reconciliation-summary")
        print(f"    Response Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"    ❌ API call failed with status {response.status_code}: {response.text}")
            return False
            
        data = response.json()
        print(f"    Response keys: {list(data.keys())}")
        
        # Required fields from spec
        required_fields = [
            'totalOrders', 'reconciledCount', 'unreconciledCount', 
            'reconciledRevenue', 'unreconciledRevenue', 'totalRevenue',
            'totalFees', 'totalTax', 'matchRate', 'effectiveFeeRate',
            'unmatchedPayments', 'lastSync'
        ]
        
        # Check all required fields exist
        missing_fields = []
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
                
        if missing_fields:
            print(f"    ❌ Missing required fields: {missing_fields}")
            return False
        
        print("    ✅ All required fields present")
        
        # Verify numeric values are numbers (not null/undefined)
        numeric_fields = [
            'totalOrders', 'reconciledCount', 'unreconciledCount',
            'reconciledRevenue', 'unreconciledRevenue', 'totalRevenue',
            'totalFees', 'totalTax', 'matchRate', 'effectiveFeeRate',
            'unmatchedPayments'
        ]
        
        for field in numeric_fields:
            if not isinstance(data[field], (int, float)):
                print(f"    ❌ Field '{field}' is not numeric: {data[field]} (type: {type(data[field])})")
                return False
                
        print("    ✅ All numeric values are valid numbers")
        
        # Verify matchRate and effectiveFeeRate are percentages (0-100)
        if not (0 <= data['matchRate'] <= 100):
            print(f"    ❌ matchRate should be 0-100%: {data['matchRate']}")
            return False
            
        if not (0 <= data['effectiveFeeRate'] <= 100):
            print(f"    ❌ effectiveFeeRate should be 0-100%: {data['effectiveFeeRate']}")
            return False
            
        print("    ✅ Percentage values are in valid range (0-100)")
        
        # Print summary for verification
        print(f"    Summary: {data['reconciledCount']}/{data['totalOrders']} orders reconciled")
        print(f"    Revenue: ₹{data['reconciledRevenue']:.2f} reconciled, ₹{data['unreconciledRevenue']:.2f} unreconciled")
        print(f"    Match Rate: {data['matchRate']:.2f}%, Fee Rate: {data['effectiveFeeRate']:.2f}%")
        
        return True
        
    except Exception as e:
        print(f"    ❌ Exception during reconciliation summary test: {e}")
        return False

def test_unmatched_payments():
    """Test GET /api/razorpay/unmatched endpoint"""
    print("🎯 TESTING UNMATCHED PAYMENTS API...")
    
    try:
        print("  • Calling GET /api/razorpay/unmatched...")
        response = requests.get(f"{BASE_URL}/razorpay/unmatched")
        print(f"    Response Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"    ❌ API call failed with status {response.status_code}: {response.text}")
            return False
            
        data = response.json()
        print(f"    Response structure: {type(data)}")
        
        # Should return JSON with payments array and total number
        if 'payments' not in data or 'total' not in data:
            print(f"    ❌ Response missing required structure. Expected 'payments' and 'total' fields")
            print(f"    Got keys: {list(data.keys())}")
            return False
            
        print("    ✅ Response has correct structure (payments, total)")
        
        # Verify total is a number
        if not isinstance(data['total'], int):
            print(f"    ❌ Total should be integer: {data['total']} (type: {type(data['total'])})")
            return False
            
        # Verify payments is array
        if not isinstance(data['payments'], list):
            print(f"    ❌ Payments should be array: {type(data['payments'])}")
            return False
            
        print(f"    ✅ Found {len(data['payments'])} unmatched payments (total: {data['total']})")
        
        # If there are payments, verify structure of first payment
        if len(data['payments']) > 0:
            payment = data['payments'][0]
            required_payment_fields = [
                '_id', 'paymentId', 'amount', 'contact', 'email', 
                'method', 'createdAt', 'fee', 'tax', 'status'
            ]
            
            missing_payment_fields = []
            for field in required_payment_fields:
                if field not in payment:
                    missing_payment_fields.append(field)
                    
            if missing_payment_fields:
                print(f"    ❌ Payment missing required fields: {missing_payment_fields}")
                print(f"    Payment fields: {list(payment.keys())}")
                return False
                
            print("    ✅ Payment structure is valid")
            print(f"    Sample payment: ID {payment['paymentId']}, Amount ₹{payment['amount']}")
        else:
            print("    ✅ No unmatched payments found (good for reconciliation)")
            
        return True
        
    except Exception as e:
        print(f"    ❌ Exception during unmatched payments test: {e}")
        return False

def test_settlements():
    """Test GET /api/razorpay/settlements endpoint (existing, verify data)"""
    print("🎯 TESTING SETTLEMENTS API...")
    
    try:
        print("  • Calling GET /api/razorpay/settlements...")
        response = requests.get(f"{BASE_URL}/razorpay/settlements")
        print(f"    Response Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"    ❌ API call failed with status {response.status_code}: {response.text}")
            return False
            
        data = response.json()
        print(f"    Response structure: {type(data)}")
        
        # Should return JSON with active boolean and settlements array
        if 'active' not in data or 'settlements' not in data:
            print(f"    ❌ Response missing required structure. Expected 'active' and 'settlements' fields")
            print(f"    Got keys: {list(data.keys())}")
            return False
            
        print("    ✅ Response has correct structure (active, settlements)")
        
        # Verify active is boolean
        if not isinstance(data['active'], bool):
            print(f"    ❌ Active should be boolean: {data['active']} (type: {type(data['active'])})")
            return False
            
        # Verify settlements is array  
        if not isinstance(data['settlements'], list):
            print(f"    ❌ Settlements should be array: {type(data['settlements'])}")
            return False
            
        print(f"    ✅ Razorpay integration active: {data['active']}")
        print(f"    ✅ Found {len(data['settlements'])} settlements")
        
        # If there are settlements, verify structure of first settlement
        if len(data['settlements']) > 0:
            settlement = data['settlements'][0]
            required_settlement_fields = ['id', 'amount', 'status', 'createdAt', 'utr']
            
            missing_settlement_fields = []
            for field in required_settlement_fields:
                if field not in settlement:
                    missing_settlement_fields.append(field)
                    
            if missing_settlement_fields:
                print(f"    ❌ Settlement missing required fields: {missing_settlement_fields}")
                print(f"    Settlement fields: {list(settlement.keys())}")
                return False
                
            print("    ✅ Settlement structure is valid")
            
            # Verify status is one of expected values
            valid_statuses = ['created', 'initiated', 'processed', 'failed']
            if settlement['status'] not in valid_statuses:
                print(f"    ❌ Settlement status should be one of {valid_statuses}: {settlement['status']}")
                return False
                
            print(f"    ✅ Settlement status is valid: {settlement['status']}")
            print(f"    Sample settlement: ID {settlement['id']}, Amount ₹{settlement['amount']}, Status: {settlement['status']}")
        else:
            print("    ℹ️  No settlements found")
            
        return True
        
    except Exception as e:
        print(f"    ❌ Exception during settlements test: {e}")
        return False

def main():
    """Main test runner"""
    print("=" * 80)
    print("RAZORPAY API ENDPOINTS TESTING")
    print(f"Base URL: {BASE_URL}")
    print("=" * 80)
    
    test_results = []
    
    # Test 1: Reconciliation Summary
    print("\n" + "=" * 60)
    reconciliation_result = test_reconciliation_summary()
    test_results.append(("Reconciliation Summary", reconciliation_result))
    
    # Test 2: Unmatched Payments List
    print("\n" + "=" * 60)
    unmatched_result = test_unmatched_payments()
    test_results.append(("Unmatched Payments List", unmatched_result))
    
    # Test 3: Settlements (verify data)
    print("\n" + "=" * 60)
    settlements_result = test_settlements()
    test_results.append(("Settlements (verify data)", settlements_result))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL RAZORPAY API TESTS PASSED!")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)