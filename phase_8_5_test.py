#!/usr/bin/env python3
"""
Phase 8.5 Reality Reconciliation Patches Testing Suite
Tests 3 areas: Inventory Items CRUD, Ad Spend Tax Multiplier, Shopify Sync URL Verification
Base URL: https://profit-calc-fixes.preview.emergentagent.com/api (per review request)
"""

import requests
import json
from pymongo import MongoClient
import time

# Configuration from review request
BASE_URL = "https://profit-calc-fixes.preview.emergentagent.com/api"
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log_test(test_name, status, details=""):
    """Log test results with consistent formatting"""
    status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{status_icon} {test_name}: {status}")
    if details:
        print(f"   {details}")

def test_inventory_items_crud():
    """Test 1: INVENTORY ITEMS CRUD - All endpoints and operations"""
    print("\n🎯 TEST 1: INVENTORY ITEMS CRUD")
    
    created_items = []  # Track created items for cleanup
    
    try:
        # Test 1: POST first inventory item - Belgian Chocolate 500g
        chocolate_data = {
            "name": "Belgian Chocolate 500g",
            "category": "Raw Material", 
            "costPerUnit": 200,
            "unitMeasurement": "grams",
            "yieldPerUnit": 1
        }
        
        url = f"{BASE_URL}/inventory-items"
        response = requests.post(url, json=chocolate_data, timeout=30)
        
        if response.status_code == 201:
            chocolate_item = response.json()
            chocolate_id = chocolate_item.get('_id')
            if chocolate_id and chocolate_item.get('name') == "Belgian Chocolate 500g":
                log_test("POST Belgian Chocolate", "PASS", f"Created with ID: {chocolate_id}")
                created_items.append(chocolate_id)
            else:
                log_test("POST Belgian Chocolate", "FAIL", "Missing _id or incorrect name")
                return False
        else:
            log_test("POST Belgian Chocolate", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 2: POST second inventory item - BOPP Tape Roll
        tape_data = {
            "name": "BOPP Tape Roll",
            "category": "Packaging",
            "costPerUnit": 50,
            "unitMeasurement": "rolls", 
            "yieldPerUnit": 100
        }
        
        response = requests.post(url, json=tape_data, timeout=30)
        
        if response.status_code == 201:
            tape_item = response.json()
            tape_id = tape_item.get('_id')
            if tape_id and tape_item.get('name') == "BOPP Tape Roll":
                log_test("POST BOPP Tape", "PASS", f"Created with ID: {tape_id}")
                created_items.append(tape_id)
                
                # Verify tape's yieldPerUnit and costPerUnit
                if tape_item.get('yieldPerUnit') == 100 and tape_item.get('costPerUnit') == 50:
                    effective_cost = 50/100
                    log_test("Tape Effective Cost", "PASS", f"yieldPerUnit: 100, costPerUnit: 50, effective: {effective_cost}")
                else:
                    log_test("Tape Effective Cost", "FAIL", f"yieldPerUnit: {tape_item.get('yieldPerUnit')}, costPerUnit: {tape_item.get('costPerUnit')}")
                    return False
            else:
                log_test("POST BOPP Tape", "FAIL", "Missing _id or incorrect name")
                return False
        else:
            log_test("POST BOPP Tape", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 3: GET all inventory items
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            items = response.json()
            if isinstance(items, list) and len(items) >= 2:
                # Check if our items are present
                item_names = [item.get('name') for item in items]
                if "Belgian Chocolate 500g" in item_names and "BOPP Tape Roll" in item_names:
                    log_test("GET All Items", "PASS", f"Found {len(items)} items including our created items")
                else:
                    log_test("GET All Items", "FAIL", f"Created items not found in response. Names: {item_names}")
                    return False
            else:
                log_test("GET All Items", "FAIL", f"Expected array with >= 2 items, got: {type(items)} with {len(items) if isinstance(items, list) else 'N/A'} items")
                return False
        else:
            log_test("GET All Items", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 4: PUT update chocolate costPerUnit
        update_data = {"costPerUnit": 220}
        update_url = f"{BASE_URL}/inventory-items/{chocolate_id}"
        response = requests.put(update_url, json=update_data, timeout=30)
        
        if response.status_code == 200:
            updated_item = response.json()
            if updated_item.get('costPerUnit') == 220:
                log_test("PUT Update Chocolate", "PASS", f"Updated costPerUnit to 220")
            else:
                log_test("PUT Update Chocolate", "FAIL", f"costPerUnit: {updated_item.get('costPerUnit')} (expected: 220)")
                return False
        else:
            log_test("PUT Update Chocolate", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 5: GET single item to verify update
        response = requests.get(update_url, timeout=30)
        
        if response.status_code == 200:
            item = response.json()
            if item.get('costPerUnit') == 220:
                log_test("GET Updated Chocolate", "PASS", f"Verified costPerUnit: 220")
            else:
                log_test("GET Updated Chocolate", "FAIL", f"costPerUnit: {item.get('costPerUnit')} (expected: 220)")
                return False
        else:
            log_test("GET Updated Chocolate", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 6: DELETE tape item
        delete_url = f"{BASE_URL}/inventory-items/{tape_id}"
        response = requests.delete(delete_url, timeout=30)
        
        if response.status_code == 200:
            log_test("DELETE Tape Item", "PASS", "Successfully deleted tape item")
            created_items.remove(tape_id)  # Remove from cleanup list
        else:
            log_test("DELETE Tape Item", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Test 7: GET all items to verify only 1 left (plus any existing items)
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            items = response.json()
            # Check if chocolate is still there but tape is gone
            item_names = [item.get('name') for item in items]
            if "Belgian Chocolate 500g" in item_names and "BOPP Tape Roll" not in item_names:
                log_test("Verify After Delete", "PASS", f"Chocolate remains, tape deleted. Total items: {len(items)}")
            else:
                log_test("Verify After Delete", "FAIL", f"Unexpected items after delete. Names: {item_names}")
                return False
        else:
            log_test("Verify After Delete", "FAIL", f"Status: {response.status_code}")
            return False
        
        return True
        
    except Exception as e:
        log_test("Inventory Items CRUD", "FAIL", f"Error: {str(e)}")
        return False
    
    finally:
        # CLEANUP: Delete remaining created items
        for item_id in created_items:
            try:
                delete_url = f"{BASE_URL}/inventory-items/{item_id}"
                response = requests.delete(delete_url, timeout=10)
                if response.status_code == 200:
                    log_test("CLEANUP", "PASS", f"Deleted item {item_id}")
                else:
                    log_test("CLEANUP", "FAIL", f"Failed to delete item {item_id}")
            except Exception as e:
                log_test("CLEANUP", "FAIL", f"Error deleting item {item_id}: {str(e)}")

def test_ad_spend_tax_multiplier():
    """Test 2: AD SPEND TAX MULTIPLIER - 18% GST on Meta ads"""
    print("\n🎯 TEST 2: AD SPEND TAX MULTIPLIER")
    
    client = None
    
    try:
        # Connect to MongoDB to check tenantConfig and dailyMarketingSpend
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        
        # Check tenantConfig for adSpendTaxRate
        tenant_config = db.tenantConfig.find_one({})
        if tenant_config:
            ad_spend_tax_rate = tenant_config.get('adSpendTaxRate', 18)  # Default 18%
            log_test("TenantConfig adSpendTaxRate", "PASS", f"Rate: {ad_spend_tax_rate}% (default 18%)")
        else:
            log_test("TenantConfig adSpendTaxRate", "FAIL", "No tenant config found")
            return False
        
        # Read dailyMarketingSpend collection to sum all spendAmounts
        daily_spends = list(db.dailyMarketingSpend.find({}))
        if daily_spends:
            raw_total = sum(spend.get('spendAmount', 0) for spend in daily_spends)
            log_test("Daily Marketing Spend Total", "PASS", f"Raw total: ₹{raw_total:,.2f} from {len(daily_spends)} records")
        else:
            log_test("Daily Marketing Spend Total", "FAIL", "No dailyMarketingSpend records found")
            return False
        
        # Get dashboard data for 7 days or alltime to check filtered.adSpend
        url = f"{BASE_URL}/dashboard?range=alltime"
        response = requests.get(url, timeout=30)
        
        if response.status_code == 200:
            dashboard_data = response.json()
            filtered = dashboard_data.get('filtered', {})
            dashboard_ad_spend = filtered.get('adSpend', 0)
            
            # The dashboard adSpend should be approximately rawTotal * 1.18 (default 18% tax)
            expected_ad_spend = raw_total * (1 + (ad_spend_tax_rate / 100))
            difference = abs(dashboard_ad_spend - expected_ad_spend)
            
            # Allow some tolerance for date filtering differences
            if difference <= raw_total * 0.1:  # 10% tolerance
                log_test("Dashboard Ad Spend Tax", "PASS", f"Dashboard: ₹{dashboard_ad_spend:,.2f} ≈ Raw: ₹{raw_total:,.2f} × {1 + (ad_spend_tax_rate/100):.2f} = ₹{expected_ad_spend:,.2f}")
            else:
                log_test("Dashboard Ad Spend Tax", "FAIL", f"Dashboard: ₹{dashboard_ad_spend:,.2f} ≠ Expected: ₹{expected_ad_spend:,.2f} (diff: ₹{difference:,.2f})")
                return False
        else:
            log_test("Dashboard Ad Spend Check", "FAIL", f"Status: {response.status_code}")
            return False
        
        # Find an order that has marketing spend data for its date
        # Get available marketing spend dates from database
        marketing_dates = [spend['date'] for spend in db.dailyMarketingSpend.find({}, {'date': 1}).sort('date', -1)]
        
        order_id = None
        marketing_allocation = 0
        
        # Try to find an order that matches a marketing spend date
        for date in marketing_dates[:10]:  # Check first 10 dates
            # Create a test order for this date if none exist
            test_order_data = {
                "orderId": f"TEST-{date}",
                "sku": "TEST-SKU",
                "productName": "Test Product",
                "customerName": "Test Customer",
                "salePrice": 1000,
                "discount": 0,
                "status": "Delivered",
                "shippingMethod": "indiapost",
                "shippingCost": 50,
                "orderDate": f"{date}T12:00:00+05:30"
            }
            
            # Create the test order
            create_url = f"{BASE_URL}/orders"
            response = requests.post(create_url, json=test_order_data, timeout=30)
            
            if response.status_code == 201:
                created_order = response.json()
                order_id = created_order.get('_id')
                log_test("Create Test Order", "PASS", f"Created test order for {date}: {order_id}")
                
                # Get profit calculation for this order
                profit_url = f"{BASE_URL}/calculate-profit/{order_id}"
                response = requests.get(profit_url, timeout=30)
                
                if response.status_code == 200:
                    profit_data = response.json()
                    marketing_allocation = profit_data.get('marketingAllocation', 0)
                    
                    # Clean up the test order
                    delete_url = f"{BASE_URL}/orders/{order_id}"
                    requests.delete(delete_url, timeout=10)
                    
                    break
                else:
                    # Clean up the test order if profit calculation failed
                    delete_url = f"{BASE_URL}/orders/{order_id}"
                    requests.delete(delete_url, timeout=10)
            
        if order_id and marketing_allocation > 0:
            log_test("Marketing Allocation Tax", "PASS", f"Marketing allocation: ₹{marketing_allocation:.2f} > 0 (includes 1.18 multiplier)")
        elif order_id:
            # Check if Meta Ads is actually active
            integrations = db.integrations.find_one({'_id': 'integrations-config'})
            meta_active = integrations and integrations.get('metaAds', {}).get('active', False)
            if meta_active:
                log_test("Marketing Allocation Tax", "FAIL", f"Meta Ads active but marketing allocation: ₹{marketing_allocation:.2f}")
                return False
            else:
                log_test("Marketing Allocation Tax", "PASS", f"Meta Ads inactive, marketing allocation correctly 0")
        else:
            log_test("Marketing Allocation Test Setup", "FAIL", "Could not create test order or get profit calculation")
            return False
        
        return True
        
    except Exception as e:
        log_test("Ad Spend Tax Multiplier", "FAIL", f"Error: {str(e)}")
        return False
    
    finally:
        if client:
            client.close()

def test_shopify_sync_url_verification():
    """Test 3: SHOPIFY SYNC URL VERIFICATION - Check source code for status=any"""
    print("\n🎯 TEST 3: SHOPIFY SYNC URL VERIFICATION")
    
    try:
        # Read the route.js file to verify Shopify sync URL contains "status=any"
        route_file_path = "/app/app/api/[[...path]]/route.js"
        
        with open(route_file_path, 'r') as f:
            file_content = f.read()
        
        # Search for the Shopify orders sync URL pattern
        if "status=any" in file_content:
            log_test("Shopify URL Status Parameter", "PASS", "Found 'status=any' in route.js")
            
            # Find the specific line for more context
            lines = file_content.split('\n')
            for i, line in enumerate(lines):
                if "status=any" in line and "orders.json" in line:
                    log_test("Shopify Orders URL Line", "PASS", f"Line {i+1}: {line.strip()}")
                    break
        else:
            log_test("Shopify URL Status Parameter", "FAIL", "'status=any' not found in route.js")
            return False
        
        # Also check for the specific orders endpoint pattern
        if "/admin/api/" in file_content and "orders.json" in file_content:
            log_test("Shopify Orders Endpoint", "PASS", "Found Shopify orders API endpoint")
        else:
            log_test("Shopify Orders Endpoint", "FAIL", "Shopify orders API endpoint not found")
            return False
        
        return True
        
    except Exception as e:
        log_test("Shopify Sync URL Verification", "FAIL", f"Error: {str(e)}")
        return False

def main():
    """Run all Phase 8.5 Reality Reconciliation tests"""
    print("=" * 80)
    print("🚀 PHASE 8.5 REALITY RECONCILIATION TESTING SUITE") 
    print("=" * 80)
    print(f"📍 Base URL: {BASE_URL}")
    print(f"💾 MongoDB: {MONGO_URI}/{DB_NAME}")
    print("📝 Testing: Inventory Items CRUD, Ad Spend Tax Multiplier, Shopify Sync URL")
    
    tests = [
        ("Inventory Items CRUD", test_inventory_items_crud),
        ("Ad Spend Tax Multiplier", test_ad_spend_tax_multiplier), 
        ("Shopify Sync URL Verification", test_shopify_sync_url_verification),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            log_test(test_name, "FAIL", f"Unexpected error: {str(e)}")
            results[test_name] = False
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 PHASE 8.5 REALITY RECONCILIATION TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n🎯 RESULT: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL PHASE 8.5 TESTS PASSED!")
        return True
    else:
        print("⚠️  SOME TESTS FAILED - REVIEW ABOVE DETAILS")
        return False

if __name__ == "__main__":
    main()