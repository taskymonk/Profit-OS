#!/usr/bin/env python3
"""
Backend Test for Branding & Theme Features
Base URL: https://settings-overhaul-5.preview.emergentagent.com/api

Tests:
1. ICON UPLOAD (POST /api/upload-icon)
2. BRANDING SETTINGS PERSISTENCE (PUT /api/tenant-config)
"""

import requests
import json
import sys

# Base URL from .env file
BASE_URL = "https://settings-overhaul-5.preview.emergentagent.com/api"

def test_icon_upload():
    """Test icon upload functionality"""
    print("🎯 TESTING ICON UPLOAD API...")
    
    # Test data: 1x1 yellow pixel PNG as base64 data URL
    test_image_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    test_file_name = "test-icon.png"
    
    try:
        # Step 1: Test successful icon upload
        print("  • Testing icon upload with valid data...")
        upload_payload = {
            "imageData": test_image_data,
            "fileName": test_file_name
        }
        
        response = requests.post(f"{BASE_URL}/upload-icon", json=upload_payload)
        print(f"    Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"    Response: {data}")
            
            # Verify response structure
            if 'icon' in data and 'message' in data:
                if data['icon'] == test_image_data:
                    print("    ✅ Icon upload successful - correct response structure and icon data match")
                else:
                    print("    ❌ Icon data in response doesn't match sent data")
                    return False
            else:
                print("    ❌ Response missing required fields (icon, message)")
                return False
        else:
            print(f"    ❌ Upload failed with status {response.status_code}: {response.text}")
            return False
            
        # Step 2: Verify persistence via GET tenant-config
        print("  • Verifying icon persistence in tenant config...")
        config_response = requests.get(f"{BASE_URL}/tenant-config")
        
        if config_response.status_code == 200:
            config_data = config_response.json()
            if config_data.get('icon') == test_image_data:
                print("    ✅ Icon correctly persisted in tenant config")
            else:
                print(f"    ❌ Icon not found in tenant config or doesn't match. Got: {config_data.get('icon', 'None')}")
                return False
        else:
            print(f"    ❌ Failed to get tenant config: {config_response.status_code}")
            return False
            
        # Step 3: Test error handling with empty payload
        print("  • Testing error handling with empty payload...")
        error_response = requests.post(f"{BASE_URL}/upload-icon", json={})
        
        if error_response.status_code == 400:
            error_data = error_response.json()
            if 'error' in error_data:
                print("    ✅ Error handling working correctly - returned 400 with error message")
            else:
                print("    ❌ Error response missing error message")
                return False
        else:
            print(f"    ❌ Expected 400 error for empty payload, got {error_response.status_code}")
            return False
            
        # Step 4: Clean up - clear the test icon
        print("  • Cleaning up test icon...")
        cleanup_payload = {"icon": ""}
        cleanup_response = requests.put(f"{BASE_URL}/tenant-config", json=cleanup_payload)
        
        if cleanup_response.status_code == 200:
            print("    ✅ Test icon cleaned up successfully")
        else:
            print(f"    ⚠️  Cleanup warning: {cleanup_response.status_code}")
            
        return True
        
    except Exception as e:
        print(f"    ❌ Exception during icon upload test: {e}")
        return False

def test_branding_settings_persistence():
    """Test branding settings persistence via tenant-config"""
    print("🎯 TESTING BRANDING SETTINGS PERSISTENCE...")
    
    try:
        # Step 1: Save original values first
        print("  • Getting original tenant config values...")
        original_response = requests.get(f"{BASE_URL}/tenant-config")
        
        if original_response.status_code != 200:
            print(f"    ❌ Failed to get original config: {original_response.status_code}")
            return False
            
        original_config = original_response.json()
        original_primary_color = original_config.get('primaryColor', '#059669')  # default from seed
        original_theme_preference = original_config.get('themePreference', 'system')  # default from seed
        
        print(f"    Original primaryColor: {original_primary_color}")
        print(f"    Original themePreference: {original_theme_preference}")
        
        # Step 2: Update branding settings
        print("  • Testing branding settings update...")
        test_settings = {
            "primaryColor": "#FF0000",
            "themePreference": "dark"
        }
        
        update_response = requests.put(f"{BASE_URL}/tenant-config", json=test_settings)
        
        if update_response.status_code == 200:
            print("    ✅ Branding settings update successful")
        else:
            print(f"    ❌ Update failed with status {update_response.status_code}: {update_response.text}")
            return False
            
        # Step 3: Verify the changes were persisted
        print("  • Verifying updated settings...")
        verify_response = requests.get(f"{BASE_URL}/tenant-config")
        
        if verify_response.status_code == 200:
            updated_config = verify_response.json()
            
            if (updated_config.get('primaryColor') == '#FF0000' and 
                updated_config.get('themePreference') == 'dark'):
                print("    ✅ Branding settings correctly persisted")
                print(f"      primaryColor: {updated_config.get('primaryColor')}")
                print(f"      themePreference: {updated_config.get('themePreference')}")
            else:
                print(f"    ❌ Settings not persisted correctly:")
                print(f"      Expected primaryColor: #FF0000, Got: {updated_config.get('primaryColor')}")
                print(f"      Expected themePreference: dark, Got: {updated_config.get('themePreference')}")
                return False
        else:
            print(f"    ❌ Failed to verify settings: {verify_response.status_code}")
            return False
            
        # Step 4: Restore original values
        print("  • Restoring original settings...")
        restore_settings = {
            "primaryColor": original_primary_color,
            "themePreference": original_theme_preference
        }
        
        restore_response = requests.put(f"{BASE_URL}/tenant-config", json=restore_settings)
        
        if restore_response.status_code == 200:
            # Verify restoration
            final_response = requests.get(f"{BASE_URL}/tenant-config")
            if final_response.status_code == 200:
                final_config = final_response.json()
                if (final_config.get('primaryColor') == original_primary_color and
                    final_config.get('themePreference') == original_theme_preference):
                    print("    ✅ Original settings restored successfully")
                else:
                    print("    ⚠️  Settings restored but values don't match exactly")
            else:
                print("    ⚠️  Could not verify restoration")
        else:
            print(f"    ⚠️  Restoration warning: {restore_response.status_code}")
            
        return True
        
    except Exception as e:
        print(f"    ❌ Exception during branding settings test: {e}")
        return False

def main():
    """Main test runner"""
    print("=" * 80)
    print("BRANDING & THEME BACKEND TESTING")
    print(f"Base URL: {BASE_URL}")
    print("=" * 80)
    
    test_results = []
    
    # Test 1: Icon Upload API
    print("\n" + "=" * 50)
    icon_result = test_icon_upload()
    test_results.append(("Icon Upload API", icon_result))
    
    # Test 2: Branding Settings Persistence
    print("\n" + "=" * 50)
    branding_result = test_branding_settings_persistence()
    test_results.append(("Branding Settings Persistence", branding_result))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL BRANDING & THEME TESTS PASSED!")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)