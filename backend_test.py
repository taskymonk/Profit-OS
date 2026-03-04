#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, timezone
import traceback

# Base URL from the review request
BASE_URL = "https://kds-ops.preview.emergentagent.com/api"
EMPLOYEE_ID = "e11dbb72-f831-4c5c-90cc-816b9bc2bc5b"

def make_request(method, endpoint, data=None, params=None):
    """Helper to make HTTP requests with proper error handling"""
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=params)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"  {method} {endpoint} -> Status: {response.status_code}")
        
        if response.status_code >= 400:
            print(f"  Error Response: {response.text[:500]}")
            return None, response.status_code
            
        try:
            return response.json(), response.status_code
        except json.JSONDecodeError:
            return response.text, response.status_code
            
    except Exception as e:
        print(f"  Request failed: {str(e)}")
        return None, 0

def test_kds_assignments_get():
    """Test 1: GET /api/kds/assignments with various filters"""
    print("\n🎯 TEST 1: KDS Assignments (GET)")
    
    try:
        # Test 1a: Get all assignments (no filter)
        print("  1a) GET all assignments:")
        data, status = make_request("GET", "/kds/assignments")
        if status == 200 and data:
            print(f"    ✅ Found {len(data)} total assignments")
            assignment_sample = data[0] if data else None
            if assignment_sample:
                print(f"    Sample assignment has orderId: {assignment_sample.get('orderId', 'N/A')}")
                print(f"    Sample assignment has enriched order field: {'order' in assignment_sample}")
        else:
            print(f"    ❌ Failed to get assignments: {status}")
            return False

        # Test 1b: Filter by employeeId  
        print("  1b) GET assignments for specific employee:")
        params = {"employeeId": EMPLOYEE_ID}
        data, status = make_request("GET", "/kds/assignments", params=params)
        if status == 200:
            print(f"    ✅ Found {len(data) if data else 0} assignments for employee {EMPLOYEE_ID}")
            if data and len(data) > 0:
                print(f"    Sample: Assignment {data[0].get('_id', 'N/A')} for order {data[0].get('orderId', 'N/A')}")
        else:
            print(f"    ❌ Failed to filter by employeeId: {status}")

        # Test 1c: Filter by status
        print("  1c) GET assignments with status filter:")
        params = {"status": "assigned"}
        data, status = make_request("GET", "/kds/assignments", params=params)
        if status == 200:
            print(f"    ✅ Found {len(data) if data else 0} assignments with status 'assigned'")
        else:
            print(f"    ❌ Failed to filter by status: {status}")

        # Test 1d: Verify enriched order field
        print("  1d) Verify enriched order field:")
        data, status = make_request("GET", "/kds/assignments")
        if status == 200 and data and len(data) > 0:
            sample = data[0]
            if 'order' in sample and sample['order']:
                print(f"    ✅ Assignment has enriched 'order' field with orderId: {sample['order'].get('orderId', 'N/A')}")
                return True
            else:
                print(f"    ❌ Assignment missing enriched 'order' field")
                return False
        else:
            print(f"    ❌ No assignments to verify enrichment: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_assign_orders():
    """Test 2: POST /api/kds/assign - Assign new orders"""
    print("\n🎯 TEST 2: KDS Order Assignment (POST)")
    
    try:
        # Step 1: Get fresh order IDs from page 2
        print("  2a) Get fresh order IDs:")
        params = {"page": 2, "limit": 2}
        data, status = make_request("GET", "/orders", params=params)
        if status != 200 or not data or not data.get('orders'):
            print(f"    ❌ Failed to get orders: {status}")
            return False
        
        orders = data['orders'][:2]  # Take first 2
        order_ids = [order['orderId'] for order in orders]
        print(f"    ✅ Retrieved order IDs: {order_ids}")
        
        # Step 2: Assign orders to employee
        print("  2b) Assign orders to employee:")
        assign_data = {
            "employeeId": EMPLOYEE_ID,
            "employeeName": "Test Employee",
            "orderIds": order_ids
        }
        
        data, status = make_request("POST", "/kds/assign", assign_data)
        if status == 200 and data:
            batch_id = data.get('batchId')
            assignment_count = data.get('assignmentCount', 0)
            print(f"    ✅ Assignment successful:")
            print(f"      - batchId: {batch_id}")
            print(f"      - assignmentCount: {assignment_count}")
            print(f"      - message: {data.get('message', 'N/A')}")
            
            # Step 3: Try assigning same orders again (should be skipped)
            print("  2c) Try assigning same orders again:")
            data2, status2 = make_request("POST", "/kds/assign", assign_data)
            if status2 == 200 and data2:
                skipped_count = data2.get('skippedCount', 0)
                print(f"    ✅ Duplicate assignment handled:")
                print(f"      - skippedCount: {skipped_count}")
                if skipped_count > 0:
                    print(f"      - Correctly skipped already assigned orders")
                    return batch_id, order_ids[0] if order_ids else None  # Return for next test
            else:
                print(f"    ❌ Failed to handle duplicate assignment: {status2}")
        else:
            print(f"    ❌ Failed to assign orders: {status}")
            
        return None, None
        
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return None, None

def test_kds_status_transitions(assignment_id):
    """Test 3: PUT /api/kds/assignments/{id}/status - Status transitions"""
    print("\n🎯 TEST 3: KDS Status Transitions (PUT)")
    
    if not assignment_id:
        print("    ❌ No assignment ID provided")
        return False
    
    try:
        # Test 3a: Move to in_progress
        print("  3a) Move assignment to in_progress:")
        data, status = make_request("PUT", f"/kds/assignments/{assignment_id}/status", 
                                  {"status": "in_progress"})
        if status == 200 and data:
            started_at = data.get('startedAt')
            print(f"    ✅ Status updated to in_progress, startedAt: {started_at}")
        else:
            print(f"    ❌ Failed to update to in_progress: {status}")
            return False
            
        # Test 3b: Move to completed
        print("  3b) Move assignment to completed:")
        data, status = make_request("PUT", f"/kds/assignments/{assignment_id}/status", 
                                  {"status": "completed"})
        if status == 200 and data:
            completed_at = data.get('completedAt')
            print(f"    ✅ Status updated to completed, completedAt: {completed_at}")
        else:
            print(f"    ❌ Failed to update to completed: {status}")
            return False
            
        # Test 3c: Move to packed
        print("  3c) Move assignment to packed:")
        data, status = make_request("PUT", f"/kds/assignments/{assignment_id}/status", 
                                  {"status": "packed"})
        if status == 200 and data:
            packed_at = data.get('packedAt')
            print(f"    ✅ Status updated to packed, packedAt: {packed_at}")
        else:
            print(f"    ❌ Failed to update to packed: {status}")
            return False
            
        # Test 3d: Try invalid status
        print("  3d) Try invalid status:")
        data, status = make_request("PUT", f"/kds/assignments/{assignment_id}/status", 
                                  {"status": "invalid_status"})
        if status >= 400:
            print(f"    ✅ Invalid status correctly rejected with status: {status}")
            return True
        else:
            print(f"    ❌ Invalid status should have been rejected but got: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_material_summary(order_ids):
    """Test 4: GET /api/kds/material-summary - Material aggregation"""
    print("\n🎯 TEST 4: KDS Material Summary (GET)")
    
    if not order_ids:
        print("    ❌ No order IDs provided")
        return False
    
    try:
        # Test with comma-separated order IDs
        print("  4a) Get material summary for order IDs:")
        order_ids_str = ",".join(order_ids) if isinstance(order_ids, list) else str(order_ids)
        params = {"orderIds": order_ids_str}
        
        data, status = make_request("GET", "/kds/material-summary", params=params)
        if status == 200 and data:
            materials = data.get('materials', [])
            total_orders = data.get('totalOrders', 0)
            print(f"    ✅ Material summary retrieved:")
            print(f"      - materials count: {len(materials)}")
            print(f"      - totalOrders: {total_orders}")
            if materials:
                print(f"      - Sample material: {materials[0]}")
            return True
        else:
            print(f"    ❌ Failed to get material summary: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_wastage():
    """Test 5 & 6: POST/GET /api/kds/wastage - Report and get wastage"""
    print("\n🎯 TEST 5-6: KDS Wastage Management")
    
    try:
        # Test 5: Report wastage
        print("  5a) Report wastage:")
        wastage_data = {
            "employeeId": EMPLOYEE_ID,
            "employeeName": "Test Employee", 
            "ingredient": "Test Material",
            "quantity": 3,
            "reason": "Damaged"
        }
        
        data, status = make_request("POST", "/kds/wastage", wastage_data)
        if status == 200 and data:
            wastage_id = data.get('_id')
            created_at = data.get('createdAt')
            print(f"    ✅ Wastage reported:")
            print(f"      - _id: {wastage_id}")
            print(f"      - createdAt: {created_at}")
            print(f"      - ingredient: {data.get('ingredient')}")
        else:
            print(f"    ❌ Failed to report wastage: {status}")
            return False
            
        # Test 6: Get wastage logs
        print("  6a) Get wastage logs:")
        data, status = make_request("GET", "/kds/wastage")
        if status == 200 and isinstance(data, list):
            print(f"    ✅ Retrieved {len(data)} wastage logs")
            if data:
                recent_log = data[0]
                print(f"      - Recent log ingredient: {recent_log.get('ingredient')}")
                print(f"      - Recent log quantity: {recent_log.get('quantity')}")
            return True
        else:
            print(f"    ❌ Failed to get wastage logs: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_material_request():
    """Test 7 & 8: POST/PUT /api/kds/material-request - Request and approve materials"""
    print("\n🎯 TEST 7-8: KDS Material Request Management")
    
    try:
        # Test 7: Request material
        print("  7a) Request material:")
        request_data = {
            "employeeId": EMPLOYEE_ID,
            "employeeName": "Test Employee",
            "ingredient": "Gift Box",
            "quantity": 5
        }
        
        data, status = make_request("POST", "/kds/material-request", request_data)
        if status == 200 and data:
            request_id = data.get('_id')
            request_status = data.get('status')
            print(f"    ✅ Material request created:")
            print(f"      - _id: {request_id}")
            print(f"      - status: {request_status}")
            print(f"      - ingredient: {data.get('ingredient')}")
        else:
            print(f"    ❌ Failed to create material request: {status}")
            return False
            
        # Test 8: Approve request
        print("  8a) Approve material request:")
        approval_data = {
            "status": "approved",
            "respondedBy": "admin"
        }
        
        data, status = make_request("PUT", f"/kds/material-requests/{request_id}", approval_data)
        if status == 200 and data:
            responded_at = data.get('respondedAt')
            final_status = data.get('status')
            print(f"    ✅ Material request approved:")
            print(f"      - status: {final_status}")
            print(f"      - respondedAt: {responded_at}")
            print(f"      - respondedBy: {data.get('respondedBy')}")
            return True
        else:
            print(f"    ❌ Failed to approve material request: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_performance():
    """Test 9: GET /api/kds/performance - Employee stats"""
    print("\n🎯 TEST 9: KDS Performance Stats (GET)")
    
    try:
        print("  9a) Get employee performance stats:")
        data, status = make_request("GET", "/kds/performance")
        
        if status == 200 and isinstance(data, list):
            print(f"    ✅ Retrieved performance data for {len(data)} employees")
            if data:
                sample_perf = data[0]
                print(f"      - Sample employee: {sample_perf.get('employeeName', 'N/A')}")
                print(f"      - totalAssigned: {sample_perf.get('totalAssigned', 'N/A')}")
                print(f"      - completed: {sample_perf.get('completed', 'N/A')}")
                print(f"      - todayCompleted: {sample_perf.get('todayCompleted', 'N/A')}")
                
                # Verify required fields
                required_fields = ['totalAssigned', 'completed', 'todayCompleted']
                has_all_fields = all(field in sample_perf for field in required_fields)
                if has_all_fields:
                    print(f"      ✅ Performance data includes required fields")
                    return True
                else:
                    print(f"      ❌ Performance data missing some required fields")
                    return False
            else:
                print(f"      ⚠️ No performance data available (no employees or assignments)")
                return True  # This is acceptable
        else:
            print(f"    ❌ Failed to get performance stats: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def test_kds_material_requests_list():
    """Test 10: GET /api/kds/material-requests - List requests"""  
    print("\n🎯 TEST 10: KDS Material Requests List (GET)")
    
    try:
        print("  10a) List all material requests:")
        data, status = make_request("GET", "/kds/material-requests")
        
        if status == 200 and isinstance(data, list):
            print(f"    ✅ Retrieved {len(data)} material requests")
            if data:
                sample_request = data[0]
                print(f"      - Sample request: {sample_request.get('ingredient', 'N/A')}")
                print(f"      - Status: {sample_request.get('status', 'N/A')}")
                print(f"      - Employee: {sample_request.get('employeeName', 'N/A')}")
            return True
        else:
            print(f"    ❌ Failed to get material requests: {status}")
            return False
            
    except Exception as e:
        print(f"    ❌ Test exception: {str(e)}")
        return False

def get_assignment_id_for_testing():
    """Helper function to get an assignment ID for status transition testing"""
    try:
        print("  📋 Getting assignment ID for testing...")
        data, status = make_request("GET", "/kds/assignments")
        if status == 200 and data and len(data) > 0:
            assignment_id = data[0].get('_id')
            print(f"    ✅ Found assignment ID: {assignment_id}")
            return assignment_id
        else:
            print(f"    ❌ No assignments found for testing")
            return None
    except Exception as e:
        print(f"    ❌ Failed to get assignment ID: {str(e)}")
        return None

def main():
    """Main test runner"""
    print("=" * 60)
    print("🧪 KDS (KITCHEN DISPLAY SYSTEM) API TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Employee ID: {EMPLOYEE_ID}")
    print("=" * 60)
    
    results = []
    
    # Test 1: GET assignments with filters
    result1 = test_kds_assignments_get()
    results.append(("KDS Assignments (GET)", result1))
    
    # Test 2: POST assign orders
    batch_id, sample_order_id = test_kds_assign_orders()
    result2 = batch_id is not None
    results.append(("KDS Order Assignment (POST)", result2))
    
    # Test 3: PUT status transitions (need assignment ID)
    assignment_id = get_assignment_id_for_testing()
    result3 = test_kds_status_transitions(assignment_id)
    results.append(("KDS Status Transitions (PUT)", result3))
    
    # Test 4: GET material summary  
    result4 = test_kds_material_summary([sample_order_id] if sample_order_id else ["test-order-1", "test-order-2"])
    results.append(("KDS Material Summary (GET)", result4))
    
    # Test 5-6: Wastage management
    result56 = test_kds_wastage()
    results.append(("KDS Wastage Management", result56))
    
    # Test 7-8: Material request management
    result78 = test_kds_material_request()
    results.append(("KDS Material Request Management", result78))
    
    # Test 9: Performance stats
    result9 = test_kds_performance()
    results.append(("KDS Performance Stats (GET)", result9))
    
    # Test 10: Material requests list
    result10 = test_kds_material_requests_list()
    results.append(("KDS Material Requests List (GET)", result10))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if success:
            passed += 1
    
    print("=" * 60)
    print(f"🎯 OVERALL: {passed}/{total} tests passed ({(passed/total*100):.1f}%)")
    
    if passed == total:
        print("🎉 ALL KDS API TESTS PASSED!")
    else:
        print("⚠️ Some tests failed - check logs above for details")
    
    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n❌ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        traceback.print_exc()
        sys.exit(1)