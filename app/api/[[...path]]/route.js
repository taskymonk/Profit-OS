import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { v4 as uuidv4 } from 'uuid';
import { calculateOrderProfit, calculateDashboardMetrics } from '@/lib/profitCalculator';

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

// ==================== SEED DATA ====================

async function seedData() {
  const db = await getDb();
  
  // Check if already seeded
  const existingConfig = await db.collection('tenantConfig').findOne({});
  if (existingConfig) {
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

  // Tenant Config
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
      _id: uuidv4(),
      sku: 'GS-CHOCO-PREMIUM-500',
      productName: 'Premium Chocolate Gift Box (500g)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: rawMaterials[0].name, quantity: 5, pricePerUnit: rawMaterials[0].pricePerUnit, unitMeasurement: 'units' },
        { materialId: rawMaterials[1]._id, name: rawMaterials[1].name, quantity: 100, pricePerUnit: rawMaterials[1].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: rawMaterials[2].name, quantity: 80, pricePerUnit: rawMaterials[2].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[4]._id, name: rawMaterials[4].name, quantity: 2, pricePerUnit: rawMaterials[4].pricePerUnit, unitMeasurement: 'ml' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: packagingMaterials[0].name, pricePerUnit: packagingMaterials[0].pricePerUnit },
        { materialId: packagingMaterials[1]._id, name: packagingMaterials[1].name, pricePerUnit: packagingMaterials[1].pricePerUnit },
        { materialId: packagingMaterials[2]._id, name: packagingMaterials[2].name, pricePerUnit: packagingMaterials[2].pricePerUnit },
        { materialId: packagingMaterials[4]._id, name: packagingMaterials[4].name, pricePerUnit: packagingMaterials[4].pricePerUnit },
      ],
      consumableCost: 12,
      totalWeightGrams: 620,
      defaultWastageBuffer: 5,
      monthlyWastageOverride: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      _id: uuidv4(),
      sku: 'GS-ALMOND-TRUFFLE-250',
      productName: 'Almond Truffle Collection (250g)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: rawMaterials[0].name, quantity: 3, pricePerUnit: rawMaterials[0].pricePerUnit, unitMeasurement: 'units' },
        { materialId: rawMaterials[3]._id, name: rawMaterials[3].name, quantity: 60, pricePerUnit: rawMaterials[3].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: rawMaterials[2].name, quantity: 40, pricePerUnit: rawMaterials[2].pricePerUnit, unitMeasurement: 'grams' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: packagingMaterials[0].name, pricePerUnit: packagingMaterials[0].pricePerUnit },
        { materialId: packagingMaterials[1]._id, name: packagingMaterials[1].name, pricePerUnit: packagingMaterials[1].pricePerUnit },
        { materialId: packagingMaterials[2]._id, name: packagingMaterials[2].name, pricePerUnit: packagingMaterials[2].pricePerUnit },
        { materialId: packagingMaterials[3]._id, name: packagingMaterials[3].name, pricePerUnit: packagingMaterials[3].pricePerUnit },
      ],
      consumableCost: 8,
      totalWeightGrams: 330,
      defaultWastageBuffer: 4,
      monthlyWastageOverride: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      _id: uuidv4(),
      sku: 'GS-MIXED-HAMPER-1KG',
      productName: 'Grand Mixed Gift Hamper (1kg)',
      rawMaterials: [
        { materialId: rawMaterials[0]._id, name: rawMaterials[0].name, quantity: 8, pricePerUnit: rawMaterials[0].pricePerUnit, unitMeasurement: 'units' },
        { materialId: rawMaterials[1]._id, name: rawMaterials[1].name, quantity: 200, pricePerUnit: rawMaterials[1].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[2]._id, name: rawMaterials[2].name, quantity: 150, pricePerUnit: rawMaterials[2].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[3]._id, name: rawMaterials[3].name, quantity: 100, pricePerUnit: rawMaterials[3].pricePerUnit, unitMeasurement: 'grams' },
        { materialId: rawMaterials[4]._id, name: rawMaterials[4].name, quantity: 5, pricePerUnit: rawMaterials[4].pricePerUnit, unitMeasurement: 'ml' },
      ],
      packaging: [
        { materialId: packagingMaterials[0]._id, name: packagingMaterials[0].name, pricePerUnit: 55 },
        { materialId: packagingMaterials[1]._id, name: packagingMaterials[1].name, pricePerUnit: packagingMaterials[1].pricePerUnit },
        { materialId: packagingMaterials[2]._id, name: packagingMaterials[2].name, pricePerUnit: 22 },
        { materialId: packagingMaterials[3]._id, name: packagingMaterials[3].name, pricePerUnit: packagingMaterials[3].pricePerUnit },
        { materialId: packagingMaterials[4]._id, name: packagingMaterials[4].name, pricePerUnit: packagingMaterials[4].pricePerUnit },
      ],
      consumableCost: 18,
      totalWeightGrams: 1200,
      defaultWastageBuffer: 6,
      monthlyWastageOverride: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
  await db.collection('skuRecipes').insertMany(skuRecipes);

  // Generate orders for the last 7 days
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
        orderDate: day.toISOString(),
        createdAt: day.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  }
  await db.collection('orders').insertMany(orders);

  // Employees
  const employees = [
    { _id: uuidv4(), name: 'Ramesh Kumar', role: 'Packing Lead', monthlySalary: 25000, shiftStart: '09:00', shiftEnd: '18:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Sunita Devi', role: 'Chocolatier', monthlySalary: 35000, shiftStart: '08:00', shiftEnd: '17:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), name: 'Ajay Yadav', role: 'Dispatch', monthlySalary: 20000, shiftStart: '10:00', shiftEnd: '19:00', dailyOutputs: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ];
  await db.collection('employees').insertMany(employees);

  // Overhead Expenses (per day for last 7 days)
  const expenses = [];
  for (const day of days) {
    // Daily Meta Ads spend
    expenses.push({
      _id: uuidv4(),
      expenseName: 'Meta Ads - Daily',
      category: 'MetaAds',
      amount: 800 + Math.floor(Math.random() * 400),
      currency: 'INR',
      frequency: 'recurring',
      date: day.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  // Monthly fixed expenses
  expenses.push(
    { _id: uuidv4(), expenseName: 'Kitchen Rent', category: 'Rent', amount: 45000, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), expenseName: 'Shopify Subscription', category: 'Software', amount: 2999, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { _id: uuidv4(), expenseName: 'Electricity Bill', category: 'Utilities', amount: 8500, currency: 'INR', frequency: 'recurring', date: days[0].toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
  );
  await db.collection('overheadExpenses').insertMany(expenses);

  // Integrations (empty - user fills these in)
  await db.collection('integrations').insertOne({
    _id: 'integrations-config',
    shopify: { storeUrl: '', accessToken: '', active: false },
    indiaPost: { username: '', password: '', clientId: '', active: false, sandboxMode: true },
    metaAds: { token: '', adAccountId: '', active: false },
    exchangeRate: { apiKey: '', active: false },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  return { message: 'Demo data seeded successfully!', seeded: true };
}

// ==================== DASHBOARD ====================

async function getDashboardData() {
  const db = await getDb();
  const orders = await db.collection('orders').find({}).toArray();
  const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
  const expenses = await db.collection('overheadExpenses').find({}).toArray();
  const tenantConfig = await db.collection('tenantConfig').findOne({});

  const metrics = calculateDashboardMetrics(orders, skuRecipes, expenses);

  // Daily aggregation for chart (last 7 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyData = [];

  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayOrders = orders.filter(o => {
      const d = new Date(o.orderDate);
      return d >= day && d < dayEnd;
    });

    const dayAdSpend = expenses.filter(e => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === day.getTime() && e.category === 'MetaAds';
    }).reduce((sum, e) => sum + (e.amount || 0), 0);

    const skuMap = {};
    skuRecipes.forEach(r => { skuMap[r.sku] = r; });

    let dayProfit = 0;
    let dayRevenue = 0;
    let dayCOGS = 0;
    let dayShipping = 0;

    dayOrders.forEach(order => {
      const profit = calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrders.length);
      dayProfit += profit.netProfit;
      dayRevenue += profit.netRevenue;
      dayCOGS += profit.totalCOGS;
      dayShipping += profit.shippingCost;
    });

    dailyData.push({
      date: day.toISOString().split('T')[0],
      label: day.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
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
  const allTimeProfit = metrics.orderProfits.reduce((sum, p) => sum + p.netProfit, 0);
  const allTimeRevenue = orders.reduce((sum, o) => sum + (o.salePrice || 0), 0);
  const allTimeRTO = orders.filter(o => o.status === 'RTO').length;

  return {
    tenant: tenantConfig,
    today: {
      netProfit: metrics.todayNetProfit,
      totalOrders: metrics.totalOrdersToday,
      rtoRate: metrics.rtoRate,
      roas: metrics.roas,
      revenue: metrics.todayRevenue,
      adSpend: metrics.todayAdSpend,
    },
    allTime: {
      totalOrders: orders.length,
      netProfit: Math.round(allTimeProfit),
      revenue: Math.round(allTimeRevenue),
      rtoCount: allTimeRTO,
      rtoRate: orders.length > 0 ? Math.round((allTimeRTO / orders.length) * 10000) / 100 : 0,
    },
    dailyData,
    recentOrders: metrics.orderProfits.slice(0, 20).map((profit, idx) => {
      const order = orders.find(o => (o._id || o.id) === profit.orderId);
      return { ...profit, ...(order || {}), _profitData: profit };
    }),
  };
}

// ==================== ROUTE HANDLERS ====================

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export async function GET(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const id = segments[1];

    switch (resource) {
      case 'dashboard':
        return json(await getDashboardData());

      case 'tenant-config': {
        const db = await getDb();
        const config = await db.collection('tenantConfig').findOne({});
        return json(config || {});
      }

      case 'vendors':
        if (id) return json(await getDoc('vendors', id));
        return json(await listDocs('vendors'));

      case 'raw-materials':
        if (id) return json(await getDoc('rawMaterials', id));
        return json(await listDocs('rawMaterials'));

      case 'packaging-materials':
        if (id) return json(await getDoc('packagingMaterials', id));
        return json(await listDocs('packagingMaterials'));

      case 'sku-recipes':
        if (id) return json(await getDoc('skuRecipes', id));
        return json(await listDocs('skuRecipes'));

      case 'orders': {
        if (id) return json(await getDoc('orders', id));
        const params = getSearchParams(request);
        const query = {};
        if (params.status) query.status = params.status;
        if (params.sku) query.sku = params.sku;
        return json(await listDocs('orders', query));
      }

      case 'employees':
        if (id) return json(await getDoc('employees', id));
        return json(await listDocs('employees'));

      case 'overhead-expenses':
        if (id) return json(await getDoc('overheadExpenses', id));
        return json(await listDocs('overheadExpenses'));

      case 'integrations': {
        const db = await getDb();
        const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });
        // Mask sensitive tokens
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
        if (!id) return json({ error: 'Order ID required' }, 400);
        const db = await getDb();
        const order = await db.collection('orders').findOne({ _id: id });
        if (!order) return json({ error: 'Order not found' }, 404);
        const recipe = await db.collection('skuRecipes').findOne({ sku: order.sku });
        const expenses = await db.collection('overheadExpenses').find({ category: 'MetaAds' }).toArray();
        const orderDate = new Date(order.orderDate);
        orderDate.setHours(0, 0, 0, 0);
        const dayOrders = await db.collection('orders').find({
          orderDate: { $gte: orderDate.toISOString(), $lt: new Date(orderDate.getTime() + 86400000).toISOString() }
        }).toArray();
        const dayAdSpend = expenses.filter(e => {
          const d = new Date(e.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === orderDate.getTime();
        }).reduce((sum, e) => sum + (e.amount || 0), 0);
        const profit = calculateOrderProfit(order, recipe, dayAdSpend, dayOrders.length || 1);
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
    let body = {};
    try { body = await request.json(); } catch (e) {}

    switch (resource) {
      case 'seed':
        return json(await seedData());

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
        await db.collection('integrations').updateOne(
          { _id: 'integrations-config' },
          { $set: updateData },
          { upsert: true }
        );
        return json({ message: 'Integrations updated successfully' });
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

      case 'orders':
        if (!id) return json({ error: 'ID required' }, 400);
        return json(await updateDoc('orders', id, body));

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
