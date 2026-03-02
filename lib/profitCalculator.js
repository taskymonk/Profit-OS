// Profit OS - True Profit Engine v4
// BOM Architecture, Shopify Revenue Parity, IST timezone, inclusive GST, ghost ad spend fix

// ==================== IST DATE UTILITY ====================
export function getISTDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '1970-01-01';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ==================== PER-ORDER PROFIT ====================
export function calculateOrderProfit(order, skuRecipe, dailyAdSpend = 0, totalDailyOrders = 1, exchangeRate = 1, adSpendTaxMultiplier = 1, options = {}) {
  const result = {
    orderId: order.id || order._id,
    sku: order.sku,
    status: order.status,
    grossRevenue: order.salePrice || 0,
    discount: order.discount || 0,
    refundAmount: order.refundAmount || 0,
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

  // 1. Revenue — Shopify Parity: Gross - Discounts - Refunds, then subtract tax
  //    For Shopify orders: use actual totalTax from Shopify for exact reconciliation
  //    For non-Shopify orders: compute 18% inclusive GST (Indian e-commerce standard)
  const revenueAfterDeductions = result.grossRevenue - result.discount - result.refundAmount;

  if (order.shopifyOrderId && order.totalTax !== undefined && order.totalTax > 0) {
    // Shopify parity — use the real tax value from Shopify API
    result.gstOnRevenue = order.totalTax;
  } else {
    // Non-Shopify: Inclusive GST → GST = Price - (Price / 1.18)
    result.gstOnRevenue = revenueAfterDeductions > 0
      ? revenueAfterDeductions - (revenueAfterDeductions / 1.18)
      : 0;
  }
  result.netRevenue = revenueAfterDeductions - result.gstOnRevenue;

  // 2. COGS from SKU Recipe — BOM Architecture (ingredients) + Legacy fallback
  if (skuRecipe) {
    if (skuRecipe.ingredients && skuRecipe.ingredients.length > 0) {
      // BOM: each ingredient has baseCostPerUnit and quantityUsed
      (skuRecipe.ingredients).forEach(ing => {
        const baseCost = ing.baseCostPerUnit || 0;
        const qtyUsed = ing.quantityUsed || ing.quantity || 0;
        const lineCost = qtyUsed * baseCost;
        const cat = (ing.category || '').toLowerCase();
        if (cat.includes('raw') || cat === 'raw material') result.rawMaterialCost += lineCost;
        else if (cat.includes('packag')) result.packagingCost += lineCost;
        else result.consumableCost += lineCost;
      });
      const subtotalCOGS = result.rawMaterialCost + result.packagingCost + result.consumableCost;
      const wastagePercent = skuRecipe.monthlyWastageOverride || skuRecipe.defaultWastageBuffer || 0;
      result.wastageCost = subtotalCOGS * (wastagePercent / 100);
      result.totalCOGS = subtotalCOGS + result.wastageCost;
    } else {
      // Legacy format: rawMaterials + packaging + consumableCost
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
  }

  // 3. Shipping — Urgent manual override > India Post tracked tariff > Shopify default
  if (order.isUrgent && order.manualShippingCost !== undefined && order.manualShippingCost !== null) {
    result.shippingCost = order.manualShippingCost;
  } else if (order.shippingMethod === 'indiapost' && order.indiaPostTariff) {
    result.shippingCost = order.indiaPostTariff;
  } else {
    result.shippingCost = order.shippingCost || 0;
  }
  if (result.isRTO) {
    result.shippingCost = result.shippingCost * 2;
  }

  // 4. Transaction Fees — Razorpay reconciled > predictive 2%+GST fallback
  if (order.razorpayReconciled === true) {
    // Exact Razorpay fee (already in ₹, converted from paise during sync)
    result.gatewayFee = order.razorpayFee || 0;
    result.gstOnGateway = order.razorpayTax || 0;
  } else {
    // Predictive fallback: 2% + 18% GST on fee (all orders are prepaid)
    result.gatewayFee = result.grossRevenue * 0.02;
    result.gstOnGateway = result.gatewayFee * 0.18;
  }
  result.totalTransactionFee = result.gatewayFee + result.gstOnGateway;

  // 4b. Shopify Transaction Fee (configurable rate + 18% GST)
  const shopifyRate = (options.shopifyTxnFeeRate || 0) / 100;
  result.shopifyTxnFee = result.grossRevenue * shopifyRate;
  result.shopifyTxnGST = result.shopifyTxnFee * 0.18;
  result.totalShopifyFee = result.shopifyTxnFee + result.shopifyTxnGST;

  // 5. Marketing Allocation = Daily Ad Spend * Tax Multiplier / Daily Orders
  const taxedAdSpend = dailyAdSpend * adSpendTaxMultiplier * exchangeRate;
  result.marketingAllocation = totalDailyOrders > 0 ? taxedAdSpend / totalDailyOrders : 0;

  // 6. NET PROFIT (includes Shopify fee)
  result.netProfit = result.netRevenue - result.totalCOGS - result.shippingCost
    - result.totalTransactionFee - result.totalShopifyFee - result.marketingAllocation;
  result.profitMargin = result.grossRevenue > 0 ? (result.netProfit / result.grossRevenue) * 100 : 0;

  return result;
}

// ==================== PRO-RATA OVERHEAD ====================
export function calculateProratedOverhead(expenses, startDate, endDate) {
  const start = new Date(typeof startDate === 'string' ? startDate + 'T00:00:00+05:30' : startDate);
  const end = new Date(typeof endDate === 'string' ? endDate + 'T23:59:59.999+05:30' : endDate);
  const daysInRange = Math.max(1, Math.round((end - start) / 86400000) + 1);

  // Exclude MetaAds (handled separately as ad spend)
  const eligible = (expenses || []).filter(e => e.category !== 'MetaAds');

  // Deduplicate by name (take first occurrence)
  const seen = new Set();
  const uniqueExpenses = [];
  for (const e of eligible) {
    if (!seen.has(e.expenseName)) {
      seen.add(e.expenseName);
      uniqueExpenses.push(e);
    }
  }

  let totalProrated = 0;
  const breakdown = [];
  const categoryTotals = {};

  for (const e of uniqueExpenses) {
    const amount = e.amount || 0;
    const freq = e.frequency || 'monthly';
    const category = e.category || 'Uncategorized';
    const subCategory = e.subCategory || '';
    let baseAmount = amount;

    // If GST inclusive, extract base amount
    if (e.gstInclusive) {
      baseAmount = amount / 1.18;
    }

    let prorated = 0;
    if (freq === 'one-time') {
      // One-time: include if the expense date falls within the range
      const expDate = e.date ? new Date(e.date + (e.date.includes('T') ? '' : 'T12:00:00+05:30')) : null;
      if (expDate && expDate >= start && expDate <= end) {
        prorated = baseAmount;
      }
    } else if (freq === 'yearly') {
      // Yearly: pro-rate by days (amount / 365 * daysInRange)
      prorated = (baseAmount / 365) * daysInRange;
    } else {
      // Monthly (default): pro-rate by days (amount / 30 * daysInRange)
      prorated = (baseAmount / 30) * daysInRange;
    }

    if (prorated > 0) {
      const gstAmount = e.gstInclusive ? (amount - baseAmount) / (amount > 0 ? amount : 1) * prorated : 0;
      totalProrated += prorated;

      const catKey = category;
      if (!categoryTotals[catKey]) categoryTotals[catKey] = { total: 0, items: [] };
      categoryTotals[catKey].total += prorated;
      categoryTotals[catKey].items.push({
        name: e.expenseName,
        subCategory,
        frequency: freq,
        amount: baseAmount,
        prorated: Math.round(prorated * 100) / 100,
        gstInclusive: e.gstInclusive || false,
      });

      breakdown.push({
        name: e.expenseName,
        category,
        subCategory,
        frequency: freq,
        monthly: freq === 'monthly' ? baseAmount : (freq === 'yearly' ? baseAmount / 12 : 0),
        prorated: Math.round(prorated * 100) / 100,
      });
    }
  }

  // Build category breakdown with rounded totals
  const categoryBreakdown = Object.entries(categoryTotals).map(([cat, data]) => ({
    category: cat,
    total: Math.round(data.total * 100) / 100,
    items: data.items,
  }));

  return {
    monthlyTotal: uniqueExpenses.filter(e => (e.frequency || 'monthly') === 'monthly').reduce((s, e) => s + (e.amount || 0), 0),
    daysInRange,
    proratedAmount: Math.round(totalProrated * 100) / 100,
    breakdown,
    categoryBreakdown,
  };
}

// ==================== DASHBOARD METRICS ====================
export function calculateDashboardMetrics(orders, skuRecipes, expenses, startDate, endDate, exchangeRate = 1, adSpendMap = {}, adSpendTaxMultiplier = 1, options = {}) {
  // IST-aware date boundaries — Shopify stores use Asia/Kolkata timezone.
  // "Feb 22" in IST starts at "Feb 21 18:30 UTC", not "Feb 22 00:00 UTC".
  const start = startDate ? new Date(startDate + 'T00:00:00+05:30') : new Date();
  const end = endDate ? new Date(endDate + 'T23:59:59.999+05:30') : new Date();

  const filteredOrders = (orders || []).filter(o => {
    const d = new Date(o.orderDate);
    return d >= start && d <= end;
  });

  // Strict Financial Parity: exclude orders that Shopify Analytics does not count.
  // Filter by BOTH order status AND Shopify financial_status to match Shopify Analytics exactly.
  const EXCLUDED_STATUSES = ['Cancelled', 'Voided', 'Pending'];
  const EXCLUDED_FINANCIAL = ['pending', 'voided', 'refunded'];
  const accountingOrders = filteredOrders.filter(o =>
    !EXCLUDED_STATUSES.includes(o.status) &&
    !EXCLUDED_FINANCIAL.includes(o.financialStatus)
  );

  const skuMap = {};
  (skuRecipes || []).forEach(r => { skuMap[r.sku] = r; });

  const ordersPerDay = {};
  accountingOrders.forEach(order => {
    const dateKey = getISTDateKey(order.orderDate);
    ordersPerDay[dateKey] = (ordersPerDay[dateKey] || 0) + 1;
  });

  // orderProfits: ALL orders for table display (including cancelled)
  const orderProfits = filteredOrders.map(order => {
    const dateKey = getISTDateKey(order.orderDate);
    const dayOrderCount = ordersPerDay[dateKey] || 1;
    const dayAdSpend = adSpendMap[dateKey] || 0;
    return calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrderCount, exchangeRate, adSpendTaxMultiplier, options);
  });

  // grossOrderProfits: ONLY accounting-eligible orders for financial metrics
  const grossOrderProfits = accountingOrders.map(order => {
    return calculateOrderProfit(order, skuMap[order.sku], 0, 1, exchangeRate, 1, options);
  });

  const grossOrderProfit = grossOrderProfits.reduce((sum, p) => sum + p.netProfit, 0);
  const totalOrders = accountingOrders.length;
  const rtoOrders = accountingOrders.filter(o => o.status === 'RTO').length;
  const rtoRate = totalOrders > 0 ? (rtoOrders / totalOrders) * 100 : 0;
  const totalRevenue = accountingOrders.reduce((sum, o) => sum + (o.salePrice || 0), 0);
  const cancelledCount = filteredOrders.length - accountingOrders.length;

  let totalAdSpend = 0;
  for (const [date, amount] of Object.entries(adSpendMap)) {
    const d = new Date(date + 'T00:00:00+05:30');
    if (d >= start && d <= end) {
      totalAdSpend += amount * adSpendTaxMultiplier;
    }
  }

  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const overhead = calculateProratedOverhead(expenses, start, end);

  const trueNetProfit = grossOrderProfit - totalAdSpend - overhead.proratedAmount;
  const overheadPerOrder = totalOrders > 0 ? overhead.proratedAmount / totalOrders : 0;

  // P&L Waterfall Breakdown
  const r2 = (v) => Math.round(v * 100) / 100;
  const totalDiscount = grossOrderProfits.reduce((s, p) => s + (p.discount || 0), 0);
  const totalRefunds = grossOrderProfits.reduce((s, p) => s + (p.refundAmount || 0), 0);
  const totalGSTOnRevenue = grossOrderProfits.reduce((s, p) => s + (p.gstOnRevenue || 0), 0);
  const totalNetRevenue = grossOrderProfits.reduce((s, p) => s + (p.netRevenue || 0), 0);
  const totalCOGS = grossOrderProfits.reduce((s, p) => s + (p.totalCOGS || 0), 0);
  const totalShipping = grossOrderProfits.reduce((s, p) => s + (p.shippingCost || 0), 0);
  const totalTxnFees = grossOrderProfits.reduce((s, p) => s + (p.totalTransactionFee || 0), 0);
  const totalRazorpayFee = grossOrderProfits.reduce((s, p) => s + (p.gatewayFee || 0), 0);
  const totalRazorpayTax = grossOrderProfits.reduce((s, p) => s + (p.gstOnGateway || 0), 0);
  const totalShopifyTxnFee = grossOrderProfits.reduce((s, p) => s + (p.shopifyTxnFee || 0), 0);
  const totalShopifyTxnGST = grossOrderProfits.reduce((s, p) => s + (p.shopifyTxnGST || 0), 0);
  const totalShopifyFee = grossOrderProfits.reduce((s, p) => s + (p.totalShopifyFee || 0), 0);

  return {
    netProfit: r2(trueNetProfit),
    grossOrderProfit: r2(grossOrderProfit),
    totalOrders,
    rtoRate: r2(rtoRate),
    roas: r2(roas),
    revenue: r2(totalRevenue),
    adSpend: r2(totalAdSpend),
    rtoCount: rtoOrders,
    cancelledCount,
    overhead: {
      ...overhead,
      perOrder: r2(overheadPerOrder),
    },
    plBreakdown: {
      grossRevenue: r2(totalRevenue),
      discount: r2(totalDiscount),
      refunds: r2(totalRefunds),
      gstOnRevenue: r2(totalGSTOnRevenue),
      netRevenue: r2(totalNetRevenue),
      totalCOGS: r2(totalCOGS),
      totalShipping: r2(totalShipping),
      totalTxnFees: r2(totalTxnFees),
      razorpayFee: r2(totalRazorpayFee),
      razorpayTax: r2(totalRazorpayTax),
      adSpend: r2(totalAdSpend),
      overhead: r2(overhead.proratedAmount),
      netProfit: r2(trueNetProfit),
    },
    orderProfits,
  };
}
