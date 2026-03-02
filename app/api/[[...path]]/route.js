import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { v4 as uuidv4 } from 'uuid';
import { calculateOrderProfit, calculateDashboardMetrics, calculateProratedOverhead, getISTDateKey } from '@/lib/profitCalculator';

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

// ==================== STRICT IST DATE CONVERSION ====================
// Converts any date string to an ISO string anchored at Asia/Kolkata (+05:30)
// Prevents date drift where a UTC midnight order shows as the wrong calendar day in IST
function toISTISO(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  const g = (type) => parts.find(p => p.type === type)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}+05:30`;
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
      shopifyTxnFeeRate: 2,
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
      const errMsg = errData?.error?.message || `HTTP ${acctRes.status}`;
      // Graceful handling for common Meta auth errors
      if (errMsg.includes('Invalid OAuth') || errMsg.includes('access token') || acctRes.status === 190) {
        return { error: `Invalid Meta Ads Access Token. Please regenerate your token in Meta Business Manager and update it in the Integrations panel.`, synced: 0 };
      }
      if (errMsg.includes('ad account') || acctRes.status === 100) {
        return { error: `Invalid Ad Account ID "${adAccountId}". Please verify the ID in Meta Ads Manager (format: act_XXXXXXXXX).`, synced: 0 };
      }
      return { error: `Meta API error: ${errMsg}`, synced: 0 };
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

  // Always filter out old MetaAds expense entries — ad spend now lives in dailyMarketingSpend
  const overheadExpenses = expenses.filter(e => e.category !== 'MetaAds');

  // Build adSpendMap from dailyMarketingSpend collection (only if Meta active)
  const isMetaActive = integrations?.metaAds?.active === true;
  const dailySpends = isMetaActive
    ? await db.collection('dailyMarketingSpend').find({}).toArray()
    : [];
  const adSpendMap = {};
  dailySpends.forEach(s => { adSpendMap[s.date] = s.spendAmount || 0; });

  // Ad spend tax multiplier from tenant config (18% GST in India)
  const adSpendTaxRate = tenantConfig?.adSpendTaxRate ?? 18;
  const adSpendTaxMultiplier = 1 + (adSpendTaxRate / 100);

  // Date range handling — ALL ranges use IST (Asia/Kolkata) date strings
  const now = new Date();
  const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let startDate, endDate;

  switch (params.range) {
    case 'today':
      startDate = todayIST;
      endDate = todayIST;
      break;
    case '7days': {
      const d7 = new Date(now.getTime() - 6 * 86400000);
      startDate = d7.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      endDate = todayIST;
      break;
    }
    case 'month': {
      const [y, m] = todayIST.split('-');
      startDate = `${y}-${m}-01`;
      endDate = todayIST;
      break;
    }
    case 'alltime':
      startDate = '2020-01-01';
      endDate = '2030-12-31';
      break;
    case 'custom':
      startDate = params.startDate || todayIST;
      endDate = params.endDate || todayIST;
      break;
    default: {
      const d7d = new Date(now.getTime() - 6 * 86400000);
      startDate = d7d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      endDate = todayIST;
    }
  }

  // Get exchange rate for currency conversion
  const exchangeRate = await getExchangeRate('USD', 'INR');

  const calcOptions = { shopifyTxnFeeRate: tenantConfig.shopifyTxnFeeRate || 0 };
  const metrics = calculateDashboardMetrics(orders, skuRecipes, overheadExpenses, startDate, endDate, 1, adSpendMap, adSpendTaxMultiplier, calcOptions);

  // Build daily aggregation for chart — using IST date boundaries
  const dailyData = [];
  const dayMs = 86400000;

  const skuMap = {};
  skuRecipes.forEach(r => { skuMap[r.sku] = r; });

  // Generate IST date keys for each day in the range
  let cd = new Date(startDate + 'T12:00:00+05:30'); // noon IST to avoid edge cases
  const chartEndD = new Date(endDate + 'T12:00:00+05:30');
  while (cd <= chartEndD) {
    const dateKey = cd.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const dayStart = new Date(dateKey + 'T00:00:00+05:30');
    const dayEnd = new Date(dateKey + 'T23:59:59.999+05:30');

    const dayOrders = orders.filter(o => {
      const od = new Date(o.orderDate);
      return od >= dayStart && od <= dayEnd;
    });

    // Use adSpendMap for daily ad spend lookup (IST-keyed)
    const dayAdSpend = adSpendMap[dateKey] || 0;
    const dayAdSpendTaxed = dayAdSpend * adSpendTaxMultiplier;

    let dayProfit = 0, dayRevenue = 0, dayCOGS = 0, dayShipping = 0;
    dayOrders.forEach(order => {
      const profit = calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrders.length, 1, adSpendTaxMultiplier, calcOptions);
      dayProfit += profit.netProfit;
      dayRevenue += profit.netRevenue;
      dayCOGS += profit.totalCOGS;
      dayShipping += profit.shippingCost;
    });

    dailyData.push({
      date: dateKey,
      label: dayStart.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }),
      orders: dayOrders.length,
      revenue: Math.round(dayRevenue),
      cogs: Math.round(dayCOGS),
      shipping: Math.round(dayShipping),
      adSpend: Math.round(dayAdSpendTaxed),
      netProfit: Math.round(dayProfit),
      rtoCount: dayOrders.filter(o => o.status === 'RTO').length,
    });
    cd = new Date(cd.getTime() + dayMs);
  }

  // All-time stats
  const allTimeMetrics = calculateDashboardMetrics(orders, skuRecipes, overheadExpenses, '2020-01-01', '2030-12-31', 1, adSpendMap, adSpendTaxMultiplier, calcOptions);

  return {
    tenant: tenantConfig,
    exchangeRate,
    dateRange: { start: startDate, end: endDate, range: params.range || '7days' },
    filtered: {
      netProfit: metrics.netProfit,
      grossOrderProfit: metrics.grossOrderProfit,
      totalOrders: metrics.totalOrders,
      rtoRate: metrics.rtoRate,
      roas: metrics.roas,
      revenue: metrics.revenue,
      adSpend: metrics.adSpend,
      rtoCount: metrics.rtoCount,
      cancelledCount: metrics.cancelledCount || 0,
    },
    overhead: metrics.overhead,
    plBreakdown: metrics.plBreakdown,
    // COD vs Prepaid Revenue Split
    revenueSplit: (() => {
      const start = new Date(startDate + 'T00:00:00+05:30');
      const end = new Date(endDate + 'T23:59:59.999+05:30');
      const rangeOrders = orders.filter(o => {
        const d = new Date(o.orderDate);
        return d >= start && d <= end;
      });
      // Exclude cancelled/voided/pending
      const EXCL_STATUS = ['Cancelled', 'Voided', 'Pending'];
      const EXCL_FIN = ['pending', 'voided', 'refunded'];
      const acctOrders = rangeOrders.filter(o =>
        !EXCL_STATUS.includes(o.status) && !EXCL_FIN.includes(o.financialStatus)
      );
      let prepaidRevenue = 0, prepaidCount = 0;
      let reconciledRevenue = 0, unreconciledRevenue = 0, reconciledCount = 0, unreconciledCount = 0;
      acctOrders.forEach(o => {
        const rev = o.salePrice || 0;
        prepaidRevenue += rev;
        prepaidCount++;
        if (o.razorpayReconciled === true) {
          reconciledRevenue += rev;
          reconciledCount++;
        } else {
          unreconciledRevenue += rev;
          unreconciledCount++;
        }
      });
      const totalRev = prepaidRevenue;
      return {
        totalRevenue: Math.round(totalRev * 100) / 100,
        totalOrders: prepaidCount,
        reconciled: { revenue: Math.round(reconciledRevenue * 100) / 100, count: reconciledCount, percent: totalRev > 0 ? Math.round((reconciledRevenue / totalRev) * 10000) / 100 : 0 },
        unreconciled: { revenue: Math.round(unreconciledRevenue * 100) / 100, count: unreconciledCount, percent: totalRev > 0 ? Math.round((unreconciledRevenue / totalRev) * 10000) / 100 : 0 },
      };
    })(),
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
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
  const tenantConfig = await db.collection('tenantConfig').findOne({});
  const isMetaActive = integrations?.metaAds?.active === true;

  // Build adSpendMap from dailyMarketingSpend collection
  const dailySpends = isMetaActive
    ? await db.collection('dailyMarketingSpend').find({}).toArray()
    : [];
  const adSpendMap = {};
  dailySpends.forEach(s => { adSpendMap[s.date] = s.spendAmount || 0; });

  // Ad spend tax multiplier
  const taxRate = tenantConfig?.adSpendTaxRate ?? 18;
  const taxMul = 1 + (taxRate / 100);

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

  // Pre-compute orders per day using IST keys
  const ordersPerDay = {};
  filteredOrders.forEach(order => {
    const dk = getISTDateKey(order.orderDate);
    ordersPerDay[dk] = (ordersPerDay[dk] || 0) + 1;
  });

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

    const dateKey = getISTDateKey(order.orderDate);
    const dayOrderCount = ordersPerDay[dateKey] || 1;
    const dayAd = adSpendMap[dateKey] || 0;

    const profit = calculateOrderProfit(order, skuMap[order.sku], dayAd, dayOrderCount, 1, taxMul);
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
    let nextUrl = `${baseUrl}/admin/api/2024-01/orders.json?limit=250&status=any&fulfillment_status=any&financial_status=any`;

    // True cursor-based pagination — no arbitrary page limit
    while (nextUrl) {
      const res = await fetch(nextUrl, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Shopify API error: ${res.status} - ${errText}`, synced: allShopifyOrders.length > 0 ? 'partial' : 0 };
      }

      const data = await res.json();
      allShopifyOrders = allShopifyOrders.concat(data.orders || []);

      // Follow cursor pagination via Link header — bulletproof multi-rel parsing
      nextUrl = null;
      const linkHeader = res.headers.get('link');
      if (linkHeader) {
        // Split by comma to isolate each rel entry, then find rel="next" specifically
        const links = linkHeader.split(',');
        for (const link of links) {
          const match = link.match(/<([^>]+)>;\s*rel="next"/);
          if (match) {
            nextUrl = match[1];
            break;
          }
        }
      }
    }

    let synced = 0;
    let updated = 0;

    for (const shopifyOrder of allShopifyOrders) {
      const shopifyOrderIdStr = String(shopifyOrder.id);

      // Map Shopify fulfillment status
      let status = 'Unfulfilled';
      if (shopifyOrder.fulfillment_status === 'fulfilled') {
        status = 'Delivered';
      } else if (shopifyOrder.fulfillment_status === 'partial') {
        status = 'In Transit';
      } else if (shopifyOrder.cancelled_at) {
        status = 'Cancelled';
      }

      // Direct parsing — no artificial IST shift. Shopify timestamps already include
      // the correct timezone offset. Forcing toISTISO double-shifts midnight orders.
      const shopifyDateRaw = shopifyOrder.created_at || shopifyOrder.processed_at || shopifyOrder.updated_at;
      const shopifyDate = shopifyDateRaw ? new Date(shopifyDateRaw).toISOString() : new Date().toISOString();

      // Shipping address object
      const addr = shopifyOrder.shipping_address || {};
      const shippingAddress = {
        line1: addr.address1 || '',
        line2: addr.address2 || '',
        city: addr.city || '',
        state: addr.province || '',
        zip: addr.zip || '',
        country: addr.country || '',
      };

      // Customer phone
      const customerPhone = shopifyOrder.customer?.phone || addr.phone || shopifyOrder.phone || '';

      // Total tax
      const totalTax = parseFloat(shopifyOrder.total_tax || 0);

      // Proportional Revenue Allocation — computed for EVERY order (new and existing)
      const totalLineItems = (shopifyOrder.line_items || []).length || 1;
      const totalShipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 0);
      const totalDiscount = parseFloat(shopifyOrder.total_discounts || 0);
      const finalOrderPrice = parseFloat(shopifyOrder.total_price || 0);
      const rawSubtotal = (shopifyOrder.line_items || []).reduce((sum, i) => sum + (parseFloat(i.price) * (i.quantity || 1)), 0);

      // Shopify Revenue Parity: extract refund amounts
      const totalRefunds = (shopifyOrder.refunds || []).reduce((sum, refund) => {
        return sum + (refund.refund_line_items || []).reduce((s, rli) => {
          return s + (parseFloat(rli.subtotal) || 0);
        }, 0);
      }, 0);

      // Map Shopify financial_status for strict filtering
      const financialStatus = shopifyOrder.financial_status || 'unknown';

      for (const item of (shopifyOrder.line_items || [])) {
        const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;

        // Each line item gets its proportional share of the final checkout price
        const lineItemRaw = parseFloat(item.price) * (item.quantity || 1);
        const priceRatio = rawSubtotal > 0 ? lineItemRaw / rawSubtotal : (1 / totalLineItems);

        const result = await db.collection('orders').updateOne(
          // QUERY: match on Shopify order ID + SKU (unique per line item)
          { shopifyOrderId: shopifyOrderIdStr, sku: sku },
          {
            // $set: always overwrite financial data, status, and dates on every sync
            $set: {
              salePrice: finalOrderPrice * priceRatio,
              totalOrderPrice: finalOrderPrice,
              discount: totalDiscount * priceRatio,
              refundAmount: totalRefunds * priceRatio,
              totalTax: totalTax * priceRatio,
              financialStatus,
              status,
              shippingCost: totalShipping * priceRatio,
              shippingAddress,
              customerPhone,
              customerEmail: shopifyOrder.customer?.email || shopifyOrder.email || '',
              checkoutToken: shopifyOrder.checkout_token || '',
              orderDate: shopifyDate,
              productName: item.title || item.name,
              variantName: item.variant_title || '',
              destinationPincode: shippingAddress.zip,
              destinationCity: shippingAddress.city,
              paymentMethod: 'prepaid',
              updatedAt: new Date().toISOString(),
            },
            // $setOnInsert: only written when this is a brand-new document
            $setOnInsert: {
              _id: uuidv4(),
              orderId: `SH-${shopifyOrder.order_number || shopifyOrder.id}`,
              shopifyOrderId: shopifyOrderIdStr,
              sku: sku,
              customerName: shopifyOrder.customer ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim() : 'Unknown',
              shippingMethod: 'shopify',
              isUrgent: false,
              manualCourierName: null,
              manualShippingCost: null,
              preparedBy: null,
              preparedByName: null,
              trackingNumber: null,
              createdAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) synced++;
        else if (result.modifiedCount > 0) updated++;
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

// ==================== INDIA POST AUTH & TRACKING ====================

async function indiaPostAuth(username, password, baseUrl) {
  const loginRes = await fetch(`${baseUrl}/access/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    throw new Error(`India Post login failed (${loginRes.status}): ${errText}`);
  }

  const loginData = await loginRes.json();
  // Handle both response shapes: { access_token } or { data: { access_token } }
  const accessToken = loginData?.data?.access_token || loginData?.access_token;
  if (!accessToken) {
    throw new Error('No access_token received from India Post. Check credentials.');
  }
  return accessToken;
}

async function indiaPostSyncTracking() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.indiaPost?.username || !integrations?.indiaPost?.password) {
    return { error: 'India Post credentials not configured. Enter username & password in Integrations.', tracked: 0 };
  }

  const { username, password, sandboxMode } = integrations.indiaPost;
  const baseUrl = sandboxMode !== false
    ? 'https://test.cept.gov.in/beextcustomer/v1'
    : 'https://cept.gov.in/beextcustomer/v1';

  try {
    // Step 1: Authenticate
    const accessToken = await indiaPostAuth(username, password, baseUrl);

    // Step 2: Get all orders with tracking numbers that need status updates
    const pendingOrders = await db.collection('orders').find({
      trackingNumber: { $exists: true, $ne: null, $ne: '' },
      status: { $in: ['In Transit', 'Unfulfilled', 'Booked', 'Pending'] },
    }).toArray();

    if (pendingOrders.length === 0) {
      return { message: 'No orders pending tracking updates. Add tracking numbers to orders first.', tracked: 0, total: 0 };
    }

    // Step 3: Chunk into batches of 50 (India Post strict limit)
    const chunks = [];
    for (let i = 0; i < pendingOrders.length; i += 50) {
      chunks.push(pendingOrders.slice(i, i + 50));
    }

    let totalTracked = 0;
    let totalDelivered = 0;
    let totalRTO = 0;
    let totalErrors = 0;

    for (const chunk of chunks) {
      const trackingNumbers = chunk.map(o => o.trackingNumber).filter(Boolean);
      if (trackingNumbers.length === 0) continue;

      try {
        const trackRes = await fetch(`${baseUrl}/tracking/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ bulk: trackingNumbers }),
        });

        if (!trackRes.ok) {
          const errText = await trackRes.text();
          console.error('India Post bulk tracking error:', trackRes.status, errText);
          totalErrors += chunk.length;
          continue;
        }

        const trackData = await trackRes.json();
        const articles = trackData?.data || trackData || [];

        for (const item of (Array.isArray(articles) ? articles : [])) {
          const trackingNum = item?.booking_details?.article_number || item?.article_number;
          if (!trackingNum) continue;

          const order = chunk.find(o => o.trackingNumber === trackingNum);
          if (!order) continue;

          let newStatus = order.status;
          let tariff = item?.booking_details?.tariff || order.indiaPostTariff || order.shippingCost;

          // Check del_status object first (most reliable)
          const delStatus = (item?.del_status || '').toLowerCase();
          if (delStatus === 'delivered' || delStatus === 'item delivered') {
            newStatus = 'Delivered';
          } else if (delStatus === 'rto' || delStatus === 'returned' || delStatus.includes('return')) {
            newStatus = 'RTO';
          }

          // If del_status didn't resolve, scan tracking_details events
          if (newStatus === order.status) {
            const events = item?.tracking_details || [];
            for (const event of events) {
              const eventDesc = (event?.event || event?.event_description || '').toLowerCase();
              const eventCode = (event?.event_code || event?.code || '').toUpperCase();

              if (eventDesc.includes('item delivered') || eventDesc.includes('delivered to addressee')) {
                newStatus = 'Delivered';
                break;
              }
              if (eventCode === 'RT' || eventDesc.includes('return') || eventDesc.includes('rto') || eventDesc.includes('return to origin')) {
                newStatus = 'RTO';
                break;
              }
              // If item is dispatched/in transit, mark as In Transit (for Unfulfilled orders)
              if (order.status === 'Unfulfilled' && (eventDesc.includes('dispatched') || eventDesc.includes('booked'))) {
                newStatus = 'In Transit';
              }
            }
          }

          if (newStatus !== order.status) {
            await db.collection('orders').updateOne({ _id: order._id }, {
              $set: {
                status: newStatus,
                indiaPostTariff: tariff,
                indiaPostLastEvent: (item?.tracking_details || []).slice(-1)[0]?.event || '',
                statusUpdatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            });
            totalTracked++;
            if (newStatus === 'Delivered') totalDelivered++;
            if (newStatus === 'RTO') totalRTO++;
          }
        }
      } catch (chunkErr) {
        console.error('Chunk tracking error:', chunkErr.message);
        totalErrors += chunk.length;
      }
    }

    // Mark India Post integration as active after successful sync
    await db.collection('integrations').updateOne(
      { _id: 'integrations-config' },
      { $set: { 'indiaPost.active': true, 'indiaPost.lastSyncAt': new Date().toISOString() } }
    );

    return {
      message: `Scanned ${pendingOrders.length} shipments. Updated: ${totalTracked} (${totalDelivered} delivered, ${totalRTO} RTO)${totalErrors > 0 ? `. ${totalErrors} errors.` : ''}`,
      scanned: pendingOrders.length,
      tracked: totalTracked,
      delivered: totalDelivered,
      rto: totalRTO,
      errors: totalErrors,
    };
  } catch (err) {
    return { error: `India Post tracking failed: ${err.message}`, tracked: 0 };
  }
}

// ==================== RAZORPAY INTEGRATION ====================
// (Shopify Bills CSV import removed — automated fee calculation via shopifyTxnFeeRate in Settings)

// ==================== RAZORPAY INTEGRATION ====================
    const line = lines[r].trim();
    if (!line) continue;
    const values = [];
    let val = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { values.push(val.trim()); val = ''; }
      else { val += c; }
    }
    values.push(val.trim());
    
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

async function importShopifyBills(csvText) {
  const db = await getDb();
  const rows = parseCSV(csvText);
  
  if (rows.length === 0) {
    return { error: 'CSV is empty or invalid format.' };
  }

  // Validate required columns
  const requiredCols = ['Charge category', 'Amount', 'Date'];
  const firstRow = rows[0];
  for (const col of requiredCols) {
    if (!(col in firstRow)) {
      return { error: `Missing required column: "${col}". Expected Shopify charges export format.` };
    }
  }

  // Process and store charges
  let imported = 0;
  let skipped = 0;
  const charges = [];

  for (const row of rows) {
    const amount = parseFloat(row['Amount'] || '0');
    if (amount === 0 && row['Charge category'] !== 'application_fee') {
      skipped++;
      continue; // Skip zero-amount entries (except app fees which may be $0)
    }

    const charge = {
      _id: uuidv4(),
      billNumber: row['Bill #'] || '',
      chargeCategory: row['Charge category'] || 'unknown',
      description: row['Description'] || '',
      amount: amount,
      currency: row['Currency'] || 'INR',
      date: row['Date'] || '',
      rate: parseFloat(row['Rate'] || '0'),
      app: row['App'] || '',
      billingCycleStart: row['Start of billing cycle'] || '',
      billingCycleEnd: row['End of billing cycle'] || '',
      order: row['Order'] || '',
      originalAmount: parseFloat(row['Original amount'] || '0'),
      originalCurrency: row['Original currency'] || '',
      exchangeRate: parseFloat(row['Exchange rate'] || '1'),
      importedAt: new Date().toISOString(),
    };

    charges.push(charge);
    imported++;
  }

  if (charges.length > 0) {
    // Clear existing charges and replace with new import (full refresh approach)
    await db.collection('shopifyCharges').deleteMany({});
    await db.collection('shopifyCharges').insertMany(charges);
  }

  // Compute summary
  const summary = {};
  charges.forEach(c => {
    if (!summary[c.chargeCategory]) summary[c.chargeCategory] = { count: 0, total: 0 };
    summary[c.chargeCategory].count++;
    summary[c.chargeCategory].total += c.amount;
  });

  return {
    message: `Imported ${imported} Shopify charges (${skipped} zero-amount skipped).`,
    imported,
    skipped,
    totalRows: rows.length,
    summary,
  };
}

async function getShopifyBillsSummary() {
  const db = await getDb();
  const charges = await db.collection('shopifyCharges').find({}).toArray();
  
  if (charges.length === 0) {
    return { imported: false, charges: [], summary: {} };
  }

  const summary = {};
  charges.forEach(c => {
    if (!summary[c.chargeCategory]) summary[c.chargeCategory] = { count: 0, total: 0 };
    summary[c.chargeCategory].count++;
    summary[c.chargeCategory].total += c.amount;
  });

  const bills = [...new Set(charges.map(c => c.billNumber))].length;
  const dateRange = charges.filter(c => c.date).map(c => c.date).sort();

  return {
    imported: true,
    totalCharges: charges.length,
    totalBills: bills,
    dateRange: { earliest: dateRange[0], latest: dateRange[dateRange.length - 1] },
    summary,
    lastImportedAt: charges[0]?.importedAt,
  };
}

function getShopifyChargesForDateRange(charges, startDate, endDate) {
  // startDate and endDate are YYYY-MM-DD strings
  const start = new Date(startDate + 'T00:00:00+05:30');
  const end = new Date(endDate + 'T23:59:59.999+05:30');
  const rangeDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

  let orderCommission = 0;
  let appFees = 0;
  let subscriptionFee = 0;
  const appBreakdown = {};

  for (const charge of charges) {
    if (charge.chargeCategory === 'order_commission') {
      // Order commission: match by date falling within range
      if (charge.date) {
        const chargeDate = new Date(charge.date + 'T12:00:00+05:30');
        if (chargeDate >= start && chargeDate <= end) {
          orderCommission += charge.amount;
        }
      }
    } else if (charge.chargeCategory === 'application_fee') {
      // App fees: pro-rate based on billing cycle overlap
      if (charge.amount === 0) continue;
      if (charge.billingCycleStart && charge.billingCycleEnd) {
        const cycleStart = new Date(charge.billingCycleStart + 'T00:00:00+05:30');
        const cycleEnd = new Date(charge.billingCycleEnd + 'T23:59:59+05:30');
        const cycleDays = Math.max(1, Math.round((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1);
        
        // Calculate overlap
        const overlapStart = new Date(Math.max(start, cycleStart));
        const overlapEnd = new Date(Math.min(end, cycleEnd));
        const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1);
        
        if (overlapDays > 0) {
          const proRated = (charge.amount / cycleDays) * overlapDays;
          appFees += proRated;
          const appName = charge.app || charge.description || 'Unknown App';
          if (!appBreakdown[appName]) appBreakdown[appName] = 0;
          appBreakdown[appName] += proRated;
        }
      }
    } else if (charge.chargeCategory === 'subscription_fee') {
      // Subscription: pro-rate based on billing cycle overlap
      if (charge.billingCycleStart && charge.billingCycleEnd) {
        const cycleStart = new Date(charge.billingCycleStart + 'T00:00:00+05:30');
        const cycleEnd = new Date(charge.billingCycleEnd + 'T23:59:59+05:30');
        const cycleDays = Math.max(1, Math.round((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1);
        
        const overlapStart = new Date(Math.max(start, cycleStart));
        const overlapEnd = new Date(Math.min(end, cycleEnd));
        const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1);
        
        if (overlapDays > 0) {
          subscriptionFee += (charge.amount / cycleDays) * overlapDays;
        }
      }
    }
  }

  return {
    orderCommission: Math.round(orderCommission * 100) / 100,
    appFees: Math.round(appFees * 100) / 100,
    subscriptionFee: Math.round(subscriptionFee * 100) / 100,
    appBreakdown,
    total: Math.round((orderCommission + appFees + subscriptionFee) * 100) / 100,
  };
}

// ==================== RAZORPAY INTEGRATION ====================

async function razorpaySyncPayments() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.razorpay?.keyId || !integrations?.razorpay?.keySecret) {
    return { error: 'Razorpay credentials not configured. Enter your Key ID and Key Secret in Integrations.', synced: 0 };
  }

  const { keyId, keySecret } = integrations.razorpay;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    // Fetch all captured payments from Razorpay (paginated, max 100 per call)
    let allPayments = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`https://api.razorpay.com/v1/payments?count=${count}&skip=${skip}`, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Razorpay API error: ${res.status} - ${errText}`, synced: allPayments.length > 0 ? 'partial' : 0 };
      }

      const data = await res.json();
      const items = data.items || [];
      allPayments = allPayments.concat(items);

      // If we got fewer than requested, we've reached the end
      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }

      // Safety limit: max 10000 payments
      if (allPayments.length >= 10000) break;
    }

    // Build lookup maps for matching — multiple strategies
    const allOrders = await db.collection('orders').find({}).toArray();

    // Group orders by shopifyOrderId to get total order amounts
    const orderGroupByShopifyId = {};
    allOrders.forEach(o => {
      if (!o.shopifyOrderId) return;
      if (!orderGroupByShopifyId[o.shopifyOrderId]) {
        orderGroupByShopifyId[o.shopifyOrderId] = {
          shopifyOrderId: o.shopifyOrderId,
          orderId: o.orderId,
          totalOrderPrice: o.totalOrderPrice || o.salePrice,
          customerPhone: o.customerPhone || '',
          customerEmail: o.customerEmail || '',
          checkoutToken: o.checkoutToken || '',
          orderDate: o.orderDate,
          lines: [o],
        };
      } else {
        orderGroupByShopifyId[o.shopifyOrderId].lines.push(o);
      }
    });
    const orderGroups = Object.values(orderGroupByShopifyId);

    // Build phone-based lookup: normalized phone (last 10 digits) + amount → order group
    const normalizePhone = (phone) => {
      if (!phone) return '';
      return phone.replace(/\D/g, '').slice(-10);
    };

    // Build amount+phone lookup for matching
    const phoneAmountMap = {};
    orderGroups.forEach(g => {
      const phone = normalizePhone(g.customerPhone);
      const amountPaise = Math.round((g.totalOrderPrice || 0) * 100);
      if (phone && amountPaise > 0) {
        const key = `${phone}_${amountPaise}`;
        if (!phoneAmountMap[key]) phoneAmountMap[key] = [];
        phoneAmountMap[key].push(g);
      }
    });

    // Build email+amount lookup
    const emailAmountMap = {};
    orderGroups.forEach(g => {
      const email = (g.customerEmail || '').toLowerCase().trim();
      const amountPaise = Math.round((g.totalOrderPrice || 0) * 100);
      if (email && amountPaise > 0) {
        const key = `${email}_${amountPaise}`;
        if (!emailAmountMap[key]) emailAmountMap[key] = [];
        emailAmountMap[key].push(g);
      }
    });

    // Build amount-only lookup (for fallback)
    const amountMap = {};
    orderGroups.forEach(g => {
      const amountPaise = Math.round((g.totalOrderPrice || 0) * 100);
      if (amountPaise > 0) {
        if (!amountMap[amountPaise]) amountMap[amountPaise] = [];
        amountMap[amountPaise].push(g);
      }
    });

    let matched = 0;
    let unmatched = 0;
    let skippedNonCaptured = 0;
    const matchedShopifyIds = new Set(); // Track already-matched orders to avoid double-matching

    for (const payment of allPayments) {
      // Only process captured payments
      if (payment.status !== 'captured') {
        skippedNonCaptured++;
        continue;
      }

      let matchedGroup = null;
      const payPhone = normalizePhone(payment.contact || '');
      const payEmail = (payment.email || '').toLowerCase().trim();
      const payAmount = payment.amount || 0; // in paise

      // Strategy 1: Phone + Amount (most reliable for this Razorpay-Shopify integration)
      if (!matchedGroup && payPhone) {
        const candidates = phoneAmountMap[`${payPhone}_${payAmount}`] || [];
        // Pick the first candidate not already matched
        matchedGroup = candidates.find(g => !matchedShopifyIds.has(g.shopifyOrderId));
      }

      // Strategy 2: Email + Amount
      if (!matchedGroup && payEmail) {
        const candidates = emailAmountMap[`${payEmail}_${payAmount}`] || [];
        matchedGroup = candidates.find(g => !matchedShopifyIds.has(g.shopifyOrderId));
      }

      // Strategy 3: Amount only (if unique match)
      if (!matchedGroup) {
        const candidates = (amountMap[payAmount] || []).filter(g => !matchedShopifyIds.has(g.shopifyOrderId));
        // Only use amount-only matching if there's exactly 1 unmatched candidate
        // Otherwise too ambiguous
        if (candidates.length === 1) {
          matchedGroup = candidates[0];
        }
      }

      if (matchedGroup) {
        matchedShopifyIds.add(matchedGroup.shopifyOrderId);

        // Convert paise to rupees
        const feeInRupees = (payment.fee || 0) / 100;
        const taxInRupees = (payment.tax || 0) / 100;

        // Distribute fee proportionally across line items
        const totalLines = matchedGroup.lines.length || 1;

        for (const line of matchedGroup.lines) {
          await db.collection('orders').updateOne(
            { _id: line._id },
            {
              $set: {
                razorpayPaymentId: payment.id,
                razorpayFee: feeInRupees / totalLines,
                razorpayTax: taxInRupees / totalLines,
                razorpayReconciled: true,
                razorpaySettlementId: payment.settlement_id || null,
                paymentMethod: 'prepaid',
                updatedAt: new Date().toISOString(),
              }
            }
          );
        }
        matched++;
      } else {
        unmatched++;
      }
    }

    // All orders are prepaid (no COD concept) — mark remaining unmatched orders as prepaid too
    const prepaidResult = await db.collection('orders').updateMany(
      {
        shopifyOrderId: { $exists: true },
        paymentMethod: { $ne: 'prepaid' },
      },
      {
        $set: { paymentMethod: 'prepaid', updatedAt: new Date().toISOString() }
      }
    );

    // Update integrations status
    await db.collection('integrations').updateOne(
      { _id: 'integrations-config' },
      {
        $set: {
          'razorpay.active': true,
          'razorpay.lastSyncAt': new Date().toISOString(),
          'razorpay.totalPaymentsFetched': allPayments.length,
          'razorpay.matchedOrders': matched,
          'razorpay.unmatchedPayments': unmatched,
        }
      }
    );

    return {
      message: `Razorpay sync complete. ${matched} orders reconciled with exact fees. ${unmatched} payments unmatched. All orders marked as prepaid.`,
      totalPaymentsFetched: allPayments.length,
      captured: allPayments.filter(p => p.status === 'captured').length,
      matched,
      unmatched,
      skippedNonCaptured,
      prepaidMarked: prepaidResult.modifiedCount,
    };
  } catch (err) {
    return { error: `Razorpay sync failed: ${err.message}`, synced: 0 };
  }
}

async function getRazorpaySettlements() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.razorpay?.keyId || !integrations?.razorpay?.keySecret) {
    return { settlements: [], error: null, active: false };
  }

  if (!integrations?.razorpay?.active) {
    return { settlements: [], error: null, active: false };
  }

  const { keyId, keySecret } = integrations.razorpay;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const res = await fetch('https://api.razorpay.com/v1/settlements?count=10&skip=0', {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text();
      return { settlements: [], error: `Razorpay API error: ${res.status}`, active: true };
    }

    const data = await res.json();
    const items = (data.items || []).map(s => ({
      id: s.id,
      amount: (s.amount || 0) / 100, // Convert paise to rupees
      status: s.status,
      fees: (s.fees || 0) / 100,
      tax: (s.tax || 0) / 100,
      utr: s.utr || null,
      createdAt: s.created_at ? new Date(s.created_at * 1000).toISOString() : null,
    }));

    return { settlements: items, error: null, active: true };
  } catch (err) {
    return { settlements: [], error: err.message, active: true };
  }
}

async function razorpayDebugPayments() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.razorpay?.keyId || !integrations?.razorpay?.keySecret) {
    return { error: 'Razorpay credentials not configured.' };
  }

  const { keyId, keySecret } = integrations.razorpay;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    // Fetch 5 sample payments
    const payRes = await fetch('https://api.razorpay.com/v1/payments?count=5&skip=0', {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });
    const payData = await payRes.json();
    const payments = (payData.items || []).map(p => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      method: p.method,
      order_id: p.order_id,
      receipt: p.receipt,
      notes: p.notes,
      description: p.description,
      fee: p.fee,
      tax: p.tax,
      email: p.email,
      contact: p.contact,
    }));

    // For each payment that has an order_id, fetch the Razorpay order to check its receipt/notes
    const ordersChecked = [];
    for (const p of payments) {
      if (p.order_id) {
        try {
          const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${p.order_id}`, {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
          });
          const orderData = await orderRes.json();
          ordersChecked.push({
            paymentId: p.id,
            razorpayOrderId: p.order_id,
            orderReceipt: orderData.receipt,
            orderNotes: orderData.notes,
            orderAmount: orderData.amount,
            orderStatus: orderData.status,
          });
        } catch (err) {
          ordersChecked.push({ paymentId: p.id, error: err.message });
        }
      }
    }

    // Also show a sample Shopify order for comparison
    const sampleOrder = await db.collection('orders').findOne({ shopifyOrderId: { $exists: true } });

    return {
      samplePayments: payments,
      razorpayOrders: ordersChecked,
      sampleShopifyOrder: sampleOrder ? {
        _id: sampleOrder._id,
        orderId: sampleOrder.orderId,
        shopifyOrderId: sampleOrder.shopifyOrderId,
        salePrice: sampleOrder.salePrice,
      } : null,
      hint: 'Compare razorpayOrders[].orderReceipt or orderNotes with sampleShopifyOrder.orderId / shopifyOrderId to find the matching field',
    };
  } catch (err) {
    return { error: err.message };
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

      case 'expense-categories': {
        const db = await getDb();
        let categories = await db.collection('expenseCategories').find({}).sort({ name: 1 }).toArray();
        
        // If empty, seed with defaults
        if (categories.length === 0) {
          const defaults = [
            { _id: uuidv4(), name: 'Platform Fees', subCategories: ['Shopify Subscription', 'Shopify App Fees', 'Other Platform Fees'], updatedAt: new Date().toISOString() },
            { _id: uuidv4(), name: 'Salary', subCategories: ['Packing Staff', 'Admin', 'Delivery'], updatedAt: new Date().toISOString() },
            { _id: uuidv4(), name: 'Raw Material Purchases', subCategories: [], updatedAt: new Date().toISOString() },
            { _id: uuidv4(), name: 'Operations', subCategories: ['Packaging Supplies', 'Office Supplies'], updatedAt: new Date().toISOString() },
            { _id: uuidv4(), name: 'Utilities', subCategories: ['Internet', 'Electricity', 'Rent'], updatedAt: new Date().toISOString() },
            { _id: uuidv4(), name: 'Marketing', subCategories: ['Influencer Marketing', 'Offline Ads'], updatedAt: new Date().toISOString() },
          ];
          await db.collection('expenseCategories').insertMany(defaults);
          categories = defaults;
        }
        return json(categories);
      }


      case 'inventory-items': {
        if (subResource) return json(await getDoc('inventoryItems', subResource));
        const db = await getDb();
        const items = await db.collection('inventoryItems').find({}).sort({ category: 1, name: 1 }).toArray();
        return json(items);
      }

      case 'daily-marketing-spend': {
        const db = await getDb();
        const spends = await db.collection('dailyMarketingSpend').find({}).sort({ date: -1 }).toArray();
        return json(spends);
      }

      case 'integrations': {
        const db = await getDb();
        const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
        if (integrations) {
          const masked = JSON.parse(JSON.stringify(integrations));
          if (masked.shopify?.accessToken) masked.shopify.accessToken = masked.shopify.accessToken.replace(/.(?=.{4})/g, '*');
          if (masked.indiaPost?.password) masked.indiaPost.password = '********';
          if (masked.metaAds?.token) masked.metaAds.token = masked.metaAds.token.replace(/.(?=.{4})/g, '*');
          if (masked.exchangeRate?.apiKey) masked.exchangeRate.apiKey = masked.exchangeRate.apiKey.replace(/.(?=.{4})/g, '*');
          if (masked.razorpay?.keySecret) masked.razorpay.keySecret = masked.razorpay.keySecret.replace(/.(?=.{4})/g, '*');
          return json(masked);
        }
        return json({});
      }

      case 'razorpay': {
        if (subResource === 'settlements') {
          return json(await getRazorpaySettlements());
        }
        if (subResource === 'debug') {
          return json(await razorpayDebugPayments());
        }
        return json({ error: 'Unknown Razorpay action' }, 404);
      }

      case 'calculate-profit': {
        if (!subResource) return json({ error: 'Order ID required' }, 400);
        const db = await getDb();
        const order = await db.collection('orders').findOne({ _id: subResource });
        if (!order) return json({ error: 'Order not found' }, 404);
        const recipe = await db.collection('skuRecipes').findOne({ sku: order.sku });
        const integ = await db.collection('integrations').findOne({ _id: 'integrations-config' });
        const tc = await db.collection('tenantConfig').findOne({});
        const metaActive = integ?.metaAds?.active === true;

        // Ad spend tax multiplier
        const taxRate = tc?.adSpendTaxRate ?? 18;
        const taxMul = 1 + (taxRate / 100);

        // Look up the order's date in dailyMarketingSpend using IST key
        const dateKey = getISTDateKey(order.orderDate);

        let dayAdSpend = 0;
        if (metaActive) {
          const dailySpend = await db.collection('dailyMarketingSpend').findOne({ date: dateKey });
          dayAdSpend = dailySpend?.spendAmount || 0;
        }

        // Count total orders on that day for per-order allocation
        const allOrders = await db.collection('orders').find({}).toArray();
        const dayOrders = allOrders.filter(o => getISTDateKey(o.orderDate) === dateKey);

        const profit = calculateOrderProfit(order, recipe, dayAdSpend, dayOrders.length || 1, 1, taxMul, { shopifyTxnFeeRate: tc?.shopifyTxnFeeRate || 0 });
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
        if (subResource === 'track-bulk' || subResource === 'sync-tracking') return json(await indiaPostSyncTracking());
        return json({ error: 'Unknown India Post action' }, 404);

      case 'meta-ads':
        if (subResource === 'sync') return json(await metaAdsSyncSpend());
        return json({ error: 'Unknown Meta Ads action' }, 404);

      case 'razorpay':
        if (subResource === 'sync-payments') return json(await razorpaySyncPayments());
        return json({ error: 'Unknown Razorpay action' }, 404);

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
      case 'expense-categories': {
        // POST /api/expense-categories with action: 'rename', 'delete', 'add-subcategory', 'seed'
        const db = await getDb();
        if (subResource === 'rename') {
          const { oldName, newName } = body;
          if (!oldName || !newName) return json({ error: 'oldName and newName required' }, 400);
          const result = await db.collection('overheadExpenses').updateMany(
            { category: oldName },
            { $set: { category: newName, updatedAt: new Date().toISOString() } }
          );
          return json({ message: `Renamed "${oldName}" to "${newName}". Updated ${result.modifiedCount} expenses.`, modified: result.modifiedCount });
        }
        if (subResource === 'delete') {
          const { category } = body;
          if (!category) return json({ error: 'category required' }, 400);
          const result = await db.collection('overheadExpenses').deleteMany({ category });
          return json({ message: `Deleted category "${category}" and ${result.deletedCount} expenses.`, deleted: result.deletedCount });
        }
        if (subResource === 'save') {
          // Save full category structure: [{name, subCategories: [...]}]
          const categories = body.categories || [];
          await db.collection('expenseCategories').deleteMany({});
          if (categories.length > 0) {
            await db.collection('expenseCategories').insertMany(
              categories.map(c => ({ _id: uuidv4(), name: c.name, subCategories: c.subCategories || [], updatedAt: new Date().toISOString() }))
            );
          }
          return json({ message: 'Categories saved', count: categories.length });
        }
        return json({ error: 'Unknown action. Use /rename, /delete, or /save' }, 400);
      }

      case 'expense-recurring': {
        // POST /api/expense-recurring/generate - Auto-generate due recurring expenses
        // POST /api/expense-recurring/stop - Stop a recurring expense
        const db = await getDb();
        if (subResource === 'generate') {
          const today = new Date().toISOString().split('T')[0];
          const recurring = await db.collection('overheadExpenses').find({
            frequency: { $in: ['monthly', 'yearly'] },
            stopped: { $ne: true },
            autoGenerated: { $ne: true },
            nextGenerationDate: { $lte: today },
          }).toArray();

          let generated = 0;
          for (const parent of recurring) {
            const maxCycles = parent.infiniteCycles ? Infinity : (parent.totalCycles || 1);
            const currentCycle = parent.currentCycle || 1;

            if (currentCycle >= maxCycles) continue;

            // Generate the next child expense
            const child = {
              _id: uuidv4(),
              expenseName: parent.expenseName,
              category: parent.category,
              subCategory: parent.subCategory || '',
              amount: parent.amount,
              currency: parent.currency || 'INR',
              gstInclusive: parent.gstInclusive || false,
              frequency: parent.frequency,
              totalCycles: parent.totalCycles,
              infiniteCycles: parent.infiniteCycles,
              currentCycle: currentCycle + 1,
              startDate: parent.startDate,
              nextGenerationDate: null,
              parentExpenseId: parent._id,
              autoGenerated: true,
              stopped: false,
              date: parent.nextGenerationDate,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await db.collection('overheadExpenses').insertOne(child);

            // Update parent: increment cycle, calculate next date
            const nextDate = new Date(parent.nextGenerationDate + 'T00:00:00Z');
            if (parent.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            else if (parent.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

            const newNextDate = (currentCycle + 1 < maxCycles) ? nextDate.toISOString().split('T')[0] : null;

            await db.collection('overheadExpenses').updateOne(
              { _id: parent._id },
              { $set: { currentCycle: currentCycle + 1, nextGenerationDate: newNextDate, updatedAt: new Date().toISOString() } }
            );
            generated++;
          }
          return json({ message: `Generated ${generated} recurring expense(s).`, generated });
        }
        if (subResource === 'stop') {
          const { expenseId } = body;
          if (!expenseId) return json({ error: 'expenseId required' }, 400);
          await db.collection('overheadExpenses').updateOne(
            { _id: expenseId },
            { $set: { stopped: true, nextGenerationDate: null, updatedAt: new Date().toISOString() } }
          );
          return json({ message: 'Recurring expense stopped.' });
        }
        return json({ error: 'Unknown action' }, 400);
      }

      case 'overhead-expenses': {
        const db = await getDb();
        const freq = body.frequency || 'one-time';
        const totalCycles = body.infiniteCycles ? Infinity : (parseInt(body.totalCycles) || 1);
        const isRecurring = freq === 'monthly' || freq === 'yearly';
        
        // Calculate next generation date
        let nextGenerationDate = null;
        if (isRecurring && totalCycles > 1) {
          const start = body.date ? new Date(body.date) : new Date();
          if (freq === 'monthly') {
            const next = new Date(start);
            next.setMonth(next.getMonth() + 1);
            nextGenerationDate = next.toISOString().split('T')[0];
          } else if (freq === 'yearly') {
            const next = new Date(start);
            next.setFullYear(next.getFullYear() + 1);
            nextGenerationDate = next.toISOString().split('T')[0];
          }
        }

        const expense = {
          _id: uuidv4(),
          expenseName: body.expenseName || '',
          category: body.category || 'Uncategorized',
          subCategory: body.subCategory || '',
          amount: parseFloat(body.amount) || 0,
          currency: body.currency || 'INR',
          gstInclusive: body.gstInclusive || false,
          frequency: freq,
          totalCycles: body.infiniteCycles ? 0 : (parseInt(body.totalCycles) || 1),
          infiniteCycles: body.infiniteCycles || false,
          currentCycle: 1,
          startDate: body.date || new Date().toISOString().split('T')[0],
          nextGenerationDate,
          parentExpenseId: null,
          autoGenerated: false,
          stopped: false,
          date: body.date || new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('overheadExpenses').insertOne(expense);
        return json(expense, 201);
      }
      case 'inventory-items': {
        const db = await getDb();
        const purchasePrice = Number(body.purchasePrice) || 0;
        const purchaseQuantity = Math.max(1, Number(body.purchaseQuantity) || 1);
        const item = {
          _id: uuidv4(),
          name: body.name || '',
          category: body.category || 'Raw Material',
          purchasePrice,
          purchaseQuantity,
          unit: body.unit || 'units',
          baseCostPerUnit: Math.round((purchasePrice / purchaseQuantity) * 100) / 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('inventoryItems').insertOne(item);
        return json(item, 201);
      }

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

        if (action === 'tracking') {
          const db = await getDb();
          const order = await db.collection('orders').findOne({ _id: id });
          if (!order) return json({ error: 'Order not found' }, 404);
          const trackingNumber = (body.trackingNumber || '').trim();
          await db.collection('orders').updateOne({ _id: id }, {
            $set: { trackingNumber: trackingNumber || null, updatedAt: new Date().toISOString() }
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
      case 'inventory-items':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('inventoryItems', id, body));

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
      'inventory-items': 'inventoryItems',
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
