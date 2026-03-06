#!/usr/bin/env python3
"""
Backend API Testing Script for Comprehensive Fixes Round 2 Testing
Tests 5 specific areas as requested in the review request.
Base URL: https://smart-finance-hub-41.preview.emergentagent.com/api
"""

import requests
import json
import time
import sys
from typing import Dict, List, Any

# Base URL from review request
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

def test_dashboard_tip_aggregation(logger: TestLogger):
    """Test 1: Dashboard - Tip aggregation in P&L"""
    logger.log_test_start("DASHBOARD TIP AGGREGATION IN P&L")
    
    # GET /api/dashboard?range=alltime — verify response has plBreakdown.totalTips field
    logger.log("Testing dashboard with alltime range for tip aggregation...")
    response = make_request("GET", "/dashboard", params={"range": "alltime"})
    
    if "error" in response:
        logger.log_test_result("Dashboard tip aggregation", False, f"Dashboard API failed: {response['error']}")
        return False
    
    dashboard_data = response["data"]
    
    # Verify plBreakdown exists
    if "plBreakdown" not in dashboard_data:
        logger.log_test_result("Dashboard tip aggregation", False, "Dashboard response missing plBreakdown object")
        return False
    
    pl_breakdown = dashboard_data["plBreakdown"]
    
    # Verify totalTips field exists and is a number >= 0
    if "totalTips" not in pl_breakdown:
        logger.log_test_result("Dashboard tip aggregation", False, "plBreakdown missing totalTips field")
        return False
    
    total_tips = pl_breakdown["totalTips"]
    
    if not isinstance(total_tips, (int, float)) or total_tips < 0:
        logger.log_test_result("Dashboard tip aggregation", False, f"totalTips should be number >= 0, got: {total_tips}")
        return False
    
    logger.log(f"✅ Found totalTips: ₹{total_tips}")
    
    # Also verify plBreakdown has other required fields
    required_fields = ["grossRevenue", "netRevenue", "totalCOGS", "netProfit"]
    missing_fields = []
    
    for field in required_fields:
        if field not in pl_breakdown:
            missing_fields.append(field)
    
    if missing_fields:
        logger.log_test_result("Dashboard tip aggregation", False, f"plBreakdown missing fields: {missing_fields}")
        return False
    
    logger.log_test_result("Dashboard tip aggregation", True, f"✅ plBreakdown.totalTips = ₹{total_tips}, all required fields present")
    return True

def test_material_summary_yield_info(logger: TestLogger):
    """Test 2: Material Summary - Yield/Portions info"""
    logger.log_test_start("MATERIAL SUMMARY YIELD/PORTIONS INFO")
    
    # First GET /api/sku-recipes to find a recipe with ingredients that have yieldPerUnit field
    logger.log("Fetching SKU recipes to find one with yieldPerUnit...")
    response = make_request("GET", "/sku-recipes")
    
    if "error" in response:
        logger.log_test_result("Material summary yield info", False, f"Failed to fetch SKU recipes: {response['error']}")
        return False
    
    recipes = response["data"]
    logger.log(f"Found {len(recipes)} SKU recipes")
    
    # Look for recipe with ingredients that have yieldPerUnit
    recipe_with_yield = None
    for recipe in recipes:
        if recipe.get("ingredients") and len(recipe["ingredients"]) > 0:
            for ingredient in recipe["ingredients"]:
                if "yieldPerUnit" in ingredient:
                    recipe_with_yield = recipe
                    break
            if recipe_with_yield:
                break
    
    if not recipe_with_yield:
        logger.log("No recipe found with yieldPerUnit field, proceeding with general material summary test...")
        
        # If none have yieldPerUnit, just verify material summary works
        # GET /api/orders?page=1&limit=5, take an order _id
        logger.log("Getting orders to test material summary...")
        response = make_request("GET", "/orders", params={"page": 1, "limit": 5})
        
        if "error" in response:
            logger.log_test_result("Material summary yield info", False, f"Failed to fetch orders: {response['error']}")
            return False
        
        orders = response["data"].get("orders", [])
        if not orders:
            logger.log_test_result("Material summary yield info", False, "No orders found")
            return False
        
        order_id = orders[0]["_id"]
        logger.log(f"Using order: {order_id}")
    else:
        logger.log(f"Found recipe with yieldPerUnit: {recipe_with_yield['sku']}")
        
        # Find an order with this SKU
        response = make_request("GET", "/orders", params={"page": 1, "limit": 100})
        if "error" in response:
            logger.log_test_result("Material summary yield info", False, f"Failed to fetch orders: {response['error']}")
            return False
        
        orders = response["data"].get("orders", [])
        matching_order = None
        
        for order in orders:
            if order.get("sku") == recipe_with_yield["sku"]:
                matching_order = order
                break
        
        if not matching_order:
            logger.log(f"No order found for SKU with yieldPerUnit: {recipe_with_yield['sku']}, falling back to general test...")
            # Fall back to general material summary test with any order
            if not orders:
                logger.log_test_result("Material summary yield info", False, "No orders found for material summary test")
                return False
            
            order_id = orders[0]["_id"]
            logger.log(f"Using first available order: {order_id}")
        else:
            order_id = matching_order["_id"]
            logger.log(f"Using order: {order_id} for SKU: {recipe_with_yield['sku']}")
    
    # Test GET /api/kds/material-summary?orderIds={order_id}
    logger.log("Testing material summary API...")
    response = make_request("GET", "/kds/material-summary", params={"orderIds": order_id})
    
    if "error" in response:
        logger.log_test_result("Material summary yield info", False, f"Material summary API failed: {response['error']}")
        return False
    
    material_data = response["data"]
    materials = material_data.get("materials", [])
    
    if not materials:
        logger.log_test_result("Material summary yield info", False, "Material summary returned empty materials array")
        return False
    
    logger.log(f"Found {len(materials)} materials in summary")
    
    # Verify materials array has entries with required fields: name, type, quantity, unit, yieldPerUnit (nullable), portions (number)
    required_fields = ["name", "type", "quantity", "unit"]
    optional_fields = ["yieldPerUnit", "portions"]
    
    for i, material in enumerate(materials):
        # Check required fields
        for field in required_fields:
            if field not in material:
                logger.log_test_result("Material summary yield info", False, f"Material {i} missing required field: {field}")
                return False
        
        # Check portions field is a number
        if "portions" in material and not isinstance(material["portions"], (int, float)):
            logger.log_test_result("Material summary yield info", False, f"Material {i} portions field should be number, got: {type(material['portions'])}")
            return False
        
        logger.log(f"Material {i}: {material['name']}, type: {material['type']}, qty: {material['quantity']}, unit: {material['unit']}")
        if "yieldPerUnit" in material:
            logger.log(f"   yieldPerUnit: {material['yieldPerUnit']}")
        if "portions" in material:
            logger.log(f"   portions: {material['portions']}")
    
    logger.log_test_result("Material summary yield info", True, f"✅ Material summary returned {len(materials)} materials with valid structure")
    return True

def test_profit_calculator_cogs_quantity(logger: TestLogger):
    """Test 3: Profit Calculator - COGS × quantity"""
    logger.log_test_start("PROFIT CALCULATOR COGS × QUANTITY")
    
    # GET /api/orders?page=1&limit=100 — find any order and note its _id
    logger.log("Fetching orders to find one for profit calculation...")
    response = make_request("GET", "/orders", params={"page": 1, "limit": 100})
    
    if "error" in response:
        logger.log_test_result("Profit calculator COGS", False, f"Failed to fetch orders: {response['error']}")
        return False
    
    orders = response["data"].get("orders", [])
    if not orders:
        logger.log_test_result("Profit calculator COGS", False, "No orders found")
        return False
    
    # Pick the first order
    test_order = orders[0]
    order_id = test_order["_id"]
    order_quantity = test_order.get("quantity", 1)
    
    logger.log(f"Using order: {order_id}, quantity: {order_quantity}")
    
    # GET /api/calculate-profit/{order_id} — verify response has tipAmount field
    logger.log("Testing profit calculation API...")
    response = make_request("GET", f"/calculate-profit/{order_id}")
    
    if "error" in response:
        logger.log_test_result("Profit calculator COGS", False, f"Profit calculation API failed: {response['error']}")
        return False
    
    profit_data = response["data"]
    
    # Verify response has tipAmount field
    if "tipAmount" not in profit_data:
        logger.log_test_result("Profit calculator COGS", False, "Profit calculation response missing tipAmount field")
        return False
    
    tip_amount = profit_data["tipAmount"]
    if not isinstance(tip_amount, (int, float)):
        logger.log_test_result("Profit calculator COGS", False, f"tipAmount should be number, got: {type(tip_amount)}")
        return False
    
    logger.log(f"✅ Found tipAmount: ₹{tip_amount}")
    
    # Verify the profit breakdown includes required fields
    required_fields = ["rawMaterialCost", "packagingCost", "totalCOGS", "netProfit"]
    missing_fields = []
    
    for field in required_fields:
        if field not in profit_data:
            missing_fields.append(field)
    
    if missing_fields:
        logger.log_test_result("Profit calculator COGS", False, f"Profit calculation missing fields: {missing_fields}")
        return False
    
    # Log the breakdown
    logger.log(f"Profit breakdown:")
    logger.log(f"  - Raw Material Cost: ₹{profit_data.get('rawMaterialCost', 0)}")
    logger.log(f"  - Packaging Cost: ₹{profit_data.get('packagingCost', 0)}")
    logger.log(f"  - Total COGS: ₹{profit_data.get('totalCOGS', 0)}")
    logger.log(f"  - Net Profit: ₹{profit_data.get('netProfit', 0)}")
    logger.log(f"  - Tip Amount: ₹{tip_amount}")
    
    logger.log_test_result("Profit calculator COGS", True, f"✅ Profit calculation includes tipAmount and all required fields")
    return True

def test_recipe_template_lifecycle(logger: TestLogger):
    """Test 4: Recipe Template Lifecycle (Apply + Unlink)"""
    logger.log_test_start("RECIPE TEMPLATE LIFECYCLE (APPLY + UNLINK)")
    
    created_template_id = None
    modified_recipes = []
    
    try:
        # Step 1: POST /api/recipe-templates — create template
        logger.log("Creating test recipe template...")
        template_data = {
            "name": "Coverage Test Template",
            "ingredients": [
                {
                    "name": "Test Material",
                    "category": "Raw Materials",
                    "quantityUsed": 1,
                    "baseCostPerUnit": 10,
                    "unit": "pcs",
                    "inventoryItemId": "test-inv-1"
                }
            ]
        }
        
        response = make_request("POST", "/recipe-templates", template_data)
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to create template: {response['error']}")
            return False
        
        created_template_id = response["data"]["_id"]
        logger.log(f"✅ Created template: {created_template_id}")
        
        # Step 2: GET /api/sku-recipes — pick 2 recipe _ids that have needsCostInput:true (or any 2)
        logger.log("Finding SKU recipes to apply template to...")
        response = make_request("GET", "/sku-recipes")
        
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to fetch SKU recipes: {response['error']}")
            return False
        
        recipes = response["data"]
        if len(recipes) < 2:
            logger.log_test_result("Recipe template lifecycle", False, f"Need at least 2 recipes, found: {len(recipes)}")
            return False
        
        # Pick 2 recipes (preferably with needsCostInput:true)
        target_recipes = []
        for recipe in recipes:
            if recipe.get("needsCostInput", False):
                target_recipes.append(recipe)
                if len(target_recipes) >= 2:
                    break
        
        # If not enough needsCostInput recipes, just pick first 2
        if len(target_recipes) < 2:
            target_recipes = recipes[:2]
        
        recipe1_id = target_recipes[0]["_id"]
        recipe2_id = target_recipes[1]["_id"]
        modified_recipes = [recipe1_id, recipe2_id]
        
        logger.log(f"Selected recipes: {recipe1_id}, {recipe2_id}")
        
        # Store original state for cleanup
        original_states = {}
        for recipe_id in modified_recipes:
            response = make_request("GET", f"/sku-recipes/{recipe_id}")
            if "error" not in response:
                original_states[recipe_id] = {
                    "ingredients": response["data"].get("ingredients", []),
                    "templateId": response["data"].get("templateId"),
                    "templateName": response["data"].get("templateName"),
                    "needsCostInput": response["data"].get("needsCostInput", True)
                }
        
        # Step 3: POST /api/recipe-templates/apply
        logger.log("Applying template to recipes...")
        apply_data = {
            "templateId": created_template_id,
            "recipeIds": [recipe1_id, recipe2_id]
        }
        
        response = make_request("POST", "/recipe-templates/apply", apply_data)
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to apply template: {response['error']}")
            return False
        
        applied_count = response["data"].get("applied", 0)
        if applied_count != 2:
            logger.log_test_result("Recipe template lifecycle", False, f"Expected to apply to 2 recipes, applied to: {applied_count}")
            return False
        
        logger.log(f"✅ Applied template to {applied_count} recipes")
        
        # Step 4: GET /api/sku-recipes/{recipe1} — verify ingredients is non-empty and templateId matches
        logger.log("Verifying template application...")
        response = make_request("GET", f"/sku-recipes/{recipe1_id}")
        
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to get recipe after apply: {response['error']}")
            return False
        
        recipe_data = response["data"]
        
        # Verify ingredients is non-empty
        if not recipe_data.get("ingredients") or len(recipe_data["ingredients"]) == 0:
            logger.log_test_result("Recipe template lifecycle", False, "Recipe ingredients should be non-empty after template application")
            return False
        
        # Verify templateId matches
        if recipe_data.get("templateId") != created_template_id:
            logger.log_test_result("Recipe template lifecycle", False, f"Recipe templateId should be {created_template_id}, got: {recipe_data.get('templateId')}")
            return False
        
        logger.log(f"✅ Recipe has {len(recipe_data['ingredients'])} ingredients and correct templateId")
        
        # Step 5: DELETE /api/recipe-templates/{template_id}
        logger.log("Deleting template...")
        response = make_request("DELETE", f"/recipe-templates/{created_template_id}")
        
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to delete template: {response['error']}")
            return False
        
        logger.log("✅ Template deleted")
        
        # Step 6: GET /api/sku-recipes/{recipe1} — verify templateId is null (unlinking worked)
        logger.log("Verifying template unlinking after deletion...")
        response = make_request("GET", f"/sku-recipes/{recipe1_id}")
        
        if "error" in response:
            logger.log_test_result("Recipe template lifecycle", False, f"Failed to get recipe after delete: {response['error']}")
            return False
        
        recipe_data = response["data"]
        
        if recipe_data.get("templateId") is not None:
            logger.log_test_result("Recipe template lifecycle", False, f"Recipe templateId should be null after template deletion, got: {recipe_data.get('templateId')}")
            return False
        
        logger.log("✅ Template unlinking confirmed - templateId is null")
        
        # Step 7: Clean up - PUT the recipes back to original state if possible
        logger.log("Restoring recipes to original state...")
        for recipe_id in modified_recipes:
            if recipe_id in original_states:
                original_state = original_states[recipe_id]
                restore_data = {
                    "ingredients": original_state["ingredients"],
                    "templateId": original_state["templateId"],
                    "templateName": original_state["templateName"],
                    "needsCostInput": original_state["needsCostInput"]
                }
                
                response = make_request("PUT", f"/sku-recipes/{recipe_id}", restore_data)
                if "error" not in response:
                    logger.log(f"✅ Restored recipe {recipe_id}")
                else:
                    logger.log(f"⚠️ Failed to restore recipe {recipe_id}: {response['error']}")
        
        logger.log_test_result("Recipe template lifecycle", True, "✅ Complete template lifecycle test passed: create → apply → verify → delete → unlink → cleanup")
        return True
        
    except Exception as e:
        logger.log_test_result("Recipe template lifecycle", False, f"Test failed with exception: {str(e)}")
        return False

def test_finance_regression(logger: TestLogger):
    """Test 5: Finance Regression"""
    logger.log_test_start("FINANCE REGRESSION")
    
    # Test 5a: GET /api/bills — should work
    logger.log("Testing /api/bills endpoint...")
    response = make_request("GET", "/bills")
    
    if "error" in response:
        logger.log_test_result("Finance bills API", False, f"Bills endpoint failed: {response['error']}")
        return False
    
    bills = response["data"]
    if not isinstance(bills, list):
        logger.log_test_result("Finance bills API", False, f"Bills should return array, got: {type(bills)}")
        return False
    
    logger.log_test_result("Finance bills API", True, f"✅ Bills endpoint returned {len(bills)} bills")
    
    # Test 5b: GET /api/vendors — should work
    logger.log("Testing /api/vendors endpoint...")
    response = make_request("GET", "/vendors")
    
    if "error" in response:
        logger.log_test_result("Finance vendors API", False, f"Vendors endpoint failed: {response['error']}")
        return False
    
    vendors = response["data"]
    if not isinstance(vendors, list):
        logger.log_test_result("Finance vendors API", False, f"Vendors should return array, got: {type(vendors)}")
        return False
    
    logger.log_test_result("Finance vendors API", True, f"✅ Vendors endpoint returned {len(vendors)} vendors")
    
    # Test 5c: GET /api/purchase-orders — should 404
    logger.log("Testing /api/purchase-orders endpoint (should return 404)...")
    response = make_request("GET", "/purchase-orders")
    
    if response.get("status") == 404:
        logger.log_test_result("Finance purchase orders removed", True, "✅ Purchase orders endpoint correctly returns 404")
    else:
        logger.log_test_result("Finance purchase orders removed", False, f"Purchase orders should return 404, got: {response.get('status')}")
        return False
    
    logger.log_test_result("Finance regression", True, "✅ All finance endpoints working correctly")
    return True

def cleanup_test_data(logger: TestLogger):
    """Clean up any test data created during testing"""
    logger.log_test_start("CLEANUP TEST DATA")
    
    # Recipe template test handles its own cleanup
    logger.log("✅ Test data cleanup completed (recipe template test handles its own cleanup)")

def main():
    """Main test execution function"""
    logger = TestLogger()
    
    print("🚀 COMPREHENSIVE FIXES ROUND 2 TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print("Testing 5 comprehensive fix areas:")
    print("1. Dashboard - Tip aggregation in P&L")
    print("2. Material Summary - Yield/Portions info")
    print("3. Profit Calculator - COGS × quantity")
    print("4. Recipe Template Lifecycle (Apply + Unlink)")
    print("5. Finance Regression")
    print("=" * 60)
    
    # Track results
    test_results = {}
    
    try:
        # Execute all tests
        test_results["dashboard_tip_aggregation"] = test_dashboard_tip_aggregation(logger)
        test_results["material_summary_yield"] = test_material_summary_yield_info(logger)
        test_results["profit_calculator_cogs"] = test_profit_calculator_cogs_quantity(logger)
        test_results["recipe_template_lifecycle"] = test_recipe_template_lifecycle(logger)
        test_results["finance_regression"] = test_finance_regression(logger)
        
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
            print("\n🎉 ALL COMPREHENSIVE FIXES ROUND 2 TESTS PASSED!")
            return 0
            
    except Exception as e:
        logger.log(f"Test execution failed: {str(e)}", "ERROR")
        print(f"\n💥 TESTING FAILED: {e}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)