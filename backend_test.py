#!/usr/bin/env python3
"""
Phase 4: WhatsApp Automation Backend API Testing
Tests all WhatsApp API endpoints as per review requirements.
Base URL: https://whatsapp-comms-next.preview.emergentagent.com/api
"""

import requests
import json
from datetime import datetime

# Base URL for the application
BASE_URL = "https://whatsapp-comms-next.preview.emergentagent.com/api"

def test_whatsapp_apis():
    """Test all WhatsApp automation backend APIs"""
    
    print("🚀 Starting Phase 4: WhatsApp Automation Backend API Testing")
    print("=" * 60)
    
    # Test results tracking
    results = []
    
    try:
        # 1. Test GET /api/whatsapp/templates - should auto-seed 5 defaults
        print("\n1️⃣ Testing GET /api/whatsapp/templates (auto-seed 5 defaults)")
        response = requests.get(f"{BASE_URL}/whatsapp/templates")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            templates = response.json()
            print(f"   Templates found: {len(templates)}")
            
            if len(templates) >= 5:
                # Verify template structure
                template = templates[0]
                required_fields = ['name', 'triggerEvent', 'body', 'enabled', 'metaApprovalStatus']
                has_required_fields = all(field in template for field in required_fields)
                
                if has_required_fields:
                    print("   ✅ Templates auto-seeded with proper structure")
                    results.append("✅ Templates CRUD (auto-seed)")
                else:
                    print("   ❌ Templates missing required fields")
                    results.append("❌ Templates CRUD (missing fields)")
            else:
                print("   ❌ Expected 5+ templates, got", len(templates))
                results.append("❌ Templates CRUD (count)")
        else:
            print(f"   ❌ Failed to get templates: {response.text}")
            results.append("❌ Templates CRUD (failed)")
        
        # Store template ID for further tests
        template_id = None
        
        # 2. Test POST /api/whatsapp/templates - create new template
        print("\n2️⃣ Testing POST /api/whatsapp/templates (create new template)")
        new_template = {
            "name": "Test Template",
            "triggerEvent": "manual", 
            "body": "Hello {customer_name}, this is a test.",
            "enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/whatsapp/templates", json=new_template)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 201 or response.status_code == 200:
            created_template = response.json()
            template_id = created_template.get('_id')
            print(f"   ✅ Template created with ID: {template_id}")
            results.append("✅ Template Creation")
        else:
            print(f"   ❌ Failed to create template: {response.text}")
            results.append("❌ Template Creation")
        
        # 3. Test PUT /api/whatsapp/templates/{id} - update template
        if template_id:
            print("\n3️⃣ Testing PUT /api/whatsapp/templates/{id} (update template)")
            update_data = {
                "name": "Updated Test Template",
                "body": "Updated body text"
            }
            
            response = requests.put(f"{BASE_URL}/whatsapp/templates/{template_id}", json=update_data)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                print("   ✅ Template updated successfully")
                results.append("✅ Template Update")
            else:
                print(f"   ❌ Failed to update template: {response.text}")
                results.append("❌ Template Update")
        
        # 4. Test DELETE /api/whatsapp-templates/{id} - delete template (note different path)
        if template_id:
            print("\n4️⃣ Testing DELETE /api/whatsapp-templates/{id} (delete template)")
            response = requests.delete(f"{BASE_URL}/whatsapp-templates/{template_id}")
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200 or response.status_code == 204:
                print("   ✅ Template deleted successfully")
                results.append("✅ Template Deletion")
            else:
                print(f"   ❌ Failed to delete template: {response.text}")
                results.append("❌ Template Deletion")
        
        # 5. Test GET /api/whatsapp/stats - dashboard stats
        print("\n5️⃣ Testing GET /api/whatsapp/stats (dashboard stats)")
        response = requests.get(f"{BASE_URL}/whatsapp/stats")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            stats = response.json()
            required_stats = ['today', 'thisWeek', 'total', 'failed', 'deliveryRate', 'readRate']
            has_required_stats = all(stat in stats for stat in required_stats)
            
            if has_required_stats:
                print("   ✅ Stats returned with proper structure")
                results.append("✅ WhatsApp Stats")
            else:
                print("   ❌ Stats missing required fields")
                results.append("❌ WhatsApp Stats (missing fields)")
        else:
            print(f"   ❌ Failed to get stats: {response.text}")
            results.append("❌ WhatsApp Stats")
        
        # 6. Test GET /api/whatsapp/messages - message log
        print("\n6️⃣ Testing GET /api/whatsapp/messages (message log)")
        response = requests.get(f"{BASE_URL}/whatsapp/messages")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            messages = response.json()
            if isinstance(messages, list):
                print(f"   ✅ Message log returned (count: {len(messages)})")
                results.append("✅ Message Log")
            else:
                print("   ❌ Expected array response")
                results.append("❌ Message Log (format)")
        else:
            print(f"   ❌ Failed to get messages: {response.text}")
            results.append("❌ Message Log")
        
        # 7. Test POST /api/whatsapp/send - should fail gracefully (EXPECTED BEHAVIOR)
        print("\n7️⃣ Testing POST /api/whatsapp/send (expected error - no credentials)")
        send_data = {
            "phone": "919876543210",
            "customMessage": "Test"
        }
        
        response = requests.post(f"{BASE_URL}/whatsapp/send", json=send_data)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 400:
            error_text = response.text
            if "WhatsApp not configured" in error_text or "inactive" in error_text:
                print("   ✅ Expected error received (no credentials configured)")
                results.append("✅ Send Message (expected error)")
            else:
                print(f"   ❌ Unexpected error message: {error_text}")
                results.append("❌ Send Message (wrong error)")
        else:
            print(f"   ❌ Expected 400 error, got {response.status_code}: {response.text}")
            results.append("❌ Send Message (wrong status)")
        
        # 8. Test POST /api/whatsapp/test-connection - should fail gracefully (EXPECTED BEHAVIOR)
        print("\n8️⃣ Testing POST /api/whatsapp/test-connection (expected error - no credentials)")
        test_data = {
            "testPhone": "919876543210"
        }
        
        response = requests.post(f"{BASE_URL}/whatsapp/test-connection", json=test_data)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 400:
            error_text = response.text
            if "WhatsApp not configured" in error_text or "inactive" in error_text:
                print("   ✅ Expected error received (no credentials configured)")
                results.append("✅ Test Connection (expected error)")
            else:
                print(f"   ❌ Unexpected error message: {error_text}")
                results.append("❌ Test Connection (wrong error)")
        else:
            print(f"   ❌ Expected 400 error, got {response.status_code}: {response.text}")
            results.append("❌ Test Connection (wrong status)")
        
        # 9. Test GET /api/whatsapp/opt-outs - opt-out list
        print("\n9️⃣ Testing GET /api/whatsapp/opt-outs (opt-out list)")
        response = requests.get(f"{BASE_URL}/whatsapp/opt-outs")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            opt_outs = response.json()
            if isinstance(opt_outs, list):
                print(f"   ✅ Opt-out list returned (count: {len(opt_outs)})")
                results.append("✅ Opt-outs GET")
            else:
                print("   ❌ Expected array response")
                results.append("❌ Opt-outs GET (format)")
        else:
            print(f"   ❌ Failed to get opt-outs: {response.text}")
            results.append("❌ Opt-outs GET")
        
        # 10. Test POST /api/whatsapp/opt-outs - add opt-out
        print("\n🔟 Testing POST /api/whatsapp/opt-outs (add opt-out)")
        opt_out_data = {
            "phone": "919876543210",
            "reason": "test"
        }
        
        response = requests.post(f"{BASE_URL}/whatsapp/opt-outs", json=opt_out_data)
        print(f"   Status: {response.status_code}")
        
        opt_out_id = None
        if response.status_code == 201 or response.status_code == 200:
            opt_out = response.json()
            opt_out_id = opt_out.get('_id')
            print(f"   ✅ Opt-out added with ID: {opt_out_id}")
            results.append("✅ Opt-outs POST")
        else:
            print(f"   ❌ Failed to add opt-out: {response.text}")
            results.append("❌ Opt-outs POST")
        
        # 11. Test PUT /api/whatsapp/opt-outs/{id} - remove opt-out (re-opt-in)
        if opt_out_id:
            print("\n1️⃣1️⃣ Testing PUT /api/whatsapp/opt-outs/{id} (re-opt-in)")
            response = requests.put(f"{BASE_URL}/whatsapp/opt-outs/{opt_out_id}")
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                print("   ✅ Re-opt-in successful")
                results.append("✅ Opt-outs PUT (re-opt-in)")
            else:
                print(f"   ❌ Failed to re-opt-in: {response.text}")
                results.append("❌ Opt-outs PUT")
        
        # 12. Test webhook verification with wrong token
        print("\n1️⃣2️⃣ Testing GET /api/webhooks/whatsapp (webhook verification)")
        verify_params = {
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "test123"
        }
        
        response = requests.get(f"{BASE_URL}/webhooks/whatsapp", params=verify_params)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 403:
            print("   ✅ Webhook verification failed as expected (wrong token)")
            results.append("✅ Webhook Verification")
        else:
            print(f"   ❌ Expected 403, got {response.status_code}: {response.text}")
            results.append("❌ Webhook Verification")
        
        # 13. Test POST /api/webhooks/whatsapp - webhook event processing
        print("\n1️⃣3️⃣ Testing POST /api/webhooks/whatsapp (webhook events)")
        webhook_data = {
            "entry": [{
                "changes": [{
                    "value": {
                        "statuses": [{
                            "id": "test-msg-id",
                            "status": "delivered",
                            "timestamp": "1709596800"
                        }]
                    }
                }]
            }]
        }
        
        response = requests.post(f"{BASE_URL}/webhooks/whatsapp", json=webhook_data)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('status') == 'ok':
                print("   ✅ Webhook event processed successfully")
                results.append("✅ Webhook Events")
            else:
                print(f"   ❌ Unexpected response: {result}")
                results.append("❌ Webhook Events (response)")
        else:
            print(f"   ❌ Failed to process webhook: {response.text}")
            results.append("❌ Webhook Events")
        
        # 14. Test POST /api/whatsapp/retry - retry failed messages
        print("\n1️⃣4️⃣ Testing POST /api/whatsapp/retry (retry failed)")
        retry_data = {
            "limit": 5
        }
        
        response = requests.post(f"{BASE_URL}/whatsapp/retry", json=retry_data)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            retry_result = response.json()
            if 'retried' in retry_result and 'total' in retry_result:
                print(f"   ✅ Retry response: retried={retry_result.get('retried', 0)}, total={retry_result.get('total', 0)}")
                results.append("✅ Retry Failed Messages")
            else:
                print(f"   ❌ Missing fields in response: {retry_result}")
                results.append("❌ Retry Failed Messages (fields)")
        else:
            print(f"   ❌ Failed to retry messages: {response.text}")
            results.append("❌ Retry Failed Messages")
        
        # 15. Test integrations save with WhatsApp config
        print("\n1️⃣5️⃣ Testing PUT /api/integrations (WhatsApp config save)")
        whatsapp_config = {
            "whatsapp": {
                "phoneNumberId": "test123",
                "businessAccountId": "test456", 
                "accessToken": "testtoken",
                "webhookVerifyToken": "myverify",
                "active": False
            }
        }
        
        # First save the config
        response = requests.put(f"{BASE_URL}/integrations", json=whatsapp_config)
        print(f"   PUT Status: {response.status_code}")
        
        if response.status_code == 200:
            # Now verify it's saved and accessToken is masked
            response = requests.get(f"{BASE_URL}/integrations")
            print(f"   GET Status: {response.status_code}")
            
            if response.status_code == 200:
                integrations = response.json()
                whatsapp = integrations.get('whatsapp', {})
                
                if whatsapp.get('phoneNumberId') == 'test123':
                    # Check if accessToken is masked
                    access_token = whatsapp.get('accessToken', '')
                    if '*' in access_token:
                        print("   ✅ WhatsApp integration saved with token masking")
                        results.append("✅ Integration Save & Masking")
                    else:
                        print("   ⚠️ Integration saved but token not masked")
                        results.append("⚠️ Integration Save (no masking)")
                else:
                    print("   ❌ WhatsApp config not saved properly")
                    results.append("❌ Integration Save")
            else:
                print(f"   ❌ Failed to verify integration: {response.text}")
                results.append("❌ Integration Verification")
        else:
            print(f"   ❌ Failed to save integration: {response.text}")
            results.append("❌ Integration Save")
        
    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        results.append("❌ Test execution failed")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 PHASE 4 WHATSAPP AUTOMATION TEST RESULTS")
    print("=" * 60)
    
    passed = len([r for r in results if r.startswith("✅")])
    total = len(results)
    
    for result in results:
        print(f"   {result}")
    
    print(f"\n🎯 SUMMARY: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL WHATSAPP AUTOMATION APIs WORKING!")
    else:
        print("⚠️ Some tests failed - review above for details")
    
    print("\n📝 IMPORTANT NOTES:")
    print("   • Send/Test-Connection errors are EXPECTED (no credentials configured)")
    print("   • Templates should auto-seed 5 defaults on first GET")
    print("   • Integration masking protects sensitive tokens")

if __name__ == "__main__":
    test_whatsapp_apis()