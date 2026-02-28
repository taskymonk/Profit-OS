// Profit OS - True Profit Engine v3
// Core calculation utility with IST timezone, inclusive GST, and ghost ad spend fix

// ==================== IST DATE UTILITY ====================
// Prevents UTC drift: IST night orders (e.g. 11:30 PM IST = next day in UTC)
// from being grouped into the wrong calendar day
export function getISTDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '1970-01-01';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ==================== PER-ORDER PROFIT ====================
export function calculateOrderProfit(order, skuRecipe, dailyAdSpend = 0, totalDailyOrders = 1, exchangeRate = 1, adSpendTaxMultiplier = 1) {
  const result = {
    orderId: order.id || order._id,
    sku: order.sku,
    status: order.status,
    grossRevenue: order.salePrice || 0,
    discount: order.discount || 0,
    gstOnRevenue: 0,
    netRevenue: 0,
    rawMaterialCost: 0,
    packagingCost: 0,
    consumableCost: 0,
    wastageCost: 0,
    totalCOGS: 0,
    shippingCost: 0,
    isRTO: order.status === 'RTO',
    isUrgent: order.isUrgent || false,
    gatewayFee: 0,
    gstOnGateway: 0,
    totalTransactionFee: 0,
    marketingAllocation: 0,
    netProfit: 0,
    profitMargin: 0,
  };

  // 1. Net Revenue — Inclusive GST (Indian e-commerce prices include 18% GST)
  // GST = Price - (Price / 1.18), so NetRevenue = Price / 1.18
  const revenueAfterDiscount = result.grossRevenue - result.discount;
  result.gstOnRevenue = revenueAfterDiscount - (revenueAfterDiscount / 1.18);
  result.netRevenue = revenueAfterDiscount - result.gstOnRevenue;

  // 2. COGS from SKU Recipe
  if (skuRecipe) {
    result.rawMaterialCost = (skuRecipe.rawMaterials || []).reduce((sum, rm) => {
      return sum + ((rm.pricePerUnit || 0) * (rm.quantity || 0));
    }, 0);
    result.packagingCost = (skuRecipe.packaging || []).reduce((sum, pkg) => {
      return sum + (pkg.pricePerUnit || 0);
    }, 0);
    result.consumableCost = skuRecipe.consumableCost || 0;
    const subtotalCOGS = result.rawMaterialCost + result.packagingCost + result.consumableCost;
    const wastagePercent = skuRecipe.monthlyWastageOverride || skuRecipe.defaultWastageBuffer || 0;
    result.wastageCost = subtotalCOGS * (wastagePercent / 100);
    result.totalCOGS = subtotalCOGS + result.wastageCost;
  }

  // 3. Shipping — Urgent manual override > India Post tracked tariff > Shopify default
  if (order.isUrgent && order.manualShippingCost !== undefined && order.manualShippingCost !== null) {
    result.shippingCost = order.manualShippingCost;
  } else if (order.shippingMethod === 'indiapost' && order.indiaPostTariff) {
    result.shippingCost = order.indiaPostTariff;
  } else {
    result.shippingCost = order.shippingCost || 0;
  }
  // RTO penalty: double shipping (forward + return logistics)
  if (result.isRTO) {
    result.shippingCost = result.shippingCost * 2;
  }

  // 4. Transaction Fees = (Revenue * 2%) + 18% GST on the fee
  result.gatewayFee = result.grossRevenue * 0.02;
  result.gstOnGateway = result.gatewayFee * 0.18;
  result.totalTransactionFee = result.gatewayFee + result.gstOnGateway;

  // 5. Marketing Allocation = Daily Ad Spend * Tax Multiplier / Daily Orders
  const taxedAdSpend = dailyAdSpend * adSpendTaxMultiplier * exchangeRate;
  result.marketingAllocation = totalDailyOrders > 0 ? taxedAdSpend / totalDailyOrders : 0;

  // 6. NET PROFIT (per-order, includes marketing allocation)
  result.netProfit = result.netRevenue - result.totalCOGS - result.shippingCost - result.totalTransactionFee - result.marketingAllocation;
  result.profitMargin = result.grossRevenue > 0 ? (result.netProfit / result.grossRevenue) * 100 : 0;

  return result;
}

// ==================== PRO-RATA OVERHEAD ====================
export function calculateProratedOverhead(expenses, startDate, endDate) {
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(23, 59, 59, 999);
  const daysInRange = Math.max(1, Math.round((end - start) / 86400000) + 1);

  // Recurring monthly expenses (non-MetaAds) — pro-rate by days in range
  const recurringMonthly = (expenses || []).filter(e =>
    e.frequency === 'recurring' && e.category !== 'MetaAds'
  );

  // Deduplicate by expenseName
  const seen = new Set();
  let monthlyTotal = 0;
  for (const e of recurringMonthly) {
    if (!seen.has(e.expenseName)) {
      seen.add(e.expenseName);
      monthlyTotal += e.amount || 0;
    }
  }

  const proratedAmount = (monthlyTotal / 30) * daysInRange;

  return {
    monthlyTotal,
    daysInRange,
    proratedAmount: Math.round(proratedAmount * 100) / 100,
    breakdown: [...seen].map(name => {
      const exp = recurringMonthly.find(e => e.expenseName === name);
      return {
        name,
        category: exp?.category,
        monthly: exp?.amount || 0,
        prorated: Math.round(((exp?.amount || 0) / 30) * daysInRange * 100) / 100,
      };
    }),
  };
}

// ==================== DASHBOARD METRICS ====================
// Ghost Ad Spend Fix: Calculates grossOrderProfit WITHOUT per-order marketing,
// then subtracts totalAdSpend globally so days with spend but 0 orders don't leak.
export function calculateDashboardMetrics(orders, skuRecipes, expenses, startDate, endDate, exchangeRate = 1, adSpendMap = {}, adSpendTaxMultiplier = 1) {
  const start = startDate ? new Date(startDate) : new Date();
  const end = endDate ? new Date(endDate) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const filteredOrders = (orders || []).filter(o => {
    const d = new Date(o.orderDate);
    return d >= start && d <= end;
  });

  const skuMap = {};
  (skuRecipes || []).forEach(r => { skuMap[r.sku] = r; });

  // Pre-compute orders per day using IST date keys
  const ordersPerDay = {};
  filteredOrders.forEach(order => {
    const dateKey = getISTDateKey(order.orderDate);
    ordersPerDay[dateKey] = (ordersPerDay[dateKey] || 0) + 1;
  });

  // Calculate per-order profits WITH per-order marketing (for individual display)
  const orderProfits = filteredOrders.map(order => {
    const dateKey = getISTDateKey(order.orderDate);
    const dayOrderCount = ordersPerDay[dateKey] || 1;
    const dayAdSpend = adSpendMap[dateKey] || 0;
    return calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrderCount, exchangeRate, adSpendTaxMultiplier);
  });

  // Also calculate gross order profits WITHOUT marketing (for global subtraction)
  const grossOrderProfits = filteredOrders.map(order => {
    return calculateOrderProfit(order, skuMap[order.sku], 0, 1, exchangeRate);
  });

  const grossOrderProfit = grossOrderProfits.reduce((sum, p) => sum + p.netProfit, 0);
  const totalOrders = filteredOrders.length;
  const rtoOrders = filteredOrders.filter(o => o.status === 'RTO').length;
  const rtoRate = totalOrders > 0 ? (rtoOrders / totalOrders) * 100 : 0;
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.salePrice || 0), 0);

  // Sum ALL ad spend for days in the date range — including days with 0 orders (ghost fix)
  // Apply tax multiplier (e.g. 1.18 for 18% GST in India) to reflect true bank deduction
  let totalAdSpend = 0;
  for (const [date, amount] of Object.entries(adSpendMap)) {
    const d = new Date(date + 'T00:00:00+05:30'); // Parse as IST
    if (d >= start && d <= end) {
      totalAdSpend += amount * adSpendTaxMultiplier;
    }
  }

  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

  // Pro-rate recurring monthly overhead (excludes MetaAds)
  const overhead = calculateProratedOverhead(expenses, start, end);

  // TRUE NET PROFIT = Gross Order Profit - Total Ad Spend (global) - Prorated Overhead
  const trueNetProfit = grossOrderProfit - totalAdSpend - overhead.proratedAmount;
  const overheadPerOrder = totalOrders > 0 ? overhead.proratedAmount / totalOrders : 0;

  // P&L Waterfall Breakdown — aggregate per-order line items for the Financial Breakdown widget
  const r2 = (v) => Math.round(v * 100) / 100;
  const totalDiscount = grossOrderProfits.reduce((s, p) => s + (p.discount || 0), 0);
  const totalGSTOnRevenue = grossOrderProfits.reduce((s, p) => s + (p.gstOnRevenue || 0), 0);
  const totalNetRevenue = grossOrderProfits.reduce((s, p) => s + (p.netRevenue || 0), 0);
  const totalCOGS = grossOrderProfits.reduce((s, p) => s + (p.totalCOGS || 0), 0);
  const totalShipping = grossOrderProfits.reduce((s, p) => s + (p.shippingCost || 0), 0);
  const totalTxnFees = grossOrderProfits.reduce((s, p) => s + (p.totalTransactionFee || 0), 0);

  return {
    netProfit: r2(trueNetProfit),
    grossOrderProfit: r2(grossOrderProfit),
    totalOrders,
    rtoRate: r2(rtoRate),
    roas: r2(roas),
    revenue: r2(totalRevenue),
    adSpend: r2(totalAdSpend),
    rtoCount: rtoOrders,
    overhead: {
      ...overhead,
      perOrder: r2(overheadPerOrder),
    },
    plBreakdown: {
      grossRevenue: r2(totalRevenue),
      discount: r2(totalDiscount),
      gstOnRevenue: r2(totalGSTOnRevenue),
      netRevenue: r2(totalNetRevenue),
      totalCOGS: r2(totalCOGS),
      totalShipping: r2(totalShipping),
      totalTxnFees: r2(totalTxnFees),
      adSpend: r2(totalAdSpend),
      overhead: r2(overhead.proratedAmount),
      netProfit: r2(trueNetProfit),
    },
    orderProfits,
  };
}
