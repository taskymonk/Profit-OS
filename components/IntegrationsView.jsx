'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ShoppingBag, Truck, Megaphone, RefreshCw, Save, Eye, EyeOff, Globe, Loader2, CheckCircle, AlertCircle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationsView() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const [shopify, setShopify] = useState({ storeUrl: '', accessToken: '', active: false });
  const [indiaPost, setIndiaPost] = useState({ username: '', password: '', clientId: '', active: false, sandboxMode: true });
  const [metaAds, setMetaAds] = useState({ token: '', adAccountId: '', active: false });
  const [razorpay, setRazorpay] = useState({ keyId: '', keySecret: '', active: false });
  const [exchangeRate, setExchangeRate] = useState({ apiKey: '', active: false });
  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/integrations');
        const data = await res.json();
        if (data) {
          setConfig(data);
          if (data.shopify) setShopify(prev => ({ ...prev, ...data.shopify }));
          if (data.indiaPost) setIndiaPost(prev => ({ ...prev, ...data.indiaPost }));
          if (data.metaAds) setMetaAds(prev => ({ ...prev, ...data.metaAds }));
          if (data.razorpay) setRazorpay(prev => ({ ...prev, ...data.razorpay }));
          if (data.exchangeRate) setExchangeRate(prev => ({ ...prev, ...data.exchangeRate }));
        }
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
    } catch (err) {
      toast.error(`Sync failed: ${err.message}`);
      setSyncResults(prev => ({ ...prev, [type]: { error: err.message } }));
    }
    setSyncing(prev => ({ ...prev, [type]: false }));
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Securely store your API credentials. They are saved to your database and never hardcoded.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

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

      {/* Shopify Bills Import */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><FileSpreadsheet className="w-5 h-5 text-green-600" /></div>
              <div>
                <CardTitle className="text-base">Shopify Bills</CardTitle>
                <CardDescription>Import charges export CSV for accurate Shopify fees in your P&L</CardDescription>
              </div>
            </div>
            {shopifyBills && <Badge variant="default">{shopifyBills.totalCharges} charges imported</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Upload Charges Export CSV</Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Go to Shopify Admin → Settings → Billing → Export charges → Upload the CSV here
            </p>
            <div className="flex gap-2">
              <Input
                type="file"
                accept=".csv"
                className="file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImportingBills(true);
                  try {
                    const text = await file.text();
                    const res = await fetch('/api/shopify-bills/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ csvText: text }),
                    });
                    const data = await res.json();
                    if (data.error) {
                      toast.error(data.error);
                    } else {
                      toast.success(data.message);
                      // Refresh bills status
                      const billsRes = await fetch('/api/shopify-bills');
                      const billsData = await billsRes.json();
                      if (billsData && billsData.imported) setShopifyBills(billsData);
                    }
                  } catch (err) {
                    toast.error('Failed to import: ' + err.message);
                  }
                  setImportingBills(false);
                }}
                disabled={importingBills}
              />
              {importingBills && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground self-center" />}
            </div>
          </div>
          {shopifyBills && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium">{shopifyBills.totalCharges} charges across {shopifyBills.totalBills} bills imported</span>
              </div>
              {shopifyBills.summary && Object.entries(shopifyBills.summary).map(([cat, data]) => (
                <div key={cat} className="flex items-center justify-between text-xs pl-5">
                  <span className="text-muted-foreground capitalize">{cat.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{data.count} entries · ₹{data.total.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              ))}
              {shopifyBills.lastImportedAt && (
                <p className="text-[10px] text-muted-foreground pl-5">
                  Last imported: {new Date(shopifyBills.lastImportedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
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
              <div><CardTitle className="text-base">India Post</CardTitle><CardDescription>RTO & delivery tracking via bulk API</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={indiaPost.active ? 'default' : 'secondary'}>{indiaPost.active ? 'Active' : 'Inactive'}</Badge>
              <Switch checked={indiaPost.active} onCheckedChange={v => setIndiaPost({...indiaPost, active: v})} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
            <span>Sandbox: test.cept.gov.in | Prod: Separate credentials required</span>
            <Switch checked={indiaPost.sandboxMode} onCheckedChange={v => setIndiaPost({...indiaPost, sandboxMode: v})} />
            <span>{indiaPost.sandboxMode ? 'Sandbox' : 'Production'}</span>
          </div>
          <div><Label>Username / Client ID</Label><Input value={indiaPost.username} onChange={e => setIndiaPost({...indiaPost, username: e.target.value})} /></div>
          <div>
            <Label>Password</Label>
            <div className="flex gap-2">
              <Input type={showSecrets.indiaPostPwd ? 'text' : 'password'} value={indiaPost.password} onChange={e => setIndiaPost({...indiaPost, password: e.target.value})} />
              <Button variant="outline" size="icon" onClick={() => toggleSecret('indiaPostPwd')}>
                {showSecrets.indiaPostPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-2 items-start">
            <Button size="sm" variant="outline" disabled={syncing.indiaPost}
              onClick={() => runSync('indiaPost', '/api/indiapost/sync-tracking')}>
              {syncing.indiaPost ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Truck className="w-3.5 h-3.5 mr-1.5" />}
              Run Bulk Tracking Now
            </Button>
            {config?.indiaPost?.lastSyncAt && (
              <span className="text-[11px] text-muted-foreground self-center">
                Last synced: {new Date(config.indiaPost.lastSyncAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>
          {syncResults.indiaPost && (
            <div className="text-xs p-2 rounded bg-muted flex items-center gap-1.5">
              {syncResults.indiaPost.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              <span>{syncResults.indiaPost.error || syncResults.indiaPost.message}</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Scans all "In Transit" orders with tracking numbers. Updates status to Delivered or RTO based on India Post events.
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
    </div>
  );
}
