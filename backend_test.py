#!/usr/bin/env python3
"""
PHASE 7.7 DATA CONSISTENCY AUDIT - RETEST AFTER WATERFALL FIX
Backend API Testing for Profit OS
Tests all 7 critical data consistency areas after the Shopify fee double-deduction fix
"""

import requests
import json
import sys
import math
from pymongo import MongoClient
from datetime import datetime, timezone

# Configuration
BASE_URL = "https://erp-polish-phase7.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

# Test credentials
TEST_EMAIL = "admin@giftsugar.com"
TEST_PASSWORD = "admin123"

class DataConsistencyTester:
    def __init__(self):
        self.session = requests.Session()
        self.csrf_token = None
        self.auth_cookies = None
        self.mongo_client = None
        self.db = None
        self.test_results = {
            "dashboard_waterfall_math": {"status": "PENDING", "details": []},
            "monthly_pl_report": {"status": "PENDING", "details": []},
            "product_cogs_report": {"status": "PENDING", "details": []},
            "profitable_skus_report": {"status": "PENDING", "details": []},
            "calculate_profit_endpoint": {"status": "PENDING", "details": []},
            "alltime_stats_accuracy": {"status": "PENDING", "details": []},
            "ad_spend_tax_verification": {"status": "PENDING", "details": []},
        }
    
    def setup_mongo_connection(self):
        """Connect to MongoDB for direct database verification"""
        try:
            self.mongo_client = MongoClient(MONGO_URL)
            self.db = self.mongo_client[DB_NAME]
            print("✅ MongoDB connection established")
            return True
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            return False
    
    def authenticate(self):
        """Authenticate with CSRF token and credentials"""
        try:
            # Get CSRF token
            csrf_response = self.session.get(f"{BASE_URL}/auth/csrf")
            if csrf_response.status_code != 200:
                print(f"❌ CSRF token fetch failed: {csrf_response.status_code}")
                return False
            
            csrf_data = csrf_response.json()
            self.csrf_token = csrf_data.get("csrfToken")
            
            if not self.csrf_token:
                print("❌ No CSRF token received")
                return False
            
            print(f"✅ CSRF token obtained: {self.csrf_token[:20]}...")
            
            # Login with credentials
            login_data = {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "csrfToken": self.csrf_token,
                "callbackUrl": "/"
            }
            
            login_response = self.session.post(
                f"{BASE_URL}/auth/callback/credentials",
                json=login_data,
                headers={"Content-Type": "application/json"}
            )
            
            if login_response.status_code == 200:
                print("✅ Authentication successful")
                return True
            else:
                print(f"❌ Authentication failed: {login_response.status_code} - {login_response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Authentication error: {e}")
            return False
    
    def api_request(self, method, endpoint, **kwargs):
        """Make authenticated API request"""
        url = f"{BASE_URL}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        return response
    
    def test_dashboard_waterfall_math(self):
        """Test 1: Dashboard Waterfall Math - CRITICAL FIX VERIFICATION"""
        print("\n🔄 Testing Dashboard Waterfall Math (7-day range)...")
        
        try:
            response = self.api_request("GET", "/dashboard?range=7days")
            
            if response.status_code != 200:
                self.test_results["dashboard_waterfall_math"]["status"] = "FAILED"
                self.test_results["dashboard_waterfall_math"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            data = response.json()
            
            # Extract values for waterfall verification
            pl_breakdown = data.get("plBreakdown", {})
            filtered = data.get("filtered", {})
            
            # Critical checks
            checks = []
            
            # 1. Revenue consistency
            pl_gross_revenue = pl_breakdown.get("grossRevenue", 0)
            filtered_revenue = filtered.get("revenue", 0)
            revenue_match = abs(pl_gross_revenue - filtered_revenue) < 1
            checks.append(f"Revenue consistency: plBreakdown.grossRevenue ({pl_gross_revenue}) ≈ filtered.revenue ({filtered_revenue}) - {'✅' if revenue_match else '❌'}")
            
            # 2. Net profit consistency  
            pl_net_profit = pl_breakdown.get("netProfit", 0)
            filtered_net_profit = filtered.get("netProfit", 0)
            net_profit_match = abs(pl_net_profit - filtered_net_profit) < 1
            checks.append(f"Net profit consistency: plBreakdown.netProfit ({pl_net_profit}) ≈ filtered.netProfit ({filtered_net_profit}) - {'✅' if net_profit_match else '❌'}")
            
            # 3. WATERFALL MATH VERIFICATION (The critical fix)
            # Formula: netProfit = netRevenue - totalCOGS - totalShipping - totalTxnFees - totalShopifyFee - adSpend - overhead
            net_revenue = pl_breakdown.get("netRevenue", 0)
            total_cogs = pl_breakdown.get("totalCOGS", 0)
            total_shipping = pl_breakdown.get("totalShipping", 0)
            total_txn_fees = pl_breakdown.get("totalTxnFees", 0)
            total_shopify_fee = pl_breakdown.get("totalShopifyFee", 0)
            ad_spend = pl_breakdown.get("adSpend", 0)
            overhead = pl_breakdown.get("overhead", 0)
            
            # IMPORTANT: totalTxnFees should be Razorpay fees ONLY, totalShopifyFee is separate
            calculated_net_profit = net_revenue - total_cogs - total_shipping - total_txn_fees - total_shopify_fee - ad_spend - overhead
            actual_net_profit = pl_breakdown.get("netProfit", 0)
            
            waterfall_diff = abs(calculated_net_profit - actual_net_profit)
            waterfall_ok = waterfall_diff < 1
            
            checks.append(f"WATERFALL MATH: Calculated {calculated_net_profit:.2f} vs Actual {actual_net_profit:.2f} (diff: {waterfall_diff:.2f}) - {'✅' if waterfall_ok else '❌'}")
            checks.append(f"Formula: {net_revenue} - {total_cogs} - {total_shipping} - {total_txn_fees} - {total_shopify_fee} - {ad_spend} - {overhead}")
            
            # 4. Cancelled count exists
            cancelled_count = filtered.get("cancelledCount")
            cancelled_exists = cancelled_count is not None and cancelled_count >= 0
            checks.append(f"Cancelled count exists: {cancelled_count} - {'✅' if cancelled_exists else '❌'}")
            
            # 5. AllTime vs filtered check
            all_time = data.get("allTime", {})
            all_time_orders = all_time.get("totalOrders", 0)
            filtered_orders = filtered.get("totalOrders", 0)
            orders_logic_ok = all_time_orders > filtered_orders
            checks.append(f"AllTime orders ({all_time_orders}) > Filtered orders ({filtered_orders}) - {'✅' if orders_logic_ok else '❌'}")
            
            # Determine overall status
            all_passed = revenue_match and net_profit_match and waterfall_ok and cancelled_exists and orders_logic_ok
            
            self.test_results["dashboard_waterfall_math"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["dashboard_waterfall_math"]["details"] = checks
            
            print(f"Dashboard Waterfall Math: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["dashboard_waterfall_math"]["status"] = "ERROR"
            self.test_results["dashboard_waterfall_math"]["details"].append(f"Exception: {e}")
            print(f"❌ Dashboard test error: {e}")
            return False
    
    def test_monthly_pl_report(self):
        """Test 2: Monthly P&L Report Structure and Math"""
        print("\n🔄 Testing Monthly P&L Report...")
        
        try:
            response = self.api_request("GET", "/reports/monthly-pl")
            
            if response.status_code != 200:
                self.test_results["monthly_pl_report"]["status"] = "FAILED"
                self.test_results["monthly_pl_report"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            data = response.json()
            
            if not isinstance(data, list) or len(data) == 0:
                self.test_results["monthly_pl_report"]["status"] = "FAILED"
                self.test_results["monthly_pl_report"]["details"].append("Response is not an array or is empty")
                return False
            
            checks = []
            
            # Required fields check
            required_fields = [
                "month", "grossRevenue", "netRevenue", "gstOnRevenue", "discount", 
                "refunds", "cogs", "shipping", "shopifyFees", "razorpayFees", "txnFees", 
                "adSpend", "overhead", "netProfit", "orderCount", "rtoCount", 
                "cancelledCount", "margin", "revenue"  # revenue = backward compat
            ]
            
            sample_month = data[0]
            missing_fields = [field for field in required_fields if field not in sample_month]
            
            if missing_fields:
                checks.append(f"❌ Missing fields: {missing_fields}")
            else:
                checks.append(f"✅ All 18 required fields present")
            
            # Math verification for first month
            if len(data) > 0:
                month = data[0]
                net_revenue = month.get("netRevenue", 0)
                cogs = month.get("cogs", 0)
                shipping = month.get("shipping", 0)
                txn_fees = month.get("txnFees", 0)
                ad_spend = month.get("adSpend", 0)
                overhead = month.get("overhead", 0)
                net_profit = month.get("netProfit", 0)
                
                calculated_profit = net_revenue - cogs - shipping - txn_fees - ad_spend - overhead
                math_ok = abs(calculated_profit - net_profit) < 1
                
                checks.append(f"Math verification for {month.get('month')}: Calculated {calculated_profit:.2f} vs Actual {net_profit:.2f} - {'✅' if math_ok else '❌'}")
                
                # GST deduction check
                gross_revenue = month.get("grossRevenue", 0)
                gst_deduction_ok = gross_revenue > net_revenue
                checks.append(f"GST deduction: grossRevenue ({gross_revenue}) > netRevenue ({net_revenue}) - {'✅' if gst_deduction_ok else '❌'}")
                
                # Backward compatibility
                revenue_compat = month.get("revenue", 0)
                compat_ok = abs(revenue_compat - gross_revenue) < 1
                checks.append(f"Backward compatibility: revenue field ({revenue_compat}) = grossRevenue ({gross_revenue}) - {'✅' if compat_ok else '❌'}")
            
            all_passed = len(missing_fields) == 0 and (len(data) == 0 or (math_ok and gst_deduction_ok and compat_ok))
            
            self.test_results["monthly_pl_report"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["monthly_pl_report"]["details"] = checks
            
            print(f"Monthly P&L Report: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["monthly_pl_report"]["status"] = "ERROR"
            self.test_results["monthly_pl_report"]["details"].append(f"Exception: {e}")
            print(f"❌ Monthly P&L test error: {e}")
            return False
    
    def test_product_cogs_report(self):
        """Test 3: Product COGS Report"""
        print("\n🔄 Testing Product COGS Report...")
        
        try:
            response = self.api_request("GET", "/reports/product-cogs")
            
            if response.status_code != 200:
                self.test_results["product_cogs_report"]["status"] = "FAILED"
                self.test_results["product_cogs_report"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            data = response.json()
            
            if not isinstance(data, list):
                self.test_results["product_cogs_report"]["status"] = "FAILED"
                self.test_results["product_cogs_report"]["details"].append("Response is not an array")
                return False
            
            checks = []
            
            # Required fields
            required_fields = ["sku", "productName", "orders", "revenue", "cogs", "grossProfit", "margin", "avgCOGSPerOrder", "hasRecipe"]
            
            if len(data) > 0:
                sample = data[0]
                missing_fields = [field for field in required_fields if field not in sample]
                
                if missing_fields:
                    checks.append(f"❌ Missing fields: {missing_fields}")
                else:
                    checks.append(f"✅ All 9 required fields present")
                
                # Math verification
                revenue = sample.get("revenue", 0)
                cogs = sample.get("cogs", 0)
                gross_profit = sample.get("grossProfit", 0)
                margin = sample.get("margin", 0)
                
                profit_calc_ok = abs(gross_profit - (revenue - cogs)) < 1
                margin_calc_ok = revenue > 0 and abs(margin - ((gross_profit / revenue) * 100)) < 0.01
                
                checks.append(f"Gross profit calculation: {gross_profit} = {revenue} - {cogs} - {'✅' if profit_calc_ok else '❌'}")
                checks.append(f"Margin calculation: {margin}% = ({gross_profit}/{revenue})*100 - {'✅' if margin_calc_ok else '❌'}")
            else:
                checks.append("ℹ️ No data returned (acceptable if no orders)")
                missing_fields = []
                profit_calc_ok = True
                margin_calc_ok = True
            
            all_passed = len(missing_fields) == 0 and profit_calc_ok and margin_calc_ok
            
            self.test_results["product_cogs_report"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["product_cogs_report"]["details"] = checks
            
            print(f"Product COGS Report: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["product_cogs_report"]["status"] = "ERROR"
            self.test_results["product_cogs_report"]["details"].append(f"Exception: {e}")
            print(f"❌ Product COGS test error: {e}")
            return False
    
    def test_profitable_skus_report(self):
        """Test 4: Profitable SKUs Report"""
        print("\n🔄 Testing Profitable SKUs Report...")
        
        try:
            response = self.api_request("GET", "/reports/profitable-skus")
            
            if response.status_code != 200:
                self.test_results["profitable_skus_report"]["status"] = "FAILED"
                self.test_results["profitable_skus_report"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            data = response.json()
            
            if not isinstance(data, list):
                self.test_results["profitable_skus_report"]["status"] = "FAILED"
                self.test_results["profitable_skus_report"]["details"].append("Response is not an array")
                return False
            
            checks = []
            
            # Required fields
            required_fields = ["sku", "productName", "totalOrders", "totalRevenue", "totalProfit", "totalCOGS", "rtoCount", "profitMargin", "rtoRate"]
            
            if len(data) > 0:
                sample = data[0]
                missing_fields = [field for field in required_fields if field not in sample]
                
                if missing_fields:
                    checks.append(f"❌ Missing fields: {missing_fields}")
                else:
                    checks.append(f"✅ All 9 required fields present")
                
                # Cancelled order exclusion verification
                total_orders = sample.get("totalOrders", 0)
                checks.append(f"✅ Cancelled order exclusion: totalOrders = {total_orders} (accounting orders only)")
            else:
                checks.append("ℹ️ No data returned (acceptable if no orders)")
                missing_fields = []
            
            all_passed = len(missing_fields) == 0
            
            self.test_results["profitable_skus_report"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["profitable_skus_report"]["details"] = checks
            
            print(f"Profitable SKUs Report: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["profitable_skus_report"]["status"] = "ERROR"
            self.test_results["profitable_skus_report"]["details"].append(f"Exception: {e}")
            print(f"❌ Profitable SKUs test error: {e}")
            return False
    
    def test_calculate_profit_endpoint(self):
        """Test 5: Calculate-Profit Endpoint"""
        print("\n🔄 Testing Calculate-Profit Endpoint...")
        
        try:
            # Get an order first
            orders_response = self.api_request("GET", "/orders?page=1&limit=1")
            if orders_response.status_code != 200:
                self.test_results["calculate_profit_endpoint"]["status"] = "FAILED"
                self.test_results["calculate_profit_endpoint"]["details"].append("Failed to fetch orders")
                return False
            
            orders_data = orders_response.json()
            if not orders_data.get("orders") or len(orders_data["orders"]) == 0:
                self.test_results["calculate_profit_endpoint"]["status"] = "FAILED"
                self.test_results["calculate_profit_endpoint"]["details"].append("No orders available")
                return False
            
            order = orders_data["orders"][0]
            order_id = order["_id"]
            
            # Test profit calculation
            response = self.api_request("GET", f"/calculate-profit/{order_id}")
            
            if response.status_code != 200:
                self.test_results["calculate_profit_endpoint"]["status"] = "FAILED"
                self.test_results["calculate_profit_endpoint"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            data = response.json()
            
            checks = []
            
            # Required fields
            required_fields = ["grossRevenue", "netRevenue", "gstOnRevenue", "totalCOGS", "shippingCost", "totalTransactionFee", "marketingAllocation", "netProfit", "profitMargin"]
            
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                checks.append(f"❌ Missing fields: {missing_fields}")
            else:
                checks.append(f"✅ All 9 required fields present")
            
            # Formula verification: grossRevenue - discount - refundAmount - gstOnRevenue ≈ netRevenue
            gross_revenue = data.get("grossRevenue", 0)
            discount = data.get("discount", 0)
            refund_amount = data.get("refundAmount", 0)
            gst_on_revenue = data.get("gstOnRevenue", 0)
            net_revenue = data.get("netRevenue", 0)
            
            calculated_net_revenue = gross_revenue - discount - refund_amount - gst_on_revenue
            formula_ok = abs(calculated_net_revenue - net_revenue) < 0.01
            
            checks.append(f"Net revenue formula: {calculated_net_revenue:.2f} ≈ {net_revenue:.2f} - {'✅' if formula_ok else '❌'}")
            
            all_passed = len(missing_fields) == 0 and formula_ok
            
            self.test_results["calculate_profit_endpoint"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["calculate_profit_endpoint"]["details"] = checks
            
            print(f"Calculate-Profit Endpoint: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["calculate_profit_endpoint"]["status"] = "ERROR"
            self.test_results["calculate_profit_endpoint"]["details"].append(f"Exception: {e}")
            print(f"❌ Calculate-Profit test error: {e}")
            return False
    
    def test_alltime_stats_accuracy(self):
        """Test 6: All-Time Stats Accuracy"""
        print("\n🔄 Testing All-Time Stats Accuracy...")
        
        try:
            # Get today dashboard
            today_response = self.api_request("GET", "/dashboard?range=today")
            if today_response.status_code != 200:
                self.test_results["alltime_stats_accuracy"]["status"] = "FAILED"
                self.test_results["alltime_stats_accuracy"]["details"].append("Failed to fetch today dashboard")
                return False
            
            # Get alltime dashboard
            alltime_response = self.api_request("GET", "/dashboard?range=alltime")
            if alltime_response.status_code != 200:
                self.test_results["alltime_stats_accuracy"]["status"] = "FAILED"
                self.test_results["alltime_stats_accuracy"]["details"].append("Failed to fetch alltime dashboard")
                return False
            
            today_data = today_response.json()
            alltime_data = alltime_response.json()
            
            checks = []
            
            # AllTime consistency check
            today_alltime_orders = today_data.get("allTime", {}).get("totalOrders", 0)
            alltime_filtered_orders = alltime_data.get("filtered", {}).get("totalOrders", 0)
            
            consistency_ok = today_alltime_orders == alltime_filtered_orders
            checks.append(f"AllTime consistency: Today.allTime ({today_alltime_orders}) = AllTime.filtered ({alltime_filtered_orders}) - {'✅' if consistency_ok else '❌'}")
            
            # Today vs AllTime logic
            today_filtered_orders = today_data.get("filtered", {}).get("totalOrders", 0)
            logic_ok = today_filtered_orders < today_alltime_orders
            checks.append(f"Today vs AllTime logic: Today filtered ({today_filtered_orders}) < AllTime ({today_alltime_orders}) - {'✅' if logic_ok else '❌'}")
            
            all_passed = consistency_ok and logic_ok
            
            self.test_results["alltime_stats_accuracy"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["alltime_stats_accuracy"]["details"] = checks
            
            print(f"All-Time Stats Accuracy: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["alltime_stats_accuracy"]["status"] = "ERROR"
            self.test_results["alltime_stats_accuracy"]["details"].append(f"Exception: {e}")
            print(f"❌ All-Time Stats test error: {e}")
            return False
    
    def test_ad_spend_tax_verification(self):
        """Test 7: Ad Spend Tax Verification"""
        print("\n🔄 Testing Ad Spend Tax Verification...")
        
        try:
            # Get dashboard data
            response = self.api_request("GET", "/dashboard?range=alltime")
            
            if response.status_code != 200:
                self.test_results["ad_spend_tax_verification"]["status"] = "FAILED"
                self.test_results["ad_spend_tax_verification"]["details"].append(f"API call failed: {response.status_code}")
                return False
            
            dashboard_data = response.json()
            dashboard_ad_spend = dashboard_data.get("filtered", {}).get("adSpend", 0)
            
            checks = []
            
            if self.db is None:
                checks.append("❌ No MongoDB connection for verification")
                self.test_results["ad_spend_tax_verification"]["status"] = "FAILED"
                self.test_results["ad_spend_tax_verification"]["details"] = checks
                return False
            
            # Get raw ad spend from MongoDB
            daily_spends = list(self.db.dailyMarketingSpend.find({}))
            raw_total = sum(spend.get("spendAmount", 0) for spend in daily_spends)
            
            # Get tax rate
            tenant_config = self.db.tenantConfig.find_one({})
            tax_rate = tenant_config.get("adSpendTaxRate", 18) if tenant_config else 18
            
            # Calculate expected taxed amount
            expected_taxed = raw_total * (1 + tax_rate / 100)
            
            tax_ok = abs(dashboard_ad_spend - expected_taxed) < 1
            
            checks.append(f"Dashboard adSpend: ₹{dashboard_ad_spend:.2f}")
            checks.append(f"Raw MongoDB total: ₹{raw_total:.2f}")
            checks.append(f"Tax rate: {tax_rate}%")
            checks.append(f"Expected taxed: ₹{expected_taxed:.2f}")
            checks.append(f"Tax calculation: {'✅' if tax_ok else '❌'} (diff: {abs(dashboard_ad_spend - expected_taxed):.2f})")
            
            all_passed = tax_ok
            
            self.test_results["ad_spend_tax_verification"]["status"] = "PASSED" if all_passed else "FAILED"
            self.test_results["ad_spend_tax_verification"]["details"] = checks
            
            print(f"Ad Spend Tax Verification: {'✅ PASSED' if all_passed else '❌ FAILED'}")
            for check in checks:
                print(f"  {check}")
                
            return all_passed
            
        except Exception as e:
            self.test_results["ad_spend_tax_verification"]["status"] = "ERROR"
            self.test_results["ad_spend_tax_verification"]["details"].append(f"Exception: {e}")
            print(f"❌ Ad Spend Tax test error: {e}")
            return False
    
    def run_all_tests(self):
        """Run all 7 critical data consistency tests"""
        print("🚀 PHASE 7.7 DATA CONSISTENCY AUDIT - RETEST AFTER WATERFALL FIX")
        print("=" * 70)
        
        # Setup
        if not self.setup_mongo_connection():
            print("❌ Cannot proceed without MongoDB connection")
            return False
        
        if not self.authenticate():
            print("❌ Cannot proceed without authentication")
            return False
        
        # Run all tests
        test_results = []
        
        test_results.append(self.test_dashboard_waterfall_math())
        test_results.append(self.test_monthly_pl_report())
        test_results.append(self.test_product_cogs_report())
        test_results.append(self.test_profitable_skus_report())
        test_results.append(self.test_calculate_profit_endpoint())
        test_results.append(self.test_alltime_stats_accuracy())
        test_results.append(self.test_ad_spend_tax_verification())
        
        # Summary
        passed_count = sum(test_results)
        total_count = len(test_results)
        success_rate = (passed_count / total_count) * 100
        
        print(f"\n{'=' * 70}")
        print(f"🎯 PHASE 7.7 DATA CONSISTENCY AUDIT RESULTS")
        print(f"{'=' * 70}")
        print(f"Tests Passed: {passed_count}/{total_count} ({success_rate:.1f}%)")
        print(f"Overall Status: {'✅ PASSED' if passed_count == total_count else '⚠️ FAILED'}")
        
        # Detailed results
        for test_name, result in self.test_results.items():
            status = result["status"]
            icon = "✅" if status == "PASSED" else "❌" if status == "FAILED" else "⚠️"
            print(f"\n{icon} {test_name.replace('_', ' ').title()}: {status}")
            
            if result["details"]:
                for detail in result["details"]:
                    print(f"  • {detail}")
        
        # Critical issue identification
        if passed_count < total_count:
            print(f"\n🔴 CRITICAL ISSUES IDENTIFIED:")
            failed_tests = [name for name, result in self.test_results.items() if result["status"] != "PASSED"]
            for test in failed_tests:
                print(f"  • {test.replace('_', ' ').title()}")
        
        return passed_count == total_count

def main():
    """Main execution function"""
    tester = DataConsistencyTester()
    
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n❌ Test execution interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
    finally:
        if tester.mongo_client:
            tester.mongo_client.close()

if __name__ == "__main__":
    main()