#!/usr/bin/env python3
"""
Profit OS Backend Test Suite - IST Date Boundary Fix + Rounding Removal + Calendar UX Fix
Tests 4 critical areas: IST date boundary parity, today functionality, all time/7days ranges, and source code checks
"""

import requests
import json
import sys
import os
from pymongo import MongoClient
import subprocess

# Configuration from .env
BASE_URL = "http://localhost:3000/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "profitos"

def log_test_result(test_name, status, details=""):
    """Log test results with clear status"""
    symbol = "✅" if status else "❌"
    print(f"{symbol} {test_name}: {details}")

def get_mongo_connection():
    """Get MongoDB connection"""
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]

def make_request(method, endpoint, data=None, params=None):
    """Make HTTP request with error handling"""
    try:
        url = f"{BASE_URL}{endpoint}"
        if method.upper() == "GET":
            response = requests.get(url, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, json=data)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response.status_code, response.json() if response.content else {}
    except Exception as e:
        print(f"Request error for {method} {endpoint}: {e}")
        return 0, {"error": str(e)}

def test_ist_date_boundary_parity():
    """
    Test 1: IST DATE BOUNDARY PARITY (most critical)
    Verify dashboard returns exact Shopify revenue figures for Feb 22-28 date range
    """
    print("\n🎯 TEST 1: IST DATE BOUNDARY PARITY (MOST CRITICAL)")
    
    try:
        # Test the specific date range mentioned in the request
        status_code, response = make_request("GET", "/dashboard", params={
            "range": "custom",
            "startDate": "2026-02-22", 
            "endDate": "2026-02-28"
        })
        
        if status_code != 200:
            log_test_result("IST Date Boundary API Call", False, f"HTTP {status_code}: {response.get('error', 'Unknown error')}")
            return False
        
        # Extract the key metrics
        filtered = response.get("filtered", {})
        plBreakdown = response.get("plBreakdown", {})
        
        # Critical checks as specified in the request
        revenue = filtered.get("revenue")
        gstOnRevenue = plBreakdown.get("gstOnRevenue") 
        netRevenue = plBreakdown.get("netRevenue")
        grossRevenue = plBreakdown.get("grossRevenue")
        
        # Test the specific values mentioned in the request
        tests_passed = 0
        total_tests = 4
        
        # 1. Check filtered.revenue == 18430 (Shopify's exact Total Sales for Feb 22-28)
        if revenue == 18430:
            log_test_result("Revenue Parity Check", True, f"filtered.revenue = ₹{revenue} (matches Shopify Total Sales)")
            tests_passed += 1
        else:
            log_test_result("Revenue Parity Check", False, f"Expected ₹18,430, got ₹{revenue}")
        
        # 2. Check plBreakdown.gstOnRevenue == 2811.36 (Shopify's exact Taxes)
        if abs(gstOnRevenue - 2811.36) < 0.1:
            log_test_result("GST Parity Check", True, f"plBreakdown.gstOnRevenue = ₹{gstOnRevenue} (matches Shopify Taxes)")
            tests_passed += 1
        else:
            log_test_result("GST Parity Check", False, f"Expected ₹2,811.36, got ₹{gstOnRevenue}")
        
        # 3. Check plBreakdown.netRevenue == 15618.64 (Shopify's exact Gross Sales)
        if abs(netRevenue - 15618.64) < 0.1:
            log_test_result("Net Revenue Parity Check", True, f"plBreakdown.netRevenue = ₹{netRevenue} (matches Shopify Gross Sales)")
            tests_passed += 1
        else:
            log_test_result("Net Revenue Parity Check", False, f"Expected ₹15,618.64, got ₹{netRevenue}")
        
        # 4. Check plBreakdown.grossRevenue == filtered.revenue
        if grossRevenue == revenue:
            log_test_result("Revenue Consistency Check", True, f"plBreakdown.grossRevenue = filtered.revenue (₹{grossRevenue})")
            tests_passed += 1
        else:
            log_test_result("Revenue Consistency Check", False, f"plBreakdown.grossRevenue (₹{grossRevenue}) != filtered.revenue (₹{revenue})")
        
        # Overall result for IST Date Boundary Parity
        success = tests_passed == total_tests
        log_test_result("IST Date Boundary Parity (CRITICAL)", success, f"{tests_passed}/{total_tests} checks passed")
        return success
        
    except Exception as e:
        log_test_result("IST Date Boundary Parity (CRITICAL)", False, f"Exception: {e}")
        return False

def test_today_still_works():
    """
    Test 2: TODAY STILL WORKS
    Verify today range returns proper data structure
    """
    print("\n🎯 TEST 2: TODAY STILL WORKS")
    
    try:
        status_code, response = make_request("GET", "/dashboard", params={"range": "today"})
        
        if status_code != 200:
            log_test_result("Today Range API Call", False, f"HTTP {status_code}: {response.get('error', 'Unknown error')}")
            return False
        
        filtered = response.get("filtered", {})
        dateRange = response.get("dateRange", {})
        
        tests_passed = 0
        total_tests = 3
        
        # Check if totalOrders == 1 as specified
        totalOrders = filtered.get("totalOrders")
        if totalOrders == 1:
            log_test_result("Today Orders Count", True, f"filtered.totalOrders = {totalOrders}")
            tests_passed += 1
        else:
            log_test_result("Today Orders Count", False, f"Expected 1 order, got {totalOrders}")
        
        # Check if revenue == 480 as specified
        revenue = filtered.get("revenue")
        if revenue == 480:
            log_test_result("Today Revenue Check", True, f"filtered.revenue = ₹{revenue}")
            tests_passed += 1
        else:
            log_test_result("Today Revenue Check", False, f"Expected ₹480, got ₹{revenue}")
        
        # Check if dateRange.start is YYYY-MM-DD string (not ISO timestamp)
        dateStart = dateRange.get("start")
        if dateStart and len(dateStart) == 10 and dateStart.count("-") == 2:
            log_test_result("Date Format Check", True, f"dateRange.start = '{dateStart}' (YYYY-MM-DD format)")
            tests_passed += 1
        else:
            log_test_result("Date Format Check", False, f"Expected YYYY-MM-DD format, got '{dateStart}'")
        
        success = tests_passed == total_tests
        log_test_result("TODAY Functionality", success, f"{tests_passed}/{total_tests} checks passed")
        return success
        
    except Exception as e:
        log_test_result("TODAY Functionality", False, f"Exception: {e}")
        return False

def test_alltime_and_7days():
    """
    Test 3: ALL TIME + 7 DAYS
    Test these ranges work correctly
    """
    print("\n🎯 TEST 3: ALL TIME + 7 DAYS RANGES")
    
    try:
        tests_passed = 0
        total_tests = 4
        
        # Test All Time
        status_code, response = make_request("GET", "/dashboard", params={"range": "alltime"})
        if status_code != 200:
            log_test_result("All Time API Call", False, f"HTTP {status_code}")
            return False
            
        filtered = response.get("filtered", {})
        plBreakdown = response.get("plBreakdown", {})
        
        # Check totalOrders > 0
        totalOrders = filtered.get("totalOrders", 0)
        if totalOrders > 0:
            log_test_result("All Time Orders Check", True, f"totalOrders = {totalOrders}")
            tests_passed += 1
        else:
            log_test_result("All Time Orders Check", False, f"Expected > 0, got {totalOrders}")
        
        # Check revenue > 0
        revenue = filtered.get("revenue", 0)
        if revenue > 0:
            log_test_result("All Time Revenue Check", True, f"revenue = ₹{revenue:,.2f}")
            tests_passed += 1
        else:
            log_test_result("All Time Revenue Check", False, f"Expected > 0, got ₹{revenue}")
        
        # Test 7 Days
        status_code, response = make_request("GET", "/dashboard", params={"range": "7days"})
        if status_code != 200:
            log_test_result("7 Days API Call", False, f"HTTP {status_code}")
            return False
            
        filtered = response.get("filtered", {})
        plBreakdown = response.get("plBreakdown", {})
        
        # Check totalOrders >= 0 (could be 0 for 7 days)
        totalOrders = filtered.get("totalOrders", -1)
        if totalOrders >= 0:
            log_test_result("7 Days Orders Check", True, f"totalOrders = {totalOrders}")
            tests_passed += 1
        else:
            log_test_result("7 Days Orders Check", False, f"Expected >= 0, got {totalOrders}")
        
        # For both ranges: plBreakdown.grossRevenue == filtered.revenue
        grossRevenue = plBreakdown.get("grossRevenue", 0)
        revenue = filtered.get("revenue", 0)
        if abs(grossRevenue - revenue) < 0.01:  # Allow for small floating point differences
            log_test_result("7 Days Revenue Consistency", True, f"plBreakdown.grossRevenue = filtered.revenue (₹{revenue:,.2f})")
            tests_passed += 1
        else:
            log_test_result("7 Days Revenue Consistency", False, f"grossRevenue (₹{grossRevenue:,.2f}) != revenue (₹{revenue:,.2f})")
        
        success = tests_passed == total_tests
        log_test_result("ALL TIME + 7 DAYS Ranges", success, f"{tests_passed}/{total_tests} checks passed")
        return success
        
    except Exception as e:
        log_test_result("ALL TIME + 7 DAYS Ranges", False, f"Exception: {e}")
        return False

def test_source_code_checks():
    """
    Test 4: SOURCE CODE CHECKS
    Verify specific implementation details in the codebase
    """
    print("\n🎯 TEST 4: SOURCE CODE CHECKS")
    
    try:
        tests_passed = 0
        total_tests = 4
        
        # 1. Check profitCalculator.js for 'T00:00:00+05:30' in date boundary parsing
        try:
            with open('/app/lib/profitCalculator.js', 'r') as f:
                profit_calc_content = f.read()
            
            if 'T00:00:00+05:30' in profit_calc_content:
                log_test_result("IST Date Boundary in profitCalculator.js", True, "Found 'T00:00:00+05:30' IST offset")
                tests_passed += 1
            else:
                log_test_result("IST Date Boundary in profitCalculator.js", False, "IST offset 'T00:00:00+05:30' not found")
        except Exception as e:
            log_test_result("IST Date Boundary in profitCalculator.js", False, f"File read error: {e}")
        
        # 2. Check route.js for salePrice NOT using Math.round
        try:
            with open('/app/app/api/[[...path]]/route.js', 'r') as f:
                route_content = f.read()
            
            # Look for salePrice assignment and verify it doesn't use Math.round
            if 'salePrice = finalOrderPrice * priceRatio' in route_content and 'Math.round(' not in route_content.split('salePrice = finalOrderPrice * priceRatio')[1].split(';')[0]:
                log_test_result("No Math.round in salePrice calculation", True, "salePrice uses direct multiplication without rounding")
                tests_passed += 1
            else:
                log_test_result("No Math.round in salePrice calculation", False, "salePrice calculation may still use Math.round")
        except Exception as e:
            log_test_result("No Math.round in salePrice calculation", False, f"File read error: {e}")
        
        # 3. Check DashboardView.jsx for controlled Popover
        try:
            with open('/app/components/DashboardView.jsx', 'r') as f:
                dashboard_content = f.read()
            
            if '<Popover open={calendarOpen}' in dashboard_content:
                log_test_result("Controlled Popover in DashboardView.jsx", True, "Found <Popover open={calendarOpen} (controlled)")
                tests_passed += 1
            else:
                log_test_result("Controlled Popover in DashboardView.jsx", False, "Controlled Popover pattern not found")
        except Exception as e:
            log_test_result("Controlled Popover in DashboardView.jsx", False, f"File read error: {e}")
        
        # 4. Check useEffect guard in DashboardView.jsx
        try:
            with open('/app/components/DashboardView.jsx', 'r') as f:
                dashboard_content = f.read()
            
            if "if (dateRange === 'custom' && (!customStart || !customEnd)) return;" in dashboard_content:
                log_test_result("useEffect guard in DashboardView.jsx", True, "Found proper useEffect guard for custom date range")
                tests_passed += 1
            else:
                log_test_result("useEffect guard in DashboardView.jsx", False, "useEffect guard for custom date range not found")
        except Exception as e:
            log_test_result("useEffect guard in DashboardView.jsx", False, f"File read error: {e}")
        
        success = tests_passed == total_tests
        log_test_result("SOURCE CODE CHECKS", success, f"{tests_passed}/{total_tests} checks passed")
        return success
        
    except Exception as e:
        log_test_result("SOURCE CODE CHECKS", False, f"Exception: {e}")
        return False

def main():
    """Run all backend tests"""
    print("🚀 PROFIT OS BACKEND TEST SUITE")
    print("=" * 70)
    print("Testing: IST Date Boundary Fix + Rounding Removal + Calendar UX Fix")
    print("Base URL:", BASE_URL)
    print("MongoDB:", MONGO_URL, "Database:", DB_NAME)
    print("=" * 70)
    
    # Track overall results
    test_results = []
    
    # Run all test suites
    test_results.append(("IST Date Boundary Parity (CRITICAL)", test_ist_date_boundary_parity()))
    test_results.append(("TODAY Still Works", test_today_still_works()))
    test_results.append(("ALL TIME + 7 DAYS Ranges", test_alltime_and_7days()))
    test_results.append(("SOURCE CODE CHECKS", test_source_code_checks()))
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 BACKEND TEST SUMMARY")
    print("=" * 70)
    
    passed_tests = 0
    total_tests = len(test_results)
    
    for test_name, result in test_results:
        status_symbol = "✅" if result else "❌"
        print(f"{status_symbol} {test_name}")
        if result:
            passed_tests += 1
    
    print("\n" + "=" * 70)
    overall_success = passed_tests == total_tests
    
    if overall_success:
        print("🎉 ALL BACKEND TESTS PASSED!")
        print(f"✅ {passed_tests}/{total_tests} test suites completed successfully")
        print("\n✅ IST Date Boundary Fix: VERIFIED")
        print("✅ Rounding Removal: VERIFIED") 
        print("✅ Calendar UX Fix: VERIFIED")
        print("✅ Core Functionality: WORKING")
    else:
        print("⚠️  SOME BACKEND TESTS FAILED")
        print(f"❌ {passed_tests}/{total_tests} test suites passed")
        
        # List failed tests
        failed_tests = [name for name, result in test_results if not result]
        if failed_tests:
            print("\n🔍 Failed Test Suites:")
            for failed_test in failed_tests:
                print(f"   • {failed_test}")
    
    print("=" * 70)
    return 0 if overall_success else 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)