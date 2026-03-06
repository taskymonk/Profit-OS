#!/usr/bin/env python3
"""
Test Recipe Unlink functionality separately
"""
import requests
import json
from datetime import datetime

BASE_URL = "https://erp-ocr-fix-1.preview.emergentagent.com/api"

def log(message):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def test_recipe_unlink():
    """Test Recipe Unlink with complete flow"""
    log("🎯 Testing Recipe Unlink with Template Creation...")
    
    try:
        # Step 1: Get available recipes
        response = requests.get(f"{BASE_URL}/sku-recipes")
        recipes = response.json()
        log(f"Found {len(recipes)} existing recipes")
        
        if len(recipes) == 0:
            log("❌ No recipes found to test unlink")
            return False
            
        # Step 2: Create a recipe template
        template_data = {
            "name": "Test Template for Unlink",
            "description": "Template for testing unlink functionality",
            "ingredients": [
                {
                    "inventoryItemId": "test-item-1",
                    "name": "Test Ingredient",
                    "category": "Raw Material",
                    "quantityUsed": 1,
                    "baseCostPerUnit": 10,
                    "unit": "pieces"
                }
            ],
            "defaultWastageBuffer": 5
        }
        
        response = requests.post(f"{BASE_URL}/recipe-templates", json=template_data)
        if response.status_code != 201:
            log(f"❌ Failed to create template: {response.status_code}")
            return False
            
        template = response.json()
        template_id = template['_id']
        log(f"✅ Created template: {template['name']}")
        
        # Step 3: Apply template to first recipe
        recipe_id = recipes[0]['_id']
        apply_data = {
            "templateId": template_id,
            "recipeIds": [recipe_id]
        }
        
        response = requests.post(f"{BASE_URL}/recipe-templates/apply", json=apply_data)
        if response.status_code != 200:
            log(f"❌ Failed to apply template: {response.status_code}")
            return False
            
        apply_result = response.json()
        log(f"✅ Applied template to {apply_result.get('applied', 0)} recipes")
        
        # Step 4: Verify template was applied
        response = requests.get(f"{BASE_URL}/sku-recipes/{recipe_id}")
        recipe_with_template = response.json()
        
        if recipe_with_template.get('templateId') != template_id:
            log(f"❌ Template not applied correctly")
            return False
            
        log(f"✅ Recipe now has templateId: {recipe_with_template['templateId']}")
        log(f"✅ Recipe has {len(recipe_with_template.get('ingredients', []))} ingredients")
        
        # Step 5: Test unlink functionality
        response = requests.put(f"{BASE_URL}/sku-recipes/{recipe_id}/unlink", json={})
        if response.status_code != 200:
            log(f"❌ Unlink failed: {response.status_code}")
            return False
            
        unlink_result = response.json()
        log(f"✅ Unlink completed")
        
        # Step 6: Verify unlink worked
        response = requests.get(f"{BASE_URL}/sku-recipes/{recipe_id}")
        unlinked_recipe = response.json()
        
        if unlinked_recipe.get('templateId') is not None:
            log(f"❌ templateId not cleared: {unlinked_recipe.get('templateId')}")
            return False
            
        if len(unlinked_recipe.get('ingredients', [])) > 0:
            log(f"❌ Ingredients not cleared: {len(unlinked_recipe.get('ingredients', []))}")
            return False
            
        log("✅ Recipe successfully unlinked:")
        log(f"  - templateId cleared: {template_id} → None")
        log(f"  - Ingredients cleared: 1 → 0")
        
        # Step 7: Cleanup - delete the template
        response = requests.delete(f"{BASE_URL}/recipe-templates/{template_id}")
        log(f"✅ Template cleanup completed")
        
        return True
        
    except Exception as e:
        log(f"❌ Recipe unlink test failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_recipe_unlink()
    if success:
        log("🎉 Recipe Unlink test PASSED!")
    else:
        log("❌ Recipe Unlink test FAILED!")