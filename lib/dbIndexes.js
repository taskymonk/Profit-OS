// MongoDB Index Initialization Script
// Run on server startup to ensure all performance indexes exist

import { getDb } from '@/lib/mongodb';

let indexesCreated = false;

export async function ensureIndexes() {
  if (indexesCreated) return;
  
  try {
    const db = await getDb();
    
    // Orders — most queried collection
    await db.collection('orders').createIndex({ orderDate: -1 }).catch(() => {});
    await db.collection('orders').createIndex({ orderId: 1 }, { unique: false }).catch(() => {});
    await db.collection('orders').createIndex({ status: 1 }).catch(() => {});
    await db.collection('orders').createIndex({ customerName: 1 }).catch(() => {});
    await db.collection('orders').createIndex({ 'lineItems.sku': 1 }).catch(() => {});
    await db.collection('orders').createIndex({ kdsStatus: 1 }).catch(() => {});
    await db.collection('orders').createIndex({ isRTO: 1 }).catch(() => {});
    // Compound indexes for common query patterns
    await db.collection('orders').createIndex({ orderDate: -1, status: 1 }).catch(() => {});
    await db.collection('orders').createIndex({ shopifyOrderId: 1 }).catch(() => {});

    // SKU Recipes
    await db.collection('skuRecipes').createIndex({ sku: 1 }).catch(() => {});
    await db.collection('skuRecipes').createIndex({ name: 1 }).catch(() => {});

    // Recipe Templates
    await db.collection('recipeTemplates').createIndex({ name: 1 }).catch(() => {});

    // KDS Assignments
    await db.collection('kdsAssignments').createIndex({ employeeId: 1, status: 1 }).catch(() => {});
    await db.collection('kdsAssignments').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('kdsAssignments').createIndex({ assignedAt: -1 }).catch(() => {});

    // Overhead Expenses
    await db.collection('overheadExpenses').createIndex({ category: 1 }).catch(() => {});
    await db.collection('overheadExpenses').createIndex({ createdAt: -1 }).catch(() => {});
    await db.collection('overheadExpenses').createIndex({ category: 1, createdAt: -1 }).catch(() => {});
    await db.collection('overheadExpenses').createIndex({ vendor: 1 }).catch(() => {});

    // Expense Categories
    await db.collection('expenseCategories').createIndex({ name: 1 }).catch(() => {});

    // Bills
    await db.collection('bills').createIndex({ dueDate: 1, status: 1 }).catch(() => {});
    await db.collection('bills').createIndex({ vendor: 1 }).catch(() => {});
    await db.collection('bills').createIndex({ category: 1 }).catch(() => {});
    await db.collection('bills').createIndex({ createdAt: -1 }).catch(() => {});

    // Vendors
    await db.collection('vendors').createIndex({ name: 1 }).catch(() => {});

    // Employees
    await db.collection('employees').createIndex({ name: 1 }).catch(() => {});
    await db.collection('employees').createIndex({ email: 1 }).catch(() => {});

    // Inventory
    await db.collection('inventoryItems').createIndex({ name: 1 }).catch(() => {});
    await db.collection('inventoryItems').createIndex({ category: 1 }).catch(() => {});
    await db.collection('inventoryItems').createIndex({ category: 1, name: 1 }).catch(() => {});

    // Stock Batches (FIFO)
    await db.collection('stockBatches').createIndex({ itemId: 1, createdAt: 1 }).catch(() => {});
    await db.collection('stockBatches').createIndex({ itemId: 1, remaining: -1 }).catch(() => {});

    // Stock Consumptions
    await db.collection('stockConsumptions').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('stockConsumptions').createIndex({ itemId: 1 }).catch(() => {});
    await db.collection('stockConsumptions').createIndex({ batchId: 1 }).catch(() => {});

    // RTO Parcels
    await db.collection('rtoParcels').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('rtoParcels').createIndex({ status: 1 }).catch(() => {});
    await db.collection('rtoParcels').createIndex({ createdAt: -1 }).catch(() => {});
    await db.collection('rtoParcels').createIndex({ awbNumber: 1 }).catch(() => {});

    // Parcel Images
    await db.collection('parcelImages').createIndex({ orderId: 1 }).catch(() => {});

    // Material Requests
    await db.collection('materialRequests').createIndex({ employeeId: 1, status: 1 }).catch(() => {});
    await db.collection('materialRequests').createIndex({ createdAt: -1 }).catch(() => {});

    // India Post Events
    await db.collection('indiaPostEvents').createIndex({ trackingNumber: 1 }).catch(() => {});
    await db.collection('indiaPostEvents').createIndex({ timestamp: -1 }).catch(() => {});

    // API Keys
    await db.collection('apiKeys').createIndex({ keyHash: 1 }, { unique: true }).catch(() => {});
    await db.collection('apiKeys').createIndex({ revoked: 1 }).catch(() => {});

    // API Request Log (with TTL - auto-delete after 1 hour)
    await db.collection('apiRequestLog').createIndex({ apiKeyId: 1, timestamp: -1 }).catch(() => {});
    await db.collection('apiRequestLog').createIndex({ timestamp: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});

    // User Activity
    await db.collection('userActivity').createIndex({ userId: 1, timestamp: -1 }).catch(() => {});
    await db.collection('userActivity').createIndex({ timestamp: -1 }).catch(() => {});

    // Users
    await db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
    await db.collection('users').createIndex({ role: 1 }).catch(() => {});

    // Sync History
    await db.collection('syncHistory').createIndex({ startedAt: -1 }).catch(() => {});
    await db.collection('syncHistory').createIndex({ integration: 1 }).catch(() => {});

    // Daily Marketing Spend
    await db.collection('dailyMarketingSpend').createIndex({ date: 1 }, { unique: true }).catch(() => {});

    // WhatsApp Messages
    await db.collection('whatsappMessages').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('whatsappMessages').createIndex({ sentAt: -1 }).catch(() => {});
    await db.collection('whatsappMessages').createIndex({ phone: 1 }).catch(() => {});

    // WhatsApp Opt-Outs
    await db.collection('whatsappOptOuts').createIndex({ phone: 1 }, { unique: true }).catch(() => {});

    // WhatsApp Incoming
    await db.collection('whatsappIncoming').createIndex({ timestamp: -1 }).catch(() => {});

    // Wastage Logs
    await db.collection('wastageLog').createIndex({ employeeId: 1 }).catch(() => {});
    await db.collection('wastageLog').createIndex({ createdAt: -1 }).catch(() => {});

    // Shipping Carriers
    await db.collection('shippingCarriers').createIndex({ id: 1 }, { unique: true }).catch(() => {});

    // Settlement Estimates
    await db.collection('settlementEstimates').createIndex({ date: -1 }).catch(() => {});

    // Razorpay Unmatched Payments
    await db.collection('razorpayUnmatchedPayments').createIndex({ paymentId: 1 }).catch(() => {});

    // Backups
    await db.collection('backups').createIndex({ createdAt: -1 }).catch(() => {});

    console.log('[MongoDB] All performance indexes created/verified');
    indexesCreated = true;
  } catch (error) {
    console.error('[MongoDB] Failed to create indexes:', error.message);
  }
}
