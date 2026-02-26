// Profit OS - True Profit Engine
// Core calculation utility for per-order profit

export function calculateOrderProfit(order, skuRecipe, dailyAdSpend = 0, totalDailyOrders = 1) {
  const result = {
    orderId: order.id || order._id,
    sku: order.sku,
    status: order.status,
    // Revenue breakdown
    grossRevenue: order.salePrice || 0,
    discount: order.discount || 0,
    gstOnRevenue: 0,
    netRevenue: 0,
    // COGS breakdown
    rawMaterialCost: 0,
    packagingCost: 0,
    consumableCost: 0,
    wastageCost: 0,
    totalCOGS: 0,
    // Shipping
    shippingCost: 0,
    isRTO: order.status === 'RTO',
    // Transaction fees
    gatewayFee: 0,
    gstOnGateway: 0,
    totalTransactionFee: 0,
    // Marketing
    marketingAllocation: 0,
    // Final
    netProfit: 0,
    profitMargin: 0,
  };

  // 1. Net Revenue = Sales - Discounts - 18% GST
  const revenueAfterDiscount = result.grossRevenue - result.discount;
  result.gstOnRevenue = revenueAfterDiscount * 0.18;
  result.netRevenue = revenueAfterDiscount - result.gstOnRevenue;

  // 2. COGS from SKU Recipe
  if (skuRecipe) {
    // Raw materials cost
    result.rawMaterialCost = (skuRecipe.rawMaterials || []).reduce((sum, rm) => {
      return sum + ((rm.pricePerUnit || 0) * (rm.quantity || 0));
    }, 0);

    // Packaging cost
    result.packagingCost = (skuRecipe.packaging || []).reduce((sum, pkg) => {
      return sum + (pkg.pricePerUnit || 0);
    }, 0);

    // Consumable cost
    result.consumableCost = skuRecipe.consumableCost || 0;

    // Wastage buffer
    const subtotalCOGS = result.rawMaterialCost + result.packagingCost + result.consumableCost;
    const wastagePercent = skuRecipe.monthlyWastageOverride || skuRecipe.defaultWastageBuffer || 0;
    result.wastageCost = subtotalCOGS * (wastagePercent / 100);

    result.totalCOGS = subtotalCOGS + result.wastageCost;
  }

  // 3. Shipping
  if (order.shippingMethod === 'indiapost') {
    result.shippingCost = order.indiaPostTariff || order.shippingCost || 0;
  } else {
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
  result.marketingAllocation = totalDailyOrders > 0 ? dailyAdSpend / totalDailyOrders : 0;

  // 6. NET PROFIT
  result.netProfit = result.netRevenue - result.totalCOGS - result.shippingCost - result.totalTransactionFee - result.marketingAllocation;

  // Profit margin
  result.profitMargin = result.grossRevenue > 0 ? (result.netProfit / result.grossRevenue) * 100 : 0;

  return result;
}

export function calculateDashboardMetrics(orders, skuRecipes, expenses) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get today's ad spend
  const todayAdSpend = (expenses || []).filter(e => {
    const eDate = new Date(e.date);
    eDate.setHours(0, 0, 0, 0);
    return eDate.getTime() === today.getTime() && e.category === 'MetaAds';
  }).reduce((sum, e) => sum + (e.amount || 0), 0);

  const todayOrders = (orders || []).filter(o => {
    const oDate = new Date(o.orderDate);
    oDate.setHours(0, 0, 0, 0);
    return oDate.getTime() === today.getTime();
  });

  const skuMap = {};
  (skuRecipes || []).forEach(r => { skuMap[r.sku] = r; });

  // Calculate profit for each order
  const orderProfits = (orders || []).map(order => {
    const orderDate = new Date(order.orderDate);
    orderDate.setHours(0, 0, 0, 0);

    // Get daily ad spend and order count for that day
    const dayOrders = (orders || []).filter(o => {
      const d = new Date(o.orderDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === orderDate.getTime();
    });

    const dayAdSpend = (expenses || []).filter(e => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === orderDate.getTime() && e.category === 'MetaAds';
    }).reduce((sum, e) => sum + (e.amount || 0), 0);

    return calculateOrderProfit(order, skuMap[order.sku], dayAdSpend, dayOrders.length);
  });

  // Today's metrics
  const todayProfits = orderProfits.filter(p => {
    const order = orders.find(o => (o.id || o._id) === p.orderId);
    if (!order) return false;
    const d = new Date(order.orderDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  const totalProfit = todayProfits.reduce((sum, p) => sum + p.netProfit, 0);
  const totalOrders = todayOrders.length;
  const rtoOrders = todayOrders.filter(o => o.status === 'RTO').length;
  const rtoRate = totalOrders > 0 ? (rtoOrders / totalOrders) * 100 : 0;

  // ROAS = Revenue / Ad Spend
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.salePrice || 0), 0);
  const roas = todayAdSpend > 0 ? todayRevenue / todayAdSpend : 0;

  return {
    todayNetProfit: Math.round(totalProfit * 100) / 100,
    totalOrdersToday: totalOrders,
    rtoRate: Math.round(rtoRate * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    todayAdSpend,
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    orderProfits,
  };
}
