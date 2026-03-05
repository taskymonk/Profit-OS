#!/usr/bin/env python3
"""
Backend Test Suite for Phase 5: Bills & Finance Module
Profit OS Application - Testing all 16 Bills & Finance APIs

Base URL: https://smart-finance-hub-41.preview.emergentagent.com/api
"""

import requests
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "https://smart-finance-hub-41.preview.emergentagent.com/api"

def test_api(method, endpoint, data=None, expected_status=None):
    """Helper function to test API endpoints"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data, headers={"Content-Type": "application/json"})
        elif method == "PUT":
            response = requests.put(url, json=data, headers={"Content-Type": "application/json"})
        elif method == "DELETE":
            response = requests.delete(url)
        
        print(f"{method} {endpoint} -> Status: {response.status_code}")
        
        if expected_status and response.status_code != expected_status:
            print(f"❌ Expected status {expected_status}, got {response.status_code}")
            return None
            
        if response.status_code >= 400:
            print(f"❌ Error: {response.text}")
            return None
            
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return None

def main():
    print("🎯 PHASE 5: BILLS & FINANCE MODULE BACKEND TESTING")
    print("=" * 70)
    
    # Store test data IDs for cleanup
    test_bill_id = None
    test_vendor_id = None
    test_po_id = None
    
    try:
        # =================================================================
        # TEST 1: GET /api/bills - List all bills
        # =================================================================
        print("\n1. 📋 TESTING: GET /api/bills - List all bills")
        bills = test_api("GET", "/bills")
        if bills is not None:
            print(f"✅ Found {len(bills)} bills in system")
            if len(bills) >= 3:
                print("✅ Expected 3+ bills exist")
                # Verify structure of first bill
                first_bill = bills[0] 
                required_fields = ['_id', 'vendorName', 'category', 'amount', 'taxAmount', 'status', 'outstanding', 'totalAmount', 'totalPaid', 'computedStatus', 'payments']
                missing_fields = [f for f in required_fields if f not in first_bill]
                if missing_fields:
                    print(f"⚠️ Missing fields in bill structure: {missing_fields}")
                else:
                    print("✅ Bill structure contains all required fields")
                    print(f"✅ Sample bill: {first_bill.get('vendorName', 'N/A')} - Status: {first_bill.get('status', 'N/A')} - Outstanding: ₹{first_bill.get('outstanding', 0)}")
            else:
                print(f"⚠️ Expected at least 3 bills, found {len(bills)}")
        
        # =================================================================
        # TEST 2: POST /api/bills - Create a new bill
        # =================================================================
        print("\n2. ➕ TESTING: POST /api/bills - Create a new bill")
        bill_data = {
            "vendorName": "Test Vendor",
            "category": "Other", 
            "description": "Test Bill",
            "amount": 1000,
            "taxAmount": 180,
            "dueDate": "2026-04-01"
        }
        new_bill = test_api("POST", "/bills", bill_data, 200)
        if new_bill and '_id' in new_bill:
            test_bill_id = new_bill['_id']
            print(f"✅ Created test bill with ID: {test_bill_id}")
            print(f"✅ Bill details: {new_bill.get('vendorName')} - Amount: ₹{new_bill.get('amount')} + Tax: ₹{new_bill.get('taxAmount')}")
        else:
            print("❌ Failed to create test bill")
            
        # =================================================================
        # TEST 3: POST /api/bills/payment - Record a payment
        # =================================================================
        print("\n3. 💰 TESTING: POST /api/bills/payment - Record a payment")
        if test_bill_id:
            payment_data = {
                "billId": test_bill_id,
                "amount": 500,
                "date": "2026-03-05",
                "method": "UPI",
                "notes": "Test payment"
            }
            payment_result = test_api("POST", "/bills/payment", payment_data, 200)
            if payment_result:
                print("✅ Payment recorded successfully")
                print(f"✅ Payment details: ₹{payment_data['amount']} via {payment_data['method']}")
                
                # Verify bill status changed
                updated_bill = test_api("GET", f"/bills/{test_bill_id}")
                if updated_bill:
                    print(f"✅ Bill status after payment: {updated_bill.get('status', 'N/A')}")
                    print(f"✅ Outstanding amount: ₹{updated_bill.get('outstanding', 0)}")
                    if updated_bill.get('status') == 'partial':
                        print("✅ Bill status correctly changed to 'partial'")
                    else:
                        print(f"⚠️ Expected status 'partial', got '{updated_bill.get('status')}'")
        else:
            print("❌ Skipping payment test - no test bill created")
            
        # =================================================================
        # TEST 4: PUT /api/bills/{id} - Update a bill
        # =================================================================
        print("\n4. ✏️ TESTING: PUT /api/bills/{id} - Update a bill")
        if test_bill_id:
            update_data = {"description": "Updated Test Bill"}
            updated_bill = test_api("PUT", f"/bills/{test_bill_id}", update_data, 200)
            if updated_bill:
                print("✅ Bill updated successfully")
                print(f"✅ Updated description: {updated_bill.get('description', 'N/A')}")
        else:
            print("❌ Skipping update test - no test bill created")
            
        # =================================================================
        # TEST 5: GET /api/vendors - List vendors
        # =================================================================
        print("\n5. 🏢 TESTING: GET /api/vendors - List vendors")
        vendors = test_api("GET", "/vendors")
        if vendors is not None:
            print(f"✅ Found {len(vendors)} vendors in system")
            if len(vendors) >= 1:
                print("✅ Expected 1+ vendors exist")
                # Show sample vendor
                sample_vendor = vendors[0]
                print(f"✅ Sample vendor: {sample_vendor.get('name', 'N/A')} - Category: {sample_vendor.get('category', 'N/A')}")
            else:
                print(f"⚠️ Expected at least 1 vendor, found {len(vendors)}")
        
        # =================================================================
        # TEST 6: POST /api/vendors - Create vendor
        # =================================================================
        print("\n6. ➕ TESTING: POST /api/vendors - Create vendor")
        vendor_data = {
            "name": "Test Vendor Co",
            "category": "Raw Materials", 
            "phone": "1234567890"
        }
        new_vendor = test_api("POST", "/vendors", vendor_data, 201)
        if new_vendor and '_id' in new_vendor:
            test_vendor_id = new_vendor['_id']
            print(f"✅ Created test vendor with ID: {test_vendor_id}")
            print(f"✅ Vendor details: {new_vendor.get('name')} - Category: {new_vendor.get('category')}")
        else:
            print("❌ Failed to create test vendor")
            
        # =================================================================
        # TEST 7: PUT /api/vendors/{id} - Update vendor
        # =================================================================
        print("\n7. ✏️ TESTING: PUT /api/vendors/{id} - Update vendor")
        if test_vendor_id:
            update_data = {"email": "test@vendor.com"}
            updated_vendor = test_api("PUT", f"/vendors/{test_vendor_id}", update_data, 200)
            if updated_vendor:
                print("✅ Vendor updated successfully")
                print(f"✅ Updated email: {updated_vendor.get('email', 'N/A')}")
        else:
            print("❌ Skipping vendor update test - no test vendor created")
            
        # =================================================================
        # TEST 8: GET /api/purchase-orders - List POs
        # =================================================================
        print("\n8. 📦 TESTING: GET /api/purchase-orders - List POs")
        pos = test_api("GET", "/purchase-orders")
        if pos is not None:
            print(f"✅ Found {len(pos)} purchase orders in system")
            if len(pos) >= 1:
                print("✅ Expected 1+ POs exist")
                # Show sample PO
                sample_po = pos[0]
                print(f"✅ Sample PO: {sample_po.get('poNumber', 'N/A')} - Vendor: {sample_po.get('vendorName', 'N/A')} - Status: {sample_po.get('status', 'N/A')}")
            else:
                print(f"⚠️ Expected at least 1 PO, found {len(pos)}")
        
        # =================================================================
        # TEST 9: POST /api/purchase-orders - Create PO
        # =================================================================
        print("\n9. ➕ TESTING: POST /api/purchase-orders - Create PO")
        po_data = {
            "vendorName": "Test Vendor",
            "items": [{"name": "Test Item", "quantity": 10, "unitPrice": 100, "unit": "pcs"}],
            "totalAmount": 1000,
            "expectedDelivery": "2026-04-01"
        }
        new_po = test_api("POST", "/purchase-orders", po_data, 200)
        if new_po and '_id' in new_po:
            test_po_id = new_po['_id']
            print(f"✅ Created test PO with ID: {test_po_id}")
            print(f"✅ PO details: {new_po.get('poNumber', 'N/A')} - Vendor: {new_po.get('vendorName')} - Amount: ₹{new_po.get('totalAmount')}")
        else:
            print("❌ Failed to create test PO")
            
        # =================================================================
        # TEST 10: PUT /api/purchase-orders/{id} - Update PO status
        # =================================================================
        print("\n10. ✏️ TESTING: PUT /api/purchase-orders/{id} - Update PO status")
        if test_po_id:
            update_data = {"status": "sent"}
            updated_po = test_api("PUT", f"/purchase-orders/{test_po_id}", update_data, 200)
            if updated_po:
                print("✅ PO status updated successfully")
                print(f"✅ Updated status: {updated_po.get('status', 'N/A')}")
        else:
            print("❌ Skipping PO update test - no test PO created")
            
        # =================================================================
        # TEST 11: POST /api/purchase-orders/receive - Receive a PO
        # =================================================================
        print("\n11. 📥 TESTING: POST /api/purchase-orders/receive - Receive a PO")
        if test_po_id:
            receive_data = {"poId": test_po_id}
            receive_result = test_api("POST", "/purchase-orders/receive", receive_data, 200)
            if receive_result:
                print("✅ PO marked as received successfully")
                
                # Verify status changed
                updated_po = test_api("GET", f"/purchase-orders/{test_po_id}")
                if updated_po and updated_po.get('status') == 'received':
                    print("✅ PO status correctly changed to 'received'")
                else:
                    print(f"⚠️ Expected status 'received', got '{updated_po.get('status') if updated_po else 'N/A'}'")
        else:
            print("❌ Skipping PO receive test - no test PO created")
            
        # =================================================================
        # TEST 12: GET /api/finance/cash-flow - Cash flow summary
        # =================================================================
        print("\n12. 💹 TESTING: GET /api/finance/cash-flow - Cash flow summary")
        cash_flow = test_api("GET", "/finance/cash-flow")
        if cash_flow:
            print("✅ Cash flow summary retrieved successfully")
            required_fields = ['totalBilled', 'totalPaid', 'totalOutstanding', 'overdueAmount', 'monthlyData']
            missing_fields = [f for f in required_fields if f not in cash_flow]
            if missing_fields:
                print(f"⚠️ Missing fields in cash flow structure: {missing_fields}")
            else:
                print("✅ Cash flow structure contains all required fields")
                print(f"✅ Total Billed: ₹{cash_flow.get('totalBilled', 0)}")
                print(f"✅ Total Paid: ₹{cash_flow.get('totalPaid', 0)}")
                print(f"✅ Outstanding: ₹{cash_flow.get('totalOutstanding', 0)}")
                print(f"✅ Overdue: ₹{cash_flow.get('overdueAmount', 0)}")
                if isinstance(cash_flow.get('monthlyData'), list):
                    print(f"✅ Monthly data array with {len(cash_flow['monthlyData'])} entries")
                else:
                    print("⚠️ Monthly data is not an array")
        
        # =================================================================
        # TEST 13: GET /api/finance/priority - Payment priority
        # =================================================================
        print("\n13. 🎯 TESTING: GET /api/finance/priority - Payment priority")
        priority = test_api("GET", "/finance/priority")
        if priority is not None:
            print(f"✅ Payment priority list retrieved successfully")
            if isinstance(priority, list):
                print(f"✅ Priority list contains {len(priority)} unpaid bills")
                if len(priority) > 0:
                    # Check if sorted by priority (overdue first, then statutory, then by due date)
                    sample_bill = priority[0]
                    print(f"✅ Top priority bill: {sample_bill.get('vendorName', 'N/A')} - Status: {sample_bill.get('status', 'N/A')} - Outstanding: ₹{sample_bill.get('outstanding', 0)}")
                    
                    # Check for overdue bills first
                    overdue_bills = [b for b in priority if b.get('isOverdue', False)]
                    if overdue_bills:
                        print(f"✅ Found {len(overdue_bills)} overdue bills prioritized")
                else:
                    print("✅ No unpaid bills requiring priority attention")
            else:
                print("⚠️ Priority response is not an array")
    
    except Exception as e:
        print(f"❌ Test suite failed with error: {e}")
        
    finally:
        # =================================================================
        # CLEANUP: Delete test data
        # =================================================================
        print("\n🧹 CLEANUP: Deleting test data")
        
        # Delete test bill
        if test_bill_id:
            print(f"\n14. 🗑️ TESTING: DELETE /api/bills/{test_bill_id} - Delete test bill")
            delete_result = test_api("DELETE", f"/bills/{test_bill_id}")
            if delete_result:
                print("✅ Test bill deleted successfully")
            else:
                print("❌ Failed to delete test bill")
        
        # Delete test vendor 
        if test_vendor_id:
            print(f"\n15. 🗑️ TESTING: DELETE /api/vendors/{test_vendor_id} - Delete test vendor")
            delete_result = test_api("DELETE", f"/vendors/{test_vendor_id}")
            if delete_result:
                print("✅ Test vendor deleted successfully")
            else:
                print("❌ Failed to delete test vendor")
                
        # Delete test PO
        if test_po_id:
            print(f"\n16. 🗑️ TESTING: DELETE /api/purchase-orders/{test_po_id} - Delete test PO")
            delete_result = test_api("DELETE", f"/purchase-orders/{test_po_id}")
            if delete_result:
                print("✅ Test PO deleted successfully")
            else:
                print("❌ Failed to delete test PO")
                
        print("\n" + "=" * 70)
        print("🎉 PHASE 5: BILLS & FINANCE MODULE TESTING COMPLETE")
        print("All 16 critical endpoints tested with proper cleanup")

if __name__ == "__main__":
    main()