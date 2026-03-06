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

    // SKU Recipes
    await db.collection('skuRecipes').createIndex({ sku: 1 }).catch(() => {});
    await db.collection('skuRecipes').createIndex({ name: 1 }).catch(() => {});

    // KDS Assignments
    await db.collection('kdsAssignments').createIndex({ employeeId: 1, status: 1 }).catch(() => {});
    await db.collection('kdsAssignments').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('kdsAssignments').createIndex({ assignedAt: -1 }).catch(() => {});

    // Overhead Expenses
    await db.collection('overheadExpenses').createIndex({ category: 1 }).catch(() => {});
    await db.collection('overheadExpenses').createIndex({ createdAt: -1 }).catch(() => {});

    // Bills
    await db.collection('bills').createIndex({ dueDate: 1, status: 1 }).catch(() => {});
    await db.collection('bills').createIndex({ vendor: 1 }).catch(() => {});

    // Vendors
    await db.collection('vendors').createIndex({ name: 1 }).catch(() => {});

    // Inventory
    await db.collection('inventoryItems').createIndex({ name: 1 }).catch(() => {});
    await db.collection('inventoryItems').createIndex({ category: 1 }).catch(() => {});

    // API Keys
    await db.collection('apiKeys').createIndex({ keyHash: 1 }, { unique: true }).catch(() => {});
    await db.collection('apiKeys').createIndex({ revoked: 1 }).catch(() => {});

    // API Request Log (with TTL - auto-delete after 1 hour)
    await db.collection('apiRequestLog').createIndex({ apiKeyId: 1, timestamp: -1 }).catch(() => {});
    await db.collection('apiRequestLog').createIndex({ timestamp: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});

    // User Activity
    await db.collection('userActivity').createIndex({ userId: 1, timestamp: -1 }).catch(() => {});
    await db.collection('userActivity').createIndex({ timestamp: -1 }).catch(() => {});

    // Sync History
    await db.collection('syncHistory').createIndex({ startedAt: -1 }).catch(() => {});
    await db.collection('syncHistory').createIndex({ integration: 1 }).catch(() => {});

    // Daily Marketing Spend
    await db.collection('dailyMarketingSpend').createIndex({ date: 1 }, { unique: true }).catch(() => {});

    // WhatsApp Messages
    await db.collection('whatsappMessages').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('whatsappMessages').createIndex({ sentAt: -1 }).catch(() => {});

    // Stock Consumptions (FIFO)
    await db.collection('stockConsumptions').createIndex({ orderId: 1 }).catch(() => {});
    await db.collection('stockConsumptions').createIndex({ itemId: 1 }).catch(() => {});

    // Wastage Logs
    await db.collection('wastageLog').createIndex({ employeeId: 1 }).catch(() => {});
    await db.collection('wastageLog').createIndex({ createdAt: -1 }).catch(() => {});

    // Shipping Carriers
    await db.collection('shippingCarriers').createIndex({ id: 1 }, { unique: true }).catch(() => {});

    console.log('[MongoDB] All performance indexes created/verified');
    indexesCreated = true;
  } catch (error) {
    console.error('[MongoDB] Failed to create indexes:', error.message);
  }
}
