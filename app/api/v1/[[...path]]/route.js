import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { verifyApiKey, hasPermission } from '@/lib/apiKeyAuth';
import { calculateOrderProfit, calculateDashboardMetrics, calculateProratedOverhead } from '@/lib/profitCalculator';
import { getOpenApiSpec } from '@/lib/openApiSpec';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };
}

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

function apiSuccess(data, meta = null) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return json(response);
}

function apiError(message, status = 400) {
  return json({ success: false, error: message }, status);
}

function getSegments(request) {
  const url = new URL(request.url);
  // Path: /api/v1/orders/123 -> segments: ['orders', '123']
  const path = url.pathname.replace(/^\/api\/v1\/?/, '');
  return path.split('/').filter(Boolean);
}

function getSearchParams(request) {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

// ==================== GET /api/v1/* ====================
export async function GET(request) {
  try {
    const segments = getSegments(request);
    const resource = segments[0];
    const subResource = segments[1];
    const params = getSearchParams(request);

    // Serve OpenAPI spec without auth
    if (resource === 'openapi.json' || resource === 'openapi') {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      return json(getOpenApiSpec(baseUrl));
    }

    // All other endpoints require API key authentication
    const auth = await verifyApiKey(request);
    if (!auth.valid) {
      const status = auth.error?.includes('Rate limit') ? 429 : 401;
      return apiError(auth.error, status);
    }

    if (!hasPermission(auth.key, 'read')) {
      return apiError('Insufficient permissions', 403);
    }

    const db = await getDb();

    switch (resource) {
      // ==================== ORDERS ====================
      case 'orders': {
        if (subResource) {
          // GET /api/v1/orders/{id}
          const order = await db.collection('orders').findOne({ $or: [{ _id: subResource }, { orderId: subResource }] });
          if (!order) return apiError('Order not found', 404);

          // Calculate profit for this order
          let profit = null;
          try {
            const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
            const skuMap = {};
            skuRecipes.forEach(r => { skuMap[r.sku] = r; });
            const skuRecipe = skuMap[order.sku] || null;
            const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' }) || {};
            const tenantConfig = await db.collection('tenantConfig').findOne({}) || {};
            const adSpendTaxRate = tenantConfig?.adSpendTaxRate ?? 18;
            const adSpendTaxMultiplier = 1 + (adSpendTaxRate / 100);

            // Get daily ad spend for this order's date
            const orderDateKey = order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
            let dailyAdSpend = 0;
            let totalDailyOrders = 1;
            if (orderDateKey && integrations?.metaAds?.active) {
              const spend = await db.collection('dailyMarketingSpend').findOne({ date: orderDateKey });
              dailyAdSpend = spend?.spendAmount || 0;
              const dayStart = new Date(orderDateKey + 'T00:00:00+05:30');
              const dayEnd = new Date(orderDateKey + 'T23:59:59.999+05:30');
              totalDailyOrders = await db.collection('orders').countDocuments({
                orderDate: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
              }) || 1;
            }

            const allConsumptions = await db.collection('stockConsumptions').find({ orderId: order._id }).toArray();
            const consumptionMap = {};
            allConsumptions.forEach(c => {
              if (!consumptionMap[c.orderId]) consumptionMap[c.orderId] = [];
              consumptionMap[c.orderId].push(c);
            });
            const calcOptions = { shopifyTxnFeeRate: tenantConfig.shopifyTxnFeeRate || 0, consumptionMap };

            profit = calculateOrderProfit(order, skuRecipe, dailyAdSpend, totalDailyOrders, 1, adSpendTaxMultiplier, calcOptions);
          } catch (e) { /* profit calc optional */ }

          return apiSuccess({ ...order, profit });
        }

        // GET /api/v1/orders — List with pagination
        const page = Math.max(1, parseInt(params.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(params.limit) || 50));
        const skip = (page - 1) * limit;

        const filter = {};
        if (params.status) filter.status = params.status;
        if (params.search) {
          filter.$or = [
            { orderId: { $regex: params.search, $options: 'i' } },
            { customerName: { $regex: params.search, $options: 'i' } },
          ];
        }
        if (params.from || params.to) {
          filter.orderDate = {};
          if (params.from) filter.orderDate.$gte = `${params.from}T00:00:00+05:30`;
          if (params.to) filter.orderDate.$lte = `${params.to}T23:59:59+05:30`;
        }

        // Sort
        let sortField = 'orderDate';
        let sortDir = -1;
        if (params.sort) {
          if (params.sort.startsWith('-')) {
            sortField = params.sort.slice(1);
            sortDir = -1;
          } else {
            sortField = params.sort;
            sortDir = 1;
          }
        }

        const [orders, total] = await Promise.all([
          db.collection('orders').find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(limit).toArray(),
          db.collection('orders').countDocuments(filter),
        ]);

        return apiSuccess(orders, { page, limit, total, totalPages: Math.ceil(total / limit) });
      }

      // ==================== PRODUCTS / SKU RECIPES ====================
      case 'products': {
        if (subResource) {
          const product = await db.collection('skuRecipes').findOne({ $or: [{ _id: subResource }, { sku: subResource }] });
          if (!product) return apiError('Product not found', 404);
          return apiSuccess(product);
        }

        const page = Math.max(1, parseInt(params.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(params.limit) || 50));
        const skip = (page - 1) * limit;
        const filter = {};
        if (params.search) {
          filter.$or = [
            { name: { $regex: params.search, $options: 'i' } },
            { sku: { $regex: params.search, $options: 'i' } },
          ];
        }

        const [products, total] = await Promise.all([
          db.collection('skuRecipes').find(filter).skip(skip).limit(limit).toArray(),
          db.collection('skuRecipes').countDocuments(filter),
        ]);

        return apiSuccess(products, { page, limit, total, totalPages: Math.ceil(total / limit) });
      }

      // ==================== EXPENSES ====================
      case 'expenses': {
        const filter = {};
        if (params.category) filter.category = params.category;
        if (params.frequency) filter.frequency = params.frequency;
        const expenses = await db.collection('overheadExpenses').find(filter).sort({ createdAt: -1 }).toArray();
        return apiSuccess(expenses, { total: expenses.length });
      }

      // ==================== DASHBOARD ====================
      case 'dashboard': {
        const range = params.range || '7days';
        const db = await getDb();
        const allOrders = await db.collection('orders').find({}).toArray();
        const skuRecipes = await db.collection('skuRecipes').find({}).toArray();
        const expenses = await db.collection('overheadExpenses').find({}).toArray();
        const overheadExpenses = expenses.filter(e => e.category !== 'MetaAds');
        const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' }) || {};
        const tenantConfig = await db.collection('tenantConfig').findOne({}) || {};

        // Build adSpendMap
        const isMetaActive = integrations?.metaAds?.active === true;
        const dailySpends = isMetaActive ? await db.collection('dailyMarketingSpend').find({}).toArray() : [];
        const adSpendMap = {};
        dailySpends.forEach(s => { adSpendMap[s.date] = s.spendAmount || 0; });
        const adSpendTaxRate = tenantConfig?.adSpendTaxRate ?? 18;
        const adSpendTaxMultiplier = 1 + (adSpendTaxRate / 100);

        // Date range handling
        const now = new Date();
        const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        let startDate, endDate;
        switch (range) {
          case 'today': startDate = todayIST; endDate = todayIST; break;
          case '7days': {
            const d7 = new Date(now.getTime() - 7 * 86400000);
            const yesterday = new Date(now.getTime() - 86400000);
            startDate = d7.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            endDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            break;
          }
          case 'month': { const [y, m] = todayIST.split('-'); startDate = `${y}-${m}-01`; endDate = todayIST; break; }
          case 'alltime': startDate = '2020-01-01'; endDate = '2030-12-31'; break;
          case 'custom': startDate = params.startDate || todayIST; endDate = params.endDate || todayIST; break;
          default: {
            const d7d = new Date(now.getTime() - 7 * 86400000);
            const yd = new Date(now.getTime() - 86400000);
            startDate = d7d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            endDate = yd.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          }
        }

        // Fetch FIFO consumption records
        const allConsumptions = await db.collection('stockConsumptions').find({}).toArray();
        const consumptionMap = {};
        allConsumptions.forEach(c => {
          if (!consumptionMap[c.orderId]) consumptionMap[c.orderId] = [];
          consumptionMap[c.orderId].push(c);
        });
        const calcOptions = { shopifyTxnFeeRate: tenantConfig.shopifyTxnFeeRate || 0, consumptionMap };

        const metrics = calculateDashboardMetrics(allOrders, skuRecipes, overheadExpenses, startDate, endDate, 1, adSpendMap, adSpendTaxMultiplier, calcOptions);

        return apiSuccess({
          totalOrders: metrics.totalOrders,
          revenue: metrics.revenue,
          grossOrderProfit: metrics.grossOrderProfit,
          netProfit: metrics.netProfit,
          adSpend: metrics.adSpend,
          rtoRate: metrics.rtoRate,
          rtoCount: metrics.rtoCount,
          avgOrderValue: metrics.revenue && metrics.totalOrders ? Math.round((metrics.revenue / metrics.totalOrders) * 100) / 100 : 0,
          profitMargin: metrics.revenue ? Math.round((metrics.netProfit / metrics.revenue) * 10000) / 100 : 0,
          overhead: metrics.overhead,
          plBreakdown: metrics.plBreakdown,
          dateRange: { start: startDate, end: endDate, range },
        });
      }

      // ==================== FINANCE ====================
      case 'finance': {
        if (subResource === 'bills') {
          const filter = {};
          if (params.status) filter.status = params.status;
          const bills = await db.collection('bills').find(filter).sort({ dueDate: 1 }).toArray();
          return apiSuccess(bills, { total: bills.length });
        }
        if (subResource === 'vendors') {
          const vendors = await db.collection('vendors').find({}).sort({ name: 1 }).toArray();
          return apiSuccess(vendors, { total: vendors.length });
        }
        return apiError('Unknown finance resource. Use /finance/bills or /finance/vendors', 404);
      }

      // ==================== INVENTORY ====================
      case 'inventory': {
        const filter = {};
        if (params.category) filter.category = params.category;
        const items = await db.collection('inventoryItems').find(filter).sort({ name: 1 }).toArray();
        return apiSuccess(items, { total: items.length });
      }

      // ==================== EMPLOYEES ====================
      case 'employees': {
        const employees = await db.collection('employees').find({}).sort({ name: 1 }).toArray();
        return apiSuccess(employees, { total: employees.length });
      }

      default:
        return apiError(`Unknown resource: ${resource}. Available: orders, products, expenses, dashboard, finance, inventory, employees`, 404);
    }
  } catch (error) {
    console.error('V1 API Error:', error);
    return apiError('Internal server error', 500);
  }
}
