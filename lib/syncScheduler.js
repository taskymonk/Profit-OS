/**
 * Sync Scheduler — Phase 6: Auto-Sync Scheduling with node-cron
 * 
 * Manages cron jobs for automated sync of Shopify, Razorpay, Meta Ads, and India Post.
 * Features:
 * - Per-integration enable/disable toggle
 * - Configurable intervals (15min, 30min, 1h, 6h, 12h, 24h)
 * - Harmony rules: Shopify syncs first → 30s wait → Razorpay
 * - Lock mechanism: Only one sync per integration at a time
 * - Re-initializes from DB on server restart
 */

import cron from 'node-cron';
import { getDb } from '@/lib/mongodb';

// In-memory cron job references
const cronJobs = {};
// In-memory sync locks
const syncLocks = {};
// Track initialization
let initialized = false;

const SYNC_SETTINGS_ID = 'sync-settings';

// Interval → cron expression mapping
const INTERVAL_TO_CRON = {
  '15min': '*/15 * * * *',
  '30min': '*/30 * * * *',
  '1h': '0 * * * *',
  '6h': '0 */6 * * *',
  '12h': '0 */12 * * *',
  '24h': '0 0 * * *',
  'daily6am': '0 6 * * *',
  'daily12pm': '0 12 * * *',
  'off': null,
};

/**
 * Get or create sync settings document
 */
export async function getSyncSettings() {
  const db = await getDb();
  let settings = await db.collection('syncSettings').findOne({ _id: SYNC_SETTINGS_ID });
  if (!settings) {
    settings = {
      _id: SYNC_SETTINGS_ID,
      masterAutoSyncEnabled: true,
      shopify: {
        lastIncrementalSyncAt: null,
        autoSyncEnabled: false,
        autoSyncInterval: 'off',
        lastAutoSync: null,
      },
      razorpay: {
        lastIncrementalSyncAt: null,
        autoSyncEnabled: false,
        autoSyncInterval: 'off',
        lastAutoSync: null,
      },
      metaAds: {
        autoSyncEnabled: false,
        autoSyncInterval: 'off',
        lastAutoSync: null,
      },
      indiaPost: {
        autoSyncEnabled: false,
        autoSyncInterval: 'off',
        lastAutoSync: null,
      },
      webhooks: {
        shopifySecret: '',
        razorpaySecret: '',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection('syncSettings').insertOne(settings);
  }
  return settings;
}

/**
 * Update sync settings and reschedule cron jobs
 */
export async function updateSyncSettings(updates) {
  const db = await getDb();
  await db.collection('syncSettings').updateOne(
    { _id: SYNC_SETTINGS_ID },
    { $set: { ...updates, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  const settings = await getSyncSettings();
  rescheduleAll(settings);
  return settings;
}

/**
 * Acquire a sync lock — returns true if lock acquired, false if already running
 */
export function acquireSyncLock(integration) {
  if (syncLocks[integration]) return false;
  syncLocks[integration] = { lockedAt: Date.now() };
  return true;
}

/**
 * Release a sync lock
 */
export function releaseSyncLock(integration) {
  delete syncLocks[integration];
}

/**
 * Check if a sync is currently running
 */
export function isSyncRunning(integration) {
  // Auto-release stale locks (older than 10 minutes)
  if (syncLocks[integration] && Date.now() - syncLocks[integration].lockedAt > 600000) {
    delete syncLocks[integration];
    return false;
  }
  return !!syncLocks[integration];
}

/**
 * Get lock status for all integrations
 */
export function getSyncLockStatus() {
  return {
    shopify: isSyncRunning('shopify'),
    razorpay: isSyncRunning('razorpay'),
    metaAds: isSyncRunning('metaAds'),
    indiaPost: isSyncRunning('indiaPost'),
  };
}

/**
 * Run an auto-sync for a specific integration with locking and harmony rules
 */
async function runAutoSync(integration) {
  if (!acquireSyncLock(integration)) {
    console.log(`[SyncScheduler] ${integration} sync already running, skipping.`);
    return;
  }

  const db = await getDb();
  try {
    console.log(`[SyncScheduler] Starting auto-sync for ${integration}...`);
    const settings = await getSyncSettings();

    let result;
    switch (integration) {
      case 'shopify': {
        // Dynamically import the sync function
        const { shopifySyncOrdersIncremental } = await import('@/lib/syncFunctions');
        result = await shopifySyncOrdersIncremental(settings.shopify?.lastIncrementalSyncAt);
        // Update last incremental sync timestamp
        if (!result.error) {
          await db.collection('syncSettings').updateOne(
            { _id: SYNC_SETTINGS_ID },
            { $set: { 'shopify.lastIncrementalSyncAt': new Date().toISOString(), 'shopify.lastAutoSync': new Date().toISOString() } }
          );
        }
        break;
      }
      case 'razorpay': {
        const { razorpaySyncPaymentsIncremental } = await import('@/lib/syncFunctions');
        result = await razorpaySyncPaymentsIncremental(settings.razorpay?.lastIncrementalSyncAt);
        if (!result.error) {
          await db.collection('syncSettings').updateOne(
            { _id: SYNC_SETTINGS_ID },
            { $set: { 'razorpay.lastIncrementalSyncAt': new Date().toISOString(), 'razorpay.lastAutoSync': new Date().toISOString() } }
          );
        }
        break;
      }
      case 'metaAds': {
        const { metaAdsSyncSpendAuto } = await import('@/lib/syncFunctions');
        result = await metaAdsSyncSpendAuto();
        if (!result.error) {
          await db.collection('syncSettings').updateOne(
            { _id: SYNC_SETTINGS_ID },
            { $set: { 'metaAds.lastAutoSync': new Date().toISOString() } }
          );
        }
        break;
      }
      case 'indiaPost': {
        const { indiaPostSyncTrackingAuto } = await import('@/lib/syncFunctions');
        result = await indiaPostSyncTrackingAuto();
        if (!result.error) {
          await db.collection('syncSettings').updateOne(
            { _id: SYNC_SETTINGS_ID },
            { $set: { 'indiaPost.lastAutoSync': new Date().toISOString() } }
          );
        }
        break;
      }
    }

    // Log the auto-sync event
    const { logSyncEventLib } = await import('@/lib/syncFunctions');
    await logSyncEventLib(db, integration, `auto-${integration === 'shopify' ? 'sync-orders' : integration === 'razorpay' ? 'sync-payments' : integration === 'metaAds' ? 'sync-spend' : 'sync-tracking'}`, result?.error ? 'error' : 'success', { ...(result || {}), trigger: 'auto' });

    console.log(`[SyncScheduler] ${integration} auto-sync complete:`, result?.message || result?.error || 'done');
  } catch (err) {
    console.error(`[SyncScheduler] ${integration} auto-sync error:`, err.message);
  } finally {
    releaseSyncLock(integration);
  }
}

/**
 * Harmony-aware auto-sync: Shopify first → wait 30s → Razorpay
 */
async function runHarmonySync() {
  const settings = await getSyncSettings();

  // Run Shopify if enabled
  if (settings.shopify?.autoSyncEnabled && settings.shopify?.autoSyncInterval !== 'off') {
    await runAutoSync('shopify');
    // Wait 30 seconds for data consistency before Razorpay sync
    if (settings.razorpay?.autoSyncEnabled && settings.razorpay?.autoSyncInterval !== 'off') {
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  // Run Razorpay if enabled
  if (settings.razorpay?.autoSyncEnabled && settings.razorpay?.autoSyncInterval !== 'off') {
    await runAutoSync('razorpay');
  }
}

/**
 * Schedule or reschedule a cron job for an integration
 */
function scheduleIntegration(integration, interval, isEnabled) {
  // Stop existing job
  if (cronJobs[integration]) {
    cronJobs[integration].stop();
    delete cronJobs[integration];
  }

  if (!isEnabled || interval === 'off' || !INTERVAL_TO_CRON[interval]) {
    console.log(`[SyncScheduler] ${integration} auto-sync disabled.`);
    return;
  }

  const cronExpr = INTERVAL_TO_CRON[interval];

  // For Shopify and Razorpay, use harmony sync to ensure proper ordering
  if (integration === 'shopify' || integration === 'razorpay') {
    // Only schedule on Shopify's interval — it triggers Razorpay after itself
    if (integration === 'shopify') {
      cronJobs['shopify_harmony'] = cron.schedule(cronExpr, () => {
        runHarmonySync().catch(err => console.error('[SyncScheduler] Harmony sync error:', err.message));
      });
      console.log(`[SyncScheduler] Shopify+Razorpay harmony scheduled: ${cronExpr}`);
    }
    // If only Razorpay is enabled (not Shopify), schedule it standalone
    if (integration === 'razorpay') {
      const settings = getSyncSettingsSync();
      if (!settings?.shopify?.autoSyncEnabled) {
        cronJobs[integration] = cron.schedule(cronExpr, () => {
          runAutoSync(integration).catch(err => console.error(`[SyncScheduler] ${integration} error:`, err.message));
        });
        console.log(`[SyncScheduler] ${integration} standalone scheduled: ${cronExpr}`);
      }
    }
  } else {
    // Meta Ads and India Post run independently
    cronJobs[integration] = cron.schedule(cronExpr, () => {
      runAutoSync(integration).catch(err => console.error(`[SyncScheduler] ${integration} error:`, err.message));
    });
    console.log(`[SyncScheduler] ${integration} scheduled: ${cronExpr}`);
  }
}

// Sync getter for scheduling decisions (non-async, uses cached value)
let cachedSettings = null;
function getSyncSettingsSync() {
  return cachedSettings;
}

/**
 * Reschedule all cron jobs based on current settings
 */
function rescheduleAll(settings) {
  cachedSettings = settings;

  // Stop all existing jobs
  Object.values(cronJobs).forEach(job => {
    try { job.stop(); } catch (e) {}
  });
  Object.keys(cronJobs).forEach(k => delete cronJobs[k]);

  // If master auto-sync is OFF, don't schedule anything
  if (settings.masterAutoSyncEnabled === false) {
    console.log('[SyncScheduler] Master auto-sync is OFF — all schedules paused.');
    return;
  }

  // Schedule Shopify (harmony mode handles Razorpay too)
  if (settings.shopify?.autoSyncEnabled && settings.shopify?.autoSyncInterval !== 'off') {
    const cronExpr = INTERVAL_TO_CRON[settings.shopify.autoSyncInterval];
    if (cronExpr) {
      cronJobs['shopify_harmony'] = cron.schedule(cronExpr, () => {
        runHarmonySync().catch(err => console.error('[SyncScheduler] Harmony sync error:', err.message));
      });
      console.log(`[SyncScheduler] Shopify+Razorpay harmony scheduled: ${cronExpr}`);
    }
  } else if (settings.razorpay?.autoSyncEnabled && settings.razorpay?.autoSyncInterval !== 'off') {
    // Only Razorpay is enabled, schedule standalone
    const cronExpr = INTERVAL_TO_CRON[settings.razorpay.autoSyncInterval];
    if (cronExpr) {
      cronJobs['razorpay'] = cron.schedule(cronExpr, () => {
        runAutoSync('razorpay').catch(err => console.error('[SyncScheduler] Razorpay error:', err.message));
      });
      console.log(`[SyncScheduler] Razorpay standalone scheduled: ${cronExpr}`);
    }
  }

  // Meta Ads
  if (settings.metaAds?.autoSyncEnabled && settings.metaAds?.autoSyncInterval !== 'off') {
    const cronExpr = INTERVAL_TO_CRON[settings.metaAds.autoSyncInterval];
    if (cronExpr) {
      cronJobs['metaAds'] = cron.schedule(cronExpr, () => {
        runAutoSync('metaAds').catch(err => console.error('[SyncScheduler] MetaAds error:', err.message));
      });
      console.log(`[SyncScheduler] MetaAds scheduled: ${cronExpr}`);
    }
  }

  // India Post
  if (settings.indiaPost?.autoSyncEnabled && settings.indiaPost?.autoSyncInterval !== 'off') {
    const cronExpr = INTERVAL_TO_CRON[settings.indiaPost.autoSyncInterval];
    if (cronExpr) {
      cronJobs['indiaPost'] = cron.schedule(cronExpr, () => {
        runAutoSync('indiaPost').catch(err => console.error('[SyncScheduler] IndiaPost error:', err.message));
      });
      console.log(`[SyncScheduler] IndiaPost scheduled: ${cronExpr}`);
    }
  }
}

/**
 * Sync All — triggers incremental sync for all active integrations in harmony order
 */
export async function runSyncAll() {
  const settings = await getSyncSettings();
  const results = {};

  // Run in harmony order: Shopify → wait → Razorpay → Meta Ads → India Post
  const integrations = ['shopify', 'razorpay', 'metaAds', 'indiaPost'];
  
  for (const integration of integrations) {
    if (settings[integration]?.autoSyncEnabled !== false) {
      try {
        if (!acquireSyncLock(integration)) {
          results[integration] = { status: 'skipped', reason: 'already running' };
          continue;
        }
        
        const db = await getDb();
        let result;
        
        switch (integration) {
          case 'shopify': {
            const { shopifySyncOrdersIncremental } = await import('@/lib/syncFunctions');
            result = await shopifySyncOrdersIncremental(settings.shopify?.lastIncrementalSyncAt);
            if (!result.error) {
              await db.collection('syncSettings').updateOne(
                { _id: SYNC_SETTINGS_ID },
                { $set: { 'shopify.lastIncrementalSyncAt': new Date().toISOString(), 'shopify.lastAutoSync': new Date().toISOString() } }
              );
            }
            break;
          }
          case 'razorpay': {
            const { razorpaySyncPaymentsIncremental } = await import('@/lib/syncFunctions');
            result = await razorpaySyncPaymentsIncremental(settings.razorpay?.lastIncrementalSyncAt);
            if (!result.error) {
              await db.collection('syncSettings').updateOne(
                { _id: SYNC_SETTINGS_ID },
                { $set: { 'razorpay.lastIncrementalSyncAt': new Date().toISOString(), 'razorpay.lastAutoSync': new Date().toISOString() } }
              );
            }
            break;
          }
          case 'metaAds': {
            const { metaAdsSyncSpendAuto } = await import('@/lib/syncFunctions');
            result = await metaAdsSyncSpendAuto();
            if (!result.error) {
              await db.collection('syncSettings').updateOne(
                { _id: SYNC_SETTINGS_ID },
                { $set: { 'metaAds.lastAutoSync': new Date().toISOString() } }
              );
            }
            break;
          }
          case 'indiaPost': {
            const { indiaPostSyncTrackingAuto } = await import('@/lib/syncFunctions');
            result = await indiaPostSyncTrackingAuto();
            if (!result.error) {
              await db.collection('syncSettings').updateOne(
                { _id: SYNC_SETTINGS_ID },
                { $set: { 'indiaPost.lastAutoSync': new Date().toISOString() } }
              );
            }
            break;
          }
        }
        
        results[integration] = { status: result?.error ? 'error' : 'success', message: result?.message || result?.error };
        releaseSyncLock(integration);
        
        // Wait 5s between integrations for harmony
        if (integration !== 'indiaPost') {
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        results[integration] = { status: 'error', message: err.message };
        releaseSyncLock(integration);
      }
    } else {
      results[integration] = { status: 'skipped', reason: 'disabled' };
    }
  }
  
  return results;
}


/**
 * Initialize the scheduler — call once on server start (lazy init from route handler)
 */
export async function initScheduler() {
  if (initialized) return;
  initialized = true;
  try {
    const settings = await getSyncSettings();
    rescheduleAll(settings);
    console.log('[SyncScheduler] Initialized from DB settings.');
  } catch (err) {
    console.error('[SyncScheduler] Init failed:', err.message);
    initialized = false; // Allow retry
  }
}

/**
 * Get the current scheduler status for the UI
 */
export function getSchedulerStatus() {
  return {
    initialized,
    activeJobs: Object.keys(cronJobs),
    locks: getSyncLockStatus(),
  };
}
