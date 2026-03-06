'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShoppingBag, Truck, Megaphone, RefreshCw, Save, Eye, EyeOff, Globe, Loader2,
  CheckCircle, AlertCircle, CreditCard, Clock, History, ChevronDown, ChevronRight,
  Zap, Timer, Lock, Unlock, Webhook, Shield, Settings2, Play, Pause, RotateCcw,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';

// ==================== HELPERS ====================
const fmtTime = (ts) => {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
};

const INTERVAL_OPTIONS = {
  shopify: [
    { value: 'off', label: 'Off' },
    { value: '15min', label: 'Every 15 min' },
    { value: '30min', label: 'Every 30 min' },
    { value: '1h', label: 'Every 1 hour' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
    { value: '24h', label: 'Every 24 hours' },
  ],
  razorpay: [
    { value: 'off', label: 'Off' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
    { value: '24h', label: 'Every 24 hours' },
  ],
  metaAds: [
    { value: 'off', label: 'Off' },
    { value: 'daily6am', label: 'Daily at 6 AM' },
    { value: 'daily12pm', label: 'Daily at 12 PM' },
    { value: '12h', label: 'Every 12 hours' },
  ],
  indiaPost: [
    { value: 'off', label: 'Off' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
    { value: '24h', label: 'Every 24 hours' },
  ],
};

const CATEGORY_CONFIG = [
  { id: 'ecommerce', label: 'E-Commerce', icon: ShoppingBag, color: 'green', integrations: ['shopify'] },
  { id: 'payments', label: 'Payments', icon: CreditCard, color: 'indigo', integrations: ['razorpay'] },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, color: 'blue', integrations: ['metaAds'] },
  { id: 'shipping', label: 'Shipping', icon: Truck, color: 'orange', integrations: ['indiaPost'] },
  { id: 'messaging', label: 'Messaging', icon: MessageSquare, color: 'emerald', integrations: ['whatsapp'] },
  { id: 'auth', label: 'Authentication', icon: Shield, color: 'purple', integrations: ['google'] },
];

// ==================== AUTO SYNC CONTROL COMPONENT ====================
function AutoSyncControl({ integration, syncSettings, onUpdateSyncSettings }) {
  const settings = syncSettings?.[integration] || {};
  const intervals = INTERVAL_OPTIONS[integration] || [];

  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-dashed space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Auto-Sync</span>
        </div>
        <Switch
          checked={settings.autoSyncEnabled || false}
          onCheckedChange={(v) => {
            onUpdateSyncSettings({ [`${integration}.autoSyncEnabled`]: v });
          }}
        />
      </div>

      {settings.autoSyncEnabled && (
        <div className="flex items-center gap-2">
          <Select
            value={settings.autoSyncInterval || 'off'}
            onValueChange={(v) => {
              onUpdateSyncSettings({ [`${integration}.autoSyncInterval`]: v });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervals.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {settings.lastAutoSync && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> Last auto-sync: {fmtTime(settings.lastAutoSync)}
        </p>
      )}
      {settings.lastIncrementalSyncAt && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-2.5 h-2.5" /> Last incremental: {fmtTime(settings.lastIncrementalSyncAt)}
        </p>
      )}
    </div>
  );
}

// ==================== COLLAPSIBLE GUIDE COMPONENT ====================
function SetupGuide({ children, title = 'Setup Guide' }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors text-left">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-blue-600 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
          <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">{title}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/20">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ==================== MAIN COMPONENT ====================
export default function IntegrationsView() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const [shopify, setShopify] = useState({ storeUrl: '', accessToken: '', active: false });
  const [indiaPost, setIndiaPost] = useState({
    username: '', password: '', bulkCustomerId: '', contractId: '',
    senderName: '', senderCompany: '', senderAddress: '', senderCity: '', senderState: '', senderPincode: '', senderMobile: '', senderEmail: '',
    active: false, sandboxMode: true,
    webhookUrl: typeof window !== 'undefined' ? `${window.location.origin}/api/indiapost/webhook` : '',
  });
  const [metaAds, setMetaAds] = useState({ token: '', adAccountId: '', active: false });
  const [razorpay, setRazorpay] = useState({ keyId: '', keySecret: '', active: false });
  const [exchangeRate, setExchangeRate] = useState({ apiKey: '', active: false });
  const [google, setGoogle] = useState({ clientId: '', clientSecret: '', active: false });
  const [whatsapp, setWhatsapp] = useState({ phoneNumberId: '', businessAccountId: '', accessToken: '', webhookVerifyToken: '', supportNumber: '', supportEmail: '', testPhone: '', active: false });

  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});
  const [syncHistory, setSyncHistory] = useState([]);
  const [syncSettings, setSyncSettings] = useState({});
  const [syncLocks, setSyncLocks] = useState({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('ecommerce');

  useEffect(() => {
    async function load() {
      try {
        const [intRes, histRes, settingsRes] = await Promise.all([
          fetch('/api/integrations'),
          fetch('/api/sync-history'),
          fetch('/api/sync-settings'),
        ]);
        const data = await intRes.json();
        const histData = await histRes.json();
        const settingsData = await settingsRes.json();

        if (data) {
          setConfig(data);
          if (data.shopify) setShopify(prev => ({ ...prev, ...data.shopify }));
          if (data.indiaPost) setIndiaPost(prev => ({ ...prev, ...data.indiaPost }));
          if (data.metaAds) setMetaAds(prev => ({ ...prev, ...data.metaAds }));
          if (data.razorpay) setRazorpay(prev => ({ ...prev, ...data.razorpay }));
          if (data.exchangeRate) setExchangeRate(prev => ({ ...prev, ...data.exchangeRate }));
          if (data.google) setGoogle(prev => ({ ...prev, ...data.google }));
          if (data.whatsapp) setWhatsapp(prev => ({ ...prev, ...data.whatsapp }));
        }
        setSyncHistory(Array.isArray(histData) ? histData : []);
        if (settingsData) {
          setSyncSettings(settingsData);
          setSyncLocks(settingsData._scheduler?.locks || {});
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, []);

  // Poll sync status every 10 seconds when any sync is running
  useEffect(() => {
    const anyRunning = Object.values(syncLocks).some(v => v);
    if (!anyRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/sync-status');
        const data = await res.json();
        setSyncLocks(data.locks || {});
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [syncLocks]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify, indiaPost, metaAds, razorpay, exchangeRate, google, whatsapp }),
      });
      toast.success('Integrations saved securely!');
    } catch (err) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const toggleSecret = (key) => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));

  const runSync = async (type, endpoint, mode = 'incremental') => {
    setSyncing(prev => ({ ...prev, [type]: true }));
    setSyncResults(prev => ({ ...prev, [type]: null }));
    try {
      const url = mode !== 'incremental' ? `${endpoint}?mode=${mode}` : endpoint;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      setSyncResults(prev => ({ ...prev, [type]: data }));
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(data.message || 'Sync completed!');
      }
      // Reload sync history and settings after each sync
      const [histRes, settingsRes] = await Promise.all([
        fetch('/api/sync-history'),
        fetch('/api/sync-settings'),
      ]);
      const histData = await histRes.json();
      const settingsData = await settingsRes.json();
      setSyncHistory(Array.isArray(histData) ? histData : []);
      if (settingsData) setSyncSettings(settingsData);
    } catch (err) {
      toast.error(`Sync failed: ${err.message}`);
      setSyncResults(prev => ({ ...prev, [type]: { error: err.message } }));
    }
    setSyncing(prev => ({ ...prev, [type]: false }));
  };

  const handleUpdateSyncSettings = useCallback(async (updates) => {
    try {
      const res = await fetch('/api/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setSyncSettings(data);
      toast.success('Auto-sync settings updated!');
    } catch (err) {
      toast.error('Failed to update sync settings');
    }
  }, []);

  const handleWebhookSecretUpdate = useCallback(async (field, value) => {
    try {
      const res = await fetch('/api/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`webhooks.${field}`]: value }),
      });
      const data = await res.json();
      setSyncSettings(data);
      toast.success('Webhook secret saved!');
    } catch (err) {
      toast.error('Failed to save webhook secret');
    }
  }, []);

  const getLastSync = (integration) => {
    const events = syncHistory.filter(h => h.integration === integration);
    return events.length > 0 ? events[0] : null;
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}</div>;

  // ==================== STATUS OVERVIEW ====================
  const statusItems = [
    { name: 'Shopify', key: 'shopify', active: shopify.active && shopify.storeUrl, icon: ShoppingBag, color: 'green' },
    { name: 'Razorpay', key: 'razorpay', active: razorpay.active && razorpay.keyId, icon: CreditCard, color: 'indigo' },
    { name: 'Meta Ads', key: 'metaAds', active: metaAds.active && metaAds.token, icon: Megaphone, color: 'blue' },
    { name: 'India Post', key: 'indiaPost', active: indiaPost.active, icon: Truck, color: 'orange' },
    { name: 'WhatsApp', key: 'whatsapp', active: whatsapp.active, icon: MessageSquare, color: 'emerald' },
  ];

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Manage integrations, auto-sync schedules, and webhook configuration.</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Credentials are stored securely. Hidden fields are preserved on save.</p>
        </div>
        <div className="flex items-center gap-2">
          {syncHistory.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setHistoryDialogOpen(true); setHistoryFilter('all'); }}>
              <History className="w-3.5 h-3.5" /> History ({syncHistory.length})
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-8">
            <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>

      {/* Connection Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {statusItems.map(i => {
          const lastSync = getLastSync(i.key);
          const autoEnabled = syncSettings?.[i.key]?.autoSyncEnabled;
          const Icon = i.icon;
          return (
            <div key={i.name} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${i.active ? 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20' : 'border-muted bg-muted/30'}`}>
              {i.active ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${i.active ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>{i.name}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {lastSync && (
                    <span className="text-[9px] text-muted-foreground">{fmtTime(lastSync.timestamp)}</span>
                  )}
                  {autoEnabled && (
                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-blue-200 text-blue-600"><Zap className="w-2 h-2 mr-0.5" />Auto</Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          {CATEGORY_CONFIG.map(cat => {
            const Icon = cat.icon;
            return (
              <TabsTrigger key={cat.id} value={cat.id} className="text-xs gap-1.5 data-[state=active]:shadow-sm">
                <Icon className="w-3.5 h-3.5" />{cat.label}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="webhooks" className="text-xs gap-1.5 data-[state=active]:shadow-sm">
            <Webhook className="w-3.5 h-3.5" />Webhooks
          </TabsTrigger>
        </TabsList>

        {/* ==================== E-COMMERCE (SHOPIFY) ==================== */}
        <TabsContent value="ecommerce" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><ShoppingBag className="w-5 h-5 text-green-600" /></div>
                  <div><CardTitle className="text-base">Shopify</CardTitle><CardDescription>Sync orders & product data from your store</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={shopify.active ? 'default' : 'secondary'} className="text-[10px]">{shopify.active ? 'Active' : 'Inactive'}</Badge>
                  <Switch checked={shopify.active} onCheckedChange={v => setShopify({...shopify, active: v})} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">Store URL</Label><Input value={shopify.storeUrl} onChange={e => setShopify({...shopify, storeUrl: e.target.value})} placeholder="mystore.myshopify.com" className="mt-1" /></div>
              <div>
                <Label className="text-xs">Access Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input type={showSecrets.shopifyToken ? 'text' : 'password'} value={shopify.accessToken} onChange={e => setShopify({...shopify, accessToken: e.target.value})} placeholder="shpat_xxxxx" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('shopifyToken')}>
                    {showSecrets.shopifyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Auto-Sync Control */}
              <AutoSyncControl
                integration="shopify"
                syncSettings={syncSettings}
                onUpdateSyncSettings={handleUpdateSyncSettings}
              />

              {/* Sync Actions */}
              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="outline" disabled={syncing.shopifyProducts}
                  onClick={() => runSync('shopifyProducts', '/api/shopify/sync-products')}>
                  {syncing.shopifyProducts ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Sync Products
                </Button>
                <Button size="sm" variant="outline" disabled={syncing.shopifyOrders || syncLocks.shopify}
                  onClick={() => runSync('shopifyOrders', '/api/shopify/sync-orders', 'incremental')}>
                  {syncing.shopifyOrders ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                  Sync Orders
                </Button>
                <Button size="sm" variant="ghost" disabled={syncing.shopifyOrdersFull || syncLocks.shopify} className="text-xs text-muted-foreground"
                  onClick={() => runSync('shopifyOrdersFull', '/api/shopify/sync-orders', 'full')}>
                  {syncing.shopifyOrdersFull ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                  Force Full Sync
                </Button>
                {syncLocks.shopify && (
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-200 text-amber-600"><Lock className="w-2.5 h-2.5 mr-0.5" />Running...</Badge>
                )}
              </div>

              {(syncResults.shopifyProducts || syncResults.shopifyOrders || syncResults.shopifyOrdersFull) && (
                <div className="text-xs p-2 rounded bg-muted space-y-1">
                  {['shopifyProducts', 'shopifyOrders', 'shopifyOrdersFull'].map(key => syncResults[key] && (
                    <div key={key} className="flex items-center gap-1.5">
                      {syncResults[key].error ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                      <span>{syncResults[key].error || syncResults[key].message}</span>
                    </div>
                  ))}
                </div>
              )}

              <SetupGuide title="How to get Shopify API credentials">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Go to your <a href="https://admin.shopify.com/store" target="_blank" rel="noopener noreferrer" className="underline font-medium">Shopify Admin</a></li>
                  <li>Navigate to <strong>Settings → Apps and sales channels → Develop apps</strong></li>
                  <li>Click <strong>Create an app</strong>, give it a name (e.g., &quot;Profit OS&quot;)</li>
                  <li>Under <strong>API credentials → Configure Admin API scopes</strong>, enable: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">read_orders, read_products, read_customers</code></li>
                  <li>Click <strong>Install app</strong> and copy the <strong>Admin API access token</strong></li>
                  <li>Your Store URL is: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">yourstore.myshopify.com</code></li>
                </ol>
              </SetupGuide>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PAYMENTS (RAZORPAY) ==================== */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><CreditCard className="w-5 h-5 text-indigo-600" /></div>
                  <div><CardTitle className="text-base">Razorpay</CardTitle><CardDescription>Reconcile exact gateway fees & track settlements</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={razorpay.active ? 'default' : 'secondary'} className="text-[10px]">{razorpay.active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">Key ID</Label><Input value={razorpay.keyId} onChange={e => setRazorpay({...razorpay, keyId: e.target.value})} placeholder="rzp_live_xxxxxxxxx" className="mt-1" /></div>
              <div>
                <Label className="text-xs">Key Secret</Label>
                <div className="flex gap-2 mt-1">
                  <Input type={showSecrets.razorpaySecret ? 'text' : 'password'} value={razorpay.keySecret} onChange={e => setRazorpay({...razorpay, keySecret: e.target.value})} placeholder="Enter Razorpay Key Secret" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('razorpaySecret')}>
                    {showSecrets.razorpaySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              <AutoSyncControl
                integration="razorpay"
                syncSettings={syncSettings}
                onUpdateSyncSettings={handleUpdateSyncSettings}
              />

              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="outline" disabled={syncing.razorpay || syncLocks.razorpay}
                  onClick={() => runSync('razorpay', '/api/razorpay/sync-payments', 'incremental')}>
                  {syncing.razorpay ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                  Sync Payments
                </Button>
                <Button size="sm" variant="ghost" disabled={syncing.razorpayFull || syncLocks.razorpay} className="text-xs text-muted-foreground"
                  onClick={() => runSync('razorpayFull', '/api/razorpay/sync-payments', 'full')}>
                  {syncing.razorpayFull ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                  Force Full Sync
                </Button>
                {syncLocks.razorpay && (
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-200 text-amber-600"><Lock className="w-2.5 h-2.5 mr-0.5" />Running...</Badge>
                )}
              </div>

              {(syncResults.razorpay || syncResults.razorpayFull) && (
                <div className="text-xs p-2 rounded bg-muted space-y-1">
                  {['razorpay', 'razorpayFull'].map(key => syncResults[key] && (
                    <div key={key} className="flex items-start gap-1.5">
                      {syncResults[key].error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                      <span>{syncResults[key].error || syncResults[key].message}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Syncing replaces the predicted 2%+GST gateway fee with exact Razorpay deductions. Auto-sync respects harmony rules — Shopify syncs first, then Razorpay.
              </p>

              <SetupGuide title="How to get Razorpay API credentials">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer" className="underline font-medium">Razorpay Dashboard → Settings → API Keys</a></li>
                  <li>If no live key exists, click <strong>Generate Key</strong></li>
                  <li>Copy the <strong>Key ID</strong> (starts with <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">rzp_live_</code>) and <strong>Key Secret</strong></li>
                  <li>Keep the Key Secret safe — it&apos;s shown only once</li>
                </ol>
              </SetupGuide>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== MARKETING (META ADS) ==================== */}
        <TabsContent value="marketing" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Megaphone className="w-5 h-5 text-blue-600" /></div>
                  <div><CardTitle className="text-base">Meta Ads</CardTitle><CardDescription>Pull daily ad spend for ROAS calculation</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={metaAds.active ? 'default' : 'secondary'} className="text-[10px]">{metaAds.active ? 'Active' : 'Inactive'}</Badge>
                  <Switch checked={metaAds.active} onCheckedChange={v => setMetaAds({...metaAds, active: v})} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Access Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input type={showSecrets.metaToken ? 'text' : 'password'} value={metaAds.token} onChange={e => setMetaAds({...metaAds, token: e.target.value})} placeholder="EAAxxxxx" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('metaToken')}>
                    {showSecrets.metaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div><Label className="text-xs">Ad Account ID</Label><Input value={metaAds.adAccountId} onChange={e => setMetaAds({...metaAds, adAccountId: e.target.value})} placeholder="act_123456789" className="mt-1" /></div>

              <Separator />

              <AutoSyncControl
                integration="metaAds"
                syncSettings={syncSettings}
                onUpdateSyncSettings={handleUpdateSyncSettings}
              />

              <div className="flex flex-wrap gap-2 items-start">
                <Button size="sm" variant="outline" disabled={syncing.metaAds}
                  onClick={() => runSync('metaAds', '/api/meta-ads/sync')}>
                  {syncing.metaAds ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Sync Ad Spend (Last 30 Days)
                </Button>
              </div>

              {syncResults.metaAds && (
                <div className="text-xs p-2 rounded bg-muted flex items-center gap-1.5">
                  {syncResults.metaAds.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  <span>{syncResults.metaAds.error || syncResults.metaAds.message}</span>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Daily ad spend is divided equally among all orders placed that day. If inactive, marketing cost = ₹0.
              </p>

              <SetupGuide title="How to get Meta Ads credentials">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://business.facebook.com/settings/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Meta Business Settings</a></li>
                  <li>Navigate to <strong>Users → System Users</strong></li>
                  <li>Create a System User with <strong>Admin</strong> access</li>
                  <li>Click <strong>Generate New Token</strong> → select <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">ads_management</code> and <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">ads_read</code> permissions</li>
                  <li>Copy the token. For the Ad Account ID, go to <a href="https://adsmanager.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Ads Manager</a> → your account ID is in the URL</li>
                </ol>
              </SetupGuide>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== SHIPPING (INDIA POST) ==================== */}
        <TabsContent value="shipping" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30"><Truck className="w-5 h-5 text-orange-600" /></div>
                  <div><CardTitle className="text-base">India Post</CardTitle><CardDescription>Shipment tracking, booking & delivery via Bulk Customer API</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={indiaPost.active ? 'default' : 'secondary'} className="text-[10px]">{indiaPost.active ? 'Active' : 'Inactive'}</Badge>
                  <Switch checked={indiaPost.active} onCheckedChange={v => setIndiaPost({...indiaPost, active: v})} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Environment Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {indiaPost.sandboxMode ? 'Sandbox Mode' : 'Production Mode'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {indiaPost.sandboxMode ? 'Using test.cept.gov.in — no real shipments' : 'Using production API — live shipments'}
                  </p>
                </div>
                <Switch checked={indiaPost.sandboxMode} onCheckedChange={v => setIndiaPost({...indiaPost, sandboxMode: v})} />
              </div>

              {/* API Credentials */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">API Credentials</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Username</Label><Input value={indiaPost.username} onChange={e => setIndiaPost({...indiaPost, username: e.target.value})} placeholder="Phone or User ID" className="mt-1" /></div>
                  <div>
                    <Label className="text-xs">Password</Label>
                    <div className="flex gap-2 mt-1">
                      <Input type={showSecrets.indiaPostPwd ? 'text' : 'password'} value={indiaPost.password} onChange={e => setIndiaPost({...indiaPost, password: e.target.value})} placeholder="API password" />
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('indiaPostPwd')}>
                        {showSecrets.indiaPostPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div><Label className="text-xs">Bulk Customer ID</Label><Input value={indiaPost.bulkCustomerId} onChange={e => setIndiaPost({...indiaPost, bulkCustomerId: e.target.value})} placeholder="e.g. 1234567890" className="mt-1" /></div>
                  <div><Label className="text-xs">Contract ID</Label><Input value={indiaPost.contractId} onChange={e => setIndiaPost({...indiaPost, contractId: e.target.value})} placeholder="e.g. CN12345678" className="mt-1" /></div>
                </div>
              </div>

              <Separator />

              {/* Sender Details - Collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-2 text-left group">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Sender Details</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Sender Name</Label><Input value={indiaPost.senderName} onChange={e => setIndiaPost({...indiaPost, senderName: e.target.value})} placeholder="Business name" className="mt-1" /></div>
                    <div><Label className="text-xs">Company Name</Label><Input value={indiaPost.senderCompany} onChange={e => setIndiaPost({...indiaPost, senderCompany: e.target.value})} placeholder="Company name" className="mt-1" /></div>
                  </div>
                  <div><Label className="text-xs">Address</Label><Input value={indiaPost.senderAddress} onChange={e => setIndiaPost({...indiaPost, senderAddress: e.target.value})} placeholder="Full address" className="mt-1" /></div>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label className="text-xs">City</Label><Input value={indiaPost.senderCity} onChange={e => setIndiaPost({...indiaPost, senderCity: e.target.value})} placeholder="City" className="mt-1" /></div>
                    <div><Label className="text-xs">State</Label><Input value={indiaPost.senderState} onChange={e => setIndiaPost({...indiaPost, senderState: e.target.value})} placeholder="State" className="mt-1" /></div>
                    <div><Label className="text-xs">Pincode</Label><Input value={indiaPost.senderPincode} onChange={e => setIndiaPost({...indiaPost, senderPincode: e.target.value})} placeholder="6 digits" maxLength={6} className="mt-1" /></div>
                    <div><Label className="text-xs">Mobile</Label><Input value={indiaPost.senderMobile} onChange={e => setIndiaPost({...indiaPost, senderMobile: e.target.value})} placeholder="10 digits" maxLength={10} className="mt-1" /></div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              <AutoSyncControl
                integration="indiaPost"
                syncSettings={syncSettings}
                onUpdateSyncSettings={handleUpdateSyncSettings}
              />

              <div className="flex flex-wrap gap-2 items-start">
                <Button size="sm" variant="outline" disabled={syncing.indiaPostTest}
                  onClick={() => runSync('indiaPostTest', '/api/indiapost/test-connection')}>
                  {syncing.indiaPostTest ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-1.5" />}
                  Test Connection
                </Button>
                <Button size="sm" variant="outline" disabled={syncing.indiaPost}
                  onClick={() => runSync('indiaPost', '/api/indiapost/sync-tracking')}>
                  {syncing.indiaPost ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Truck className="w-3.5 h-3.5 mr-1.5" />}
                  Run Bulk Tracking
                </Button>
              </div>

              {(syncResults.indiaPostTest || syncResults.indiaPost) && (
                <div className="text-xs p-2.5 rounded bg-muted space-y-1.5">
                  {syncResults.indiaPostTest && (
                    <div>
                      <div className="flex items-center gap-1.5">
                        {syncResults.indiaPostTest.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        <span>{syncResults.indiaPostTest.error || syncResults.indiaPostTest.message}</span>
                      </div>
                      {syncResults.indiaPostTest.serverIp && (
                        <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                          Server IP: <code className="bg-background px-1 py-0.5 rounded font-mono">{syncResults.indiaPostTest.serverIp}</code>
                          {syncResults.indiaPostTest.action === 'whitelist_ip' && <span className="text-amber-600 font-medium"> ← Add this IP to India Post portal</span>}
                        </p>
                      )}
                    </div>
                  )}
                  {syncResults.indiaPost && (
                    <div className="flex items-center gap-1.5">
                      {syncResults.indiaPost.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      <span>{syncResults.indiaPost.error || syncResults.indiaPost.message}</span>
                    </div>
                  )}
                </div>
              )}

              <SetupGuide title="How to set up India Post Bulk API">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Register for a <strong>Bulk Customer Account</strong> at <a href="https://cept.gov.in" target="_blank" rel="noopener noreferrer" className="underline font-medium">India Post CEPT Portal</a></li>
                  <li>After approval, you&apos;ll receive your <strong>Bulk Customer ID</strong> and <strong>Contract ID</strong></li>
                  <li>Log in to get your <strong>Username</strong> and <strong>Password</strong></li>
                  <li><strong>Important:</strong> Whitelist your server IP in the portal for API access</li>
                  <li>Register webhook URL for real-time tracking: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded break-all">{typeof window !== 'undefined' ? `${window.location.origin}/api/indiapost/webhook` : '/api/indiapost/webhook'}</code></li>
                </ol>
              </SetupGuide>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== MESSAGING (WHATSAPP) ==================== */}
        <TabsContent value="messaging" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div><CardTitle className="text-base">WhatsApp Business</CardTitle><CardDescription>Automated order notifications via WhatsApp Cloud API</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={whatsapp.active ? 'default' : 'secondary'} className="text-[10px]">{whatsapp.active ? 'Active' : 'Inactive'}</Badge>
                  <Switch checked={whatsapp.active} onCheckedChange={v => setWhatsapp({...whatsapp, active: v})} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Phone Number ID</Label><Input value={whatsapp.phoneNumberId} onChange={e => setWhatsapp({...whatsapp, phoneNumberId: e.target.value})} placeholder="e.g., 123456789012345" className="mt-1" /></div>
                <div><Label className="text-xs">Business Account ID</Label><Input value={whatsapp.businessAccountId} onChange={e => setWhatsapp({...whatsapp, businessAccountId: e.target.value})} placeholder="e.g., 123456789012345" className="mt-1" /></div>
              </div>
              <div>
                <Label className="text-xs">Permanent Access Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input type={showSecrets.waToken ? 'text' : 'password'} value={whatsapp.accessToken} onChange={e => setWhatsapp({...whatsapp, accessToken: e.target.value})} placeholder="EAAG..." />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('waToken')}>
                    {showSecrets.waToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Webhook Verify Token</Label><Input value={whatsapp.webhookVerifyToken} onChange={e => setWhatsapp({...whatsapp, webhookVerifyToken: e.target.value})} placeholder="Your custom verify token" className="mt-1" /></div>
                <div><Label className="text-xs">Test Phone Number</Label><Input value={whatsapp.testPhone} onChange={e => setWhatsapp({...whatsapp, testPhone: e.target.value})} placeholder="e.g., 919876543210" className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Support Phone</Label><Input value={whatsapp.supportNumber} onChange={e => setWhatsapp({...whatsapp, supportNumber: e.target.value})} placeholder="+91-XXXXX-XXXXX" className="mt-1" /></div>
                <div><Label className="text-xs">Support Email</Label><Input value={whatsapp.supportEmail} onChange={e => setWhatsapp({...whatsapp, supportEmail: e.target.value})} placeholder="support@yourbrand.com" className="mt-1" /></div>
              </div>

              {whatsapp.active && whatsapp.phoneNumberId && (
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={async () => {
                  try {
                    const res = await fetch('/api/whatsapp/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testPhone: whatsapp.testPhone }) });
                    const data = await res.json();
                    if (res.ok) toast.success('Test message sent! Check your WhatsApp.');
                    else toast.error(data.error || 'Test failed');
                  } catch (e) { toast.error('Connection test failed'); }
                }}>
                  Test Connection — Send Test Message
                </Button>
              )}

              <SetupGuide title="How to set up WhatsApp Cloud API">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Meta Developer Portal</a> → Create or select your app</li>
                  <li>Add the <strong>WhatsApp</strong> product to your app</li>
                  <li>In WhatsApp {'>'} API Setup, find your <strong>Phone Number ID</strong> and <strong>Business Account ID</strong></li>
                  <li>Generate a <strong>Permanent Access Token</strong> via System Users in Meta Business Settings</li>
                  <li>Set the Webhook URL to: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded break-all">{typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp'}</code></li>
                  <li>Use the Webhook Verify Token you set above when configuring the webhook in Meta</li>
                </ol>
              </SetupGuide>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== AUTH (GOOGLE) ==================== */}
        <TabsContent value="auth" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  </div>
                  <div><CardTitle className="text-base">Google OAuth</CardTitle><CardDescription>Enable &quot;Sign in with Google&quot; for your team</CardDescription></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={google.active ? 'default' : 'secondary'} className="text-[10px]">{google.active ? 'Active' : 'Inactive'}</Badge>
                  <Switch checked={google.active} onCheckedChange={v => setGoogle({...google, active: v})} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">Client ID</Label><Input value={google.clientId} onChange={e => setGoogle({...google, clientId: e.target.value})} placeholder="xxxx.apps.googleusercontent.com" className="mt-1" /></div>
              <div>
                <Label className="text-xs">Client Secret</Label>
                <div className="flex gap-2 mt-1">
                  <Input type={showSecrets.googleSecret ? 'text' : 'password'} value={google.clientSecret} onChange={e => setGoogle({...google, clientSecret: e.target.value})} placeholder="GOCSPX-xxxxx" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('googleSecret')}>
                    {showSecrets.googleSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <SetupGuide title="How to set up Google OAuth">
                <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud Console → Credentials</a></li>
                  <li>Create an OAuth 2.0 Client ID (Web application)</li>
                  <li>Add Authorized redirect URI: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded break-all">{typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback/google` : '/api/auth/callback/google'}</code></li>
                  <li>Copy the Client ID and Client Secret here</li>
                </ol>
              </SetupGuide>

              <p className="text-[11px] text-muted-foreground">
                Once configured and saved, the &quot;Sign in with Google&quot; button will appear on the login page.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== WEBHOOKS TAB ==================== */}
        <TabsContent value="webhooks" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Webhook className="w-5 h-5 text-violet-600" /></div>
                <div>
                  <CardTitle className="text-base">Webhook Configuration</CardTitle>
                  <CardDescription>Real-time data updates via webhook listeners. These supplement scheduled syncs to catch events instantly.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Shopify Webhook */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Shopify Webhooks</span>
                  <Badge variant="outline" className="text-[9px] h-4">orders/create, orders/updated, orders/cancelled</Badge>
                </div>
                <div>
                  <Label className="text-xs">Webhook URL (register this in Shopify)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/shopify` : '/api/webhooks/shopify'} className="font-mono text-xs bg-muted/50" />
                    <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/shopify`); toast.success('Copied!'); }}>Copy</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">HMAC Secret (from Shopify webhook settings)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type={showSecrets.shopifyWebhookSecret ? 'text' : 'password'}
                      value={syncSettings?.webhooks?.shopifySecret || ''}
                      onChange={e => setSyncSettings(prev => ({ ...prev, webhooks: { ...prev.webhooks, shopifySecret: e.target.value } }))}
                      placeholder="Shopify webhook signing secret"
                    />
                    <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('shopifyWebhookSecret')}>
                      {showSecrets.shopifyWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => handleWebhookSecretUpdate('shopifySecret', syncSettings?.webhooks?.shopifySecret || '')}>Save</Button>
                  </div>
                </div>

                <SetupGuide title="How to register Shopify webhooks">
                  <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                    <li>Go to your Shopify Admin → <strong>Settings → Notifications → Webhooks</strong></li>
                    <li>Click <strong>Create webhook</strong></li>
                    <li>Select events: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Order creation</code>, <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Order update</code>, <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Order cancellation</code></li>
                    <li>Paste the Webhook URL above and select <strong>JSON</strong> format</li>
                    <li>Copy the <strong>Signing Secret</strong> shown at the bottom and paste it above</li>
                  </ol>
                </SetupGuide>
              </div>

              {/* Razorpay Webhook */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-medium">Razorpay Webhooks</span>
                  <Badge variant="outline" className="text-[9px] h-4">payment.captured, payment.failed</Badge>
                </div>
                <div>
                  <Label className="text-xs">Webhook URL (register this in Razorpay)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/razorpay` : '/api/webhooks/razorpay'} className="font-mono text-xs bg-muted/50" />
                    <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/razorpay`); toast.success('Copied!'); }}>Copy</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Webhook Secret (from Razorpay dashboard)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type={showSecrets.razorpayWebhookSecret ? 'text' : 'password'}
                      value={syncSettings?.webhooks?.razorpaySecret || ''}
                      onChange={e => setSyncSettings(prev => ({ ...prev, webhooks: { ...prev.webhooks, razorpaySecret: e.target.value } }))}
                      placeholder="Razorpay webhook secret"
                    />
                    <Button variant="outline" size="icon" className="shrink-0" onClick={() => toggleSecret('razorpayWebhookSecret')}>
                      {showSecrets.razorpayWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => handleWebhookSecretUpdate('razorpaySecret', syncSettings?.webhooks?.razorpaySecret || '')}>Save</Button>
                  </div>
                </div>

                <SetupGuide title="How to register Razorpay webhooks">
                  <ol className="text-[11px] text-blue-600 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                    <li>Go to <a href="https://dashboard.razorpay.com/app/webhooks" target="_blank" rel="noopener noreferrer" className="underline font-medium">Razorpay Dashboard → Settings → Webhooks</a></li>
                    <li>Click <strong>Add New Webhook</strong></li>
                    <li>Paste the Webhook URL above</li>
                    <li>Select events: <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">payment.captured</code>, <code className="text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1 rounded">payment.failed</code></li>
                    <li>Create a <strong>Secret</strong> and paste it above</li>
                  </ol>
                </SetupGuide>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Webhooks provide real-time updates when events happen (new order, payment captured, etc.). They supplement — not replace — scheduled syncs. Scheduled syncs catch any events that webhooks might miss.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== SYNC HISTORY DIALOG ==================== */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg max-h-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Sync History</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {['all', 'shopify', 'razorpay', 'metaAds', 'indiaPost'].map(f => (
              <Button key={f} size="sm" variant={historyFilter === f ? 'default' : 'outline'} className="h-7 text-xs"
                onClick={() => setHistoryFilter(f)}>
                {f === 'all' ? 'All' : f === 'metaAds' ? 'Meta Ads' : f === 'indiaPost' ? 'India Post' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <div className="overflow-y-auto max-h-[400px] space-y-2">
            {syncHistory
              .filter(h => historyFilter === 'all' || h.integration === historyFilter)
              .map(h => (
              <div key={h._id} className={`flex items-start gap-3 p-3 rounded-lg border ${h.status === 'success' ? 'border-green-100 bg-green-50/50' : h.status === 'error' ? 'border-red-100 bg-red-50/50' : 'border-amber-100 bg-amber-50/50'}`}>
                {h.status === 'success' ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> :
                 h.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" /> :
                 <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {h.integration === 'metaAds' ? 'Meta Ads' : h.integration === 'indiaPost' ? 'India Post' : h.integration?.charAt(0).toUpperCase() + h.integration?.slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{h.action}</span>
                    {h.details?.trigger === 'auto' && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1"><Zap className="w-2 h-2 mr-0.5" />Auto</Badge>
                    )}
                    {h.details?.syncType === 'incremental' && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">Incremental</Badge>
                    )}
                    {h.action === 'webhook' && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1"><Webhook className="w-2 h-2 mr-0.5" />Webhook</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {h.details?.error || (
                      h.integration === 'shopify' ? `${h.details?.synced ?? 0} synced, ${h.details?.updated ?? 0} updated` :
                      h.integration === 'razorpay' ? `${h.details?.matched ?? 0} orders reconciled` :
                      h.integration === 'metaAds' ? `${h.details?.synced ?? 0} days synced` :
                      h.integration === 'indiaPost' ? `${h.details?.tracked ?? 0} tracked, ${h.details?.delivered ?? 0} delivered` :
                      JSON.stringify(h.details || {}).slice(0, 100)
                    )}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtTime(h.timestamp)}</span>
              </div>
            ))}
            {syncHistory.filter(h => historyFilter === 'all' || h.integration === historyFilter).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No sync history yet. Run a sync to get started.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
