'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShoppingBag, Truck, Megaphone, RefreshCw, Save, Eye, EyeOff, Globe, Loader2, CheckCircle, AlertCircle, CreditCard, Clock, History } from 'lucide-react';
import { toast } from 'sonner';

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
  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});
  const [syncHistory, setSyncHistory] = useState([]);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const [intRes, histRes] = await Promise.all([
          fetch('/api/integrations'),
          fetch('/api/sync-history'),
        ]);
        const data = await intRes.json();
        const histData = await histRes.json();
        if (data) {
          setConfig(data);
          if (data.shopify) setShopify(prev => ({ ...prev, ...data.shopify }));
          if (data.indiaPost) setIndiaPost(prev => ({ ...prev, ...data.indiaPost }));
          if (data.metaAds) setMetaAds(prev => ({ ...prev, ...data.metaAds }));
          if (data.razorpay) setRazorpay(prev => ({ ...prev, ...data.razorpay }));
          if (data.exchangeRate) setExchangeRate(prev => ({ ...prev, ...data.exchangeRate }));
        }
        setSyncHistory(Array.isArray(histData) ? histData : []);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify, indiaPost, metaAds, razorpay, exchangeRate }),
      });
      toast.success('Integrations saved securely!');
    } catch (err) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const toggleSecret = (key) => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));

  const runSync = async (type, endpoint) => {
    setSyncing(prev => ({ ...prev, [type]: true }));
    setSyncResults(prev => ({ ...prev, [type]: null }));
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      setSyncResults(prev => ({ ...prev, [type]: data }));
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(data.message || 'Sync completed!');
      }
      // Reload sync history after each sync
      const histRes = await fetch('/api/sync-history');
      const histData = await histRes.json();
      setSyncHistory(Array.isArray(histData) ? histData : []);
    } catch (err) {
      toast.error(`Sync failed: ${err.message}`);
      setSyncResults(prev => ({ ...prev, [type]: { error: err.message } }));
    }
    setSyncing(prev => ({ ...prev, [type]: false }));
  };

  // Helper: get last sync time for an integration
  const getLastSync = (integration) => {
    const events = syncHistory.filter(h => h.integration === integration);
    return events.length > 0 ? events[0] : null;
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Securely store your API credentials. They are saved to your database and never hardcoded.</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Only modified fields are saved — hidden credentials are preserved safely.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

      {/* Connection Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { name: 'Shopify', key: 'shopify', active: shopify.active && shopify.storeUrl, desc: shopify.active ? 'Orders & products synced' : 'Connect to sync orders' },
          { name: 'Razorpay', key: 'razorpay', active: razorpay.active && razorpay.keyId, desc: razorpay.active ? 'Payment fees reconciled' : 'Connect for exact gateway fees' },
          { name: 'Meta Ads', key: 'metaAds', active: metaAds.active && metaAds.token, desc: metaAds.active ? 'Ad spend tracked' : 'Connect for ad spend tracking' },
          { name: 'India Post', key: 'indiaPost', active: indiaPost.active, desc: indiaPost.active ? 'RTO tracking enabled' : 'Connect for shipment tracking' },
        ].map(i => {
          const lastSync = getLastSync(i.key);
          return (
            <div key={i.name} className={`flex items-center gap-2.5 p-3 rounded-lg border ${i.active ? 'border-green-200 bg-green-50' : 'border-muted bg-muted/30'}`}>
              {i.active ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${i.active ? 'text-green-700' : 'text-muted-foreground'}`}>{i.name}</p>
                <p className="text-[10px] text-muted-foreground">{i.desc}</p>
                {lastSync && (
                  <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" /> Last sync: {fmtTime(lastSync.timestamp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync History Button */}
      {syncHistory.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setHistoryDialogOpen(true); setHistoryFilter('all'); }}>
            <History className="w-3.5 h-3.5" /> Sync History ({syncHistory.length})
          </Button>
        </div>
      )}

      {/* Shopify */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><ShoppingBag className="w-5 h-5 text-green-600" /></div>
              <div><CardTitle className="text-base">Shopify</CardTitle><CardDescription>Sync orders and product data</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={shopify.active ? 'default' : 'secondary'}>{shopify.active ? 'Active' : 'Inactive'}</Badge>
              <Switch checked={shopify.active} onCheckedChange={v => setShopify({...shopify, active: v})} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Store URL</Label><Input value={shopify.storeUrl} onChange={e => setShopify({...shopify, storeUrl: e.target.value})} placeholder="mystore.myshopify.com" /></div>
          <div>
            <Label>Access Token</Label>
            <div className="flex gap-2">
              <Input type={showSecrets.shopifyToken ? 'text' : 'password'} value={shopify.accessToken} onChange={e => setShopify({...shopify, accessToken: e.target.value})} placeholder="shpat_xxxxx" />
              <Button variant="outline" size="icon" onClick={() => toggleSecret('shopifyToken')}>
                {showSecrets.shopifyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" variant="outline" disabled={syncing.shopifyProducts}
              onClick={() => runSync('shopifyProducts', '/api/shopify/sync-products')}>
              {syncing.shopifyProducts ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Sync Products / SKUs
            </Button>
            <Button size="sm" variant="outline" disabled={syncing.shopifyOrders}
              onClick={() => runSync('shopifyOrders', '/api/shopify/sync-orders')}>
              {syncing.shopifyOrders ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Sync Orders
            </Button>
          </div>
          {(syncResults.shopifyProducts || syncResults.shopifyOrders) && (
            <div className="text-xs p-2 rounded bg-muted space-y-1">
              {syncResults.shopifyProducts && (
                <div className="flex items-center gap-1.5">
                  {syncResults.shopifyProducts.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  <span>{syncResults.shopifyProducts.error || syncResults.shopifyProducts.message}</span>
                </div>
              )}
              {syncResults.shopifyOrders && (
                <div className="flex items-center gap-1.5">
                  {syncResults.shopifyOrders.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  <span>{syncResults.shopifyOrders.error || syncResults.shopifyOrders.message}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* India Post */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30"><Truck className="w-5 h-5 text-orange-600" /></div>
              <div><CardTitle className="text-base">India Post</CardTitle><CardDescription>Shipment tracking, booking & delivery via Bulk Customer API</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={indiaPost.active ? 'default' : 'secondary'}>{indiaPost.active ? 'Active' : 'Inactive'}</Badge>
              <Switch checked={indiaPost.active} onCheckedChange={v => setIndiaPost({...indiaPost, active: v})} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Environment Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {indiaPost.sandboxMode ? '🧪 Sandbox Mode' : '🚀 Production Mode'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {indiaPost.sandboxMode ? 'Using test.cept.gov.in — no real shipments' : 'Using production API — live shipments'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{indiaPost.sandboxMode ? 'Sandbox' : 'Production'}</span>
              <Switch checked={indiaPost.sandboxMode} onCheckedChange={v => setIndiaPost({...indiaPost, sandboxMode: v})} />
            </div>
          </div>

          {/* API Credentials */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">API Credentials</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Username</Label>
                <Input value={indiaPost.username} onChange={e => setIndiaPost({...indiaPost, username: e.target.value})} placeholder="Phone number or User ID" className="mt-1" />
              </div>
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
              <div>
                <Label className="text-xs">Bulk Customer ID</Label>
                <Input value={indiaPost.bulkCustomerId} onChange={e => setIndiaPost({...indiaPost, bulkCustomerId: e.target.value})} placeholder="e.g. 1234567890" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Contract ID</Label>
                <Input value={indiaPost.contractId} onChange={e => setIndiaPost({...indiaPost, contractId: e.target.value})} placeholder="e.g. CN12345678" className="mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Sender Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Default Sender Details</p>
            <p className="text-[10px] text-muted-foreground mb-2">Used as the default sender address when booking shipments</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Sender Name</Label>
                <Input value={indiaPost.senderName} onChange={e => setIndiaPost({...indiaPost, senderName: e.target.value})} placeholder="Business or person name" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input value={indiaPost.senderCompany} onChange={e => setIndiaPost({...indiaPost, senderCompany: e.target.value})} placeholder="Company name" className="mt-1" />
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Address</Label>
              <Input value={indiaPost.senderAddress} onChange={e => setIndiaPost({...indiaPost, senderAddress: e.target.value})} placeholder="Full address line" className="mt-1" />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={indiaPost.senderCity} onChange={e => setIndiaPost({...indiaPost, senderCity: e.target.value})} placeholder="City" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input value={indiaPost.senderState} onChange={e => setIndiaPost({...indiaPost, senderState: e.target.value})} placeholder="State" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Pincode</Label>
                <Input value={indiaPost.senderPincode} onChange={e => setIndiaPost({...indiaPost, senderPincode: e.target.value})} placeholder="6 digits" maxLength={6} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Mobile</Label>
                <Input value={indiaPost.senderMobile} onChange={e => setIndiaPost({...indiaPost, senderMobile: e.target.value})} placeholder="10 digits" maxLength={10} className="mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Webhook URL */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Webhook</p>
            <p className="text-[10px] text-muted-foreground mb-2">
              Register this URL in India Post's portal to receive real-time tracking updates
            </p>
            <div className="flex gap-2">
              <Input
                value={indiaPost.webhookUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/indiapost/webhook` : '')}
                readOnly
                className="font-mono text-xs bg-muted/50"
              />
              <Button variant="outline" size="sm" className="shrink-0 text-xs"
                onClick={() => {
                  const url = indiaPost.webhookUrl || `${window.location.origin}/api/indiapost/webhook`;
                  navigator.clipboard.writeText(url);
                  toast.success('Webhook URL copied!');
                }}>
                Copy
              </Button>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 items-start">
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
            {config?.indiaPost?.lastSyncAt && (
              <span className="text-[11px] text-muted-foreground self-center">
                Last synced: {new Date(config.indiaPost.lastSyncAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
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
                      {syncResults.indiaPostTest.action === 'whitelist_ip' && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium"> ← Add this IP to India Post portal</span>
                      )}
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
          <p className="text-[11px] text-muted-foreground">
            Test Connection validates your credentials against the India Post API. Bulk Tracking scans all orders with tracking numbers and updates their delivery status.
          </p>
        </CardContent>
      </Card>

      {/* Meta Ads */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Megaphone className="w-5 h-5 text-blue-600" /></div>
              <div><CardTitle className="text-base">Meta Ads</CardTitle><CardDescription>Pull daily ad spend for ROAS calculation</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={metaAds.active ? 'default' : 'secondary'}>{metaAds.active ? 'Active' : 'Inactive'}</Badge>
              <Switch checked={metaAds.active} onCheckedChange={v => setMetaAds({...metaAds, active: v})} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Access Token</Label>
            <div className="flex gap-2">
              <Input type={showSecrets.metaToken ? 'text' : 'password'} value={metaAds.token} onChange={e => setMetaAds({...metaAds, token: e.target.value})} placeholder="EAAxxxxx" />
              <Button variant="outline" size="icon" onClick={() => toggleSecret('metaToken')}>
                {showSecrets.metaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div><Label>Ad Account ID</Label><Input value={metaAds.adAccountId} onChange={e => setMetaAds({...metaAds, adAccountId: e.target.value})} placeholder="act_123456789" /></div>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2 items-start">
            <Button size="sm" variant="outline" disabled={syncing.metaAds}
              onClick={() => runSync('metaAds', '/api/meta-ads/sync')}>
              {syncing.metaAds ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Sync Ad Spend (Last 30 Days)
            </Button>
            {metaAds.lastSyncAt && (
              <span className="text-[11px] text-muted-foreground self-center">
                Last synced: {new Date(metaAds.lastSyncAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>
          {syncResults.metaAds && (
            <div className="text-xs p-2 rounded bg-muted flex items-center gap-1.5">
              {syncResults.metaAds.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              <span>{syncResults.metaAds.error || syncResults.metaAds.message}</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            When active, daily ad spend is divided equally among all orders placed that day. If inactive, marketing cost = ₹0 for all orders.
          </p>
        </CardContent>
      </Card>

      {/* Razorpay */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><CreditCard className="w-5 h-5 text-indigo-600" /></div>
              <div><CardTitle className="text-base">Razorpay</CardTitle><CardDescription>Reconcile exact gateway fees & track settlements</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={razorpay.active ? 'default' : 'secondary'}>{razorpay.active ? 'Active' : 'Inactive'}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Key ID</Label>
            <Input value={razorpay.keyId} onChange={e => setRazorpay({...razorpay, keyId: e.target.value})} placeholder="rzp_live_xxxxxxxxx" />
          </div>
          <div>
            <Label>Key Secret</Label>
            <div className="flex gap-2">
              <Input type={showSecrets.razorpaySecret ? 'text' : 'password'} value={razorpay.keySecret} onChange={e => setRazorpay({...razorpay, keySecret: e.target.value})} placeholder="Enter Razorpay Key Secret" />
              <Button variant="outline" size="icon" onClick={() => toggleSecret('razorpaySecret')}>
                {showSecrets.razorpaySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2 items-start">
            <Button size="sm" variant="outline" disabled={syncing.razorpay}
              onClick={() => runSync('razorpay', '/api/razorpay/sync-payments')}>
              {syncing.razorpay ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Sync Payments & Reconcile Fees
            </Button>
            {razorpay.lastSyncAt && (
              <span className="text-[11px] text-muted-foreground self-center">
                Last synced: {new Date(razorpay.lastSyncAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                {razorpay.matchedOrders > 0 && ` · ${razorpay.matchedOrders} matched`}
              </span>
            )}
          </div>
          {syncResults.razorpay && (
            <div className="text-xs p-2 rounded bg-muted flex items-start gap-1.5">
              {syncResults.razorpay.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
              <span>{syncResults.razorpay.error || syncResults.razorpay.message}</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Syncing replaces the predicted 2%+GST gateway fee with exact Razorpay deductions. Orders not matched to Razorpay are marked as COD (₹0 gateway fee).
          </p>
        </CardContent>
      </Card>

      {/* Exchange Rate */}

      {/* Sync History Dialog */}
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
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {h.integration === 'metaAds' ? 'Meta Ads' : h.integration === 'indiaPost' ? 'India Post' : h.integration?.charAt(0).toUpperCase() + h.integration?.slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{h.action}</span>
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
