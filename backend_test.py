#!/usr/bin/env python3
"""
Backend API Testing Script for Bug Fixes Batch Testing
Tests 5 specific bug fix scenarios as requested in the review.
"""

import requests
import json
import time
import sys
from typing import Dict, List, Any

# Base URL from environment
BASE_URL = "https://smart-finance-hub-41.preview.emergentagent.com/api"

class TestLogger:
    def __init__(self):
        self.results = []
        
    def log(self, message: str, status: str = "INFO"):
        print(f"[{status}] {message}")
        self.results.append({"message": message, "status": status})
    
    def log_test_start(self, test_name: str):
        print(f"\n🧪 TESTING: {test_name}")
        print("=" * 60)
    
    def log_test_result(self, test_name: str, passed: bool, details: str = ""):
        status = "PASS" if passed else "FAIL"
        emoji = "✅" if passed else "❌"
        print(f"\n{emoji} {test_name}: {status}")
        if details:
            print(f"   Details: {details}")
        self.results.append({"test": test_name, "status": status, "details": details})

def make_request(method: str, endpoint: str, data: Dict = None, params: Dict = None) -> Dict:
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        response.raise_for_status()
        return {"status": response.status_code, "data": response.json() if response.text else {}}
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "status": getattr(e.response, 'status_code', 0)}
    except json.JSONDecodeError as e:
        return {"error": f"JSON decode error: {e}", "status": response.status_code, "raw": response.text[:500]}
    except Exception as e:
        return {"error": str(e), "status": 0}

def test_tip_cleanup_verification(logger: TestLogger):
    """Test 1: Tip cleanup verification"""
    logger.log_test_start("TIP CLEANUP VERIFICATION")
    
    # Test 1a: GET /api/orders?page=1&limit=50 — verify NO orders have productName='Tip'
    logger.log("Fetching orders to check for Tip items...")
    response = make_request("GET", "/orders", params={"page": 1, "limit": 50})
    
    if "error" in response:
        logger.log_test_result("Tip cleanup verification", False, f"Failed to fetch orders: {response['error']}")
        return False
    
    orders = response["data"].get("orders", [])
    logger.log(f"Found {len(orders)} orders to check")
    
    # Check for Tip items
    tip_orders = [o for o in orders if o.get("productName", "").lower() == "tip"]
    
    if tip_orders:
        logger.log_test_result("No Tip orders", False, f"Found {len(tip_orders)} orders with productName='Tip'")
        return False
    else:
        logger.log_test_result("No Tip orders", True, f"✅ No orders with productName='Tip' found in {len(orders)} orders")
    
    # Test 1b: Verify all orders have tipAmount and quantity fields
    missing_tipAmount = [o for o in orders if "tipAmount" not in o or not isinstance(o.get("tipAmount"), (int, float))]
    missing_quantity = [o for o in orders if "quantity" not in o or not isinstance(o.get("quantity"), int) or o.get("quantity", 0) < 1]
    
    if missing_tipAmount:
        logger.log_test_result("tipAmount field check", False, f"{len(missing_tipAmount)} orders missing tipAmount field")
        return False
    else:
        logger.log_test_result("tipAmount field check", True, f"All {len(orders)} orders have tipAmount field")
    
    if missing_quantity:
        logger.log_test_result("quantity field check", False, f"{len(missing_quantity)} orders missing valid quantity field (≥1)")
        return False
    else:
        logger.log_test_result("quantity field check", True, f"All {len(orders)} orders have quantity field ≥ 1")
    
    logger.log("🎯 TIP CLEANUP VERIFICATION: ALL CHECKS PASSED")
    return True

def test_material_summary_fix(logger: TestLogger):
    """Test 2: Material Summary Fix (CRITICAL)"""
    logger.log_test_start("MATERIAL SUMMARY FIX (CRITICAL)")
    
    # Step 1: Find recipes with ingredients and orders, using a smarter approach
    logger.log("Finding SKU recipes with ingredients and matching orders...")
    
    # Get orders first
    response = make_request("GET", "/orders", params={"page": 1, "limit": 100})
    if "error" in response:
        logger.log_test_result("Material summary fix", False, f"Failed to fetch orders: {response['error']}")
        return False
    
    orders = response["data"].get("orders", [])
    order_skus = set(order.get("sku") for order in orders if order.get("sku"))
    logger.log(f"Found {len(orders)} orders with {len(order_skus)} unique SKUs")
    
    # Get recipes with ingredients
    response = make_request("GET", "/sku-recipes")
    if "error" in response:
        logger.log_test_result("Material summary fix", False, f"Failed to fetch SKU recipes: {response['error']}")
        return False
    
    recipes = response["data"]
    logger.log(f"Found {len(recipes)} SKU recipes")
    
    # Find a recipe that has ingredients AND has orders
    matching_recipe = None
    matching_order = None
    
    for recipe in recipes:
        if (recipe.get("ingredients") and len(recipe["ingredients"]) > 0 and 
            recipe.get("sku") in order_skus):
            
            # Find the first order with this SKU
            for order in orders:
                if order.get("sku") == recipe["sku"]:
                    matching_recipe = recipe
                    matching_order = order
                    break
            
            if matching_recipe:
                break
    
    if not matching_recipe or not matching_order:
        logger.log_test_result("Material summary fix", False, "No recipe found with both ingredients and matching orders")
        return False
    
    target_sku = matching_recipe["sku"]
    order_id = matching_order["_id"]
    logger.log(f"Found matching pair - SKU: {target_sku} ({len(matching_recipe['ingredients'])} ingredients), Order: {order_id}")
    
    # Step 2: Test material summary API
    logger.log("Testing KDS material summary API...")
    response = make_request("GET", "/kds/material-summary", params={"orderIds": order_id})
    
    if "error" in response:
        logger.log_test_result("Material summary fix", False, f"KDS material summary API failed: {response['error']}")
        return False
    
    material_data = response["data"]
    materials = material_data.get("materials", [])
    
    if not materials or len(materials) == 0:
        logger.log_test_result("Material summary fix", False, f"Material summary returned empty materials array")
        return False
    
    # Verify material structure
    valid_materials = True
    for material in materials:
        required_fields = ["name", "type", "quantity", "unit"]
        for field in required_fields:
            if field not in material:
                logger.log_test_result("Material summary fix", False, f"Material missing required field: {field}")
                valid_materials = False
                break
    
    if not valid_materials:
        return False
    
    logger.log_test_result("Material summary fix", True, f"✅ Material summary returned {len(materials)} materials with valid structure")
    logger.log("🎯 MATERIAL SUMMARY FIX: CRITICAL TEST PASSED")
    return True

def test_recipe_template_deletion_unlinks(logger: TestLogger):
    """Test 3: Recipe Template Deletion Unlinks Products"""
    logger.log_test_start("RECIPE TEMPLATE DELETION UNLINKS PRODUCTS")
    
    # Step 1: Create a test recipe template
    logger.log("Creating test recipe template...")
    template_data = {
        "name": "Test Unlink Template",
        "ingredients": [
            {
                "name": "Test Material",
                "category": "Raw Materials", 
                "quantityUsed": 1,
                "baseCostPerUnit": 10,
                "unit": "pcs"
            }
        ]
    }
    
    response = make_request("POST", "/recipe-templates", template_data)
    if "error" in response:
        logger.log_test_result("Template creation", False, f"Failed to create template: {response['error']}")
        return False
    
    template_id = response["data"]["_id"]
    logger.log(f"Created template: {template_id}")
    
    # Step 2: Get a SKU recipe to link to
    logger.log("Finding SKU recipe to link...")
    response = make_request("GET", "/sku-recipes")
    if "error" in response or not response["data"]:
        logger.log_test_result("Recipe template deletion", False, "Failed to get SKU recipes")
        return False
    
    recipe_id = response["data"][0]["_id"]
    logger.log(f"Using recipe: {recipe_id}")
    
    # Step 3: Link template to recipe
    logger.log("Linking template to recipe...")
    link_data = {
        "templateId": template_id,
        "templateName": "Test Unlink Template"
    }
    
    response = make_request("PUT", f"/sku-recipes/{recipe_id}", link_data)
    if "error" in response:
        logger.log_test_result("Template linking", False, f"Failed to link template: {response['error']}")
        return False
    
    # Step 4: Verify template is linked
    response = make_request("GET", f"/sku-recipes/{recipe_id}")
    if "error" in response:
        logger.log_test_result("Recipe template deletion", False, "Failed to verify template link")
        return False
    
    if response["data"].get("templateId") != template_id:
        logger.log_test_result("Template linking verification", False, "Template was not properly linked")
        return False
    
    logger.log("✅ Template successfully linked to recipe")
    
    # Step 5: Delete the template
    logger.log("Deleting template...")
    response = make_request("DELETE", f"/recipe-templates/{template_id}")
    if "error" in response:
        logger.log_test_result("Template deletion", False, f"Failed to delete template: {response['error']}")
        return False
    
    # Step 6: Verify recipe is unlinked
    logger.log("Verifying recipe is unlinked...")
    response = make_request("GET", f"/sku-recipes/{recipe_id}")
    if "error" in response:
        logger.log_test_result("Recipe template deletion", False, "Failed to verify recipe after template deletion")
        return False
    
    recipe_data = response["data"]
    
    if recipe_data.get("templateId") is not None:
        logger.log_test_result("Template unlinking verification", False, f"templateId should be null but is: {recipe_data.get('templateId')}")
        return False
    
    if recipe_data.get("templateName") is not None:
        logger.log_test_result("Template unlinking verification", False, f"templateName should be null but is: {recipe_data.get('templateName')}")
        return False
    
    logger.log_test_result("Recipe template deletion", True, "✅ Template deleted and recipe properly unlinked (templateId and templateName set to null)")
    logger.log("🎯 RECIPE TEMPLATE DELETION UNLINKS: TEST PASSED")
    return True

def test_finance_regression_check(logger: TestLogger):
    """Test 4: Finance Regression Check"""
    logger.log_test_start("FINANCE REGRESSION CHECK")
    
    # Test 4a: GET /api/bills — should work
    logger.log("Testing /api/bills endpoint...")
    response = make_request("GET", "/bills")
    
    if "error" in response:
        logger.log_test_result("Bills API", False, f"Bills endpoint failed: {response['error']}")
        return False
    
    bills = response["data"]
    if not isinstance(bills, list):
        logger.log_test_result("Bills API", False, f"Bills endpoint should return array, got: {type(bills)}")
        return False
    
    logger.log_test_result("Bills API", True, f"✅ Bills endpoint returned {len(bills)} bills")
    
    # Test 4b: GET /api/vendors — should work  
    logger.log("Testing /api/vendors endpoint...")
    response = make_request("GET", "/vendors")
    
    if "error" in response:
        logger.log_test_result("Vendors API", False, f"Vendors endpoint failed: {response['error']}")
        return False
    
    vendors = response["data"]
    if not isinstance(vendors, list):
        logger.log_test_result("Vendors API", False, f"Vendors endpoint should return array, got: {type(vendors)}")
        return False
    
    logger.log_test_result("Vendors API", True, f"✅ Vendors endpoint returned {len(vendors)} vendors")
    
    # Test 4c: GET /api/purchase-orders — should return 404 (removed)
    logger.log("Testing /api/purchase-orders endpoint (should be removed)...")
    response = make_request("GET", "/purchase-orders")
    
    if response.get("status") == 404:
        logger.log_test_result("Purchase Orders removed", True, "✅ Purchase Orders endpoint correctly returns 404")
    else:
        logger.log_test_result("Purchase Orders removed", False, f"Purchase Orders should return 404, got status: {response.get('status')}")
        return False
    
    # Test 4d: GET /api/finance/cash-flow — should NOT contain PO fields
    logger.log("Testing /api/finance/cash-flow endpoint...")
    response = make_request("GET", "/finance/cash-flow")
    
    if "error" in response:
        logger.log_test_result("Finance cash-flow API", False, f"Cash-flow endpoint failed: {response['error']}")
        return False
    
    cash_flow_data = response["data"]
    
    # Check for forbidden PO fields
    forbidden_fields = ["pendingPOAmount", "pendingPOCount", "totalPOs"]
    found_po_fields = []
    
    for field in forbidden_fields:
        if field in cash_flow_data:
            found_po_fields.append(field)
    
    if found_po_fields:
        logger.log_test_result("Finance cash-flow PO fields", False, f"Found forbidden PO fields: {found_po_fields}")
        return False
    else:
        logger.log_test_result("Finance cash-flow PO fields", True, "✅ No forbidden PO fields found in cash-flow response")
    
    logger.log("🎯 FINANCE REGRESSION CHECK: ALL TESTS PASSED")
    return True

def test_order_quantity_display_data(logger: TestLogger):
    """Test 5: Order quantity display data check"""
    logger.log_test_start("ORDER QUANTITY DISPLAY DATA CHECK")
    
    # GET /api/orders?page=1&limit=100 — check all orders have quantity field ≥ 1
    logger.log("Fetching orders to verify quantity field...")
    response = make_request("GET", "/orders", params={"page": 1, "limit": 100})
    
    if "error" in response:
        logger.log_test_result("Order quantity check", False, f"Failed to fetch orders: {response['error']}")
        return False
    
    orders = response["data"].get("orders", [])
    logger.log(f"Checking {len(orders)} orders for quantity field...")
    
    # Check quantity field
    invalid_quantity_orders = []
    
    for order in orders:
        quantity = order.get("quantity")
        if not isinstance(quantity, int) or quantity < 1:
            invalid_quantity_orders.append({
                "orderId": order.get("orderId", order.get("_id", "unknown")),
                "quantity": quantity
            })
    
    if invalid_quantity_orders:
        logger.log_test_result("Order quantity check", False, f"{len(invalid_quantity_orders)} orders have invalid quantity field (should be integer ≥ 1)")
        for order in invalid_quantity_orders[:5]:  # Show first 5 examples
            logger.log(f"   - Order {order['orderId']}: quantity = {order['quantity']}")
        return False
    else:
        logger.log_test_result("Order quantity check", True, f"✅ All {len(orders)} orders have valid quantity field (integer ≥ 1)")
    
    logger.log("🎯 ORDER QUANTITY DISPLAY DATA: CHECK PASSED")
    return True

def cleanup_test_data(logger: TestLogger):
    """Clean up any test data created during testing"""
    logger.log_test_start("CLEANUP TEST DATA")
    
    # Note: Most tests are read-only, but recipe template test creates data
    # The template deletion is part of the test itself, so minimal cleanup needed
    
    logger.log("✅ Test data cleanup completed (most tests were read-only)")

def main():
    """Main test execution function"""
    logger = TestLogger()
    
    print("🚀 BACKEND BUG FIXES BATCH TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print("Testing 5 bug fix scenarios:")
    print("1. Tip cleanup verification")
    print("2. Material Summary Fix (CRITICAL)")
    print("3. Recipe Template Deletion Unlinks Products") 
    print("4. Finance Regression Check")
    print("5. Order quantity display data check")
    print("=" * 60)
    
    # Track results
    test_results = {}
    
    try:
        # Execute all tests
        test_results["tip_cleanup"] = test_tip_cleanup_verification(logger)
        test_results["material_summary"] = test_material_summary_fix(logger)
        test_results["template_deletion"] = test_recipe_template_deletion_unlinks(logger)
        test_results["finance_regression"] = test_finance_regression_check(logger)
        test_results["order_quantity"] = test_order_quantity_display_data(logger)
        
        # Cleanup
        cleanup_test_data(logger)
        
        # Final summary
        print("\n" + "="*60)
        print("📊 FINAL TEST RESULTS")
        print("="*60)
        
        passed_tests = []
        failed_tests = []
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name.replace('_', ' ').title()}")
            
            if result:
                passed_tests.append(test_name)
            else:
                failed_tests.append(test_name)
        
        print(f"\nSUMMARY: {len(passed_tests)}/{len(test_results)} tests passed")
        
        if failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   - {test.replace('_', ' ').title()}")
            return 1
        else:
            print("\n🎉 ALL BUG FIX TESTS PASSED!")
            return 0
            
    except Exception as e:
        logger.log(f"Test execution failed: {str(e)}", "ERROR")
        print(f"\n💥 TESTING FAILED: {e}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)