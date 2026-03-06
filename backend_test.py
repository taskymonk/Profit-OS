#!/usr/bin/env python3

"""
Phase 6 Sync Optimization Backend Testing
Tests all sync-related endpoints and functionality
"""

import json
import requests
import time
import pymongo
from pymongo import MongoClient

# Configuration
BASE_URL = "https://profit-calc-fixes.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def test_sync_settings_api():
    """Test Sync Settings API (GET/POST)"""
    print("\n🎯 TESTING SYNC SETTINGS API")
    
    try:
        # Test 1: GET /api/sync-settings - Should return default settings
        print("✅ Test 1: GET /api/sync-settings")
        response = requests.get(f"{BASE_URL}/sync-settings")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            settings = response.json()
            print(f"Settings keys: {list(settings.keys())}")
            
            # Verify structure
            required_keys = ['shopify', 'razorpay', 'metaAds', 'indiaPost', 'webhooks']
            for key in required_keys:
                if key in settings:
                    print(f"✅ {key} section found")
                else:
                    print(f"❌ {key} section missing")
            
            # Check scheduler info if included
            if '_scheduler' in settings:
                print(f"✅ Scheduler info included: {settings['_scheduler']}")
        else:
            print(f"❌ Failed to get sync settings: {response.text}")

        # Test 2: POST /api/sync-settings - Update settings
        print("\n✅ Test 2: POST /api/sync-settings - Enable Shopify auto-sync")
        update_payload = {
            "shopify.autoSyncEnabled": True,
            "shopify.autoSyncInterval": "1h"
        }
        response = requests.post(f"{BASE_URL}/sync-settings", json=update_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            updated_settings = response.json()
            if updated_settings.get('shopify', {}).get('autoSyncEnabled') == True:
                print("✅ Shopify auto-sync enabled successfully")
            else:
                print("❌ Shopify auto-sync not enabled")
        else:
            print(f"❌ Failed to update sync settings: {response.text}")

        # Test 3: Verify updated settings
        print("\n✅ Test 3: GET /api/sync-settings - Verify updates")
        response = requests.get(f"{BASE_URL}/sync-settings")
        if response.status_code == 200:
            settings = response.json()
            shopify_settings = settings.get('shopify', {})
            if shopify_settings.get('autoSyncEnabled') == True and shopify_settings.get('autoSyncInterval') == '1h':
                print("✅ Settings update verified")
            else:
                print(f"❌ Settings not updated correctly: {shopify_settings}")

        # Test 4: Disable auto-sync
        print("\n✅ Test 4: POST /api/sync-settings - Disable auto-sync")
        disable_payload = {
            "shopify.autoSyncEnabled": False
        }
        response = requests.post(f"{BASE_URL}/sync-settings", json=disable_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Auto-sync disabled successfully")
        else:
            print(f"❌ Failed to disable auto-sync: {response.text}")

    except Exception as e:
        print(f"❌ Sync Settings API test failed: {str(e)}")

def test_sync_status_api():
    """Test Sync Status API"""
    print("\n🎯 TESTING SYNC STATUS API")
    
    try:
        response = requests.get(f"{BASE_URL}/sync-status")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            status = response.json()
            print(f"Status response keys: {list(status.keys())}")
            
            # Check for expected structure
            if 'locks' in status:
                locks = status['locks']
                print(f"✅ Lock status found: {locks}")
                
                # Verify all integrations have lock status
                expected_integrations = ['shopify', 'razorpay', 'metaAds', 'indiaPost']
                for integration in expected_integrations:
                    if integration in locks:
                        print(f"✅ {integration} lock status: {locks[integration]}")
                    else:
                        print(f"❌ {integration} lock status missing")
            else:
                print("❌ Locks not found in status response")
            
            if 'scheduler' in status:
                scheduler = status['scheduler']
                print(f"✅ Scheduler info found: {scheduler}")
            else:
                print("❌ Scheduler info not found")
        else:
            print(f"❌ Failed to get sync status: {response.text}")

    except Exception as e:
        print(f"❌ Sync Status API test failed: {str(e)}")

def test_shopify_sync_api():
    """Test Incremental Shopify Sync"""
    print("\n🎯 TESTING SHOPIFY SYNC API")
    
    try:
        # Test 1: Incremental sync (default)
        print("✅ Test 1: POST /api/shopify/sync-orders - Incremental mode")
        response = requests.post(f"{BASE_URL}/shopify/sync-orders")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Sync result keys: {list(result.keys())}")
            
            # Check for expected fields
            expected_fields = ['message', 'synced', 'syncType']
            for field in expected_fields:
                if field in result:
                    print(f"✅ {field}: {result[field]}")
                else:
                    print(f"❌ Missing field: {field}")
            
            # Verify syncType is incremental for default mode
            if result.get('syncType') == 'incremental':
                print("✅ Incremental mode confirmed")
            else:
                print(f"❌ Expected incremental mode, got: {result.get('syncType')}")
        else:
            print(f"❌ Incremental sync failed: {response.text}")

        time.sleep(2)  # Brief wait between requests

        # Test 2: Full sync
        print("\n✅ Test 2: POST /api/shopify/sync-orders?mode=full - Full mode")
        response = requests.post(f"{BASE_URL}/shopify/sync-orders?mode=full")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('syncType') == 'full':
                print("✅ Full mode confirmed")
                print(f"Sync counts: {result.get('synced', 0)} synced, {result.get('updated', 0)} updated")
            else:
                print(f"❌ Expected full mode, got: {result.get('syncType')}")
        else:
            print(f"❌ Full sync failed: {response.text}")

    except Exception as e:
        print(f"❌ Shopify Sync API test failed: {str(e)}")

def test_razorpay_sync_api():
    """Test Incremental Razorpay Sync"""
    print("\n🎯 TESTING RAZORPAY SYNC API")
    
    try:
        # Test 1: Incremental sync (default)
        print("✅ Test 1: POST /api/razorpay/sync-payments - Incremental mode")
        response = requests.post(f"{BASE_URL}/razorpay/sync-payments")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Sync result: {result.get('message', 'No message')}")
            
            # Check for expected fields
            if 'synced' in result:
                print(f"✅ Synced count: {result['synced']}")
            if 'syncType' in result:
                print(f"✅ Sync type: {result['syncType']}")
                if result['syncType'] == 'incremental':
                    print("✅ Incremental mode confirmed")
        else:
            print(f"❌ Incremental Razorpay sync failed: {response.text}")

        time.sleep(2)

        # Test 2: Full sync
        print("\n✅ Test 2: POST /api/razorpay/sync-payments?mode=full - Full mode")
        response = requests.post(f"{BASE_URL}/razorpay/sync-payments?mode=full")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('syncType') == 'full':
                print("✅ Full mode confirmed")
                print(f"Sync result: {result.get('message', 'No message')}")
            else:
                print(f"❌ Expected full mode, got: {result.get('syncType')}")
        else:
            print(f"❌ Full Razorpay sync failed: {response.text}")

    except Exception as e:
        print(f"❌ Razorpay Sync API test failed: {str(e)}")

def test_shopify_webhook():
    """Test Shopify Webhook Endpoint"""
    print("\n🎯 TESTING SHOPIFY WEBHOOK ENDPOINT")
    
    try:
        # Test 1: Order creation webhook
        print("✅ Test 1: POST /api/webhooks/shopify - Order creation")
        
        webhook_payload = {
            "id": 9999999999,
            "order_number": "9999",
            "created_at": "2026-03-06T10:00:00Z",
            "total_price": "1500.00",
            "total_tax": "229.03",
            "total_discounts": "0.00",
            "financial_status": "paid",
            "fulfillment_status": None,
            "total_shipping_price_set": {"shop_money": {"amount": "50.00"}},
            "line_items": [
                {
                    "id": 1,
                    "title": "Test Product",
                    "sku": "TEST-WH-001",
                    "price": "1500.00",
                    "quantity": 1,
                    "variant_id": 99999
                }
            ],
            "customer": {
                "first_name": "Test",
                "last_name": "Webhook",
                "email": "test@webhook.com",
                "phone": "+919876543210"
            },
            "shipping_address": {
                "address1": "123 Test St",
                "city": "Mumbai",
                "province": "Maharashtra",
                "zip": "400001",
                "country": "India"
            }
        }
        
        headers = {
            'Content-Type': 'application/json',
            'x-shopify-topic': 'orders/create'
        }
        
        response = requests.post(f"{BASE_URL}/webhooks/shopify", 
                               json=webhook_payload, 
                               headers=headers)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Webhook result: {result}")
            
            if result.get('status') == 'ok':
                print("✅ Webhook processed successfully")
                if 'synced' in result and result['synced'] > 0:
                    print(f"✅ Order synced: {result['synced']} orders")
            else:
                print(f"❌ Webhook processing failed: {result}")
        else:
            print(f"❌ Webhook request failed: {response.text}")

        time.sleep(2)

        # Test 2: Order cancellation webhook
        print("\n✅ Test 2: POST /api/webhooks/shopify - Order cancellation")
        
        cancel_payload = {"id": 9999999999}
        headers['x-shopify-topic'] = 'orders/cancelled'
        
        response = requests.post(f"{BASE_URL}/webhooks/shopify", 
                               json=cancel_payload, 
                               headers=headers)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('status') == 'ok' and result.get('action') == 'cancelled':
                print("✅ Order cancellation webhook processed successfully")
            else:
                print(f"❌ Cancellation webhook failed: {result}")
        else:
            print(f"❌ Cancellation webhook request failed: {response.text}")

    except Exception as e:
        print(f"❌ Shopify Webhook test failed: {str(e)}")

def test_razorpay_webhook():
    """Test Razorpay Webhook Endpoint"""
    print("\n🎯 TESTING RAZORPAY WEBHOOK ENDPOINT")
    
    try:
        # Test 1: Payment captured webhook
        print("✅ Test 1: POST /api/webhooks/razorpay - Payment captured")
        
        webhook_payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_webhook_001",
                        "amount": 150000,
                        "status": "captured",
                        "contact": "+919876543210",
                        "email": "test@webhook.com",
                        "method": "upi",
                        "fee": 3540,
                        "tax": 540,
                        "settlement_id": None
                    }
                }
            }
        }
        
        response = requests.post(f"{BASE_URL}/webhooks/razorpay", json=webhook_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('status') == 'ok':
                print("✅ Payment captured webhook processed successfully")
                print(f"Result: {result}")
            else:
                print(f"❌ Payment webhook processing failed: {result}")
        else:
            print(f"❌ Payment webhook request failed: {response.text}")

        time.sleep(2)

        # Test 2: Payment failed webhook
        print("\n✅ Test 2: POST /api/webhooks/razorpay - Payment failed")
        
        failed_payload = {
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_fail_001"
                    }
                }
            }
        }
        
        response = requests.post(f"{BASE_URL}/webhooks/razorpay", json=failed_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('status') == 'ok':
                print("✅ Payment failed webhook processed successfully")
            else:
                print(f"❌ Failed payment webhook processing failed: {result}")
        else:
            print(f"❌ Failed payment webhook request failed: {response.text}")

    except Exception as e:
        print(f"❌ Razorpay Webhook test failed: {str(e)}")

def test_sync_history_api():
    """Test Sync History API"""
    print("\n🎯 TESTING SYNC HISTORY API")
    
    try:
        response = requests.get(f"{BASE_URL}/sync-history")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            history = response.json()
            
            if isinstance(history, list):
                print(f"✅ Sync history returned {len(history)} entries")
                
                # Check if we have entries from our webhook tests
                webhook_entries = [entry for entry in history if 'webhook' in entry.get('action', '')]
                if webhook_entries:
                    print(f"✅ Found {len(webhook_entries)} webhook entries in sync history")
                    
                    # Show a sample entry
                    sample = webhook_entries[0]
                    print(f"Sample entry: {sample.get('integration', 'unknown')} - {sample.get('action', 'unknown')} - {sample.get('status', 'unknown')}")
                else:
                    print("ℹ️ No webhook entries found (this is okay if webhooks weren't processed)")
                
                # Check for sync entries
                sync_entries = [entry for entry in history if 'sync' in entry.get('action', '')]
                if sync_entries:
                    print(f"✅ Found {len(sync_entries)} sync entries in history")
                else:
                    print("ℹ️ No sync entries found")
                    
            else:
                print(f"❌ Expected array, got: {type(history)}")
        else:
            print(f"❌ Failed to get sync history: {response.text}")

    except Exception as e:
        print(f"❌ Sync History API test failed: {str(e)}")

def verify_credentials_configured():
    """Verify that Shopify and Razorpay credentials are configured"""
    print("\n🎯 VERIFYING INTEGRATION CREDENTIALS")
    
    try:
        # Connect to MongoDB to check credentials
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        integrations = db.integrations.find_one({'_id': 'integrations-config'})
        
        if integrations:
            # Check Shopify
            shopify = integrations.get('shopify', {})
            if shopify.get('storeUrl') and shopify.get('accessToken'):
                print("✅ Shopify credentials are configured")
            else:
                print("❌ Shopify credentials are missing")
            
            # Check Razorpay  
            razorpay = integrations.get('razorpay', {})
            if razorpay.get('keyId') and razorpay.get('keySecret'):
                print("✅ Razorpay credentials are configured")
            else:
                print("❌ Razorpay credentials are missing")
                
            # Check webhook secrets
            print(f"ℹ️ Shopify webhook secret: {'configured' if shopify.get('webhookSecret') else 'empty (HMAC verification skipped)'}")
            print(f"ℹ️ Razorpay webhook secret: {'configured' if razorpay.get('webhookSecret') else 'empty (signature verification skipped)'}")
            
        else:
            print("❌ No integrations config found")
            
        client.close()
        
    except Exception as e:
        print(f"❌ Could not verify credentials: {str(e)}")

def main():
    """Run all Phase 6 Sync Optimization tests"""
    
    print("🚀 STARTING PHASE 6 SYNC OPTIMIZATION BACKEND TESTING")
    print("=" * 60)
    
    # Verify prerequisites
    verify_credentials_configured()
    
    # Test all sync endpoints
    test_sync_settings_api()
    test_sync_status_api()
    test_shopify_sync_api()
    test_razorpay_sync_api()
    test_shopify_webhook()
    test_razorpay_webhook()
    test_sync_history_api()
    
    print("\n" + "=" * 60)
    print("✅ PHASE 6 SYNC OPTIMIZATION TESTING COMPLETE")
    
    # Note about India Post
    print("\nℹ️ NOTE: India Post sync was not tested as it's blocked per the requirements")

if __name__ == "__main__":
    main()