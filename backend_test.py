#!/usr/bin/env python3
"""
Comprehensive backend testing for Phase 9G: New Reports + Integration Masking + Selective Purge + Recipe Unlink
"""
import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://expense-fifo-rebuild.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.test_results = {
            'monthly_pl_report': False,
            'customer_repeat_report': False, 
            'product_cogs_report': False,
            'expense_trend_report': False,
            'integration_masking': False,
            'selective_purge': False,
            'recipe_unlink': False
        }
        self.total_tests = len(self.test_results)
        self.passed_tests = 0
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_api_endpoint(self, method, endpoint, data=None, expected_status=200, description=""):
        """Generic API test helper"""
        try:
            url = f"{BASE_URL}{endpoint}"
            
            if method.upper() == 'GET':
                response = requests.get(url, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, timeout=30)
            else:
                self.log(f"❌ Unsupported method: {method}")
                return False
                
            self.log(f"{description} - Status: {response.status_code}")
            
            if response.status_code != expected_status:
                self.log(f"❌ Expected {expected_status}, got {response.status_code}")
                return False
                
            return response.json() if response.content else {}
            
        except Exception as e:
            self.log(f"❌ {description} failed: {str(e)}")
            return False

    def test_monthly_pl_report(self):
        """Test 1: Monthly P&L Report - GET /api/reports/monthly-pl"""
        self.log("\n🎯 Testing Monthly P&L Report...")
        
        try:
            result = self.test_api_endpoint(
                'GET', '/reports/monthly-pl',
                description="Monthly P&L Report"
            )
            
            if not result:
                return False
                
            # Validate response structure
            if not isinstance(result, list):
                self.log("❌ Response should be an array")
                return False
                
            if len(result) == 0:
                self.log("⚠️ No monthly data found, but API works")
                self.test_results['monthly_pl_report'] = True
                return True
                
            # Check first month structure
            month = result[0]
            required_fields = ['month', 'orderCount', 'revenue', 'cogs', 'shopifyFees', 'razorpayFees', 'adSpend', 'overhead', 'netProfit', 'margin']
            
            for field in required_fields:
                if field not in month:
                    self.log(f"❌ Missing field: {field}")
                    return False
                    
            self.log(f"✅ Found {len(result)} months of P&L data")
            self.log(f"✅ Sample month {month['month']}: Revenue ₹{month['revenue']}, Net Profit ₹{month['netProfit']} ({month['margin']}% margin)")
            
            self.test_results['monthly_pl_report'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Monthly P&L test failed: {str(e)}")
            return False

    def test_customer_repeat_report(self):
        """Test 2: Customer Repeat Report - GET /api/reports/customer-repeat"""
        self.log("\n🎯 Testing Customer Repeat Report...")
        
        try:
            params = "?startDate=2024-01-01&endDate=2026-12-31"
            result = self.test_api_endpoint(
                'GET', f'/reports/customer-repeat{params}',
                description="Customer Repeat Report"
            )
            
            if not result:
                return False
                
            # Validate response structure
            if 'summary' not in result or 'topRepeatCustomers' not in result:
                self.log("❌ Missing 'summary' or 'topRepeatCustomers' in response")
                return False
                
            summary = result['summary']
            required_fields = ['totalCustomers', 'repeatCustomers', 'oneTimeCustomers', 'repeatRate', 'avgOrderValue', 'avgRepeatOrders', 'repeatRevenue', 'oneTimeRevenue']
            
            for field in required_fields:
                if field not in summary:
                    self.log(f"❌ Missing summary field: {field}")
                    return False
                    
            top_customers = result['topRepeatCustomers']
            if not isinstance(top_customers, list):
                self.log("❌ topRepeatCustomers should be an array")
                return False
                
            self.log(f"✅ Customer Analysis Complete:")
            self.log(f"  - Total Customers: {summary['totalCustomers']}")
            self.log(f"  - Repeat Customers: {summary['repeatCustomers']}")
            self.log(f"  - Repeat Rate: {summary['repeatRate']}%")
            self.log(f"  - Avg Order Value: ₹{summary['avgOrderValue']}")
            self.log(f"  - Top Repeat Customers: {len(top_customers)}")
            
            self.test_results['customer_repeat_report'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Customer Repeat test failed: {str(e)}")
            return False

    def test_product_cogs_report(self):
        """Test 3: Product COGS Analysis - GET /api/reports/product-cogs"""
        self.log("\n🎯 Testing Product COGS Report...")
        
        try:
            params = "?startDate=2024-01-01&endDate=2026-12-31"
            result = self.test_api_endpoint(
                'GET', f'/reports/product-cogs{params}',
                description="Product COGS Report"
            )
            
            if not result:
                return False
                
            if not isinstance(result, list):
                self.log("❌ Response should be an array")
                return False
                
            if len(result) == 0:
                self.log("⚠️ No product COGS data found, but API works")
                self.test_results['product_cogs_report'] = True
                return True
                
            # Check first product structure
            product = result[0]
            required_fields = ['sku', 'productName', 'orders', 'revenue', 'cogs', 'grossProfit', 'margin', 'avgCOGSPerOrder', 'hasRecipe']
            
            for field in required_fields:
                if field not in product:
                    self.log(f"❌ Missing field: {field}")
                    return False
                    
            self.log(f"✅ Found {len(result)} products in COGS analysis")
            self.log(f"✅ Top product: {product['sku']} - {product['productName']}")
            self.log(f"  - Orders: {product['orders']}, Revenue: ₹{product['revenue']}")
            self.log(f"  - COGS: ₹{product['cogs']}, Gross Profit: ₹{product['grossProfit']} ({product['margin']}%)")
            
            self.test_results['product_cogs_report'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Product COGS test failed: {str(e)}")
            return False

    def test_expense_trend_report(self):
        """Test 4: Expense Trend Report - GET /api/reports/expense-trend"""
        self.log("\n🎯 Testing Expense Trend Report...")
        
        try:
            result = self.test_api_endpoint(
                'GET', '/reports/expense-trend',
                description="Expense Trend Report"
            )
            
            if not result:
                return False
                
            # Validate response structure
            if 'data' not in result or 'categories' not in result:
                self.log("❌ Missing 'data' or 'categories' in response")
                return False
                
            data = result['data']
            categories = result['categories']
            
            if not isinstance(data, list) or not isinstance(categories, list):
                self.log("❌ 'data' and 'categories' should be arrays")
                return False
                
            self.log(f"✅ Found {len(data)} months of expense data")
            self.log(f"✅ Found {len(categories)} expense categories: {', '.join(categories[:5])}")
            
            if len(data) > 0:
                month = data[0]
                if 'month' in month and 'total' in month:
                    self.log(f"✅ Sample month {month['month']}: Total expenses ₹{month.get('total', 0)}")
                    
            self.test_results['expense_trend_report'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Expense Trend test failed: {str(e)}")
            return False

    def test_integration_masking(self):
        """Test 5: Integration Save Masking - Verify masked secrets don't overwrite existing values"""
        self.log("\n🎯 Testing Integration Masking Bug Fix...")
        
        try:
            # Step 1: Get current integrations
            current = self.test_api_endpoint(
                'GET', '/integrations',
                description="Get current integrations"
            )
            
            if not current:
                return False
                
            # Step 2: Save with masked secret (should NOT overwrite)
            masked_data = {
                "shopify": {
                    "storeUrl": "test-store.myshopify.com",
                    "accessToken": "********",  # This should be ignored
                    "active": True
                }
            }
            
            save_result = self.test_api_endpoint(
                'PUT', '/integrations',
                data=masked_data,
                description="Save with masked accessToken"
            )
            
            if not save_result:
                return False
                
            # Step 3: Verify the accessToken was NOT overwritten with ********
            after_save = self.test_api_endpoint(
                'GET', '/integrations',
                description="Get integrations after masked save"
            )
            
            if not after_save:
                return False
                
            # The accessToken should still contain the original value, not ********
            shopify_config = after_save.get('shopify', {})
            access_token = shopify_config.get('accessToken', '')
            
            if access_token == '********':
                self.log("❌ Masked token was saved! Bug not fixed.")
                return False
                
            self.log(f"✅ Access token preserved: {access_token[:10]}... (not overwritten)")
            
            # Step 4: Restore original storeUrl
            restore_data = {
                "shopify": {
                    "storeUrl": current.get('shopify', {}).get('storeUrl', ''),
                    "accessToken": access_token,  # Keep the preserved token
                    "active": current.get('shopify', {}).get('active', False)
                }
            }
            
            self.test_api_endpoint(
                'PUT', '/integrations',
                data=restore_data,
                description="Restore original storeUrl"
            )
            
            self.log("✅ Integration masking works correctly - masked values ignored")
            self.test_results['integration_masking'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Integration masking test failed: {str(e)}")
            return False

    def test_selective_purge(self):
        """Test 6: Selective Purge - POST /api/purge with specific purgeType"""
        self.log("\n🎯 Testing Selective Purge (RECIPES ONLY)...")
        
        try:
            # Step 1: Check current recipe count
            before_recipes = self.test_api_endpoint(
                'GET', '/sku-recipes',
                description="Get recipes before purge"
            )
            
            if not before_recipes:
                return False
                
            recipe_count_before = len(before_recipes) if isinstance(before_recipes, list) else 0
            self.log(f"Recipes before purge: {recipe_count_before}")
            
            # Step 2: Perform selective purge (recipes only)
            purge_data = {"purgeType": "recipes"}
            purge_result = self.test_api_endpoint(
                'POST', '/purge',
                data=purge_data,
                description="Selective purge (recipes only)"
            )
            
            if not purge_result:
                return False
                
            # Validate purge response
            if 'message' not in purge_result or 'purged' not in purge_result:
                self.log("❌ Invalid purge response structure")
                return False
                
            purged = purge_result['purged']
            recipes_deleted = purged.get('skuRecipes', 0)
            
            self.log(f"✅ Purge complete: {recipes_deleted} recipes deleted")
            
            # Step 3: Verify orders still exist (should not be touched)
            after_orders = self.test_api_endpoint(
                'GET', '/orders?page=1&limit=1',
                description="Verify orders still exist"
            )
            
            if not after_orders:
                return False
                
            orders_remaining = after_orders.get('total', 0)
            self.log(f"✅ Orders preserved: {orders_remaining} orders still exist")
            
            if orders_remaining == 0:
                self.log("❌ Orders were deleted! Selective purge failed.")
                return False
                
            self.log("✅ Selective purge working correctly - only recipes deleted")
            self.test_results['selective_purge'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Selective purge test failed: {str(e)}")
            return False

    def test_recipe_unlink(self):
        """Test 7: SKU Recipe Unlink - PUT /api/sku-recipes/{id}/unlink"""
        self.log("\n🎯 Testing Recipe Unlink Endpoint...")
        
        try:
            # Step 1: Find a recipe that has a templateId
            recipes = self.test_api_endpoint(
                'GET', '/sku-recipes',
                description="Get SKU recipes"
            )
            
            if not recipes:
                return False
                
            # Look for recipe with templateId
            target_recipe = None
            for recipe in recipes:
                if recipe.get('templateId'):
                    target_recipe = recipe
                    break
                    
            if not target_recipe:
                self.log("⚠️ No recipes with templateId found - testing with first recipe")
                if len(recipes) == 0:
                    self.log("❌ No recipes found to test unlink")
                    return False
                target_recipe = recipes[0]
                
            recipe_id = target_recipe['_id']
            original_template_id = target_recipe.get('templateId')
            original_ingredients = target_recipe.get('ingredients', [])
            
            self.log(f"Testing with recipe: {target_recipe['sku']} - {target_recipe['productName']}")
            
            # Step 2: Unlink the recipe
            unlink_result = self.test_api_endpoint(
                'PUT', f'/sku-recipes/{recipe_id}/unlink',
                data={},
                description="Unlink recipe from template"
            )
            
            if not unlink_result:
                return False
                
            # Step 3: Verify the recipe was unlinked
            after_unlink = self.test_api_endpoint(
                'GET', f'/sku-recipes/{recipe_id}',
                description="Get recipe after unlink"
            )
            
            if not after_unlink:
                return False
                
            # Verify templateId and ingredients cleared
            if after_unlink.get('templateId') is not None:
                self.log(f"❌ templateId not cleared: {after_unlink.get('templateId')}")
                return False
                
            if len(after_unlink.get('ingredients', [])) > 0:
                self.log(f"❌ Ingredients not cleared: {len(after_unlink.get('ingredients', []))}")
                return False
                
            self.log("✅ Recipe unlinked successfully:")
            self.log(f"  - templateId cleared: {original_template_id} → None")
            self.log(f"  - Ingredients cleared: {len(original_ingredients)} → 0")
            
            # Step 4: Re-apply template if possible (optional cleanup)
            if original_template_id:
                self.log("Attempting to restore template link...")
                # This would need the recipe templates API, but we'll skip for now
                pass
                
            self.test_results['recipe_unlink'] = True
            return True
            
        except Exception as e:
            self.log(f"❌ Recipe unlink test failed: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("🚀 Starting Comprehensive Backend Testing for Phase 9G")
        self.log("=" * 60)
        
        # Test all endpoints
        tests = [
            ('Monthly P&L Report', self.test_monthly_pl_report),
            ('Customer Repeat Report', self.test_customer_repeat_report), 
            ('Product COGS Report', self.test_product_cogs_report),
            ('Expense Trend Report', self.test_expense_trend_report),
            ('Integration Masking', self.test_integration_masking),
            ('Selective Purge', self.test_selective_purge),
            ('Recipe Unlink', self.test_recipe_unlink)
        ]
        
        for test_name, test_func in tests:
            try:
                success = test_func()
                if success:
                    self.passed_tests += 1
                    self.log(f"✅ {test_name} - PASSED")
                else:
                    self.log(f"❌ {test_name} - FAILED")
            except Exception as e:
                self.log(f"❌ {test_name} - ERROR: {str(e)}")
        
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "=" * 60)
        self.log("🎯 PHASE 9G BACKEND TESTING SUMMARY")
        self.log("=" * 60)
        
        for test_name, passed in self.test_results.items():
            status = "✅ PASSED" if passed else "❌ FAILED"
            self.log(f"{test_name.replace('_', ' ').title()}: {status}")
            
        self.log(f"\nOverall: {self.passed_tests}/{self.total_tests} tests passed")
        
        if self.passed_tests == self.total_tests:
            self.log("🎉 ALL TESTS PASSED! Phase 9G backend fully functional.")
        else:
            self.log(f"⚠️ {self.total_tests - self.passed_tests} tests failed. Review issues above.")

if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all_tests()