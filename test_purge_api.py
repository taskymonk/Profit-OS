#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import sys
from datetime import datetime

# Test configuration
BASE_URL = "https://erp-polish-phase7.preview.emergentagent.com/api"

class PurgeApiTester:
    def __init__(self):
        self.session = None
        self.results = []
        self.failed_tests = []
        self.session_cookies = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def log_result(self, test_name, success, message, details=None):
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }
        self.results.append(result)
        if not success:
            self.failed_tests.append(test_name)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")

    async def make_request(self, method, endpoint, data=None, headers=None, expect_status=200):
        url = f"{BASE_URL}{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if headers:
            default_headers.update(headers)
        
        try:
            kwargs = {'headers': default_headers}
            if data:
                kwargs['data'] = json.dumps(data) if isinstance(data, dict) else data
            if self.session_cookies:
                kwargs['cookies'] = self.session_cookies
            
            async with self.session.request(method, url, **kwargs) as response:
                response_text = await response.text()
                try:
                    response_data = json.loads(response_text) if response_text else None
                except json.JSONDecodeError:
                    response_data = {'raw_text': response_text}
                
                # Store session cookies from login response
                if 'set-cookie' in response.headers:
                    self.session_cookies = {}
                    for cookie_header in response.headers.getall('set-cookie', []):
                        if '=' in cookie_header:
                            name, value = cookie_header.split('=', 1)
                            self.session_cookies[name] = value.split(';')[0]
                
                return {
                    'status': response.status,
                    'data': response_data,
                    'headers': dict(response.headers),
                    'text': response_text
                }
        except Exception as e:
            return {
                'status': 0,
                'error': str(e),
                'data': None,
                'headers': {},
                'text': ''
            }

    async def login_admin(self):
        """Login with admin credentials to get session cookie"""
        print("\n🔐 Authenticating as admin...")
        
        login_data = {
            "email": "admin@giftsugar.com",
            "password": "admin123"
        }
        
        try:
            response = await self.make_request('POST', '/auth/callback/credentials', login_data)
            if response['status'] == 200:
                self.log_result('Admin Login', True, "Successfully authenticated as admin")
                return True
            else:
                self.log_result('Admin Login', False, f"Login failed: status {response['status']}", response['data'])
                return False
        except Exception as e:
            self.log_result('Admin Login', False, f"Login error: {e}")
            return False

    async def test_purge_recipes(self):
        """Test POST /api/purge with purgeType='recipes'"""
        print("\n🎯 Testing Purge Recipes...")
        
        try:
            purge_data = {"purgeType": "recipes"}
            response = await self.make_request('POST', '/purge', purge_data)
            
            if response['status'] == 200:
                data = response['data']
                if 'purged' in data and isinstance(data['purged'], dict):
                    purged_counts = data['purged']
                    # Should contain skuRecipes and recipeTemplates
                    expected_collections = ['skuRecipes', 'recipeTemplates']
                    
                    all_present = all(col in purged_counts for col in expected_collections)
                    
                    if all_present:
                        sku_count = purged_counts.get('skuRecipes', 0)
                        template_count = purged_counts.get('recipeTemplates', 0)
                        self.log_result('Purge Recipes', True, 
                                      f"Recipes purged successfully - SKU Recipes: {sku_count}, Recipe Templates: {template_count}")
                    else:
                        self.log_result('Purge Recipes', False, f"Missing expected collections in purged counts", purged_counts)
                else:
                    self.log_result('Purge Recipes', False, "Response missing 'purged' object", data)
            else:
                self.log_result('Purge Recipes', False, f"Purge failed: status {response['status']}", response['data'])
                
        except Exception as e:
            self.log_result('Purge Recipes', False, f"Error: {e}")

    async def test_purge_orders(self):
        """Test POST /api/purge with purgeType='orders'"""
        print("\n🎯 Testing Purge Orders...")
        
        try:
            purge_data = {"purgeType": "orders"}
            response = await self.make_request('POST', '/purge', purge_data)
            
            if response['status'] == 200:
                data = response['data']
                if 'purged' in data and isinstance(data['purged'], dict):
                    purged_counts = data['purged']
                    # Should contain orders, settlementEstimates, razorpayUnmatchedPayments
                    expected_collections = ['orders', 'settlementEstimates', 'razorpayUnmatchedPayments']
                    
                    all_present = all(col in purged_counts for col in expected_collections)
                    
                    if all_present:
                        orders_count = purged_counts.get('orders', 0)
                        settlements_count = purged_counts.get('settlementEstimates', 0)
                        payments_count = purged_counts.get('razorpayUnmatchedPayments', 0)
                        self.log_result('Purge Orders', True, 
                                      f"Orders purged successfully - Orders: {orders_count}, Settlements: {settlements_count}, Unmatched Payments: {payments_count}")
                    else:
                        self.log_result('Purge Orders', False, f"Missing expected collections in purged counts", purged_counts)
                else:
                    self.log_result('Purge Orders', False, "Response missing 'purged' object", data)
            else:
                self.log_result('Purge Orders', False, f"Purge failed: status {response['status']}", response['data'])
                
        except Exception as e:
            self.log_result('Purge Orders', False, f"Error: {e}")

    async def test_purge_inventory(self):
        """Test POST /api/purge with purgeType='inventory'"""
        print("\n🎯 Testing Purge Inventory...")
        
        try:
            purge_data = {"purgeType": "inventory"}
            response = await self.make_request('POST', '/purge', purge_data)
            
            if response['status'] == 200:
                data = response['data']
                if 'purged' in data and isinstance(data['purged'], dict):
                    purged_counts = data['purged']
                    # Should contain inventoryItems, inventoryCategories, stockBatches, stockConsumptions, wastageLog, rawMaterials, packagingMaterials, materialRequests
                    expected_collections = ['inventoryItems', 'inventoryCategories', 'stockBatches', 'stockConsumptions', 'wastageLog', 'rawMaterials', 'packagingMaterials', 'materialRequests']
                    
                    all_present = all(col in purged_counts for col in expected_collections)
                    
                    if all_present:
                        inventory_count = purged_counts.get('inventoryItems', 0)
                        batches_count = purged_counts.get('stockBatches', 0)
                        consumptions_count = purged_counts.get('stockConsumptions', 0)
                        wastage_count = purged_counts.get('wastageLog', 0)
                        self.log_result('Purge Inventory', True, 
                                      f"Inventory purged successfully - Items: {inventory_count}, Batches: {batches_count}, Consumptions: {consumptions_count}, Wastage: {wastage_count}, etc.")
                    else:
                        self.log_result('Purge Inventory', False, f"Missing expected collections in purged counts", purged_counts)
                else:
                    self.log_result('Purge Inventory', False, "Response missing 'purged' object", data)
            else:
                self.log_result('Purge Inventory', False, f"Purge failed: status {response['status']}", response['data'])
                
        except Exception as e:
            self.log_result('Purge Inventory', False, f"Error: {e}")

    async def test_purge_expenses(self):
        """Test POST /api/purge with purgeType='expenses'"""
        print("\n🎯 Testing Purge Expenses...")
        
        try:
            purge_data = {"purgeType": "expenses"}
            response = await self.make_request('POST', '/purge', purge_data)
            
            if response['status'] == 200:
                data = response['data']
                if 'purged' in data and isinstance(data['purged'], dict):
                    purged_counts = data['purged']
                    # Should contain overheadExpenses, expenseCategories, dailyMarketingSpend, bills
                    expected_collections = ['overheadExpenses', 'expenseCategories', 'dailyMarketingSpend', 'bills']
                    
                    all_present = all(col in purged_counts for col in expected_collections)
                    
                    if all_present:
                        expenses_count = purged_counts.get('overheadExpenses', 0)
                        categories_count = purged_counts.get('expenseCategories', 0)
                        marketing_count = purged_counts.get('dailyMarketingSpend', 0)
                        bills_count = purged_counts.get('bills', 0)
                        self.log_result('Purge Expenses', True, 
                                      f"Expenses purged successfully - Expenses: {expenses_count}, Categories: {categories_count}, Marketing: {marketing_count}, Bills: {bills_count}")
                    else:
                        self.log_result('Purge Expenses', False, f"Missing expected collections in purged counts", purged_counts)
                else:
                    self.log_result('Purge Expenses', False, "Response missing 'purged' object", data)
            else:
                self.log_result('Purge Expenses', False, f"Purge failed: status {response['status']}", response['data'])
                
        except Exception as e:
            self.log_result('Purge Expenses', False, f"Error: {e}")

    async def test_purge_all(self):
        """Test POST /api/purge with purgeType='all'"""
        print("\n🎯 Testing Purge All...")
        
        try:
            purge_data = {"purgeType": "all"}
            response = await self.make_request('POST', '/purge', purge_data)
            
            if response['status'] == 200:
                data = response['data']
                if 'purged' in data and isinstance(data['purged'], dict):
                    purged_counts = data['purged']
                    
                    # Should contain all operational data collections
                    expected_collections = [
                        'orders', 'skuRecipes', 'recipeTemplates', 'rawMaterials', 'packagingMaterials',
                        'vendors', 'employees', 'overheadExpenses', 'expenseCategories',
                        'inventoryItems', 'inventoryCategories', 'stockBatches', 'stockConsumptions',
                        'dailyMarketingSpend', 'bills', 'kdsAssignments', 'materialRequests',
                        'rtoParcels', 'parcelImages', 'indiaPostEvents', 'shippingCarriers',
                        'settlementEstimates', 'razorpayUnmatchedPayments', 'userActivity',
                        'wastageLog', 'backups', 'whatsappMessages', 'whatsappIncoming',
                        'whatsappOptOuts', 'whatsappTemplates'
                    ]
                    
                    # Count how many expected collections are present
                    present_collections = [col for col in expected_collections if col in purged_counts]
                    total_purged = sum(purged_counts.values())
                    
                    if len(present_collections) >= 10:  # Should have most of the key collections
                        self.log_result('Purge All', True, 
                                      f"All data purged successfully - {len(present_collections)}/{len(expected_collections)} collections processed, {total_purged} total records deleted")
                    else:
                        self.log_result('Purge All', False, f"Too few collections in purge response: {len(present_collections)}/{len(expected_collections)}", list(purged_counts.keys()))
                else:
                    self.log_result('Purge All', False, "Response missing 'purged' object", data)
            else:
                self.log_result('Purge All', False, f"Purge failed: status {response['status']}", response['data'])
                
        except Exception as e:
            self.log_result('Purge All', False, f"Error: {e}")

    async def test_preservation_after_purge_all(self):
        """Test that critical data is preserved after 'all' purge"""
        print("\n🎯 Testing Data Preservation after All Purge...")
        
        # Test 1: GET /api/tenant-config should still have data
        try:
            response = await self.make_request('GET', '/tenant-config')
            if response['status'] == 200 and response['data']:
                config = response['data']
                if config.get('tenantName'):  # Should have tenant name and other config
                    self.log_result('Tenant Config Preservation', True, f"Tenant config preserved: {config.get('tenantName')}")
                else:
                    self.log_result('Tenant Config Preservation', False, "Tenant config exists but missing data", config)
            else:
                self.log_result('Tenant Config Preservation', False, f"Tenant config not accessible: status {response['status']}")
        except Exception as e:
            self.log_result('Tenant Config Preservation', False, f"Error: {e}")

        # Test 2: GET /api/users should still have data
        try:
            response = await self.make_request('GET', '/users')
            if response['status'] == 200 and response['data']:
                users = response['data']
                if isinstance(users, list) and len(users) > 0:
                    self.log_result('Users Preservation', True, f"Users preserved: {len(users)} users found")
                else:
                    self.log_result('Users Preservation', False, "Users endpoint accessible but no users found", users)
            else:
                self.log_result('Users Preservation', False, f"Users not accessible: status {response['status']}")
        except Exception as e:
            self.log_result('Users Preservation', False, f"Error: {e}")

    async def run_all_tests(self):
        """Run all purge API tests"""
        print("🚀 Starting Purge API Testing...")
        print(f"Base URL: {BASE_URL}")
        print("=" * 60)
        
        # First login to get session
        login_success = await self.login_admin()
        if not login_success:
            print("❌ Cannot proceed without authentication")
            return
        
        try:
            # Test all purge types
            await self.test_purge_recipes()
            await self.test_purge_orders()
            await self.test_purge_inventory()
            await self.test_purge_expenses()
            await self.test_purge_all()
            await self.test_preservation_after_purge_all()
            
        except Exception as e:
            print(f"❌ Critical error during testing: {e}")
            
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 PURGE API TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "No tests run")
        
        if self.failed_tests:
            print(f"\n🚨 FAILED TESTS:")
            for test in self.failed_tests:
                print(f"   • {test}")
        
        print("\n📋 DETAILED TEST RESULTS:")
        for result in self.results:
            status = "✅" if result['success'] else "❌"
            print(f"{status} {result['test']}: {result['message']}")

async def main():
    async with PurgeApiTester() as tester:
        await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())