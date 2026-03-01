#!/usr/bin/env python3
"""
Phase 8.9 "Absolute Financial Parity & Date Picker UX Polish" Backend Testing
Testing 5 critical areas:
1. PROPORTIONAL REVENUE ALLOCATION (source code check)
2. STRICT FINANCIAL STATUS FILTERING (source code check)  
3. DASHBOARD DATA INTEGRITY
4. DATE PICKER UX (source code check)
5. AD SPEND TAX
"""

import asyncio
import aiohttp
import sys
import os
import re
import json
import pymongo
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "http://localhost:3000/api"

class Phase89Tester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = None
        self.mongo_client = None
        self.db = None
        self.results = {
            'proportional_revenue_allocation': {'passed': 0, 'total': 5, 'details': []},
            'strict_financial_status_filtering': {'passed': 0, 'total': 8, 'details': []},
            'dashboard_data_integrity': {'passed': 0, 'total': 5, 'details': []},
            'date_picker_ux': {'passed': 0, 'total': 4, 'details': []},
            'ad_spend_tax': {'passed': 0, 'total': 3, 'details': []}
        }

    async def setup(self):
        """Initialize HTTP session and MongoDB connection"""
        try:
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
            # MongoDB connection
            self.mongo_client = pymongo.MongoClient("mongodb://localhost:27017")
            self.db = self.mongo_client["profitos"]
            print("✅ Setup complete: HTTP session and MongoDB connection established")
            return True
        except Exception as e:
            print(f"❌ Setup failed: {e}")
            return False

    async def cleanup(self):
        """Close connections"""
        if self.session:
            await self.session.close()
        if self.mongo_client:
            self.mongo_client.close()
        print("✅ Cleanup complete")

    def log_test(self, category, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {status}: {test_name}" + (f" - {details}" if details else ""))
        
        self.results[category]['details'].append({
            'test': test_name,
            'passed': passed,
            'details': details
        })
        if passed:
            self.results[category]['passed'] += 1

    async def test_proportional_revenue_allocation(self):
        """Test 1: PROPORTIONAL REVENUE ALLOCATION (source code check)"""
        print("\n🎯 TEST 1: PROPORTIONAL REVENUE ALLOCATION (SOURCE CODE)")
        
        try:
            # Read the route.js file
            with open('/app/app/api/[[...path]]/route.js', 'r') as f:
                route_content = f.read()

            # Test 1: Check for finalOrderPrice calculation
            if 'finalOrderPrice = parseFloat(shopifyOrder.total_price)' in route_content:
                self.log_test('proportional_revenue_allocation', 'finalOrderPrice calculation found', True)
            else:
                self.log_test('proportional_revenue_allocation', 'finalOrderPrice calculation missing', False)

            # Test 2: Check for rawSubtotal computation via reduce
            rawsubtotal_pattern = r'rawSubtotal.*=.*\.reduce\('
            if re.search(rawsubtotal_pattern, route_content, re.DOTALL):
                self.log_test('proportional_revenue_allocation', 'rawSubtotal reduce calculation found', True)
            else:
                self.log_test('proportional_revenue_allocation', 'rawSubtotal reduce calculation missing', False)

            # Test 3: Check for priceRatio calculation
            priceratio_pattern = r'priceRatio.*=.*lineItemRaw.*\/.*rawSubtotal'
            if re.search(priceratio_pattern, route_content, re.DOTALL):
                self.log_test('proportional_revenue_allocation', 'priceRatio calculation found', True)
            else:
                self.log_test('proportional_revenue_allocation', 'priceRatio calculation missing', False)

            # Test 4: Check for salePrice using finalOrderPrice * priceRatio
            saleprice_pattern = r'salePrice.*=.*finalOrderPrice.*\*.*priceRatio'
            if re.search(saleprice_pattern, route_content, re.DOTALL):
                self.log_test('proportional_revenue_allocation', 'salePrice proportional allocation found', True)
            else:
                self.log_test('proportional_revenue_allocation', 'salePrice proportional allocation missing', False)

            # Test 5: Check for financialStatus field mapping
            if 'financialStatus' in route_content and 'shopifyOrder.financial_status' in route_content:
                self.log_test('proportional_revenue_allocation', 'financialStatus field mapping found', True)
            else:
                self.log_test('proportional_revenue_allocation', 'financialStatus field mapping missing', False)

        except Exception as e:
            self.log_test('proportional_revenue_allocation', 'Source code check failed', False, str(e))

    async def test_strict_financial_status_filtering(self):
        """Test 2: STRICT FINANCIAL STATUS FILTERING (source code check)"""
        print("\n🎯 TEST 2: STRICT FINANCIAL STATUS FILTERING (SOURCE CODE)")
        
        try:
            # Read the profitCalculator.js file
            with open('/app/lib/profitCalculator.js', 'r') as f:
                calc_content = f.read()

            # Test 1: Check for EXCLUDED_FINANCIAL array
            if "EXCLUDED_FINANCIAL = ['pending', 'voided', 'refunded']" in calc_content:
                self.log_test('strict_financial_status_filtering', 'EXCLUDED_FINANCIAL array found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'EXCLUDED_FINANCIAL array missing', False)

            # Test 2: Check for EXCLUDED_STATUSES array
            if "EXCLUDED_STATUSES = ['Cancelled', 'Voided', 'Pending']" in calc_content:
                self.log_test('strict_financial_status_filtering', 'EXCLUDED_STATUSES array found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'EXCLUDED_STATUSES array missing', False)

            # Test 3: Check for accountingOrders filtering by both status and financialStatus
            accounting_pattern = r'accountingOrders.*=.*filteredOrders\.filter.*EXCLUDED_STATUSES.*EXCLUDED_FINANCIAL'
            if re.search(accounting_pattern, calc_content, re.DOTALL):
                self.log_test('strict_financial_status_filtering', 'accountingOrders dual filtering found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'accountingOrders dual filtering missing', False)

            # Test 4: Check totalOrders uses accountingOrders.length
            if 'totalOrders = accountingOrders.length' in calc_content:
                self.log_test('strict_financial_status_filtering', 'totalOrders from accountingOrders found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'totalOrders from accountingOrders missing', False)

            # Test 5: Check totalRevenue sums accountingOrders
            revenue_pattern = r'totalRevenue.*=.*accountingOrders\.reduce'
            if re.search(revenue_pattern, calc_content, re.DOTALL):
                self.log_test('strict_financial_status_filtering', 'totalRevenue from accountingOrders found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'totalRevenue from accountingOrders missing', False)

            # Test 6: Check grossOrderProfits maps over accountingOrders
            gross_pattern = r'grossOrderProfits.*=.*accountingOrders\.map'
            if re.search(gross_pattern, calc_content, re.DOTALL):
                self.log_test('strict_financial_status_filtering', 'grossOrderProfits from accountingOrders found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'grossOrderProfits from accountingOrders missing', False)

            # Test 7: Check orderProfits maps over filteredOrders (for table display)
            order_pattern = r'orderProfits.*=.*filteredOrders\.map'
            if re.search(order_pattern, calc_content, re.DOTALL):
                self.log_test('strict_financial_status_filtering', 'orderProfits from filteredOrders found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'orderProfits from filteredOrders missing', False)

            # Test 8: Check for cancelledCount calculation
            if 'cancelledCount' in calc_content:
                self.log_test('strict_financial_status_filtering', 'cancelledCount calculation found', True)
            else:
                self.log_test('strict_financial_status_filtering', 'cancelledCount calculation missing', False)

        except Exception as e:
            self.log_test('strict_financial_status_filtering', 'Source code check failed', False, str(e))

    async def test_dashboard_data_integrity(self):
        """Test 3: DASHBOARD DATA INTEGRITY"""
        print("\n🎯 TEST 3: DASHBOARD DATA INTEGRITY")
        
        try:
            # Get dashboard data for alltime range
            async with self.session.get(f"{self.base_url}/dashboard?range=alltime") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Test 1: plBreakdown.grossRevenue == filtered.revenue
                    pl_revenue = data.get('plBreakdown', {}).get('grossRevenue', 0)
                    filtered_revenue = data.get('filtered', {}).get('revenue', 0)
                    if pl_revenue == filtered_revenue:
                        self.log_test('dashboard_data_integrity', 'plBreakdown.grossRevenue == filtered.revenue', True, f"Both: ₹{pl_revenue:,.2f}")
                    else:
                        self.log_test('dashboard_data_integrity', 'plBreakdown.grossRevenue != filtered.revenue', False, f"PL: ₹{pl_revenue:,.2f}, Filtered: ₹{filtered_revenue:,.2f}")

                    # Test 2: plBreakdown.netProfit == filtered.netProfit
                    pl_profit = data.get('plBreakdown', {}).get('netProfit', 0)
                    filtered_profit = data.get('filtered', {}).get('netProfit', 0)
                    if pl_profit == filtered_profit:
                        self.log_test('dashboard_data_integrity', 'plBreakdown.netProfit == filtered.netProfit', True, f"Both: ₹{pl_profit:,.2f}")
                    else:
                        self.log_test('dashboard_data_integrity', 'plBreakdown.netProfit != filtered.netProfit', False, f"PL: ₹{pl_profit:,.2f}, Filtered: ₹{filtered_profit:,.2f}")

                    # Test 3: cancelledCount field exists and >= 0
                    cancelled_count = data.get('filtered', {}).get('cancelledCount', None)
                    if cancelled_count is not None and cancelled_count >= 0:
                        self.log_test('dashboard_data_integrity', 'cancelledCount field exists and valid', True, f"Count: {cancelled_count}")
                    else:
                        self.log_test('dashboard_data_integrity', 'cancelledCount field missing or invalid', False, f"Value: {cancelled_count}")

                    # Test 4: totalOrders > 0
                    total_orders = data.get('filtered', {}).get('totalOrders', 0)
                    if total_orders > 0:
                        self.log_test('dashboard_data_integrity', 'totalOrders > 0', True, f"Orders: {total_orders}")
                    else:
                        self.log_test('dashboard_data_integrity', 'totalOrders <= 0', False, f"Orders: {total_orders}")

                    # Test 5: Check if pending orders exist and verify totalOrders logic
                    pending_orders_count = self.db.orders.count_documents({'financialStatus': 'pending'})
                    total_db_orders = self.db.orders.count_documents({})
                    
                    if pending_orders_count > 0:
                        if total_orders < total_db_orders:
                            self.log_test('dashboard_data_integrity', 'Dashboard totalOrders < DB total (pending orders excluded)', True, f"Dashboard: {total_orders}, DB: {total_db_orders}, Pending: {pending_orders_count}")
                        else:
                            self.log_test('dashboard_data_integrity', 'Dashboard totalOrders should be less than DB total', False, f"Dashboard: {total_orders}, DB: {total_db_orders}")
                    else:
                        self.log_test('dashboard_data_integrity', 'No pending orders found in DB', True, f"Pending orders: {pending_orders_count}")

                else:
                    self.log_test('dashboard_data_integrity', 'Dashboard API call failed', False, f"Status: {response.status}")

        except Exception as e:
            self.log_test('dashboard_data_integrity', 'Dashboard integrity test failed', False, str(e))

    async def test_date_picker_ux(self):
        """Test 4: DATE PICKER UX (source code check)"""
        print("\n🎯 TEST 4: DATE PICKER UX (SOURCE CODE)")
        
        try:
            # Read the DashboardView.jsx file
            with open('/app/components/DashboardView.jsx', 'r') as f:
                dashboard_content = f.read()

            # Test 1: Check for useEffect guard condition
            guard_pattern = r'if\s*\(\s*dateRange\s*===\s*["\']custom["\']\s*&&\s*\(\s*!\s*customStart\s*\|\|\s*!\s*customEnd\s*\)\s*\)\s*return'
            if re.search(guard_pattern, dashboard_content):
                self.log_test('date_picker_ux', 'useEffect guard condition found', True)
            else:
                self.log_test('date_picker_ux', 'useEffect guard condition missing', False)

            # Test 2: Check for pendingRange state
            if 'pendingRange' in dashboard_content and 'useState(' in dashboard_content:
                self.log_test('date_picker_ux', 'pendingRange state found', True)
            else:
                self.log_test('date_picker_ux', 'pendingRange state missing', False)

            # Test 3: Check for Calendar onSelect with range validation
            onselect_pattern = r'onSelect.*=.*\(.*range.*\).*=>.*range\?\.\s*from.*&&.*range\?\.\s*to'
            if re.search(onselect_pattern, dashboard_content, re.DOTALL):
                self.log_test('date_picker_ux', 'Calendar onSelect with range validation found', True)
            else:
                self.log_test('date_picker_ux', 'Calendar onSelect with range validation missing', False)

            # Test 4: Check for setCustomStart/setCustomEnd calls
            if 'setCustomStart' in dashboard_content and 'setCustomEnd' in dashboard_content:
                self.log_test('date_picker_ux', 'setCustomStart/setCustomEnd calls found', True)
            else:
                self.log_test('date_picker_ux', 'setCustomStart/setCustomEnd calls missing', False)

        except Exception as e:
            self.log_test('date_picker_ux', 'Date picker UX check failed', False, str(e))

    async def test_ad_spend_tax(self):
        """Test 5: AD SPEND TAX"""
        print("\n🎯 TEST 5: AD SPEND TAX")
        
        try:
            # Get dashboard data for alltime range
            async with self.session.get(f"{self.base_url}/dashboard?range=alltime") as response:
                if response.status == 200:
                    data = await response.json()
                    dashboard_ad_spend = data.get('filtered', {}).get('adSpend', 0)

                    # Test 1: Dashboard has positive ad spend
                    if dashboard_ad_spend > 0:
                        self.log_test('ad_spend_tax', 'Dashboard has positive ad spend', True, f"Ad Spend: ₹{dashboard_ad_spend:,.2f}")
                    else:
                        self.log_test('ad_spend_tax', 'Dashboard has zero ad spend', False, f"Ad Spend: ₹{dashboard_ad_spend}")

                    # Use pymongo to get raw ad spend data and tax rate
                    tenant_config = self.db.tenantConfig.find_one({})
                    ad_spend_tax_rate = tenant_config.get('adSpendTaxRate', 18) if tenant_config else 18

                    # Get raw ad spend total from dailyMarketingSpend collection
                    daily_spends = list(self.db.dailyMarketingSpend.find({}))
                    raw_total = sum(spend.get('spendAmount', 0) for spend in daily_spends)

                    # Test 2: Raw ad spend calculation
                    if raw_total > 0:
                        self.log_test('ad_spend_tax', 'Raw ad spend data found', True, f"Raw Total: ₹{raw_total:,.2f}")
                    else:
                        self.log_test('ad_spend_tax', 'No raw ad spend data found', False, f"Raw Total: ₹{raw_total}")

                    # Test 3: Tax calculation verification
                    expected_taxed_spend = raw_total * (1 + ad_spend_tax_rate / 100)
                    difference_percent = abs(dashboard_ad_spend - expected_taxed_spend) / expected_taxed_spend * 100 if expected_taxed_spend > 0 else 0
                    
                    if difference_percent <= 1:  # Within 1% tolerance
                        self.log_test('ad_spend_tax', 'Ad spend tax calculation accurate', True, f"Expected: ₹{expected_taxed_spend:,.2f}, Got: ₹{dashboard_ad_spend:,.2f}, Tax Rate: {ad_spend_tax_rate}%")
                    else:
                        self.log_test('ad_spend_tax', 'Ad spend tax calculation inaccurate', False, f"Expected: ₹{expected_taxed_spend:,.2f}, Got: ₹{dashboard_ad_spend:,.2f}, Difference: {difference_percent:.2f}%")

                else:
                    self.log_test('ad_spend_tax', 'Dashboard API call failed', False, f"Status: {response.status}")

        except Exception as e:
            self.log_test('ad_spend_tax', 'Ad spend tax test failed', False, str(e))

    async def run_all_tests(self):
        """Run all Phase 8.9 tests"""
        print("🚀 Starting Phase 8.9 'Absolute Financial Parity & Date Picker UX Polish' Backend Testing")
        print(f"Base URL: {self.base_url}")
        
        if not await self.setup():
            return False

        try:
            # Run all tests
            await self.test_proportional_revenue_allocation()
            await self.test_strict_financial_status_filtering()
            await self.test_dashboard_data_integrity()
            await self.test_date_picker_ux()
            await self.test_ad_spend_tax()

            # Print summary
            self.print_summary()
            return True

        finally:
            await self.cleanup()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("🎯 PHASE 8.9 BACKEND TESTING SUMMARY")
        print("="*80)
        
        total_passed = 0
        total_tests = 0
        
        for category, results in self.results.items():
            passed = results['passed']
            total = results['total']
            total_passed += passed
            total_tests += total
            
            status = "✅ ALL PASSED" if passed == total else f"⚠️  {passed}/{total} PASSED"
            category_name = category.replace('_', ' ').title()
            print(f"{category_name}: {status}")
        
        print("-" * 80)
        overall_status = "✅ ALL TESTS PASSED" if total_passed == total_tests else f"⚠️  {total_passed}/{total_tests} TESTS PASSED"
        print(f"OVERALL: {overall_status}")
        
        if total_passed == total_tests:
            print("\n🎉 PHASE 8.9 'ABSOLUTE FINANCIAL PARITY & DATE PICKER UX POLISH' FULLY FUNCTIONAL!")
        else:
            print(f"\n❌ {total_tests - total_passed} test(s) failed. Review implementation.")

async def main():
    """Main test runner"""
    tester = Phase89Tester()
    success = await tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)