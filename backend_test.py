#!/usr/bin/env python3

"""
FIFO INVENTORY COSTING BACKEND TEST
Phase 9F Testing - 8 Critical Areas

Tests the complete FIFO (First-In-First-Out) inventory costing system
including stock management, batch tracking, and expense integration.
"""

import requests
import json
import os
from datetime import datetime

# Get base URL from environment
base_url = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
api_base = f"{base_url}/api"

print(f"🔧 Testing FIFO Inventory Costing System")
print(f"📍 Base URL: {api_base}")
print(f"📅 Test Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

def test_api_call(method, endpoint, data=None, expected_status=200):
    """Make API call and return response with error handling"""
    url = f"{api_base}/{endpoint.lstrip('/')}"
    try:
        if method == 'GET':
            response = requests.get(url, timeout=30)
        elif method == 'POST':
            response = requests.post(url, json=data, timeout=30)
        elif method == 'PUT':
            response = requests.put(url, json=data, timeout=30)
        elif method == 'DELETE':
            response = requests.delete(url, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"  {method} {endpoint} -> {response.status_code}")
        
        if response.status_code != expected_status:
            print(f"    ❌ Expected {expected_status}, got {response.status_code}")
            if response.text:
                print(f"    Response: {response.text[:200]}")
            return None
        
        if response.text:
            return response.json()
        return {}
        
    except Exception as e:
        print(f"    ❌ API call failed: {str(e)}")
        return None

# Global test data storage
test_inventory_item_id = None
test_inventory_item_name = "Red Roses"
cleanup_items = []

def cleanup_test_data():
    """Clean up all test data created during testing"""
    print("\n🧹 CLEANING UP TEST DATA...")
    
    # Delete test inventory items
    for item_id in cleanup_items:
        if item_id.startswith('expense_'):
            expense_id = item_id.replace('expense_', '')
            test_api_call('DELETE', f'/overhead-expenses/{expense_id}')
        elif item_id.startswith('batch_'):
            batch_id = item_id.replace('batch_', '')
            test_api_call('DELETE', f'/stock-batches/{batch_id}')
        elif item_id.startswith('inventory_'):
            inventory_id = item_id.replace('inventory_', '')
            test_api_call('DELETE', f'/inventory-items/{inventory_id}')
    
    # Reverse any test consumptions
    test_api_call('POST', '/stock/reverse', {"orderId": "test-fifo-order"})
    test_api_call('POST', '/stock/reverse', {"orderId": "test-low-stock"})
    
    print("✅ Cleanup completed")

def test_1_inventory_items_with_stock():
    """Test 1: Inventory items with auto-created stock batch"""
    global test_inventory_item_id, test_inventory_item_name
    
    print("🎯 TEST 1: INVENTORY ITEMS WITH AUTO-CREATED STOCK BATCH")
    
    # Create inventory item
    item_data = {
        "name": test_inventory_item_name,
        "category": "Raw Material", 
        "purchasePrice": 2500,
        "purchaseQuantity": 500,
        "unit": "stems",
        "lowStockThreshold": 50
    }
    
    result = test_api_call('POST', '/inventory-items', item_data, 201)
    if not result:
        return False
        
    test_inventory_item_id = result.get('_id')
    cleanup_items.append(f'inventory_{test_inventory_item_id}')
    
    # Verify baseCostPerUnit calculation
    expected_cost = 2500 / 500  # 5.00
    if abs(result.get('baseCostPerUnit', 0) - expected_cost) > 0.01:
        print(f"    ❌ baseCostPerUnit expected {expected_cost}, got {result.get('baseCostPerUnit')}")
        return False
    print(f"    ✅ baseCostPerUnit correctly calculated: {result.get('baseCostPerUnit')}")
    
    # Verify lowStockThreshold
    if result.get('lowStockThreshold') != 50:
        print(f"    ❌ lowStockThreshold expected 50, got {result.get('lowStockThreshold')}")
        return False
    print(f"    ✅ lowStockThreshold correctly set: {result.get('lowStockThreshold')}")
    
    # Check currentStock from auto-created batch
    inventory_items = test_api_call('GET', '/inventory-items')
    if not inventory_items:
        return False
        
    our_item = next((item for item in inventory_items if item['_id'] == test_inventory_item_id), None)
    if not our_item:
        print(f"    ❌ Created inventory item not found in list")
        return False
        
    expected_stock = 500
    if our_item.get('currentStock') != expected_stock:
        print(f"    ❌ currentStock expected {expected_stock}, got {our_item.get('currentStock')}")
        return False
    print(f"    ✅ currentStock from auto-batch: {our_item.get('currentStock')}")
    
    # Verify stock batch was auto-created
    batches = test_api_call('GET', f'/stock-batches?inventoryItemId={test_inventory_item_id}')
    if not batches or len(batches) != 1:
        print(f"    ❌ Expected 1 auto-created batch, got {len(batches) if batches else 0}")
        return False
        
    batch = batches[0]
    if batch.get('quantity') != 500 or batch.get('costPerUnit') != 5.0 or batch.get('remainingQty') != 500:
        print(f"    ❌ Auto-batch incorrect: qty={batch.get('quantity')}, cost={batch.get('costPerUnit')}, remaining={batch.get('remainingQty')}")
        return False
    print(f"    ✅ Auto-created batch verified: qty=500, cost=5.0, remaining=500")
    
    print("    🎉 TEST 1 PASSED - Inventory item with auto-stock batch working correctly\n")
    return True

def test_2_manual_stock_batch_creation():
    """Test 2: Manual stock batch creation"""
    print("🎯 TEST 2: MANUAL STOCK BATCH CREATION")
    
    if not test_inventory_item_id:
        print("    ❌ Test inventory item ID not available")
        return False
    
    # Create manual stock batch at different price
    batch_data = {
        "inventoryItemId": test_inventory_item_id,
        "inventoryItemName": test_inventory_item_name,
        "date": "2026-03-15",
        "quantity": 300,
        "costPerUnit": 6
    }
    
    result = test_api_call('POST', '/stock-batches', batch_data, 201)
    if not result:
        return False
        
    # Verify totalCost calculation
    expected_total = 300 * 6  # 1800
    if result.get('totalCost') != expected_total:
        print(f"    ❌ totalCost expected {expected_total}, got {result.get('totalCost')}")
        return False
    print(f"    ✅ Manual batch totalCost: {result.get('totalCost')}")
    
    # Check updated stock summary
    inventory_summary = test_api_call('GET', '/inventory-items')
    if not inventory_summary:
        return False
        
    our_item = next((item for item in inventory_summary if item['_id'] == test_inventory_item_id), None)
    if not our_item:
        print(f"    ❌ Item not found in stock summary")
        return False
        
    # Verify currentStock is now 800 (500 + 300)
    expected_stock = 800
    if our_item.get('currentStock') != expected_stock:
        print(f"    ❌ currentStock expected {expected_stock}, got {our_item.get('currentStock')}")
        return False
    print(f"    ✅ Updated currentStock: {our_item.get('currentStock')}")
    
    # Verify avgCostPerUnit (weighted average)
    # (500*5 + 300*6) / 800 = (2500 + 1800) / 800 = 4300/800 = 5.375
    expected_avg = 5.38  # Rounded
    actual_avg = our_item.get('avgCostPerUnit', 0)
    if abs(actual_avg - expected_avg) > 0.01:
        print(f"    ❌ avgCostPerUnit expected ~{expected_avg}, got {actual_avg}")
        return False
    print(f"    ✅ Weighted avgCostPerUnit: {actual_avg}")
    
    print("    🎉 TEST 2 PASSED - Manual stock batch creation working correctly\n")
    return True

def test_3_fifo_consumption():
    """Test 3: FIFO consumption"""
    print("🎯 TEST 3: FIFO CONSUMPTION")
    
    if not test_inventory_item_id:
        print("    ❌ Test inventory item ID not available")
        return False
    
    # Consume 600 units (should take 500 from first batch @5 + 100 from second batch @6)
    consumption_data = {
        "orderId": "test-fifo-order",
        "orderDate": "2026-03-10",
        "items": [
            {
                "inventoryItemId": test_inventory_item_id,
                "inventoryItemName": test_inventory_item_name,
                "quantity": 600
            }
        ]
    }
    
    result = test_api_call('POST', '/stock/consume', consumption_data, 201)
    if not result:
        return False
    
    # Verify total COGS: 500*5 + 100*6 = 2500 + 600 = 3100
    expected_cogs = 3100.0
    actual_cogs = result.get('totalCOGS', 0)
    if abs(actual_cogs - expected_cogs) > 0.01:
        print(f"    ❌ totalCOGS expected {expected_cogs}, got {actual_cogs}")
        return False
    print(f"    ✅ FIFO totalCOGS: {actual_cogs}")
    
    # Verify consumptions array has 2 entries
    consumptions = result.get('consumptions', [])
    if len(consumptions) != 2:
        print(f"    ❌ Expected 2 consumption entries, got {len(consumptions)}")
        return False
    print(f"    ✅ Consumption entries: {len(consumptions)}")
    
    # Verify first consumption: 500@5
    first_consumption = consumptions[0] 
    if first_consumption.get('quantity') != 500 or first_consumption.get('costPerUnit') != 5:
        print(f"    ❌ First consumption incorrect: qty={first_consumption.get('quantity')}, cost={first_consumption.get('costPerUnit')}")
        return False
    print(f"    ✅ First batch consumption: 500@5 = {first_consumption.get('totalCost')}")
    
    # Verify second consumption: 100@6
    second_consumption = consumptions[1]
    if second_consumption.get('quantity') != 100 or second_consumption.get('costPerUnit') != 6:
        print(f"    ❌ Second consumption incorrect: qty={second_consumption.get('quantity')}, cost={second_consumption.get('costPerUnit')}")
        return False
    print(f"    ✅ Second batch consumption: 100@6 = {second_consumption.get('totalCost')}")
    
    # Verify remaining stock is 200 (800 - 600)
    inventory_summary = test_api_call('GET', '/inventory-items')
    if inventory_summary:
        our_item = next((item for item in inventory_summary if item['_id'] == test_inventory_item_id), None)
        if our_item and our_item.get('currentStock') == 200:
            print(f"    ✅ Remaining stock after consumption: {our_item.get('currentStock')}")
        else:
            print(f"    ❌ Expected remaining stock 200, got {our_item.get('currentStock') if our_item else 'N/A'}")
            return False
    
    print("    🎉 TEST 3 PASSED - FIFO consumption working correctly\n")
    return True

def test_4_stock_reversal():
    """Test 4: Stock reversal"""
    print("🎯 TEST 4: STOCK REVERSAL")
    
    # Reverse the consumption from test 3
    reversal_data = {"orderId": "test-fifo-order"}
    
    result = test_api_call('POST', '/stock/reverse', reversal_data, 200)
    if not result:
        return False
    
    # Verify reversed count
    expected_reversed = 2
    actual_reversed = result.get('reversed', 0)
    if actual_reversed != expected_reversed:
        print(f"    ❌ Expected {expected_reversed} reversals, got {actual_reversed}")
        return False
    print(f"    ✅ Reversed consumption records: {actual_reversed}")
    
    # Verify stock is back to 800
    inventory_summary = test_api_call('GET', '/inventory-items')
    if not inventory_summary:
        return False
        
    our_item = next((item for item in inventory_summary if item['_id'] == test_inventory_item_id), None)
    if not our_item:
        print(f"    ❌ Item not found in stock summary")
        return False
        
    expected_stock = 800
    if our_item.get('currentStock') != expected_stock:
        print(f"    ❌ currentStock expected {expected_stock}, got {our_item.get('currentStock')}")
        return False
    print(f"    ✅ Stock restored to: {our_item.get('currentStock')}")
    
    print("    🎉 TEST 4 PASSED - Stock reversal working correctly\n")
    return True

def test_5_stock_movements():
    """Test 5: Stock movements timeline"""
    print("🎯 TEST 5: STOCK MOVEMENTS TIMELINE")
    
    if not test_inventory_item_id:
        print("    ❌ Test inventory item ID not available")
        return False
    
    # Get movements for our inventory item
    movements = test_api_call('GET', f'/stock/movements/{test_inventory_item_id}')
    if not movements:
        return False
    
    if not isinstance(movements, list):
        print(f"    ❌ Expected array of movements, got {type(movements)}")
        return False
    
    # Should have at least purchase movements (auto-batch + manual batch)
    purchase_movements = [m for m in movements if m.get('type') == 'purchase']
    if len(purchase_movements) < 2:
        print(f"    ❌ Expected at least 2 purchase movements, got {len(purchase_movements)}")
        return False
    print(f"    ✅ Purchase movements found: {len(purchase_movements)}")
    
    # Verify movement structure
    for i, movement in enumerate(purchase_movements[:2]):
        required_fields = ['type', 'date', 'quantity', 'costPerUnit', 'totalCost']
        missing_fields = [field for field in required_fields if field not in movement]
        if missing_fields:
            print(f"    ❌ Movement {i} missing fields: {missing_fields}")
            return False
        print(f"    ✅ Movement {i} structure valid: {movement.get('type')}, qty={movement.get('quantity')}, cost={movement.get('costPerUnit')}")
    
    print("    🎉 TEST 5 PASSED - Stock movements working correctly\n")
    return True

def test_6_expense_inventory_bridge():
    """Test 6: Expense → Inventory bridge"""
    print("🎯 TEST 6: EXPENSE → INVENTORY BRIDGE")
    
    if not test_inventory_item_id:
        print("    ❌ Test inventory item ID not available")
        return False
    
    # Create expense under "Raw Material Purchases" with inventory link
    expense_data = {
        "expenseName": "Rose Purchase March",
        "category": "Raw Material Purchases", 
        "amount": 4000,
        "frequency": "one-time",
        "date": "2026-03-20",
        "inventoryItemId": test_inventory_item_id,
        "inventoryItemName": test_inventory_item_name,
        "purchaseQty": 800,
        "gstInclusive": False
    }
    
    result = test_api_call('POST', '/overhead-expenses', expense_data, 201)
    if not result:
        return False
        
    expense_id = result.get('_id')
    cleanup_items.append(f'expense_{expense_id}')
    
    # Verify _stockBatchCreated field exists and is non-null
    stock_batch_id = result.get('_stockBatchCreated')
    if not stock_batch_id:
        print(f"    ❌ _stockBatchCreated field missing or null")
        return False
    print(f"    ✅ Stock batch auto-created: {stock_batch_id}")
    
    # Verify we now have 3 batches total
    batches = test_api_call('GET', f'/stock-batches?inventoryItemId={test_inventory_item_id}')
    if not batches or len(batches) != 3:
        print(f"    ❌ Expected 3 batches total, got {len(batches) if batches else 0}")
        return False
    print(f"    ✅ Total batches now: {len(batches)}")
    
    # Find the new batch and verify it has correct values
    new_batch = next((b for b in batches if b.get('expenseId') == expense_id), None)
    if not new_batch:
        print(f"    ❌ New batch with expenseId not found")
        return False
        
    # Verify: qty=800, costPerUnit=5 (4000/800), expenseId set
    if new_batch.get('quantity') != 800:
        print(f"    ❌ New batch quantity expected 800, got {new_batch.get('quantity')}")
        return False
    
    expected_cost = 4000 / 800  # 5.0
    if abs(new_batch.get('costPerUnit', 0) - expected_cost) > 0.01:
        print(f"    ❌ New batch costPerUnit expected {expected_cost}, got {new_batch.get('costPerUnit')}")
        return False
        
    if new_batch.get('expenseId') != expense_id:
        print(f"    ❌ New batch expenseId expected {expense_id}, got {new_batch.get('expenseId')}")
        return False
        
    print(f"    ✅ New batch verified: qty=800, cost={new_batch.get('costPerUnit')}, expenseId linked")
    
    print("    🎉 TEST 6 PASSED - Expense → Inventory bridge working correctly\n")
    return True

def test_7_low_stock_alert():
    """Test 7: Low stock alerts"""
    print("🎯 TEST 7: LOW STOCK ALERTS")
    
    if not test_inventory_item_id:
        print("    ❌ Test inventory item ID not available")
        return False
    
    # Current stock should be 800+800=1600 (original 800 + expense batch 800)
    # Consume 1550 to get down to 50 (which equals threshold)
    consumption_data = {
        "orderId": "test-low-stock",
        "items": [
            {
                "inventoryItemId": test_inventory_item_id,
                "quantity": 1550
            }
        ]
    }
    
    consume_result = test_api_call('POST', '/stock/consume', consumption_data, 201)
    if not consume_result:
        return False
    print(f"    ✅ Consumed 1550 units")
    
    # Check stock summary for low stock flag
    inventory_summary = test_api_call('GET', '/stock/summary')
    if not inventory_summary:
        return False
        
    our_item = next((item for item in inventory_summary if item['_id'] == test_inventory_item_id), None)
    if not our_item:
        print(f"    ❌ Item not found in stock summary")
        return False
    
    # Verify currentStock is 50 (1600 - 1550)
    expected_stock = 50
    if our_item.get('currentStock') != expected_stock:
        print(f"    ❌ currentStock expected {expected_stock}, got {our_item.get('currentStock')}")
        return False
    print(f"    ✅ Current stock at threshold: {our_item.get('currentStock')}")
    
    # Verify isLowStock flag is true
    if not our_item.get('isLowStock'):
        print(f"    ❌ isLowStock expected true, got {our_item.get('isLowStock')}")
        return False
    print(f"    ✅ Low stock alert triggered: {our_item.get('isLowStock')}")
    
    # Clean up - reverse this consumption
    test_api_call('POST', '/stock/reverse', {"orderId": "test-low-stock"})
    print(f"    ✅ Test consumption reversed")
    
    print("    🎉 TEST 7 PASSED - Low stock alerts working correctly\n")
    return True

def test_8_dashboard_integrity():
    """Test 8: Dashboard still works with FIFO system"""
    print("🎯 TEST 8: DASHBOARD INTEGRITY CHECK")
    
    # Test dashboard with 7 days range
    dashboard = test_api_call('GET', '/dashboard?range=7days')
    if not dashboard:
        return False
    
    # Verify plBreakdown exists and has required keys
    pl_breakdown = dashboard.get('plBreakdown')
    if not pl_breakdown:
        print(f"    ❌ plBreakdown missing from dashboard response")
        return False
    print(f"    ✅ plBreakdown found in dashboard")
    
    # Check for key fields that should exist with FIFO system
    required_keys = [
        'grossRevenue', 'discount', 'refunds', 'gstOnRevenue', 'netRevenue',
        'totalCOGS', 'totalShipping', 'totalTxnFees', 'razorpayFee', 'razorpayTax',
        'shopifyTxnFee', 'shopifyTxnGST', 'totalShopifyFee', 'adSpend', 'overhead',
        'overheadCategoryBreakdown', 'netProfit'
    ]
    
    missing_keys = [key for key in required_keys if key not in pl_breakdown]
    if missing_keys:
        print(f"    ❌ plBreakdown missing keys: {missing_keys}")
        return False
    print(f"    ✅ All {len(required_keys)} plBreakdown keys present")
    
    # Verify overheadCategoryBreakdown is array
    overhead_breakdown = pl_breakdown.get('overheadCategoryBreakdown')
    if not isinstance(overhead_breakdown, list):
        print(f"    ❌ overheadCategoryBreakdown should be array, got {type(overhead_breakdown)}")
        return False
    print(f"    ✅ overheadCategoryBreakdown is array with {len(overhead_breakdown)} categories")
    
    # Verify dashboard returns 200 and has basic structure
    filtered = dashboard.get('filtered', {})
    if not filtered:
        print(f"    ❌ filtered section missing from dashboard")
        return False
    print(f"    ✅ Dashboard filtered section present")
    
    # Check that key metrics exist
    key_metrics = ['netProfit', 'totalOrders', 'revenue', 'adSpend']
    for metric in key_metrics:
        if metric not in filtered:
            print(f"    ❌ Metric '{metric}' missing from filtered")
            return False
    print(f"    ✅ Key dashboard metrics present: {list(filtered.keys())}")
    
    print("    🎉 TEST 8 PASSED - Dashboard integrity maintained with FIFO system\n")
    return True

def run_all_tests():
    """Run all 8 FIFO inventory costing tests"""
    print("=" * 70)
    print("🚀 STARTING PHASE 9F: FIFO INVENTORY COSTING BACKEND TESTING")
    print("=" * 70)
    
    tests = [
        ("Inventory Items with Auto-Stock Batch", test_1_inventory_items_with_stock),
        ("Manual Stock Batch Creation", test_2_manual_stock_batch_creation), 
        ("FIFO Consumption (600 from 500@₹5 + 100@₹6)", test_3_fifo_consumption),
        ("Stock Reversal", test_4_stock_reversal),
        ("Stock Movements Timeline", test_5_stock_movements),
        ("Expense → Inventory Bridge", test_6_expense_inventory_bridge),
        ("Low Stock Alerts", test_7_low_stock_alert),
        ("Dashboard Integrity", test_8_dashboard_integrity),
    ]
    
    passed = 0
    failed = 0
    
    try:
        for test_name, test_func in tests:
            print(f"▶️ Running: {test_name}")
            try:
                if test_func():
                    passed += 1
                    print(f"✅ PASSED: {test_name}")
                else:
                    failed += 1
                    print(f"❌ FAILED: {test_name}")
            except Exception as e:
                failed += 1
                print(f"❌ FAILED: {test_name} - Exception: {str(e)}")
            print("-" * 50)
    
    finally:
        # Always clean up test data
        cleanup_test_data()
    
    print("\n" + "=" * 70)
    print("🏁 FIFO INVENTORY COSTING TESTING COMPLETE")
    print("=" * 70)
    print(f"✅ PASSED: {passed}/8 tests")
    print(f"❌ FAILED: {failed}/8 tests")
    
    if passed == 8:
        print("🎉 ALL TESTS PASSED - FIFO Inventory Costing System Fully Functional!")
        return True
    else:
        print(f"⚠️  {failed} TESTS FAILED - Issues found in FIFO Inventory System")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)