// Achievement definitions for Profit OS Gamification Engine

export const ACHIEVEMENTS = [
  // === SETUP / ONBOARDING ===
  { id: 'business_setup', name: 'Business Builder', desc: 'Set up your business name and branding', icon: '🏢', xp: 25, category: 'setup', check: (ctx) => !!(ctx.tenantConfig?.tenantName && ctx.tenantConfig?.tenantName !== 'My Business') },
  { id: 'logo_uploaded', name: 'Brand Identity', desc: 'Upload your business logo', icon: '🎨', xp: 25, category: 'setup', check: (ctx) => !!ctx.tenantConfig?.logo },
  { id: 'shopify_connected', name: 'Store Connected', desc: 'Connect your Shopify store', icon: '🛒', xp: 50, category: 'setup', check: (ctx) => !!ctx.integrations?.shopify?.active },
  { id: 'razorpay_connected', name: 'Payments Live', desc: 'Connect Razorpay for payment tracking', icon: '💳', xp: 50, category: 'setup', check: (ctx) => !!ctx.integrations?.razorpay?.active },
  { id: 'meta_ads_connected', name: 'Ad Tracker', desc: 'Connect Meta Ads for marketing spend', icon: '📱', xp: 50, category: 'setup', check: (ctx) => !!ctx.integrations?.metaAds?.active },
  { id: 'whatsapp_connected', name: 'Messenger', desc: 'Set up WhatsApp notifications', icon: '💬', xp: 50, category: 'setup', check: (ctx) => !!ctx.integrations?.whatsapp?.active },

  // === RECIPES & PRODUCTS ===
  { id: 'first_recipe', name: 'Recipe Starter', desc: 'Create your first SKU recipe', icon: '📝', xp: 30, category: 'recipes', check: (ctx) => (ctx.counts?.skuRecipes || 0) >= 1 },
  { id: 'five_recipes', name: 'Recipe Collection', desc: 'Create 5 SKU recipes', icon: '📖', xp: 50, category: 'recipes', check: (ctx) => (ctx.counts?.skuRecipes || 0) >= 5 },
  { id: 'twenty_recipes', name: 'Recipe Master', desc: 'Create 20 SKU recipes', icon: '🏆', xp: 100, category: 'recipes', check: (ctx) => (ctx.counts?.skuRecipes || 0) >= 20 },

  // === ORDERS ===
  { id: 'first_order', name: 'First Sale', desc: 'Sync your first order', icon: '🎉', xp: 30, category: 'orders', check: (ctx) => (ctx.counts?.orders || 0) >= 1 },
  { id: 'hundred_orders', name: 'Century Club', desc: 'Process 100 orders', icon: '💯', xp: 75, category: 'orders', check: (ctx) => (ctx.counts?.orders || 0) >= 100 },
  { id: 'five_hundred_orders', name: 'Volume Seller', desc: 'Process 500 orders', icon: '🚀', xp: 150, category: 'orders', check: (ctx) => (ctx.counts?.orders || 0) >= 500 },
  { id: 'thousand_orders', name: 'Order King', desc: 'Process 1,000 orders', icon: '👑', xp: 300, category: 'orders', check: (ctx) => (ctx.counts?.orders || 0) >= 1000 },
  { id: 'two_thousand_orders', name: 'E-Commerce Legend', desc: 'Process 2,000 orders', icon: '🌟', xp: 500, category: 'orders', check: (ctx) => (ctx.counts?.orders || 0) >= 2000 },

  // === FINANCE ===
  { id: 'first_expense', name: 'Expense Tracker', desc: 'Add your first overhead expense', icon: '💰', xp: 25, category: 'finance', check: (ctx) => (ctx.counts?.expenses || 0) >= 1 },
  { id: 'first_bill', name: 'Bill Manager', desc: 'Create your first bill', icon: '📄', xp: 25, category: 'finance', check: (ctx) => (ctx.counts?.bills || 0) >= 1 },
  { id: 'first_vendor', name: 'Vendor Network', desc: 'Add your first vendor', icon: '🤝', xp: 25, category: 'finance', check: (ctx) => (ctx.counts?.vendors || 0) >= 1 },

  // === INVENTORY ===
  { id: 'first_inventory', name: 'Stock Keeper', desc: 'Add your first inventory item', icon: '📦', xp: 25, category: 'inventory', check: (ctx) => (ctx.counts?.inventoryItems || 0) >= 1 },
  { id: 'ten_inventory', name: 'Warehouse Manager', desc: 'Track 10+ inventory items', icon: '🏭', xp: 75, category: 'inventory', check: (ctx) => (ctx.counts?.inventoryItems || 0) >= 10 },

  // === TEAM ===
  { id: 'first_employee', name: 'Team Builder', desc: 'Add your first employee', icon: '👥', xp: 30, category: 'team', check: (ctx) => (ctx.counts?.employees || 0) >= 1 },

  // === API ===
  { id: 'first_api_key', name: 'Developer Mode', desc: 'Create your first API key', icon: '🔑', xp: 40, category: 'api', check: (ctx) => (ctx.counts?.apiKeys || 0) >= 1 },

  // === BACKUP ===
  { id: 'first_backup', name: 'Safety First', desc: 'Create your first backup', icon: '🛡️', xp: 40, category: 'system', check: (ctx) => (ctx.counts?.backups || 0) >= 1 },
];

export const LEVELS = [
  { name: 'Beginner', minXp: 0, icon: '🌱', color: '#22c55e' },
  { name: 'Intermediate', minXp: 200, icon: '⭐', color: '#3b82f6' },
  { name: 'Pro', minXp: 500, icon: '🔥', color: '#f59e0b' },
  { name: 'Champion', minXp: 1000, icon: '💎', color: '#8b5cf6' },
  { name: 'Legend', minXp: 1800, icon: '🌟', color: '#ef4444' },
];

export function getLevel(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
      break;
    }
  }
  return { current, next };
}

export function calculateProgress(ctx) {
  let totalXp = 0;
  const unlocked = [];
  const locked = [];

  for (const ach of ACHIEVEMENTS) {
    try {
      if (ach.check(ctx)) {
        totalXp += ach.xp;
        unlocked.push({ ...ach, check: undefined });
      } else {
        locked.push({ ...ach, check: undefined });
      }
    } catch {
      locked.push({ ...ach, check: undefined });
    }
  }

  const level = getLevel(totalXp);
  const maxXp = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0);

  return {
    xp: totalXp,
    maxXp,
    level: level.current,
    nextLevel: level.next,
    progressToNext: level.next ? Math.round(((totalXp - level.current.minXp) / (level.next.minXp - level.current.minXp)) * 100) : 100,
    unlocked,
    locked,
    totalAchievements: ACHIEVEMENTS.length,
    unlockedCount: unlocked.length,
  };
}

// Checklist items for onboarding setup guide
export const SETUP_CHECKLIST = [
  { id: 'business', label: 'Set up your business', desc: 'Name, logo, and branding', achievementId: 'business_setup', navigateTo: 'settings' },
  { id: 'shopify', label: 'Connect Shopify', desc: 'Sync your orders', achievementId: 'shopify_connected', navigateTo: 'integrations' },
  { id: 'recipe', label: 'Create a SKU recipe', desc: 'Define product costs', achievementId: 'first_recipe', navigateTo: 'products' },
  { id: 'expense', label: 'Add an expense', desc: 'Track overhead costs', achievementId: 'first_expense', navigateTo: 'expenses' },
  { id: 'razorpay', label: 'Connect Razorpay', desc: 'Track payment fees', achievementId: 'razorpay_connected', navigateTo: 'integrations' },
  { id: 'inventory', label: 'Add inventory', desc: 'Track FIFO stock', achievementId: 'first_inventory', navigateTo: 'inventory' },
];

// Default module settings — all enabled
export const DEFAULT_MODULE_SETTINGS = {
  kds: { enabled: true, label: 'Kitchen Display (KDS)', desc: 'Employee order production interface' },
  employees: { enabled: true, label: 'KDS Overview', desc: 'Employee management and assignments' },
  rto: { enabled: true, label: 'Returns & RTO', desc: 'Return parcel and reshipping management' },
  inventory: { enabled: true, label: 'Inventory', desc: 'Stock tracking with FIFO costing' },
  finance: { enabled: true, label: 'Finance', desc: 'Bills, vendors, and cash flow' },
  whatsapp: { enabled: true, label: 'WhatsApp', desc: 'Customer notification automation' },
  reports: { enabled: true, label: 'Reports', desc: 'Analytics and performance reports' },
};
