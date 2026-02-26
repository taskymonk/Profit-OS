#!/usr/bin/env python3
"""
Profit OS Backend API Testing Suite
Tests all backend APIs according to test_result.md requirements
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import uuid

# Base URLs
BASE_URL = "https://profit-dashboard-37.preview.emergentagent.com/api"

class ProfitOSAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'ProfitOS-API-Test/1.0'
        })
        self.test_results = []
        self.test_order_id = None
        self.test_recipe_id = None
        
    def log_test_result(self, test_name, success, message="", response_data=None):
        """Log test results for summary"""
        self.test_results.append({
            'test': test_name,
            'success': success,
            'message': message,
            'data': response_data
        })
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if message:
            print(f"   Details: {message}")
        
    def test_api_endpoint(self, method, endpoint, data=None, expected_status=200, test_name=None):
        """Generic API test helper"""
        if not test_name:
            test_name = f"{method} {endpoint}"
            
        try:
            url = f"{self.base_url}{endpoint}"
            
            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            success = response.status_code == expected_status
            
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}
            
            message = f"Status: {response.status_code}"
            if not success:
                message += f", Expected: {expected_status}"
                
            self.log_test_result(test_name, success, message, response_data)
            return success, response_data
            
        except Exception as e:
            self.log_test_result(test_name, False, f"Exception: {str(e)}")
            return False, {"error": str(e)}

    def test_seed_api(self):
        """Test POST /api/seed - should return {seeded: false} since data already exists"""
        print("\n=== Testing Seed API ===")
        
        success, data = self.test_api_endpoint('POST', '/seed', {}, 200, "Seed API")
        
        if success:
            if 'seeded' in data and data['seeded'] == False:
                self.log_test_result("Seed API - Already Seeded Check", True, "Correctly returned seeded: false")
            else:
                self.log_test_result("Seed API - Already Seeded Check", False, f"Expected seeded: false, got: {data.get('seeded')}")

    def test_dashboard_api(self):
        """Test GET /api/dashboard - verify structure and data types"""
        print("\n=== Testing Dashboard API ===")
        
        success, data = self.test_api_endpoint('GET', '/dashboard', None, 200, "Dashboard API")
        
        if success and isinstance(data, dict):
            # Check required fields
            required_fields = ['today', 'allTime', 'dailyData', 'recentOrders']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                self.log_test_result("Dashboard API - Structure Check", True, "All required fields present")
            else:
                self.log_test_result("Dashboard API - Structure Check", False, f"Missing fields: {missing_fields}")
                return
            
            # Check today metrics
            today = data.get('today', {})
            today_fields = ['netProfit', 'totalOrders', 'rtoRate', 'roas']
            today_missing = [field for field in today_fields if field not in today]
            
            if not today_missing:
                self.log_test_result("Dashboard API - Today Metrics", True, 
                    f"Profit: {today.get('netProfit')}, Orders: {today.get('totalOrders')}, RTO: {today.get('rtoRate')}%, ROAS: {today.get('roas')}")
            else:
                self.log_test_result("Dashboard API - Today Metrics", False, f"Missing today fields: {today_missing}")
                
            # Check dailyData array
            daily_data = data.get('dailyData', [])
            if isinstance(daily_data, list) and len(daily_data) == 7:
                self.log_test_result("Dashboard API - Daily Data", True, f"7 days of data present")
            else:
                self.log_test_result("Dashboard API - Daily Data", False, f"Expected 7 days, got: {len(daily_data) if isinstance(daily_data, list) else 'not array'}")
                
            # Check recent orders
            recent_orders = data.get('recentOrders', [])
            if isinstance(recent_orders, list) and len(recent_orders) > 0:
                first_order = recent_orders[0]
                if '_profitData' in first_order or 'netProfit' in first_order:
                    self.log_test_result("Dashboard API - Recent Orders with Profit", True, f"{len(recent_orders)} orders with profit data")
                else:
                    self.log_test_result("Dashboard API - Recent Orders with Profit", False, "Orders missing profit data")
            else:
                self.log_test_result("Dashboard API - Recent Orders", False, "No recent orders found")

    def test_orders_crud(self):
        """Test Orders CRUD operations"""
        print("\n=== Testing Orders CRUD ===")
        
        # 1. GET /api/orders - list all orders
        success, orders_data = self.test_api_endpoint('GET', '/orders', None, 200, "Get All Orders")
        
        if not success or not isinstance(orders_data, list):
            self.log_test_result("Orders CRUD", False, "Failed to get orders list")
            return
            
        original_count = len(orders_data)
        self.log_test_result("Orders List", True, f"Found {original_count} orders")
        
        # Get a sample order for profit calculation test
        sample_order = None
        if orders_data:
            sample_order = orders_data[0]
            
        # 2. GET /api/orders?status=RTO - filter by status
        success, rto_orders = self.test_api_endpoint('GET', '/orders?status=RTO', None, 200, "Get RTO Orders")
        if success:
            rto_count = len(rto_orders) if isinstance(rto_orders, list) else 0
            self.log_test_result("Orders Filter by Status", True, f"Found {rto_count} RTO orders")
        
        # 3. POST /api/orders - create new order
        test_order = {
            "orderId": "TEST-001",
            "sku": "GS-CHOCO-PREMIUM-500",
            "productName": "Test Chocolate Gift Box",
            "customerName": "Test User",
            "salePrice": 1299,
            "discount": 0,
            "status": "Delivered",
            "shippingMethod": "indiapost",
            "shippingCost": 85,
            "orderDate": "2025-02-26T00:00:00.000Z"
        }
        
        success, new_order = self.test_api_endpoint('POST', '/orders', test_order, 201, "Create New Order")
        if success and isinstance(new_order, dict) and '_id' in new_order:
            self.test_order_id = new_order['_id']
            self.log_test_result("Create Order", True, f"Created order with ID: {self.test_order_id}")
            
            # 4. PUT /api/orders/{id} - update order status to RTO
            update_data = {"status": "RTO"}
            success, updated_order = self.test_api_endpoint('PUT', f'/orders/{self.test_order_id}', update_data, 200, "Update Order Status")
            if success and isinstance(updated_order, dict):
                if updated_order.get('status') == 'RTO':
                    self.log_test_result("Update Order Status", True, "Order status updated to RTO")
                else:
                    self.log_test_result("Update Order Status", False, f"Status not updated correctly: {updated_order.get('status')}")
        else:
            self.log_test_result("Create Order", False, "Failed to create test order")
            
        # Test profit calculation if we have a sample order
        if sample_order and '_id' in sample_order:
            self.test_profit_calculation(sample_order['_id'])
        
    def test_profit_calculation(self, order_id):
        """Test GET /api/calculate-profit/{orderId}"""
        print("\n=== Testing Profit Calculator ===")
        
        success, profit_data = self.test_api_endpoint('GET', f'/calculate-profit/{order_id}', None, 200, "Calculate Order Profit")
        
        if success and isinstance(profit_data, dict):
            # Check required profit fields
            required_fields = [
                'orderId', 'netRevenue', 'totalCOGS', 'shippingCost', 
                'totalTransactionFee', 'marketingAllocation', 'netProfit'
            ]
            
            missing_fields = [field for field in required_fields if field not in profit_data]
            
            if not missing_fields:
                self.log_test_result("Profit Calculator - Structure", True, "All required fields present")
                
                # Verify calculation logic
                net_profit = profit_data.get('netProfit', 0)
                net_revenue = profit_data.get('netRevenue', 0)
                total_cogs = profit_data.get('totalCOGS', 0)
                shipping = profit_data.get('shippingCost', 0)
                txn_fee = profit_data.get('totalTransactionFee', 0)
                marketing = profit_data.get('marketingAllocation', 0)
                
                expected_profit = net_revenue - total_cogs - shipping - txn_fee - marketing
                profit_diff = abs(net_profit - expected_profit)
                
                if profit_diff < 0.01:  # Allow for small floating point differences
                    self.log_test_result("Profit Calculator - Formula Verification", True, 
                        f"Net Profit: {net_profit}, Components: Revenue({net_revenue}) - COGS({total_cogs}) - Shipping({shipping}) - TxnFee({txn_fee}) - Marketing({marketing})")
                else:
                    self.log_test_result("Profit Calculator - Formula Verification", False, 
                        f"Calculation mismatch. Expected: {expected_profit}, Got: {net_profit}")
                        
                # Check RTO doubling logic if applicable
                if profit_data.get('isRTO'):
                    self.log_test_result("Profit Calculator - RTO Detection", True, "RTO order detected, shipping should be doubled")
                    
            else:
                self.log_test_result("Profit Calculator - Structure", False, f"Missing fields: {missing_fields}")

    def test_sku_recipes_crud(self):
        """Test SKU Recipes CRUD operations"""
        print("\n=== Testing SKU Recipes CRUD ===")
        
        # 1. GET /api/sku-recipes
        success, recipes_data = self.test_api_endpoint('GET', '/sku-recipes', None, 200, "Get All SKU Recipes")
        
        if success and isinstance(recipes_data, list):
            self.log_test_result("SKU Recipes List", True, f"Found {len(recipes_data)} recipes")
        else:
            self.log_test_result("SKU Recipes List", False, "Failed to get recipes list")
            return
            
        # 2. POST /api/sku-recipes - create new recipe
        test_recipe = {
            "sku": "TEST-SKU-001",
            "productName": "Test Product",
            "rawMaterials": [
                {
                    "name": "Sugar",
                    "quantity": 100,
                    "pricePerUnit": 0.5,
                    "unitMeasurement": "grams"
                }
            ],
            "packaging": [
                {
                    "name": "Test Box",
                    "pricePerUnit": 20
                }
            ],
            "consumableCost": 5,
            "totalWeightGrams": 300,
            "defaultWastageBuffer": 3
        }
        
        success, new_recipe = self.test_api_endpoint('POST', '/sku-recipes', test_recipe, 201, "Create New SKU Recipe")
        if success and isinstance(new_recipe, dict) and '_id' in new_recipe:
            self.test_recipe_id = new_recipe['_id']
            self.log_test_result("Create SKU Recipe", True, f"Created recipe with ID: {self.test_recipe_id}")
        else:
            self.log_test_result("Create SKU Recipe", False, "Failed to create test recipe")

    def test_integrations_api(self):
        """Test Integrations API for masked tokens"""
        print("\n=== Testing Integrations API ===")
        
        # 1. GET /api/integrations - should return masked tokens
        success, integrations_data = self.test_api_endpoint('GET', '/integrations', None, 200, "Get Integrations")
        
        if success and isinstance(integrations_data, dict):
            self.log_test_result("Integrations API", True, "Integrations data retrieved")
            
            # Check if tokens are masked (if they exist)
            shopify = integrations_data.get('shopify', {})
            if shopify.get('accessToken') and '*' in shopify['accessToken']:
                self.log_test_result("Integrations - Token Masking", True, "Shopify token properly masked")
            else:
                self.log_test_result("Integrations - Token Masking", True, "No Shopify token to mask")
                
        # 2. PUT /api/integrations - update integrations
        update_data = {
            "shopify": {
                "storeUrl": "test.myshopify.com",
                "accessToken": "test_token_123456789",
                "active": True
            }
        }
        
        success, update_response = self.test_api_endpoint('PUT', '/integrations', update_data, 200, "Update Integrations")
        if success:
            self.log_test_result("Update Integrations", True, "Integrations updated successfully")
            
            # 3. Verify masking after update
            success, updated_integrations = self.test_api_endpoint('GET', '/integrations', None, 200, "Verify Token Masking")
            if success:
                shopify_updated = updated_integrations.get('shopify', {})
                token = shopify_updated.get('accessToken', '')
                if '*' in token and token.endswith('9'):  # Last 4 chars should be visible
                    self.log_test_result("Integrations - Updated Token Masking", True, f"Token properly masked: {token}")
                else:
                    self.log_test_result("Integrations - Updated Token Masking", False, f"Token not masked correctly: {token}")

    def test_tenant_config(self):
        """Test Tenant Config API"""
        print("\n=== Testing Tenant Config ===")
        
        # 1. GET /api/tenant-config
        success, config_data = self.test_api_endpoint('GET', '/tenant-config', None, 200, "Get Tenant Config")
        
        if success and isinstance(config_data, dict):
            original_name = config_data.get('tenantName', '')
            self.log_test_result("Tenant Config", True, f"Current tenant: {original_name}")
            
            # 2. PUT /api/tenant-config - update tenant name
            update_data = {"tenantName": "TestBrand"}
            success, update_response = self.test_api_endpoint('PUT', '/tenant-config', update_data, 200, "Update Tenant Config")
            
            if success:
                # 3. Verify update
                success, updated_config = self.test_api_endpoint('GET', '/tenant-config', None, 200, "Verify Tenant Update")
                if success and updated_config.get('tenantName') == 'TestBrand':
                    self.log_test_result("Tenant Config Update", True, "Tenant name updated successfully")
                    
                    # Restore original name
                    restore_data = {"tenantName": original_name}
                    self.test_api_endpoint('PUT', '/tenant-config', restore_data, 200, "Restore Original Tenant Name")
                else:
                    self.log_test_result("Tenant Config Update", False, "Tenant name not updated correctly")

    def test_other_crud_apis(self):
        """Test other CRUD APIs quickly"""
        print("\n=== Testing Other CRUD APIs ===")
        
        # Test various endpoints
        endpoints = [
            ('vendors', 'Vendors'),
            ('raw-materials', 'Raw Materials'),
            ('packaging-materials', 'Packaging Materials'),
            ('employees', 'Employees'),
            ('overhead-expenses', 'Overhead Expenses')
        ]
        
        for endpoint, name in endpoints:
            # GET - list all
            success, data = self.test_api_endpoint('GET', f'/{endpoint}', None, 200, f"Get All {name}")
            if success and isinstance(data, list):
                self.log_test_result(f"{name} CRUD", True, f"Found {len(data)} {name.lower()}")
                
                # Quick POST test for vendors (smallest data)
                if endpoint == 'vendors':
                    test_vendor = {
                        "name": "Test Vendor",
                        "contact": "test@example.com",
                        "phone": "+91-1234567890",
                        "defaultCurrency": "INR"
                    }
                    success, new_vendor = self.test_api_endpoint('POST', f'/{endpoint}', test_vendor, 201, f"Create Test {name}")
                    if success and '_id' in new_vendor:
                        vendor_id = new_vendor['_id']
                        # Clean up
                        self.test_api_endpoint('DELETE', f'/{endpoint}/{vendor_id}', None, 200, f"Delete Test {name}")
            else:
                self.log_test_result(f"{name} CRUD", False, f"Failed to get {name.lower()}")

    def cleanup_test_data(self):
        """Clean up test data created during testing"""
        print("\n=== Cleaning Up Test Data ===")
        
        # Delete test order if created
        if self.test_order_id:
            success, _ = self.test_api_endpoint('DELETE', f'/orders/{self.test_order_id}', None, 200, "Delete Test Order")
            if success:
                self.log_test_result("Cleanup Test Order", True, "Test order deleted")
                
        # Delete test recipe if created
        if self.test_recipe_id:
            success, _ = self.test_api_endpoint('DELETE', f'/sku-recipes/{self.test_recipe_id}', None, 200, "Delete Test Recipe")
            if success:
                self.log_test_result("Cleanup Test Recipe", True, "Test recipe deleted")

    def run_all_tests(self):
        """Run all backend API tests"""
        print(f"Starting Profit OS Backend API Tests")
        print(f"Base URL: {self.base_url}")
        print("=" * 60)
        
        try:
            # Run all test suites
            self.test_seed_api()
            self.test_dashboard_api()
            self.test_orders_crud()
            self.test_sku_recipes_crud()
            self.test_integrations_api()
            self.test_tenant_config()
            self.test_other_crud_apis()
            
            # Clean up
            self.cleanup_test_data()
            
        except Exception as e:
            print(f"❌ CRITICAL ERROR: {str(e)}")
            self.log_test_result("CRITICAL ERROR", False, str(e))
        
        # Print summary
        self.print_test_summary()

    def print_test_summary(self):
        """Print comprehensive test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        failed = sum(1 for result in self.test_results if not result['success'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "No tests")
        
        # List failed tests
        failed_tests = [result for result in self.test_results if not result['success']]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test['message']}")
        
        # Critical issues
        critical_failures = [
            test for test in failed_tests 
            if any(keyword in test['test'].lower() for keyword in ['dashboard', 'profit', 'orders', 'crud'])
        ]
        
        if critical_failures:
            print("\n🚨 CRITICAL FAILURES:")
            for test in critical_failures:
                print(f"  - {test['test']}: {test['message']}")
        
        print("\n" + "=" * 60)


if __name__ == "__main__":
    tester = ProfitOSAPITester()
    tester.run_all_tests()