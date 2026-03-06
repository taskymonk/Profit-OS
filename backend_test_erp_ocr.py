#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import sys
from datetime import datetime

# Test configuration - using the correct base URL from .env
BASE_URL = "https://erp-polish-phase7.preview.emergentagent.com"

class ERPOCRBackendTester:
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

    async def test_team_performance_report_api(self):
        """Test Team Performance Report API"""
        print("\n🎯 Testing Team Performance Report API...")
        
        # Test 1: GET /api/reports/team-performance (without date range)
        try:
            response = await self.make_request('GET', '/api/reports/team-performance')
            if response['status'] == 200 and response['data']:
                data = response['data']
                
                # Check required structure
                required_keys = ['employees', 'summary', 'dateRange']
                if all(key in data for key in required_keys):
                    employees = data.get('employees', [])
                    summary = data.get('summary', {})
                    
                    # Check employee structure
                    employee_keys = ['employeeId', 'employeeName', 'totalAssigned', 'completed', 'completionRate', 
                                   'avgProductionTime', 'avgPackingTime', 'avgTotalTime', 'efficiencyScore', 'wastageCount']
                    
                    # Check summary structure
                    summary_keys = ['totalEmployees', 'totalAssignments', 'totalCompleted', 
                                  'avgTeamProductionTime', 'avgTeamPackingTime', 'topPerformer']
                    
                    employee_structure_ok = True
                    if employees:
                        sample_employee = employees[0]
                        missing_keys = [key for key in employee_keys if key not in sample_employee]
                        if missing_keys:
                            employee_structure_ok = False
                    
                    summary_structure_ok = all(key in summary for key in summary_keys)
                    
                    if employee_structure_ok and summary_structure_ok:
                        self.log_result('Team Performance Basic Structure', True, 
                                      f"Employees: {len(employees)}, Summary keys valid, Top performer: {summary.get('topPerformer', 'N/A')}")
                    else:
                        self.log_result('Team Performance Basic Structure', False, 
                                      f"Structure issues - Employee: {employee_structure_ok}, Summary: {summary_structure_ok}")
                else:
                    missing_keys = [key for key in required_keys if key not in data]
                    self.log_result('Team Performance Basic Structure', False, f"Missing keys: {missing_keys}")
            else:
                self.log_result('Team Performance Basic Structure', False, 
                              f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('Team Performance Basic Structure', False, f"Error: {e}")

        # Test 2: GET /api/reports/team-performance with date range
        try:
            response = await self.make_request('GET', '/api/reports/team-performance?startDate=2025-01-01&endDate=2026-12-31')
            if response['status'] == 200 and response['data']:
                data = response['data']
                date_range = data.get('dateRange', {})
                
                # Verify date range was applied
                if 'start' in date_range and 'end' in date_range:
                    self.log_result('Team Performance Date Range Filter', True, 
                                  f"Date range applied: {date_range['start']} to {date_range['end']}")
                else:
                    self.log_result('Team Performance Date Range Filter', False, "Date range not found in response")
            else:
                self.log_result('Team Performance Date Range Filter', False, 
                              f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('Team Performance Date Range Filter', False, f"Error: {e}")

    async def test_ocr_invoice_api(self):
        """Test OCR Invoice API (Tesseract text parsing)"""
        print("\n🎯 Testing OCR Invoice API...")
        
        # Test with sample OCR text
        test_ocr_text = """Invoice Number: INV-2024-001
Date: 15/03/2024
Vendor: ABC Supplies
Total Amount: Rs. 15,500.00
GST: Rs. 2,790.00
Packaging materials for Q1 2024"""
        
        test_data = {"ocrText": test_ocr_text}
        
        try:
            response = await self.make_request('POST', '/api/ocr/invoice', test_data)
            if response['status'] == 200 and response['data']:
                data = response['data']
                
                # Check required fields
                required_fields = ['method', 'vendor', 'amount', 'date', 'invoiceNumber', 'category', 'taxAmount', 'confidence']
                
                if all(field in data for field in required_fields):
                    # Validate specific values
                    method = data.get('method')
                    vendor = data.get('vendor')
                    amount = data.get('amount', 0)
                    invoice_number = data.get('invoiceNumber')
                    category = data.get('category')
                    confidence = data.get('confidence', 0)
                    
                    # Validations
                    validations = []
                    validations.append(('method', method == 'tesseract', f"method='{method}' (expected 'tesseract')"))
                    validations.append(('vendor found', vendor is not None, f"vendor='{vendor}'"))
                    validations.append(('amount > 0', amount > 0, f"amount={amount} (should be > 0)"))
                    validations.append(('invoice number', invoice_number is not None, f"invoiceNumber='{invoice_number}'"))
                    validations.append(('confidence', 0 <= confidence <= 1, f"confidence={confidence} (should be 0-1)"))
                    
                    all_valid = all(valid for _, valid, _ in validations)
                    
                    if all_valid:
                        self.log_result('OCR Invoice Tesseract Parsing', True, 
                                      f"Parsed successfully: vendor={vendor}, amount=₹{amount}, confidence={confidence}")
                    else:
                        failed_validations = [desc for _, valid, desc in validations if not valid]
                        self.log_result('OCR Invoice Tesseract Parsing', False, 
                                      f"Validation failures: {', '.join(failed_validations)}")
                else:
                    missing_fields = [field for field in required_fields if field not in data]
                    self.log_result('OCR Invoice Tesseract Parsing', False, f"Missing fields: {missing_fields}")
            else:
                self.log_result('OCR Invoice Tesseract Parsing', False, 
                              f"API error: status {response['status']}", response.get('data'))
        except Exception as e:
            self.log_result('OCR Invoice Tesseract Parsing', False, f"Error: {e}")

    async def test_ocr_test_connection_api(self):
        """Test OCR Test Connection API"""
        print("\n🎯 Testing OCR Test Connection API...")
        
        test_data = {
            "provider": "gemini",
            "apiKey": "fake_key_123"
        }
        
        try:
            response = await self.make_request('POST', '/api/ocr/test', test_data)
            
            # Should return success: false since the API key is fake
            if response['status'] == 400 and response['data']:
                data = response['data']
                success = data.get('success', True)  # Default to True to catch if missing
                
                if success == False:
                    self.log_result('OCR Test Connection', True, 
                                  f"Correctly returned success=false with fake API key")
                else:
                    self.log_result('OCR Test Connection', False, 
                                  f"Expected success=false, got success={success}")
            else:
                # Check if it's a different error status but still indicates failure
                if response['data'] and 'error' in response['data']:
                    self.log_result('OCR Test Connection', True, 
                                  f"Connection test failed as expected (status {response['status']})")
                else:
                    self.log_result('OCR Test Connection', False, 
                                  f"Unexpected response: status {response['status']}", response.get('data'))
        except Exception as e:
            self.log_result('OCR Test Connection', False, f"Error: {e}")

    async def test_integrations_ocr_settings(self):
        """Test Integrations OCR Settings"""
        print("\n🎯 Testing Integrations OCR Settings...")
        
        # Test 1: PUT /api/integrations (save OCR settings)
        ocr_settings_data = {
            "ocrSettings": {
                "method": "tesseract",
                "provider": "gemini", 
                "model": "gemini-2.0-flash-lite",
                "apiKey": ""
            }
        }
        
        try:
            response = await self.make_request('PUT', '/api/integrations', ocr_settings_data)
            if response['status'] in [200, 201]:
                self.log_result('OCR Settings Save', True, 
                              f"OCR settings saved successfully (status {response['status']})")
            else:
                self.log_result('OCR Settings Save', False, 
                              f"Save failed: status {response['status']}", response.get('data'))
        except Exception as e:
            self.log_result('OCR Settings Save', False, f"Error: {e}")
        
        # Test 2: GET /api/integrations (verify OCR settings saved)
        try:
            response = await self.make_request('GET', '/api/integrations')
            if response['status'] == 200 and response['data']:
                data = response['data']
                ocr_settings = data.get('ocrSettings')
                
                if ocr_settings:
                    # Check if the settings we saved are present
                    method = ocr_settings.get('method')
                    provider = ocr_settings.get('provider')
                    model = ocr_settings.get('model')
                    
                    if method == 'tesseract' and provider == 'gemini' and model == 'gemini-2.0-flash-lite':
                        self.log_result('OCR Settings Retrieval', True, 
                                      f"OCR settings retrieved correctly: method={method}, provider={provider}")
                    else:
                        self.log_result('OCR Settings Retrieval', False, 
                                      f"Settings mismatch: method={method}, provider={provider}, model={model}")
                else:
                    self.log_result('OCR Settings Retrieval', False, "ocrSettings not found in response")
            else:
                self.log_result('OCR Settings Retrieval', False, 
                              f"API error: status {response['status']}")
        except Exception as e:
            self.log_result('OCR Settings Retrieval', False, f"Error: {e}")

    async def test_regression_apis(self):
        """Test Regression - verify existing APIs still work"""
        print("\n🎯 Testing Regression APIs...")
        
        # Test 1: GET /api/overhead-expenses
        try:
            response = await self.make_request('GET', '/api/overhead-expenses')
            if response['status'] == 200 and isinstance(response['data'], list):
                self.log_result('Overhead Expenses API', True, 
                              f"GET /api/overhead-expenses returned {len(response['data'])} expenses")
            else:
                self.log_result('Overhead Expenses API', False, 
                              f"Unexpected response: status {response['status']}")
        except Exception as e:
            self.log_result('Overhead Expenses API', False, f"Error: {e}")
        
        # Test 2: GET /api/vendors  
        try:
            response = await self.make_request('GET', '/api/vendors')
            if response['status'] == 200 and isinstance(response['data'], list):
                self.log_result('Vendors API', True, 
                              f"GET /api/vendors returned {len(response['data'])} vendors")
            else:
                self.log_result('Vendors API', False, 
                              f"Unexpected response: status {response['status']}")
        except Exception as e:
            self.log_result('Vendors API', False, f"Error: {e}")
        
        # Test 3: GET /api/expense-categories
        try:
            response = await self.make_request('GET', '/api/expense-categories')
            if response['status'] == 200 and isinstance(response['data'], list):
                categories = response['data']
                self.log_result('Expense Categories API', True, 
                              f"GET /api/expense-categories returned {len(categories)} categories")
            else:
                self.log_result('Expense Categories API', False, 
                              f"Unexpected response: status {response['status']}")
        except Exception as e:
            self.log_result('Expense Categories API', False, f"Error: {e}")

    async def run_all_tests(self):
        """Run all test suites for ERP OCR APIs"""
        print("🚀 Starting ERP OCR Backend API Testing...")
        print(f"Base URL: {BASE_URL}")
        print("=" * 80)
        
        try:
            await self.test_team_performance_report_api()
            await self.test_ocr_invoice_api()
            await self.test_ocr_test_connection_api() 
            await self.test_integrations_ocr_settings()
            await self.test_regression_apis()
            
        except Exception as e:
            print(f"❌ Critical error during testing: {e}")
            
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 80)
        print("📊 ERP OCR BACKEND API TEST SUMMARY")
        print("=" * 80)
        
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
    async with ERPOCRBackendTester() as tester:
        await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())