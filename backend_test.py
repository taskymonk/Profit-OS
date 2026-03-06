#!/usr/bin/env python3
"""
Phase 6.4 - Public API with Swagger Documentation Testing
Base URL: http://localhost:3000/api

Test Areas:
1. API Key Management (CRUD)
2. Public API v1 Authentication  
3. Public API v1 Endpoints (10 endpoints)
4. OpenAPI Spec Validation
5. Response Format Consistency
"""

import requests
import json
import sys
import os
from datetime import datetime

BASE_URL = "http://localhost:3000/api"
TEST_API_KEY = "pos_test_api_key_for_testing_12345"

def test_api(method, endpoint, data=None, headers=None):
    """Helper function to make API requests with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=data, headers=headers)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers)
        
        print(f"{method} {endpoint} -> Status: {response.status_code}")
        
        try:
            result = response.json()
        except:
            result = response.text
            
        return result, response.status_code
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None, None

def test_1_api_key_management_crud():
    """Test 1: API Key Management CRUD Operations"""
    print("\n🎯 TEST 1: API KEY MANAGEMENT CRUD")
    print("=" * 50)
    
    # GET /api/api-keys — Should return array of API keys with masked keys
    result, status = test_api("GET", "/api-keys")
    if status != 200:
        print("❌ GET /api/api-keys failed")
        return False
        
    if not isinstance(result, list):
        print("❌ Expected array response for GET /api/api-keys")
        return False
        
    print(f"✅ GET /api/api-keys returned {len(result)} keys")
    
    # Verify structure of existing keys
    if len(result) > 0:
        key = result[0]
        required_fields = ['_id', 'name', 'scope', 'maskedKey', 'rateLimit', 'revoked']
        for field in required_fields:
            if field not in key:
                print(f"❌ Missing field in API key: {field}")
                return False
        print(f"✅ API key structure valid - masked key: {key['maskedKey']}")
    
    # POST /api/api-keys — Create new API key
    new_key_data = {
        "name": "Agent Test Key",
        "scope": "readwrite", 
        "rateLimit": 200
    }
    
    result, status = test_api("POST", "/api-keys", new_key_data)
    if status != 201:
        print(f"❌ POST /api/api-keys failed with status {status}")
        return False
        
    if 'key' not in result or 'name' not in result:
        print("❌ POST /api/api-keys missing key or name in response")
        return False
        
    created_key_id = result['_id']
    full_key = result['key']
    print(f"✅ Created API key: {result['name']} (scope: {result['scope']}, rateLimit: {result['rateLimit']})")
    print(f"✅ Full key returned: {full_key}")
    
    # GET /api/api-keys again — Should show new key (masked)
    result, status = test_api("GET", "/api-keys")
    if status != 200:
        print("❌ Second GET /api/api-keys failed")
        return False
        
    # Find our created key
    found_key = None
    for key in result:
        if key['_id'] == created_key_id:
            found_key = key
            break
            
    if not found_key:
        print(f"❌ Created key {created_key_id} not found in list")
        return False
        
    print(f"✅ Created key found in list - masked: {found_key['maskedKey']}")
    
    # DELETE /api/api-keys/{id} — Should revoke the key
    result, status = test_api("DELETE", f"/api-keys/{created_key_id}")
    if status != 200:
        print(f"❌ DELETE /api/api-keys/{created_key_id} failed")
        return False
        
    print(f"✅ Key revoked: {result.get('message', 'Key revoked')}")
    
    # GET /api/api-keys again — Should show key as revoked  
    result, status = test_api("GET", "/api-keys")
    if status != 200:
        print("❌ Final GET /api/api-keys failed")
        return False
        
    # Find our revoked key
    found_key = None
    for key in result:
        if key['_id'] == created_key_id:
            found_key = key
            break
            
    if not found_key:
        print(f"❌ Revoked key {created_key_id} not found in list")
        return False
        
    if not found_key.get('revoked', False):
        print("❌ Key not marked as revoked")
        return False
        
    print(f"✅ Key correctly marked as revoked")
    
    print("✅ API Key Management CRUD test passed")
    return True

def test_2_public_api_authentication():
    """Test 2: Public API v1 Authentication"""
    print("\n🎯 TEST 2: PUBLIC API V1 AUTHENTICATION")
    print("=" * 50)
    
    # GET /api/v1/orders WITHOUT X-API-Key header — Should return 401
    result, status = test_api("GET", "/v1/orders")
    if status != 401:
        print(f"❌ Expected 401 for missing API key, got {status}")
        return False
        
    if not isinstance(result, dict) or result.get('success') != False:
        print("❌ Expected error response format for missing API key")
        return False
        
    expected_error = "Missing X-API-Key header"
    if expected_error not in result.get('error', ''):
        print(f"❌ Expected error '{expected_error}', got: {result.get('error')}")
        return False
        
    print(f"✅ Missing API key correctly returns 401: {result['error']}")
    
    # GET /api/v1/orders with invalid key — Should return 401
    invalid_headers = {"X-API-Key": "invalid_key"}
    result, status = test_api("GET", "/v1/orders", headers=invalid_headers)
    if status != 401:
        print(f"❌ Expected 401 for invalid API key, got {status}")
        return False
        
    expected_error = "Invalid or revoked API key"
    if expected_error not in result.get('error', ''):
        print(f"❌ Expected error '{expected_error}', got: {result.get('error')}")
        return False
        
    print(f"✅ Invalid API key correctly returns 401: {result['error']}")
    
    # GET /api/v1/openapi.json WITHOUT auth — Should return 200 (public)
    result, status = test_api("GET", "/v1/openapi.json")
    if status != 200:
        print(f"❌ Expected 200 for public OpenAPI spec, got {status}")
        return False
        
    if not isinstance(result, dict) or 'openapi' not in result:
        print("❌ OpenAPI spec should be accessible without auth")
        return False
        
    print(f"✅ OpenAPI spec accessible without auth: {result.get('info', {}).get('title', 'Unknown')}")
    
    print("✅ Public API Authentication test passed")
    return True

def test_3_public_api_endpoints():
    """Test 3: Public API v1 Endpoints (with valid API key)"""
    print("\n🎯 TEST 3: PUBLIC API V1 ENDPOINTS")
    print("=" * 50)
    
    headers = {"X-API-Key": TEST_API_KEY}
    
    # GET /api/v1/orders?page=1&limit=3 — Should return paginated orders
    params = {"page": 1, "limit": 3}
    result, status = test_api("GET", "/v1/orders", params, headers)
    if status != 200:
        print(f"❌ GET /v1/orders failed with status {status}")
        return False
        
    if not isinstance(result, dict) or result.get('success') != True:
        print("❌ Expected success response format")
        return False
        
    if 'data' not in result or 'meta' not in result:
        print("❌ Missing data or meta in orders response")
        return False
        
    meta = result['meta']
    required_meta_fields = ['page', 'limit', 'total', 'totalPages']
    for field in required_meta_fields:
        if field not in meta:
            print(f"❌ Missing meta field: {field}")
            return False
            
    print(f"✅ GET /v1/orders: {len(result['data'])} orders, page {meta['page']}/{meta['totalPages']}, total: {meta['total']}")
    
    # Store order ID for single order test
    order_id = None
    if len(result['data']) > 0:
        order_id = result['data'][0].get('orderId') or result['data'][0].get('_id')
    
    # GET /api/v1/orders/{id} — Should return single order with profit
    if order_id:
        result, status = test_api("GET", f"/v1/orders/{order_id}", headers=headers)
        if status != 200:
            print(f"❌ GET /v1/orders/{order_id} failed with status {status}")
            return False
            
        if result.get('success') != True or 'data' not in result:
            print("❌ Single order response invalid")
            return False
            
        order_data = result['data']
        if 'profit' not in order_data:
            print("❌ Order missing profit calculation")
            return False
            
        print(f"✅ GET /v1/orders/{order_id}: profit calculation included")
    else:
        print("⚠️  No orders available to test single order endpoint")
    
    # GET /api/v1/products?limit=2 — Should return SKU recipes
    params = {"limit": 2}
    result, status = test_api("GET", "/v1/products", params, headers)
    if status != 200:
        print(f"❌ GET /v1/products failed with status {status}")
        return False
        
    if result.get('success') != True:
        print("❌ Products response invalid")
        return False
        
    print(f"✅ GET /v1/products: {len(result.get('data', []))} products returned")
    
    # GET /api/v1/products with ?search=Rose — Should return filtered products
    params = {"search": "Rose"}
    result, status = test_api("GET", "/v1/products", params, headers)
    if status != 200:
        print(f"❌ GET /v1/products with search failed")
        return False
        
    print(f"✅ GET /v1/products?search=Rose: {len(result.get('data', []))} filtered products")
    
    # GET /api/v1/expenses — Should return expenses
    result, status = test_api("GET", "/v1/expenses", headers=headers)
    if status != 200:
        print(f"❌ GET /v1/expenses failed")
        return False
        
    if result.get('success') != True:
        print("❌ Expenses response invalid")
        return False
        
    print(f"✅ GET /v1/expenses: {result.get('meta', {}).get('total', 0)} expenses")
    
    # GET /api/v1/dashboard?range=alltime — Should return metrics
    params = {"range": "alltime"}
    result, status = test_api("GET", "/v1/dashboard", params, headers)
    if status != 200:
        print(f"❌ GET /v1/dashboard failed")
        return False
        
    if result.get('success') != True:
        print("❌ Dashboard response invalid")
        return False
        
    data = result['data']
    required_fields = ['totalOrders', 'revenue', 'netProfit']
    for field in required_fields:
        if field not in data:
            print(f"❌ Missing dashboard field: {field}")
            return False
            
    if data['totalOrders'] <= 0 or data['revenue'] <= 0:
        print("❌ Dashboard should have totalOrders > 0 and revenue > 0")
        return False
        
    print(f"✅ GET /v1/dashboard: {data['totalOrders']} orders, ₹{data['revenue']} revenue, ₹{data['netProfit']} profit")
    
    # GET /api/v1/finance/bills — Should return bills
    result, status = test_api("GET", "/v1/finance/bills", headers=headers)
    if status != 200:
        print(f"❌ GET /v1/finance/bills failed")
        return False
        
    print(f"✅ GET /v1/finance/bills: {result.get('meta', {}).get('total', 0)} bills")
    
    # GET /api/v1/finance/vendors — Should return vendors  
    result, status = test_api("GET", "/v1/finance/vendors", headers=headers)
    if status != 200:
        print(f"❌ GET /v1/finance/vendors failed")
        return False
        
    print(f"✅ GET /v1/finance/vendors: {result.get('meta', {}).get('total', 0)} vendors")
    
    # GET /api/v1/inventory — Should return inventory items
    result, status = test_api("GET", "/v1/inventory", headers=headers)
    if status != 200:
        print(f"❌ GET /v1/inventory failed")
        return False
        
    print(f"✅ GET /v1/inventory: {result.get('meta', {}).get('total', 0)} inventory items")
    
    # GET /api/v1/employees — Should return employees
    result, status = test_api("GET", "/v1/employees", headers=headers)
    if status != 200:
        print(f"❌ GET /v1/employees failed")
        return False
        
    print(f"✅ GET /v1/employees: {result.get('meta', {}).get('total', 0)} employees")
    
    # GET /api/v1/unknown-resource — Should return 404
    result, status = test_api("GET", "/v1/unknown-resource", headers=headers)
    if status != 404:
        print(f"❌ Expected 404 for unknown resource, got {status}")
        return False
        
    if result.get('success') != False or 'error' not in result:
        print("❌ Expected error response for unknown resource")
        return False
        
    error_msg = result['error']
    if 'Unknown resource' not in error_msg or 'Available:' not in error_msg:
        print(f"❌ Error message should list available resources: {error_msg}")
        return False
        
    print(f"✅ GET /v1/unknown-resource returns helpful 404: {error_msg}")
    
    print("✅ Public API Endpoints test passed")
    return True

def test_4_openapi_spec_validation():
    """Test 4: OpenAPI Spec Validation"""
    print("\n🎯 TEST 4: OPENAPI SPEC VALIDATION")
    print("=" * 50)
    
    # GET /api/v1/openapi.json — Should return valid OpenAPI 3.0 spec
    result, status = test_api("GET", "/v1/openapi.json")
    if status != 200:
        print(f"❌ GET /v1/openapi.json failed")
        return False
        
    if not isinstance(result, dict):
        print("❌ OpenAPI spec should be JSON object")
        return False
        
    # Verify OpenAPI 3.0 structure
    required_top_level = ['openapi', 'info', 'paths', 'components']
    for field in required_top_level:
        if field not in result:
            print(f"❌ Missing OpenAPI field: {field}")
            return False
            
    # Verify info section
    info = result['info']
    if 'title' not in info or 'version' not in info:
        print("❌ Missing title or version in info")
        return False
        
    print(f"✅ OpenAPI title: {info['title']}")
    print(f"✅ OpenAPI version: {info['version']}")
    
    # Verify paths exist
    paths = result['paths']
    expected_paths = [
        '/api/v1/orders',
        '/api/v1/orders/{id}',
        '/api/v1/products', 
        '/api/v1/dashboard',
        '/api/v1/expenses',
        '/api/v1/finance/bills',
        '/api/v1/inventory',
        '/api/v1/employees'
    ]
    
    for path in expected_paths:
        if path not in paths:
            print(f"❌ Missing path: {path}")
            return False
            
    print(f"✅ All expected paths present: {len(paths)} total paths")
    
    # Verify components has security schemes
    components = result['components']
    if 'securitySchemes' not in components:
        print("❌ Missing securitySchemes in components")
        return False
        
    security_schemes = components['securitySchemes']
    if 'ApiKeyAuth' not in security_schemes:
        print("❌ Missing ApiKeyAuth in securitySchemes")
        return False
        
    api_key_auth = security_schemes['ApiKeyAuth']
    if api_key_auth.get('type') != 'apiKey' or api_key_auth.get('name') != 'X-API-Key':
        print(f"❌ Invalid ApiKeyAuth config: {api_key_auth}")
        return False
        
    print(f"✅ ApiKeyAuth correctly configured")
    
    # Verify tags exist
    if 'tags' not in result:
        print("❌ Missing tags")
        return False
        
    tags = result['tags']
    expected_tag_names = ['Orders', 'Products', 'Expenses', 'Dashboard', 'Finance', 'Inventory', 'Employees']
    tag_names = [tag.get('name') for tag in tags]
    
    for expected_tag in expected_tag_names:
        if expected_tag not in tag_names:
            print(f"❌ Missing tag: {expected_tag}")
            return False
            
    print(f"✅ All expected tags present: {tag_names}")
    
    print("✅ OpenAPI Spec Validation test passed")
    return True

def test_5_response_format_consistency():
    """Test 5: Response Format Consistency"""
    print("\n🎯 TEST 5: RESPONSE FORMAT CONSISTENCY")
    print("=" * 50)
    
    headers = {"X-API-Key": TEST_API_KEY}
    
    # Test multiple endpoints for consistent format
    endpoints = [
        "/v1/orders?limit=1",
        "/v1/products?limit=1", 
        "/v1/expenses",
        "/v1/dashboard?range=today",
        "/v1/finance/bills",
        "/v1/inventory",
        "/v1/employees"
    ]
    
    for endpoint in endpoints:
        result, status = test_api("GET", endpoint, headers=headers)
        if status != 200:
            print(f"❌ {endpoint} failed with status {status}")
            return False
            
        # Verify response format: {success: true, data: ..., meta: ...}
        if not isinstance(result, dict):
            print(f"❌ {endpoint} should return JSON object")
            return False
            
        if result.get('success') != True:
            print(f"❌ {endpoint} should have success: true")
            return False
            
        if 'data' not in result:
            print(f"❌ {endpoint} missing data field")
            return False
            
        # Most endpoints should have meta (except some dashboard)
        if endpoint != "/v1/dashboard?range=today" and 'meta' not in result:
            print(f"⚠️  {endpoint} missing meta field (may be expected)")
            
        print(f"✅ {endpoint} has correct response format")
    
    # Test error response format
    result, status = test_api("GET", "/v1/orders", headers={"X-API-Key": "invalid"})
    if status != 401:
        print("❌ Error test failed")
        return False
        
    # Verify error format: {success: false, error: "message"}
    if result.get('success') != False or 'error' not in result:
        print(f"❌ Error response format incorrect: {result}")
        return False
        
    print(f"✅ Error responses have correct format: {{'success': False, 'error': '...'}}")
    
    print("✅ Response Format Consistency test passed")
    return True

def main():
    """Run all Phase 6.4 Public API tests"""
    print("🚀 PHASE 6.4 - PUBLIC API WITH SWAGGER DOCUMENTATION TESTING")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    print(f"Test API Key: {TEST_API_KEY}")
    print("=" * 70)
    
    test_results = []
    
    try:
        # Test 1: API Key Management CRUD
        result1 = test_1_api_key_management_crud()
        test_results.append(("API Key Management CRUD", result1))
        
        # Test 2: Public API Authentication  
        result2 = test_2_public_api_authentication()
        test_results.append(("Public API Authentication", result2))
        
        # Test 3: Public API Endpoints
        result3 = test_3_public_api_endpoints()
        test_results.append(("Public API Endpoints", result3))
        
        # Test 4: OpenAPI Spec Validation
        result4 = test_4_openapi_spec_validation()
        test_results.append(("OpenAPI Spec Validation", result4))
        
        # Test 5: Response Format Consistency
        result5 = test_5_response_format_consistency()
        test_results.append(("Response Format Consistency", result5))
        
    except Exception as e:
        print(f"❌ Test execution error: {e}")
    
    # Print summary
    print("\n📊 FINAL TEST RESULTS SUMMARY")
    print("=" * 40)
    
    passed = 0
    total = len(test_results)
    
    for test_name, success in test_results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{status}: {test_name}")
        if success:
            passed += 1
    
    print("=" * 40)
    print(f"TOTAL: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED! Public API system is fully functional!")
        return True
    else:
        print("⚠️  Some tests failed. Check the details above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)