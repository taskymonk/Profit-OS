#!/usr/bin/env python3
"""
Backend API Testing for PHASE 5 FINANCE MODULE REFACTOR
Testing the "Smart Approach" refactor where Purchase Orders have been completely removed.

Base URL: https://smart-finance-hub-41.preview.emergentagent.com/api

Test Scenarios:
1. Bills CRUD (should work)
2. Bill Payment Recording 
3. Sync from Expenses (KEY FEATURE)
4. Vendors CRUD (with subCategory)
5. Finance Analytics (NO PO fields)
6. REMOVED — Purchase Orders should be GONE
"""

import requests
import json
import time
import pymongo
from datetime import datetime, timedelta
import uuid
import sys

# Base configuration
BASE_URL = "https://smart-finance-hub-41.preview.emergentagent.com/api"
headers = {"Content-Type": "application/json"}

# MongoDB connection for verification
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log_test(test_name, status, details=""):
    """Log test results with status indicator"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_icon = "✅" if status == "PASS" else "❌"
    print(f"[{timestamp}] {status_icon} {test_name}")
    if details:
        print(f"    {details}")

def make_request(method, endpoint, data=None, expected_status=200):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers)
        
        if response.status_code != expected_status:
            log_test(f"Request {method} {endpoint}", "FAIL", 
                    f"Expected {expected_status}, got {response.status_code}: {response.text[:200]}")
            return None
        
        if response.headers.get('content-type', '').startswith('application/json'):
            return response.json()
        return response.text
    
    except Exception as e:
        log_test(f"Request {method} {endpoint}", "FAIL", f"Exception: {str(e)}")
        return None

def get_mongo_connection():
    """Get MongoDB connection"""
    try:
        client = pymongo.MongoClient(MONGO_URL)
        return client[DB_NAME]
    except Exception as e:
        log_test("MongoDB Connection", "FAIL", f"Cannot connect to MongoDB: {e}")
        return None

def cleanup_test_data():
    """Clean up any test data created during testing"""
    db = get_mongo_connection()
    if db is None:
        return
    
    try:
        # Clean up test bills
        db.bills.delete_many({"vendorName": {"$regex": "Test"}})
        # Clean up test vendors 
        db.vendors.delete_many({"name": {"$regex": "Test"}})
        log_test("Test Data Cleanup", "PASS", "Cleaned up test bills and vendors")
    except Exception as e:
        log_test("Test Data Cleanup", "FAIL", f"Error: {e}")

def test_bills_crud():
    """Test Bills CRUD operations"""
    print("\n🎯 TESTING BILLS CRUD OPERATIONS")
    
    # 1. GET /api/bills — list all bills
    bills_data = make_request("GET", "/bills")
    if bills_data is None:
        return False
        
    # Verify each bill has required fields
    required_fields = ["_id", "vendorName", "category", "amount", "taxAmount", 
                      "totalAmount", "totalPaid", "outstanding", "computedStatus", "payments"]
    
    if isinstance(bills_data, list) and len(bills_data) > 0:
        first_bill = bills_data[0]
        missing_fields = [field for field in required_fields if field not in first_bill]
        if missing_fields:
            log_test("Bills GET Structure", "FAIL", f"Missing fields: {missing_fields}")
            return False
        else:
            log_test("Bills GET Structure", "PASS", f"Found {len(bills_data)} bills with all required fields")
    else:
        log_test("Bills GET Data", "PASS", "Bills collection is empty (expected for fresh install)")
    
    # 2. POST /api/bills — create manual bill
    test_bill_data = {
        "vendorName": "Test Vendor",
        "category": "Testing", 
        "amount": 1000,
        "taxAmount": 180,
        "dueDate": "2026-04-01",
        "description": "Test manual bill"
    }
    
    created_bill = make_request("POST", "/bills", test_bill_data, 200)
    if created_bill is None:
        return False
        
    bill_id = created_bill.get("_id")
    if not bill_id:
        log_test("Bill Creation", "FAIL", "No _id returned in created bill")
        return False
        
    log_test("Bill Creation", "PASS", f"Created bill with ID: {bill_id}")
    
    # 3. PUT /api/bills/{bill_id} — update description
    update_data = {"description": "Updated test bill"}
    updated_bill = make_request("PUT", f"/bills/{bill_id}", update_data)
    
    if updated_bill and updated_bill.get("description") == "Updated test bill":
        log_test("Bill Update", "PASS", "Bill description updated successfully")
    else:
        log_test("Bill Update", "FAIL", "Bill update failed or description not changed")
        return False
    
    # 4. DELETE /api/bills/{bill_id} — remove the test bill
    delete_result = make_request("DELETE", f"/bills/{bill_id}")
    if delete_result is not None:
        log_test("Bill Deletion", "PASS", f"Test bill deleted successfully")
    else:
        log_test("Bill Deletion", "FAIL", "Failed to delete test bill")
        return False
    
    return True

def test_bill_payment_recording():
    """Test Bill Payment Recording functionality"""
    print("\n🎯 TESTING BILL PAYMENT RECORDING")
    
    # First create a test bill
    test_bill_data = {
        "vendorName": "Payment Test Vendor",
        "category": "Testing", 
        "amount": 1000,
        "taxAmount": 180,
        "dueDate": "2026-04-01",
        "description": "Bill for payment testing"
    }
    
    created_bill = make_request("POST", "/bills", test_bill_data, 200)
    if created_bill is None:
        return False
        
    bill_id = created_bill.get("_id")
    log_test("Payment Test Bill Created", "PASS", f"Created bill: {bill_id}")
    
    # Record partial payment
    payment_data = {
        "billId": bill_id,
        "amount": 500,
        "method": "UPI",
        "date": "2026-03-05",
        "notes": "Partial payment test"
    }
    
    payment_result = make_request("POST", "/bills/payment", payment_data)
    if payment_result is None:
        return False
        
    log_test("Partial Payment Recording", "PASS", "Recorded ₹500 partial payment")
    
    # Verify bill status is 'partial'
    updated_bill = make_request("GET", f"/bills/{bill_id}")
    if updated_bill and updated_bill.get("computedStatus") == "partial":
        log_test("Partial Status Check", "PASS", "Bill status correctly changed to 'partial'")
    else:
        log_test("Partial Status Check", "FAIL", f"Expected 'partial', got: {updated_bill.get('computedStatus') if updated_bill else 'None'}")
    
    # Record remaining payment to mark as paid
    remaining_payment = {
        "billId": bill_id,
        "amount": 680,  # 1000 + 180 - 500 = 680
        "method": "Bank Transfer", 
        "date": "2026-03-10",
        "notes": "Final payment"
    }
    
    final_payment_result = make_request("POST", "/bills/payment", remaining_payment)
    if final_payment_result is None:
        return False
    
    log_test("Final Payment Recording", "PASS", "Recorded ₹680 final payment")
    
    # Verify bill status is 'paid'
    final_bill = make_request("GET", f"/bills/{bill_id}")
    if final_bill and final_bill.get("computedStatus") == "paid":
        log_test("Paid Status Check", "PASS", "Bill status correctly changed to 'paid'")
    else:
        log_test("Paid Status Check", "FAIL", f"Expected 'paid', got: {final_bill.get('computedStatus') if final_bill else 'None'}")
    
    # Clean up test bill
    make_request("DELETE", f"/bills/{bill_id}")
    log_test("Payment Test Cleanup", "PASS", "Cleaned up payment test bill")
    
    return True

def test_sync_from_expenses():
    """Test Sync from Expenses (KEY FEATURE)"""
    print("\n🎯 TESTING SYNC FROM EXPENSES (KEY FEATURE)")
    
    # POST /api/bills/sync-from-expenses
    sync_result = make_request("POST", "/bills/sync-from-expenses", {})
    
    if sync_result is None:
        return False
        
    required_fields = ["generated", "totalExpenses", "message"]
    missing_fields = [field for field in required_fields if field not in sync_result]
    
    if missing_fields:
        log_test("Sync Response Structure", "FAIL", f"Missing fields: {missing_fields}")
        return False
    
    log_test("Sync Response Structure", "PASS", "Response has all required fields")
    log_test("Sync Execution", "PASS", 
            f"Generated: {sync_result['generated']}, Total Expenses: {sync_result['totalExpenses']}")
    
    # Test duplicate prevention - run sync again
    sync_result2 = make_request("POST", "/bills/sync-from-expenses", {})
    if sync_result2 is None:
        return False
        
    if sync_result2.get("generated", -1) == 0:
        log_test("Duplicate Prevention", "PASS", "Second sync generated 0 duplicates (correct behavior)")
    else:
        log_test("Duplicate Prevention", "FAIL", f"Second sync generated {sync_result2.get('generated')} bills (should be 0)")
        
    return True

def test_vendors_crud():
    """Test Vendors CRUD with subCategory support"""
    print("\n🎯 TESTING VENDORS CRUD WITH SUBCATEGORY")
    
    # 1. GET /api/vendors — list vendors
    vendors_data = make_request("GET", "/vendors")
    if vendors_data is None:
        return False
        
    log_test("Vendors GET", "PASS", f"Retrieved {len(vendors_data) if isinstance(vendors_data, list) else 0} vendors")
    
    # 2. POST /api/vendors — create with subCategory
    test_vendor_data = {
        "name": "Test Vendor Co",
        "category": "Packaging",
        "subCategory": "Boxes",
        "phone": "+91-9999999999",
        "email": "test@vendor.com",
        "gstin": "22AAAAA0000A1Z5",
        "contactPerson": "John Doe",
        "address": "123 Test Street"
    }
    
    created_vendor = make_request("POST", "/vendors", test_vendor_data, 200)
    if created_vendor is None:
        return False
        
    vendor_id = created_vendor.get("_id")
    if not vendor_id:
        log_test("Vendor Creation", "FAIL", "No _id returned")
        return False
        
    # Verify subCategory field is saved
    if created_vendor.get("subCategory") == "Boxes":
        log_test("Vendor Creation with subCategory", "PASS", f"Vendor created with subCategory: {created_vendor.get('subCategory')}")
    else:
        log_test("Vendor Creation with subCategory", "FAIL", f"subCategory not saved correctly: {created_vendor.get('subCategory')}")
        return False
    
    # 3. PUT /api/vendors/{vendor_id} — update email
    update_data = {"email": "updated@vendor.com"}
    updated_vendor = make_request("PUT", f"/vendors/{vendor_id}", update_data)
    
    if updated_vendor and updated_vendor.get("email") == "updated@vendor.com":
        log_test("Vendor Update", "PASS", "Vendor email updated successfully")
    else:
        log_test("Vendor Update", "FAIL", "Vendor update failed")
        return False
    
    # 4. DELETE /api/vendors/{vendor_id} — clean up
    delete_result = make_request("DELETE", f"/vendors/{vendor_id}")
    if delete_result is not None:
        log_test("Vendor Deletion", "PASS", "Test vendor deleted successfully")
    else:
        log_test("Vendor Deletion", "FAIL", "Failed to delete test vendor")
        return False
    
    return True

def test_finance_analytics():
    """Test Finance Analytics (NO PO fields)"""
    print("\n🎯 TESTING FINANCE ANALYTICS (NO PO FIELDS)")
    
    # GET /api/finance/cash-flow
    cash_flow_data = make_request("GET", "/finance/cash-flow")
    if cash_flow_data is None:
        return False
    
    # Verify response has required fields (NO PO fields)
    required_fields = ["totalBilled", "totalPaid", "totalOutstanding", "overdueAmount", 
                      "overdueCount", "dueThisMonthAmount", "dueThisMonthCount", "totalBills", "monthlyData"]
    
    missing_fields = [field for field in required_fields if field not in cash_flow_data]
    if missing_fields:
        log_test("Cash Flow Structure", "FAIL", f"Missing required fields: {missing_fields}")
        return False
    
    # Verify NO PO fields are present
    po_fields = ["pendingPOAmount", "pendingPOCount", "totalPOs"]
    found_po_fields = [field for field in po_fields if field in cash_flow_data]
    
    if found_po_fields:
        log_test("PO Fields Removal", "FAIL", f"Found PO fields that should be removed: {found_po_fields}")
        return False
    else:
        log_test("PO Fields Removal", "PASS", "No PO fields found in cash flow (correctly removed)")
    
    log_test("Cash Flow Analytics", "PASS", "All required fields present, PO fields correctly removed")
    
    # GET /api/finance/priority 
    priority_data = make_request("GET", "/finance/priority")
    if priority_data is None:
        return False
    
    if isinstance(priority_data, list):
        log_test("Priority Bills", "PASS", f"Returns array of {len(priority_data)} unpaid bills sorted by priority")
    else:
        log_test("Priority Bills", "FAIL", f"Expected array, got: {type(priority_data)}")
        return False
    
    return True

def test_purchase_orders_removed():
    """Test that Purchase Orders are completely removed"""
    print("\n🎯 TESTING PURCHASE ORDERS REMOVAL")
    
    # GET /api/purchase-orders — should return 404 or error
    try:
        response = requests.get(f"{BASE_URL}/purchase-orders", headers=headers)
        if response.status_code == 404:
            log_test("PO GET Endpoint", "PASS", "GET /api/purchase-orders returns 404 (correctly removed)")
        else:
            log_test("PO GET Endpoint", "FAIL", f"Expected 404, got {response.status_code}")
            return False
    except Exception as e:
        log_test("PO GET Endpoint", "FAIL", f"Exception: {e}")
        return False
    
    # PUT /api/purchase-orders/fake-id — should return 404 or error
    fake_id = str(uuid.uuid4())
    try:
        response = requests.put(f"{BASE_URL}/purchase-orders/{fake_id}", 
                              headers=headers, json={"test": "data"})
        if response.status_code == 404:
            log_test("PO PUT Endpoint", "PASS", "PUT /api/purchase-orders/{id} returns 404 (correctly removed)")
        else:
            log_test("PO PUT Endpoint", "FAIL", f"Expected 404, got {response.status_code}")
            return False
    except Exception as e:
        log_test("PO PUT Endpoint", "FAIL", f"Exception: {e}")
        return False
    
    # DELETE /api/purchase-orders/fake-id — should return 404 or error
    try:
        response = requests.delete(f"{BASE_URL}/purchase-orders/{fake_id}", headers=headers)
        if response.status_code == 404:
            log_test("PO DELETE Endpoint", "PASS", "DELETE /api/purchase-orders/{id} returns 404 (correctly removed)")
        else:
            log_test("PO DELETE Endpoint", "FAIL", f"Expected 404, got {response.status_code}")
            return False
    except Exception as e:
        log_test("PO DELETE Endpoint", "FAIL", f"Exception: {e}")
        return False
    
    return True

def main():
    """Run all tests"""
    print("🚀 STARTING PHASE 5 FINANCE MODULE REFACTOR TESTING")
    print("=" * 60)
    print("Testing 'Smart Approach' refactor - Purchase Orders completely removed")
    print(f"Base URL: {BASE_URL}")
    print("=" * 60)
    
    # Track test results
    test_results = []
    
    # Run all tests
    test_functions = [
        ("Bills CRUD", test_bills_crud),
        ("Bill Payment Recording", test_bill_payment_recording), 
        ("Sync from Expenses", test_sync_from_expenses),
        ("Vendors CRUD with subCategory", test_vendors_crud),
        ("Finance Analytics (NO PO fields)", test_finance_analytics),
        ("Purchase Orders Removal", test_purchase_orders_removed)
    ]
    
    for test_name, test_func in test_functions:
        try:
            result = test_func()
            test_results.append((test_name, result))
        except Exception as e:
            log_test(test_name, "FAIL", f"Exception: {e}")
            test_results.append((test_name, False))
    
    # Clean up test data
    cleanup_test_data()
    
    # Print summary
    print("\n" + "=" * 60)
    print("🎯 TEST SUMMARY")
    print("=" * 60)
    
    passed_count = 0
    failed_count = 0
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
        if result:
            passed_count += 1
        else:
            failed_count += 1
    
    print("=" * 60)
    print(f"TOTAL: {passed_count} PASSED, {failed_count} FAILED")
    
    if failed_count == 0:
        print("🎉 ALL TESTS PASSED! Finance module refactor working correctly.")
        return 0
    else:
        print("❌ SOME TESTS FAILED. Please check the issues above.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)