import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { v4 as uuidv4 } from 'uuid';
import { calculateOrderProfit, calculateDashboardMetrics, calculateProratedOverhead } from '@/lib/profitCalculator';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

function getSegments(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  return path.split('/').filter(Boolean);
}

function getSearchParams(request) {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}

// ==================== CRUD HELPERS ====================

async function listDocs(collectionName, query = {}) {
  const db = await getDb();
  return db.collection(collectionName).find(query).sort({ createdAt: -1 }).toArray();
}

async function getDoc(collectionName, id) {
  const db = await getDb();
  return db.collection(collectionName).findOne({ _id: id });
}

async function createDoc(collectionName, data) {
  const db = await getDb();
  const doc = { _id: uuidv4(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await db.collection(collectionName).insertOne(doc);
  return doc;
}

async function updateDoc(collectionName, id, data) {
  const db = await getDb();
  const updateData = { ...data, updatedAt: new Date().toISOString() };
  delete updateData._id;
  await db.collection(collectionName).updateOne({ _id: id }, { $set: updateData });
  return db.collection(collectionName).findOne({ _id: id });
}

async function deleteDoc(collectionName, id) {
  const db = await getDb();
  const result = await db.collection(collectionName).deleteOne({ _id: id });
  return result.deletedCount > 0;
}

// ==================== CURRENCY CONVERSION (Frankfurter.app) ====================

let cachedRate = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3600000; // 1 hour

async function getExchangeRate(from = 'USD', to = 'INR') {
  const now = Date.now();
  if (cachedRate && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedRate;
  }
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (res.ok) {
      const data = await res.json();
      cachedRate = data.rates?.[to] || 1;
      cacheTimestamp = now;
      return cachedRate;
    }
  } catch (err) {
    console.error('Frankfurter API error:', err.message);
  }
  return cachedRate || 83; // Fallback rate
}

// ==================== SEED DATA ====================

async function seedData() {
  const db = await getDb();
  // Check for existing orders instead of tenantConfig (since tenantConfig is preserved during purge)
  const existingOrders = await db.collection('orders').findOne({});
  if (existingOrders) {
    return { message: 'Data already seeded', seeded: false };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  // Tenant Config (skip if already exists)
  const existingConfig = await db.collection('tenantConfig').findOne({ _id: 'tenant-1' });
  if (!existingConfig) {
    await db.collection('tenantConfig').insertOne({
      _id: 'tenant-1',
      tenantName: 'GiftSugar',
      logo: '',
      primaryColor: '#059669',
      themePreference: 'system',
      baseCurrency: 'INR',
      supportedCurrencies: ['INR', 'USD'],
      timezone: 'Asia/Kolkata',
      gstRate: 18,
      integrations: { shopifyActive: false, indiaPostActive: false, metaAdsActive: false },
      maxOrdersPerMonth: 5000,
      allowEmployeeTracking: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  // Vendors
  const vendors = [
    { _id: uuidv4(), name: 'Sweet Ingredients Co.', contact: 'vendor1@example.com', phone: '+91-9876543210', defaultCurrency: 'INR', createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'PackRight Solutions', contact: 'vendor2@example.com', phone: '+91-9876543211', defaultCurrency: 'INR', createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Fresh Dairy Farms', contact: 'vendor3@example.com', phone: '+91-9876543212', defaultCurrency: 'INR', createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ];
  await db.collection('vendors').insertMany(vendors);

  // Raw Materials
  const rawMaterials = [
    { _id: uuidv4(), name: 'Belgian Chocolate', vendorId: vendors[0]._id, vendorName: vendors[0].name, pricePerUnit: 45, unitMeasurement: 'grams', defaultWastageBuffer: 5, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Organic Sugar', vendorId: vendors[0]._id, vendorName: vendors[0].name, pricePerUnit: 0.08, unitMeasurement: 'grams', defaultWastageBuffer: 3, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Premium Butter', vendorId: vendors[2]._id, vendorName: vendors[2].name, pricePerUnit: 0.55, unitMeasurement: 'grams', defaultWastageBuffer: 2, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Almond Flour', vendorId: vendors[0]._id, vendorName: vendors[0].name, pricePerUnit: 1.2, unitMeasurement: 'grams', defaultWastageBuffer: 4, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Vanilla Extract', vendorId: vendors[0]._id, vendorName: vendors[0].name, pricePerUnit: 15, unitMeasurement: 'ml', defaultWastageBuffer: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ];
  await db.collection('rawMaterials').insertMany(rawMaterials);

  // Packaging Materials
  const packagingMaterials = [
    { _id: uuidv4(), name: 'Premium Gift Box (Gold)', vendorId: vendors[1]._id, vendorName: vendors[1].name, pricePerUnit: 35, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Ribbon & Bow Set', vendorId: vendors[1]._id, vendorName: vendors[1].name, pricePerUnit: 8, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Outer Shipping Box', vendorId: vendors[1]._id, vendorName: vendors[1].name, pricePerUnit: 15, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Bubble Wrap', vendorId: vendors[1]._id, vendorName: vendors[1].name, pricePerUnit: 5, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Thank You Card', vendorId: vendors[1]._id, vendorName: vendors[1].name, pricePerUnit: 3, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ];
  await db.collection('packagingMaterials').insertMany(packagingMaterials);

  // SKU Recipes
  const skuRecipes = [
    {
      _id: uuidv4(), sku: 'GS-CHOCO-PREMIUM-500', productName: 'Premium Chocolate Gift Box (500g)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: 'Belgian Chocolate', quantity: 5, pricePerUnit: 45, unitMeasurement: 'units' },
        { materialId: rawMaterials[1]._id, name: 'Organic Sugar', quantity: 100, pricePerUnit: 0.08, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: 'Premium Butter', quantity: 80, pricePerUnit: 0.55, unitMeasurement: 'grams' },
        { materialId: rawMaterials[4]._id, name: 'Vanilla Extract', quantity: 2, pricePerUnit: 15, unitMeasurement: 'ml' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: 'Premium Gift Box (Gold)', pricePerUnit: 35 },
        { materialId: packagingMaterials[1]._id, name: 'Ribbon & Bow Set', pricePerUnit: 8 },
        { materialId: packagingMaterials[2]._id, name: 'Outer Shipping Box', pricePerUnit: 15 },
        { materialId: packagingMaterials[4]._id, name: 'Thank You Card', pricePerUnit: 3 },
      ],
      consumableCost: 12, totalWeightGrams: 620, defaultWastageBuffer: 5, monthlyWastageOverride: null,
      shopifySynced: false, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
    {
      _id: uuidv4(), sku: 'GS-ALMOND-TRUFFLE-250', productName: 'Almond Truffle Collection (250g)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: 'Belgian Chocolate', quantity: 3, pricePerUnit: 45, unitMeasurement: 'units' },
        { materialId: rawMaterials[3]._id, name: 'Almond Flour', quantity: 60, pricePerUnit: 1.2, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: 'Premium Butter', quantity: 40, pricePerUnit: 0.55, unitMeasurement: 'grams' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: 'Premium Gift Box (Gold)', pricePerUnit: 35 },
        { materialId: packagingMaterials[1]._id, name: 'Ribbon & Bow Set', pricePerUnit: 8 },
        { materialId: packagingMaterials[2]._id, name: 'Outer Shipping Box', pricePerUnit: 15 },
        { materialId: packagingMaterials[3]._id, name: 'Bubble Wrap', pricePerUnit: 5 },
      ],
      consumableCost: 8, totalWeightGrams: 330, defaultWastageBuffer: 4, monthlyWastageOverride: null,
      shopifySynced: false, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
    {
      _id: uuidv4(), sku: 'GS-MIXED-HAMPER-1KG', productName: 'Grand Mixed Gift Hamper (1kg)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: 'Belgian Chocolate', quantity: 8, pricePerUnit: 45, unitMeasurement: 'units' },
        { materialId: rawMaterials[1]._id, name: 'Organic Sugar', quantity: 200, pricePerUnit: 0.08, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: 'Premium Butter', quantity: 150, pricePerUnit: 0.55, unitMeasurement: 'grams' },
        { materialId: rawMaterials[3]._id, name: 'Almond Flour', quantity: 100, pricePerUnit: 1.2, unitMeasurement: 'grams' },
        { materialId: rawMaterials[4]._id, name: 'Vanilla Extract', quantity: 5, pricePerUnit: 15, unitMeasurement: 'ml' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: 'Premium Gift Box (Gold)', pricePerUnit: 55 },
        { materialId: packagingMaterials[1]._id, name: 'Ribbon & Bow Set', pricePerUnit: 8 },
        { materialId: packagingMaterials[2]._id, name: 'Outer Shipping Box', pricePerUnit: 22 },
        { materialId: packagingMaterials[3]._id, name: 'Bubble Wrap', pricePerUnit: 5 },
        { materialId: packagingMaterials[4]._id, name: 'Thank You Card', pricePerUnit: 3 },
      ],
      consumableCost: 18, totalWeightGrams: 1200, defaultWastageBuffer: 6, monthlyWastageOverride: null,
      shopifySynced: false, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
  ];
  await db.collection('skuRecipes').insertMany(skuRecipes);

  // Employees
  const employees = [
    { _id: uuidv4(), name: 'Ramesh Kumar', role: 'Packing Lead', monthlySalary: 25000, shiftStart: '09:00', shiftEnd: '18:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Sunita Devi', role: 'Chocolatier', monthlySalary: 35000, shiftStart: '08:00', shiftEnd: '17:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Ajay Yadav', role: 'Dispatch', monthlySalary: 20000, shiftStart: '10:00', shiftEnd: '19:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ];
  await db.collection('employees').insertMany(employees);

  // Pincodes for orders (for RTO location reporting)
  const pincodes = ['560001', '400001', '110001', '600001', '700001', '500001', '380001', '302001', '560040', '411001'];
  const cities = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Hyderabad', 'Ahmedabad', 'Jaipur', 'Bengaluru South', 'Pune'];

  // Generate orders for the last 7 days with new fields
  const statuses = ['Delivered', 'Delivered', 'Delivered', 'Delivered', 'RTO', 'In Transit', 'Delivered', 'Delivered', 'RTO', 'Delivered'];
  const shippingMethods = ['indiapost', 'indiapost', 'indiapost', 'manual', 'indiapost'];
  const orders = [];
  let orderNum = 1001;

  for (const day of days) {
    const orderCount = 5 + Math.floor(Math.random() * 8);
    for (let i = 0; i < orderCount; i++) {
      const recipe = skuRecipes[Math.floor(Math.random() * skuRecipes.length)];
      const basePrice = recipe.sku.includes('1KG') ? 2499 : recipe.sku.includes('500') ? 1299 : 899;
      const discount = Math.random() > 0.7 ? Math.floor(basePrice * 0.1) : 0;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const shippingMethod = shippingMethods[Math.floor(Math.random() * shippingMethods.length)];
      const shippingCost = shippingMethod === 'indiapost' ? (recipe.totalWeightGrams > 500 ? 85 : 45) : 120;
      const isUrgent = Math.random() > 0.85;
      const pincodeIdx = Math.floor(Math.random() * pincodes.length);
      const empIdx = Math.floor(Math.random() * employees.length);

      orders.push({
        _id: uuidv4(),
        orderId: `GS-${orderNum++}`,
        shopifyOrderId: `#SH${5000 + orderNum}`,
        sku: recipe.sku,
        productName: recipe.productName,
        customerName: ['Priya Sharma', 'Rahul Verma', 'Anita Desai', 'Vikram Patel', 'Sneha Gupta', 'Arjun Nair', 'Meera Iyer', 'Karan Singh'][Math.floor(Math.random() * 8)],
        salePrice: basePrice,
        discount: discount,
        status: status,
        shippingMethod: shippingMethod,
        shippingCost: shippingCost,
        indiaPostTariff: shippingMethod === 'indiapost' ? shippingCost : null,
        trackingNumber: shippingMethod === 'indiapost' ? `EB${100000000 + Math.floor(Math.random() * 900000000)}IN` : null,
        isUrgent: isUrgent,
        manualCourierName: isUrgent ? ['BlueDart', 'DTDC', 'Delhivery'][Math.floor(Math.random() * 3)] : null,
        manualShippingCost: isUrgent ? [150, 180, 200, 220][Math.floor(Math.random() * 4)] : null,
        preparedBy: employees[empIdx]._id,
        preparedByName: employees[empIdx].name,
        destinationPincode: pincodes[pincodeIdx],
        destinationCity: cities[pincodeIdx],
        orderDate: day.toISOString(),
        createdAt: day.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  }
  await db.collection('orders').insertMany(orders);

  // Update employee daily outputs with order references
  for (const emp of employees) {
    const empOrders = orders.filter(o => o.preparedBy === emp._id);
    const dailyOutputs = {};
    empOrders.forEach(o => {
      const date = o.orderDate.split('T')[0];
      if (!dailyOutputs[date]) dailyOutputs[date] = { date, ordersPrepared: 0, orderIds: [] };
      dailyOutputs[date].ordersPrepared++;
      dailyOutputs[date].orderIds.push(o.orderId);
    });
    await db.collection('employees').updateOne(
      { _id: emp._id },
      { $set: { dailyOutputs: Object.values(dailyOutputs) } }
    );
  }

  // Overhead Expenses
  const expenses = [];
  for (const day of days) {
    expenses.push({
      _id: uuidv4(), expenseName: 'Meta Ads - Daily', category: 'MetaAds',
      amount: 800 + Math.floor(Math.random() * 400), currency: 'INR', frequency: 'recurring',
      date: day.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
  }
  expenses.push(
    { _id: uuidv4(), expenseName: 'Kitchen Rent', category: 'Rent', amount: 45000, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), expenseName: 'Shopify Subscription', category: 'Software', amount: 2999, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), expenseName: 'Electricity Bill', category: 'Utilities', amount: 8500, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
  );
  await db.collection('overheadExpenses').insertMany(expenses);

  // Integrations (skip if already exists)
  const existingIntegrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
  if (!existingIntegrations) {
    await db.collection('integrations').insertOne({
      _id: 'integrations-config',
      shopify: { storeUrl: '', accessToken: '', active: false },
      indiaPost: { username: '', password: '', clientId: '', active: false, sandboxMode: true },
      metaAds: { token: '', adAccountId: '', active: false },
      exchangeRate: { apiKey: '', active: false },
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
  }

  return { message: 'Demo data seeded successfully!', seeded: true };
}

// ==================== META ADS SYNC ====================

async function metaAdsSyncSpend() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.metaAds?.token || !integrations?.metaAds?.adAccountId) {
    return { error: 'Meta Ads credentials not configured. Please enter your Access Token and Ad Account ID.', synced: 0 };
  }

  const { token, adAccountId } = integrations.metaAds;
  // Ensure act_ prefix
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  try {
    // Step 1: Get ad account currency
    const acctRes = await fetch(
      `https://graph.facebook.com/v19.0/${accountId}?fields=currency&access_token=${token}`
    );
    if (!acctRes.ok) {
      const errData = await acctRes.json().catch(() => ({}));
      return { error: `Meta API auth error: ${errData?.error?.message || acctRes.status}. Check your token and account ID.`, synced: 0 };
    }
    const acctData = await acctRes.json();
    const adCurrency = acctData.currency || 'USD';

    // Step 2: Get exchange rate if ad account is not in INR
    let exchangeRate = 1;
    if (adCurrency !== 'INR') {
      try {
        exchangeRate = await getExchangeRate(adCurrency, 'INR');
      } catch (e) {
        console.error('Exchange rate fetch failed, using fallback:', e.message);
        exchangeRate = adCurrency === 'USD' ? 83 : 1;
      }
    }

    // Step 3: Fetch daily insights for last 30 days
    let allInsights = [];
    let url = `https://graph.facebook.com/v19.0/${accountId}/insights?time_increment=1&date_preset=last_30d&fields=spend,date_start&access_token=${token}&limit=100`;

    while (url) {
      const insightsRes = await fetch(url);
      if (!insightsRes.ok) {
        const errData = await insightsRes.json().catch(() => ({}));
        return {
          error: `Meta Insights API error: ${errData?.error?.message || insightsRes.status}`,
          synced: allInsights.length,
        };
      }
      const insightsData = await insightsRes.json();
      allInsights = allInsights.concat(insightsData.data || []);
      url = insightsData.paging?.next || null;
    }

    if (allInsights.length === 0) {
      return { message: 'No ad spend data found for the last 30 days.', synced: 0, currency: adCurrency };
    }

    // Step 4: Upsert each day into dailyMarketingSpend collection
    let synced = 0;
    let totalSpendINR = 0;
    for (const day of allInsights) {
      const dateStr = day.date_start; // "YYYY-MM-DD"
      const rawSpend = parseFloat(day.spend) || 0;
      const spendInINR = adCurrency !== 'INR'
        ? Math.round(rawSpend * exchangeRate * 100) / 100
        : rawSpend;

      totalSpendINR += spendInINR;

      await db.collection('dailyMarketingSpend').updateOne(
        { date: dateStr },
        {
          $set: {
            date: dateStr,
            spendAmount: spendInINR,
            rawSpend: rawSpend,
            rawCurrency: adCurrency,
            exchangeRate: exchangeRate,
            currency: 'INR',
            source: 'meta_ads',
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
      synced++;
    }

    // Mark Meta Ads integration as active
    await db.collection('integrations').updateOne(
      { _id: 'integrations-config' },
      {
        $set: {
          'metaAds.active': true,
          'metaAds.lastSyncAt': new Date().toISOString(),
          'metaAds.adCurrency': adCurrency,
        },
      }
    );

    return {
      message: `Synced ${synced} days of ad spend. Total: \u20B9${Math.round(totalSpendINR).toLocaleString('en-IN')}${adCurrency !== 'INR' ? ` (converted from ${adCurrency} at ${exchangeRate.toFixed(2)})` : ''}`,
      synced,
      totalSpendINR: Math.round(totalSpendINR * 100) / 100,
      currency: adCurrency,
      exchangeRate: adCurrency !== 'INR' ? exchangeRate : 1,
    };
  } catch (err) {
    return { error: `Meta Ads sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== DASHBOARD (with date range) ====================

async function getDashboardData(params = {}) {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();
  const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
  const expenses = await db.collection('overheadExpenses').find({}).toArray();
  const tenantConfig = await db.collection('tenantConfig').findOne({});
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  // If Meta Ads is NOT active, filter out MetaAds expenses so marketing = ₹0
  const isMetaActive = integrations?.metaAds?.active === true;
  const effectiveExpenses = isMetaActive ? expenses : expenses.filter(e => e.category !== 'MetaAds');

  // Date range handling
  const now = new Date();
  let startDate, endDate;

  switch (params.range) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case '7days':
      startDate = new Date(now); startDate.setDate(startDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'alltime':
      startDate = new Date(2020, 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case 'custom':
      startDate = params.startDate ? new Date(params.startDate) : new Date(now); startDate.setHours(0, 0, 0, 0);
      endDate = params.endDate ? new Date(params.endDate) : new Date(now); endDate.setHours(23, 59, 59, 999);
      break;
    default: // default to 7 days
      startDate = new Date(now); startDate.setDate(startDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }

  // Get exchange rate for currency conversion
  const exchangeRate = await getExchangeRate('USD', 'INR');

  const metrics = calculateDashboardMetrics(orders, skuRecipes, effectiveExpenses, startDate, endDate, 1);

  // Build daily aggregation for chart
  const dailyData = [];
  const dayMs = 86400000;
  const chartStart = new Date(startDate);
  const chartEnd = new Date(endDate);

  for (let d = new Date(chartStart); d <= chartEnd; d = new Date(d.getTime() + dayMs)) {
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);

    const dayOrders = orders.filter(o => {
      const od = new Date(o.orderDate);
      return od >= dayStart && od <= dayEnd;
    });

    const dayAdSpend = effectiveExpenses.filter(e => {
      const ed = new Date(e.date); ed.setHours(0, 0, 0, 0);
      return ed.getTime() === dayStart.getTime() && e.category === 'MetaAds';
    }).reduce((sum, e) => sum + (e.amount || 0), 0);

    const skuMap = {};
    skuRecipes.forEach(r => { skuMap[r.sku] = r; });

    let dayProfit = 0, dayRevenue = 0, dayCOGS = 0, dayShipping = 0;
    dayOrders.forEach(order => {
      const profit = calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrders.length, 1);
      dayProfit += profit.netProfit;
      dayRevenue += profit.netRevenue;
      dayCOGS += profit.totalCOGS;
      dayShipping += profit.shippingCost;
    });

    dailyData.push({
      date: dayStart.toISOString().split('T')[0],
      label: dayStart.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
      orders: dayOrders.length,
      revenue: Math.round(dayRevenue),
      cogs: Math.round(dayCOGS),
      shipping: Math.round(dayShipping),
      adSpend: dayAdSpend,
      netProfit: Math.round(dayProfit),
      rtoCount: dayOrders.filter(o => o.status === 'RTO').length,
    });
  }

  // All-time stats
  const allTimeMetrics = calculateDashboardMetrics(orders, skuRecipes, effectiveExpenses, new Date(2020, 0, 1), new Date(now.getFullYear() + 1, 0, 1), 1);

  return {
    tenant: tenantConfig,
    exchangeRate,
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString(), range: params.range || '7days' },
    filtered: {
      netProfit: metrics.netProfit,
      grossOrderProfit: metrics.grossOrderProfit,
      totalOrders: metrics.totalOrders,
      rtoRate: metrics.rtoRate,
      roas: metrics.roas,
      revenue: metrics.revenue,
      adSpend: metrics.adSpend,
      rtoCount: metrics.rtoCount,
    },
    overhead: metrics.overhead,
    allTime: {
      totalOrders: allTimeMetrics.totalOrders,
      netProfit: allTimeMetrics.netProfit,
      revenue: allTimeMetrics.revenue,
      rtoCount: allTimeMetrics.rtoCount,
      rtoRate: allTimeMetrics.totalOrders > 0 ? Math.round((allTimeMetrics.rtoCount / allTimeMetrics.totalOrders) * 10000) / 100 : 0,
    },
    dailyData,
    recentOrders: metrics.orderProfits.slice(0, 25).map(profit => {
      const order = orders.find(o => (o._id || o.id) === profit.orderId);
      return { ...profit, ...(order || {}), _profitData: profit };
    }),
  };
}

// ==================== REPORTS ====================

async function getReportProfitableSkus(params) {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();
  const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
  const allExpenses = await db.collection('overheadExpenses').find({}).toArray();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
  const isMetaActive = integrations?.metaAds?.active === true;
  const expenses = isMetaActive ? allExpenses : allExpenses.filter(e => e.category !== 'MetaAds');

  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.orderDate);
    return d >= startDate && d <= endDate;
  });

  const skuMap = {};
  skuRecipes.forEach(r => { skuMap[r.sku] = r; });

  // Group by SKU
  const skuStats = {};
  filteredOrders.forEach(order => {
    if (!skuStats[order.sku]) {
      skuStats[order.sku] = { sku: order.sku, productName: order.productName, totalOrders: 0, totalRevenue: 0, totalProfit: 0, totalCOGS: 0, rtoCount: 0 };
    }
    const s = skuStats[order.sku];
    s.totalOrders++;
    s.totalRevenue += order.salePrice || 0;
    if (order.status === 'RTO') s.rtoCount++;

    const orderDate = new Date(order.orderDate); orderDate.setHours(0, 0, 0, 0);
    const dayOrders = filteredOrders.filter(o => { const d = new Date(o.orderDate); d.setHours(0, 0, 0, 0); return d.getTime() === orderDate.getTime(); });
    const dayAd = expenses.filter(e => { const d = new Date(e.date); d.setHours(0, 0, 0, 0); return d.getTime() === orderDate.getTime() && e.category === 'MetaAds'; }).reduce((sum, e) => sum + (e.amount || 0), 0);

    const profit = calculateOrderProfit(order, skuMap[order.sku], dayAd, dayOrders.length, 1);
    s.totalProfit += profit.netProfit;
    s.totalCOGS += profit.totalCOGS;
  });

  return Object.values(skuStats).sort((a, b) => b.totalProfit - a.totalProfit).map(s => ({
    ...s,
    avgProfitPerOrder: s.totalOrders > 0 ? Math.round(s.totalProfit / s.totalOrders) : 0,
    profitMargin: s.totalRevenue > 0 ? Math.round((s.totalProfit / s.totalRevenue) * 10000) / 100 : 0,
    rtoRate: s.totalOrders > 0 ? Math.round((s.rtoCount / s.totalOrders) * 10000) / 100 : 0,
    totalRevenue: Math.round(s.totalRevenue),
    totalProfit: Math.round(s.totalProfit),
    totalCOGS: Math.round(s.totalCOGS),
  }));
}

async function getReportRtoLocations(params) {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();

  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.orderDate);
    return d >= startDate && d <= endDate;
  });

  // Group by pincode
  const pincodeStats = {};
  filteredOrders.forEach(order => {
    const pin = order.destinationPincode || 'Unknown';
    if (!pincodeStats[pin]) {
      pincodeStats[pin] = { pincode: pin, city: order.destinationCity || 'Unknown', totalOrders: 0, rtoCount: 0, deliveredCount: 0 };
    }
    pincodeStats[pin].totalOrders++;
    if (order.status === 'RTO') pincodeStats[pin].rtoCount++;
    if (order.status === 'Delivered') pincodeStats[pin].deliveredCount++;
  });

  return Object.values(pincodeStats).sort((a, b) => b.rtoCount - a.rtoCount).map(p => ({
    ...p,
    rtoRate: p.totalOrders > 0 ? Math.round((p.rtoCount / p.totalOrders) * 10000) / 100 : 0,
  }));
}

async function getReportEmployeeOutput(params) {
  const db = await getDb();
  const employees = await db.collection('employees').find({}).toArray();
  const orders = await db.collection('orders').find({}).toArray();

  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return employees.map(emp => {
    const empOrders = orders.filter(o => o.preparedBy === emp._id && new Date(o.orderDate) >= startDate && new Date(o.orderDate) <= endDate);
    const rtoOrders = empOrders.filter(o => o.status === 'RTO');
    const deliveredOrders = empOrders.filter(o => o.status === 'Delivered');
    return {
      employeeId: emp._id,
      name: emp.name,
      role: emp.role,
      monthlySalary: emp.monthlySalary,
      totalOrdersPrepared: empOrders.length,
      deliveredCount: deliveredOrders.length,
      rtoCount: rtoOrders.length,
      errorRate: empOrders.length > 0 ? Math.round((rtoOrders.length / empOrders.length) * 10000) / 100 : 0,
      dailyAverage: Math.round(empOrders.length / 7 * 10) / 10,
    };
  }).sort((a, b) => b.totalOrdersPrepared - a.totalOrdersPrepared);
}

// ==================== SHOPIFY SYNC ====================

async function shopifySyncProducts() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.shopify?.storeUrl || !integrations?.shopify?.accessToken) {
    return { error: 'Shopify credentials not configured. Go to Integrations to add your store URL and access token.', synced: 0 };
  }

  const { storeUrl, accessToken } = integrations.shopify;
  const baseUrl = storeUrl.includes('https://') ? storeUrl : `https://${storeUrl}`;

  let allProducts = [];
  let pageInfo = null;
  let url = `${baseUrl}/admin/api/2024-01/products.json?limit=250&status=active`;

  try {
    // Paginate through all products
    for (let page = 0; page < 20; page++) {
      const fetchUrl = pageInfo ? `${baseUrl}/admin/api/2024-01/products.json?limit=250&page_info=${pageInfo}` : url;
      const res = await fetch(fetchUrl, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Shopify API error: ${res.status} - ${errText}`, synced: 0 };
      }

      const data = await res.json();
      allProducts = allProducts.concat(data.products || []);

      // Check for next page via Link header
      const linkHeader = res.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^>&]*)/);
        pageInfo = match ? match[1] : null;
        if (!pageInfo) break;
      } else {
        break;
      }
    }

    // Transform Shopify products into SKU Recipes
    let synced = 0;
    for (const product of allProducts) {
      for (const variant of (product.variants || [])) {
        const sku = variant.sku || `SHOP-${variant.id}`;
        const existing = await db.collection('skuRecipes').findOne({ sku });

        if (!existing) {
          await db.collection('skuRecipes').insertOne({
            _id: uuidv4(),
            sku,
            productName: variant.title !== 'Default Title' ? `${product.title} - ${variant.title}` : product.title,
            shopifyProductId: String(product.id),
            shopifyVariantId: String(variant.id),
            shopifyPrice: parseFloat(variant.price) || 0,
            rawMaterials: [],
            packaging: [],
            consumableCost: 0,
            totalWeightGrams: variant.grams || (variant.weight ? variant.weight * (variant.weight_unit === 'kg' ? 1000 : 1) : 0),
            defaultWastageBuffer: 5,
            monthlyWastageOverride: null,
            shopifySynced: true,
            needsCostInput: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          synced++;
        } else if (existing.shopifySynced) {
          // Update price from Shopify but keep cost data
          await db.collection('skuRecipes').updateOne({ _id: existing._id }, {
            $set: {
              shopifyPrice: parseFloat(variant.price) || 0,
              productName: variant.title !== 'Default Title' ? `${product.title} - ${variant.title}` : product.title,
              totalWeightGrams: variant.grams || existing.totalWeightGrams,
              updatedAt: new Date().toISOString(),
            }
          });
        }
      }
    }

    return { message: `Synced ${synced} new SKUs from ${allProducts.length} products`, synced, totalProducts: allProducts.length };
  } catch (err) {
    return { error: `Shopify sync failed: ${err.message}`, synced: 0 };
  }
}

async function shopifySyncOrders() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.shopify?.storeUrl || !integrations?.shopify?.accessToken) {
    return { error: 'Shopify credentials not configured.', synced: 0 };
  }

  const { storeUrl, accessToken } = integrations.shopify;
  const baseUrl = storeUrl.includes('https://') ? storeUrl : `https://${storeUrl}`;

  try {
    let allShopifyOrders = [];
    let pageInfo = null;
    let url = `${baseUrl}/admin/api/2024-01/orders.json?limit=250&status=any`;

    // Paginate through ALL Shopify orders
    for (let page = 0; page < 50; page++) {
      const fetchUrl = pageInfo
        ? `${baseUrl}/admin/api/2024-01/orders.json?limit=250&page_info=${pageInfo}`
        : url;

      const res = await fetch(fetchUrl, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Shopify API error: ${res.status} - ${errText}`, synced: allShopifyOrders.length > 0 ? 'partial' : 0 };
      }

      const data = await res.json();
      allShopifyOrders = allShopifyOrders.concat(data.orders || []);

      // Check for next page via Link header
      const linkHeader = res.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^>&]*)/);
        pageInfo = match ? match[1] : null;
        if (!pageInfo) break;
      } else {
        break;
      }
    }

    let synced = 0;
    let updated = 0;

    for (const shopifyOrder of allShopifyOrders) {
      const shopifyOrderIdStr = String(shopifyOrder.id);

      // Map Shopify fulfillment status to our status
      let status = 'Unfulfilled';
      if (shopifyOrder.fulfillment_status === 'fulfilled') {
        status = 'Delivered';
      } else if (shopifyOrder.fulfillment_status === 'partial') {
        status = 'In Transit';
      } else if (shopifyOrder.cancelled_at) {
        status = 'Cancelled';
      }

      // Use the REAL Shopify date — created_at is the order placement time
      const shopifyDate = shopifyOrder.created_at || shopifyOrder.processed_at || shopifyOrder.updated_at;

      // Check if order already exists
      const existingOrder = await db.collection('orders').findOne({ shopifyOrderId: shopifyOrderIdStr });

      if (existingOrder) {
        // Update existing order with correct date and status if changed
        const updateFields = {};
        if (existingOrder.orderDate !== shopifyDate) updateFields.orderDate = shopifyDate;
        if (existingOrder.status !== status && !existingOrder.statusOverridden) updateFields.status = status;
        if (Object.keys(updateFields).length > 0) {
          updateFields.updatedAt = new Date().toISOString();
          await db.collection('orders').updateOne({ _id: existingOrder._id }, { $set: updateFields });
          updated++;
        }
        continue;
      }

      // Calculate per-line-item shipping split
      const totalLineItems = (shopifyOrder.line_items || []).length || 1;
      const totalShipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 0);
      const totalDiscount = parseFloat(shopifyOrder.total_discounts || 0);

      for (const item of (shopifyOrder.line_items || [])) {
        const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;

        await db.collection('orders').insertOne({
          _id: uuidv4(),
          orderId: `SH-${shopifyOrder.order_number || shopifyOrder.id}`,
          shopifyOrderId: shopifyOrderIdStr,
          sku: sku,
          productName: item.title || item.name,
          customerName: shopifyOrder.customer ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim() : 'Unknown',
          salePrice: parseFloat(item.price) * (item.quantity || 1),
          discount: totalDiscount / totalLineItems,
          status,
          shippingMethod: 'shopify',
          shippingCost: totalShipping / totalLineItems,
          isUrgent: false,
          manualCourierName: null,
          manualShippingCost: null,
          preparedBy: null,
          preparedByName: null,
          destinationPincode: shopifyOrder.shipping_address?.zip || '',
          destinationCity: shopifyOrder.shipping_address?.city || '',
          orderDate: shopifyDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        synced++;
      }
    }

    return {
      message: `Synced ${synced} new orders, updated ${updated} existing. Total Shopify orders: ${allShopifyOrders.length}`,
      synced, updated, totalShopifyOrders: allShopifyOrders.length
    };
  } catch (err) {
    return { error: `Shopify order sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== INDIA POST TRACKING ====================

async function indiaPostBulkTrack() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.indiaPost?.username || !integrations?.indiaPost?.password) {
    return { error: 'India Post credentials not configured.', tracked: 0 };
  }

  const { username, password, sandboxMode } = integrations.indiaPost;
  const baseUrl = sandboxMode ? 'https://test.cept.gov.in/beextcustomer/v1' : 'https://cept.gov.in/beextcustomer/v1';

  try {
    // Step 1: Login to get access token
    const loginRes = await fetch(`${baseUrl}/access/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!loginRes.ok) {
      return { error: `India Post login failed: ${loginRes.status}`, tracked: 0 };
    }

    const loginData = await loginRes.json();
    const accessToken = loginData.access_token;
    if (!accessToken) {
      return { error: 'No access token received from India Post', tracked: 0 };
    }

    // Step 2: Get all orders with tracking numbers that need updates
    const pendingOrders = await db.collection('orders').find({
      trackingNumber: { $ne: null },
      status: { $in: ['In Transit', 'Booked', 'Pending'] },
    }).toArray();

    if (pendingOrders.length === 0) {
      return { message: 'No orders pending tracking updates', tracked: 0 };
    }

    // Step 3: Chunk into batches of 50 for bulk tracking
    const chunks = [];
    for (let i = 0; i < pendingOrders.length; i += 50) {
      chunks.push(pendingOrders.slice(i, i + 50));
    }

    let totalTracked = 0;
    let totalDelivered = 0;
    let totalRTO = 0;

    for (const chunk of chunks) {
      const trackingNumbers = chunk.map(o => o.trackingNumber);
      const trackRes = await fetch(`${baseUrl}/tracking/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bulk: trackingNumbers }),
      });

      if (!trackRes.ok) continue;
      const trackData = await trackRes.json();

      for (const item of (trackData.data || [])) {
        const trackingNum = item.booking_details?.article_number;
        if (!trackingNum) continue;

        const order = chunk.find(o => o.trackingNumber === trackingNum);
        if (!order) continue;

        // Scan events for delivery or RTO
        const events = item.tracking_details || [];
        let newStatus = order.status;
        let tariff = item.booking_details?.tariff || order.indiaPostTariff;

        for (const event of events) {
          const eventName = (event.event || '').toLowerCase();
          if (eventName.includes('item delivered') || eventName.includes('delivered')) {
            newStatus = 'Delivered';
            break;
          }
          if (eventName.includes('returned') || eventName.includes('rto') || eventName.includes('return to origin')) {
            newStatus = 'RTO';
            break;
          }
        }

        if (newStatus !== order.status) {
          await db.collection('orders').updateOne({ _id: order._id }, {
            $set: { status: newStatus, indiaPostTariff: tariff, updatedAt: new Date().toISOString() }
          });
          totalTracked++;
          if (newStatus === 'Delivered') totalDelivered++;
          if (newStatus === 'RTO') totalRTO++;
        }
      }
    }

    return {
      message: `Tracked ${pendingOrders.length} shipments. Updated: ${totalTracked} (${totalDelivered} delivered, ${totalRTO} RTO)`,
      tracked: totalTracked, delivered: totalDelivered, rto: totalRTO,
    };
  } catch (err) {
    return { error: `India Post tracking failed: ${err.message}`, tracked: 0 };
  }
}

// ==================== ROUTE HANDLERS ====================

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export async function GET(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const subResource = segments[1];
    const thirdSegment = segments[2];
    const params = getSearchParams(request);

    switch (resource) {
      case 'dashboard':
        return json(await getDashboardData(params));

      case 'reports':
        switch (subResource) {
          case 'profitable-skus':
            return json(await getReportProfitableSkus(params));
          case 'rto-locations':
            return json(await getReportRtoLocations(params));
          case 'employee-output':
            return json(await getReportEmployeeOutput(params));
          default:
            return json({ error: 'Unknown report type' }, 404);
        }

      case 'tenant-config': {
        const db = await getDb();
        return json(await db.collection('tenantConfig').findOne({}) || {});
      }

      case 'currency': {
        const from = params.from || 'USD';
        const to = params.to || 'INR';
        const amount = parseFloat(params.amount || 1);
        const rate = await getExchangeRate(from, to);
        return json({ from, to, rate, amount, converted: Math.round(amount * rate * 100) / 100 });
      }

      case 'vendors':
        if (subResource) return json(await getDoc('vendors', subResource));
        return json(await listDocs('vendors'));

      case 'raw-materials':
        if (subResource) return json(await getDoc('rawMaterials', subResource));
        return json(await listDocs('rawMaterials'));

      case 'packaging-materials':
        if (subResource) return json(await getDoc('packagingMaterials', subResource));
        return json(await listDocs('packagingMaterials'));

      case 'sku-recipes':
        if (subResource) return json(await getDoc('skuRecipes', subResource));
        return json(await listDocs('skuRecipes'));

      case 'orders': {
        if (subResource) return json(await getDoc('orders', subResource));

        const db = await getDb();
        const query = {};
        if (params.status && params.status !== 'all') query.status = params.status;
        if (params.sku) query.sku = params.sku;

        // Search by orderId or customerName (case-insensitive)
        if (params.search && params.search.trim()) {
          const s = params.search.trim();
          query.$or = [
            { orderId: { $regex: s, $options: 'i' } },
            { customerName: { $regex: s, $options: 'i' } },
            { sku: { $regex: s, $options: 'i' } },
            { productName: { $regex: s, $options: 'i' } },
          ];
        }

        // Pagination
        const page = Math.max(1, parseInt(params.page) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 20));
        const skip = (page - 1) * limit;

        // Sort — default: orderDate descending (newest first)
        const sortBy = params.sortBy || 'orderDate';
        const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
        const sortObj = { [sortBy]: sortOrder };

        const total = await db.collection('orders').countDocuments(query);
        const orders = await db.collection('orders')
          .find(query)
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .toArray();

        return json({
          orders,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      }

      case 'employees':
        if (subResource) return json(await getDoc('employees', subResource));
        return json(await listDocs('employees'));

      case 'overhead-expenses':
        if (subResource) return json(await getDoc('overheadExpenses', subResource));
        return json(await listDocs('overheadExpenses'));

      case 'integrations': {
        const db = await getDb();
        const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
        if (integrations) {
          const masked = JSON.parse(JSON.stringify(integrations));
          if (masked.shopify?.accessToken) masked.shopify.accessToken = masked.shopify.accessToken.replace(/.(?=.{4})/g, '*');
          if (masked.indiaPost?.password) masked.indiaPost.password = '********';
          if (masked.metaAds?.token) masked.metaAds.token = masked.metaAds.token.replace(/.(?=.{4})/g, '*');
          if (masked.exchangeRate?.apiKey) masked.exchangeRate.apiKey = masked.exchangeRate.apiKey.replace(/.(?=.{4})/g, '*');
          return json(masked);
        }
        return json({});
      }

      case 'calculate-profit': {
        if (!subResource) return json({ error: 'Order ID required' }, 400);
        const db = await getDb();
        const order = await db.collection('orders').findOne({ _id: subResource });
        if (!order) return json({ error: 'Order not found' }, 404);
        const recipe = await db.collection('skuRecipes').findOne({ sku: order.sku });
        const integ = await db.collection('integrations').findOne({ _id: 'integrations-config' });
        const metaActive = integ?.metaAds?.active === true;
        const adExpenses = metaActive
          ? await db.collection('overheadExpenses').find({ category: 'MetaAds' }).toArray()
          : [];
        const orderDate = new Date(order.orderDate); orderDate.setHours(0, 0, 0, 0);
        const allOrders = await db.collection('orders').find({}).toArray();
        const dayOrders = allOrders.filter(o => {
          const d = new Date(o.orderDate); d.setHours(0, 0, 0, 0);
          return d.getTime() === orderDate.getTime();
        });
        const dayAdSpend = adExpenses.filter(e => {
          const d = new Date(e.date); d.setHours(0, 0, 0, 0);
          return d.getTime() === orderDate.getTime();
        }).reduce((sum, e) => sum + (e.amount || 0), 0);
        const profit = calculateOrderProfit(order, recipe, dayAdSpend, dayOrders.length || 1, 1);
        return json(profit);
      }

      default:
        return json({ error: 'Not found', path: segments }, 404);
    }
  } catch (error) {
    console.error('GET Error:', error);
    return json({ error: error.message }, 500);
  }
}

export async function POST(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const subResource = segments[1];
    let body = {};
    try { body = await request.json(); } catch (e) {}

    switch (resource) {
      case 'seed':
        return json(await seedData());

      case 'shopify':
        if (subResource === 'sync-products') return json(await shopifySyncProducts());
        if (subResource === 'sync-orders') return json(await shopifySyncOrders());
        return json({ error: 'Unknown Shopify action' }, 404);

      case 'indiapost':
        if (subResource === 'track-bulk') return json(await indiaPostBulkTrack());
        return json({ error: 'Unknown India Post action' }, 404);

      case 'employee-claim': {
        // Bulk claim: accepts single orderId or array of orderIds
        const { employeeId, orderId, orderIds: rawOrderIds } = body;
        if (!employeeId) return json({ error: 'employeeId required' }, 400);

        // Build array of order IDs from either field
        let orderIdList = [];
        if (rawOrderIds && Array.isArray(rawOrderIds)) {
          orderIdList = rawOrderIds;
        } else if (orderId) {
          // Support comma/newline separated string
          orderIdList = String(orderId).split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
        }
        if (orderIdList.length === 0) return json({ error: 'At least one orderId required' }, 400);

        const db = await getDb();
        const employee = await db.collection('employees').findOne({ _id: employeeId });
        if (!employee) return json({ error: 'Employee not found' }, 404);

        const today = new Date().toISOString().split('T')[0];
        const results = { claimed: [], notFound: [] };

        for (const oid of orderIdList) {
          const order = await db.collection('orders').findOne({ orderId: oid });
          if (!order) {
            results.notFound.push(oid);
            continue;
          }

          // Update order with preparedBy
          await db.collection('orders').updateOne({ _id: order._id }, {
            $set: { preparedBy: employeeId, preparedByName: employee.name, updatedAt: new Date().toISOString() }
          });
          results.claimed.push(oid);
        }

        // Update employee daily outputs in one go
        if (results.claimed.length > 0) {
          const freshEmployee = await db.collection('employees').findOne({ _id: employeeId });
          const dailyOutputs = freshEmployee.dailyOutputs || [];
          const todayEntry = dailyOutputs.find(d => d.date === today);
          if (todayEntry) {
            for (const oid of results.claimed) {
              if (!todayEntry.orderIds.includes(oid)) {
                todayEntry.orderIds.push(oid);
              }
            }
            todayEntry.ordersPrepared = todayEntry.orderIds.length;
            await db.collection('employees').updateOne({ _id: employeeId }, { $set: { dailyOutputs } });
          } else {
            await db.collection('employees').updateOne({ _id: employeeId }, {
              $push: { dailyOutputs: { date: today, ordersPrepared: results.claimed.length, orderIds: results.claimed } }
            });
          }
        }

        return json({
          message: `${results.claimed.length} order(s) claimed by ${employee.name}${results.notFound.length > 0 ? `. ${results.notFound.length} not found.` : ''}`,
          claimed: results.claimed,
          notFound: results.notFound,
          employee: employee.name,
        });
      }

      case 'purge': {
        // Purge all demo data but keep tenantConfig and integrations
        const db = await getDb();
        const collections = ['orders', 'skuRecipes', 'rawMaterials', 'packagingMaterials', 'vendors', 'employees', 'overheadExpenses'];
        const counts = {};
        for (const col of collections) {
          const result = await db.collection(col).deleteMany({});
          counts[col] = result.deletedCount;
        }
        return json({ message: 'All demo data purged. TenantConfig and Integrations preserved.', purged: counts });
      }

      case 'vendors':
        return json(await createDoc('vendors', body), 201);
      case 'raw-materials':
        return json(await createDoc('rawMaterials', body), 201);
      case 'packaging-materials':
        return json(await createDoc('packagingMaterials', body), 201);
      case 'sku-recipes':
        return json(await createDoc('skuRecipes', body), 201);
      case 'orders':
        return json(await createDoc('orders', body), 201);
      case 'employees':
        return json(await createDoc('employees', body), 201);
      case 'overhead-expenses':
        return json(await createDoc('overheadExpenses', body), 201);

      default:
        return json({ error: 'Not found' }, 404);
    }
  } catch (error) {
    console.error('POST Error:', error);
    return json({ error: error.message }, 500);
  }
}

export async function PUT(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const id = segments[1];
    const action = segments[2]; // For /orders/{id}/urgent or /orders/{id}/assign
    let body = {};
    try { body = await request.json(); } catch (e) {}

    switch (resource) {
      case 'tenant-config': {
        const db = await getDb();
        const existing = await db.collection('tenantConfig').findOne({});
        if (existing) {
          await db.collection('tenantConfig').updateOne({ _id: existing._id }, { $set: { ...body, updatedAt: new Date().toISOString() } });
        } else {
          await db.collection('tenantConfig').insertOne({ _id: 'tenant-1', ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
        return json(await db.collection('tenantConfig').findOne({}));
      }

      case 'integrations': {
        const db = await getDb();
        const updateData = { ...body, updatedAt: new Date().toISOString() };
        delete updateData._id;
        await db.collection('integrations').updateOne({ _id: 'integrations-config' }, { $set: updateData }, { upsert: true });
        return json({ message: 'Integrations updated successfully' });
      }

      case 'orders': {
        if (!id) return json({ error: 'ID required' }, 400);

        // Handle sub-actions: /orders/{id}/urgent, /orders/{id}/assign
        if (action === 'urgent') {
          const db = await getDb();
          const order = await db.collection('orders').findOne({ _id: id });
          if (!order) return json({ error: 'Order not found' }, 404);
          await db.collection('orders').updateOne({ _id: id }, {
            $set: {
              isUrgent: true,
              manualCourierName: body.manualCourierName || '',
              manualShippingCost: Number(body.manualShippingCost) || 0,
              shippingMethod: 'manual',
              updatedAt: new Date().toISOString(),
            }
          });
          return json(await db.collection('orders').findOne({ _id: id }));
        }

        if (action === 'assign') {
          const db = await getDb();
          const employee = await db.collection('employees').findOne({ _id: body.employeeId });
          if (!employee) return json({ error: 'Employee not found' }, 404);
          await db.collection('orders').updateOne({ _id: id }, {
            $set: { preparedBy: body.employeeId, preparedByName: employee.name, updatedAt: new Date().toISOString() }
          });
          return json(await db.collection('orders').findOne({ _id: id }));
        }

        return json(await updateDoc('orders', id, body));
      }

      case 'vendors':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('vendors', id, body));
      case 'raw-materials':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('rawMaterials', id, body));
      case 'packaging-materials':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('packagingMaterials', id, body));
      case 'sku-recipes':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('skuRecipes', id, body));
      case 'employees':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('employees', id, body));
      case 'overhead-expenses':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('overheadExpenses', id, body));

      default:
        return json({ error: 'Not found' }, 404);
    }
  } catch (error) {
    console.error('PUT Error:', error);
    return json({ error: error.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const id = segments[1];
    if (!id) return json({ error: 'ID required' }, 400);

    const collectionMap = {
      'vendors': 'vendors',
      'raw-materials': 'rawMaterials',
      'packaging-materials': 'packagingMaterials',
      'sku-recipes': 'skuRecipes',
      'orders': 'orders',
      'employees': 'employees',
      'overhead-expenses': 'overheadExpenses',
    };

    const collection = collectionMap[resource];
    if (!collection) return json({ error: 'Not found' }, 404);
    const deleted = await deleteDoc(collection, id);
    if (!deleted) return json({ error: 'Not found' }, 404);
    return json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('DELETE Error:', error);
    return json({ error: error.message }, 500);
  }
}
