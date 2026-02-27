// Profit OS - True Profit Engine
// Core calculation utility for per-order profit

export function calculateOrderProfit(order, skuRecipe, dailyAdSpend = 0, totalDailyOrders = 1, exchangeRate = 1) {
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

  // 1. Net Revenue = Sales - Discounts - 18% GST
  const revenueAfterDiscount = result.grossRevenue - result.discount;
  result.gstOnRevenue = revenueAfterDiscount * 0.18;
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

  // 3. Shipping - Handle Urgent Orders with manual courier override
  if (order.isUrgent && order.manualShippingCost !== undefined && order.manualShippingCost !== null) {
    result.shippingCost = order.manualShippingCost;
  } else if (order.shippingMethod === 'indiapost' && order.indiaPostTariff) {
    // Use India Post tariff if tracked
    result.shippingCost = order.indiaPostTariff;
  } else {
    // Default: use Shopify-reported shipping or stored shippingCost
    result.shippingCost = order.shippingCost || 0;
  }
  // RTO = double shipping (forward + return)
  if (result.isRTO) {
    result.shippingCost = result.shippingCost * 2;
  }

  // 4. Transaction Fees = (Revenue * 2%) + 18% GST on fee
  result.gatewayFee = result.grossRevenue * 0.02;
  result.gstOnGateway = result.gatewayFee * 0.18;
  result.totalTransactionFee = result.gatewayFee + result.gstOnGateway;

  // 5. Marketing Allocation = Daily Ad Spend / Daily Orders
  // exchangeRate converts USD ad spend to base currency (INR)
  const convertedAdSpend = dailyAdSpend * exchangeRate;
  result.marketingAllocation = totalDailyOrders > 0 ? convertedAdSpend / totalDailyOrders : 0;

  // 6. NET PROFIT
  result.netProfit = result.netRevenue - result.totalCOGS - result.shippingCost - result.totalTransactionFee - result.marketingAllocation;
  result.profitMargin = result.grossRevenue > 0 ? (result.netProfit / result.grossRevenue) * 100 : 0;

  return result;
}

// Pro-rate recurring monthly overhead expenses for a given date range
export function calculateProratedOverhead(expenses, startDate, endDate) {
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(23, 59, 59, 999);
  const daysInRange = Math.max(1, Math.round((end - start) / 86400000) + 1);

  // Recurring monthly expenses (non-MetaAds) — pro-rate by days in range
  const recurringMonthly = (expenses || []).filter(e =>
    e.frequency === 'recurring' && e.category !== 'MetaAds'
  );

  // Deduplicate by expenseName (same rent shouldn't count multiple times)
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

export function calculateDashboardMetrics(orders, skuRecipes, expenses, startDate, endDate, exchangeRate = 1) {
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

  // Calculate profit for each filtered order
  const orderProfits = filteredOrders.map(order => {
    const orderDate = new Date(order.orderDate);
    orderDate.setHours(0, 0, 0, 0);

    const dayOrders = filteredOrders.filter(o => {
      const d = new Date(o.orderDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === orderDate.getTime();
    });

    const dayAdSpend = (expenses || []).filter(e => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === orderDate.getTime() && e.category === 'MetaAds';
    }).reduce((sum, e) => sum + (e.amount || 0), 0);

    return calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrders.length, exchangeRate);
  });

  const totalProfit = orderProfits.reduce((sum, p) => sum + p.netProfit, 0);
  const totalOrders = filteredOrders.length;
  const rtoOrders = filteredOrders.filter(o => o.status === 'RTO').length;
  const rtoRate = totalOrders > 0 ? (rtoOrders / totalOrders) * 100 : 0;

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.salePrice || 0), 0);
  const totalAdSpend = (expenses || []).filter(e => {
    const d = new Date(e.date);
    return d >= start && d <= end && e.category === 'MetaAds';
  }).reduce((sum, e) => sum + (e.amount || 0), 0);

  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

  // Pro-rate recurring monthly overhead for this date range
  const overhead = calculateProratedOverhead(expenses, start, end);
  const trueNetProfit = totalProfit - overhead.proratedAmount;
  const overheadPerOrder = totalOrders > 0 ? overhead.proratedAmount / totalOrders : 0;

  return {
    netProfit: Math.round(trueNetProfit * 100) / 100,
    grossOrderProfit: Math.round(totalProfit * 100) / 100,
    totalOrders,
    rtoRate: Math.round(rtoRate * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    revenue: Math.round(totalRevenue * 100) / 100,
    adSpend: totalAdSpend,
    rtoCount: rtoOrders,
    overhead: {
      ...overhead,
      perOrder: Math.round(overheadPerOrder * 100) / 100,
    },
    orderProfits,
  };
}
