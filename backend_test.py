#!/usr/bin/env python3
"""
Phase 6.5 - Gamification & Module Toggle System Backend Testing
Base URL: http://localhost:3000
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000"
API_KEY = "pos_test_api_key_for_testing_12345"

def test_gamification_progress():
    """Test GET /api/gamification/progress - Should return XP, level, achievements, etc."""
    print("\n🎯 TESTING GAMIFICATION PROGRESS API")
    try:
        response = requests.get(f"{BASE_URL}/api/gamification/progress")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED - Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check required fields
        required_fields = ['xp', 'level', 'nextLevel', 'progressToNext', 'unlocked', 'locked', 'unlockedCount', 'totalAchievements', 'setupChecklist']
        missing_fields = []
        
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"❌ FAILED - Missing required fields: {missing_fields}")
            return False
            
        # Validate specific requirements
        checks_passed = 0
        total_checks = 7
        
        # Check XP >= 1000
        if data.get('xp', 0) >= 1000:
            print(f"✅ XP check passed: {data['xp']} >= 1000")
            checks_passed += 1
        else:
            print(f"❌ XP check failed: {data['xp']} < 1000")
            
        # Check level name is "Champion"
        level_name = data.get('level', {}).get('name')
        if level_name == "Champion":
            print(f"✅ Level name check passed: {level_name}")
            checks_passed += 1
        else:
            print(f"❌ Level name check failed: {level_name} != 'Champion'")
            
        # Check next level is "Legend"
        next_level_name = data.get('nextLevel', {}).get('name') if data.get('nextLevel') else None
        if next_level_name == "Legend":
            print(f"✅ Next level check passed: {next_level_name}")
            checks_passed += 1
        else:
            print(f"❌ Next level check failed: {next_level_name} != 'Legend'")
            
        # Check unlocked >= 18
        unlocked_count = data.get('unlockedCount', 0)
        if unlocked_count >= 18:
            print(f"✅ Unlocked count check passed: {unlocked_count} >= 18")
            checks_passed += 1
        else:
            print(f"❌ Unlocked count check failed: {unlocked_count} < 18")
            
        # Check total achievements = 22
        total_achievements = data.get('totalAchievements', 0)
        if total_achievements == 22:
            print(f"✅ Total achievements check passed: {total_achievements} == 22")
            checks_passed += 1
        else:
            print(f"❌ Total achievements check failed: {total_achievements} != 22")
            
        # Check setup checklist has 6 items
        checklist = data.get('setupChecklist', [])
        if len(checklist) == 6:
            print(f"✅ Setup checklist length check passed: {len(checklist)} == 6")
            checks_passed += 1
        else:
            print(f"❌ Setup checklist length check failed: {len(checklist)} != 6")
            
        # Check setup checklist structure
        if checklist and all('id' in item and 'label' in item and 'desc' in item and 'completed' in item for item in checklist):
            print("✅ Setup checklist structure check passed")
            checks_passed += 1
        else:
            print("❌ Setup checklist structure check failed")
            
        print(f"\nGamification Progress API: {checks_passed}/{total_checks} checks passed")
        return checks_passed == total_checks
        
    except Exception as e:
        print(f"❌ FAILED - Exception: {str(e)}")
        return False

def test_module_settings():
    """Test Module Settings API (GET/POST /api/module-settings)"""
    print("\n🎯 TESTING MODULE SETTINGS API")
    try:
        # Test 1: GET /api/module-settings - should return 7 modules with enabled: true
        print("\n--- Test 1: GET /api/module-settings ---")
        response = requests.get(f"{BASE_URL}/api/module-settings")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ GET failed - Expected 200, got {response.status_code}")
            return False
            
        data = response.json()
        expected_modules = ['kds', 'employees', 'rto', 'inventory', 'finance', 'whatsapp', 'reports']
        
        checks_passed = 0
        total_checks = 13
        
        if len(data) == 7:
            print(f"✅ Module count check passed: {len(data)} == 7")
            checks_passed += 1
        else:
            print(f"❌ Module count check failed: {len(data)} != 7")
            
        for module_name in expected_modules:
            if module_name in data:
                module_data = data[module_name]
                if module_data.get('enabled') is True and 'label' in module_data and 'desc' in module_data:
                    print(f"✅ Module {module_name} structure check passed")
                    checks_passed += 1
                else:
                    print(f"❌ Module {module_name} structure check failed: {module_data}")
            else:
                print(f"❌ Module {module_name} missing")
        
        # Test 2: POST /api/module-settings to disable KDS
        print("\n--- Test 2: POST /api/module-settings (disable kds) ---")
        payload = {"kds": False}
        response = requests.post(f"{BASE_URL}/api/module-settings", json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ POST disable kds successful")
            checks_passed += 1
        else:
            print(f"❌ POST disable kds failed - Expected 200, got {response.status_code}")
            
        # Test 3: GET to verify KDS is disabled
        print("\n--- Test 3: GET /api/module-settings (verify kds disabled) ---")
        response = requests.get(f"{BASE_URL}/api/module-settings")
        data = response.json()
        
        if data.get('kds', {}).get('enabled') is False:
            print("✅ KDS disable verification passed")
            checks_passed += 1
        else:
            print(f"❌ KDS disable verification failed: {data.get('kds', {})}")
            
        # Test 4: POST to update multiple modules
        print("\n--- Test 4: POST /api/module-settings (update multiple) ---")
        payload = {"kds": True, "whatsapp": False}
        response = requests.post(f"{BASE_URL}/api/module-settings", json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ POST multiple updates successful")
            checks_passed += 1
        else:
            print(f"❌ POST multiple updates failed - Expected 200, got {response.status_code}")
            
        # Test 5: GET to verify multiple updates
        print("\n--- Test 5: GET /api/module-settings (verify multiple updates) ---")
        response = requests.get(f"{BASE_URL}/api/module-settings")
        data = response.json()
        
        kds_enabled = data.get('kds', {}).get('enabled')
        whatsapp_enabled = data.get('whatsapp', {}).get('enabled')
        
        if kds_enabled is True and whatsapp_enabled is False:
            print("✅ Multiple updates verification passed")
            checks_passed += 1
        else:
            print(f"❌ Multiple updates verification failed - kds: {kds_enabled}, whatsapp: {whatsapp_enabled}")
            
        # Test 6: Reset whatsapp back to enabled
        print("\n--- Test 6: POST /api/module-settings (reset whatsapp) ---")
        payload = {"whatsapp": True}
        response = requests.post(f"{BASE_URL}/api/module-settings", json=payload)
        
        if response.status_code == 200:
            print("✅ Reset whatsapp successful")
            checks_passed += 1
        else:
            print(f"❌ Reset whatsapp failed - Expected 200, got {response.status_code}")
            
        print(f"\nModule Settings API: {checks_passed}/{total_checks} checks passed")
        return checks_passed == total_checks
        
    except Exception as e:
        print(f"❌ FAILED - Exception: {str(e)}")
        return False

def test_regression_apis():
    """Test existing APIs to ensure no regression"""
    print("\n🎯 TESTING REGRESSION - EXISTING APIs")
    try:
        checks_passed = 0
        total_checks = 2
        
        # Test 1: GET /api/api-keys - should return API keys array
        print("\n--- Test 1: GET /api/api-keys ---")
        response = requests.get(f"{BASE_URL}/api/api-keys")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print(f"✅ API Keys endpoint working - returned {len(data)} keys")
                checks_passed += 1
            else:
                print(f"❌ API Keys endpoint failed - Expected array, got {type(data)}")
        else:
            print(f"❌ API Keys endpoint failed - Expected 200, got {response.status_code}")
            
        # Test 2: GET /api/v1/orders with API key - should return orders
        print("\n--- Test 2: GET /api/v1/orders?page=1&limit=1 (with API key) ---")
        headers = {"X-API-Key": API_KEY}
        response = requests.get(f"{BASE_URL}/api/v1/orders?page=1&limit=1", headers=headers)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and 'data' in data:
                print(f"✅ Orders API endpoint working with API key")
                checks_passed += 1
            else:
                print(f"❌ Orders API endpoint failed - Invalid response structure")
        else:
            print(f"❌ Orders API endpoint failed - Expected 200, got {response.status_code}")
            
        print(f"\nRegression Tests: {checks_passed}/{total_checks} checks passed")
        return checks_passed == total_checks
        
    except Exception as e:
        print(f"❌ FAILED - Exception: {str(e)}")
        return False

def main():
    """Run all tests for Phase 6.5 - Gamification & Module Toggle System"""
    print("🚀 STARTING PHASE 6.5 TESTING - Gamification & Module Toggle System")
    print(f"Base URL: {BASE_URL}")
    
    results = {
        "gamification_progress": test_gamification_progress(),
        "module_settings": test_module_settings(), 
        "regression_apis": test_regression_apis()
    }
    
    print("\n" + "="*70)
    print("📊 FINAL TEST RESULTS")
    print("="*70)
    
    total_passed = sum(results.values())
    total_tests = len(results)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name.replace('_', ' ').title()}: {status}")
        
    print(f"\nOverall Result: {total_passed}/{total_tests} test areas passed")
    
    if total_passed == total_tests:
        print("🎉 ALL TESTS PASSED! Phase 6.5 backend is working correctly.")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Check the details above.")
        sys.exit(1)

if __name__ == "__main__":
    main()