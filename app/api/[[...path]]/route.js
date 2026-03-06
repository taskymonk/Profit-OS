import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getToken } from 'next-auth/jwt';
import { calculateOrderProfit, calculateDashboardMetrics, calculateProratedOverhead, getISTDateKey } from '@/lib/profitCalculator';
import { getSyncSettings, updateSyncSettings, initScheduler, getSchedulerStatus, acquireSyncLock, releaseSyncLock, isSyncRunning, getSyncLockStatus, runSyncAll } from '@/lib/syncScheduler';
import { shopifySyncOrdersIncremental, razorpaySyncPaymentsIncremental, logSyncEventLib } from '@/lib/syncFunctions';
import crypto from 'crypto';
import { calculateProgress, SETUP_CHECKLIST, DEFAULT_MODULE_SETTINGS } from '@/lib/achievements';
import { ensureIndexes } from '@/lib/dbIndexes';

// Initialize indexes on first request
let _indexInit = false;
async function initOnce() { if (!_indexInit) { _indexInit = true; ensureIndexes().catch(() => {}); } }

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

// ==================== SYNC HISTORY LOGGING ====================
async function logSyncEvent(db, integration, action, status, details = {}) {
  try {
    await db.collection('syncHistory').insertOne({
      _id: uuidv4(),
      integration,
      action,
      status, // 'success' | 'error' | 'partial'
      details,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 100 entries per integration
    const count = await db.collection('syncHistory').countDocuments({ integration });
    if (count > 100) {
      const oldest = await db.collection('syncHistory').find({ integration }).sort({ timestamp: 1 }).limit(count - 100).toArray();
      if (oldest.length) {
        await db.collection('syncHistory').deleteMany({ _id: { $in: oldest.map(o => o._id) } });
      }
    }
  } catch (err) {
    console.error('Failed to log sync event:', err.message);
  }
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

    await logSyncEvent(db, 'metaAds', 'sync-spend', 'success', { synced, totalSpendINR: Math.round(totalSpendINR), currency: adCurrency });

    return {
      message: `Synced ${synced} days of ad spend. Total: \u20B9${Math.round(totalSpendINR).toLocaleString('en-IN')}${adCurrency !== 'INR' ? ` (converted from ${adCurrency} at ${exchangeRate.toFixed(2)})` : ''}`,
      synced,
      totalSpendINR: Math.round(totalSpendINR * 100) / 100,
      currency: adCurrency,
      exchangeRate: adCurrency !== 'INR' ? exchangeRate : 1,
    };
  } catch (err) {
    const db2 = await getDb();
    await logSyncEvent(db2, 'metaAds', 'sync-spend', 'error', { error: err.message });
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
      const d7 = new Date(now.getTime() - 7 * 86400000);
      const yesterday = new Date(now.getTime() - 1 * 86400000);
      startDate = d7.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      endDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
      const d7d = new Date(now.getTime() - 7 * 86400000);
      const yd = new Date(now.getTime() - 1 * 86400000);
      startDate = d7d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      endDate = yd.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
  }

  // Get exchange rate for currency conversion
  const exchangeRate = await getExchangeRate('USD', 'INR');

  // Fetch FIFO consumption records for COGS calculation
  const allConsumptions = await db.collection('stockConsumptions').find({}).toArray();
  const consumptionMap = {};
  allConsumptions.forEach(c => {
    if (!consumptionMap[c.orderId]) consumptionMap[c.orderId] = [];
    consumptionMap[c.orderId].push(c);
  });

  const calcOptions = { shopifyTxnFeeRate: tenantConfig.shopifyTxnFeeRate || 0, consumptionMap };
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
      let totalRazorpayFees = 0, totalRazorpayTax = 0;
      acctOrders.forEach(o => {
        const rev = o.salePrice || 0;
        prepaidRevenue += rev;
        prepaidCount++;
        if (o.razorpayReconciled === true) {
          reconciledRevenue += rev;
          reconciledCount++;
          totalRazorpayFees += o.razorpayFee || 0;
          totalRazorpayTax += o.razorpayTax || 0;
        } else {
          unreconciledRevenue += rev;
          unreconciledCount++;
        }
      });
      const totalRev = prepaidRevenue;
      const matchRate = prepaidCount > 0 ? Math.round((reconciledCount / prepaidCount) * 10000) / 100 : 0;
      const effectiveFeeRate = reconciledRevenue > 0 ? Math.round((totalRazorpayFees / reconciledRevenue) * 10000) / 100 : 0;
      return {
        totalRevenue: Math.round(totalRev * 100) / 100,
        totalOrders: prepaidCount,
        reconciled: { revenue: Math.round(reconciledRevenue * 100) / 100, count: reconciledCount, percent: totalRev > 0 ? Math.round((reconciledRevenue / totalRev) * 10000) / 100 : 0 },
        unreconciled: { revenue: Math.round(unreconciledRevenue * 100) / 100, count: unreconciledCount, percent: totalRev > 0 ? Math.round((unreconciledRevenue / totalRev) * 10000) / 100 : 0 },
        totalFees: Math.round(totalRazorpayFees * 100) / 100,
        totalTax: Math.round(totalRazorpayTax * 100) / 100,
        matchRate,
        effectiveFeeRate,
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

// ==================== NEW REPORT FUNCTIONS ====================

async function getReportMonthlyPL(params) {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();
  const expenses = await db.collection('overheadExpenses').find({}).toArray();
  const dailySpends = await db.collection('dailyMarketingSpend').find({}).toArray();
  const tenantConfig = await db.collection('tenantConfig').findOne({}) || {};
  const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
  const skuMap = {};
  skuRecipes.forEach(r => { skuMap[r.sku] = r; });
  const taxMul = 1 + ((tenantConfig.adSpendTaxRate ?? 18) / 100);
  const shopifyTxnRate = (tenantConfig.shopifyTxnFeeRate || 2) / 100;

  // Date range filter
  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 180));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.orderDate);
    return d >= startDate && d <= endDate;
  });

  // Build monthly buckets from filtered orders only
  const months = {};
  filteredOrders.forEach(o => {
    const d = new Date(o.orderDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = { month: key, revenue: 0, cogs: 0, shopifyFees: 0, razorpayFees: 0, adSpend: 0, overhead: 0, netProfit: 0, orderCount: 0, rtoCount: 0 };
    months[key].orderCount++;
    months[key].revenue += o.salePrice || 0;
    if (o.status === 'RTO') months[key].rtoCount++;
    const recipe = skuMap[o.sku];
    if (recipe?.ingredients?.length) {
      const cogs = recipe.ingredients.reduce((s, ing) => s + ((ing.costPerUnit || 0) * (ing.quantityUsed || 0)), 0);
      months[key].cogs += cogs;
    }
    months[key].shopifyFees += (o.salePrice || 0) * shopifyTxnRate;
    months[key].razorpayFees += o.gatewayFee || 0;
  });

  // Add ad spend per month (filtered by date range)
  dailySpends.forEach(s => {
    const d = new Date(s.date + 'T00:00:00+05:30');
    if (d < startDate || d > endDate) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (months[key]) months[key].adSpend += (s.spendAmount || 0) * taxMul;
  });

  // Add overhead expenses per month (pro-rata, only for months in range)
  const monthKeys = Object.keys(months);
  expenses.forEach(exp => {
    const amt = exp.amount || 0;
    const freq = exp.frequency || 'monthly';
    let monthlyAmt = amt;
    if (freq === 'yearly') monthlyAmt = amt / 12;
    else if (freq === 'one-time') monthlyAmt = 0;
    else if (freq === 'weekly') monthlyAmt = amt * 4.33;
    else if (freq === 'daily') monthlyAmt = amt * 30;

    if (freq === 'one-time' && exp.date) {
      const d = new Date(exp.date);
      if (d >= startDate && d <= endDate) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (months[key]) months[key].overhead += amt;
      }
    } else {
      monthKeys.forEach(key => { months[key].overhead += monthlyAmt; });
    }
  });

  // Calc net profit
  Object.values(months).forEach(m => {
    m.netProfit = m.revenue - m.cogs - m.shopifyFees - m.razorpayFees - m.adSpend - m.overhead;
    m.margin = m.revenue > 0 ? Math.round((m.netProfit / m.revenue) * 10000) / 100 : 0;
    ['revenue', 'cogs', 'shopifyFees', 'razorpayFees', 'adSpend', 'overhead', 'netProfit'].forEach(k => { m[k] = Math.round(m[k]); });
  });

  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

async function getReportCustomerRepeat(params) {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();
  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 90));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.orderDate);
    return d >= startDate && d <= endDate;
  });

  const customers = {};
  filteredOrders.forEach(o => {
    const email = (o.customerEmail || o.customerName || 'unknown').toLowerCase().trim();
    if (!customers[email]) customers[email] = { email, name: o.customerName || email, orders: 0, totalSpent: 0, firstOrder: o.orderDate, lastOrder: o.orderDate };
    customers[email].orders++;
    customers[email].totalSpent += o.salePrice || 0;
    if (new Date(o.orderDate) < new Date(customers[email].firstOrder)) customers[email].firstOrder = o.orderDate;
    if (new Date(o.orderDate) > new Date(customers[email].lastOrder)) customers[email].lastOrder = o.orderDate;
  });

  const custs = Object.values(customers);
  const repeatCustomers = custs.filter(c => c.orders > 1);
  const oneTimeCustomers = custs.filter(c => c.orders === 1);
  const totalCustomers = custs.length;
  const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers.length / totalCustomers) * 10000) / 100 : 0;
  const avgOrderValue = filteredOrders.length > 0 ? Math.round(filteredOrders.reduce((s, o) => s + (o.salePrice || 0), 0) / filteredOrders.length) : 0;
  const avgRepeatOrders = repeatCustomers.length > 0 ? Math.round(repeatCustomers.reduce((s, c) => s + c.orders, 0) / repeatCustomers.length * 10) / 10 : 0;
  const repeatRevenue = Math.round(repeatCustomers.reduce((s, c) => s + c.totalSpent, 0));
  const oneTimeRevenue = Math.round(oneTimeCustomers.reduce((s, c) => s + c.totalSpent, 0));

  return {
    summary: { totalCustomers, repeatCustomers: repeatCustomers.length, oneTimeCustomers: oneTimeCustomers.length, repeatRate, avgOrderValue, avgRepeatOrders, repeatRevenue, oneTimeRevenue },
    topRepeatCustomers: repeatCustomers.sort((a, b) => b.orders - a.orders).slice(0, 20).map(c => ({
      ...c, totalSpent: Math.round(c.totalSpent), avgOrderValue: Math.round(c.totalSpent / c.orders),
    })),
  };
}

async function getReportProductCOGS(params) {
  const db = await getDb();
  const recipes = await db.collection('skuRecipes').find({}).toArray();
  const orders = await db.collection('orders').find({}).toArray();
  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const filteredOrders = orders.filter(o => new Date(o.orderDate) >= startDate && new Date(o.orderDate) <= endDate);
  const recipeMap = {};
  recipes.forEach(r => { recipeMap[r.sku] = r; });

  const skuStats = {};
  filteredOrders.forEach(o => {
    if (!skuStats[o.sku]) skuStats[o.sku] = { sku: o.sku, productName: o.productName, orders: 0, revenue: 0, cogs: 0, hasRecipe: !!recipeMap[o.sku]?.ingredients?.length };
    skuStats[o.sku].orders++;
    skuStats[o.sku].revenue += o.salePrice || 0;
    const recipe = recipeMap[o.sku];
    if (recipe?.ingredients?.length) {
      skuStats[o.sku].cogs += recipe.ingredients.reduce((s, i) => s + ((i.costPerUnit || 0) * (i.quantityUsed || 0)), 0);
    }
  });

  return Object.values(skuStats).sort((a, b) => (b.revenue - b.cogs) - (a.revenue - a.cogs)).map(s => ({
    ...s, revenue: Math.round(s.revenue), cogs: Math.round(s.cogs),
    grossProfit: Math.round(s.revenue - s.cogs),
    margin: s.revenue > 0 ? Math.round(((s.revenue - s.cogs) / s.revenue) * 10000) / 100 : 0,
    avgCOGSPerOrder: s.orders > 0 ? Math.round(s.cogs / s.orders) : 0,
  }));
}



// Parse invoice text extracted by Tesseract.js into structured fields
function parseInvoiceText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const fullText = lines.join(' ');
  const fullLower = fullText.toLowerCase();
  
  // Extract amount — look for total/amount patterns
  let amount = 0;
  const amountPatterns = [
    /(?:total|grand\s*total|amount\s*(?:due|payable)?|net\s*(?:total|amount)|balance\s*due)[\s:₹$Rs.]*([₹$]?\s*[\d,]+\.?\d{0,2})/gi,
    /(?:Rs\.?|INR|₹|\$)\s*([\d,]+\.?\d{0,2})/gi,
    /([₹$]\s*[\d,]+\.?\d{0,2})/g,
  ];
  for (const pat of amountPatterns) {
    pat.lastIndex = 0;
    const matches = [...fullText.matchAll(pat)];
    if (matches.length > 0) {
      // Take the last/largest match for "total" patterns
      const vals = matches.map(m => {
        let val = (m[1] || m[0]).replace(/[₹$\s]/g, '').replace(/Rs\.?/gi, '').replace(/,/g, '');
        return parseFloat(val);
      }).filter(v => v > 0);
      if (vals.length > 0) {
        amount = Math.max(...vals);
        break;
      }
    }
  }
  
  // Extract date
  let date = null;
  const datePatterns = [
    /(?:date|dated|invoice\s*date|bill\s*date)[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g,
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g,
  ];
  for (const pat of datePatterns) {
    pat.lastIndex = 0;
    const m = pat.exec(fullText);
    if (m) {
      try {
        let dStr = m[1].replace(/\./g, '/');
        // Handle DD/MM/YYYY format
        const parts = dStr.split(/[\/\-]/);
        if (parts.length === 3) {
          let d;
          if (parts[0].length === 4) {
            d = new Date(parts[0], parts[1] - 1, parts[2]);
          } else if (parseInt(parts[2]) > 31) {
            // DD/MM/YYYY
            d = new Date(parts[2], parts[1] - 1, parts[0]);
          } else {
            d = new Date(dStr);
          }
          if (!isNaN(d.getTime())) {
            date = d.toISOString().split('T')[0];
            break;
          }
        }
      } catch {}
    }
  }
  
  // Extract invoice number
  let invoiceNumber = null;
  const invPatterns = [
    /(?:invoice|inv|bill|receipt|ref)\s*(?:no|number|#|num)?[\s.:]*\s*([A-Z0-9][\w\-\/]{2,25})/gi,
    /(?:invoice|inv)[\s\-#:]*([A-Z0-9][\w\-\/]{3,20})/gi,
  ];
  for (const pat of invPatterns) {
    pat.lastIndex = 0;
    const m = pat.exec(fullText);
    if (m) { invoiceNumber = m[1].trim(); break; }
  }
  
  // Extract vendor — first non-numeric line or line after "from"
  let vendor = null;
  const vendorPatterns = [/(?:from|seller|vendor|company|billed\s*by|sold\s*by)[\s:]*([A-Za-z][\w\s&.\-,]{2,40})/gi];
  for (const pat of vendorPatterns) {
    pat.lastIndex = 0;
    const m = pat.exec(fullText);
    if (m) {
      // Clean vendor name - remove trailing words like "Total" that may be part of next line
      vendor = m[1].trim().replace(/\s+(Total|Amount|Date|Invoice|Bill|Net|Grand|Balance).*$/i, '').trim();
      break;
    }
  }
  if (!vendor && lines.length > 0) {
    // Use first line that looks like a company name
    for (const line of lines.slice(0, 5)) {
      if (/^[A-Z][A-Za-z\s&.\-]{2,40}$/.test(line) && !/^(invoice|bill|receipt|date|total|gst|tax)/i.test(line)) {
        vendor = line.trim(); break;
      }
    }
  }
  
  // Detect category
  let category = 'Miscellaneous';
  const catMap = {
    'Raw Material Purchases': ['ingredient', 'raw material', 'chocolate', 'sugar', 'flour', 'butter', 'cream', 'food', 'edible'],
    'Packaging': ['box', 'carton', 'packaging', 'wrap', 'bag', 'tape', 'label', 'pouch'],
    'Shipping': ['courier', 'shipping', 'freight', 'transport', 'delivery', 'postage'],
    'Software & SaaS': ['software', 'subscription', 'saas', 'license', 'hosting', 'cloud', 'domain'],
    'Utilities': ['electricity', 'water', 'gas', 'internet', 'phone', 'wifi', 'broadband'],
    'Office Supplies': ['stationery', 'printer', 'paper', 'pen', 'office'],
    'Marketing': ['advertising', 'marketing', 'campaign', 'promotion', 'ads'],
    'Professional Services': ['consulting', 'legal', 'accounting', 'audit', 'chartered'],
  };
  for (const [cat, keywords] of Object.entries(catMap)) {
    if (keywords.some(kw => fullLower.includes(kw))) { category = cat; break; }
  }
  
  // Tax amount
  let taxAmount = 0;
  const taxPat = /(?:gst|tax|sgst|cgst|igst|vat)[\s:₹$Rs.]*([₹$]?\s*[\d,]+\.?\d{0,2})/gi;
  const taxMatches = [...fullText.matchAll(taxPat)];
  if (taxMatches.length > 0) {
    taxAmount = taxMatches.reduce((s, m) => {
      let val = (m[1] || '0').replace(/[₹$\s]/g, '').replace(/Rs\.?/gi, '').replace(/,/g, '');
      return s + parseFloat(val || 0);
    }, 0);
  }
  
  return {
    vendor, amount, date, invoiceNumber, category,
    description: lines.slice(0, 3).join(', ').substring(0, 200),
    taxAmount, currency: 'INR',
    confidence: (vendor ? 0.2 : 0) + (amount > 0 ? 0.3 : 0) + (date ? 0.2 : 0) + (invoiceNumber ? 0.15 : 0) + (category !== 'Miscellaneous' ? 0.15 : 0),
  };
}

function calculateEfficiency(m) {
  let score = 0;
  // Completion rate contributes 40%
  const cr = m.totalAssigned > 0 ? (m.completed / m.totalAssigned) : 0;
  score += cr * 40;
  // Speed (lower avg time = higher score) contributes 30%
  const avgT = m.totalTimes.length > 0 ? m.totalTimes.reduce((a, b) => a + b, 0) / m.totalTimes.length : 60;
  const speedScore = Math.max(0, 1 - (avgT / 120)); // 0 min = 100%, 120 min+ = 0%
  score += speedScore * 30;
  // Volume contributes 20%
  const volScore = Math.min(m.completed / 50, 1); // 50+ orders = max volume score
  score += volScore * 20;
  // Low wastage contributes 10%
  const wastRate = m.completed > 0 ? (m.wastageCount / m.completed) : 0;
  const wastScore = Math.max(0, 1 - wastRate * 5); // 20%+ wastage = 0
  score += wastScore * 10;
  return Math.round(score * 10) / 10;
}

async function getReportExpenseTrend(params) {
  const db = await getDb();
  const expenses = await db.collection('overheadExpenses').find({}).toArray();
  const categories = await db.collection('expenseCategories').find({}).toArray();
  const catNames = categories.map(c => c.name);

  // Date range
  const startDate = params.startDate ? new Date(params.startDate) : new Date(new Date().setMonth(new Date().getMonth() - 6));
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  // Generate month keys within the date range
  const rangeMonths = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur <= endMonth) {
    rangeMonths.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  // Build monthly expense by category
  const months = {};
  rangeMonths.forEach(key => { months[key] = { month: key, total: 0 }; });

  expenses.forEach(exp => {
    const cat = exp.category || 'Uncategorized';
    const amt = exp.amount || 0;
    const freq = exp.frequency || 'monthly';

    if (freq === 'one-time' && exp.date) {
      const d = new Date(exp.date);
      if (d >= startDate && d <= endDate) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (months[key]) {
          if (!months[key][cat]) months[key][cat] = 0;
          months[key][cat] += amt;
          months[key].total += amt;
        }
      }
    } else {
      let monthlyAmt = amt;
      if (freq === 'yearly') monthlyAmt = amt / 12;
      else if (freq === 'weekly') monthlyAmt = amt * 4.33;
      else if (freq === 'daily') monthlyAmt = amt * 30;
      // Distribute to all months in range
      rangeMonths.forEach(key => {
        if (!months[key][cat]) months[key][cat] = 0;
        months[key][cat] += monthlyAmt;
        months[key].total += monthlyAmt;
      });
    }
  });

  // Round all values
  Object.values(months).forEach(m => {
    Object.keys(m).forEach(k => { if (typeof m[k] === 'number') m[k] = Math.round(m[k]); });
  });

  return { data: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)), categories: [...new Set([...catNames, ...expenses.map(e => e.category).filter(Boolean)])] };
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

    await logSyncEvent(db, 'shopify', 'sync-products', 'success', { synced, totalProducts: allProducts.length });
    return { message: `Synced ${synced} new SKUs from ${allProducts.length} products`, synced, totalProducts: allProducts.length };
  } catch (err) {
    const db2 = await getDb();
    await logSyncEvent(db2, 'shopify', 'sync-products', 'error', { error: err.message });
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
      const allLineItems = shopifyOrder.line_items || [];
      
      // Separate real product items from tip items
      const productItems = allLineItems.filter(i => (i.title || '').toLowerCase() !== 'tip');
      const tipItems = allLineItems.filter(i => (i.title || '').toLowerCase() === 'tip');
      const tipAmount = tipItems.reduce((sum, t) => sum + (parseFloat(t.price) * (t.quantity || 1)), 0);

      const totalLineItems = productItems.length || 1;
      const totalShipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 0);
      const totalDiscount = parseFloat(shopifyOrder.total_discounts || 0);
      const finalOrderPrice = parseFloat(shopifyOrder.total_price || 0);
      const rawSubtotal = productItems.reduce((sum, i) => sum + (parseFloat(i.price) * (i.quantity || 1)), 0);

      // Shopify Revenue Parity: extract refund amounts
      const totalRefunds = (shopifyOrder.refunds || []).reduce((sum, refund) => {
        return sum + (refund.refund_line_items || []).reduce((s, rli) => {
          return s + (parseFloat(rli.subtotal) || 0);
        }, 0);
      }, 0);

      // Map Shopify financial_status for strict filtering
      const financialStatus = shopifyOrder.financial_status || 'unknown';

      // Only process real product items (skip tips)
      for (const item of productItems) {
        const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;
        const itemQty = item.quantity || 1;

        // Each line item gets its proportional share of the final checkout price
        const lineItemRaw = parseFloat(item.price) * itemQty;
        const priceRatio = rawSubtotal > 0 ? lineItemRaw / rawSubtotal : (1 / totalLineItems);

        // Distribute tip proportionally across real line items
        const itemTipShare = tipAmount > 0 ? Math.round(tipAmount * priceRatio * 100) / 100 : 0;

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
              quantity: itemQty,
              tipAmount: itemTipShare,
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

    // Auto-create SKU recipe stubs for any new SKUs found in orders
    const allOrderSkus = await db.collection('orders').distinct('sku');
    const existingRecipeSkus = new Set((await db.collection('skuRecipes').distinct('sku')));
    let recipeStubsCreated = 0;
    for (const sku of allOrderSkus) {
      if (!existingRecipeSkus.has(sku)) {
        const sampleOrder = await db.collection('orders').findOne({ sku });
        await db.collection('skuRecipes').insertOne({
          _id: uuidv4(),
          sku,
          productName: sampleOrder?.productName || sku,
          shopifySynced: true,
          needsCostInput: true,
          ingredients: [],
          rawMaterials: [],
          packaging: [],
          consumableCost: 0,
          totalWeightGrams: 0,
          defaultWastageBuffer: 5,
          monthlyWastageOverride: null,
          templateId: null,
          templateName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        recipeStubsCreated++;
      }
    }

    await db.collection('integrations').updateOne({ _id: 'integrations-config' }, { $set: { 'shopify.lastSyncAt': new Date().toISOString() } });
    await logSyncEvent(db, 'shopify', 'sync-orders', 'success', { synced, updated, recipeStubsCreated, totalShopifyOrders: allShopifyOrders.length });

    return {
      message: `Synced ${synced} new orders, updated ${updated} existing. Created ${recipeStubsCreated} recipe stubs. Total Shopify orders: ${allShopifyOrders.length}`,
      synced, updated, recipeStubsCreated, totalShopifyOrders: allShopifyOrders.length
    };
  } catch (err) {
    const db2 = await getDb();
    await logSyncEvent(db2, 'shopify', 'sync-orders', 'error', { error: err.message });
    return { error: `Shopify order sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== INDIA POST AUTH & TRACKING ====================

async function indiaPostAuth(username, password, baseUrl) {
  try {
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
  } catch (err) {
    if (err.cause?.code === 'ECONNRESET' || err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED') || err.message?.includes('ECONNRESET')) {
      throw new Error(`Connection refused by India Post. Your server IP must be whitelisted in India Post's portal. Go to IP Address Whitelisting in your India Post account and add your server IP. Current server IP: will be shown in the error details.`);
    }
    throw err;
  }
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

    await logSyncEvent(db, 'indiaPost', 'sync-tracking', 'success', { scanned: pendingOrders.length, tracked: totalTracked, delivered: totalDelivered, rto: totalRTO });

    return {
      message: `Scanned ${pendingOrders.length} shipments. Updated: ${totalTracked} (${totalDelivered} delivered, ${totalRTO} RTO)${totalErrors > 0 ? `. ${totalErrors} errors.` : ''}`,
      scanned: pendingOrders.length,
      tracked: totalTracked,
      delivered: totalDelivered,
      rto: totalRTO,
      errors: totalErrors,
    };
  } catch (err) {
    const db2 = await getDb();
    await logSyncEvent(db2, 'indiaPost', 'sync-tracking', 'error', { error: err.message });
    return { error: `India Post tracking failed: ${err.message}`, tracked: 0 };
  }
}

async function indiaPostTestConnection() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.indiaPost?.username || !integrations?.indiaPost?.password) {
    return { error: 'India Post credentials not configured. Enter username & password first.' };
  }

  const { username, password, sandboxMode } = integrations.indiaPost;
  const baseUrl = sandboxMode !== false
    ? 'https://test.cept.gov.in/beextcustomer/v1'
    : 'https://cept.gov.in/beextcustomer/v1';

  // Get our server's public IP for helpful error messages
  let serverIp = 'unknown';
  try {
    const ipRes = await fetch('https://api.ipify.org?format=text');
    if (ipRes.ok) serverIp = (await ipRes.text()).trim();
  } catch {}

  try {
    const accessToken = await indiaPostAuth(username, password, baseUrl);
    // Store token for future use
    await db.collection('integrations').updateOne(
      { _id: 'integrations-config' },
      { $set: {
        'indiaPost.lastTokenAt': new Date().toISOString(),
        'indiaPost.tokenValid': true,
      }}
    );
    await logSyncEvent(db, 'indiaPost', 'test-connection', 'success', { baseUrl, serverIp });
    return {
      message: `Connection successful! Authenticated with India Post ${sandboxMode !== false ? 'Sandbox' : 'Production'} API.`,
      baseUrl,
      serverIp,
      tokenReceived: true,
    };
  } catch (err) {
    await logSyncEvent(db, 'indiaPost', 'test-connection', 'error', { error: err.message, serverIp });
    const isConnRefused = err.message?.includes('Connection refused') || err.message?.includes('fetch failed') || err.message?.includes('ECONNRESET');
    if (isConnRefused) {
      return {
        error: `Connection refused by India Post. Your server IP (${serverIp}) must be whitelisted in India Post's portal → IP Address Whitelisting → UAT Environment. Add IP: ${serverIp}`,
        serverIp,
        action: 'whitelist_ip',
      };
    }
    return { error: `Connection failed: ${err.message}`, serverIp };
  }
}

// (Shopify Bills CSV import removed — automated fee calculation via shopifyTxnFeeRate in Settings)

// ==================== FIFO STOCK ENGINE ====================

async function consumeStockForOrder(db, orderId, orderDate, items) {
  const consumptions = [];
  for (const item of items) {
    const { inventoryItemId, inventoryItemName, quantity } = item;
    let remaining = quantity;

    // FIFO: oldest batch first
    const batches = await db.collection('stockBatches')
      .find({ inventoryItemId, remainingQty: { $gt: 0 } })
      .sort({ date: 1, createdAt: 1 })
      .toArray();

    for (const batch of batches) {
      if (remaining <= 0) break;
      const consume = Math.min(remaining, batch.remainingQty);

      consumptions.push({
        _id: uuidv4(),
        orderId,
        inventoryItemId,
        inventoryItemName: inventoryItemName || batch.inventoryItemName || '',
        batchId: batch._id,
        quantity: consume,
        costPerUnit: batch.costPerUnit,
        totalCost: Math.round(consume * batch.costPerUnit * 100) / 100,
        date: orderDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      await db.collection('stockBatches').updateOne(
        { _id: batch._id },
        { $inc: { remainingQty: -consume }, $set: { updatedAt: new Date().toISOString() } }
      );
      remaining -= consume;
    }

    if (remaining > 0) {
      consumptions.push({
        _id: uuidv4(),
        orderId,
        inventoryItemId,
        inventoryItemName: inventoryItemName || 'Unknown',
        batchId: null,
        quantity: remaining,
        costPerUnit: 0,
        totalCost: 0,
        date: orderDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        insufficientStock: true,
      });
    }
  }

  if (consumptions.length > 0) {
    await db.collection('stockConsumptions').insertMany(consumptions);
  }
  return consumptions;
}

async function reverseStockConsumption(db, orderId) {
  const consumptions = await db.collection('stockConsumptions')
    .find({ orderId })
    .toArray();

  for (const c of consumptions) {
    if (c.batchId) {
      await db.collection('stockBatches').updateOne(
        { _id: c.batchId },
        { $inc: { remainingQty: c.quantity }, $set: { updatedAt: new Date().toISOString() } }
      );
    }
  }
  await db.collection('stockConsumptions').deleteMany({ orderId });
  return consumptions.length;
}

async function getInventoryStockSummary(db) {
  const items = await db.collection('inventoryItems').find({}).sort({ category: 1, name: 1 }).toArray();
  const batches = await db.collection('stockBatches').find({}).toArray();

  // Group batches by inventoryItemId
  const batchMap = {};
  batches.forEach(b => {
    if (!batchMap[b.inventoryItemId]) batchMap[b.inventoryItemId] = [];
    batchMap[b.inventoryItemId].push(b);
  });

  return items.map(item => {
    const itemBatches = batchMap[item._id] || [];
    const currentStock = itemBatches.reduce((sum, b) => sum + (b.remainingQty || 0), 0);
    const totalPurchased = itemBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
    const avgCost = totalPurchased > 0
      ? Math.round(itemBatches.reduce((sum, b) => sum + (b.quantity * b.costPerUnit), 0) / totalPurchased * 100) / 100
      : item.baseCostPerUnit || 0;
    const isLowStock = (item.lowStockThreshold || 0) > 0 && currentStock <= item.lowStockThreshold;

    return {
      ...item,
      currentStock,
      totalPurchased,
      avgCostPerUnit: avgCost,
      isLowStock,
      batchCount: itemBatches.filter(b => b.remainingQty > 0).length,
    };
  });
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
    const unmatchedPaymentsList = []; // Track unmatched payments for storage

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
        // Store unmatched payment for review
        if (payment.status === 'captured') {
          unmatchedPaymentsList.push({
            _id: payment.id,
            paymentId: payment.id,
            amount: (payment.amount || 0) / 100,
            contact: payment.contact || '',
            email: payment.email || '',
            method: payment.method || 'unknown',
            description: payment.description || '',
            createdAt: payment.created_at ? new Date(payment.created_at * 1000).toISOString() : new Date().toISOString(),
            fee: (payment.fee || 0) / 100,
            tax: (payment.tax || 0) / 100,
            settlementId: payment.settlement_id || null,
            status: 'unresolved', // unresolved / ignored / manually_matched
            syncedAt: new Date().toISOString(),
          });
        }
      }
    }

    // Store unmatched payments — clear old ones and insert new
    await db.collection('razorpayUnmatchedPayments').deleteMany({ status: 'unresolved' });
    if (unmatchedPaymentsList.length > 0) {
      await db.collection('razorpayUnmatchedPayments').insertMany(unmatchedPaymentsList, { ordered: false }).catch(() => {});
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

    await logSyncEvent(db, 'razorpay', 'sync-payments', 'success', { totalPayments: allPayments.length, matched, unmatched });

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
    const db2 = await getDb();
    await logSyncEvent(db2, 'razorpay', 'sync-payments', 'error', { error: err.message });
    return { error: `Razorpay sync failed: ${err.message}`, synced: 0 };
  }
}

async function getRazorpaySettlements() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.razorpay?.keyId || !integrations?.razorpay?.keySecret) {
    return { settlements: [], error: null, active: false, estimated: null, accuracy: null };
  }

  if (!integrations?.razorpay?.active) {
    return { settlements: [], error: null, active: false, estimated: null, accuracy: null };
  }

  const { keyId, keySecret } = integrations.razorpay;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const res = await fetch('https://api.razorpay.com/v1/settlements?count=100&skip=0', {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      return { settlements: [], error: `Razorpay API error: ${res.status}`, active: true, estimated: null, accuracy: null };
    }

    const data = await res.json();
    let allItems = (data.items || []);

    // Paginate to get ALL settlements
    let totalCount = data.count || allItems.length;
    let skip = allItems.length;
    while (skip < totalCount) {
      try {
        const nextRes = await fetch(`https://api.razorpay.com/v1/settlements?count=100&skip=${skip}`, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });
        if (nextRes.ok) {
          const nextData = await nextRes.json();
          const nextItems = nextData.items || [];
          if (nextItems.length === 0) break;
          allItems = allItems.concat(nextItems);
          totalCount = nextData.count || totalCount;
          skip += nextItems.length;
        } else break;
      } catch { break; }
    }

    const items = allItems.map(s => ({
      id: s.id,
      amount: (s.amount || 0) / 100,
      status: s.status,
      fees: (s.fees || 0) / 100,
      tax: (s.tax || 0) / 100,
      utr: s.utr || null,
      createdAt: s.created_at ? new Date(s.created_at * 1000).toISOString() : null,
    }));

    // --- Compute Estimated Available Balance & Today's Settlement ---
    // Two-tier approach:
    //   1. "Available Balance" = orders with razorpayReconciled:true AND no settlementId AND captured within last 5 days
    //      (older null-settlement orders are likely settled but not updated in DB since last sync)
    //   2. "Today's Settlement" = subset: payments captured ~T-2 business days ago (queued for today)
    const processedSettlements = items.filter(s => s.status === 'processed');
    const now = new Date();

    // Calculate the cutoff: 5 calendar days ago (covers T+2 + weekends + buffer)
    const availBalanceCutoff = new Date(now);
    availBalanceCutoff.setDate(availBalanceCutoff.getDate() - 5);
    const cutoffStr = availBalanceCutoff.toISOString().split('T')[0];

    // Calculate T-2 business days ago for "today's settlement" bucket
    let todaySettlementDate = new Date(now);
    let bDays = 0;
    while (bDays < 2) {
      todaySettlementDate.setDate(todaySettlementDate.getDate() - 1);
      const dow = todaySettlementDate.getDay();
      if (dow !== 0 && dow !== 6) bDays++;
    }
    const todaySettCutoffStart = todaySettlementDate.toISOString().split('T')[0];
    // Today's settlement covers payments from ~T-2 to ~T-1 (the day before today)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const todaySettCutoffEnd = yesterday.toISOString().split('T')[0];

    // Query: Available Balance — orders reconciled, no settlement ID, recent (last 5 days)
    const availBalanceOrders = await db.collection('orders').find({
      razorpayReconciled: true,
      $or: [
        { razorpaySettlementId: null },
        { razorpaySettlementId: { $exists: false } },
        { razorpaySettlementId: '' },
      ],
      orderDate: { $gte: cutoffStr },
    }).toArray();

    let abGross = 0, abFees = 0, abTax = 0;
    availBalanceOrders.forEach(o => {
      abGross += o.salePrice || 0;
      abFees += o.razorpayFee || 0;
      abTax += o.razorpayTax || 0;
    });
    const abNet = abGross - abFees - abTax;

    // Query: Today's Settlement — subset of above, payments captured around T-2 business days ago
    const todaySettlementOrders = availBalanceOrders.filter(o => {
      const d = (o.orderDate || '').split('T')[0];
      return d >= todaySettCutoffStart && d <= todaySettCutoffEnd;
    });

    let tsGross = 0, tsFees = 0, tsTax = 0;
    todaySettlementOrders.forEach(o => {
      tsGross += o.salePrice || 0;
      tsFees += o.razorpayFee || 0;
      tsTax += o.razorpayTax || 0;
    });
    const tsNet = tsGross - tsFees - tsTax;

    // Expected settlement date (next business day at 9 PM IST for today's batch)
    let estDate = new Date(now);
    estDate.setHours(21, 0, 0, 0); // Today before 9 PM
    // If it's already past 9 PM, move to next business day
    if (now.getHours() >= 21) {
      estDate.setDate(estDate.getDate() + 1);
      while (estDate.getDay() === 0 || estDate.getDay() === 6) {
        estDate.setDate(estDate.getDate() + 1);
      }
    }

    const estimated = {
      // Available Balance — all unsettled funds
      availableBalance: Math.round(abGross * 100) / 100,
      availableNet: Math.round(abNet * 100) / 100,
      availableFees: Math.round(abFees * 100) / 100,
      availableTax: Math.round(abTax * 100) / 100,
      availableOrderCount: availBalanceOrders.length,
      // Today's Settlement — batch being sent today
      todaySettlement: Math.round(tsNet * 100) / 100,
      todayGross: Math.round(tsGross * 100) / 100,
      todayFees: Math.round(tsFees * 100) / 100,
      todayTax: Math.round(tsTax * 100) / 100,
      todayOrderCount: todaySettlementOrders.length,
      expectedDate: estDate.toISOString(),
      // Metadata
      lookbackDays: 5,
      todaySettlementWindow: `${todaySettCutoffStart} to ${todaySettCutoffEnd}`,
      computedAt: now.toISOString(),
    };

    // --- Save estimate for accuracy tracking ---
    const todayKey = now.toISOString().split('T')[0];
    if (tsNet > 0) {
      await db.collection('settlementEstimates').updateOne(
        { _id: todayKey },
        {
          $set: {
            date: todayKey,
            estimatedNet: estimated.todaySettlement,
            estimatedGross: estimated.todayGross,
            estimatedFees: estimated.todayFees,
            estimatedTax: estimated.todayTax,
            orderCount: estimated.todayOrderCount,
            availableBalanceNet: estimated.availableNet,
            computedAt: now.toISOString(),
          }
        },
        { upsert: true }
      );
    }

    // --- Accuracy tracking: compare past estimates with actual settlements ---
    const pastEstimates = await db.collection('settlementEstimates')
      .find({ actualAmount: { $exists: true } })
      .sort({ date: -1 })
      .limit(20)
      .toArray();

    // Try to match processed settlements with stored estimates
    for (const s of processedSettlements) {
      if (!s.createdAt) continue;
      const settDate = new Date(s.createdAt).toISOString().split('T')[0];
      // Check if we have an estimate for the day before this settlement (T-2 estimate)
      const estDocs = await db.collection('settlementEstimates').find({
        date: { $lte: settDate },
        actualAmount: { $exists: false },
      }).sort({ date: -1 }).limit(1).toArray();

      if (estDocs.length > 0) {
        const est = estDocs[0];
        const accuracyPct = est.estimatedNet > 0
          ? Math.round((1 - Math.abs(s.amount - est.estimatedNet) / est.estimatedNet) * 10000) / 100
          : null;
        await db.collection('settlementEstimates').updateOne(
          { _id: est._id },
          {
            $set: {
              actualAmount: s.amount,
              actualDate: settDate,
              settlementId: s.id,
              accuracyPercent: accuracyPct,
              matchedAt: now.toISOString(),
            }
          }
        );
      }
    }

    // Compute overall accuracy stats
    const allMatched = await db.collection('settlementEstimates')
      .find({ accuracyPercent: { $exists: true, $ne: null } })
      .sort({ date: -1 })
      .limit(20)
      .toArray();

    let accuracy = null;
    if (allMatched.length > 0) {
      const avgAcc = allMatched.reduce((sum, e) => sum + (e.accuracyPercent || 0), 0) / allMatched.length;
      const recent = allMatched.slice(0, 5);
      const recentAcc = recent.length > 0 ? recent.reduce((sum, e) => sum + (e.accuracyPercent || 0), 0) / recent.length : null;
      accuracy = {
        samples: allMatched.length,
        avgAccuracy: Math.round(avgAcc * 100) / 100,
        recentAccuracy: recentAcc !== null ? Math.round(recentAcc * 100) / 100 : null,
        history: allMatched.slice(0, 5).map(e => ({
          date: e.date,
          estimated: e.estimatedNet,
          actual: e.actualAmount,
          accuracy: e.accuracyPercent,
        })),
      };
    }

    return { settlements: items, error: null, active: true, estimated, accuracy };
  } catch (err) {
    return { settlements: [], error: err.message, active: true, estimated: null, accuracy: null };
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
  // Lazy init the scheduler on first request
  try { await initScheduler(); } catch (e) { /* silent */ }
  // Ensure DB indexes
  try { await initOnce(); } catch (e) { /* silent */ }


  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const subResource = segments[1];
    const thirdSegment = segments[2];
    const params = getSearchParams(request);

    switch (resource) {
      case 'auth-config': {
        // Public endpoint - tells the login page if Google OAuth is configured
        const db = await getDb();
        const integrations = await db.collection('integrations').findOne({});
        const googleConfigured = !!(integrations?.google?.clientId && integrations?.google?.clientSecret);
        return json({ googleConfigured });
      }

      case 'api-keys': {
        // GET /api/api-keys — List all API keys (masked)
        const db = await getDb();
        const keys = await db.collection('apiKeys').find({}).sort({ createdAt: -1 }).toArray();
        const masked = keys.map(k => ({
          _id: k._id,
          name: k.name,
          scope: k.scope,
          maskedKey: k.keyPrefix ? `${k.keyPrefix}...${k.keySuffix || '****'}` : 'pos_****...****',
          rateLimit: k.rateLimit || 100,
          requestCount: k.requestCount || 0,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
          revoked: k.revoked || false,
        }));
        return json(masked);
      }

      case 'gamification': {
        // GET /api/gamification/progress — Calculate and return gamification data
        const db = await getDb();
        const [tenantConfig, integrations, orderCount, skuCount, expCount, billCount, vendorCount, invCount, empCount, apiKeyCount] = await Promise.all([
          db.collection('tenantConfig').findOne({}),
          db.collection('integrations').findOne({ _id: 'integrations-config' }),
          db.collection('orders').countDocuments({}),
          db.collection('skuRecipes').countDocuments({}),
          db.collection('overheadExpenses').countDocuments({}),
          db.collection('bills').countDocuments({}),
          db.collection('vendors').countDocuments({}),
          db.collection('inventoryItems').countDocuments({}),
          db.collection('employees').countDocuments({}),
          db.collection('apiKeys').countDocuments({ revoked: { $ne: true } }),
        ]);

        // Check if any backups exist
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        const backupDir = path.join(process.cwd(), 'backups');
        let backupCount = 0;
        try { backupCount = fs.readdirSync(backupDir).filter(f => f.endsWith('.zip')).length; } catch {}

        const ctx = {
          tenantConfig: tenantConfig || {},
          integrations: integrations || {},
          counts: {
            orders: orderCount,
            skuRecipes: skuCount,
            expenses: expCount,
            bills: billCount,
            vendors: vendorCount,
            inventoryItems: invCount,
            employees: empCount,
            apiKeys: apiKeyCount,
            backups: backupCount,
          },
        };

        const progress = calculateProgress(ctx);

        // Build setup checklist
        const setupChecklist = SETUP_CHECKLIST.map(item => {
          const ach = progress.unlocked.find(a => a.id === item.achievementId);
          return { ...item, completed: !!ach };
        });

        return json({ ...progress, setupChecklist });
      }

      case 'module-settings': {
        // GET /api/module-settings — Get module toggle settings
        const db = await getDb();
        const config = await db.collection('tenantConfig').findOne({});
        const moduleSettings = config?.moduleSettings || {};
        // Merge with defaults
        const merged = {};
        for (const [key, def] of Object.entries(DEFAULT_MODULE_SETTINGS)) {
          merged[key] = {
            ...def,
            enabled: moduleSettings[key]?.enabled !== undefined ? moduleSettings[key].enabled : def.enabled,
          };
        }
        return json(merged);
      }

      case 'shipping-carriers': {
        // GET /api/shipping-carriers — List custom carrier configs
        const db = await getDb();
        const carriers = await db.collection('shippingCarriers').find({}).sort({ name: 1 }).toArray();
        return json(carriers);
      }

      case 'profile': {
        // GET /api/profile — Get current user's profile
        const db = await getDb();
        try {
          const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
          if (!token?.userId) return json({ error: 'Not authenticated' }, 401);
          const user = await db.collection('users').findOne({ _id: token.userId });
          if (!user) return json({ error: 'User not found' }, 404);
          const { passwordHash, ...safeUser } = user;
          return json(safeUser);
        } catch (err) {
          return json({ error: 'Failed to get profile' }, 500);
        }
      }

      case 'users': {
        const db = await getDb();
        if (subResource && thirdSegment === 'activity') {
          // GET /api/users/{id}/activity — User activity log
          const activities = await db.collection('userActivity').find({ userId: subResource }).sort({ timestamp: -1 }).limit(100).toArray();
          // Also add auto-generated activity from KDS assignments
          const kdsActivities = await db.collection('kdsAssignments').find({ employeeId: subResource }).sort({ assignedAt: -1 }).limit(50).toArray();
          const combined = [
            ...activities,
            ...kdsActivities.map(a => ({
              action: `KDS: Order ${a.order?.orderId || a.orderId} — ${a.status}`,
              timestamp: a.updatedAt || a.assignedAt,
            })),
          ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
          return json(combined);
        }
        if (subResource && subResource !== 'me') {
          const user = await db.collection('users').findOne({ _id: subResource });
          if (!user) return json({ error: 'User not found' }, 404);
          const { passwordHash, ...safeUser } = user;
          return json(safeUser);
        }
        if (subResource === 'me') {
          // Would need session - for now return instruction
          return json({ error: 'Use /api/auth/session instead' }, 400);
        }
        const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
        const safeUsers = users.map(u => {
          const { passwordHash, ...safe } = u;
          return safe;
        });
        return json(safeUsers);
      }

      case 'parcel-images': {
        // GET /api/parcel-images?orderId=xxx
        const db = await getDb();
        const query = {};
        if (params.orderId) query.orderId = params.orderId;
        const images = await db.collection('parcelImages').find(query).sort({ createdAt: -1 }).limit(20).toArray();
        return json(images);
      }

      case 'data': {
        const db = await getDb();
        if (subResource === 'export') {
          // GET /api/data/export?modules=orders,recipes,...&format=json|csv&dateFrom=...&dateTo=...
          const modulesParam = params.modules || 'all';
          const format = params.format || 'json';
          const dateFrom = params.dateFrom;
          const dateTo = params.dateTo;
          const requestedModules = modulesParam === 'all'
            ? ['orders', 'recipes', 'expenses', 'inventory', 'employees', 'whatsapp', 'rto', 'settings']
            : modulesParam.split(',').map(m => m.trim());

          const exportData = {
            _meta: {
              exportedAt: new Date().toISOString(),
              version: '1.0',
              format,
              modules: requestedModules,
              dateRange: dateFrom || dateTo ? { from: dateFrom || null, to: dateTo || null } : null,
            },
          };

          // Build date query for time-based data
          const dateQuery = {};
          if (dateFrom) dateQuery.$gte = dateFrom;
          if (dateTo) dateQuery.$lte = dateTo;
          const hasDateFilter = dateFrom || dateTo;

          for (const mod of requestedModules) {
            switch (mod) {
              case 'orders': {
                const oQuery = hasDateFilter ? { orderDate: dateQuery } : {};
                exportData.orders = await db.collection('orders').find(oQuery).toArray();
                break;
              }
              case 'recipes': {
                exportData.skuRecipes = await db.collection('skuRecipes').find({}).toArray();
                exportData.recipeTemplates = await db.collection('recipeTemplates').find({}).toArray();
                break;
              }
              case 'expenses': {
                const eQuery = hasDateFilter ? { date: dateQuery } : {};
                exportData.overheadExpenses = await db.collection('overheadExpenses').find(eQuery).toArray();
                exportData.expenseCategories = await db.collection('expenseCategories').find({}).toArray();
                exportData.bills = await db.collection('bills').find({}).toArray();
                exportData.vendors = await db.collection('vendors').find({}).toArray();
                break;
              }
              case 'inventory': {
                exportData.inventoryItems = await db.collection('inventoryItems').find({}).toArray();
                exportData.inventoryCategories = await db.collection('inventoryCategories').find({}).toArray();
                exportData.rawMaterials = await db.collection('rawMaterials').find({}).toArray();
                exportData.packagingMaterials = await db.collection('packagingMaterials').find({}).toArray();
                exportData.stockBatches = await db.collection('stockBatches').find({}).toArray();
                break;
              }
              case 'employees': {
                exportData.employees = await db.collection('employees').find({}).toArray();
                exportData.kdsAssignments = await db.collection('kdsAssignments').find({}).toArray();
                exportData.wastageLog = await db.collection('wastageLog').find({}).toArray();
                exportData.materialRequests = await db.collection('materialRequests').find({}).toArray();
                break;
              }
              case 'whatsapp': {
                exportData.whatsappTemplates = await db.collection('whatsappTemplates').find({}).toArray();
                exportData.whatsappMessages = await db.collection('whatsappMessages').find({}).toArray();
                exportData.whatsappOptOuts = await db.collection('whatsappOptOuts').find({}).toArray();
                break;
              }
              case 'rto': {
                exportData.rtoParcels = await db.collection('rtoParcels').find({}).toArray();
                break;
              }
              case 'settings': {
                // Sanitized — remove sensitive data
                const tenantConfig = await db.collection('tenantConfig').findOne({ _id: 'config' });
                exportData.tenantConfig = tenantConfig ? { ...tenantConfig } : null;

                const users = await db.collection('users').find({}).toArray();
                exportData.users = users.map(u => ({ _id: u._id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt }));

                // Sanitized integrations (no API keys)
                const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
                if (integrations) {
                  exportData.integrations = {
                    shopify: { active: integrations.shopify?.active, storeUrl: integrations.shopify?.storeUrl, lastSyncAt: integrations.shopify?.lastSyncAt },
                    razorpay: { active: integrations.razorpay?.active, lastSyncAt: integrations.razorpay?.lastSyncAt },
                    metaAds: { active: integrations.metaAds?.active, lastSyncAt: integrations.metaAds?.lastSyncAt },
                    indiaPost: { active: integrations.indiaPost?.active, sandboxMode: integrations.indiaPost?.sandboxMode },
                    whatsapp: { active: integrations.whatsapp?.active },
                  };
                }
                break;
              }
            }
          }

          // Calculate summary counts
          const summary = {};
          for (const [key, value] of Object.entries(exportData)) {
            if (key === '_meta') continue;
            if (Array.isArray(value)) summary[key] = value.length;
            else if (value) summary[key] = 1;
          }
          exportData._meta.summary = summary;

          if (format === 'csv') {
            // For CSV, we only export orders as CSV (most useful)
            const orders = exportData.orders || [];
            if (orders.length === 0) return json({ error: 'No orders to export as CSV' }, 400);
            const headers = ['orderId', 'shopifyOrderId', 'productName', 'sku', 'customerName', 'customerEmail', 'customerPhone', 'salePrice', 'quantity', 'discount', 'shippingCost', 'razorpayFee', 'tipAmount', 'status', 'orderDate', 'financialStatus'];
            const csvRows = [headers.join(',')];
            for (const o of orders) {
              const row = headers.map(h => {
                const val = o[h] ?? '';
                const str = String(val).replace(/"/g, '""');
                return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
              });
              csvRows.push(row.join(','));
            }
            return new NextResponse(csvRows.join('\n'), {
              headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename=profitos-orders-${new Date().toISOString().split('T')[0]}.csv`,
              },
            });
          }

          return json(exportData);
        }

        if (subResource === 'export-counts') {
          // GET /api/data/export-counts — Quick counts for UI
          const counts = {};
          const collections = [
            ['orders', 'orders'], ['skuRecipes', 'recipes'], ['recipeTemplates', 'recipeTemplates'],
            ['overheadExpenses', 'expenses'], ['expenseCategories', 'expenseCategories'],
            ['bills', 'bills'], ['vendors', 'vendors'],
            ['inventoryItems', 'inventoryItems'], ['inventoryCategories', 'inventoryCategories'],
            ['rawMaterials', 'rawMaterials'], ['packagingMaterials', 'packagingMaterials'],
            ['employees', 'employees'], ['kdsAssignments', 'kdsAssignments'],
            ['whatsappTemplates', 'whatsappTemplates'], ['whatsappMessages', 'whatsappMessages'],
            ['rtoParcels', 'rtoParcels'], ['users', 'users'],
          ];
          for (const [coll, key] of collections) {
            counts[key] = await db.collection(coll).countDocuments();
          }
          return json(counts);
        }

        return json({ error: 'Unknown data endpoint' }, 404);
      }

      case 'backups': {
        const db = await getDb();
        switch (subResource) {
          case undefined:
          case null:
          case '': {
            // GET /api/backups — List all backups (metadata only)
            const backups = await db.collection('backups').find({}).project({ data: 0 }).sort({ createdAt: -1 }).toArray();
            return json(backups);
          }

          case 'download': {
            // GET /api/backups/download?id=XXX — Download a specific backup
            const backupId = params.id;
            if (!backupId) return json({ error: 'Backup ID required' }, 400);
            const backup = await db.collection('backups').findOne({ _id: backupId });
            if (!backup) return json({ error: 'Backup not found' }, 404);
            const jsonStr = JSON.stringify(backup.data, null, 2);
            return new NextResponse(jsonStr, {
              headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename=profitos-backup-${backup.createdAt?.split('T')[0] || 'unknown'}.json` },
            });
          }

          case 'config': {
            // GET /api/backups/config — Get backup configuration
            const settings = await getSyncSettings();
            return json({
              autoEnabled: settings.backups?.autoEnabled || false,
              frequency: settings.backups?.frequency || 'off',
              retention: settings.backups?.retention || 5,
              lastAutoBackup: settings.backups?.lastAutoBackup || null,
              gdrive: {
                connected: !!settings.gdrive?.refreshToken,
                email: settings.gdrive?.email || null,
                autoUpload: settings.gdrive?.autoUpload || false,
                lastUpload: settings.gdrive?.lastUpload || null,
                folderId: settings.gdrive?.folderId || null,
              },
            });
          }

          case 'gdrive': {
            if (thirdSegment === 'auth-url') {
              const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
              const clientId = integrations?.google?.clientId;
              if (!clientId) return json({ error: 'Google Client ID not configured. Go to Integrations → Authentication.' }, 400);
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
              const redirectUri = `${baseUrl}/api/backups/gdrive/callback`;
              const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
              const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
              return json({ authUrl, redirectUri });
            }

            if (thirdSegment === 'callback') {
              const code = params.code;
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
              if (!code) {
                const errorDesc = params.error_description || params.error || 'Unknown error';
                return NextResponse.redirect(`${baseUrl}?view=data-management&gdrive=error&msg=${encodeURIComponent(errorDesc)}`);
              }
              const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
              const clientId = integrations?.google?.clientId;
              const clientSecret = integrations?.google?.clientSecret;
              if (!clientId || !clientSecret) {
                return NextResponse.redirect(`${baseUrl}?view=data-management&gdrive=error&msg=Google+credentials+not+configured`);
              }
              const redirectUri = `${baseUrl}/api/backups/gdrive/callback`;
              try {
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
                });
                const tokenData = await tokenRes.json();
                if (!tokenRes.ok || !tokenData.refresh_token) {
                  return NextResponse.redirect(`${baseUrl}?view=data-management&gdrive=error&msg=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
                }
                let email = '';
                try {
                  const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
                  email = (await uRes.json()).email || '';
                } catch {}
                let folderId = null;
                try {
                  const fRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST', headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'Profit OS Backups', mimeType: 'application/vnd.google-apps.folder' }),
                  });
                  folderId = (await fRes.json()).id;
                } catch {}
                await updateSyncSettings({ 'gdrive.refreshToken': tokenData.refresh_token, 'gdrive.email': email, 'gdrive.folderId': folderId, 'gdrive.connectedAt': new Date().toISOString(), 'gdrive.autoUpload': false });
                return NextResponse.redirect(`${baseUrl}?view=data-management&gdrive=success`);
              } catch (err) {
                return NextResponse.redirect(`${baseUrl}?view=data-management&gdrive=error&msg=${encodeURIComponent(err.message)}`);
              }
            }

            if (thirdSegment === 'status') {
              const settings = await getSyncSettings();
              return json({ connected: !!settings.gdrive?.refreshToken, email: settings.gdrive?.email || null, folderId: settings.gdrive?.folderId || null, autoUpload: settings.gdrive?.autoUpload || false, lastUpload: settings.gdrive?.lastUpload || null, connectedAt: settings.gdrive?.connectedAt || null });
            }

            return json({ error: 'Unknown gdrive endpoint' }, 404);
          }

          default: {
            const backup = await db.collection('backups').findOne({ _id: subResource }, { projection: { data: 0 } });
            if (!backup) return json({ error: 'Backup not found' }, 404);
            return json(backup);
          }
        }
      }

      case 'rto': {
        const db = await getDb();
        switch (subResource) {
          case 'parcels': {
            // GET /api/rto/parcels — List all RTO parcels
            const statusFilter = params.status;
            const query = {};
            if (statusFilter && statusFilter !== 'all') query.status = statusFilter;
            const parcels = await db.collection('rtoParcels').find(query).sort({ createdAt: -1 }).toArray();
            
            // Enrich with order info
            const enriched = [];
            for (const p of parcels) {
              let order = null;
              if (p.orderId) {
                order = await db.collection('orders').findOne({ _id: p.orderId });
              }
              enriched.push({ ...p, order: order ? { orderId: order.orderId, productName: order.productName, customerName: order.customerName, customerPhone: order.customerPhone, customerEmail: order.customerEmail, salePrice: order.salePrice, shippingCost: order.shippingCost, status: order.status, quantity: order.quantity } : null });
            }
            return json(enriched);
          }

          case 'stats': {
            // GET /api/rto/stats — RTO dashboard metrics
            const allRtoParcels = await db.collection('rtoParcels').find({}).toArray();
            const allOrders = await db.collection('orders').find({}).toArray();
            
            const rtoOrders = allOrders.filter(o => o.status === 'RTO');
            const totalOrders = allOrders.length;
            const rtoCount = rtoOrders.length;
            const rtoRate = totalOrders > 0 ? Math.round((rtoCount / totalOrders) * 10000) / 100 : 0;
            
            // Pipeline counts
            const pendingAction = allRtoParcels.filter(p => p.status === 'pending_action').length;
            const reshipping = allRtoParcels.filter(p => p.status === 'reshipping').length;
            const refunded = allRtoParcels.filter(p => p.status === 'refunded').length;
            const cancelled = allRtoParcels.filter(p => p.status === 'cancelled').length;
            const reshipDelivered = allRtoParcels.filter(p => p.status === 'reship_delivered').length;
            
            // Financial impact
            const totalDoubleShipping = rtoOrders.reduce((sum, o) => sum + ((o.shippingCost || 0) * 2), 0);
            const recoveredViaReship = allRtoParcels.filter(p => p.status === 'reship_delivered' || (p.status === 'reshipping' && p.actionDetails?.paymentStatus === 'paid')).reduce((sum, p) => sum + (p.actionDetails?.reshippingCharges || 0), 0);
            const totalRefunded = allRtoParcels.filter(p => p.status === 'refunded').reduce((sum, p) => sum + (p.actionDetails?.refundAmount || 0), 0);
            
            // Monthly RTO trend (last 6 months)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const monthlyTrend = {};
            allOrders.forEach(o => {
              const d = new Date(o.orderDate);
              if (d < sixMonthsAgo) return;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              if (!monthlyTrend[key]) monthlyTrend[key] = { month: key, total: 0, rto: 0 };
              monthlyTrend[key].total++;
              if (o.status === 'RTO') monthlyTrend[key].rto++;
            });
            
            return json({
              rtoCount, rtoRate, totalOrders,
              pipeline: { pendingAction, reshipping, refunded, cancelled, reshipDelivered, total: allRtoParcels.length },
              financial: { totalDoubleShipping: Math.round(totalDoubleShipping * 100) / 100, recoveredViaReship: Math.round(recoveredViaReship * 100) / 100, totalRefunded: Math.round(totalRefunded * 100) / 100 },
              monthlyTrend: Object.values(monthlyTrend).sort((a, b) => a.month.localeCompare(b.month)),
              unprocessedRtoOrders: rtoOrders.filter(o => {
                const hasParcel = allRtoParcels.some(p => p.orderId === o._id);
                return !hasParcel;
              }).length,
            });
          }

          case 'match-awb': {
            // GET /api/rto/match-awb?awb=XXX — Find order by AWB/tracking number
            const awb = params.awb;
            if (!awb) return json({ error: 'AWB number required' }, 400);
            
            const order = await db.collection('orders').findOne({ trackingNumber: awb });
            if (order) {
              return json({ matched: true, matchMethod: 'tracking_number', order: { _id: order._id, orderId: order.orderId, productName: order.productName, customerName: order.customerName, customerPhone: order.customerPhone, customerEmail: order.customerEmail, salePrice: order.salePrice, status: order.status, trackingNumber: order.trackingNumber, shippingCost: order.shippingCost } });
            }
            
            const existing = await db.collection('rtoParcels').findOne({ awbNumber: awb });
            if (existing) {
              return json({ matched: true, matchMethod: 'rto_parcel_exists', parcel: existing });
            }
            
            return json({ matched: false, awb });
          }

          case 'search-orders': {
            // GET /api/rto/search-orders?q=XXX — Search orders for manual matching
            const q = params.q;
            if (!q) return json([]);
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const orders = await db.collection('orders').find({
              $or: [
                { orderId: regex },
                { customerName: regex },
                { trackingNumber: regex },
                { shopifyOrderId: regex },
              ]
            }).limit(10).toArray();
            return json(orders.map(o => ({ _id: o._id, orderId: o.orderId, productName: o.productName, customerName: o.customerName, customerPhone: o.customerPhone, salePrice: o.salePrice, status: o.status, trackingNumber: o.trackingNumber, shippingCost: o.shippingCost, orderDate: o.orderDate })));
          }

          default:
            return json({ error: 'Unknown RTO endpoint' }, 404);
        }
      }

      case 'whatsapp': {
        const db = await getDb();
        switch (subResource) {
          case 'templates': {
            // GET /api/whatsapp/templates
            const templates = await db.collection('whatsappTemplates').find({}).sort({ createdAt: -1 }).toArray();
            // If no templates exist, seed defaults
            if (templates.length === 0) {
              const { DEFAULT_TEMPLATES } = await import('@/lib/whatsapp');
              const now = new Date().toISOString();
              const defaults = DEFAULT_TEMPLATES.map(t => ({ _id: uuidv4(), ...t, createdAt: now, updatedAt: now }));
              await db.collection('whatsappTemplates').insertMany(defaults);
              return json(defaults);
            }
            return json(templates);
          }
          case 'messages': {
            // GET /api/whatsapp/messages?orderId=xxx
            const msgQuery = {};
            if (params.orderId) msgQuery.orderId = params.orderId;
            if (params.phone) msgQuery.customerPhone = params.phone;
            const messages = await db.collection('whatsappMessages')
              .find(msgQuery)
              .sort({ sentAt: -1 })
              .limit(params.limit ? parseInt(params.limit) : 50)
              .toArray();
            return json(messages);
          }
          case 'stats': {
            // GET /api/whatsapp/stats — dashboard widget data
            const now = new Date();
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
            const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
            
            const [todayMsgs, weekMsgs, failedMsgs, totalMsgs] = await Promise.all([
              db.collection('whatsappMessages').countDocuments({ sentAt: { $gte: todayStart.toISOString() } }),
              db.collection('whatsappMessages').countDocuments({ sentAt: { $gte: weekStart.toISOString() } }),
              db.collection('whatsappMessages').countDocuments({ deliveryStatus: 'failed' }),
              db.collection('whatsappMessages').countDocuments({}),
            ]);
            const delivered = await db.collection('whatsappMessages').countDocuments({ deliveryStatus: { $in: ['delivered', 'read'] } });
            const read = await db.collection('whatsappMessages').countDocuments({ deliveryStatus: 'read' });
            
            return json({
              today: todayMsgs,
              thisWeek: weekMsgs,
              total: totalMsgs,
              failed: failedMsgs,
              deliveryRate: totalMsgs > 0 ? Math.round((delivered / totalMsgs) * 100) : 0,
              readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
            });
          }
          case 'opt-outs': {
            // GET /api/whatsapp/opt-outs
            const optOuts = await db.collection('whatsappOptOuts').find({}).sort({ optedOutAt: -1 }).toArray();
            return json(optOuts);
          }
          default:
            return json({ error: 'Unknown whatsapp resource' }, 404);
        }
      }

      case 'bills': {
        const db = await getDb();
        if (subResource) {
          // GET /api/bills/{id}
          const bill = await db.collection('bills').findOne({ _id: subResource });
          if (!bill) return json({ error: 'Bill not found' }, 404);
          return json(bill);
        }
        // GET /api/bills?status=pending&vendor=xxx
        const query = {};
        if (params.status && params.status !== 'all') query.status = params.status;
        if (params.vendor) query.vendorId = params.vendor;
        if (params.category) query.category = params.category;
        const bills = await db.collection('bills').find(query).sort({ dueDate: 1 }).toArray();
        // Compute derived fields
        const enriched = bills.map(b => {
          const totalAmount = (b.amount || 0) + (b.taxAmount || 0);
          const totalPaid = (b.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
          const outstanding = Math.max(0, totalAmount - totalPaid);
          let computedStatus = b.status;
          if (outstanding <= 0) computedStatus = 'paid';
          else if ((b.payments || []).length > 0) computedStatus = 'partial';
          else if (new Date(b.dueDate) < new Date()) computedStatus = 'overdue';
          return { ...b, outstanding, totalAmount, totalPaid, computedStatus };
        });
        return json(enriched);
      }

      case 'finance': {
        const db = await getDb();
        if (subResource === 'cash-flow') {
          // GET /api/finance/cash-flow — Cash flow summary
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          
          // Bills data
          const allBills = await db.collection('bills').find({}).toArray();
          const totalBilled = allBills.reduce((s, b) => s + (b.amount || 0) + (b.taxAmount || 0), 0);
          const totalPaidBills = allBills.reduce((s, b) => s + (b.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0), 0);
          const totalOutstanding = totalBilled - totalPaidBills;
          
          // Overdue
          const overdueBills = allBills.filter(b => {
            const outstanding = (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
            return outstanding > 0 && new Date(b.dueDate) < now;
          });
          const overdueAmount = overdueBills.reduce((s, b) => {
            return s + (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0);
          }, 0);

          // Due this month
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          const dueThisMonth = allBills.filter(b => {
            const dd = new Date(b.dueDate);
            const outstanding = (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
            return outstanding > 0 && dd >= monthStart && dd <= monthEnd;
          });
          const dueThisMonthAmount = dueThisMonth.reduce((s, b) => {
            return s + (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((ps, p) => ps + (p.amount || 0), 0);
          }, 0);

          // Monthly inflows/outflows for chart (last 6 months)
          const monthlyData = [];
          for (let i = 5; i >= 0; i--) {
            const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
            const mLabel = m.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
            
            // Outflows = payments made this month
            let outflows = 0;
            allBills.forEach(b => {
              (b.payments || []).forEach(p => {
                const pd = new Date(p.date);
                if (pd >= m && pd <= mEnd) outflows += (p.amount || 0);
              });
            });
            
            monthlyData.push({ month: mLabel, outflows });
          }

          return json({
            totalBilled,
            totalPaid: totalPaidBills,
            totalOutstanding,
            overdueAmount,
            overdueCount: overdueBills.length,
            dueThisMonthAmount,
            dueThisMonthCount: dueThisMonth.length,
            totalBills: allBills.length,
            monthlyData,
          });
        }
        
        if (subResource === 'priority') {
          // GET /api/finance/priority — Payment priority recommendations
          const now = new Date();
          const allBills = await db.collection('bills').find({}).toArray();
          const unpaid = allBills.filter(b => {
            const outstanding = (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
            return outstanding > 0;
          }).sort((a, b) => {
            const aOverdue = new Date(a.dueDate) < now;
            const bOverdue = new Date(b.dueDate) < now;
            if (aOverdue && !bOverdue) return -1;
            if (!aOverdue && bOverdue) return 1;
            const statutory = ['gst', 'tds', 'tax'];
            const aS = statutory.some(s => (a.category || '').toLowerCase().includes(s));
            const bS = statutory.some(s => (b.category || '').toLowerCase().includes(s));
            if (aS && !bS) return -1;
            if (!aS && bS) return 1;
            return new Date(a.dueDate) - new Date(b.dueDate);
          }).map(b => ({
            ...b,
            outstanding: (b.amount || 0) + (b.taxAmount || 0) - (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0),
          }));
          return json(unpaid.slice(0, 10));
        }
        
        return json({ error: 'Unknown finance resource' }, 404);
      }

      case 'webhooks': {
        // GET /api/webhooks/whatsapp — Webhook verification
        if (subResource === 'whatsapp') {
          const mode = params['hub.mode'];
          const token = params['hub.verify_token'];
          const challenge = params['hub.challenge'];
          
          if (mode === 'subscribe') {
            const db = await getDb();
            const config = await db.collection('integrations').findOne({ _id: 'integrations-config' });
            const verifyToken = config?.whatsapp?.webhookVerifyToken;
            
            if (token === verifyToken) {
              return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
            }
          }
          return new Response('Forbidden', { status: 403 });
        }
        return json({ error: 'Unknown webhook' }, 404);
      }

      case 'dashboard':
        return json(await getDashboardData(params));

      case 'kds': {
        const db = await getDb();
        switch (subResource) {
          case 'assignments': {
            // GET /api/kds/assignments?employeeId=xxx&status=xxx
            const query = {};
            if (params.employeeId) query.employeeId = params.employeeId;
            if (params.status && params.status !== 'all') query.status = params.status;
            if (params.batchId) query.batchId = params.batchId;
            const assignments = await db.collection('kdsAssignments')
              .find(query)
              .sort({ assignedAt: -1 })
              .limit(parseInt(params.limit || '200'))
              .toArray();
            
            // Enrich with order data
            const orderIds = assignments.map(a => a.orderId);
            const orders = await db.collection('orders').find({ _id: { $in: orderIds } }).toArray();
            const orderMap = {};
            orders.forEach(o => { orderMap[o._id] = o; });

            // Enrich with recipe data for material info
            const enriched = assignments.map(a => ({
              ...a,
              order: orderMap[a.orderId] || null,
            }));

            return json(enriched);
          }
          case 'batches': {
            // GET /api/kds/batches - list all assignment batches
            const batches = await db.collection('kdsAssignments').aggregate([
              { $group: {
                _id: '$batchId',
                employeeId: { $first: '$employeeId' },
                employeeName: { $first: '$employeeName' },
                assignedBy: { $first: '$assignedBy' },
                assignedAt: { $first: '$assignedAt' },
                count: { $sum: 1 },
                statuses: { $push: '$status' },
                materialsHandedOver: { $first: '$materialsHandedOver' },
              }},
              { $sort: { assignedAt: -1 } },
              { $limit: 50 },
            ]).toArray();
            return json(batches);
          }
          case 'material-summary': {
            // GET /api/kds/material-summary?batchId=xxx or ?orderIds=id1,id2
            let orderIds = [];
            if (params.batchId) {
              const batchAssignments = await db.collection('kdsAssignments').find({ batchId: params.batchId }).toArray();
              orderIds = batchAssignments.map(a => a.orderId);
            } else if (params.orderIds) {
              orderIds = params.orderIds.split(',');
            }
            if (orderIds.length === 0) return json({ materials: [], totalOrders: 0 });

            const batchOrders = await db.collection('orders').find({ _id: { $in: orderIds } }).toArray();
            const allRecipes = await db.collection('skuRecipes').find({}).toArray();
            const recipeMap = {};
            allRecipes.forEach(r => { recipeMap[r.sku] = r; });

            // Aggregate materials from recipe ingredients
            const materialTotals = {};
            let totalUnits = 0; // Total product units across all orders
            batchOrders.forEach(order => {
              const recipe = recipeMap[order.sku];
              if (!recipe) return;
              const qty = order.quantity || 1;
              totalUnits += qty;
              // Use ingredients array (the actual data structure) with category-based grouping
              (recipe.ingredients || []).forEach(ing => {
                const key = ing.name || ing.inventoryItemName || ing.materialName;
                if (!key) return;
                if (!materialTotals[key]) materialTotals[key] = { 
                  name: key, type: ing.category === 'Packaging' ? 'packaging' : 'raw', 
                  quantity: 0, unit: ing.unit || 'pcs',
                  yieldPerUnit: ing.yieldPerUnit || null,
                  portions: 0, // How many portions/strips needed
                };
                const qtyUsed = (ing.quantityUsed || ing.quantity || 1) * qty;
                materialTotals[key].quantity += qtyUsed;
                // Calculate portions: each order unit needs 1 portion of this material
                if (ing.yieldPerUnit) {
                  materialTotals[key].portions += qty;
                }
              });
              // Also check legacy rawMaterials/packagingMaterials arrays as fallback
              if ((!recipe.ingredients || recipe.ingredients.length === 0)) {
                (recipe.rawMaterials || []).forEach(m => {
                  const key = m.name || m.materialName;
                  if (!key) return;
                  if (!materialTotals[key]) materialTotals[key] = { name: key, type: 'raw', quantity: 0, unit: m.unit || 'pcs', yieldPerUnit: null, portions: 0 };
                  materialTotals[key].quantity += (m.quantity || 1) * qty;
                });
                (recipe.packagingMaterials || []).forEach(m => {
                  const key = m.name || m.materialName;
                  if (!key) return;
                  if (!materialTotals[key]) materialTotals[key] = { name: key, type: 'packaging', quantity: 0, unit: m.unit || 'pcs', yieldPerUnit: null, portions: 0 };
                  materialTotals[key].quantity += (m.quantity || 1) * qty;
                });
              }
            });

            return json({
              materials: Object.values(materialTotals).sort((a, b) => b.quantity - a.quantity),
              totalOrders: batchOrders.length,
            });
          }
          case 'wastage': {
            const query = {};
            if (params.employeeId) query.employeeId = params.employeeId;
            if (params.batchId) query.batchId = params.batchId;
            const logs = await db.collection('wastageLog')
              .find(query).sort({ createdAt: -1 }).limit(100).toArray();
            return json(logs);
          }
          case 'material-requests': {
            const query = {};
            if (params.employeeId) query.employeeId = params.employeeId;
            if (params.status) query.status = params.status;
            const requests = await db.collection('materialRequests')
              .find(query).sort({ createdAt: -1 }).limit(100).toArray();
            return json(requests);
          }
          case 'performance': {
            // GET /api/kds/performance — stats per employee
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString();
            
            const allAssignments = await db.collection('kdsAssignments').find({}).toArray();
            const users = await db.collection('users').find({ role: 'employee' }).toArray();
            
            const perfByEmployee = {};
            allAssignments.forEach(a => {
              if (!perfByEmployee[a.employeeId]) {
                perfByEmployee[a.employeeId] = { 
                  employeeId: a.employeeId, 
                  employeeName: a.employeeName || 'Unknown',
                  totalAssigned: 0, completed: 0, inProgress: 0, todayCompleted: 0,
                  avgTimeMinutes: 0, completionTimes: [],
                };
              }
              const p = perfByEmployee[a.employeeId];
              p.totalAssigned++;
              if (a.status === 'completed' || a.status === 'packed') {
                p.completed++;
                if (a.completedAt && a.completedAt >= todayStr) p.todayCompleted++;
                if (a.startedAt && a.completedAt) {
                  const diff = (new Date(a.completedAt) - new Date(a.startedAt)) / 60000;
                  if (diff > 0 && diff < 600) p.completionTimes.push(diff);
                }
              }
              if (a.status === 'in_progress') p.inProgress++;
            });

            const perf = Object.values(perfByEmployee).map(p => ({
              ...p,
              avgTimeMinutes: p.completionTimes.length > 0
                ? Math.round(p.completionTimes.reduce((a, b) => a + b, 0) / p.completionTimes.length)
                : 0,
              completionTimes: undefined,
            }));

            return json(perf);
          }
          default:
            return json({ error: 'Unknown KDS endpoint' }, 404);
        }
      }

      case 'reports':
        switch (subResource) {
          case 'profitable-skus':
            return json(await getReportProfitableSkus(params));
          case 'rto-locations':
            return json(await getReportRtoLocations(params));
          case 'employee-output':
            return json(await getReportEmployeeOutput(params));
          case 'monthly-pl':
            return json(await getReportMonthlyPL(params));
          case 'customer-repeat':
            return json(await getReportCustomerRepeat(params));
          case 'product-cogs':
            return json(await getReportProductCOGS(params));
          case 'expense-trend':
            return json(await getReportExpenseTrend(params));
          case 'team-performance': {
            // GET /api/reports/team-performance?startDate=X&endDate=X
            const db = await getDb();
            const tpStart = params.startDate ? new Date(params.startDate + 'T00:00:00+05:30') : new Date(new Date().setDate(new Date().getDate() - 30));
            const tpEnd = params.endDate ? new Date(params.endDate + 'T23:59:59+05:30') : new Date();
            
            const allAssignments = await db.collection('kdsAssignments').find({}).toArray();
            const users = await db.collection('users').find({ role: 'employee' }).toArray();
            const orders = await db.collection('orders').find({}).toArray();
            
            // Filter assignments by date range
            const rangeAssignments = allAssignments.filter(a => {
              const aDate = new Date(a.assignedAt || a.createdAt);
              return aDate >= tpStart && aDate <= tpEnd;
            });
            
            // Build per-employee metrics
            const empMetrics = {};
            rangeAssignments.forEach(a => {
              if (!empMetrics[a.employeeId]) {
                const user = users.find(u => u._id === a.employeeId);
                empMetrics[a.employeeId] = {
                  employeeId: a.employeeId,
                  employeeName: a.employeeName || user?.name || 'Unknown',
                  role: user?.role || 'employee',
                  totalAssigned: 0, completed: 0, inProgress: 0, pending: 0,
                  productionTimes: [], packingTimes: [], totalTimes: [],
                  wastageCount: 0, wastageValue: 0,
                  ordersByDate: {},
                };
              }
              const m = empMetrics[a.employeeId];
              m.totalAssigned++;
              
              if (a.status === 'completed' || a.status === 'packed') {
                m.completed++;
                // Production time: startedAt -> completedAt
                if (a.startedAt && a.completedAt) {
                  const prodMin = (new Date(a.completedAt) - new Date(a.startedAt)) / 60000;
                  if (prodMin > 0 && prodMin < 600) m.productionTimes.push(prodMin);
                }
                // Packing time: completedAt -> packedAt
                if (a.completedAt && a.packedAt) {
                  const packMin = (new Date(a.packedAt) - new Date(a.completedAt)) / 60000;
                  if (packMin > 0 && packMin < 600) m.packingTimes.push(packMin);
                }
                // Total time: startedAt -> packedAt or completedAt
                const end = a.packedAt || a.completedAt;
                if (a.startedAt && end) {
                  const totalMin = (new Date(end) - new Date(a.startedAt)) / 60000;
                  if (totalMin > 0 && totalMin < 600) m.totalTimes.push(totalMin);
                }
              } else if (a.status === 'in_progress') {
                m.inProgress++;
              } else {
                m.pending++;
              }
              
              // Track orders by date for trend
              const dateKey = (a.assignedAt || a.createdAt || '').substring(0, 10);
              if (dateKey) {
                m.ordersByDate[dateKey] = (m.ordersByDate[dateKey] || 0) + 1;
              }
            });
            
            // Check wastage from orders
            const rtoOrders = orders.filter(o => o.status === 'RTO' || o.status === 'Returned');
            rtoOrders.forEach(o => {
              if (o.preparedBy && empMetrics[o.preparedBy]) {
                empMetrics[o.preparedBy].wastageCount++;
                empMetrics[o.preparedBy].wastageValue += (o.salePrice || 0);
              }
            });
            
            const avgArr = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;
            const medianArr = (arr) => {
              if (arr.length === 0) return 0;
              const sorted = [...arr].sort((a, b) => a - b);
              const mid = Math.floor(sorted.length / 2);
              return Math.round((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
            };
            
            const teamPerf = Object.values(empMetrics).map(m => ({
              employeeId: m.employeeId,
              employeeName: m.employeeName,
              role: m.role,
              totalAssigned: m.totalAssigned,
              completed: m.completed,
              inProgress: m.inProgress,
              pending: m.pending,
              completionRate: m.totalAssigned > 0 ? Math.round((m.completed / m.totalAssigned) * 10000) / 100 : 0,
              avgProductionTime: avgArr(m.productionTimes),
              medianProductionTime: medianArr(m.productionTimes),
              avgPackingTime: avgArr(m.packingTimes),
              medianPackingTime: medianArr(m.packingTimes),
              avgTotalTime: avgArr(m.totalTimes),
              medianTotalTime: medianArr(m.totalTimes),
              fastestTime: m.totalTimes.length > 0 ? Math.round(Math.min(...m.totalTimes) * 10) / 10 : 0,
              slowestTime: m.totalTimes.length > 0 ? Math.round(Math.max(...m.totalTimes) * 10) / 10 : 0,
              wastageCount: m.wastageCount,
              wastageValue: Math.round(m.wastageValue),
              wastageRate: m.completed > 0 ? Math.round((m.wastageCount / m.completed) * 10000) / 100 : 0,
              dailyTrend: Object.entries(m.ordersByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
              efficiencyScore: calculateEfficiency(m),
            })).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
            
            // Team summary
            const allProdTimes = teamPerf.flatMap(t => empMetrics[t.employeeId]?.productionTimes || []);
            const allPackTimes = teamPerf.flatMap(t => empMetrics[t.employeeId]?.packingTimes || []);
            
            return json({
              employees: teamPerf,
              summary: {
                totalEmployees: teamPerf.length,
                totalAssignments: rangeAssignments.length,
                totalCompleted: teamPerf.reduce((s, t) => s + t.completed, 0),
                avgTeamProductionTime: avgArr(allProdTimes),
                avgTeamPackingTime: avgArr(allPackTimes),
                totalWastage: teamPerf.reduce((s, t) => s + t.wastageCount, 0),
                totalWastageValue: teamPerf.reduce((s, t) => s + t.wastageValue, 0),
                topPerformer: teamPerf[0]?.employeeName || 'N/A',
              },
              dateRange: { start: tpStart.toISOString(), end: tpEnd.toISOString() },
            });
          }
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

      case 'sku-recipes': {
        if (subResource) return json(await getDoc('skuRecipes', subResource));
        const db = await getDb();
        const recipes = await db.collection('skuRecipes').find({}).sort({ productName: 1 }).toArray();
        // Enrich with order stats
        const orderStats = await db.collection('orders').aggregate([
          { $group: { _id: '$sku', orderCount: { $sum: 1 }, totalRevenue: { $sum: '$salePrice' } } }
        ]).toArray();
        const statsMap = {};
        orderStats.forEach(s => { statsMap[s._id] = s; });
        const enriched = recipes.map(r => ({
          ...r,
          orderCount: statsMap[r.sku]?.orderCount || 0,
          totalRevenue: statsMap[r.sku]?.totalRevenue || 0,
        }));
        return json(enriched);
      }

      case 'recipe-templates': {
        const db = await getDb();
        if (subResource) {
          const tpl = await db.collection('recipeTemplates').findOne({ _id: subResource });
          if (!tpl) return json({ error: 'Template not found' }, 404);
          // Include linked recipe count
          tpl.linkedRecipeCount = await db.collection('skuRecipes').countDocuments({ templateId: subResource });
          return json(tpl);
        }
        const templates = await db.collection('recipeTemplates').find({}).sort({ createdAt: -1 }).toArray();
        // Enrich with linked count
        for (const t of templates) {
          t.linkedRecipeCount = await db.collection('skuRecipes').countDocuments({ templateId: t._id });
        }
        return json(templates);
      }

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
        // Enhanced: include currentStock from batches
        if (subResource === 'categories') {
          // GET /api/inventory-items/categories — inventory category tree
          const db = await getDb();
          let cats = await db.collection('inventoryCategories').find({}).sort({ name: 1 }).toArray();
          if (cats.length === 0) {
            // Seed default inventory categories
            const defaults = [
              { _id: uuidv4(), name: 'Raw Material', subCategories: ['Flowers', 'Chocolates', 'Edibles'], updatedAt: new Date().toISOString() },
              { _id: uuidv4(), name: 'Packaging', subCategories: ['Boxes', 'Wrapping', 'Bags'], updatedAt: new Date().toISOString() },
              { _id: uuidv4(), name: 'Consumables', subCategories: ['Adhesives', 'Stationery'], updatedAt: new Date().toISOString() },
              { _id: uuidv4(), name: 'Labels & Stickers', subCategories: [], updatedAt: new Date().toISOString() },
            ];
            await db.collection('inventoryCategories').insertMany(defaults);
            cats = defaults;
          }
          return json(cats);
        }
        if (subResource) {
          const item = await getDoc('inventoryItems', subResource);
          if (item) {
            const db = await getDb();
            const batches = await db.collection('stockBatches').find({ inventoryItemId: subResource }).sort({ date: 1 }).toArray();
            item.currentStock = batches.reduce((sum, b) => sum + (b.remainingQty || 0), 0);
            item.batches = batches;
          }
          return json(item);
        }
        const db = await getDb();
        const stockItems = await getInventoryStockSummary(db);
        return json(stockItems);
      }

      case 'stock-batches': {
        const db = await getDb();
        const params = getSearchParams(request);
        const query = {};
        if (params.inventoryItemId) query.inventoryItemId = params.inventoryItemId;
        const batches = await db.collection('stockBatches').find(query).sort({ date: -1 }).toArray();
        return json(batches);
      }

      case 'stock': {
        const db = await getDb();
        if (subResource === 'movements') {
          // GET /api/stock/movements/:inventoryItemId — all movements (purchases + consumptions)
          const itemId = segments[2];
          if (!itemId) return json({ error: 'Inventory item ID required' }, 400);

          const batches = await db.collection('stockBatches').find({ inventoryItemId: itemId }).sort({ date: 1 }).toArray();
          const consumptions = await db.collection('stockConsumptions').find({ inventoryItemId: itemId }).sort({ date: 1 }).toArray();

          // Build timeline: purchases (in) and consumptions (out)
          const movements = [];
          batches.forEach(b => {
            movements.push({
              type: 'purchase',
              date: b.date,
              quantity: b.quantity,
              costPerUnit: b.costPerUnit,
              totalCost: Math.round(b.quantity * b.costPerUnit * 100) / 100,
              remainingQty: b.remainingQty,
              batchId: b._id,
              expenseId: b.expenseId || null,
            });
          });
          consumptions.forEach(c => {
            movements.push({
              type: 'consumption',
              date: c.date,
              quantity: -c.quantity,
              costPerUnit: c.costPerUnit,
              totalCost: c.totalCost,
              orderId: c.orderId,
              batchId: c.batchId,
              insufficientStock: c.insufficientStock || false,
            });
          });
          movements.sort((a, b) => new Date(a.date) - new Date(b.date));
          return json(movements);
        }

        if (subResource === 'summary') {
          // GET /api/stock/summary — preparable orders count per SKU
          const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
          const stockSummary = await getInventoryStockSummary(db);
          const stockMap = {};
          stockSummary.forEach(s => { stockMap[s._id] = s.currentStock; });

          // Enrich with order stats (same as sku-recipes endpoint)
          const orderStats = await db.collection('orders').aggregate([
            { $group: { _id: '$sku', orderCount: { $sum: 1 }, totalRevenue: { $sum: '$salePrice' } } }
          ]).toArray();
          const statsMap = {};
          orderStats.forEach(s => { statsMap[s._id] = s; });

          const preparable = skuRecipes
            .filter(recipe => recipe.ingredients && recipe.ingredients.length > 0)
            .map(recipe => {
            let minPrepare = Infinity;
            const missingItems = [];
            recipe.ingredients.forEach(ing => {
              const available = stockMap[ing.inventoryItemId] || 0;
              const needed = ing.quantityUsed || ing.quantity || 1;
              const canMake = Math.floor(available / needed);
              if (canMake < minPrepare) minPrepare = canMake;
              if (available <= 0) missingItems.push(ing.inventoryItemName || ing.inventoryItemId);
            });
            return {
              sku: recipe.sku,
              name: recipe.productName || recipe.sku,
              canPrepare: minPrepare === Infinity ? 0 : minPrepare,
              missingItems,
              orderCount: statsMap[recipe.sku]?.orderCount || 0,
              revenue: statsMap[recipe.sku]?.totalRevenue || 0,
            };
          });
          return json({ items: stockSummary, preparable });
        }

        if (subResource === 'consumption') {
          // GET /api/stock/consumption?orderId=xxx — get consumptions for an order
          const params = getSearchParams(request);
          const query = {};
          if (params.orderId) query.orderId = params.orderId;
          const consumptions = await db.collection('stockConsumptions').find(query).sort({ date: -1 }).toArray();
          return json(consumptions);
        }

        return json({ error: 'Unknown stock action. Use /movements/:id, /summary, or /consumption' }, 404);
      }

      case 'daily-marketing-spend': {
        const db = await getDb();
        const spends = await db.collection('dailyMarketingSpend').find({}).sort({ date: -1 }).toArray();
        return json(spends);
      }

      case 'sync-settings': {
        // GET /api/sync-settings — Get auto-sync configuration
        const settings = await getSyncSettings();
        const schedulerStatus = getSchedulerStatus();
        return json({ ...settings, _scheduler: schedulerStatus });
      }

      case 'sync-status': {
        // GET /api/sync-status — Get current sync lock status and scheduler info
        return json({
          locks: getSyncLockStatus(),
          scheduler: getSchedulerStatus(),
        });
      }

      case 'sync-history': {
        const db = await getDb();
        const integration = params.integration;
        const query = integration ? { integration } : {};
        const history = await db.collection('syncHistory').find(query).sort({ timestamp: -1 }).limit(50).toArray();
        return json(history);
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
          if (masked.google?.clientSecret) masked.google.clientSecret = masked.google.clientSecret.replace(/.(?=.{4})/g, '*');
          if (masked.whatsapp?.accessToken) masked.whatsapp.accessToken = masked.whatsapp.accessToken.replace(/.(?=.{4})/g, '*');
          if (masked.ocrSettings?.apiKey) masked.ocrSettings.apiKey = masked.ocrSettings.apiKey.replace(/.(?=.{4})/g, '*');
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
        if (subResource === 'unmatched') {
          // GET /api/razorpay/unmatched — list all unmatched payments
          const db = await getDb();
          const payments = await db.collection('razorpayUnmatchedPayments')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
          return json({ payments, total: payments.length });
        }
        if (subResource === 'reconciliation-summary') {
          // GET /api/razorpay/reconciliation-summary — aggregate reconciliation stats
          const db = await getDb();
          const orders = await db.collection('orders').find({ shopifyOrderId: { $exists: true } }).toArray();
          const EXCL_STATUS = ['Cancelled', 'Voided', 'Pending'];
          const EXCL_FIN = ['pending', 'voided', 'refunded'];
          const activeOrders = orders.filter(o => !EXCL_STATUS.includes(o.status) && !EXCL_FIN.includes(o.financialStatus));

          let totalFees = 0, totalTax = 0, reconciledCount = 0, unreconciledCount = 0;
          let reconciledRevenue = 0, unreconciledRevenue = 0;
          activeOrders.forEach(o => {
            const rev = o.salePrice || 0;
            if (o.razorpayReconciled === true) {
              reconciledCount++;
              reconciledRevenue += rev;
              totalFees += o.razorpayFee || 0;
              totalTax += o.razorpayTax || 0;
            } else {
              unreconciledCount++;
              unreconciledRevenue += rev;
            }
          });

          const totalRevenue = reconciledRevenue + unreconciledRevenue;
          const totalOrders = reconciledCount + unreconciledCount;
          const matchRate = totalOrders > 0 ? Math.round((reconciledCount / totalOrders) * 10000) / 100 : 0;
          const effectiveFeeRate = reconciledRevenue > 0 ? Math.round((totalFees / reconciledRevenue) * 10000) / 100 : 0;

          // Get unmatched payment count
          const unmatchedPayments = await db.collection('razorpayUnmatchedPayments').countDocuments({ status: 'unresolved' });

          // Settlement summary
          const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
          const lastSync = integrations?.razorpay?.lastSyncAt || null;

          return json({
            totalOrders,
            reconciledCount,
            unreconciledCount,
            reconciledRevenue: Math.round(reconciledRevenue * 100) / 100,
            unreconciledRevenue: Math.round(unreconciledRevenue * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalFees: Math.round(totalFees * 100) / 100,
            totalTax: Math.round(totalTax * 100) / 100,
            matchRate,
            effectiveFeeRate,
            unmatchedPayments,
            lastSync,
          });
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
  // Lazy init the scheduler on first request
  try { await initScheduler(); } catch (e) { /* silent */ }

  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const subResource = segments[1];
    const thirdSegment = segments[2];
    
    // For webhooks, we need the raw body for HMAC verification
    let body = {};
    let rawBody = '';
    try {
      rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch (e) {}

    switch (resource) {
      case 'api-keys': {
        // POST /api/api-keys — Create a new API key
        const { name, scope, rateLimit } = body;
        if (!name) return json({ error: 'Key name is required' }, 400);
        const validScopes = ['read', 'readwrite', 'full'];
        const keyScope = validScopes.includes(scope) ? scope : 'read';
        const rawKey = `pos_${crypto.randomBytes(24).toString('hex')}`;
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const keyDoc = {
          _id: uuidv4(),
          name: name.trim(),
          scope: keyScope,
          keyHash,
          keyPrefix: rawKey.slice(0, 8),
          keySuffix: rawKey.slice(-4),
          rateLimit: Math.min(Math.max(parseInt(rateLimit) || 100, 10), 1000),
          requestCount: 0,
          revoked: false,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        };
        const db = await getDb();
        await db.collection('apiKeys').insertOne(keyDoc);
        return json({ _id: keyDoc._id, key: rawKey, name: keyDoc.name, scope: keyDoc.scope, rateLimit: keyDoc.rateLimit, createdAt: keyDoc.createdAt }, 201);
      }

      case 'module-settings': {
        // POST /api/module-settings — Update module toggle settings
        const db = await getDb();
        const updates = {};
        for (const [key, val] of Object.entries(body)) {
          if (DEFAULT_MODULE_SETTINGS[key] !== undefined) {
            updates[`moduleSettings.${key}.enabled`] = !!val;
          }
        }
        if (Object.keys(updates).length > 0) {
          await db.collection('tenantConfig').updateOne({}, { $set: updates });
        }
        return json({ message: 'Module settings updated' });
      }

      case 'shipping-carriers': {
        // POST /api/shipping-carriers — Add new carrier or update existing
        const db = await getDb();
        const carrierId = body.id || `custom_${uuidv4().slice(0, 8)}`;
        const carrierDoc = {
          id: carrierId,
          name: body.name?.trim() || 'Unknown Carrier',
          shortName: body.shortName?.trim() || body.name?.trim() || '',
          color: body.color || '#3b82f6',
          trackUrlTemplate: body.trackUrlTemplate || '',
          builtIn: false,
          updatedAt: new Date().toISOString(),
        };
        if (body.id) {
          // Update existing
          await db.collection('shippingCarriers').updateOne({ id: body.id }, { $set: carrierDoc }, { upsert: true });
        } else {
          carrierDoc.createdAt = new Date().toISOString();
          await db.collection('shippingCarriers').insertOne({ _id: carrierId, ...carrierDoc });
        }
        return json(carrierDoc);
      }

      case 'seed':
        return json(await seedData());

      case 'shopify':
        if (subResource === 'sync-products') return json(await shopifySyncProducts());
        if (subResource === 'sync-orders') {
          // Support incremental sync: POST /api/shopify/sync-orders?mode=incremental|full
          const url = new URL(request.url);
          const mode = url.searchParams.get('mode') || body.mode || 'incremental';
          const db = await getDb();
          const settings = await getSyncSettings();
          
          if (!acquireSyncLock('shopify')) {
            return json({ error: 'Shopify sync is already running. Please wait.', synced: 0 });
          }
          
          try {
            let result;
            if (mode === 'full') {
              // Force full sync — ignore lastIncrementalSyncAt
              result = await shopifySyncOrders();
              // Update incremental timestamp after full sync
              await db.collection('syncSettings').updateOne(
                { _id: 'sync-settings' },
                { $set: { 'shopify.lastIncrementalSyncAt': new Date().toISOString() } },
                { upsert: true }
              );
            } else {
              // Incremental sync — only fetch orders updated since last sync
              const lastSync = settings.shopify?.lastIncrementalSyncAt;
              result = await shopifySyncOrdersIncremental(lastSync);
              if (!result.error) {
                await db.collection('syncSettings').updateOne(
                  { _id: 'sync-settings' },
                  { $set: { 'shopify.lastIncrementalSyncAt': new Date().toISOString() } },
                  { upsert: true }
                );
              }
            }
            await logSyncEvent(db, 'shopify', 'sync-orders', result.error ? 'error' : 'success', { ...result, trigger: 'manual', mode });
            return json(result);
          } finally {
            releaseSyncLock('shopify');
          }
        }
        return json({ error: 'Unknown Shopify action' }, 404);

      case 'indiapost':
        if (subResource === 'track-bulk' || subResource === 'sync-tracking') return json(await indiaPostSyncTracking());
        if (subResource === 'test-connection') return json(await indiaPostTestConnection());
        if (subResource === 'tracking-events') {
          const trackNum = url.searchParams.get('trackingNumber');
          if (!trackNum) return json({ error: 'trackingNumber required' }, 400);
          const db = await getDb();
          const events = await db.collection('indiaPostEvents')
            .find({ trackingNumber: trackNum })
            .sort({ timestamp: -1 })
            .toArray();
          return json({ trackingNumber: trackNum, events });
        }
        if (subResource === 'webhook') {
          // POST /api/indiapost/webhook — Receive real-time tracking events from India Post
          const db = await getDb();
          try {
            const events = Array.isArray(body) ? body : (body?.events || body?.data || [body]);
            let processed = 0;

            for (const event of events) {
              const trackingNumber = event?.article_number || event?.tracking_number || event?.articleNumber || event?.consignment_number;
              if (!trackingNumber) continue;

              const eventDesc = event?.event || event?.event_description || event?.status || '';
              const eventCode = event?.event_code || event?.code || '';
              const location = event?.office_name || event?.location || event?.city || '';
              const timestamp = event?.timestamp || event?.event_date || event?.date || new Date().toISOString();

              // Store the event
              await db.collection('indiaPostEvents').insertOne({
                _id: uuidv4(),
                trackingNumber,
                event: eventDesc,
                eventCode,
                location,
                timestamp,
                rawPayload: event,
                receivedAt: new Date().toISOString(),
              });

              // Update order status based on event
              const order = await db.collection('orders').findOne({ trackingNumber });
              if (order) {
                let newStatus = order.status;
                const desc = eventDesc.toLowerCase();
                const code = eventCode.toUpperCase();

                if (desc.includes('delivered') || desc.includes('item delivered')) {
                  newStatus = 'Delivered';
                } else if (code === 'RT' || desc.includes('return') || desc.includes('rto')) {
                  newStatus = 'RTO';
                } else if (desc.includes('dispatched') || desc.includes('in transit') || desc.includes('booked')) {
                  if (order.status === 'Unfulfilled' || order.status === 'Pending') {
                    newStatus = 'In Transit';
                  }
                } else if (desc.includes('out for delivery')) {
                  newStatus = 'Out for Delivery';
                }

                const updateFields = {
                  indiaPostLastEvent: eventDesc,
                  indiaPostLastEventAt: timestamp,
                  updatedAt: new Date().toISOString(),
                };
                if (newStatus !== order.status) {
                  updateFields.status = newStatus;
                  updateFields.statusUpdatedAt = new Date().toISOString();
                }
                await db.collection('orders').updateOne({ _id: order._id }, { $set: updateFields });
              }
              processed++;
            }

            await logSyncEvent(db, 'indiaPost', 'webhook', 'success', { eventsReceived: events.length, processed });
            return json({ success: true, message: `Processed ${processed} tracking events`, processed });
          } catch (err) {
            console.error('India Post webhook error:', err);
            const db2 = await getDb();
            await logSyncEvent(db2, 'indiaPost', 'webhook', 'error', { error: err.message });
            return json({ success: false, error: err.message }, 500);
          }
        }
        return json({ error: 'Unknown India Post action' }, 404);

      case 'meta-ads':
        if (subResource === 'sync') return json(await metaAdsSyncSpend());
        return json({ error: 'Unknown Meta Ads action' }, 404);

      case 'razorpay':
        if (subResource === 'sync-payments') {
          const url = new URL(request.url);
          const mode = url.searchParams.get('mode') || body.mode || 'incremental';
          const db = await getDb();
          const settings = await getSyncSettings();
          
          if (!acquireSyncLock('razorpay')) {
            return json({ error: 'Razorpay sync is already running. Please wait.', synced: 0 });
          }
          
          try {
            let result;
            if (mode === 'full') {
              result = await razorpaySyncPayments();
              await db.collection('syncSettings').updateOne(
                { _id: 'sync-settings' },
                { $set: { 'razorpay.lastIncrementalSyncAt': new Date().toISOString() } },
                { upsert: true }
              );
            } else {
              const lastSync = settings.razorpay?.lastIncrementalSyncAt;
              result = await razorpaySyncPaymentsIncremental(lastSync);
              if (!result.error) {
                await db.collection('syncSettings').updateOne(
                  { _id: 'sync-settings' },
                  { $set: { 'razorpay.lastIncrementalSyncAt': new Date().toISOString() } },
                  { upsert: true }
                );
              }
            }
            await logSyncEvent(db, 'razorpay', 'sync-payments', result.error ? 'error' : 'success', { ...result, trigger: 'manual', mode });
            return json(result);
          } finally {
            releaseSyncLock('razorpay');
          }
        }
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


      case 'parcel-images': {
        // POST /api/parcel-images — Save parcel image
        const db = await getDb();
        if (!body.orderId || !body.imageData) {
          return json({ error: 'orderId and imageData are required' }, 400);
        }
        const parcelImage = {
          _id: uuidv4(),
          orderId: body.orderId,
          imageData: body.imageData,
          extractedTrackingNo: body.extractedTrackingNo || null,
          extractedCarrier: body.extractedCarrier || null,
          createdAt: new Date().toISOString(),
        };
        await db.collection('parcelImages').insertOne(parcelImage);
        return json({ _id: parcelImage._id, message: 'Parcel image saved' });
      }

      case 'data': {
        const db = await getDb();

        if (subResource === 'import-preview') {
          // POST /api/data/import-preview — Validate and preview import data
          if (!body || !body._meta) return json({ error: 'Invalid import file. Missing _meta header.' }, 400);
          if (body._meta.version !== '1.0') return json({ error: `Unsupported export version: ${body._meta.version}` }, 400);

          const preview = { valid: true, modules: {}, warnings: [] };

          const collectionMapping = {
            orders: 'orders', skuRecipes: 'skuRecipes', recipeTemplates: 'recipeTemplates',
            overheadExpenses: 'overheadExpenses', expenseCategories: 'expenseCategories',
            bills: 'bills', vendors: 'vendors',
            inventoryItems: 'inventoryItems', inventoryCategories: 'inventoryCategories',
            rawMaterials: 'rawMaterials', packagingMaterials: 'packagingMaterials',
            employees: 'employees', kdsAssignments: 'kdsAssignments',
            wastageLog: 'wastageLog', materialRequests: 'materialRequests',
            whatsappTemplates: 'whatsappTemplates', whatsappMessages: 'whatsappMessages',
            whatsappOptOuts: 'whatsappOptOuts',
            rtoParcels: 'rtoParcels',
          };

          for (const [key, collName] of Object.entries(collectionMapping)) {
            if (!body[key] || !Array.isArray(body[key])) continue;
            const importCount = body[key].length;
            const existingCount = await db.collection(collName).countDocuments();
            // Count how many IDs already exist
            const importIds = body[key].map(d => d._id).filter(Boolean);
            const existingIds = importIds.length > 0
              ? await db.collection(collName).find({ _id: { $in: importIds } }).project({ _id: 1 }).toArray()
              : [];
            const duplicateCount = existingIds.length;
            const newCount = importCount - duplicateCount;

            preview.modules[key] = {
              importCount,
              existingCount,
              duplicateCount,
              newCount,
              collection: collName,
            };
          }

          // Handle tenantConfig and users separately
          if (body.tenantConfig) {
            preview.modules.tenantConfig = { importCount: 1, type: 'config' };
          }
          if (body.users && Array.isArray(body.users)) {
            const existingUsers = await db.collection('users').countDocuments();
            preview.modules.users = { importCount: body.users.length, existingCount: existingUsers, type: 'users' };
          }

          return json(preview);
        }

        if (subResource === 'import') {
          // POST /api/data/import — Apply import
          const { importData, selectedModules, conflictStrategy } = body;
          // conflictStrategy: 'skip' | 'overwrite' | 'merge'
          if (!importData || !importData._meta) return json({ error: 'Invalid import data' }, 400);

          const strategy = conflictStrategy || 'skip';
          const modules = selectedModules || Object.keys(importData).filter(k => k !== '_meta');
          const results = { imported: {}, errors: [] };

          const collectionMapping = {
            orders: 'orders', skuRecipes: 'skuRecipes', recipeTemplates: 'recipeTemplates',
            overheadExpenses: 'overheadExpenses', expenseCategories: 'expenseCategories',
            bills: 'bills', vendors: 'vendors',
            inventoryItems: 'inventoryItems', inventoryCategories: 'inventoryCategories',
            rawMaterials: 'rawMaterials', packagingMaterials: 'packagingMaterials',
            employees: 'employees', kdsAssignments: 'kdsAssignments',
            wastageLog: 'wastageLog', materialRequests: 'materialRequests',
            whatsappTemplates: 'whatsappTemplates', whatsappMessages: 'whatsappMessages',
            whatsappOptOuts: 'whatsappOptOuts',
            rtoParcels: 'rtoParcels',
          };

          for (const mod of modules) {
            if (mod === '_meta' || mod === 'tenantConfig' || mod === 'users' || mod === 'integrations') continue;
            const collName = collectionMapping[mod];
            if (!collName || !importData[mod] || !Array.isArray(importData[mod])) continue;

            let inserted = 0, updated = 0, skipped = 0;

            for (const doc of importData[mod]) {
              if (!doc._id) { doc._id = uuidv4(); }
              try {
                const existing = await db.collection(collName).findOne({ _id: doc._id });
                if (existing) {
                  if (strategy === 'skip') { skipped++; continue; }
                  if (strategy === 'overwrite') {
                    await db.collection(collName).replaceOne({ _id: doc._id }, { ...doc, importedAt: new Date().toISOString() });
                    updated++;
                  } else if (strategy === 'merge') {
                    // Merge: only update fields that are not already set
                    const mergeUpdate = {};
                    for (const [k, v] of Object.entries(doc)) {
                      if (k === '_id') continue;
                      if (existing[k] === undefined || existing[k] === null || existing[k] === '') {
                        mergeUpdate[k] = v;
                      }
                    }
                    if (Object.keys(mergeUpdate).length > 0) {
                      await db.collection(collName).updateOne({ _id: doc._id }, { $set: mergeUpdate });
                      updated++;
                    } else {
                      skipped++;
                    }
                  }
                } else {
                  await db.collection(collName).insertOne({ ...doc, importedAt: new Date().toISOString() });
                  inserted++;
                }
              } catch (err) {
                results.errors.push({ module: mod, docId: doc._id, error: err.message });
              }
            }

            results.imported[mod] = { inserted, updated, skipped, total: importData[mod].length };
          }

          // Handle tenantConfig
          if (modules.includes('tenantConfig') && importData.tenantConfig) {
            try {
              const existing = await db.collection('tenantConfig').findOne({ _id: 'config' });
              if (existing && strategy === 'skip') {
                results.imported.tenantConfig = { skipped: 1 };
              } else {
                await db.collection('tenantConfig').updateOne(
                  { _id: 'config' },
                  { $set: { ...importData.tenantConfig, _id: 'config', importedAt: new Date().toISOString() } },
                  { upsert: true }
                );
                results.imported.tenantConfig = { updated: 1 };
              }
            } catch (err) {
              results.errors.push({ module: 'tenantConfig', error: err.message });
            }
          }

          // Handle users (careful — don't overwrite passwords)
          if (modules.includes('users') && importData.users && Array.isArray(importData.users)) {
            let uInserted = 0, uSkipped = 0;
            for (const user of importData.users) {
              const existing = await db.collection('users').findOne({ email: user.email });
              if (existing) { uSkipped++; continue; }
              // Only import basic user info (no passwords)
              await db.collection('users').insertOne({
                _id: user._id || uuidv4(),
                email: user.email,
                name: user.name,
                role: user.role || 'employee',
                createdAt: user.createdAt || new Date().toISOString(),
                importedAt: new Date().toISOString(),
              });
              uInserted++;
            }
            results.imported.users = { inserted: uInserted, skipped: uSkipped };
          }

          return json({ success: true, results });
        }

        return json({ error: 'Unknown data endpoint' }, 404);
      }

      case 'backups': {
        const db = await getDb();
        switch (subResource) {
          case 'create': {
            // POST /api/backups/create — Create a manual backup
            const label = body.label || `Manual backup`;

            // Collect all data (same as export all)
            const backupPayload = {
              _meta: { version: '1.0', createdAt: new Date().toISOString(), type: 'backup' },
              orders: await db.collection('orders').find({}).toArray(),
              skuRecipes: await db.collection('skuRecipes').find({}).toArray(),
              recipeTemplates: await db.collection('recipeTemplates').find({}).toArray(),
              overheadExpenses: await db.collection('overheadExpenses').find({}).toArray(),
              expenseCategories: await db.collection('expenseCategories').find({}).toArray(),
              bills: await db.collection('bills').find({}).toArray(),
              vendors: await db.collection('vendors').find({}).toArray(),
              inventoryItems: await db.collection('inventoryItems').find({}).toArray(),
              inventoryCategories: await db.collection('inventoryCategories').find({}).toArray(),
              rawMaterials: await db.collection('rawMaterials').find({}).toArray(),
              packagingMaterials: await db.collection('packagingMaterials').find({}).toArray(),
              employees: await db.collection('employees').find({}).toArray(),
              kdsAssignments: await db.collection('kdsAssignments').find({}).toArray(),
              wastageLog: await db.collection('wastageLog').find({}).toArray(),
              materialRequests: await db.collection('materialRequests').find({}).toArray(),
              whatsappTemplates: await db.collection('whatsappTemplates').find({}).toArray(),
              whatsappMessages: await db.collection('whatsappMessages').find({}).toArray(),
              whatsappOptOuts: await db.collection('whatsappOptOuts').find({}).toArray(),
              rtoParcels: await db.collection('rtoParcels').find({}).toArray(),
              tenantConfig: await db.collection('tenantConfig').findOne({ _id: 'config' }),
              users: (await db.collection('users').find({}).toArray()).map(u => ({ _id: u._id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt })),
            };

            // Calculate summary and size
            const summary = {};
            let totalRecords = 0;
            for (const [key, value] of Object.entries(backupPayload)) {
              if (key === '_meta') continue;
              if (Array.isArray(value)) { summary[key] = value.length; totalRecords += value.length; }
              else if (value) { summary[key] = 1; totalRecords += 1; }
            }
            backupPayload._meta.summary = summary;

            const dataStr = JSON.stringify(backupPayload);
            const sizeBytes = Buffer.byteLength(dataStr, 'utf8');

            const backupDoc = {
              _id: uuidv4(),
              label,
              trigger: body.trigger || 'manual',
              totalRecords,
              sizeBytes,
              summary,
              data: backupPayload,
              createdAt: new Date().toISOString(),
            };

            await db.collection('backups').insertOne(backupDoc);

            // Enforce retention (keep only N most recent)
            const settings = await getSyncSettings();
            const retention = settings.backups?.retention || 5;
            const allBackups = await db.collection('backups').find({}).sort({ createdAt: -1 }).project({ _id: 1 }).toArray();
            if (allBackups.length > retention) {
              const toDelete = allBackups.slice(retention).map(b => b._id);
              await db.collection('backups').deleteMany({ _id: { $in: toDelete } });
            }

            return json({ _id: backupDoc._id, label: backupDoc.label, totalRecords, sizeBytes, summary, createdAt: backupDoc.createdAt, trigger: backupDoc.trigger });
          }

          case 'restore': {
            // POST /api/backups/restore — Restore from a backup ID
            const { backupId, selectedModules, conflictStrategy } = body;
            if (!backupId) return json({ error: 'backupId required' }, 400);

            const backup = await db.collection('backups').findOne({ _id: backupId });
            if (!backup || !backup.data) return json({ error: 'Backup not found or corrupted' }, 404);

            // Reuse the import logic
            const importData = backup.data;
            const strategy = conflictStrategy || 'overwrite';
            const modules = selectedModules || Object.keys(importData).filter(k => k !== '_meta');
            const results = { imported: {}, errors: [] };

            const collectionMapping = {
              orders: 'orders', skuRecipes: 'skuRecipes', recipeTemplates: 'recipeTemplates',
              overheadExpenses: 'overheadExpenses', expenseCategories: 'expenseCategories',
              bills: 'bills', vendors: 'vendors',
              inventoryItems: 'inventoryItems', inventoryCategories: 'inventoryCategories',
              rawMaterials: 'rawMaterials', packagingMaterials: 'packagingMaterials',
              employees: 'employees', kdsAssignments: 'kdsAssignments',
              wastageLog: 'wastageLog', materialRequests: 'materialRequests',
              whatsappTemplates: 'whatsappTemplates', whatsappMessages: 'whatsappMessages',
              whatsappOptOuts: 'whatsappOptOuts', rtoParcels: 'rtoParcels',
            };

            for (const mod of modules) {
              if (mod === '_meta' || mod === 'tenantConfig' || mod === 'users' || mod === 'integrations') continue;
              const collName = collectionMapping[mod];
              if (!collName || !importData[mod] || !Array.isArray(importData[mod])) continue;

              let inserted = 0, updated = 0, skipped = 0;
              for (const doc of importData[mod]) {
                if (!doc._id) continue;
                try {
                  const existing = await db.collection(collName).findOne({ _id: doc._id });
                  if (existing) {
                    if (strategy === 'skip') { skipped++; }
                    else { await db.collection(collName).replaceOne({ _id: doc._id }, doc); updated++; }
                  } else {
                    await db.collection(collName).insertOne(doc); inserted++;
                  }
                } catch (err) { results.errors.push({ module: mod, error: err.message }); }
              }
              results.imported[mod] = { inserted, updated, skipped, total: importData[mod].length };
            }

            return json({ success: true, results });
          }

          case 'delete': {
            // POST /api/backups/delete — Delete a backup
            const { backupId } = body;
            if (!backupId) return json({ error: 'backupId required' }, 400);
            const result = await db.collection('backups').deleteOne({ _id: backupId });
            if (result.deletedCount === 0) return json({ error: 'Backup not found' }, 404);
            return json({ success: true });
          }

          case 'config': {
            // POST /api/backups/config — Update backup configuration
            const updates = {};
            if (body.autoEnabled !== undefined) updates['backups.autoEnabled'] = body.autoEnabled;
            if (body.frequency !== undefined) updates['backups.frequency'] = body.frequency;
            if (body.retention !== undefined) updates['backups.retention'] = parseInt(body.retention) || 5;
            if (body.gdriveAutoUpload !== undefined) updates['gdrive.autoUpload'] = body.gdriveAutoUpload;
            if (Object.keys(updates).length > 0) {
              await updateSyncSettings(updates);
            }
            return json({ success: true });
          }

          case 'gdrive': {
            if (thirdSegment === 'upload') {
              // POST /api/backups/gdrive/upload — Upload a backup to Google Drive
              const { backupId } = body;
              if (!backupId) return json({ error: 'backupId required' }, 400);

              const settings = await getSyncSettings();
              if (!settings.gdrive?.refreshToken) return json({ error: 'Google Drive not connected' }, 400);

              const backup = await db.collection('backups').findOne({ _id: backupId });
              if (!backup) return json({ error: 'Backup not found' }, 404);

              const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
              const clientId = integrations?.google?.clientId;
              const clientSecret = integrations?.google?.clientSecret;
              if (!clientId || !clientSecret) return json({ error: 'Google credentials not configured' }, 400);

              try {
                // Refresh access token
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({ refresh_token: settings.gdrive.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
                });
                const tokenData = await tokenRes.json();
                if (!tokenData.access_token) return json({ error: 'Failed to refresh Google Drive token' }, 500);

                const accessToken = tokenData.access_token;
                const fileName = `profitos-backup-${backup.createdAt?.split('T')[0] || 'unknown'}.json`;
                const fileContent = JSON.stringify(backup.data, null, 2);

                // Multipart upload to Drive
                const boundary = '===PROFITOS_BOUNDARY===';
                const metadata = JSON.stringify({
                  name: fileName,
                  mimeType: 'application/json',
                  parents: settings.gdrive.folderId ? [settings.gdrive.folderId] : [],
                });

                const multipartBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${fileContent}\r\n--${boundary}--`;

                const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                  },
                  body: multipartBody,
                });

                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) return json({ error: uploadData.error?.message || 'Drive upload failed' }, 500);

                // Update backup with Drive file ID
                await db.collection('backups').updateOne({ _id: backupId }, { $set: { driveFileId: uploadData.id, uploadedToDriveAt: new Date().toISOString() } });
                await updateSyncSettings({ 'gdrive.lastUpload': new Date().toISOString() });

                return json({ success: true, driveFileId: uploadData.id, fileName });
              } catch (err) {
                return json({ error: `Drive upload failed: ${err.message}` }, 500);
              }
            }

            if (thirdSegment === 'disconnect') {
              // POST /api/backups/gdrive/disconnect — Disconnect Google Drive
              await updateSyncSettings({ 'gdrive.refreshToken': null, 'gdrive.email': null, 'gdrive.folderId': null, 'gdrive.connectedAt': null, 'gdrive.autoUpload': false, 'gdrive.lastUpload': null });
              return json({ success: true });
            }

            return json({ error: 'Unknown gdrive action' }, 404);
          }

          default:
            return json({ error: 'Unknown backup action' }, 404);
        }
      }

      case 'rto': {
        const db = await getDb();
        switch (subResource) {
          case 'register': {
            // POST /api/rto/register — Register a return parcel
            const { awbNumber, carrier, orderId, parcelImageData, ocrText, matchMethod } = body;
            if (!awbNumber) return json({ error: 'AWB number required' }, 400);

            // Check if already registered
            const existing = await db.collection('rtoParcels').findOne({ awbNumber });
            if (existing) return json({ error: 'This AWB is already registered as an RTO parcel', existingParcel: existing }, 409);

            // Validate order exists if provided
            let orderData = null;
            if (orderId) {
              orderData = await db.collection('orders').findOne({ _id: orderId });
              if (!orderData) return json({ error: 'Order not found' }, 404);

              // Update order status to RTO
              await db.collection('orders').updateOne({ _id: orderId }, { $set: { status: 'RTO', updatedAt: new Date().toISOString() } });
            }

            const parcel = {
              _id: uuidv4(),
              orderId: orderId || null,
              shopifyOrderId: orderData?.shopifyOrderId || null,
              awbNumber,
              carrier: carrier || 'indiapost',
              parcelImageData: parcelImageData || null,
              ocrText: ocrText || '',
              matchMethod: matchMethod || 'manual',
              status: 'pending_action',
              action: null,
              actionDetails: {},
              actionBy: null,
              actionAt: null,
              customerNotified: false,
              whatsappMessages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            await db.collection('rtoParcels').insertOne(parcel);
            return json({ ...parcel, order: orderData ? { orderId: orderData.orderId, productName: orderData.productName, customerName: orderData.customerName } : null });
          }

          case 'action': {
            // POST /api/rto/action — Take action on an RTO parcel
            const { parcelId, action, details, actionBy } = body;
            if (!parcelId || !action) return json({ error: 'parcelId and action required' }, 400);
            if (!['reship', 'refund', 'cancel'].includes(action)) return json({ error: 'Invalid action. Must be: reship, refund, cancel' }, 400);

            const parcel = await db.collection('rtoParcels').findOne({ _id: parcelId });
            if (!parcel) return json({ error: 'RTO parcel not found' }, 404);

            const now = new Date().toISOString();
            let newStatus, actionDetails = {};

            switch (action) {
              case 'reship': {
                newStatus = 'reshipping';
                actionDetails = {
                  reshippingCharges: details?.reshippingCharges || 0,
                  paymentLink: details?.paymentLink || '',
                  paymentStatus: details?.paymentStatus || 'pending',
                  reshippingTrackingNumber: details?.reshippingTrackingNumber || null,
                  note: details?.note || '',
                };
                break;
              }
              case 'refund': {
                newStatus = 'refunded';
                actionDetails = {
                  refundAmount: details?.refundAmount || 0,
                  refundMethod: details?.refundMethod || 'original',
                  refundReference: details?.refundReference || '',
                  note: details?.note || '',
                };
                // Update order status
                if (parcel.orderId) {
                  await db.collection('orders').updateOne(
                    { _id: parcel.orderId },
                    { $set: { status: 'Refunded', financialStatus: 'refunded', updatedAt: now } }
                  );
                }
                break;
              }
              case 'cancel': {
                newStatus = 'cancelled';
                actionDetails = {
                  cancelReason: details?.cancelReason || '',
                  note: details?.note || '',
                };
                // Update order status
                if (parcel.orderId) {
                  await db.collection('orders').updateOne(
                    { _id: parcel.orderId },
                    { $set: { status: 'Cancelled', updatedAt: now } }
                  );
                }
                break;
              }
            }

            await db.collection('rtoParcels').updateOne(
              { _id: parcelId },
              { $set: { status: newStatus, action, actionDetails, actionBy: actionBy || 'admin', actionAt: now, updatedAt: now } }
            );

            return json({ success: true, parcelId, action, status: newStatus });
          }

          case 'update-reship': {
            // POST /api/rto/update-reship — Update reshipping details (tracking, payment status)
            const { parcelId, reshippingTrackingNumber, paymentStatus, newStatus: targetStatus } = body;
            if (!parcelId) return json({ error: 'parcelId required' }, 400);

            const parcel = await db.collection('rtoParcels').findOne({ _id: parcelId });
            if (!parcel) return json({ error: 'RTO parcel not found' }, 404);

            const updates = { updatedAt: new Date().toISOString() };
            if (reshippingTrackingNumber) updates['actionDetails.reshippingTrackingNumber'] = reshippingTrackingNumber;
            if (paymentStatus) updates['actionDetails.paymentStatus'] = paymentStatus;
            if (targetStatus) updates.status = targetStatus;

            await db.collection('rtoParcels').updateOne({ _id: parcelId }, { $set: updates });
            return json({ success: true, parcelId });
          }

          case 'send-whatsapp': {
            // POST /api/rto/send-whatsapp — Send WhatsApp notification to customer
            const { parcelId, messageType, customMessage } = body;
            if (!parcelId) return json({ error: 'parcelId required' }, 400);

            const parcel = await db.collection('rtoParcels').findOne({ _id: parcelId });
            if (!parcel || !parcel.orderId) return json({ error: 'Parcel or linked order not found' }, 404);

            const order = await db.collection('orders').findOne({ _id: parcel.orderId });
            if (!order || !order.customerPhone) return json({ error: 'Customer phone not available' }, 400);

            const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
            if (!integrations?.whatsapp?.accessToken || !integrations?.whatsapp?.phoneNumberId) {
              return json({ error: 'WhatsApp not configured' }, 400);
            }

            const { accessToken, phoneNumberId } = integrations.whatsapp;
            const phone = order.customerPhone.replace(/\D/g, '');
            const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

            let messageBody = customMessage || '';
            if (!messageBody) {
              switch (messageType) {
                case 'reship_charges':
                  messageBody = `Hi ${order.customerName || 'Customer'},\n\nYour order ${order.orderId} was returned to us. We'd love to reship it!\n\nReshipping charges: ₹${parcel.actionDetails?.reshippingCharges || 0}\nPayment link: ${parcel.actionDetails?.paymentLink || 'Will be shared shortly'}\n\nPlease complete the payment to initiate reshipping. Reply HELP for assistance.`;
                  break;
                case 'refund_confirmation':
                  messageBody = `Hi ${order.customerName || 'Customer'},\n\nYour refund of ₹${parcel.actionDetails?.refundAmount || 0} for order ${order.orderId} has been initiated.\n\nRefund method: ${parcel.actionDetails?.refundMethod || 'Original payment method'}\n\nPlease allow 5-7 business days for processing.`;
                  break;
                case 'reship_dispatched':
                  messageBody = `Hi ${order.customerName || 'Customer'},\n\nGreat news! Your reshipped order ${order.orderId} has been dispatched.\n\nTracking: ${parcel.actionDetails?.reshippingTrackingNumber || 'Will be updated shortly'}\n\nThank you for your patience!`;
                  break;
                default:
                  messageBody = `Hi ${order.customerName || 'Customer'},\n\nUpdate regarding your order ${order.orderId}: ${customMessage || 'Please contact us for details.'}`;
              }
            }

            try {
              const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: formattedPhone,
                  type: 'text',
                  text: { body: messageBody },
                }),
              });
              const waData = await waRes.json();
              
              // Log the message
              const msgLog = { messageType, sentAt: new Date().toISOString(), phone: formattedPhone, status: waRes.ok ? 'sent' : 'failed', messageId: waData?.messages?.[0]?.id };
              await db.collection('rtoParcels').updateOne(
                { _id: parcelId },
                { $push: { whatsappMessages: msgLog }, $set: { customerNotified: true, updatedAt: new Date().toISOString() } }
              );

              if (waRes.ok) return json({ success: true, messageId: waData?.messages?.[0]?.id });
              return json({ error: waData?.error?.message || 'WhatsApp send failed', details: waData }, 500);
            } catch (err) {
              return json({ error: `WhatsApp error: ${err.message}` }, 500);
            }
          }

          default:
            return json({ error: 'Unknown RTO action' }, 404);
        }
      }

      case 'whatsapp': {
        const db = await getDb();
        switch (subResource) {
          case 'templates': {
            // POST /api/whatsapp/templates — Create a template
            const template = {
              _id: uuidv4(),
              name: body.name || 'Untitled Template',
              triggerEvent: body.triggerEvent || 'manual',
              metaTemplateName: body.metaTemplateName || '',
              languageCode: body.languageCode || 'en',
              body: body.body || '',
              variables: body.variables || [],
              enabled: body.enabled !== false,
              metaApprovalStatus: body.metaApprovalStatus || 'pending',
              useTextFallback: body.useTextFallback !== false,
              delay: body.delay || 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await db.collection('whatsappTemplates').insertOne(template);
            return json(template);
          }
          case 'send': {
            // POST /api/whatsapp/send — Send a WhatsApp message
            const { getWhatsAppConfig, sendTextMessage, sendTemplateMessage, resolveTemplateVariables, formatPhone, isOptedOut, isQuietHours } = await import('@/lib/whatsapp');
            const waConfig = await getWhatsAppConfig(db);
            if (!waConfig) return json({ error: 'WhatsApp not configured or inactive' }, 400);
            
            const { orderId, phone, templateId, customMessage, skipOptOutCheck, skipQuietHours } = body;
            
            // Resolve phone number
            let targetPhone = phone;
            let order = null;
            if (orderId) {
              order = await db.collection('orders').findOne({ _id: orderId });
              if (!order) return json({ error: 'Order not found' }, 404);
              if (!targetPhone) {
                targetPhone = order.customerPhone || order.customer?.phone || order.shippingAddress?.phone;
              }
            }
            
            if (!targetPhone) return json({ error: 'No phone number provided or found on order' }, 400);
            
            // Check opt-out
            if (!skipOptOutCheck) {
              const optedOut = await isOptedOut(db, targetPhone);
              if (optedOut) return json({ error: 'Customer has opted out of WhatsApp messages', optedOut: true }, 400);
            }
            
            // Check quiet hours
            if (!skipQuietHours && isQuietHours()) {
              // Queue the message instead of sending now
              const queuedMsg = {
                _id: uuidv4(),
                orderId: orderId || null,
                customerPhone: formatPhone(targetPhone),
                templateId: templateId || null,
                customMessage: customMessage || null,
                deliveryStatus: 'queued',
                queuedReason: 'quiet_hours',
                sentAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              };
              await db.collection('whatsappMessages').insertOne(queuedMsg);
              return json({ message: 'Message queued (quiet hours: 9PM-9AM IST)', queued: true, _id: queuedMsg._id });
            }
            
            let messageText = customMessage;
            let templateName = null;
            let templateRecord = null;
            
            // If a template is specified, resolve it
            if (templateId) {
              templateRecord = await db.collection('whatsappTemplates').findOne({ _id: templateId });
              if (!templateRecord) return json({ error: 'Template not found' }, 404);
              
              const tenantConfig = await db.collection('tenantConfig').findOne({ _id: 'tenant-config' });
              messageText = resolveTemplateVariables(templateRecord.body, order || {}, {
                businessName: tenantConfig?.businessName || 'GiftSugar',
                supportNumber: waConfig.supportNumber || '',
              });
              templateName = templateRecord.metaTemplateName;
            }
            
            if (!messageText && !templateName) {
              return json({ error: 'Either customMessage or templateId is required' }, 400);
            }
            
            try {
              let apiResponse;
              if (templateName && !templateRecord?.useTextFallback) {
                // Send as Meta template
                const bodyParams = order ? [
                  order.customerName || 'Customer',
                  order.orderId || '',
                ] : [];
                apiResponse = await sendTemplateMessage(waConfig, targetPhone, templateName, templateRecord?.languageCode || 'en', bodyParams);
              } else {
                // Send as text message
                apiResponse = await sendTextMessage(waConfig, targetPhone, messageText);
              }
              
              const waMessageId = apiResponse?.messages?.[0]?.id || null;
              
              // Log message
              const messageLog = {
                _id: uuidv4(),
                orderId: orderId || null,
                customerPhone: formatPhone(targetPhone),
                templateId: templateId || null,
                templateName: templateRecord?.name || 'Custom Message',
                triggerEvent: body.triggerEvent || 'manual',
                messageBody: messageText,
                waMessageId,
                deliveryStatus: 'sent',
                sentAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              };
              await db.collection('whatsappMessages').insertOne(messageLog);
              
              return json({ success: true, messageId: waMessageId, _id: messageLog._id });
            } catch (err) {
              // Log failed message
              const failedLog = {
                _id: uuidv4(),
                orderId: orderId || null,
                customerPhone: formatPhone(targetPhone),
                templateId: templateId || null,
                templateName: templateRecord?.name || 'Custom Message',
                triggerEvent: body.triggerEvent || 'manual',
                messageBody: messageText,
                deliveryStatus: 'failed',
                failedReason: err.message,
                sentAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              };
              await db.collection('whatsappMessages').insertOne(failedLog);
              return json({ error: err.message, _id: failedLog._id }, 500);
            }
          }
          case 'test-connection': {
            // POST /api/whatsapp/test-connection — Test WhatsApp connection
            const { getWhatsAppConfig, sendTextMessage } = await import('@/lib/whatsapp');
            const waConfig = await getWhatsAppConfig(db);
            if (!waConfig) return json({ error: 'WhatsApp not configured or inactive' }, 400);
            
            const testPhone = body.testPhone || waConfig.testPhone;
            if (!testPhone) return json({ error: 'Please provide a test phone number' }, 400);
            
            try {
              const result = await sendTextMessage(waConfig, testPhone, '✅ Profit OS WhatsApp connection test successful! Your integration is working.');
              return json({ success: true, message: 'Test message sent!', messageId: result?.messages?.[0]?.id });
            } catch (err) {
              return json({ error: `Connection failed: ${err.message}` }, 500);
            }
          }
          case 'opt-outs': {
            // POST /api/whatsapp/opt-outs — Add opt-out
            const { formatPhone: fmtP } = await import('@/lib/whatsapp');
            const phone = fmtP(body.phone);
            if (!phone) return json({ error: 'Phone number required' }, 400);
            await db.collection('whatsappOptOuts').updateOne(
              { phone },
              { $set: { phone, optedOutAt: new Date().toISOString(), reason: body.reason || 'manual' } },
              { upsert: true }
            );
            return json({ message: 'Phone opted out' });
          }
          case 'retry': {
            // POST /api/whatsapp/retry — Retry failed messages
            const { getWhatsAppConfig: getWAC, sendTextMessage: sendTxt } = await import('@/lib/whatsapp');
            const waCfg = await getWAC(db);
            if (!waCfg) return json({ error: 'WhatsApp not configured' }, 400);
            
            const failedMessages = await db.collection('whatsappMessages')
              .find({ deliveryStatus: 'failed', retryCount: { $lt: 3 } })
              .limit(body.limit || 10)
              .toArray();
            
            let retried = 0;
            for (const msg of failedMessages) {
              try {
                if (msg.messageBody) {
                  await sendTxt(waCfg, msg.customerPhone, msg.messageBody);
                  await db.collection('whatsappMessages').updateOne(
                    { _id: msg._id },
                    { $set: { deliveryStatus: 'sent', retriedAt: new Date().toISOString() }, $inc: { retryCount: 1 } }
                  );
                  retried++;
                }
              } catch (err) {
                await db.collection('whatsappMessages').updateOne(
                  { _id: msg._id },
                  { $set: { failedReason: err.message }, $inc: { retryCount: 1 } }
                );
              }
            }
            return json({ retried, total: failedMessages.length });
          }
          default:
            return json({ error: 'Unknown whatsapp action' }, 404);
        }
      }

      case 'bills': {
        const db = await getDb();
        if (subResource === 'payment') {
          // POST /api/bills/payment — Record a payment against a bill
          const { billId, amount, date, method, notes } = body;
          if (!billId || !amount) return json({ error: 'billId and amount required' }, 400);
          const bill = await db.collection('bills').findOne({ _id: billId });
          if (!bill) return json({ error: 'Bill not found' }, 404);
          
          const payment = {
            _id: uuidv4(),
            amount: parseFloat(amount),
            date: date || new Date().toISOString(),
            method: method || 'Bank Transfer',
            notes: notes || '',
            recordedAt: new Date().toISOString(),
          };
          
          await db.collection('bills').updateOne(
            { _id: billId },
            { $push: { payments: payment }, $set: { updatedAt: new Date().toISOString() } }
          );
          
          // Check if fully paid
          const updated = await db.collection('bills').findOne({ _id: billId });
          const totalAmount = (updated.amount || 0) + (updated.taxAmount || 0);
          const totalPaid = (updated.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
          if (totalPaid >= totalAmount) {
            await db.collection('bills').updateOne({ _id: billId }, { $set: { status: 'paid' } });
          } else if (totalPaid > 0) {
            await db.collection('bills').updateOne({ _id: billId }, { $set: { status: 'partial' } });
          }
          
          return json({ message: 'Payment recorded', payment });
        }
        
        if (subResource === 'sync-from-expenses') {
          // POST /api/bills/sync-from-expenses — Auto-generate bills from overhead expenses
          const expenses = await db.collection('overheadExpenses').find({ stopped: { $ne: true } }).toArray();
          const existingBills = await db.collection('bills').find({ autoGenerated: true }).toArray();
          const now = new Date();
          let generated = 0;
          
          for (const expense of expenses) {
            const freq = expense.frequency || 'one-time';
            const startDate = new Date(expense.startDate || expense.date || expense.createdAt);
            const amount = expense.amount || 0;
            const gstAmount = expense.gstInclusive ? 0 : Math.round(amount * 0.18);
            
            if (freq === 'one-time') {
              // Generate a single bill if not already generated
              const exists = existingBills.find(b => b.sourceExpenseId === expense._id && b.billingPeriod === 'one-time');
              if (!exists) {
                await db.collection('bills').insertOne({
                  _id: uuidv4(),
                  vendorName: expense.expenseName || expense.category || '',
                  category: expense.category || 'Other',
                  subCategory: expense.subCategory || '',
                  description: expense.expenseName || '',
                  amount: amount,
                  taxAmount: gstAmount,
                  taxType: 'GST',
                  dueDate: expense.date || expense.startDate || now.toISOString().split('T')[0],
                  status: 'pending',
                  payments: [],
                  autoGenerated: true,
                  sourceExpenseId: expense._id,
                  billingPeriod: 'one-time',
                  source: 'expense',
                  notes: `Auto-generated from expense: ${expense.expenseName || ''}`,
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                });
                generated++;
              }
            } else {
              // For recurring expenses: monthly, quarterly, yearly
              const monthsInterval = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : freq === 'yearly' ? 12 : 1;
              let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
              
              while (current <= now) {
                const periodKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                const exists = existingBills.find(b => b.sourceExpenseId === expense._id && b.billingPeriod === periodKey);
                
                if (!exists) {
                  const dueDate = new Date(current.getFullYear(), current.getMonth(), 
                    Math.min(startDate.getDate(), new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
                  const monthName = current.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
                  
                  await db.collection('bills').insertOne({
                    _id: uuidv4(),
                    vendorName: expense.expenseName || expense.category || '',
                    category: expense.category || 'Other',
                    subCategory: expense.subCategory || '',
                    description: `${expense.expenseName || expense.category} — ${monthName}`,
                    amount: amount,
                    taxAmount: gstAmount,
                    taxType: 'GST',
                    dueDate: dueDate.toISOString().split('T')[0],
                    status: 'pending',
                    payments: [],
                    autoGenerated: true,
                    sourceExpenseId: expense._id,
                    billingPeriod: periodKey,
                    source: 'expense',
                    notes: `Auto-generated from recurring expense: ${expense.expenseName || ''}`,
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                  });
                  generated++;
                }
                
                current = new Date(current.getFullYear(), current.getMonth() + monthsInterval, 1);
              }
            }
          }
          
          return json({ message: `Synced ${generated} new bills from ${expenses.length} expenses`, generated, totalExpenses: expenses.length });
        }
        
        // POST /api/bills — Create a new bill
        const newBill = {
          _id: uuidv4(),
          vendorId: body.vendorId || null,
          vendorName: body.vendorName || '',
          category: body.category || 'Other',
          description: body.description || '',
          amount: parseFloat(body.amount) || 0,
          taxAmount: parseFloat(body.taxAmount) || 0,
          taxType: body.taxType || 'GST',
          dueDate: body.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pending',
          payments: [],
          recurring: body.recurring || false,
          recurringFrequency: body.recurringFrequency || 'monthly',
          autoGenerated: body.autoGenerated || false,
          sourceExpenseId: body.sourceExpenseId || null,
          source: body.source || 'manual',
          notes: body.notes || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('bills').insertOne(newBill);
        return json(newBill);
      }

      case 'vendors': {
        const db = await getDb();
        const newVendor = {
          _id: uuidv4(),
          name: body.name || '',
          category: body.category || '',
          subCategory: body.subCategory || '',
          contactPerson: body.contactPerson || '',
          phone: body.phone || '',
          email: body.email || '',
          address: body.address || '',
          gstin: body.gstin || '',
          bankDetails: body.bankDetails || '',
          notes: body.notes || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('vendors').insertOne(newVendor);
        return json(newVendor);
      }

      case 'sync-settings': {
        // POST /api/sync-settings — Update auto-sync configuration
        const updatedSettings = await updateSyncSettings(body);
        return json(updatedSettings);
      }

      case 'sync-all': {
        // POST /api/sync-all — Trigger incremental sync for all active integrations
        try {
          const results = await runSyncAll();
          return json({ message: 'Sync All completed', results });
        } catch (err) {
          return json({ error: 'Sync All failed: ' + err.message }, 500);
        }
      }

      case 'webhooks': {
        // POST /api/webhooks/shopify — Handle Shopify order webhooks
        if (subResource === 'shopify') {
          const db = await getDb();
          try {
            // HMAC Verification
            const syncSettings = await getSyncSettings();
            const shopifySecret = syncSettings?.webhooks?.shopifySecret;
            
            if (shopifySecret) {
              const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';
              const computedHmac = crypto
                .createHmac('sha256', shopifySecret)
                .update(rawBody, 'utf8')
                .digest('base64');
              
              if (hmacHeader !== computedHmac) {
                console.error('[Webhook] Shopify HMAC verification failed');
                return json({ error: 'HMAC verification failed' }, 401);
              }
            }
            
            const topic = request.headers.get('x-shopify-topic') || '';
            console.log(`[Webhook] Shopify event received: ${topic}`);
            
            if (topic === 'orders/create' || topic === 'orders/updated') {
              // Process the order using the same sync logic
              const shopifyOrder = body;
              if (!shopifyOrder?.id) {
                return json({ status: 'ok', message: 'No order ID in payload' });
              }
              
              const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
              if (!integrations?.shopify?.active) {
                return json({ status: 'ok', message: 'Shopify integration not active' });
              }
              
              // Process single order — reuse same logic as sync
              const shopifyOrderIdStr = String(shopifyOrder.id);
              let status = 'Unfulfilled';
              if (shopifyOrder.fulfillment_status === 'fulfilled') status = 'Delivered';
              else if (shopifyOrder.fulfillment_status === 'partial') status = 'In Transit';
              else if (shopifyOrder.cancelled_at) status = 'Cancelled';
              
              const shopifyDateRaw = shopifyOrder.created_at || shopifyOrder.processed_at || shopifyOrder.updated_at;
              const shopifyDate = shopifyDateRaw ? new Date(shopifyDateRaw).toISOString() : new Date().toISOString();
              
              const addr = shopifyOrder.shipping_address || {};
              const shippingAddress = {
                line1: addr.address1 || '', line2: addr.address2 || '',
                city: addr.city || '', state: addr.province || '',
                zip: addr.zip || '', country: addr.country || '',
              };
              
              const customerPhone = shopifyOrder.customer?.phone || addr.phone || shopifyOrder.phone || '';
              const totalTax = parseFloat(shopifyOrder.total_tax || 0);
              const allLineItems = shopifyOrder.line_items || [];
              const productItems = allLineItems.filter(i => (i.title || '').toLowerCase() !== 'tip');
              const tipItems = allLineItems.filter(i => (i.title || '').toLowerCase() === 'tip');
              const tipAmount = tipItems.reduce((sum, t) => sum + (parseFloat(t.price) * (t.quantity || 1)), 0);
              const totalLineItems = productItems.length || 1;
              const totalShipping = parseFloat(shopifyOrder.total_shipping_price_set?.shop_money?.amount || 0);
              const totalDiscount = parseFloat(shopifyOrder.total_discounts || 0);
              const finalOrderPrice = parseFloat(shopifyOrder.total_price || 0);
              const rawSubtotal = productItems.reduce((sum, i) => sum + (parseFloat(i.price) * (i.quantity || 1)), 0);
              const totalRefunds = (shopifyOrder.refunds || []).reduce((sum, refund) => {
                return sum + (refund.refund_line_items || []).reduce((s, rli) => s + (parseFloat(rli.subtotal) || 0), 0);
              }, 0);
              const financialStatus = shopifyOrder.financial_status || 'unknown';
              
              let synced = 0, updated = 0;
              for (const item of productItems) {
                const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;
                const itemQty = item.quantity || 1;
                const lineItemRaw = parseFloat(item.price) * itemQty;
                const priceRatio = rawSubtotal > 0 ? lineItemRaw / rawSubtotal : (1 / totalLineItems);
                const itemTipShare = tipAmount > 0 ? Math.round(tipAmount * priceRatio * 100) / 100 : 0;
                
                const result = await db.collection('orders').updateOne(
                  { shopifyOrderId: shopifyOrderIdStr, sku },
                  {
                    $set: {
                      salePrice: finalOrderPrice * priceRatio,
                      totalOrderPrice: finalOrderPrice,
                      discount: totalDiscount * priceRatio,
                      refundAmount: totalRefunds * priceRatio,
                      totalTax: totalTax * priceRatio,
                      financialStatus, status,
                      shippingCost: totalShipping * priceRatio,
                      shippingAddress, customerPhone,
                      customerEmail: shopifyOrder.customer?.email || shopifyOrder.email || '',
                      checkoutToken: shopifyOrder.checkout_token || '',
                      orderDate: shopifyDate,
                      productName: item.title || item.name,
                      variantName: item.variant_title || '',
                      quantity: itemQty,
                      tipAmount: itemTipShare,
                      destinationPincode: shippingAddress.zip,
                      destinationCity: shippingAddress.city,
                      paymentMethod: 'prepaid',
                      updatedAt: new Date().toISOString(),
                    },
                    $setOnInsert: {
                      _id: uuidv4(),
                      orderId: `SH-${shopifyOrder.order_number || shopifyOrder.id}`,
                      shopifyOrderId: shopifyOrderIdStr, sku,
                      customerName: shopifyOrder.customer ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim() : 'Unknown',
                      shippingMethod: 'shopify', isUrgent: false,
                      manualCourierName: null, manualShippingCost: null,
                      preparedBy: null, preparedByName: null,
                      trackingNumber: null, createdAt: new Date().toISOString(),
                    },
                  },
                  { upsert: true }
                );
                if (result.upsertedCount > 0) synced++;
                else if (result.modifiedCount > 0) updated++;
              }
              
              // Auto-create SKU recipe stub if needed
              for (const item of productItems) {
                const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;
                const existing = await db.collection('skuRecipes').findOne({ sku });
                if (!existing) {
                  await db.collection('skuRecipes').insertOne({
                    _id: uuidv4(), sku,
                    productName: item.title || item.name || sku,
                    shopifySynced: true, needsCostInput: true,
                    ingredients: [], rawMaterials: [], packaging: [],
                    consumableCost: 0, totalWeightGrams: 0,
                    defaultWastageBuffer: 5, monthlyWastageOverride: null,
                    templateId: null, templateName: null,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                  });
                }
              }
              
              await logSyncEvent(db, 'shopify', 'webhook', 'success', { topic, synced, updated, orderId: shopifyOrderIdStr });
              return json({ status: 'ok', synced, updated });
            }
            
            if (topic === 'orders/cancelled') {
              const shopifyOrderIdStr = String(body.id);
              await db.collection('orders').updateMany(
                { shopifyOrderId: shopifyOrderIdStr },
                { $set: { status: 'Cancelled', updatedAt: new Date().toISOString() } }
              );
              await logSyncEvent(db, 'shopify', 'webhook', 'success', { topic, orderId: shopifyOrderIdStr, action: 'cancelled' });
              return json({ status: 'ok', action: 'cancelled' });
            }
            
            return json({ status: 'ok', message: `Unhandled topic: ${topic}` });
          } catch (err) {
            console.error('[Webhook] Shopify error:', err);
            try { await logSyncEvent(await getDb(), 'shopify', 'webhook', 'error', { error: err.message }); } catch (e) {}
            return json({ status: 'error', error: err.message }, 500);
          }
        }
        
        // POST /api/webhooks/razorpay — Handle Razorpay payment webhooks
        if (subResource === 'razorpay') {
          const db = await getDb();
          try {
            // Signature Verification
            const syncSettings = await getSyncSettings();
            const razorpaySecret = syncSettings?.webhooks?.razorpaySecret;
            
            if (razorpaySecret) {
              const signatureHeader = request.headers.get('x-razorpay-signature') || '';
              const computedSignature = crypto
                .createHmac('sha256', razorpaySecret)
                .update(rawBody)
                .digest('hex');
              
              if (signatureHeader !== computedSignature) {
                console.error('[Webhook] Razorpay signature verification failed');
                return json({ error: 'Signature verification failed' }, 401);
              }
            }
            
            const event = body.event || '';
            const payload = body.payload || {};
            console.log(`[Webhook] Razorpay event received: ${event}`);
            
            if (event === 'payment.captured') {
              const payment = payload.payment?.entity;
              if (!payment) return json({ status: 'ok', message: 'No payment entity' });
              
              // Match payment to order using same strategies as sync
              const allOrders = await db.collection('orders').find({ shopifyOrderId: { $exists: true } }).toArray();
              const normalizePhone = (phone) => phone ? phone.replace(/\D/g, '').slice(-10) : '';
              
              const payPhone = normalizePhone(payment.contact || '');
              const payEmail = (payment.email || '').toLowerCase().trim();
              const payAmount = payment.amount || 0;
              
              // Group orders by shopifyOrderId
              const orderGroups = {};
              allOrders.forEach(o => {
                if (!o.shopifyOrderId) return;
                if (!orderGroups[o.shopifyOrderId]) {
                  orderGroups[o.shopifyOrderId] = { totalOrderPrice: o.totalOrderPrice || o.salePrice, customerPhone: o.customerPhone || '', customerEmail: o.customerEmail || '', lines: [o] };
                } else {
                  orderGroups[o.shopifyOrderId].lines.push(o);
                }
              });
              
              let matchedGroup = null;
              for (const [sid, g] of Object.entries(orderGroups)) {
                if (g.lines[0]?.razorpayReconciled) continue; // Already matched
                const amountPaise = Math.round((g.totalOrderPrice || 0) * 100);
                if (amountPaise !== payAmount) continue;
                
                const phone = normalizePhone(g.customerPhone);
                if (payPhone && phone === payPhone) { matchedGroup = g; break; }
                const email = (g.customerEmail || '').toLowerCase().trim();
                if (payEmail && email === payEmail) { matchedGroup = g; break; }
              }
              
              if (matchedGroup) {
                const feeInRupees = (payment.fee || 0) / 100;
                const taxInRupees = (payment.tax || 0) / 100;
                const totalLines = matchedGroup.lines.length || 1;
                
                for (const line of matchedGroup.lines) {
                  await db.collection('orders').updateOne(
                    { _id: line._id },
                    { $set: { razorpayPaymentId: payment.id, razorpayFee: feeInRupees / totalLines, razorpayTax: taxInRupees / totalLines, razorpayReconciled: true, razorpaySettlementId: payment.settlement_id || null, paymentMethod: 'prepaid', updatedAt: new Date().toISOString() } }
                  );
                }
                
                await logSyncEvent(db, 'razorpay', 'webhook', 'success', { event, paymentId: payment.id, matched: true });
                return json({ status: 'ok', matched: true, paymentId: payment.id });
              } else {
                // Store as unmatched
                await db.collection('razorpayUnmatchedPayments').updateOne(
                  { _id: payment.id },
                  { $set: { paymentId: payment.id, amount: (payment.amount || 0) / 100, contact: payment.contact || '', email: payment.email || '', method: payment.method || 'unknown', fee: (payment.fee || 0) / 100, tax: (payment.tax || 0) / 100, status: 'unresolved', syncedAt: new Date().toISOString() } },
                  { upsert: true }
                );
                await logSyncEvent(db, 'razorpay', 'webhook', 'success', { event, paymentId: payment.id, matched: false });
                return json({ status: 'ok', matched: false, paymentId: payment.id });
              }
            }
            
            if (event === 'payment.failed') {
              await logSyncEvent(db, 'razorpay', 'webhook', 'success', { event, paymentId: payload.payment?.entity?.id, action: 'payment_failed_logged' });
              return json({ status: 'ok', action: 'payment_failed_logged' });
            }
            
            return json({ status: 'ok', message: `Unhandled event: ${event}` });
          } catch (err) {
            console.error('[Webhook] Razorpay error:', err);
            try { await logSyncEvent(await getDb(), 'razorpay', 'webhook', 'error', { error: err.message }); } catch (e) {}
            return json({ status: 'error', error: err.message }, 500);
          }
        }
        
        // POST /api/webhooks/whatsapp — Handle incoming webhook events
        if (subResource === 'whatsapp') {
          const db = await getDb();
          
          // Process the webhook payload
          try {
            const entry = body?.entry;
            if (!entry) return json({ status: 'ok' });
            
            for (const e of entry) {
              const changes = e.changes || [];
              for (const change of changes) {
                const value = change.value || {};
                
                // Handle delivery status updates
                if (value.statuses) {
                  for (const status of value.statuses) {
                    const msgId = status.id;
                    const statusVal = status.status; // sent, delivered, read, failed
                    const timestamp = status.timestamp;
                    
                    if (msgId) {
                      await db.collection('whatsappMessages').updateOne(
                        { waMessageId: msgId },
                        {
                          $set: {
                            deliveryStatus: statusVal,
                            [`${statusVal}At`]: timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString(),
                          },
                        }
                      );
                    }
                  }
                }
                
                // Handle incoming messages (customer replies)
                if (value.messages) {
                  const { formatPhone: fmtPh, isOptedOut: checkOpt } = await import('@/lib/whatsapp');
                  
                  for (const msg of value.messages) {
                    const fromPhone = msg.from;
                    const msgType = msg.type;
                    const msgText = msg.text?.body || '';
                    const msgId = msg.id;
                    
                    // Store incoming message
                    await db.collection('whatsappIncoming').insertOne({
                      _id: uuidv4(),
                      fromPhone,
                      messageId: msgId,
                      type: msgType,
                      text: msgText,
                      timestamp: msg.timestamp,
                      payload: msg,
                      read: false,
                      createdAt: new Date().toISOString(),
                    });
                    
                    // Handle STOP/opt-out
                    if (msgText.toUpperCase().trim() === 'STOP') {
                      await db.collection('whatsappOptOuts').updateOne(
                        { phone: fmtPh(fromPhone) },
                        { $set: { phone: fmtPh(fromPhone), optedOutAt: new Date().toISOString(), reason: 'customer_stop' } },
                        { upsert: true }
                      );
                    }
                    
                    // Handle STATUS query (auto-reply)
                    if (msgText.toUpperCase().trim() === 'STATUS' || /^(SH-?\d+|#\d+)$/i.test(msgText.trim())) {
                      const config = await db.collection('integrations').findOne({ _id: 'integrations-config' });
                      const waConfig = config?.whatsapp;
                      if (waConfig?.active && waConfig?.accessToken) {
                        // Find latest order for this phone
                        const { sendTextMessage: sendTxtMsg } = await import('@/lib/whatsapp');
                        const customerOrders = await db.collection('orders')
                          .find({ $or: [
                            { 'shippingAddress.phone': { $regex: fromPhone.slice(-10) } },
                            { customerPhone: { $regex: fromPhone.slice(-10) } },
                          ]})
                          .sort({ createdAt: -1 })
                          .limit(1)
                          .toArray();
                        
                        if (customerOrders.length > 0) {
                          const ord = customerOrders[0];
                          const statusMsg = `Order #${ord.orderId}: Status - ${ord.kdsStatus || ord.status || 'Processing'}${ord.trackingNumber ? `\nTracking: ${ord.trackingNumber}` : ''}`;
                          try { await sendTxtMsg(waConfig, fromPhone, statusMsg); } catch (e) { console.error('Auto-reply failed:', e); }
                        } else {
                          try { await sendTxtMsg(waConfig, fromPhone, 'We couldn\'t find a recent order for your number. Please contact our support team for assistance.'); } catch (e) { console.error('Auto-reply failed:', e); }
                        }
                      }
                    }
                    
                    // Handle HELP keyword
                    if (msgText.toUpperCase().trim() === 'HELP') {
                      const config = await db.collection('integrations').findOne({ _id: 'integrations-config' });
                      const waConfig = config?.whatsapp;
                      if (waConfig?.active && waConfig?.accessToken) {
                        const { sendTextMessage: sendTxtHelp } = await import('@/lib/whatsapp');
                        const tenant = await db.collection('tenantConfig').findOne({ _id: 'tenant-config' });
                        const helpMsg = `Need help? Contact ${tenant?.businessName || 'us'}:\n📧 Email: ${waConfig.supportEmail || 'support@example.com'}\n📞 Phone: ${waConfig.supportNumber || 'N/A'}\n\nReply STOP to opt out of messages.`;
                        try { await sendTxtHelp(waConfig, fromPhone, helpMsg); } catch (e) { console.error('Help auto-reply failed:', e); }
                      }
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('Webhook processing error:', err);
          }
          
          // Always return 200 to acknowledge webhook
          return json({ status: 'ok' });
        }
        return json({ error: 'Unknown webhook' }, 404);
      }

      case 'kds': {
        const db = await getDb();
        switch (subResource) {
          case 'assign': {
            // POST /api/kds/assign — Assign orders to employee
            const { orderIds, employeeId, employeeName, assignedBy } = body;
            if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
              return json({ error: 'orderIds array required' }, 400);
            }
            if (!employeeId) return json({ error: 'employeeId required' }, 400);

            const batchId = uuidv4();
            const now = new Date().toISOString();
            const assignments = [];

            for (const orderId of orderIds) {
              // Check if already assigned
              const existing = await db.collection('kdsAssignments').findOne({ 
                orderId, status: { $nin: ['packed', 'cancelled'] } 
              });
              if (existing) continue; // Skip already assigned

              const assignment = {
                _id: uuidv4(),
                orderId,
                employeeId,
                employeeName: employeeName || 'Unknown',
                assignedBy: assignedBy || 'admin',
                batchId,
                status: 'assigned', // assigned → in_progress → completed → packed
                materialsHandedOver: false,
                assignedAt: now,
                startedAt: null,
                completedAt: null,
                packedAt: null,
                createdAt: now,
                updatedAt: now,
              };
              await db.collection('kdsAssignments').insertOne(assignment);
              assignments.push(assignment);

              // Update order with kds status
              await db.collection('orders').updateOne({ _id: orderId }, {
                $set: { kdsStatus: 'assigned', kdsEmployeeId: employeeId, kdsEmployeeName: employeeName, kdsBatchId: batchId, updatedAt: now }
              });
            }

            return json({
              message: `${assignments.length} order(s) assigned to ${employeeName}`,
              batchId,
              assignmentCount: assignments.length,
              skippedCount: orderIds.length - assignments.length,
            });
          }
          case 'handover': {
            // POST /api/kds/handover — Confirm materials handed over for a batch
            const { batchId: hoBatchId } = body;
            if (!hoBatchId) return json({ error: 'batchId required' }, 400);
            await db.collection('kdsAssignments').updateMany(
              { batchId: hoBatchId },
              { $set: { materialsHandedOver: true, updatedAt: new Date().toISOString() } }
            );
            return json({ message: 'Materials handover confirmed', batchId: hoBatchId });
          }
          case 'wastage': {
            // POST /api/kds/wastage — Report wastage
            const wastage = {
              _id: uuidv4(),
              employeeId: body.employeeId,
              employeeName: body.employeeName || '',
              ingredient: body.ingredient,
              quantity: parseFloat(body.quantity) || 0,
              unit: body.unit || 'pcs',
              reason: body.reason || 'Other',
              orderId: body.orderId || null,
              batchId: body.batchId || null,
              createdAt: new Date().toISOString(),
            };
            await db.collection('wastageLog').insertOne(wastage);
            return json(wastage);
          }
          case 'material-request': {
            // POST /api/kds/material-request — Request more materials
            const req = {
              _id: uuidv4(),
              employeeId: body.employeeId,
              employeeName: body.employeeName || '',
              ingredient: body.ingredient,
              quantity: parseFloat(body.quantity) || 0,
              unit: body.unit || 'pcs',
              status: 'pending', // pending → approved → denied
              orderId: body.orderId || null,
              batchId: body.batchId || null,
              createdAt: new Date().toISOString(),
              respondedAt: null,
              respondedBy: null,
            };
            await db.collection('materialRequests').insertOne(req);
            return json(req);
          }
          default:
            return json({ error: 'Unknown KDS action' }, 400);
        }
      }


      case 'upload-logo': {
        // Handle logo upload as base64
        const db = await getDb();
        const { imageData, fileName } = body;
        if (!imageData) return json({ error: 'No image data provided' }, 400);
        // imageData is a base64 data URL like "data:image/png;base64,..."
        await db.collection('tenantConfig').updateOne({}, { $set: { logo: imageData, updatedAt: new Date().toISOString() } });
        return json({ message: 'Logo uploaded successfully', logo: imageData });
      }

      case 'upload-icon': {
        // Handle icon upload as base64 (for collapsed sidebar & favicon)
        const db = await getDb();
        const { imageData, fileName } = body;
        if (!imageData) return json({ error: 'No image data provided' }, 400);
        await db.collection('tenantConfig').updateOne({}, { $set: { icon: imageData, updatedAt: new Date().toISOString() } });
        return json({ message: 'Icon uploaded successfully', icon: imageData });
      }

      case 'profile': {
        // POST /api/profile/avatar — Upload avatar for current user
        if (subResource === 'avatar') {
          const db = await getDb();
          try {
            const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
            if (!token?.userId) return json({ error: 'Not authenticated' }, 401);
            const avatarData = body.imageData || '';
            await db.collection('users').updateOne(
              { _id: token.userId },
              { $set: { avatar: avatarData, updatedAt: new Date().toISOString() } }
            );
            return json({ message: 'Avatar updated', avatar: avatarData });
          } catch (err) {
            return json({ error: 'Failed to update avatar' }, 500);
          }
        }
        return json({ error: 'Invalid profile action' }, 400);
      }

      case 'purge': {
        // Selective purge or full purge
        const db = await getDb();
        const purgeType = body.purgeType || 'all'; // 'all', 'orders', 'inventory', 'expenses', 'recipes'
        let collectionsToPurge = [];

        if (purgeType === 'orders') {
          collectionsToPurge = ['orders', 'settlementEstimates', 'razorpayUnmatchedPayments'];
        } else if (purgeType === 'inventory') {
          collectionsToPurge = ['inventoryItems', 'inventoryCategories', 'stockBatches', 'stockConsumptions', 'wastageLog', 'rawMaterials', 'packagingMaterials', 'materialRequests'];
        } else if (purgeType === 'expenses') {
          collectionsToPurge = ['overheadExpenses', 'expenseCategories', 'dailyMarketingSpend', 'bills'];
        } else if (purgeType === 'recipes') {
          collectionsToPurge = ['skuRecipes', 'recipeTemplates'];
        } else {
          // Purge everything except tenantConfig, integrations, syncSettings, syncHistory, users, apiKeys
          collectionsToPurge = [
            'orders', 'skuRecipes', 'recipeTemplates',
            'rawMaterials', 'packagingMaterials', 'vendors', 'employees',
            'overheadExpenses', 'expenseCategories',
            'inventoryItems', 'inventoryCategories',
            'stockBatches', 'stockConsumptions',
            'dailyMarketingSpend',
            'bills', 'kdsAssignments', 'materialRequests',
            'rtoParcels', 'parcelImages', 'indiaPostEvents',
            'shippingCarriers', 'settlementEstimates', 'razorpayUnmatchedPayments',
            'userActivity', 'wastageLog', 'backups',
            'whatsappMessages', 'whatsappIncoming', 'whatsappOptOuts', 'whatsappTemplates',
          ];
        }

        const counts = {};
        for (const col of collectionsToPurge) {
          const result = await db.collection(col).deleteMany({});
          counts[col] = result.deletedCount;
        }
        const label = purgeType === 'all' ? 'All data' : purgeType.charAt(0).toUpperCase() + purgeType.slice(1) + ' data';
        return json({ message: `${label} purged successfully. Config and credentials preserved.`, purged: counts });
      }

      case 'vendors':
        return json(await createDoc('vendors', body), 201);
      case 'raw-materials':
        return json(await createDoc('rawMaterials', body), 201);
      case 'packaging-materials':
        return json(await createDoc('packagingMaterials', body), 201);
      case 'sku-recipes':
        return json(await createDoc('skuRecipes', body), 201);

      case 'recipe-templates': {
        const db = await getDb();

        if (subResource === 'apply') {
          // POST /api/recipe-templates/apply — apply template to selected SKU recipes
          const { templateId, recipeIds } = body;
          if (!templateId || !recipeIds || !Array.isArray(recipeIds)) {
            return json({ error: 'templateId and recipeIds array required' }, 400);
          }
          const template = await db.collection('recipeTemplates').findOne({ _id: templateId });
          if (!template) return json({ error: 'Template not found' }, 404);

          const result = await db.collection('skuRecipes').updateMany(
            { _id: { $in: recipeIds } },
            {
              $set: {
                ingredients: template.ingredients || [],
                defaultWastageBuffer: template.defaultWastageBuffer ?? 5,
                templateId: template._id,
                templateName: template.name,
                needsCostInput: false,
                updatedAt: new Date().toISOString(),
              }
            }
          );
          return json({
            message: `Applied "${template.name}" to ${result.modifiedCount} products`,
            applied: result.modifiedCount,
          });
        }

        if (subResource === 'repush') {
          // POST /api/recipe-templates/repush — re-push template changes to all linked recipes
          const { templateId } = body;
          if (!templateId) return json({ error: 'templateId required' }, 400);
          const template = await db.collection('recipeTemplates').findOne({ _id: templateId });
          if (!template) return json({ error: 'Template not found' }, 404);

          const result = await db.collection('skuRecipes').updateMany(
            { templateId },
            {
              $set: {
                ingredients: template.ingredients || [],
                defaultWastageBuffer: template.defaultWastageBuffer ?? 5,
                templateName: template.name,
                updatedAt: new Date().toISOString(),
              }
            }
          );
          return json({
            message: `Re-pushed "${template.name}" to ${result.modifiedCount} linked products`,
            updated: result.modifiedCount,
          });
        }

        if (subResource === 'unlink') {
          // POST /api/recipe-templates/unlink — unlink a recipe from its template and clear ingredients
          const { recipeId, templateId: unlinkTemplateId } = body;
          if (recipeId) {
            // Unlink single recipe
            await db.collection('skuRecipes').updateOne(
              { _id: recipeId },
              { $set: { templateId: null, templateName: null, ingredients: [], needsCostInput: true, updatedAt: new Date().toISOString() } }
            );
            return json({ message: 'Recipe unlinked and reset' });
          } else if (unlinkTemplateId) {
            // Unlink all recipes from a template (used before template deletion)
            const result = await db.collection('skuRecipes').updateMany(
              { templateId: unlinkTemplateId },
              { $set: { templateId: null, templateName: null, ingredients: [], needsCostInput: true, updatedAt: new Date().toISOString() } }
            );
            return json({ message: `Unlinked ${result.modifiedCount} recipes`, unlinked: result.modifiedCount });
          }
          return json({ error: 'recipeId or templateId required' }, 400);
        }

        // Default: Create new template
        const tpl = {
          _id: uuidv4(),
          name: body.name || 'Untitled Template',
          description: body.description || '',
          ingredients: body.ingredients || [],
          defaultWastageBuffer: Number(body.defaultWastageBuffer) || 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('recipeTemplates').insertOne(tpl);
        return json(tpl, 201);
      }
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
          // Inventory link fields
          inventoryItemId: body.inventoryItemId || null,
          inventoryItemName: body.inventoryItemName || null,
          purchaseQty: body.purchaseQty ? parseFloat(body.purchaseQty) : null,
          date: body.date || new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('overheadExpenses').insertOne(expense);

        // Auto-create stock batch if linked to inventory item under Raw Material Purchases
        if (body.inventoryItemId && body.purchaseQty && body.category === 'Raw Material Purchases') {
          const amt = parseFloat(body.amount) || 0;
          const qty = parseFloat(body.purchaseQty) || 1;
          // If GST inclusive, extract base amount
          const baseAmount = body.gstInclusive ? Math.round((amt / 1.18) * 100) / 100 : amt;
          const costPerUnit = Math.round((baseAmount / qty) * 100) / 100;

          const batch = {
            _id: uuidv4(),
            inventoryItemId: body.inventoryItemId,
            inventoryItemName: body.inventoryItemName || '',
            date: body.date || new Date().toISOString().split('T')[0],
            quantity: qty,
            remainingQty: qty,
            costPerUnit,
            totalCost: baseAmount,
            expenseId: expense._id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await db.collection('stockBatches').insertOne(batch);
          expense._stockBatchCreated = batch._id;
        }

        return json(expense, 201);
      }
      case 'inventory-items': {
        const db = await getDb();
        if (subResource === 'categories' && body.categories) {
          // POST /api/inventory-items/categories — save inventory categories
          await db.collection('inventoryCategories').deleteMany({});
          const cats = body.categories.map(c => ({
            _id: c._id || uuidv4(),
            name: c.name,
            subCategories: c.subCategories || [],
            updatedAt: new Date().toISOString(),
          }));
          if (cats.length > 0) await db.collection('inventoryCategories').insertMany(cats);
          return json(cats);
        }
        const purchasePrice = Number(body.purchasePrice) || 0;
        const purchaseQuantity = Math.max(1, Number(body.purchaseQuantity) || 1);
        const item = {
          _id: uuidv4(),
          name: body.name || '',
          category: body.category || 'Raw Material',
          subCategory: body.subCategory || '',
          purchasePrice,
          purchaseQuantity,
          unit: body.unit || 'units',
          baseCostPerUnit: Math.round((purchasePrice / purchaseQuantity) * 100) / 100,
          lowStockThreshold: Number(body.lowStockThreshold) || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('inventoryItems').insertOne(item);

        // Auto-create initial stock batch if purchasePrice > 0
        if (purchasePrice > 0 && purchaseQuantity > 0) {
          const batch = {
            _id: uuidv4(),
            inventoryItemId: item._id,
            inventoryItemName: item.name,
            date: new Date().toISOString().split('T')[0],
            quantity: purchaseQuantity,
            remainingQty: purchaseQuantity,
            costPerUnit: item.baseCostPerUnit,
            totalCost: purchasePrice,
            expenseId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await db.collection('stockBatches').insertOne(batch);
        }

        return json(item, 201);
      }

      case 'stock-batches': {
        // Manual batch creation
        const db = await getDb();
        const batch = {
          _id: uuidv4(),
          inventoryItemId: body.inventoryItemId || '',
          inventoryItemName: body.inventoryItemName || '',
          date: body.date || new Date().toISOString().split('T')[0],
          quantity: parseFloat(body.quantity) || 0,
          remainingQty: parseFloat(body.quantity) || 0,
          costPerUnit: parseFloat(body.costPerUnit) || 0,
          totalCost: Math.round((parseFloat(body.quantity) || 0) * (parseFloat(body.costPerUnit) || 0) * 100) / 100,
          expenseId: body.expenseId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection('stockBatches').insertOne(batch);
        return json(batch, 201);
      }

      case 'stock': {
        const db = await getDb();
        if (subResource === 'consume') {
          // POST /api/stock/consume — consume stock for an order using FIFO
          const { orderId, orderDate, items: consumeItems } = body;
          if (!orderId || !consumeItems || !Array.isArray(consumeItems)) {
            return json({ error: 'orderId and items array required' }, 400);
          }

          // Check if already consumed for this order
          const existing = await db.collection('stockConsumptions').findOne({ orderId });
          if (existing) {
            return json({ error: 'Stock already consumed for this order. Reverse first.' }, 409);
          }

          const consumptions = await consumeStockForOrder(db, orderId, orderDate, consumeItems);
          const totalCOGS = consumptions.reduce((s, c) => s + (c.totalCost || 0), 0);
          const hasInsufficient = consumptions.some(c => c.insufficientStock);

          return json({
            message: `Stock consumed for order ${orderId}`,
            consumptions,
            totalCOGS: Math.round(totalCOGS * 100) / 100,
            hasInsufficientStock: hasInsufficient,
          }, 201);
        }

        if (subResource === 'reverse') {
          // POST /api/stock/reverse — reverse consumption for an order
          const { orderId } = body;
          if (!orderId) return json({ error: 'orderId required' }, 400);
          const reversed = await reverseStockConsumption(db, orderId);
          return json({ message: `Reversed ${reversed} consumption records for order ${orderId}`, reversed });
        }

        if (subResource === 'process-orders') {
          // POST /api/stock/process-orders — bulk consume stock for unprocessed orders
          const orders = await db.collection('orders').find({}).toArray();
          const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
          const skuMap = {};
          skuRecipes.forEach(r => { skuMap[r.sku] = r; });

          // Find orders not yet consumed
          const consumedOrderIds = new Set(
            (await db.collection('stockConsumptions').distinct('orderId'))
          );

          const EXCL_STATUS = ['Cancelled', 'Voided', 'Pending', 'RTO'];
          const unprocessed = orders.filter(o =>
            !consumedOrderIds.has(o._id) &&
            !EXCL_STATUS.includes(o.status) &&
            skuMap[o.sku]?.ingredients?.length > 0
          );

          let processed = 0;
          let skipped = 0;
          for (const order of unprocessed) {
            const recipe = skuMap[order.sku];
            if (!recipe?.ingredients) { skipped++; continue; }

            const items = recipe.ingredients.map(ing => ({
              inventoryItemId: ing.inventoryItemId,
              inventoryItemName: ing.inventoryItemName || '',
              quantity: (ing.quantityUsed || ing.quantity || 0) * (order.quantity || 1),
            }));

            await consumeStockForOrder(db, order._id, order.orderDate, items);
            processed++;
          }
          return json({ message: `Processed ${processed} orders, skipped ${skipped}`, processed, skipped });
        }

        return json({ error: 'Unknown stock action' }, 400);
      }

      case 'ocr': {
        // POST /api/ocr/shipping-label — LLM-based shipping label scan
        if (subResource === 'shipping-label') {
          const { imageBase64, mimeType } = body;
          if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);
          
          const db = await getDb();
          const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' }) || {};
          const ocrSettings = integrations.ocrSettings || {};
          
          if (ocrSettings.method !== 'llm' || !ocrSettings.apiKey) {
            return json({ error: 'LLM not configured' }, 400);
          }
          
          const provider = ocrSettings.provider || 'gemini';
          const apiKey = ocrSettings.apiKey;
          const model = ocrSettings.model || (provider === 'gemini' ? 'gemini-2.0-flash-lite' : 'gpt-4o-mini');
          
          const prompt = `You are a shipping label reader. Extract the tracking/AWB number from this shipping label image.
Look for:
- India Post / Speed Post tracking: Format is 2 letters + 9 digits + 2 letter country code (e.g., EG560205521IN, RR123456789IN)
- Delhivery AWB: 13-18 digit numbers
- Blue Dart: 11 digit numbers or letter + 10 digits
- Any barcode number printed on the label

Return ONLY valid JSON (no markdown):
{"trackingNumber": "the tracking number", "carrier": "indiapost or bluedart or delhivery or dtdc or other", "confidence": 0.95}
If you cannot find a tracking number, return: {"trackingNumber": null, "carrier": null, "confidence": 0}`;

          try {
            let result;
            if (provider === 'gemini') {
              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(apiKey);
              const genModel = genAI.getGenerativeModel({ model });
              const imagePart = { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } };
              const genResult = await genModel.generateContent([prompt, imagePart]);
              result = genResult.response.text();
            } else if (provider === 'openai') {
              const OpenAI = (await import('openai')).default;
              const openai = new OpenAI({ apiKey });
              const chatResult = await openai.chat.completions.create({
                model, messages: [
                  { role: 'system', content: prompt },
                  { role: 'user', content: [
                    { type: 'text', text: 'Read the tracking number from this shipping label.' },
                    { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } }
                  ] }
                ], max_tokens: 200,
              });
              result = chatResult.choices[0]?.message?.content || '{}';
            }
            
            let cleaned = (result || '{}').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            let parsed;
            try { parsed = JSON.parse(cleaned); } catch { parsed = { trackingNumber: null }; }
            
            return json(parsed);
          } catch (err) {
            console.error('LLM Shipping Label Error:', err);
            return json({ error: err.message, trackingNumber: null }, 500);
          }
        }
        
        // POST /api/ocr/invoice — Process invoice image with configured OCR method
        if (subResource === 'invoice') {
          const { imageBase64, mimeType, ocrText } = body;
          const db = await getDb();
          const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' }) || {};
          const ocrSettings = integrations.ocrSettings || { method: 'tesseract' };
          
          // If method is 'tesseract' and ocrText is provided, parse it
          if (ocrSettings.method === 'tesseract' || !ocrSettings.apiKey) {
            if (!ocrText) return json({ error: 'ocrText required for Tesseract method' }, 400);
            const parsed = parseInvoiceText(ocrText);
            return json({ method: 'tesseract', ...parsed });
          }
          
          // LLM method
          if (!imageBase64) return json({ error: 'imageBase64 required for LLM method' }, 400);
          
          const provider = ocrSettings.provider || 'gemini';
          const apiKey = ocrSettings.apiKey;
          const model = ocrSettings.model || (provider === 'gemini' ? 'gemini-2.0-flash-lite' : 'gpt-4o-mini');
          
          if (!apiKey) return json({ error: 'LLM API key not configured. Go to Integrations > AI & OCR to set it up.' }, 400);
          
          const systemPrompt = `You are an expert invoice/receipt parser. Extract the following fields from the invoice image and return ONLY valid JSON (no markdown, no explanation):
{
  "vendor": "vendor/company name on the invoice",
  "amount": numeric total amount (number, not string),
  "date": "invoice date in YYYY-MM-DD format",
  "invoiceNumber": "invoice/receipt number",
  "category": "one of: Raw Material Purchases, Packaging, Shipping, Software & SaaS, Utilities, Office Supplies, Marketing, Professional Services, Miscellaneous",
  "description": "brief description of items/services",
  "taxAmount": numeric tax amount if visible (number or 0),
  "currency": "INR or detected currency code"
}
If a field is not found, use null for strings and 0 for numbers.`;

          try {
            let result;
            if (provider === 'gemini') {
              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(apiKey);
              const genModel = genAI.getGenerativeModel({ model });
              const imagePart = { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } };
              const genResult = await genModel.generateContent([systemPrompt, imagePart]);
              result = genResult.response.text();
            } else if (provider === 'openai') {
              const OpenAI = (await import('openai')).default;
              const openai = new OpenAI({ apiKey });
              const chatResult = await openai.chat.completions.create({
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: [
                    { type: 'text', text: 'Parse this invoice image and extract the fields as JSON.' },
                    { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } }
                  ] }
                ],
                max_tokens: 1000,
              });
              result = chatResult.choices[0]?.message?.content || '{}';
            } else {
              return json({ error: `Unknown provider: ${provider}` }, 400);
            }
            
            // Parse JSON from LLM response (strip markdown fences if present)
            let cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            let parsed;
            try { parsed = JSON.parse(cleaned); } catch { parsed = { vendor: null, amount: 0, date: null, invoiceNumber: null, category: 'Miscellaneous', description: result.substring(0, 200) }; }
            
            return json({ method: 'llm', provider, model, ...parsed });
          } catch (err) {
            console.error('LLM OCR Error:', err);
            return json({ error: `LLM processing failed: ${err.message}`, method: 'llm', provider }, 500);
          }
        }
        
        // POST /api/ocr/test — Test LLM connection
        if (subResource === 'test') {
          const { provider, apiKey, model } = body;
          if (!provider || !apiKey) return json({ error: 'Provider and API key required' }, 400);
          try {
            if (provider === 'gemini') {
              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(apiKey);
              const genModel = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash-lite' });
              const result = await genModel.generateContent('Say "OK" in one word');
              return json({ success: true, message: 'Connection successful', response: result.response.text().substring(0, 50) });
            } else if (provider === 'openai') {
              const OpenAI = (await import('openai')).default;
              const openai = new OpenAI({ apiKey });
              const result = await openai.chat.completions.create({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'Say "OK" in one word' }], max_tokens: 10 });
              return json({ success: true, message: 'Connection successful', response: result.choices[0]?.message?.content || '' });
            }
            return json({ error: 'Unknown provider' }, 400);
          } catch (err) {
            return json({ success: false, error: `Connection failed: ${err.message}` }, 400);
          }
        }
        
        return json({ error: 'Unknown OCR endpoint' }, 404);
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
      case 'profile': {
        // PUT /api/profile — Update current user's profile (name, themePreference)
        // PUT /api/profile/password — Change password
        // POST /api/profile/avatar handled in POST section
        const db = await getDb();
        try {
          const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
          if (!token?.userId) return json({ error: 'Not authenticated' }, 401);

          if (id === 'password') {
            // PUT /api/profile/password
            const bcrypt = require('bcryptjs');
            const user = await db.collection('users').findOne({ _id: token.userId });
            if (!user) return json({ error: 'User not found' }, 404);
            if (user.googleId && !user.passwordHash) {
              return json({ error: 'Google accounts cannot change password here' }, 400);
            }
            if (!body.currentPassword || !body.newPassword) {
              return json({ error: 'Current and new password required' }, 400);
            }
            const isValid = await bcrypt.compare(body.currentPassword, user.passwordHash);
            if (!isValid) return json({ error: 'Current password is incorrect' }, 400);
            if (body.newPassword.length < 6) return json({ error: 'New password must be at least 6 characters' }, 400);
            const newHash = await bcrypt.hash(body.newPassword, 12);
            await db.collection('users').updateOne(
              { _id: token.userId },
              { $set: { passwordHash: newHash, updatedAt: new Date().toISOString() } }
            );
            return json({ message: 'Password changed successfully' });
          }

          // General profile update (name, themePreference)
          const allowedFields = ['name', 'themePreference'];
          const updates = { updatedAt: new Date().toISOString() };
          allowedFields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });
          await db.collection('users').updateOne({ _id: token.userId }, { $set: updates });
          const updated = await db.collection('users').findOne({ _id: token.userId });
          const { passwordHash: _, ...safeUser } = updated;
          return json(safeUser);
        } catch (err) {
          return json({ error: 'Failed to update profile' }, 500);
        }
      }

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
        // Smart save: only update fields that were actually changed (not masked values)
        const db = await getDb();
        const existing = await db.collection('integrations').findOne({ _id: 'integrations-config' }) || {};
        const updateData = { updatedAt: new Date().toISOString() };

        // Helper: check if a secret field is a masked value (contains * or is all dots/bullets)
        const isMasked = (val) => !val || /^\*+.{0,4}$/.test(val) || /^[•*]+$/.test(val) || val === '********';

        // Merge each integration section, preserving untouched secrets
        const mergeSection = (key, secretFields) => {
          if (!body[key]) return;
          const merged = { ...(existing[key] || {}), ...body[key] };
          // For each secret field, if it looks masked, restore the original
          secretFields.forEach(sf => {
            if (isMasked(body[key][sf]) && existing[key]?.[sf]) {
              merged[sf] = existing[key][sf];
            }
          });
          updateData[key] = merged;
        };

        mergeSection('shopify', ['accessToken']);
        mergeSection('indiaPost', ['password']);
        mergeSection('metaAds', ['token']);
        mergeSection('razorpay', ['keySecret']);
        mergeSection('exchangeRate', ['apiKey']);
        mergeSection('google', ['clientSecret']);
        mergeSection('whatsapp', ['accessToken']);
        mergeSection('ocrSettings', ['apiKey']);

        await db.collection('integrations').updateOne({ _id: 'integrations-config' }, { $set: updateData }, { upsert: true });
        return json({ message: 'Integrations updated successfully' });
      }

      case 'bills': {
        const db = await getDb();
        const billSegments = getSegments(request);
        const billId = billSegments[1];
        if (!billId) return json({ error: 'Bill ID required' }, 400);
        
        const existingBill = await db.collection('bills').findOne({ _id: billId });
        if (!existingBill) return json({ error: 'Bill not found' }, 404);
        
        const billUpdates = { ...body, updatedAt: new Date().toISOString() };
        delete billUpdates._id;
        delete billUpdates.payments; // Payments are managed via POST /api/bills/payment
        await db.collection('bills').updateOne({ _id: billId }, { $set: billUpdates });
        return json(await db.collection('bills').findOne({ _id: billId }));
      }

      case 'vendors': {
        const db = await getDb();
        const vendorSegments = getSegments(request);
        const vendorId = vendorSegments[1];
        if (!vendorId) return json({ error: 'Vendor ID required' }, 400);
        
        const existingVendor = await db.collection('vendors').findOne({ _id: vendorId });
        if (!existingVendor) return json({ error: 'Vendor not found' }, 404);
        
        const vendorUpdates = { ...body, updatedAt: new Date().toISOString() };
        delete vendorUpdates._id;
        await db.collection('vendors').updateOne({ _id: vendorId }, { $set: vendorUpdates });
        return json(await db.collection('vendors').findOne({ _id: vendorId }));
      }

      case 'whatsapp': {
        
        if (waSubResource === 'templates' && waId) {
          // PUT /api/whatsapp/templates/{id}
          const existing = await db.collection('whatsappTemplates').findOne({ _id: waId });
          if (!existing) return json({ error: 'Template not found' }, 404);
          const updates = { ...body, updatedAt: new Date().toISOString() };
          delete updates._id;
          await db.collection('whatsappTemplates').updateOne({ _id: waId }, { $set: updates });
          return json(await db.collection('whatsappTemplates').findOne({ _id: waId }));
        }
        
        if (waSubResource === 'opt-outs' && waId) {
          // PUT /api/whatsapp/opt-outs/{id} — Remove opt-out (re-opt-in)
          await db.collection('whatsappOptOuts').deleteOne({ _id: waId });
          return json({ message: 'Opt-out removed' });
        }
        
        return json({ error: 'Invalid whatsapp endpoint' }, 400);
      }

      case 'kds': {
        const kdsSegs = getSegments(request);
        const kdsSubResource = kdsSegs[1];
        const kdsId = kdsSegs[2];
        const kdsAction = kdsSegs[3];
        const db = await getDb();

        if (kdsSubResource === 'override' && kdsId) {
          // PUT /api/kds/override/{assignmentId} — Master admin override
          const assignment = await db.collection('kdsAssignments').findOne({ _id: kdsId });
          if (!assignment) return json({ error: 'Assignment not found' }, 404);
          const now = new Date().toISOString();
          const updates = { updatedAt: now };
          const logEntries = [];

          // Status override
          if (body.status && body.status !== assignment.status) {
            const validStatuses = ['assigned', 'in_progress', 'completed', 'packed', 'cancelled'];
            if (!validStatuses.includes(body.status)) return json({ error: 'Invalid status' }, 400);
            updates.status = body.status;
            if (body.status === 'in_progress' && !assignment.startedAt) updates.startedAt = now;
            if (body.status === 'completed') updates.completedAt = now;
            if (body.status === 'packed') { updates.packedAt = now; if (!assignment.completedAt) updates.completedAt = now; }
            if (body.status === 'assigned') { updates.startedAt = null; updates.completedAt = null; updates.packedAt = null; }
            logEntries.push({ action: `Status overridden: ${assignment.status} \u2192 ${body.status}`, timestamp: now, by: 'admin_override' });
            await db.collection('orders').updateOne({ _id: assignment.orderId }, { $set: { kdsStatus: body.status, updatedAt: now } });
          }

          // Reassignment
          if (body.reassignTo && body.reassignTo !== assignment.employeeId) {
            const newEmp = await db.collection('users').findOne({ _id: body.reassignTo });
            if (!newEmp) return json({ error: 'Employee not found' }, 404);
            updates.employeeId = body.reassignTo;
            updates.employeeName = newEmp.name || newEmp.email;
            logEntries.push({ action: `Reassigned: ${assignment.employeeName} \u2192 ${newEmp.name || newEmp.email}`, timestamp: now, by: 'admin_override' });
          }

          if (logEntries.length > 0) {
            await db.collection('kdsAssignments').updateOne({ _id: kdsId }, {
              $set: updates,
              $push: { overrideLog: { $each: logEntries } },
            });
            // Log to user activity
            for (const entry of logEntries) {
              await db.collection('userActivity').insertOne({ userId: 'admin', action: `KDS Override on ${assignment.order?.orderId || kdsId}: ${entry.action}`, timestamp: now });
            }
          }

          return json(await db.collection('kdsAssignments').findOne({ _id: kdsId }));
        }

        if (kdsSubResource === 'assignments' && kdsId) {
          const assignment = await db.collection('kdsAssignments').findOne({ _id: kdsId });
          if (!assignment) return json({ error: 'Assignment not found' }, 404);

          if (kdsAction === 'status') {
            const validStatuses = ['assigned', 'in_progress', 'completed', 'packed', 'cancelled'];
            if (!body.status || !validStatuses.includes(body.status)) {
              return json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
            }
            const now = new Date().toISOString();
            const updates = { status: body.status, updatedAt: now };
            if (body.status === 'in_progress' && !assignment.startedAt) updates.startedAt = now;
            if (body.status === 'completed' && !assignment.completedAt) updates.completedAt = now;
            if (body.status === 'packed') { updates.packedAt = now; if (!assignment.completedAt) updates.completedAt = now; }
            
            await db.collection('kdsAssignments').updateOne({ _id: kdsId }, { $set: updates });
            
            // Also update the order's kdsStatus
            await db.collection('orders').updateOne({ _id: assignment.orderId }, {
              $set: { kdsStatus: body.status, updatedAt: now }
            });

            return json(await db.collection('kdsAssignments').findOne({ _id: kdsId }));
          }

          return json({ error: 'Unknown KDS assignment action' }, 400);
        }
        if (kdsSubResource === 'material-requests' && kdsId) {
          const request2 = await db.collection('materialRequests').findOne({ _id: kdsId });
          if (!request2) return json({ error: 'Request not found' }, 404);
          const validStatuses = ['approved', 'denied'];
          if (!body.status || !validStatuses.includes(body.status)) {
            return json({ error: 'Status must be approved or denied' }, 400);
          }
          await db.collection('materialRequests').updateOne({ _id: kdsId }, {
            $set: { status: body.status, respondedAt: new Date().toISOString(), respondedBy: body.respondedBy || 'admin' }
          });
          return json(await db.collection('materialRequests').findOne({ _id: kdsId }));
        }
        return json({ error: 'Unknown KDS update action' }, 400);
      }


      case 'users': {
        if (!id) return json({ error: 'User ID required' }, 400);
        const db = await getDb();
        const user = await db.collection('users').findOne({ _id: id });
        if (!user) return json({ error: 'User not found' }, 404);

        if (action === 'role') {
          // PUT /api/users/{id}/role — change user role
          const validRoles = ['master_admin', 'admin', 'employee'];
          if (!body.role || !validRoles.includes(body.role)) {
            return json({ error: 'Invalid role. Must be: master_admin, admin, or employee' }, 400);
          }
          await db.collection('users').updateOne(
            { _id: id },
            { $set: { role: body.role, updatedAt: new Date().toISOString() } }
          );
          // Log activity
          await db.collection('userActivity').insertOne({ userId: id, action: `Role changed to ${body.role}`, timestamp: new Date().toISOString(), by: 'admin' });
          const updated = await db.collection('users').findOne({ _id: id });
          const { passwordHash, ...safeUser } = updated;
          return json(safeUser);
        }

        if (action === 'module-access') {
          // PUT /api/users/{id}/module-access — update per-user module access
          await db.collection('users').updateOne(
            { _id: id },
            { $set: { moduleAccess: body.moduleAccess || {}, updatedAt: new Date().toISOString() } }
          );
          await db.collection('userActivity').insertOne({ userId: id, action: 'Module access updated', timestamp: new Date().toISOString(), by: 'admin' });
          const updated = await db.collection('users').findOne({ _id: id });
          const { passwordHash: _, ...safeUser } = updated;
          return json(safeUser);
        }

        // General user update (name, avatar)
        const allowedFields = ['name', 'avatar'];
        const updates = { updatedAt: new Date().toISOString() };
        allowedFields.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });
        await db.collection('users').updateOne({ _id: id }, { $set: updates });
        const updated = await db.collection('users').findOne({ _id: id });
        const { passwordHash: _, ...safeUser } = updated;
        return json(safeUser);
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
        // Support unlink action: PUT /api/sku-recipes/{id}/unlink
        if (action === 'unlink') {
          const db = await getDb();
          await db.collection('skuRecipes').updateOne({ _id: id }, { $unset: { templateId: '', templateName: '' }, $set: { ingredients: [], updatedAt: new Date().toISOString() } });
          return json(await db.collection('skuRecipes').findOne({ _id: id }));
        }
        return json(await updateDoc('skuRecipes', id, body));

      case 'recipe-templates': {
        if (!id) return json({ error: 'ID required' }, 400);
        const db = await getDb();
        const updateData = { ...body, updatedAt: new Date().toISOString() };
        delete updateData._id;
        delete updateData.linkedRecipeCount;
        await db.collection('recipeTemplates').updateOne({ _id: id }, { $set: updateData });
        return json(await db.collection('recipeTemplates').findOne({ _id: id }));
      }
      case 'employees':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('employees', id, body));
      case 'overhead-expenses':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('overheadExpenses', id, body));
      case 'inventory-items':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('inventoryItems', id, body));

      case 'razorpay': {
        // PUT /api/razorpay/unmatched/{paymentId}/resolve
        if (id === 'unmatched' && action) {
          const paymentId = action;
          const resolution = segments[3]; // 'resolve'
          if (resolution === 'resolve') {
            const db = await getDb();
            const newStatus = body.status || 'ignored'; // 'ignored' or 'manually_matched'
            const note = body.note || '';
            const result = await db.collection('razorpayUnmatchedPayments').updateOne(
              { _id: paymentId },
              { $set: { status: newStatus, resolvedNote: note, resolvedAt: new Date().toISOString() } }
            );
            if (result.matchedCount === 0) return json({ error: 'Payment not found' }, 404);
            return json({ message: `Payment marked as ${newStatus}`, paymentId });
          }
          // PUT /api/razorpay/unmatched/bulk-resolve
          if (paymentId === 'bulk-resolve') {
            const db = await getDb();
            const { paymentIds, status: bulkStatus } = body;
            const newStatus = bulkStatus || 'ignored';
            if (!paymentIds || !Array.isArray(paymentIds)) return json({ error: 'paymentIds array required' }, 400);
            const result = await db.collection('razorpayUnmatchedPayments').updateMany(
              { _id: { $in: paymentIds } },
              { $set: { status: newStatus, resolvedNote: 'Bulk resolved', resolvedAt: new Date().toISOString() } }
            );
            return json({ message: `${result.modifiedCount} payments marked as ${newStatus}` });
          }
        }
        return json({ error: 'Unknown Razorpay action' }, 404);
      }

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

    // Handle API key revocation separately
    if (resource === 'api-keys') {
      const db = await getDb();
      const result = await db.collection('apiKeys').updateOne(
        { _id: id },
        { $set: { revoked: true, revokedAt: new Date().toISOString() } }
      );
      if (result.matchedCount === 0) return json({ error: 'API key not found' }, 404);
      return json({ message: 'API key revoked' });
    }

    // Handle shipping carrier deletion
    if (resource === 'shipping-carriers') {
      const db = await getDb();
      await db.collection('shippingCarriers').deleteOne({ $or: [{ _id: id }, { id: id }] });
      return json({ message: 'Carrier removed' });
    }

    const collectionMap = {
      'vendors': 'vendors',
      'raw-materials': 'rawMaterials',
      'packaging-materials': 'packagingMaterials',
      'sku-recipes': 'skuRecipes',
      'orders': 'orders',
      'employees': 'employees',
      'overhead-expenses': 'overheadExpenses',
      'inventory-items': 'inventoryItems',
      'stock-batches': 'stockBatches',
      'recipe-templates': 'recipeTemplates',
      'users': 'users',
      'whatsapp-templates': 'whatsappTemplates',
      'bills': 'bills',
      'vendors': 'vendors',
    };

    const collection = collectionMap[resource];
    if (!collection) return json({ error: 'Not found' }, 404);

    // Special handling: when deleting a recipe template, unlink AND reset all associated SKU recipes
    if (resource === 'recipe-templates') {
      const db = await getDb();
      const unlinkResult = await db.collection('skuRecipes').updateMany(
        { templateId: id },
        { $set: { 
          templateId: null, 
          templateName: null, 
          ingredients: [],
          needsCostInput: true,
          updatedAt: new Date().toISOString() 
        } }
      );
      console.log(`Unlinked & reset ${unlinkResult.modifiedCount} SKU recipes from template ${id}`);
    }

    const deleted = await deleteDoc(collection, id);
    if (!deleted) return json({ error: 'Not found' }, 404);
    return json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('DELETE Error:', error);
    return json({ error: error.message }, 500);
  }
}
