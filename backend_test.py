#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import sys
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:3000"
VALID_API_KEY = "pos_test_api_key_for_testing_12345"

class BackendTester:
    def __init__(self):
        self.session = None
        self.results = []
        self.failed_tests = []

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
            
            async with self.session.request(method, url, **kwargs) as response:
                response_text = await response.text()
                try:
                    response_data = json.loads(response_text) if response_text else None
                except json.JSONDecodeError:
                    response_data = {'raw_text': response_text}
                
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

    async def test_shipping_carriers_crud(self):
        """Test Shipping Carriers CRUD operations"""
        print("\n🎯 Testing Shipping Carriers CRUD...")
        
        # Test 1: GET /api/shipping-carriers (should return array, may be empty)
        try:
            response = await self.make_request('GET', '/api/shipping-carriers')
            if response['status'] == 200 and isinstance(response['data'], list):
                self.log_result('Shipping Carriers GET', True, f"GET /api/shipping-carriers returned array with {len(response['data'])} carriers")
            else:
                self.log_result('Shipping Carriers GET', False, f"Unexpected response: status {response['status']}", response['data'])
        except Exception as e:
            self.log_result('Shipping Carriers GET', False, f"Error: {e}")

        # Test 2: POST /api/shipping-carriers (create new carrier)
        test_carrier_data = {
            "name": "Test Carrier XYZ",
            "shortName": "TestC", 
            "color": "#ff0000",
            "trackUrlTemplate": "https://test.com/track?id={tracking}"
        }
        
        carrier_id = None
        try:
            response = await self.make_request('POST', '/api/shipping-carriers', test_carrier_data)
            if response['status'] in [200, 201] and response['data']:
                carrier_id = response['data'].get('_id') or response['data'].get('id')
                self.log_result('Shipping Carriers POST', True, f"Created carrier: {response['data'].get('name', 'Unknown')}")
            else:
                self.log_result('Shipping Carriers POST', False, f"Create failed: status {response['status']}", response['data'])
        except Exception as e:
            self.log_result('Shipping Carriers POST', False, f"Error: {e}")

        # Test 3: GET /api/shipping-carriers again (should now include new carrier)
        try:
            response = await self.make_request('GET', '/api/shipping-carriers')
            if response['status'] == 200:
                carriers = response['data']
                found_test_carrier = any(c.get('name') == 'Test Carrier XYZ' for c in carriers)
                if found_test_carrier:
                    self.log_result('Shipping Carriers GET (after create)', True, f"Found test carrier in list of {len(carriers)} carriers")
                else:
                    self.log_result('Shipping Carriers GET (after create)', False, "Test carrier not found in list")
            else:
                self.log_result('Shipping Carriers GET (after create)', False, f"GET failed: status {response['status']}")
        except Exception as e:
            self.log_result('Shipping Carriers GET (after create)', False, f"Error: {e}")

        # Test 4: DELETE /api/shipping-carriers/{id}
        if carrier_id:
            try:
                response = await self.make_request('DELETE', f'/api/shipping-carriers/{carrier_id}')
                if response['status'] in [200, 204]:
                    self.log_result('Shipping Carriers DELETE', True, f"Deleted carrier {carrier_id}")
                else:
                    self.log_result('Shipping Carriers DELETE', False, f"Delete failed: status {response['status']}", response['data'])
            except Exception as e:
                self.log_result('Shipping Carriers DELETE', False, f"Error: {e}")
        else:
            self.log_result('Shipping Carriers DELETE', False, "No carrier ID available for deletion test")

    async def test_user_management(self):
        """Test User Management APIs"""
        print("\n🎯 Testing User Management...")
        
        # Test 1: GET /api/users (should return array of 3+ users)
        user_id = None
        try:
            response = await self.make_request('GET', '/api/users')
            if response['status'] == 200 and isinstance(response['data'], list):
                users = response['data']
                if len(users) >= 3:
                    self.log_result('Users GET', True, f"Found {len(users)} users (≥3 required)")
                    user_id = users[0].get('_id')
                else:
                    self.log_result('Users GET', False, f"Only found {len(users)} users, need 3+")
            else:
                self.log_result('Users GET', False, f"Unexpected response: status {response['status']}", response['data'])
        except Exception as e:
            self.log_result('Users GET', False, f"Error: {e}")

        if not user_id:
            self.log_result('User Management Setup', False, "No user ID available for further tests")
            return

        # Test 2: GET /api/users/{userId}/activity (should return activity array)
        try:
            response = await self.make_request('GET', f'/api/users/{user_id}/activity')
            if response['status'] == 200 and isinstance(response['data'], list):
                self.log_result('User Activity GET', True, f"User activity returned {len(response['data'])} entries")
            else:
                self.log_result('User Activity GET', False, f"Unexpected response: status {response['status']}")
        except Exception as e:
            self.log_result('User Activity GET', False, f"Error: {e}")

        # Test 3: PUT /api/users/{userId}/module-access (update module access)
        module_access_data = {"moduleAccess": {"kds": False, "rto": True}}
        try:
            response = await self.make_request('PUT', f'/api/users/{user_id}/module-access', module_access_data)
            if response['status'] == 200:
                self.log_result('User Module Access PUT', True, "Module access updated successfully")
            else:
                self.log_result('User Module Access PUT', False, f"Update failed: status {response['status']}", response['data'])
        except Exception as e:
            self.log_result('User Module Access PUT', False, f"Error: {e}")

        # Test 4: Revert module access changes 
        revert_data = {"moduleAccess": {}}
        try:
            response = await self.make_request('PUT', f'/api/users/{user_id}/module-access', revert_data)
            if response['status'] == 200:
                self.log_result('User Module Access Revert', True, "Module access reset successfully")
            else:
                self.log_result('User Module Access Revert', False, f"Revert failed: status {response['status']}")
        except Exception as e:
            self.log_result('User Module Access Revert', False, f"Error: {e}")

    async def test_kds_override(self):
        """Test KDS Override functionality"""
        print("\n🎯 Testing KDS Override...")
        
        # Test 1: GET /api/kds/assignments (get assignment ID)
        assignment_id = None
        try:
            response = await self.make_request('GET', '/api/kds/assignments')
            if response['status'] == 200 and isinstance(response['data'], list):
                assignments = response['data']
                if assignments:
                    assignment_id = assignments[0].get('_id') or assignments[0].get('id')
                    self.log_result('KDS Assignments GET', True, f"Found {len(assignments)} assignments")
                else:
                    self.log_result('KDS Assignments GET', True, "No assignments found (empty system)")
            else:
                self.log_result('KDS Assignments GET', False, f"Unexpected response: status {response['status']}")
        except Exception as e:
            self.log_result('KDS Assignments GET', False, f"Error: {e}")

        # Test 2: PUT /api/kds/override/{assignmentId} (override status)  
        if assignment_id:
            override_data = {"status": "in_progress"}
            try:
                response = await self.make_request('PUT', f'/api/kds/override/{assignment_id}', override_data)
                if response['status'] == 200:
                    self.log_result('KDS Override PUT', True, f"Status override successful for assignment {assignment_id}")
                else:
                    self.log_result('KDS Override PUT', False, f"Override failed: status {response['status']}", response['data'])
            except Exception as e:
                self.log_result('KDS Override PUT', False, f"Error: {e}")

            # Test 3: Revert override
            revert_data = {"status": "assigned"}
            try:
                response = await self.make_request('PUT', f'/api/kds/override/{assignment_id}', revert_data)
                if response['status'] == 200:
                    self.log_result('KDS Override Revert', True, f"Status revert successful")
                else:
                    self.log_result('KDS Override Revert', False, f"Revert failed: status {response['status']}")
            except Exception as e:
                self.log_result('KDS Override Revert', False, f"Error: {e}")
        else:
            self.log_result('KDS Override PUT', False, "No assignment ID available for override test")

    async def test_security_headers(self):
        """Test Security Headers on API responses"""
        print("\n🎯 Testing Security Headers...")
        
        try:
            response = await self.make_request('GET', '/api/module-settings')
            headers = response.get('headers', {})
            
            # Check X-Frame-Options
            frame_options = headers.get('x-frame-options', '').upper()
            if frame_options == 'SAMEORIGIN':
                self.log_result('Security Header X-Frame-Options', True, f"X-Frame-Options: {frame_options}")
            else:
                self.log_result('Security Header X-Frame-Options', False, f"Missing or incorrect X-Frame-Options: {frame_options}")
            
            # Check X-Content-Type-Options  
            content_type_options = headers.get('x-content-type-options', '').lower()
            if content_type_options == 'nosniff':
                self.log_result('Security Header X-Content-Type-Options', True, f"X-Content-Type-Options: {content_type_options}")
            else:
                self.log_result('Security Header X-Content-Type-Options', False, f"Missing or incorrect X-Content-Type-Options: {content_type_options}")
            
            # Check X-App-Version
            app_version = headers.get('x-app-version', '')
            if app_version == '3.1.0':
                self.log_result('Security Header X-App-Version', True, f"X-App-Version: {app_version}")
            else:
                self.log_result('Security Header X-App-Version', False, f"Missing or incorrect X-App-Version: {app_version}")
                
        except Exception as e:
            self.log_result('Security Headers', False, f"Error: {e}")

    async def test_regression_checks(self):
        """Test Regression - verify existing functionality still works"""
        print("\n🎯 Testing Regression Checks...")
        
        # Test 1: GET /api/gamification/progress (should still return XP >= 1000, level Champion)
        try:
            response = await self.make_request('GET', '/api/gamification/progress')
            if response['status'] == 200 and response['data']:
                data = response['data']
                xp = data.get('xp', 0)
                level_name = data.get('level', {}).get('name', '')
                
                if xp >= 1000 and level_name == 'Champion':
                    self.log_result('Gamification Progress', True, f"XP: {xp}, Level: {level_name}")
                else:
                    self.log_result('Gamification Progress', False, f"Unexpected values - XP: {xp}, Level: {level_name}")
            else:
                self.log_result('Gamification Progress', False, f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('Gamification Progress', False, f"Error: {e}")

        # Test 2: GET /api/module-settings (should return 7 modules)
        try:
            response = await self.make_request('GET', '/api/module-settings')
            if response['status'] == 200 and response['data']:
                modules = response['data']
                if len(modules) == 7:
                    self.log_result('Module Settings', True, f"Found {len(modules)} modules")
                else:
                    self.log_result('Module Settings', False, f"Expected 7 modules, found {len(modules)}")
            else:
                self.log_result('Module Settings', False, f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('Module Settings', False, f"Error: {e}")

        # Test 3: GET /api/v1/orders (with API key - should return orders)
        try:
            headers = {'X-API-Key': VALID_API_KEY}
            response = await self.make_request('GET', '/api/v1/orders?limit=1', headers=headers)
            if response['status'] == 200 and response['data']:
                data = response['data']
                if 'data' in data and isinstance(data['data'], list):
                    self.log_result('API v1 Orders', True, f"API v1 orders working, found {len(data['data'])} orders in response")
                else:
                    self.log_result('API v1 Orders', False, f"Unexpected data structure: {data}")
            else:
                self.log_result('API v1 Orders', False, f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('API v1 Orders', False, f"Error: {e}")

    async def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Phase 7 Pre-Phase Fixes Backend Testing...")
        print(f"Base URL: {BASE_URL}")
        print("=" * 60)
        
        try:
            await self.test_shipping_carriers_crud()
            await self.test_user_management() 
            await self.test_kds_override()
            await self.test_security_headers()
            await self.test_regression_checks()
            
        except Exception as e:
            print(f"❌ Critical error during testing: {e}")
            
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 PHASE 7 PRE-PHASE FIXES BACKEND TEST SUMMARY")
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
    async with BackendTester() as tester:
        await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())