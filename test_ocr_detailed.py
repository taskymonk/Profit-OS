#!/usr/bin/env python3

import asyncio
import aiohttp
import json

BASE_URL = "https://erp-polish-phase7.preview.emergentagent.com"

async def test_ocr_detailed():
    async with aiohttp.ClientSession() as session:
        
        # Test with the exact text from requirements
        test_data_original = {
            "ocrText": "Invoice Number: INV-2024-001\nDate: 15/03/2024\nVendor: ABC Supplies\nTotal Amount: Rs. 15,500.00\nGST: Rs. 2,790.00\nPackaging materials for Q1 2024"
        }
        
        print("🔍 Testing OCR Invoice with original text...")
        async with session.post(f"{BASE_URL}/api/ocr/invoice", 
                               headers={'Content-Type': 'application/json'}, 
                               data=json.dumps(test_data_original)) as response:
            result1 = await response.json()
            print("Original text result:")
            print(f"  Method: {result1.get('method')}")
            print(f"  Vendor: {result1.get('vendor')}")
            print(f"  Amount: {result1.get('amount')}")
            print(f"  Date: {result1.get('date')}")
            print(f"  Invoice Number: {result1.get('invoiceNumber')}")
            print(f"  Category: {result1.get('category')}")
            print(f"  Tax Amount: {result1.get('taxAmount')}")
            print(f"  Confidence: {result1.get('confidence')}")
            print()
        
        # Test with different variations to understand the parsing
        variations = [
            "Total: Rs. 15,500.00",
            "Total Amount: ₹15,500.00", 
            "Total: 15500.00",
            "Amount: Rs 15500",
            "Grand Total: Rs. 15,500.00"
        ]
        
        for i, variation in enumerate(variations):
            test_text = f"Invoice: INV-001\nVendor: Test Corp\n{variation}\nGST: 2790"
            test_data = {"ocrText": test_text}
            
            print(f"🧪 Test variation {i+1}: {variation}")
            async with session.post(f"{BASE_URL}/api/ocr/invoice", 
                                   headers={'Content-Type': 'application/json'}, 
                                   data=json.dumps(test_data)) as response:
                result = await response.json()
                print(f"  Amount extracted: {result.get('amount')}")
                print(f"  Confidence: {result.get('confidence')}")
            print()

if __name__ == "__main__":
    asyncio.run(test_ocr_detailed())