#!/usr/bin/env python3

import requests
import json
import sys
from typing import Dict, List, Any, Optional

class BackendTester:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.test_data_ids = []
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    def log(self, message: str, level: str = "INFO"):
        """Structured logging for test results"""
        print(f"[{level}] {message}")

    def api_call(self, method: str, endpoint: str, data: dict = None, params: dict = None) -> tuple:
        """Make API call and return (response, success)"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, params=params)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, params=params)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data, params=params)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response, True
        except Exception as e:
            self.log(f"API call failed: {method} {endpoint} - {str(e)}", "ERROR")
            return None, False

    def test_recipe_template_full_lifecycle(self):
        """Test the complete Recipe Template lifecycle: Create → Apply → Delete → Verify Reset"""
        self.log("🎯 Starting Recipe Template FULL Lifecycle Test...")
        
        try:
            # Step 1: Create recipe template
            template_data = {
                "name": "Lifecycle Test Template",
                "ingredients": [{
                    "name": "Test Paper",
                    "category": "Raw Materials",
                    "quantityUsed": 0.5,
                    "baseCostPerUnit": 20,
                    "unit": "sheets",
                    "inventoryItemId": "test-inv-1"
                }]
            }
            
            response, success = self.api_call('POST', '/recipe-templates', template_data)
            if not success or response.status_code != 201:
                self.log(f"❌ Failed to create template: {response.status_code if response else 'No response'}", "ERROR")
                return False
                
            template_id = response.json().get('_id')
            self.log(f"✅ Created template with ID: {template_id}")
            
            # Step 2: Get recipes with needsCostInput = true
            response, success = self.api_call('GET', '/sku-recipes')
            if not success:
                self.log("❌ Failed to get SKU recipes", "ERROR")
                return False
                
            recipes = response.json()
            eligible_recipes = [r for r in recipes if r.get('needsCostInput') == True]
            
            if len(eligible_recipes) < 3:
                self.log(f"❌ Need at least 3 recipes with needsCostInput=true, found {len(eligible_recipes)}", "ERROR")
                return False
                
            recipe_ids = [r['_id'] for r in eligible_recipes[:3]]
            self.log(f"✅ Found {len(eligible_recipes)} eligible recipes, using: {recipe_ids}")
            
            # Step 3: Apply template to recipes
            apply_data = {
                "templateId": template_id,
                "recipeIds": recipe_ids
            }
            
            response, success = self.api_call('POST', '/recipe-templates/apply', apply_data)
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to apply template: {response.status_code if response else 'No response'}", "ERROR")
                return False
                
            apply_result = response.json()
            self.log(f"✅ Applied template to {apply_result.get('applied', 0)} recipes")
            
            # Step 4: Verify application worked
            response, success = self.api_call('GET', f'/sku-recipes/{recipe_ids[0]}')
            if not success:
                self.log("❌ Failed to verify recipe after application", "ERROR")
                return False
                
            recipe = response.json()
            if not recipe.get('ingredients') or recipe.get('needsCostInput') != False or recipe.get('templateId') != template_id:
                self.log("❌ Recipe not properly updated after template application", "ERROR")
                return False
                
            self.log("✅ Recipe properly updated with template data")
            
            # Step 5: DELETE template (CRITICAL TEST)
            response, success = self.api_call('DELETE', f'/recipe-templates/{template_id}')
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to delete template: {response.status_code if response else 'No response'}", "ERROR")
                return False
                
            self.log("✅ Template deleted successfully")
            
            # Step 6: VERIFY RESET - Check that recipes are fully reset
            response, success = self.api_call('GET', f'/sku-recipes/{recipe_ids[0]}')
            if not success:
                self.log("❌ Failed to verify recipe after template deletion", "ERROR")
                return False
                
            reset_recipe = response.json()
            
            # CRITICAL CHECKS: Template deletion must FULLY RESET linked recipes
            checks_passed = 0
            total_checks = 4
            
            if reset_recipe.get('templateId') is None:
                self.log("✅ templateId correctly set to null")
                checks_passed += 1
            else:
                self.log(f"❌ templateId should be null, got: {reset_recipe.get('templateId')}")
                
            if reset_recipe.get('templateName') is None:
                self.log("✅ templateName correctly set to null")
                checks_passed += 1
            else:
                self.log(f"❌ templateName should be null, got: {reset_recipe.get('templateName')}")
                
            if reset_recipe.get('ingredients') == []:
                self.log("✅ ingredients correctly reset to empty array")
                checks_passed += 1
            else:
                self.log(f"❌ ingredients should be empty array, got: {reset_recipe.get('ingredients')}")
                
            if reset_recipe.get('needsCostInput') == True:
                self.log("✅ needsCostInput correctly reset to true")
                checks_passed += 1
            else:
                self.log(f"❌ needsCostInput should be true, got: {reset_recipe.get('needsCostInput')}")
            
            if checks_passed == total_checks:
                self.log("🎉 Recipe Template FULL Lifecycle Test PASSED - Template deletion fully resets linked recipes!")
                return True
            else:
                self.log(f"❌ Recipe Template lifecycle test FAILED: {checks_passed}/{total_checks} checks passed")
                return False
                
        except Exception as e:
            self.log(f"❌ Recipe Template lifecycle test failed with exception: {str(e)}", "ERROR")
            return False

    def test_unlink_endpoint_reset(self):
        """Test that unlink endpoint also resets recipes properly"""
        self.log("🎯 Starting Unlink Endpoint Reset Test...")
        
        try:
            # Step 1: Create another template
            template_data = {
                "name": "Unlink Test Template",
                "ingredients": [{
                    "name": "Test Material",
                    "category": "Raw Materials", 
                    "quantityUsed": 1.0,
                    "baseCostPerUnit": 15,
                    "unit": "pieces",
                    "inventoryItemId": "test-inv-2"
                }]
            }
            
            response, success = self.api_call('POST', '/recipe-templates', template_data)
            if not success or response.status_code != 201:
                self.log("❌ Failed to create template for unlink test", "ERROR")
                return False
                
            template_id = response.json().get('_id')
            
            # Step 2: Get a recipe to apply template to
            response, success = self.api_call('GET', '/sku-recipes')
            if not success:
                self.log("❌ Failed to get SKU recipes", "ERROR")
                return False
                
            recipes = response.json()
            eligible_recipes = [r for r in recipes if r.get('needsCostInput') == True]
            
            if len(eligible_recipes) < 1:
                self.log("❌ Need at least 1 recipe with needsCostInput=true for unlink test", "ERROR")
                return False
                
            recipe_id = eligible_recipes[0]['_id']
            
            # Step 3: Apply template to 1 recipe
            apply_data = {
                "templateId": template_id,
                "recipeIds": [recipe_id]
            }
            
            response, success = self.api_call('POST', '/recipe-templates/apply', apply_data)
            if not success:
                self.log("❌ Failed to apply template for unlink test", "ERROR")
                return False
            
            # Step 4: Unlink recipe
            unlink_data = {"recipeId": recipe_id}
            response, success = self.api_call('POST', '/recipe-templates/unlink', unlink_data)
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to unlink recipe: {response.status_code if response else 'No response'}", "ERROR")
                return False
            
            # Step 5: Verify unlink reset
            response, success = self.api_call('GET', f'/sku-recipes/{recipe_id}')
            if not success:
                self.log("❌ Failed to verify recipe after unlink", "ERROR")
                return False
                
            unlinked_recipe = response.json()
            
            # Verify unlink properly resets
            checks_passed = 0
            total_checks = 3
            
            if unlinked_recipe.get('ingredients') == []:
                self.log("✅ ingredients correctly reset to empty array after unlink")
                checks_passed += 1
            else:
                self.log(f"❌ ingredients should be empty after unlink, got: {unlinked_recipe.get('ingredients')}")
                
            if unlinked_recipe.get('needsCostInput') == True:
                self.log("✅ needsCostInput correctly reset to true after unlink")
                checks_passed += 1
            else:
                self.log(f"❌ needsCostInput should be true after unlink, got: {unlinked_recipe.get('needsCostInput')}")
                
            if unlinked_recipe.get('templateId') is None:
                self.log("✅ templateId correctly set to null after unlink")
                checks_passed += 1
            else:
                self.log(f"❌ templateId should be null after unlink, got: {unlinked_recipe.get('templateId')}")
            
            # Clean up: Delete the test template
            self.api_call('DELETE', f'/recipe-templates/{template_id}')
            
            if checks_passed == total_checks:
                self.log("🎉 Unlink Endpoint Reset Test PASSED - Unlinking properly resets recipes!")
                return True
            else:
                self.log(f"❌ Unlink endpoint test FAILED: {checks_passed}/{total_checks} checks passed")
                return False
                
        except Exception as e:
            self.log(f"❌ Unlink endpoint test failed with exception: {str(e)}", "ERROR")
            return False

    def test_dashboard_tips(self):
        """Test dashboard P&L breakdown includes totalTips field"""
        self.log("🎯 Starting Dashboard Tips Test...")
        
        try:
            response, success = self.api_call('GET', '/dashboard', params={'range': 'alltime'})
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to get dashboard: {response.status_code if response else 'No response'}", "ERROR")
                return False
            
            dashboard = response.json()
            pl_breakdown = dashboard.get('plBreakdown', {})
            
            if 'totalTips' not in pl_breakdown:
                self.log("❌ Dashboard plBreakdown missing totalTips field", "ERROR")
                return False
            
            total_tips = pl_breakdown['totalTips']
            if not isinstance(total_tips, (int, float)) or total_tips < 0:
                self.log(f"❌ totalTips should be a number >= 0, got: {total_tips}", "ERROR")
                return False
                
            self.log(f"✅ Dashboard plBreakdown.totalTips = {total_tips} (valid)")
            self.log("🎉 Dashboard Tips Test PASSED!")
            return True
            
        except Exception as e:
            self.log(f"❌ Dashboard tips test failed with exception: {str(e)}", "ERROR")
            return False

    def test_profit_calculator_tip_amount(self):
        """Test profit calculator includes tipAmount field"""
        self.log("🎯 Starting Profit Calculator Tip Amount Test...")
        
        try:
            # Get an order ID first
            response, success = self.api_call('GET', '/orders', params={'page': 1, 'limit': 5})
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to get orders: {response.status_code if response else 'No response'}", "ERROR")
                return False
            
            orders_data = response.json()
            orders = orders_data.get('orders', [])
            
            if not orders:
                self.log("❌ No orders found for profit calculation test", "ERROR")
                return False
            
            order_id = orders[0]['_id']
            self.log(f"✅ Using order ID: {order_id}")
            
            # Get profit calculation
            response, success = self.api_call('GET', f'/calculate-profit/{order_id}')
            if not success or response.status_code != 200:
                self.log(f"❌ Failed to calculate profit: {response.status_code if response else 'No response'}", "ERROR")
                return False
            
            profit_data = response.json()
            
            if 'tipAmount' not in profit_data:
                self.log("❌ Profit calculation missing tipAmount field", "ERROR")
                return False
                
            tip_amount = profit_data['tipAmount']
            if not isinstance(tip_amount, (int, float)) or tip_amount < 0:
                self.log(f"❌ tipAmount should be a number >= 0, got: {tip_amount}", "ERROR")
                return False
            
            self.log(f"✅ Profit calculation tipAmount = {tip_amount} (valid)")
            self.log("🎉 Profit Calculator Tip Amount Test PASSED!")
            return True
            
        except Exception as e:
            self.log(f"❌ Profit calculator test failed with exception: {str(e)}", "ERROR")
            return False

    def cleanup_test_data(self):
        """Clean up any remaining test data"""
        self.log("🧹 Cleaning up test data...")
        
        # Clean up any test templates that might still exist
        response, success = self.api_call('GET', '/recipe-templates')
        if success:
            templates = response.json()
            for template in templates:
                if 'test' in template.get('name', '').lower():
                    self.api_call('DELETE', f"/recipe-templates/{template['_id']}")
                    self.log(f"✅ Cleaned up test template: {template['name']}")

    def run_all_tests(self):
        """Run all backend tests for ROUND 3"""
        self.log("🚀 Starting ROUND 3 - Recipe Coverage + Apply UX + Template Lifecycle Backend Tests")
        self.log(f"📍 Base URL: {self.base_url}")
        
        tests = [
            ("Recipe Template FULL Lifecycle", self.test_recipe_template_full_lifecycle),
            ("Unlink Endpoint Reset", self.test_unlink_endpoint_reset), 
            ("Dashboard Tips P&L Breakdown", self.test_dashboard_tips),
            ("Profit Calculator Tip Amount", self.test_profit_calculator_tip_amount),
        ]
        
        results = {}
        
        for test_name, test_func in tests:
            self.log(f"\n{'='*60}")
            self.log(f"🧪 Running: {test_name}")
            self.log('='*60)
            
            try:
                result = test_func()
                results[test_name] = result
                status = "✅ PASSED" if result else "❌ FAILED"
                self.log(f"\n🏁 Test Result: {status}")
            except Exception as e:
                self.log(f"❌ Test failed with exception: {str(e)}", "ERROR")
                results[test_name] = False
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        self.log(f"\n{'='*60}")
        self.log("📊 ROUND 3 TEST SUMMARY")
        self.log('='*60)
        
        passed = sum(1 for result in results.values() if result)
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            self.log(f"{status} {test_name}")
        
        self.log(f"\n🎯 OVERALL RESULT: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("🎉 ALL ROUND 3 TESTS PASSED! Recipe Templates system fully functional.")
            return True
        else:
            self.log("❌ Some tests failed. Check individual test results above.")
            return False

def main():
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    else:
        base_url = "https://smart-finance-hub-41.preview.emergentagent.com/api"
    
    tester = BackendTester(base_url)
    success = tester.run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()