/**
 * Sync Functions Library — Phase 6: Incremental Sync Support
 * 
 * Extracted sync logic that supports both full and incremental modes.
 * Used by both the manual sync endpoints and the auto-scheduler.
 */

import { getDb } from '@/lib/mongodb';
import { v4 as uuidv4 } from 'uuid';

// ==================== SYNC HISTORY LOGGING ====================
export async function logSyncEventLib(db, integration, action, status, details = {}) {
  try {
    await db.collection('syncHistory').insertOne({
      _id: uuidv4(),
      integration,
      action,
      status,
      details,
      timestamp: new Date().toISOString(),
    });
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

// ==================== SHOPIFY INCREMENTAL SYNC ====================
export async function shopifySyncOrdersIncremental(lastSyncAt = null) {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.shopify?.storeUrl || !integrations?.shopify?.accessToken) {
    return { error: 'Shopify credentials not configured.', synced: 0 };
  }

  const { storeUrl, accessToken } = integrations.shopify;
  const baseUrl = storeUrl.includes('https://') ? storeUrl : `https://${storeUrl}`;
  const isIncremental = !!lastSyncAt;

  try {
    let allShopifyOrders = [];
    let nextUrl = `${baseUrl}/admin/api/2024-01/orders.json?limit=250&status=any&fulfillment_status=any&financial_status=any`;
    
    // If incremental, add updated_at_min filter
    if (isIncremental && lastSyncAt) {
      const sinceDate = new Date(lastSyncAt).toISOString();
      nextUrl += `&updated_at_min=${encodeURIComponent(sinceDate)}`;
    }

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

      nextUrl = null;
      const linkHeader = res.headers.get('link');
      if (linkHeader) {
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

      let status = 'Unfulfilled';
      if (shopifyOrder.fulfillment_status === 'fulfilled') {
        status = 'Delivered';
      } else if (shopifyOrder.fulfillment_status === 'partial') {
        status = 'In Transit';
      } else if (shopifyOrder.cancelled_at) {
        status = 'Cancelled';
      }

      const shopifyDateRaw = shopifyOrder.created_at || shopifyOrder.processed_at || shopifyOrder.updated_at;
      const shopifyDate = shopifyDateRaw ? new Date(shopifyDateRaw).toISOString() : new Date().toISOString();

      const addr = shopifyOrder.shipping_address || {};
      const shippingAddress = {
        line1: addr.address1 || '',
        line2: addr.address2 || '',
        city: addr.city || '',
        state: addr.province || '',
        zip: addr.zip || '',
        country: addr.country || '',
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
        return sum + (refund.refund_line_items || []).reduce((s, rli) => {
          return s + (parseFloat(rli.subtotal) || 0);
        }, 0);
      }, 0);

      const financialStatus = shopifyOrder.financial_status || 'unknown';

      for (const item of productItems) {
        const sku = item.sku || `SHOP-${item.variant_id || item.product_id}`;
        const itemQty = item.quantity || 1;

        const lineItemRaw = parseFloat(item.price) * itemQty;
        const priceRatio = rawSubtotal > 0 ? lineItemRaw / rawSubtotal : (1 / totalLineItems);

        const itemTipShare = tipAmount > 0 ? Math.round(tipAmount * priceRatio * 100) / 100 : 0;

        const result = await db.collection('orders').updateOne(
          { shopifyOrderId: shopifyOrderIdStr, sku: sku },
          {
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

    // Auto-create SKU recipe stubs
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

    return {
      message: `${isIncremental ? 'Incremental' : 'Full'} sync: ${synced} new, ${updated} updated. ${recipeStubsCreated} recipe stubs. Total: ${allShopifyOrders.length}`,
      synced, updated, recipeStubsCreated, totalShopifyOrders: allShopifyOrders.length,
      syncType: isIncremental ? 'incremental' : 'full',
    };
  } catch (err) {
    return { error: `Shopify order sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== RAZORPAY INCREMENTAL SYNC ====================
export async function razorpaySyncPaymentsIncremental(lastSyncAt = null) {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.razorpay?.keyId || !integrations?.razorpay?.keySecret) {
    return { error: 'Razorpay credentials not configured.', synced: 0 };
  }

  const { keyId, keySecret } = integrations.razorpay;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const isIncremental = !!lastSyncAt;

  try {
    let allPayments = [];
    let skip = 0;
    const count = 100;
    let hasMore = true;

    // Build URL with optional `from` timestamp for incremental
    const fromParam = isIncremental ? `&from=${Math.floor(new Date(lastSyncAt).getTime() / 1000)}` : '';

    while (hasMore) {
      const url = `https://api.razorpay.com/v1/payments?count=${count}&skip=${skip}${fromParam}`;
      const res = await fetch(url, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Razorpay API error: ${res.status} - ${errText}`, synced: allPayments.length > 0 ? 'partial' : 0 };
      }

      const data = await res.json();
      const items = data.items || [];
      allPayments = allPayments.concat(items);

      if (items.length < count) {
        hasMore = false;
      } else {
        skip += count;
      }

      if (allPayments.length >= 10000) break;
    }

    // Same matching logic as the main sync
    const allOrders = await db.collection('orders').find({}).toArray();

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

    const normalizePhone = (phone) => {
      if (!phone) return '';
      return phone.replace(/\D/g, '').slice(-10);
    };

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
    const matchedShopifyIds = new Set();
    const unmatchedPaymentsList = [];

    for (const payment of allPayments) {
      if (payment.status !== 'captured') {
        skippedNonCaptured++;
        continue;
      }

      let matchedGroup = null;
      const payPhone = normalizePhone(payment.contact || '');
      const payEmail = (payment.email || '').toLowerCase().trim();
      const payAmount = payment.amount || 0;

      if (!matchedGroup && payPhone) {
        const candidates = phoneAmountMap[`${payPhone}_${payAmount}`] || [];
        matchedGroup = candidates.find(g => !matchedShopifyIds.has(g.shopifyOrderId));
      }

      if (!matchedGroup && payEmail) {
        const candidates = emailAmountMap[`${payEmail}_${payAmount}`] || [];
        matchedGroup = candidates.find(g => !matchedShopifyIds.has(g.shopifyOrderId));
      }

      if (!matchedGroup) {
        const candidates = (amountMap[payAmount] || []).filter(g => !matchedShopifyIds.has(g.shopifyOrderId));
        if (candidates.length === 1) {
          matchedGroup = candidates[0];
        }
      }

      if (matchedGroup) {
        matchedShopifyIds.add(matchedGroup.shopifyOrderId);

        const feeInRupees = (payment.fee || 0) / 100;
        const taxInRupees = (payment.tax || 0) / 100;
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
            status: 'unresolved',
            syncedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (!isIncremental) {
      await db.collection('razorpayUnmatchedPayments').deleteMany({ status: 'unresolved' });
    }
    if (unmatchedPaymentsList.length > 0) {
      await db.collection('razorpayUnmatchedPayments').insertMany(unmatchedPaymentsList, { ordered: false }).catch(() => {});
    }

    const prepaidResult = await db.collection('orders').updateMany(
      { shopifyOrderId: { $exists: true }, paymentMethod: { $ne: 'prepaid' } },
      { $set: { paymentMethod: 'prepaid', updatedAt: new Date().toISOString() } }
    );

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
      message: `${isIncremental ? 'Incremental' : 'Full'} Razorpay sync: ${matched} reconciled, ${unmatched} unmatched.`,
      totalPaymentsFetched: allPayments.length,
      captured: allPayments.filter(p => p.status === 'captured').length,
      matched,
      unmatched,
      skippedNonCaptured,
      prepaidMarked: prepaidResult.modifiedCount,
      syncType: isIncremental ? 'incremental' : 'full',
    };
  } catch (err) {
    return { error: `Razorpay sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== META ADS AUTO SYNC ====================
export async function metaAdsSyncSpendAuto() {
  // Re-uses the same logic as manual sync — delegates to the existing function
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.metaAds?.token || !integrations?.metaAds?.adAccountId) {
    return { error: 'Meta Ads credentials not configured.', synced: 0 };
  }

  const { token, adAccountId } = integrations.metaAds;
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  try {
    const acctRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}?fields=currency&access_token=${token}`);
    if (!acctRes.ok) {
      const errData = await acctRes.json().catch(() => ({}));
      return { error: `Meta API error: ${errData?.error?.message || acctRes.status}`, synced: 0 };
    }
    const acctData = await acctRes.json();
    const adCurrency = acctData.currency || 'USD';

    let exchangeRate = 1;
    if (adCurrency !== 'INR') {
      try {
        const fxRes = await fetch(`https://api.frankfurter.app/latest?from=${adCurrency}&to=INR`);
        const fxData = await fxRes.json();
        exchangeRate = fxData.rates?.INR || (adCurrency === 'USD' ? 83 : 1);
      } catch (e) {
        exchangeRate = adCurrency === 'USD' ? 83 : 1;
      }
    }

    let allInsights = [];
    let url = `https://graph.facebook.com/v19.0/${accountId}/insights?time_increment=1&date_preset=last_30d&fields=spend,date_start&access_token=${token}&limit=100`;

    while (url) {
      const insightsRes = await fetch(url);
      if (!insightsRes.ok) break;
      const insightsData = await insightsRes.json();
      allInsights = allInsights.concat(insightsData.data || []);
      url = insightsData.paging?.next || null;
    }

    let synced = 0;
    let totalSpendINR = 0;
    for (const day of allInsights) {
      const rawSpend = parseFloat(day.spend) || 0;
      const spendInINR = adCurrency !== 'INR' ? Math.round(rawSpend * exchangeRate * 100) / 100 : rawSpend;
      totalSpendINR += spendInINR;

      await db.collection('dailyMarketingSpend').updateOne(
        { date: day.date_start },
        { $set: { date: day.date_start, spendAmount: spendInINR, rawSpend, rawCurrency: adCurrency, exchangeRate, currency: 'INR', source: 'meta_ads', updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      synced++;
    }

    await db.collection('integrations').updateOne(
      { _id: 'integrations-config' },
      { $set: { 'metaAds.active': true, 'metaAds.lastSyncAt': new Date().toISOString(), 'metaAds.adCurrency': adCurrency } }
    );

    return { message: `Auto-synced ${synced} days of ad spend.`, synced, totalSpendINR: Math.round(totalSpendINR * 100) / 100, syncType: 'auto' };
  } catch (err) {
    return { error: `Meta Ads auto-sync failed: ${err.message}`, synced: 0 };
  }
}

// ==================== INDIA POST AUTO SYNC ====================
export async function indiaPostSyncTrackingAuto() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({ _id: 'integrations-config' });

  if (!integrations?.indiaPost?.username || !integrations?.indiaPost?.password) {
    return { error: 'India Post credentials not configured.', synced: 0 };
  }

  const { username, password, sandboxMode } = integrations.indiaPost;
  const baseUrl = sandboxMode ? 'https://test.cept.gov.in/ceptapi/v2' : 'https://cept.gov.in/ceptapi/v2';

  try {
    // Login
    const loginRes = await fetch(`${baseUrl}/access/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!loginRes.ok) return { error: 'India Post login failed.', synced: 0 };
    const loginData = await loginRes.json();
    const accessToken = loginData?.data?.access_token || loginData?.access_token;
    if (!accessToken) return { error: 'No access token from India Post.', synced: 0 };

    // Find orders with tracking numbers in non-terminal statuses
    const pendingOrders = await db.collection('orders').find({
      trackingNumber: { $ne: null, $exists: true },
      status: { $nin: ['Delivered', 'RTO', 'Cancelled'] },
    }).toArray();

    let totalTracked = 0, totalDelivered = 0, totalRTO = 0;

    for (const order of pendingOrders) {
      try {
        const trackRes = await fetch(`${baseUrl}/tracking/search?trackingNumber=${order.trackingNumber}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
        if (!trackRes.ok) continue;
        const trackData = await trackRes.json();
        const events = trackData?.data?.events || trackData?.events || [];
        if (events.length === 0) continue;

        const latestEvent = events[0];
        const desc = (latestEvent.event || latestEvent.description || '').toLowerCase();

        let newStatus = order.status;
        if (desc.includes('delivered')) { newStatus = 'Delivered'; totalDelivered++; }
        else if (desc.includes('return') || desc.includes('rto')) { newStatus = 'RTO'; totalRTO++; }
        else if (desc.includes('in transit') || desc.includes('dispatched')) { newStatus = 'In Transit'; }
        else if (desc.includes('out for delivery')) { newStatus = 'Out for Delivery'; }

        await db.collection('orders').updateOne({ _id: order._id }, {
          $set: {
            indiaPostLastEvent: latestEvent.event || latestEvent.description || '',
            indiaPostLastEventAt: latestEvent.timestamp || new Date().toISOString(),
            status: newStatus,
            updatedAt: new Date().toISOString(),
          }
        });
        totalTracked++;
      } catch (e) {
        // Skip individual tracking errors
      }
    }

    await db.collection('integrations').updateOne({ _id: 'integrations-config' }, { $set: { 'indiaPost.lastSyncAt': new Date().toISOString() } });

    return {
      message: `Auto-tracked ${totalTracked} shipments. ${totalDelivered} delivered, ${totalRTO} RTO.`,
      tracked: totalTracked, delivered: totalDelivered, rto: totalRTO, syncType: 'auto',
    };
  } catch (err) {
    return { error: `India Post auto-sync failed: ${err.message}`, synced: 0 };
  }
}
