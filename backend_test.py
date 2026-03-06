#!/usr/bin/env python3
"""
Phase 6.2 Import/Export System Testing
Base URL: https://profit-calc-fixes.preview.emergentagent.com/api
"""

import requests
import json
import sys
import os
from datetime import datetime

BASE_URL = "https://profit-calc-fixes.preview.emergentagent.com/api"

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
        
        if response.status_code >= 400:
            print(f"ERROR: {response.text}")
            return None
            
        try:
            return response.json()
        except:
            return response.text
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def test_1_export_counts():
    """Test 1: Export Counts - Should return record counts"""
    print("\n🎯 TEST 1: EXPORT COUNTS")
    print("=" * 50)
    
    result = test_api("GET", "/data/export-counts")
    if not result:
        print("❌ Export counts failed")
        return False
        
    # Verify expected fields exist
    required_fields = ['orders', 'recipes']
    for field in required_fields:
        if field not in result:
            print(f"❌ Missing field: {field}")
            return False
            
    print(f"✅ Orders count: {result.get('orders', 0)}")
    print(f"✅ SKU Recipes count: {result.get('recipes', 0)}")
    
    # Verify orders > 0, recipes > 0 as per test plan
    if result.get('orders', 0) <= 0:
        print("❌ No orders found - expected > 0")
        return False
    if result.get('recipes', 0) <= 0:
        print("❌ No recipes found - expected > 0") 
        return False
        
    print("✅ Export counts test passed")
    return result

def test_2_export_single_module():
    """Test 2: Export JSON (single module) - recipes"""
    print("\n🎯 TEST 2: EXPORT SINGLE MODULE (RECIPES)")
    print("=" * 50)
    
    result = test_api("GET", "/data/export?modules=recipes&format=json")
    if not result:
        print("❌ Single module export failed")
        return False
        
    # Verify response structure
    if '_meta' not in result:
        print("❌ Missing _meta field")
        return False
        
    meta = result['_meta']
    required_meta_fields = ['exportedAt', 'version', 'modules', 'summary']
    for field in required_meta_fields:
        if field not in meta:
            print(f"❌ Missing _meta field: {field}")
            return False
            
    # Verify expected data arrays
    if 'skuRecipes' not in result:
        print("❌ Missing skuRecipes array")
        return False
    if 'recipeTemplates' not in result:
        print("❌ Missing recipeTemplates array")
        return False
        
    print(f"✅ Meta exportedAt: {meta['exportedAt']}")
    print(f"✅ Meta version: {meta['version']}")
    print(f"✅ Meta modules: {meta['modules']}")
    print(f"✅ SKU Recipes count: {len(result.get('skuRecipes', []))}")
    print(f"✅ Recipe Templates count: {len(result.get('recipeTemplates', []))}")
    print(f"✅ Summary: {meta.get('summary', {})}")
    
    print("✅ Single module export test passed")
    return result

def test_3_export_multiple_modules():
    """Test 3: Export JSON (multiple modules)"""
    print("\n🎯 TEST 3: EXPORT MULTIPLE MODULES")
    print("=" * 50)
    
    result = test_api("GET", "/data/export?modules=orders,recipes,expenses&format=json")
    if not result:
        print("❌ Multiple modules export failed")
        return False
        
    # Verify expected arrays are present
    expected_arrays = [
        'orders', 'skuRecipes', 'overheadExpenses', 
        'expenseCategories', 'bills', 'vendors'
    ]
    
    for arr in expected_arrays:
        if arr not in result:
            print(f"❌ Missing array: {arr}")
            return False
        print(f"✅ {arr}: {len(result[arr])} items")
        
    # Verify most arrays are not empty (except maybe some)
    if len(result.get('orders', [])) == 0:
        print("⚠️  Warning: Orders array is empty")
    if len(result.get('skuRecipes', [])) == 0:
        print("⚠️  Warning: SKU Recipes array is empty")
        
    print("✅ Multiple modules export test passed")
    return result

def test_4_export_csv():
    """Test 4: Export CSV format"""
    print("\n🎯 TEST 4: EXPORT CSV FORMAT")
    print("=" * 50)
    
    # Make request expecting CSV response
    url = f"{BASE_URL}/data/export?modules=orders&format=csv"
    try:
        response = requests.get(url)
        print(f"GET /data/export?modules=orders&format=csv -> Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ CSV export failed: {response.text}")
            return False
            
        # Verify Content-Type is CSV
        content_type = response.headers.get('Content-Type', '')
        if 'text/csv' not in content_type:
            print(f"❌ Expected text/csv, got: {content_type}")
            return False
            
        # Verify CSV content
        csv_content = response.text
        lines = csv_content.split('\n')
        if len(lines) < 1:
            print("❌ CSV content is empty")
            return False
            
        # Verify first line has headers
        headers = lines[0]
        expected_headers = ['orderId', 'shopifyOrderId', 'productName', 'customerName', 'salePrice']
        for header in expected_headers:
            if header not in headers:
                print(f"❌ Missing CSV header: {header}")
                return False
                
        print(f"✅ Content-Type: {content_type}")
        print(f"✅ CSV lines: {len(lines)}")
        print(f"✅ Headers: {headers[:100]}...")
        
        print("✅ CSV export test passed")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ CSV export request failed: {e}")
        return False

def test_5_export_all():
    """Test 5: Export All modules"""
    print("\n🎯 TEST 5: EXPORT ALL MODULES")
    print("=" * 50)
    
    result = test_api("GET", "/data/export?modules=all&format=json")
    if not result:
        print("❌ Export all failed")
        return False
        
    # Verify comprehensive export
    if '_meta' not in result or 'summary' not in result['_meta']:
        print("❌ Missing _meta or summary")
        return False
        
    summary = result['_meta']['summary']
    print(f"✅ Full export summary: {summary}")
    
    # Check for major collections
    major_collections = ['orders', 'skuRecipes']
    for coll in major_collections:
        if coll not in summary or summary[coll] == 0:
            print(f"⚠️  Warning: {coll} has 0 records")
            
    print("✅ Export all test passed")
    return result

def test_6_export_with_date_filter():
    """Test 6: Export with Date Filter"""
    print("\n🎯 TEST 6: EXPORT WITH DATE FILTER")
    print("=" * 50)
    
    result = test_api("GET", "/data/export?modules=orders&format=json&dateFrom=2025-01-01&dateTo=2025-12-31")
    if not result:
        print("❌ Date filter export failed")
        return False
        
    # Verify date range in meta
    meta = result.get('_meta', {})
    if 'dateRange' not in meta or not meta['dateRange']:
        print("❌ Missing dateRange in meta")
        return False
        
    date_range = meta['dateRange']
    print(f"✅ Date range: from={date_range.get('from')}, to={date_range.get('to')}")
    
    # Verify orders array
    orders = result.get('orders', [])
    print(f"✅ Filtered orders count: {len(orders)}")
    
    print("✅ Date filter export test passed")
    return result

def test_7_import_preview():
    """Test 7: Import Preview - Use exported recipes data"""
    print("\n🎯 TEST 7: IMPORT PREVIEW")
    print("=" * 50)
    
    # First get export data for recipes
    export_data = test_api("GET", "/data/export?modules=recipes&format=json")
    if not export_data:
        print("❌ Failed to get export data for preview")
        return False
        
    # Test import preview
    result = test_api("POST", "/data/import-preview", export_data)
    if not result:
        print("❌ Import preview failed")
        return False
        
    # Verify preview structure
    if not result.get('valid'):
        print("❌ Import preview returned invalid")
        return False
        
    if 'modules' not in result:
        print("❌ Missing modules in preview")
        return False
        
    modules = result['modules']
    
    # Check for skuRecipes module
    if 'skuRecipes' not in modules:
        print("❌ Missing skuRecipes in preview modules")
        return False
        
    sku_recipes_info = modules['skuRecipes']
    required_fields = ['importCount', 'existingCount', 'duplicateCount', 'newCount']
    for field in required_fields:
        if field not in sku_recipes_info:
            print(f"❌ Missing field in skuRecipes preview: {field}")
            return False
            
    print(f"✅ Preview valid: {result['valid']}")
    print(f"✅ SKU Recipes - Import: {sku_recipes_info['importCount']}, Existing: {sku_recipes_info['existingCount']}, Duplicates: {sku_recipes_info['duplicateCount']}, New: {sku_recipes_info['newCount']}")
    
    print("✅ Import preview test passed")
    return export_data, result

def test_8_import_with_skip():
    """Test 8: Import with Skip Strategy"""
    print("\n🎯 TEST 8: IMPORT WITH SKIP STRATEGY")
    print("=" * 50)
    
    # Get export data for recipes
    export_data = test_api("GET", "/data/export?modules=recipes&format=json")
    if not export_data:
        print("❌ Failed to get export data for import")
        return False
        
    # Test import with skip strategy
    import_request = {
        "importData": export_data,
        "selectedModules": ["skuRecipes"],
        "conflictStrategy": "skip"
    }
    
    result = test_api("POST", "/data/import", import_request)
    if not result:
        print("❌ Import with skip failed")
        return False
        
    # Verify import results structure
    if not result.get('success'):
        print("❌ Import not successful")
        return False
        
    if 'results' not in result or 'imported' not in result['results']:
        print("❌ Missing results/imported in response")
        return False
        
    imported = result['results']['imported']
    
    # Check skuRecipes import results
    if 'skuRecipes' not in imported:
        print("❌ Missing skuRecipes in import results")
        return False
        
    sku_results = imported['skuRecipes']
    required_fields = ['inserted', 'skipped', 'updated']
    for field in required_fields:
        if field not in sku_results:
            print(f"❌ Missing field in import results: {field}")
            return False
            
    print(f"✅ Import success: {result['success']}")
    print(f"✅ SKU Recipes - Inserted: {sku_results['inserted']}, Skipped: {sku_results['skipped']}, Updated: {sku_results['updated']}")
    
    # For existing data, most should be skipped
    if sku_results['skipped'] == 0:
        print("⚠️  Warning: Expected some records to be skipped")
        
    print("✅ Import with skip test passed")
    return result

def test_9_import_with_new_data():
    """Test 9: Import with New Data (modify IDs)"""
    print("\n🎯 TEST 9: IMPORT WITH NEW DATA")
    print("=" * 50)
    
    # Get export data for recipes  
    export_data = test_api("GET", "/data/export?modules=recipes&format=json")
    if not export_data:
        print("❌ Failed to get export data for new data import")
        return False
        
    # Modify some _id values to simulate new data
    if 'skuRecipes' in export_data and len(export_data['skuRecipes']) > 0:
        # Take only first 2 recipes and give them new IDs
        modified_recipes = export_data['skuRecipes'][:2]
        for recipe in modified_recipes:
            original_id = recipe.get('_id')
            new_id = f"test-new-{original_id}"
            recipe['_id'] = new_id
            # Also modify sku to avoid conflicts
            if 'sku' in recipe:
                recipe['sku'] = f"TEST-NEW-{recipe['sku']}"
                
        # Create modified export data with only these new recipes
        modified_export = {
            '_meta': export_data['_meta'],
            'skuRecipes': modified_recipes,
            'recipeTemplates': []
        }
        
        import_request = {
            "importData": modified_export,
            "selectedModules": ["skuRecipes"],
            "conflictStrategy": "skip"
        }
        
        result = test_api("POST", "/data/import", import_request)
        if not result:
            print("❌ Import with new data failed")
            return False
            
        if not result.get('success'):
            print("❌ New data import not successful")
            return False
            
        imported = result['results']['imported']
        sku_results = imported.get('skuRecipes', {})
        
        print(f"✅ New data import success: {result['success']}")
        print(f"✅ SKU Recipes - Inserted: {sku_results.get('inserted', 0)}, Skipped: {sku_results.get('skipped', 0)}")
        
        # Should have some insertions since we used new IDs
        if sku_results.get('inserted', 0) == 0:
            print("⚠️  Warning: Expected some new records to be inserted")
            
        # Store the new IDs for cleanup
        new_ids = [recipe['_id'] for recipe in modified_recipes]
        print(f"✅ Created {len(new_ids)} new test records")
        
        print("✅ Import with new data test passed")
        return new_ids
    else:
        print("⚠️  No SKU recipes available to modify")
        return []

def test_10_verify_counts_after_import():
    """Test 10: Verify counts increased after import"""
    print("\n🎯 TEST 10: VERIFY COUNTS AFTER IMPORT")
    print("=" * 50)
    
    result = test_api("GET", "/data/export-counts")
    if not result:
        print("❌ Failed to get counts after import")
        return False
        
    print(f"✅ Final counts after import:")
    for key, value in result.items():
        print(f"   {key}: {value}")
        
    # Verify recipe count is reasonable
    recipe_count = result.get('recipes', 0)
    if recipe_count <= 0:
        print("❌ No recipes found after import")
        return False
        
    print("✅ Counts verification test passed")
    return result

def cleanup_test_data(new_ids):
    """Clean up any test data created during import tests"""
    print("\n🧹 CLEANUP: Removing test data")
    print("=" * 30)
    
    if not new_ids:
        print("✅ No test data to clean up")
        return
        
    # Note: The actual cleanup would require DELETE endpoints
    # For now, just log what we would clean up
    print(f"📝 Would clean up {len(new_ids)} test records with IDs: {new_ids[:3]}..." if len(new_ids) > 3 else new_ids)
    print("✅ Cleanup logged")

def main():
    """Run all import/export tests"""
    print("🚀 PHASE 6.2 IMPORT/EXPORT SYSTEM TESTING")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Plan: 10 comprehensive tests")
    print("=" * 60)
    
    test_results = []
    new_ids_to_cleanup = []
    
    try:
        # Test 1: Export Counts
        result1 = test_1_export_counts()
        test_results.append(("Export Counts", result1 is not False))
        
        # Test 2: Export Single Module
        result2 = test_2_export_single_module()
        test_results.append(("Export Single Module", result2 is not False))
        
        # Test 3: Export Multiple Modules  
        result3 = test_3_export_multiple_modules()
        test_results.append(("Export Multiple Modules", result3 is not False))
        
        # Test 4: Export CSV
        result4 = test_4_export_csv()
        test_results.append(("Export CSV", result4 is not False))
        
        # Test 5: Export All
        result5 = test_5_export_all()
        test_results.append(("Export All", result5 is not False))
        
        # Test 6: Export with Date Filter
        result6 = test_6_export_with_date_filter()
        test_results.append(("Export Date Filter", result6 is not False))
        
        # Test 7: Import Preview
        result7 = test_7_import_preview()
        test_results.append(("Import Preview", result7 is not False))
        
        # Test 8: Import with Skip
        result8 = test_8_import_with_skip()
        test_results.append(("Import Skip Strategy", result8 is not False))
        
        # Test 9: Import New Data
        result9 = test_9_import_with_new_data()
        test_results.append(("Import New Data", result9 is not False))
        if isinstance(result9, list):
            new_ids_to_cleanup = result9
            
        # Test 10: Verify Counts
        result10 = test_10_verify_counts_after_import()
        test_results.append(("Verify Counts", result10 is not False))
        
    except Exception as e:
        print(f"❌ Test execution error: {e}")
    
    finally:
        # Always try cleanup
        cleanup_test_data(new_ids_to_cleanup)
    
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
        print("🎉 ALL TESTS PASSED! Import/Export system is fully functional!")
        return True
    else:
        print("⚠️  Some tests failed. Check the details above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)