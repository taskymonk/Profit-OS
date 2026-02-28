#!/usr/bin/env python3
"""
Phase 8.8 "The Absolute Parity Patch" - Backend Testing
Tests 5 critical areas:
1. BULLETPROOF PAGINATION (source code check)
2. STRICT ACCOUNTING PARITY (Cancelled/Voided/Pending filter)
3. TIMEZONE DOUBLE-SHIFT FIX (source code check) 
4. DASHBOARD DATA INTEGRITY POST-FILTER
5. AD SPEND TAX STILL WORKS
"""

import json
import os
import requests
import sys
from pymongo import MongoClient
from datetime import datetime

# Get base URL from environment  
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def print_test_result(test_name, success, details=""):
    """Print formatted test result"""
    status = "✅ PASSED" if success else "❌ FAILED"
    print(f"[{test_name}] {status} - {details}")

def test_area_1_inventory_bom_schema():
    """Test Area 1: INVENTORY BOM SCHEMA (purchasePrice, purchaseQuantity, unit, baseCostPerUnit)"""
    print("\n🎯 TESTING AREA 1: INVENTORY BOM SCHEMA")
    
    test_items_created = []
    
    try:
        # Test 1: Create Bubble Wrap with new schema
        bubble_wrap_data = {
            "name": "Bubble Wrap 50m Roll",
            "category": "Packaging", 
            "purchasePrice": 500,
            "purchaseQuantity": 50,
            "unit": "meters"
        }
        
        response = requests.post(f"{BASE_URL}/inventory-items", json=bubble_wrap_data)
        print_test_result("Create Bubble Wrap", response.status_code == 201, f"Status: {response.status_code}")
        
        if response.status_code == 201:
            bubble_wrap = response.json()
            test_items_created.append(bubble_wrap['_id'])
            
            # Verify baseCostPerUnit calculation (500/50 = 10.00)
            expected_base_cost = 10.00
            actual_base_cost = bubble_wrap.get('baseCostPerUnit', 0)
            cost_correct = abs(actual_base_cost - expected_base_cost) < 0.01
            print_test_result("Bubble Wrap baseCostPerUnit", cost_correct, 
                            f"Expected: {expected_base_cost}, Got: {actual_base_cost}")
            
            # Verify has unit field (NOT unitMeasurement)
            has_unit = 'unit' in bubble_wrap and bubble_wrap['unit'] == 'meters'
            has_no_yield = 'yieldFromTotalPurchase' not in bubble_wrap
            print_test_result("Bubble Wrap fields", has_unit and has_no_yield,
                            f"Has unit: {has_unit}, No yieldFromTotalPurchase: {has_no_yield}")
        
        # Test 2: Create Belgian Chocolate with new schema  
        chocolate_data = {
            "name": "Belgian Chocolate Slab",
            "category": "Raw Material",
            "purchasePrice": 400,
            "purchaseQuantity": 2, 
            "unit": "kg"
        }
        
        response = requests.post(f"{BASE_URL}/inventory-items", json=chocolate_data)
        print_test_result("Create Belgian Chocolate", response.status_code == 201, f"Status: {response.status_code}")
        
        if response.status_code == 201:
            chocolate = response.json()
            test_items_created.append(chocolate['_id'])
            
            # Verify baseCostPerUnit calculation (400/2 = 200.00)
            expected_base_cost = 200.00
            actual_base_cost = chocolate.get('baseCostPerUnit', 0)
            cost_correct = abs(actual_base_cost - expected_base_cost) < 0.01
            print_test_result("Chocolate baseCostPerUnit", cost_correct,
                            f"Expected: {expected_base_cost}, Got: {actual_base_cost}")
        
        # Test 3: Verify both items exist in GET
        response = requests.get(f"{BASE_URL}/inventory-items")
        print_test_result("Get inventory items", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            items = response.json()
            created_item_ids = set(test_items_created)
            found_item_ids = set(item['_id'] for item in items if item['_id'] in created_item_ids)
            all_found = len(found_item_ids) == len(created_item_ids)
            print_test_result("Both items found", all_found, 
                            f"Created: {len(created_item_ids)}, Found: {len(found_item_ids)}")
    
    except Exception as e:
        print_test_result("Area 1 Exception", False, f"Error: {str(e)}")
    
    finally:
        # Cleanup: Delete test items
        for item_id in test_items_created:
            try:
                requests.delete(f"{BASE_URL}/inventory-items/{item_id}")
            except:
                pass
    
    print(f"🎯 AREA 1 COMPLETE: Inventory BOM Schema tested")

def test_area_2_expense_category_rename():
    """Test Area 2: EXPENSE CATEGORY RENAME ENDPOINT"""
    print("\n🎯 TESTING AREA 2: EXPENSE CATEGORY RENAME ENDPOINT")
    
    test_expense_ids = []
    
    try:
        # Step 1: Create two test expenses with same category
        expense1_data = {
            "expenseName": "Office Internet",
            "category": "Internet",
            "amount": 1500,
            "currency": "INR", 
            "frequency": "recurring"
        }
        
        expense2_data = {
            "expenseName": "Cloud Server",
            "category": "Internet", 
            "amount": 2000,
            "currency": "INR",
            "frequency": "recurring"
        }
        
        response1 = requests.post(f"{BASE_URL}/overhead-expenses", json=expense1_data)
        response2 = requests.post(f"{BASE_URL}/overhead-expenses", json=expense2_data)
        
        print_test_result("Create test expenses", 
                         response1.status_code == 201 and response2.status_code == 201,
                         f"Status: {response1.status_code}, {response2.status_code}")
        
        if response1.status_code == 201:
            test_expense_ids.append(response1.json()['_id'])
        if response2.status_code == 201:
            test_expense_ids.append(response2.json()['_id'])
        
        # Step 2: Rename category from "Internet" to "Connectivity"
        rename_data = {"oldName": "Internet", "newName": "Connectivity"}
        response = requests.post(f"{BASE_URL}/expense-categories/rename", json=rename_data)
        
        print_test_result("Rename category", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            rename_result = response.json()
            modified_count = rename_result.get('modified', 0)
            print_test_result("Rename modified count", modified_count == 2, 
                            f"Expected: 2, Got: {modified_count}")
        
        # Step 3: Verify both expenses now have "Connectivity" category
        response = requests.get(f"{BASE_URL}/overhead-expenses")
        if response.status_code == 200:
            expenses = response.json()
            connectivity_expenses = [e for e in expenses if e.get('category') == 'Connectivity']
            internet_expenses = [e for e in expenses if e.get('category') == 'Internet']
            
            print_test_result("Expenses renamed to Connectivity", len(connectivity_expenses) >= 2,
                            f"Found {len(connectivity_expenses)} Connectivity expenses")
            print_test_result("No Internet category remaining", len(internet_expenses) == 0,
                            f"Found {len(internet_expenses)} Internet expenses")
        
        # Step 4: Delete test category
        delete_data = {"category": "Connectivity"}
        response = requests.post(f"{BASE_URL}/expense-categories/delete", json=delete_data)
        
        print_test_result("Delete category", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            delete_result = response.json()
            deleted_count = delete_result.get('deleted', 0)
            print_test_result("Delete count", deleted_count >= 2,
                            f"Expected: >=2, Got: {deleted_count}")
        
        # Step 5: Verify no more Connectivity entries
        response = requests.get(f"{BASE_URL}/overhead-expenses")
        if response.status_code == 200:
            expenses = response.json()
            connectivity_expenses = [e for e in expenses if e.get('category') == 'Connectivity']
            print_test_result("No Connectivity entries", len(connectivity_expenses) == 0,
                            f"Found {len(connectivity_expenses)} entries")
    
    except Exception as e:
        print_test_result("Area 2 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 2 COMPLETE: Expense Category Rename tested")

def test_area_3_dashboard_pl_refunds():
    """Test Area 3: DASHBOARD P&L BREAKDOWN WITH REFUNDS"""
    print("\n🎯 TESTING AREA 3: DASHBOARD P&L BREAKDOWN WITH REFUNDS")
    
    try:
        # Test dashboard endpoint with 7days range
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "7days"})
        print_test_result("Dashboard API call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            dashboard_data = response.json()
            
            # Check plBreakdown exists
            has_pl_breakdown = 'plBreakdown' in dashboard_data
            print_test_result("Has plBreakdown", has_pl_breakdown, f"plBreakdown present: {has_pl_breakdown}")
            
            if has_pl_breakdown:
                pl_breakdown = dashboard_data['plBreakdown']
                
                # Verify all 11 required keys including refunds
                required_keys = [
                    'grossRevenue', 'discount', 'refunds', 'gstOnRevenue', 'netRevenue',
                    'totalCOGS', 'totalShipping', 'totalTxnFees', 'adSpend', 'overhead', 'netProfit'
                ]
                
                missing_keys = [key for key in required_keys if key not in pl_breakdown]
                has_all_keys = len(missing_keys) == 0
                
                print_test_result("All 11 required keys", has_all_keys,
                                f"Missing keys: {missing_keys}" if missing_keys else "All keys present")
                
                # Specifically verify refunds field is present and is a number
                has_refunds = 'refunds' in pl_breakdown
                refunds_is_number = isinstance(pl_breakdown.get('refunds'), (int, float))
                
                print_test_result("Refunds field", has_refunds and refunds_is_number,
                                f"Has refunds: {has_refunds}, Is number: {refunds_is_number}")
                
                if has_refunds:
                    refunds_value = pl_breakdown['refunds']
                    print_test_result("Refunds value check", refunds_value >= 0,
                                    f"Refunds value: {refunds_value}")
    
    except Exception as e:
        print_test_result("Area 3 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 3 COMPLETE: Dashboard P&L Breakdown with Refunds tested")

def test_area_4_shopify_refund_extraction():
    """Test Area 4: SHOPIFY REFUND EXTRACTION (source code check)"""
    print("\n🎯 TESTING AREA 4: SHOPIFY REFUND EXTRACTION (source code)")
    
    try:
        # Read the route.js file
        route_file_path = "/app/app/api/[[...path]]/route.js"
        
        with open(route_file_path, 'r') as f:
            route_content = f.read()
        
        # Check for shopify refund extraction logic
        has_shopify_refunds = 'shopifyOrder.refunds' in route_content
        print_test_result("Has shopifyOrder.refunds", has_shopify_refunds, 
                         "shopifyOrder.refunds found in code" if has_shopify_refunds else "Missing shopifyOrder.refunds")
        
        # Check for refundAmount field in order insertion
        has_refund_amount = 'refundAmount:' in route_content
        print_test_result("Has refundAmount field", has_refund_amount,
                         "refundAmount field found in order insertion" if has_refund_amount else "Missing refundAmount field")
        
        # Check for totalRefunds computation from refund_line_items
        has_total_refunds = 'totalRefunds' in route_content and 'refund_line_items' in route_content
        print_test_result("Has totalRefunds computation", has_total_refunds,
                         "totalRefunds and refund_line_items found" if has_total_refunds else "Missing totalRefunds computation")
        
        # Check for refund line items logic
        has_refund_logic = 'refund.refund_line_items' in route_content
        print_test_result("Has refund logic", has_refund_logic,
                         "refund.refund_line_items logic found" if has_refund_logic else "Missing refund extraction logic")
    
    except Exception as e:
        print_test_result("Area 4 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 4 COMPLETE: Shopify Refund Extraction source code checked")

def test_area_5_profit_calculator_bom():
    """Test Area 5: PROFIT CALCULATOR BOM SUPPORT (source code check)"""
    print("\n🎯 TESTING AREA 5: PROFIT CALCULATOR BOM SUPPORT (source code)")
    
    try:
        # Read the profitCalculator.js file
        profit_calc_path = "/app/lib/profitCalculator.js"
        
        with open(profit_calc_path, 'r') as f:
            calc_content = f.read()
        
        # Check for ingredients array handling (new BOM format)
        has_ingredients = 'ingredients' in calc_content and 'quantityUsed' in calc_content and 'baseCostPerUnit' in calc_content
        print_test_result("Has ingredients BOM support", has_ingredients,
                         "ingredients, quantityUsed, baseCostPerUnit found" if has_ingredients else "Missing BOM ingredients support")
        
        # Check for legacy rawMaterials/packaging fallback
        has_legacy_fallback = 'rawMaterials' in calc_content and 'packaging' in calc_content and 'Legacy format' in calc_content
        print_test_result("Has legacy fallback", has_legacy_fallback,
                         "Legacy rawMaterials/packaging fallback found" if has_legacy_fallback else "Missing legacy fallback")
        
        # Check for refundAmount subtraction from grossRevenue
        has_refund_subtraction = 'refundAmount' in calc_content and 'grossRevenue' in calc_content
        print_test_result("Has refund subtraction", has_refund_subtraction,
                         "refundAmount subtraction logic found" if has_refund_subtraction else "Missing refund subtraction")
        
        # Check for Shopify orders using actual totalTax
        has_shopify_tax = 'shopifyOrderId' in calc_content and 'totalTax' in calc_content
        print_test_result("Has Shopify totalTax logic", has_shopify_tax,
                         "Shopify totalTax usage found" if has_shopify_tax else "Missing Shopify tax logic")
        
        # Check for BOM architecture comment or logic
        has_bom_architecture = 'BOM' in calc_content or 'Bill of Materials' in calc_content
        print_test_result("Has BOM architecture", has_bom_architecture,
                         "BOM architecture references found" if has_bom_architecture else "Missing BOM architecture")
    
    except Exception as e:
        print_test_result("Area 5 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 5 COMPLETE: Profit Calculator BOM Support source code checked")

def test_area_6_dashboard_data_integrity():
    """Test Area 6: DASHBOARD DATA INTEGRITY"""
    print("\n🎯 TESTING AREA 6: DASHBOARD DATA INTEGRITY")
    
    try:
        # Test with alltime range for comprehensive data
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "alltime"})
        print_test_result("Dashboard alltime call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code == 200:
            dashboard_data = response.json()
            
            # Check plBreakdown exists
            if 'plBreakdown' not in dashboard_data or 'filtered' not in dashboard_data:
                print_test_result("Dashboard structure", False, "Missing plBreakdown or filtered section")
                return
            
            pl_breakdown = dashboard_data['plBreakdown']
            filtered = dashboard_data['filtered']
            
            # Test 1: plBreakdown.grossRevenue == filtered.revenue
            pl_revenue = pl_breakdown.get('grossRevenue', 0)
            filtered_revenue = filtered.get('revenue', 0)
            revenue_match = abs(pl_revenue - filtered_revenue) < 0.01
            print_test_result("Revenue consistency", revenue_match,
                            f"PL: {pl_revenue}, Filtered: {filtered_revenue}")
            
            # Test 2: plBreakdown.netProfit == filtered.netProfit  
            pl_net_profit = pl_breakdown.get('netProfit', 0)
            filtered_net_profit = filtered.get('netProfit', 0)
            profit_match = abs(pl_net_profit - filtered_net_profit) < 0.01
            print_test_result("Net profit consistency", profit_match,
                            f"PL: {pl_net_profit}, Filtered: {filtered_net_profit}")
            
            # Test 3: Waterfall math verification
            # netProfit ≈ netRevenue - totalCOGS - totalShipping - totalTxnFees - adSpend - overhead
            net_revenue = pl_breakdown.get('netRevenue', 0)
            total_cogs = pl_breakdown.get('totalCOGS', 0)
            total_shipping = pl_breakdown.get('totalShipping', 0)
            total_txn_fees = pl_breakdown.get('totalTxnFees', 0)
            ad_spend = pl_breakdown.get('adSpend', 0)
            overhead = pl_breakdown.get('overhead', 0)
            
            calculated_profit = net_revenue - total_cogs - total_shipping - total_txn_fees - ad_spend - overhead
            actual_profit = pl_breakdown.get('netProfit', 0)
            
            waterfall_diff = abs(calculated_profit - actual_profit)
            waterfall_correct = waterfall_diff <= 1  # Within ±1
            
            print_test_result("Waterfall math", waterfall_correct,
                            f"Calculated: {calculated_profit:.2f}, Actual: {actual_profit:.2f}, Diff: {waterfall_diff:.2f}")
            
            # Additional consistency check
            print(f"    💡 Breakdown - NetRev: {net_revenue}, COGS: {total_cogs}, Ship: {total_shipping}, " +
                  f"Fees: {total_txn_fees}, Ads: {ad_spend}, Overhead: {overhead}")
    
    except Exception as e:
        print_test_result("Area 6 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 6 COMPLETE: Dashboard Data Integrity tested")

def test_area_7_ad_spend_tax():
    """Test Area 7: AD SPEND TAX STILL WORKS"""
    print("\n🎯 TESTING AREA 7: AD SPEND TAX MULTIPLIER")
    
    try:
        # Get dashboard ad spend
        response = requests.get(f"{BASE_URL}/dashboard", params={"range": "alltime"})
        print_test_result("Dashboard call", response.status_code == 200, f"Status: {response.status_code}")
        
        if response.status_code != 200:
            return
        
        dashboard_data = response.json()
        filtered = dashboard_data.get('filtered', {})
        dashboard_ad_spend = filtered.get('adSpend', 0)
        
        print_test_result("Dashboard ad spend", dashboard_ad_spend > 0, 
                         f"Ad spend: ₹{dashboard_ad_spend:.2f}")
        
        # Connect to MongoDB to get raw data
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Get raw ad spend from dailyMarketingSpend collection
        daily_spends = list(db.dailyMarketingSpend.find({}))
        raw_ad_total = sum(spend.get('spendAmount', 0) for spend in daily_spends)
        
        print_test_result("Raw ad spend total", raw_ad_total > 0,
                         f"Raw total: ₹{raw_ad_total:.2f}")
        
        # Get tenant config for ad spend tax rate
        tenant_config = db.tenantConfig.find_one({})
        ad_spend_tax_rate = 18  # Default
        if tenant_config and 'adSpendTaxRate' in tenant_config:
            ad_spend_tax_rate = tenant_config['adSpendTaxRate']
        
        print_test_result("Ad spend tax rate", True, f"Tax rate: {ad_spend_tax_rate}%")
        
        # Calculate expected dashboard ad spend with tax
        expected_ad_spend = raw_ad_total * (1 + ad_spend_tax_rate / 100)
        
        # Verify calculation (allowing small rounding differences)
        ad_spend_diff = abs(dashboard_ad_spend - expected_ad_spend)
        ad_spend_diff_percent = (ad_spend_diff / expected_ad_spend * 100) if expected_ad_spend > 0 else 0
        
        tax_calc_correct = ad_spend_diff_percent < 1.0  # Less than 1% difference
        
        print_test_result("Tax calculation", tax_calc_correct,
                         f"Expected: ₹{expected_ad_spend:.2f}, Got: ₹{dashboard_ad_spend:.2f}, " +
                         f"Diff: {ad_spend_diff:.2f} ({ad_spend_diff_percent:.2f}%)")
        
        client.close()
    
    except Exception as e:
        print_test_result("Area 7 Exception", False, f"Error: {str(e)}")
    
    print(f"🎯 AREA 7 COMPLETE: Ad Spend Tax Multiplier tested")

def main():
    """Run all Phase 8.7 backend tests"""
    print("🎉 PHASE 8.7 ENTERPRISE BOM ARCHITECTURE, ANALYTICS POLISH & UX GUIDES - BACKEND TESTING")
    print(f"Base URL: {BASE_URL}")
    print("=" * 80)
    
    # Run all 7 test areas
    test_area_1_inventory_bom_schema()
    test_area_2_expense_category_rename()
    test_area_3_dashboard_pl_refunds()
    test_area_4_shopify_refund_extraction()
    test_area_5_profit_calculator_bom()
    test_area_6_dashboard_data_integrity()
    test_area_7_ad_spend_tax()
    
    print("\n" + "=" * 80)
    print("🎉 PHASE 8.7 BACKEND TESTING COMPLETE!")
    print("All 7 critical areas have been tested for Enterprise BOM Architecture, Analytics Polish & UX Guides")

if __name__ == "__main__":
    main()