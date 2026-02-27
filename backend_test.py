#!/usr/bin/env python3

import requests
import json
import sys
from pymongo import MongoClient
import os

# Configuration from .env
BASE_URL = "https://profit-calc-dash.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log(message):
    """Print a timestamped log message."""
    print(f"[TEST] {message}")
    sys.stdout.flush()

def get_mongo_client():
    """Get MongoDB client."""
    return MongoClient(MONGO_URL)

def test_tracking_number_save():
    """Test 1: TRACKING NUMBER SAVE (PUT /api/orders/{id}/tracking)"""
    log("🔍 TEST 1: TRACKING NUMBER SAVE")
    try:
        # Step 1: Get first Unfulfilled order
        log("Getting first Unfulfilled order...")
        response = requests.get(f"{BASE_URL}/orders", params={"page": 1, "limit": 1, "status": "Unfulfilled"})
        
        if response.status_code != 200:
            log(f"❌ Failed to get orders: {response.status_code} - {response.text}")
            return False
            
        orders_data = response.json()
        if not orders_data.get('orders') or len(orders_data['orders']) == 0:
            log("❌ No Unfulfilled orders found")
            return False
        
        order = orders_data['orders'][0]
        order_id = order['_id']
        log(f"✅ Found Unfulfilled order: {order.get('orderId', order_id)}")
        
        # Step 2: Save tracking number
        test_tracking = "EE123456789IN"
        log(f"Saving tracking number: {test_tracking}")
        
        response = requests.put(
            f"{BASE_URL}/orders/{order_id}/tracking",
            json={"trackingNumber": test_tracking},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to save tracking number: {response.status_code} - {response.text}")
            return False
            
        updated_order = response.json()
        if updated_order.get('trackingNumber') != test_tracking:
            log(f"❌ Tracking number not saved correctly. Expected: {test_tracking}, Got: {updated_order.get('trackingNumber')}")
            return False
            
        log(f"✅ Tracking number saved: {updated_order.get('trackingNumber')}")
        
        # Step 3: Verify persistence with GET
        log("Verifying tracking number persistence...")
        response = requests.get(f"{BASE_URL}/orders/{order_id}")
        
        if response.status_code != 200:
            log(f"❌ Failed to get order: {response.status_code} - {response.text}")
            return False
            
        retrieved_order = response.json()
        if retrieved_order.get('trackingNumber') != test_tracking:
            log(f"❌ Tracking number not persisted. Expected: {test_tracking}, Got: {retrieved_order.get('trackingNumber')}")
            return False
            
        log("✅ Tracking number persisted correctly")
        
        # Step 4: Test clearing tracking number
        log("Testing tracking number clearing...")
        response = requests.put(
            f"{BASE_URL}/orders/{order_id}/tracking",
            json={"trackingNumber": ""},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            log(f"❌ Failed to clear tracking number: {response.status_code} - {response.text}")
            return False
            
        cleared_order = response.json()
        if cleared_order.get('trackingNumber') is not None:
            log(f"❌ Tracking number not cleared. Expected: null, Got: {cleared_order.get('trackingNumber')}")
            return False
            
        log("✅ Tracking number cleared successfully")
        
        # Restore the test tracking number for further tests
        requests.put(
            f"{BASE_URL}/orders/{order_id}/tracking",
            json={"trackingNumber": test_tracking},
            headers={"Content-Type": "application/json"}
        )
        
        log("✅ TEST 1 PASSED: Tracking number save/clear functionality working")
        return True
        
    except Exception as e:
        log(f"❌ TEST 1 FAILED: {str(e)}")
        return False

def test_india_post_sync_error():
    """Test 2: INDIA POST SYNC TRACKING ERROR HANDLING"""
    log("🔍 TEST 2: INDIA POST SYNC TRACKING ERROR HANDLING")
    try:
        # Ensure no India Post credentials are set by checking integrations first
        response = requests.get(f"{BASE_URL}/integrations")
        if response.status_code == 200:
            integrations = response.json()
            india_post = integrations.get('indiaPost', {})
            if india_post.get('username') or india_post.get('password'):
                log("⚠️ India Post credentials found, clearing them for error test...")
                # Clear credentials temporarily
                client = get_mongo_client()
                db = client[DB_NAME]
                db.integrations.update_one(
                    {"_id": "integrations-config"},
                    {"$set": {"indiaPost.username": "", "indiaPost.password": ""}}
                )
        
        log("Testing India Post sync without credentials...")
        response = requests.post(
            f"{BASE_URL}/indiapost/sync-tracking",
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            log(f"❌ Expected 200 status with error message, got: {response.status_code}")
            return False
            
        result = response.json()
        if 'error' not in result:
            log(f"❌ Expected error field in response, got: {result}")
            return False
            
        error_message = result['error']
        if 'credentials not configured' not in error_message.lower():
            log(f"❌ Expected credentials error message, got: {error_message}")
            return False
            
        log(f"✅ Correct error message: {error_message}")
        log("✅ TEST 2 PASSED: India Post sync error handling working")
        return True
        
    except Exception as e:
        log(f"❌ TEST 2 FAILED: {str(e)}")
        return False

def test_rto_double_shipping():
    """Test 3: RTO DOUBLE-SHIPPING PENALTY"""
    log("🔍 TEST 3: RTO DOUBLE-SHIPPING PENALTY")
    try:
        # Step 1: Find or create an order to temporarily set as RTO
        response = requests.get(f"{BASE_URL}/orders", params={"page": 1, "limit": 10, "status": "Delivered"})
        
        if response.status_code != 200:
            log(f"❌ Failed to get orders: {response.status_code}")
            return False
            
        orders_data = response.json()
        if not orders_data.get('orders') or len(orders_data['orders']) == 0:
            log("❌ No delivered orders found to test with")
            return False
        
        test_order = orders_data['orders'][0]
        order_id = test_order['_id']
        original_status = test_order['status']
        original_shipping = test_order.get('shippingCost', 0)
        
        log(f"Using order {test_order.get('orderId', order_id)} - Original shipping: ₹{original_shipping}")
        
        # Step 2: Set order status to RTO using pymongo
        log("Setting order status to RTO...")
        client = get_mongo_client()
        db = client[DB_NAME]
        
        update_result = db.orders.update_one(
            {"_id": order_id},
            {"$set": {"status": "RTO", "updatedAt": "2024-01-01T00:00:00.000Z"}}
        )
        
        if update_result.matched_count == 0:
            log(f"❌ Failed to update order status to RTO")
            return False
            
        log("✅ Order status set to RTO")
        
        # Step 3: Calculate profit and verify 2x shipping cost
        log("Calculating profit for RTO order...")
        response = requests.get(f"{BASE_URL}/calculate-profit/{order_id}")
        
        if response.status_code != 200:
            log(f"❌ Failed to calculate profit: {response.status_code} - {response.text}")
            # Restore original status
            db.orders.update_one({"_id": order_id}, {"$set": {"status": original_status}})
            return False
            
        profit_data = response.json()
        calculated_shipping = profit_data.get('shippingCost', 0)
        is_rto = profit_data.get('isRTO', False)
        
        log(f"Calculated shipping cost: ₹{calculated_shipping}")
        log(f"Is RTO flag: {is_rto}")
        
        # Verify isRTO is true
        if not is_rto:
            log(f"❌ isRTO should be true for RTO orders")
            # Restore original status
            db.orders.update_one({"_id": order_id}, {"$set": {"status": original_status}})
            return False
        
        # Verify shipping cost is approximately 2x (allowing for small rounding differences)
        expected_shipping = original_shipping * 2
        shipping_diff = abs(calculated_shipping - expected_shipping)
        
        if shipping_diff > 1:  # Allow 1 rupee difference for rounding
            log(f"❌ Shipping cost not doubled correctly. Expected: ~₹{expected_shipping}, Got: ₹{calculated_shipping}")
            # Restore original status
            db.orders.update_one({"_id": order_id}, {"$set": {"status": original_status}})
            return False
        
        log(f"✅ Shipping cost correctly doubled: ₹{original_shipping} → ₹{calculated_shipping}")
        
        # Step 4: Restore original order status
        log("Restoring original order status...")
        db.orders.update_one({"_id": order_id}, {"$set": {"status": original_status}})
        log(f"✅ Order status restored to {original_status}")
        
        log("✅ TEST 3 PASSED: RTO double-shipping penalty working correctly")
        return True
        
    except Exception as e:
        log(f"❌ TEST 3 FAILED: {str(e)}")
        return False

def test_demo_data_cleanup():
    """Test 4: DEMO DATA CLEANUP VERIFICATION"""
    log("🔍 TEST 4: DEMO DATA CLEANUP VERIFICATION")
    try:
        # List of endpoints that should return empty arrays
        empty_endpoints = [
            ("employees", "/employees"),
            ("overhead-expenses", "/overhead-expenses"), 
            ("raw-materials", "/raw-materials"),
            ("packaging-materials", "/packaging-materials"),
            ("vendors", "/vendors")
        ]
        
        all_passed = True
        
        for name, endpoint in empty_endpoints:
            log(f"Checking {name}...")
            response = requests.get(f"{BASE_URL}{endpoint}")
            
            if response.status_code != 200:
                log(f"❌ Failed to get {name}: {response.status_code}")
                all_passed = False
                continue
                
            data = response.json()
            if not isinstance(data, list) or len(data) != 0:
                log(f"❌ {name} should return empty array [], got: {type(data)} with length {len(data) if hasattr(data, '__len__') else 'N/A'}")
                all_passed = False
                continue
                
            log(f"✅ {name} correctly returns empty array")
        
        # Verify orders has real Shopify data
        log("Checking orders has real Shopify data...")
        response = requests.get(f"{BASE_URL}/orders", params={"page": 1, "limit": 1})
        
        if response.status_code != 200:
            log(f"❌ Failed to get orders: {response.status_code}")
            all_passed = False
        else:
            orders_data = response.json()
            total_orders = orders_data.get('total', 0)
            
            if total_orders == 0:
                log(f"❌ Orders should have real Shopify data, got total: {total_orders}")
                all_passed = False
            else:
                log(f"✅ Orders has real data: {total_orders} orders total")
        
        # Verify SKU recipes has real Shopify data
        log("Checking SKU recipes has real Shopify data...")
        response = requests.get(f"{BASE_URL}/sku-recipes")
        
        if response.status_code != 200:
            log(f"❌ Failed to get SKU recipes: {response.status_code}")
            all_passed = False
        else:
            skus = response.json()
            if not isinstance(skus, list) or len(skus) == 0:
                log(f"❌ SKU recipes should have real data, got: {len(skus) if isinstance(skus, list) else 'not a list'}")
                all_passed = False
            else:
                log(f"✅ SKU recipes has real data: {len(skus)} SKUs")
        
        if all_passed:
            log("✅ TEST 4 PASSED: Demo data cleanup verification successful")
        else:
            log("❌ TEST 4 FAILED: Some demo data cleanup checks failed")
            
        return all_passed
        
    except Exception as e:
        log(f"❌ TEST 4 FAILED: {str(e)}")
        return False

def test_india_post_sync_no_trackable():
    """Test 5: INDIA POST SYNC WITH NO TRACKABLE ORDERS"""
    log("🔍 TEST 5: INDIA POST SYNC WITH NO TRACKABLE ORDERS")
    try:
        client = get_mongo_client()
        db = client[DB_NAME]
        
        # Step 1: Ensure no orders have trackingNumber and status "In Transit"
        log("Clearing tracking numbers and 'In Transit' status...")
        
        # First, get some orders that might have tracking numbers
        orders_with_tracking = list(db.orders.find({"trackingNumber": {"$ne": None, "$ne": ""}}))
        in_transit_orders = list(db.orders.find({"status": "In Transit"}))
        
        # Clear tracking numbers
        db.orders.update_many(
            {"trackingNumber": {"$ne": None, "$ne": ""}},
            {"$set": {"trackingNumber": None}}
        )
        
        # Change In Transit orders to Delivered
        db.orders.update_many(
            {"status": "In Transit"},
            {"$set": {"status": "Delivered"}}
        )
        
        log(f"✅ Cleared {len(orders_with_tracking)} orders with tracking numbers")
        log(f"✅ Changed {len(in_transit_orders)} 'In Transit' orders to 'Delivered'")
        
        # Step 2: Set India Post credentials
        log("Setting India Post test credentials...")
        db.integrations.update_one(
            {"_id": "integrations-config"},
            {"$set": {"indiaPost.username": "test", "indiaPost.password": "test"}},
            upsert=True
        )
        
        # Step 3: Call sync tracking
        log("Calling India Post sync tracking...")
        response = requests.post(
            f"{BASE_URL}/indiapost/sync-tracking",
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            log(f"❌ Sync tracking request failed: {response.status_code} - {response.text}")
            # Cleanup
            db.integrations.update_one(
                {"_id": "integrations-config"},
                {"$set": {"indiaPost.username": "", "indiaPost.password": ""}}
            )
            return False
            
        result = response.json()
        message = result.get('message', '')
        tracked = result.get('tracked', -1)
        
        log(f"Response message: {message}")
        log(f"Tracked count: {tracked}")
        
        # Verify message indicates no orders pending tracking
        if 'no orders pending tracking' not in message.lower():
            log(f"❌ Expected message about no orders pending tracking, got: {message}")
            # Cleanup
            db.integrations.update_one(
                {"_id": "integrations-config"},
                {"$set": {"indiaPost.username": "", "indiaPost.password": ""}}
            )
            return False
            
        if tracked != 0:
            log(f"❌ Expected 0 tracked orders, got: {tracked}")
            # Cleanup
            db.integrations.update_one(
                {"_id": "integrations-config"},
                {"$set": {"indiaPost.username": "", "indiaPost.password": ""}}
            )
            return False
        
        log("✅ Correct response: No orders pending tracking")
        
        # Step 4: Cleanup - reset India Post credentials
        log("Cleaning up: resetting India Post credentials...")
        db.integrations.update_one(
            {"_id": "integrations-config"},
            {"$set": {"indiaPost.username": "", "indiaPost.password": ""}}
        )
        
        # Restore original order states
        log("Restoring original order states...")
        for order in orders_with_tracking:
            db.orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"trackingNumber": order.get("trackingNumber")}}
            )
        
        for order in in_transit_orders:
            db.orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"status": "In Transit"}}
            )
        
        log("✅ Original order states restored")
        log("✅ TEST 5 PASSED: India Post sync with no trackable orders working")
        return True
        
    except Exception as e:
        log(f"❌ TEST 5 FAILED: {str(e)}")
        return False

def main():
    """Run all India Post RTO Engine tests."""
    log("🚀 Starting India Post RTO Engine Testing")
    log(f"Base URL: {BASE_URL}")
    log(f"MongoDB: {MONGO_URL}/{DB_NAME}")
    
    tests = [
        ("Tracking Number Save", test_tracking_number_save),
        ("India Post Sync Error Handling", test_india_post_sync_error),
        ("RTO Double-Shipping Penalty", test_rto_double_shipping),
        ("Demo Data Cleanup Verification", test_demo_data_cleanup),
        ("India Post Sync No Trackable Orders", test_india_post_sync_no_trackable)
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        log(f"\n{'='*60}")
        log(f"Running: {test_name}")
        log(f"{'='*60}")
        
        try:
            results[test_name] = test_func()
        except Exception as e:
            log(f"❌ {test_name} crashed: {str(e)}")
            results[test_name] = False
    
    # Summary
    log(f"\n{'='*60}")
    log("🏁 TEST SUMMARY")
    log(f"{'='*60}")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {test_name}")
        if result:
            passed += 1
    
    log(f"\n📊 Results: {passed}/{total} tests passed")
    
    if passed == total:
        log("🎉 ALL TESTS PASSED - India Post RTO Engine is working correctly!")
        return True
    else:
        log(f"⚠️  {total - passed} tests failed - Issues need attention")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)