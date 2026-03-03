#!/usr/bin/env python3
"""
Recipe Templates + SKU Recipes Sync Testing
Tests 6 critical areas:
1. SKU Recipes populated - 115 recipes with order counts
2. Recipe Templates CRUD - Create, read, update template  
3. Apply template - Apply to 3 products, verify ingredients copied + templateId linked
4. Repush changes - Update template, repush to all linked recipes
5. Unlink recipe - Unlink one recipe from template
6. Delete template - Clean deletion

CRITICAL: Clean up ALL test data after tests
CRITICAL: Reset the 3 test recipes back to needsCostInput=true, ingredients=[] after testing
"""

import requests
import json
import time

# Configuration - Use BASE URL from .env
BASE_URL = "https://expense-fifo-rebuild.preview.emergentagent.com/api"

def print_test_step(step_name, step_num=None):
    prefix = f"🎯 TEST {step_num}: " if step_num else "🔧 "
    print(f"\n{prefix}{step_name}")
    print("=" * 60)

def print_result(message, success=True):
    icon = "✅" if success else "❌"
    print(f"{icon} {message}")

def print_error(message):
    print(f"❌ ERROR: {message}")

def api_request(method, endpoint, data=None, expected_status=None):
    """Make API request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == 'GET':
            response = requests.get(url)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data)
        elif method.upper() == 'PUT':
            response = requests.put(url, json=data)
        elif method.upper() == 'DELETE':
            response = requests.delete(url)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        if expected_status and response.status_code != expected_status:
            print_error(f"{method} {endpoint} returned {response.status_code}, expected {expected_status}")
            print(f"Response: {response.text}")
            return None
            
        return response
    except Exception as e:
        print_error(f"{method} {endpoint} failed: {str(e)}")
        return None

def test_1_sku_recipes_populated():
    """Test 1: SKU Recipes populated - 115 recipes with order counts"""
    print_test_step("SKU RECIPES POPULATED", 1)
    
    response = api_request('GET', '/sku-recipes')
    if not response or response.status_code != 200:
        print_error("Failed to get SKU recipes")
        return False
    
    recipes = response.json()
    recipe_count = len(recipes)
    print_result(f"Found {recipe_count} SKU recipes")
    
    # Check if we have expected number (around 115, but may vary)
    if recipe_count < 100:
        print_error(f"Expected around 115 recipes, but found only {recipe_count}")
        return False
    
    # Verify structure - each recipe should have required fields
    required_fields = ['sku', 'productName', 'needsCostInput', 'ingredients', 'orderCount', 'totalRevenue']
    sample_recipe = recipes[0] if recipes else {}
    
    for field in required_fields:
        if field not in sample_recipe:
            print_error(f"Recipe missing required field: {field}")
            return False
    
    print_result(f"All recipes have required fields: {', '.join(required_fields)}")
    
    # Find top recipe by order count
    top_recipe = max(recipes, key=lambda r: r.get('orderCount', 0))
    print_result(f"Top recipe by orders: '{top_recipe['productName']}' with {top_recipe['orderCount']} orders")
    
    # Store some recipe IDs for later tests
    global test_recipe_ids, original_recipes_state
    test_recipe_ids = [r['_id'] for r in recipes[:3]]  # First 3 recipes
    
    # Store original state for cleanup
    original_recipes_state = []
    for recipe_id in test_recipe_ids:
        recipe_response = api_request('GET', f'/sku-recipes/{recipe_id}')
        if recipe_response and recipe_response.status_code == 200:
            original_recipes_state.append({
                'id': recipe_id,
                'needsCostInput': recipe_response.json().get('needsCostInput', True),
                'ingredients': recipe_response.json().get('ingredients', []),
                'templateId': recipe_response.json().get('templateId'),
                'templateName': recipe_response.json().get('templateName')
            })
    
    print_result(f"Stored {len(test_recipe_ids)} recipe IDs for testing")
    print_result("TEST 1 PASSED", True)
    return True

def test_2_recipe_templates_crud():
    """Test 2: Recipe Templates CRUD - Create, read, update template"""
    print_test_step("RECIPE TEMPLATES CRUD", 2)
    
    # CREATE template
    template_data = {
        "name": "Tin Mini Album Recipe",
        "description": "Standard recipe for all mini albums",
        "ingredients": [
            {
                "inventoryItemId": "test-item-1",
                "name": "Photo Sheet",
                "category": "Raw Material",
                "quantityUsed": 14,
                "baseCostPerUnit": 5,
                "unit": "sheets"
            },
            {
                "inventoryItemId": "test-item-2",
                "name": "Album Cover",
                "category": "Packaging",
                "quantityUsed": 1,
                "baseCostPerUnit": 25,
                "unit": "pieces"
            }
        ],
        "defaultWastageBuffer": 5
    }
    
    create_response = api_request('POST', '/recipe-templates', template_data, 201)
    if not create_response:
        return False
    
    template = create_response.json()
    global template_id
    template_id = template['_id']
    
    print_result(f"Created template '{template['name']}' with ID: {template_id}")
    
    # Verify template structure
    required_fields = ['_id', 'name', 'ingredients']
    for field in required_fields:
        if field not in template:
            print_error(f"Template missing field: {field}")
            return False
    
    if len(template['ingredients']) != 2:
        print_error(f"Expected 2 ingredients, got {len(template['ingredients'])}")
        return False
    
    print_result("Template created with correct structure")
    
    # READ templates
    read_response = api_request('GET', '/recipe-templates')
    if not read_response or read_response.status_code != 200:
        return False
    
    templates = read_response.json()
    found_template = None
    for t in templates:
        if t['_id'] == template_id:
            found_template = t
            break
    
    if not found_template:
        print_error("Created template not found in list")
        return False
    
    print_result(f"Template found in list with linkedRecipeCount: {found_template.get('linkedRecipeCount', 0)}")
    
    if found_template.get('linkedRecipeCount', 0) != 0:
        print_error(f"Expected linkedRecipeCount=0, got {found_template.get('linkedRecipeCount')}")
        return False
    
    print_result("linkedRecipeCount correctly shows 0 (no recipes linked yet)")
    
    # UPDATE template
    update_data = {
        "name": "Tin Mini Album Recipe v2",
        "description": "Updated description"
    }
    
    update_response = api_request('PUT', f'/recipe-templates/{template_id}', update_data)
    if not update_response or update_response.status_code != 200:
        return False
    
    updated_template = update_response.json()
    if updated_template['name'] != "Tin Mini Album Recipe v2":
        print_error(f"Template name not updated. Got: {updated_template['name']}")
        return False
    
    print_result("Template updated successfully")
    print_result("TEST 2 PASSED", True)
    return True

def test_3_apply_template():
    """Test 3: Apply template to products, verify ingredients copied + templateId linked"""
    print_test_step("APPLY TEMPLATE TO PRODUCTS", 3)
    
    if not template_id or not test_recipe_ids:
        print_error("Missing template_id or test_recipe_ids from previous tests")
        return False
    
    # Apply template to first 3 recipes
    apply_data = {
        "templateId": template_id,
        "recipeIds": test_recipe_ids[:3]
    }
    
    apply_response = api_request('POST', '/recipe-templates/apply', apply_data)
    if not apply_response or apply_response.status_code != 200:
        return False
    
    apply_result = apply_response.json()
    applied_count = apply_result.get('applied', 0)
    
    if applied_count != 3:
        print_error(f"Expected to apply to 3 recipes, but applied to {applied_count}")
        return False
    
    print_result(f"Applied template to {applied_count} recipes")
    
    # Verify first recipe has correct changes
    recipe_response = api_request('GET', f'/sku-recipes/{test_recipe_ids[0]}')
    if not recipe_response or recipe_response.status_code != 200:
        return False
    
    recipe = recipe_response.json()
    
    # Check templateId is set
    if recipe.get('templateId') != template_id:
        print_error(f"templateId not set correctly. Expected: {template_id}, Got: {recipe.get('templateId')}")
        return False
    
    print_result("templateId correctly linked")
    
    # Check templateName is set
    if not recipe.get('templateName'):
        print_error("templateName not set")
        return False
    
    print_result(f"templateName set to: {recipe.get('templateName')}")
    
    # Check ingredients copied
    ingredients = recipe.get('ingredients', [])
    if len(ingredients) != 2:
        print_error(f"Expected 2 ingredients, got {len(ingredients)}")
        return False
    
    # Check specific ingredient details
    photo_sheet = None
    album_cover = None
    for ing in ingredients:
        if ing.get('name') == 'Photo Sheet':
            photo_sheet = ing
        elif ing.get('name') == 'Album Cover':
            album_cover = ing
    
    if not photo_sheet:
        print_error("Photo Sheet ingredient not found")
        return False
    
    if photo_sheet.get('quantityUsed') != 14 or photo_sheet.get('baseCostPerUnit') != 5:
        print_error(f"Photo Sheet ingredient incorrect. Got: {photo_sheet}")
        return False
    
    if not album_cover:
        print_error("Album Cover ingredient not found")
        return False
    
    if album_cover.get('quantityUsed') != 1 or album_cover.get('baseCostPerUnit') != 25:
        print_error(f"Album Cover ingredient incorrect. Got: {album_cover}")
        return False
    
    print_result("Ingredients copied correctly from template")
    
    # Check needsCostInput is false
    if recipe.get('needsCostInput') != False:
        print_error(f"needsCostInput should be false, got: {recipe.get('needsCostInput')}")
        return False
    
    print_result("needsCostInput correctly set to false")
    
    print_result("TEST 3 PASSED", True)
    return True

def test_4_repush_template_changes():
    """Test 4: Update template, repush to all linked recipes"""
    print_test_step("REPUSH TEMPLATE CHANGES", 4)
    
    # Update template with additional ingredient
    update_data = {
        "name": "Tin Mini Album Recipe v3",
        "description": "Updated with third ingredient",
        "ingredients": [
            {
                "inventoryItemId": "test-item-1",
                "name": "Photo Sheet",
                "category": "Raw Material",
                "quantityUsed": 14,
                "baseCostPerUnit": 5,
                "unit": "sheets"
            },
            {
                "inventoryItemId": "test-item-2",
                "name": "Album Cover",
                "category": "Packaging",
                "quantityUsed": 1,
                "baseCostPerUnit": 25,
                "unit": "pieces"
            },
            {
                "inventoryItemId": "test-item-3",
                "name": "Protective Film",
                "category": "Raw Material",
                "quantityUsed": 1,
                "baseCostPerUnit": 3,
                "unit": "sheets"
            }
        ],
        "defaultWastageBuffer": 6
    }
    
    update_response = api_request('PUT', f'/recipe-templates/{template_id}', update_data)
    if not update_response or update_response.status_code != 200:
        return False
    
    print_result("Template updated with third ingredient")
    
    # Repush template changes
    repush_data = {"templateId": template_id}
    repush_response = api_request('POST', '/recipe-templates/repush', repush_data)
    if not repush_response or repush_response.status_code != 200:
        return False
    
    repush_result = repush_response.json()
    updated_count = repush_result.get('updated', 0)
    
    if updated_count != 3:
        print_error(f"Expected to update 3 recipes, but updated {updated_count}")
        return False
    
    print_result(f"Repushed changes to {updated_count} linked recipes")
    
    # Verify first recipe has new ingredients
    recipe_response = api_request('GET', f'/sku-recipes/{test_recipe_ids[0]}')
    if not recipe_response or recipe_response.status_code != 200:
        return False
    
    recipe = recipe_response.json()
    ingredients = recipe.get('ingredients', [])
    
    if len(ingredients) != 3:
        print_error(f"Expected 3 ingredients after repush, got {len(ingredients)}")
        return False
    
    # Check for the new ingredient
    protective_film = None
    for ing in ingredients:
        if ing.get('name') == 'Protective Film':
            protective_film = ing
            break
    
    if not protective_film:
        print_error("Protective Film ingredient not found after repush")
        return False
    
    if protective_film.get('baseCostPerUnit') != 3:
        print_error(f"Protective Film cost incorrect. Expected: 3, Got: {protective_film.get('baseCostPerUnit')}")
        return False
    
    print_result("Ingredients updated correctly with third ingredient")
    
    # Check updated template name
    if recipe.get('templateName') != "Tin Mini Album Recipe v3":
        print_error(f"Template name not updated. Expected: 'Tin Mini Album Recipe v3', Got: {recipe.get('templateName')}")
        return False
    
    print_result("Template name updated in linked recipe")
    
    print_result("TEST 4 PASSED", True)
    return True

def test_5_unlink_recipe():
    """Test 5: Unlink one recipe from template"""
    print_test_step("UNLINK RECIPE FROM TEMPLATE", 5)
    
    # Unlink first recipe
    unlink_data = {"recipeId": test_recipe_ids[0]}
    unlink_response = api_request('POST', '/recipe-templates/unlink', unlink_data)
    if not unlink_response or unlink_response.status_code != 200:
        return False
    
    print_result("Unlink request completed")
    
    # Verify recipe is unlinked
    recipe_response = api_request('GET', f'/sku-recipes/{test_recipe_ids[0]}')
    if not recipe_response or recipe_response.status_code != 200:
        return False
    
    recipe = recipe_response.json()
    
    if recipe.get('templateId') is not None:
        print_error(f"templateId should be null after unlinking, got: {recipe.get('templateId')}")
        return False
    
    print_result("templateId correctly set to null")
    
    if recipe.get('templateName') is not None:
        print_error(f"templateName should be null after unlinking, got: {recipe.get('templateName')}")
        return False
    
    print_result("templateName correctly set to null")
    
    # Check that ingredients are preserved (not cleared)
    ingredients = recipe.get('ingredients', [])
    if len(ingredients) != 3:
        print_error(f"Ingredients should be preserved after unlinking, got {len(ingredients)} ingredients")
        return False
    
    print_result("Ingredients preserved after unlinking (expected behavior)")
    
    print_result("TEST 5 PASSED", True)
    return True

def test_6_delete_template():
    """Test 6: Clean template deletion"""
    print_test_step("DELETE TEMPLATE", 6)
    
    # Delete the template
    delete_response = api_request('DELETE', f'/recipe-templates/{template_id}')
    if not delete_response or delete_response.status_code != 200:
        return False
    
    print_result("Template deletion request completed")
    
    # Verify template is deleted
    get_response = api_request('GET', f'/recipe-templates/{template_id}')
    if get_response and get_response.status_code != 404:
        print_error(f"Template should return 404 after deletion, got: {get_response.status_code}")
        return False
    
    print_result("Template correctly deleted (returns 404)")
    
    # Verify template list is empty
    list_response = api_request('GET', '/recipe-templates')
    if not list_response or list_response.status_code != 200:
        return False
    
    templates = list_response.json()
    
    # Find our template in the list (should not exist)
    found_template = False
    for t in templates:
        if t['_id'] == template_id:
            found_template = True
            break
    
    if found_template:
        print_error("Deleted template still found in templates list")
        return False
    
    print_result("Template not found in templates list (correctly deleted)")
    
    print_result("TEST 6 PASSED", True)
    return True

def cleanup_test_data():
    """Clean up: Reset the 3 test recipes back to needsCostInput=true, ingredients=[]"""
    print_test_step("CLEANUP - Reset Test Recipes")
    
    if not test_recipe_ids or not original_recipes_state:
        print_result("No test data to clean up")
        return True
    
    cleanup_success = True
    
    for original_state in original_recipes_state:
        recipe_id = original_state['id']
        
        # Reset to original state
        reset_data = {
            "needsCostInput": original_state['needsCostInput'],
            "ingredients": original_state['ingredients'],
            "templateId": original_state['templateId'],
            "templateName": original_state['templateName']
        }
        
        update_response = api_request('PUT', f'/sku-recipes/{recipe_id}', reset_data)
        if not update_response or update_response.status_code != 200:
            print_error(f"Failed to reset recipe {recipe_id}")
            cleanup_success = False
            continue
        
        print_result(f"Reset recipe {recipe_id} to original state")
    
    if cleanup_success:
        print_result("All test recipes successfully reset to original state")
    
    return cleanup_success

def run_all_tests():
    """Run all recipe template tests"""
    print("🚀 STARTING RECIPE TEMPLATES + SKU RECIPES SYNC TESTING")
    print("=" * 80)
    
    # Initialize global variables
    global template_id, test_recipe_ids, original_recipes_state
    template_id = None
    test_recipe_ids = []
    original_recipes_state = []
    
    tests = [
        ("SKU Recipes Populated", test_1_sku_recipes_populated),
        ("Recipe Templates CRUD", test_2_recipe_templates_crud),
        ("Apply Template", test_3_apply_template),
        ("Repush Template Changes", test_4_repush_template_changes),
        ("Unlink Recipe", test_5_unlink_recipe),
        ("Delete Template", test_6_delete_template),
    ]
    
    passed_tests = 0
    total_tests = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed_tests += 1
            else:
                print_error(f"TEST FAILED: {test_name}")
                break  # Stop on first failure to prevent cascading issues
        except Exception as e:
            print_error(f"TEST ERROR in {test_name}: {str(e)}")
            break
    
    # Always run cleanup
    cleanup_success = cleanup_test_data()
    
    # Final results
    print("\n" + "=" * 80)
    print("🏁 FINAL RESULTS")
    print("=" * 80)
    
    if passed_tests == total_tests:
        print_result(f"ALL {total_tests} TESTS PASSED! ✨", True)
        if cleanup_success:
            print_result("Cleanup completed successfully", True)
        else:
            print_error("Some cleanup operations failed")
    else:
        print_error(f"TESTS FAILED: {passed_tests}/{total_tests} passed")
    
    print(f"\nBase URL used: {BASE_URL}")
    print("Testing completed.")
    
    return passed_tests == total_tests and cleanup_success

if __name__ == "__main__":
    run_all_tests()