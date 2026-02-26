'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ShoppingBag, Truck, Megaphone, RefreshCw, Save, Eye, EyeOff, Globe, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationsView() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const [shopify, setShopify] = useState({ storeUrl: '', accessToken: '', active: false });
  const [indiaPost, setIndiaPost] = useState({ username: '', password: '', clientId: '', active: false, sandboxMode: true });
  const [metaAds, setMetaAds] = useState({ token: '', adAccountId: '', active: false });
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
        body: JSON.stringify({ shopify, indiaPost, metaAds, exchangeRate }),
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
          <div>
            <Button size="sm" variant="outline" disabled={syncing.indiaPost}
              onClick={() => runSync('indiaPost', '/api/indiapost/track-bulk')}>
              {syncing.indiaPost ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Truck className="w-3.5 h-3.5 mr-1.5" />}
              Run Bulk Tracking Now
            </Button>
          </div>
          {syncResults.indiaPost && (
            <div className="text-xs p-2 rounded bg-muted flex items-center gap-1.5">
              {syncResults.indiaPost.error ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{syncResults.indiaPost.error || syncResults.indiaPost.message}</span>
            </div>
          )}
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
          <div><Label>Ad Account ID</Label><Input value={metaAds.adAccountId} onChange={e => setMetaAds({...metaAds, adAccountId: e.target.value})} placeholder="act_123456" /></div>
        </CardContent>
      </Card>

      {/* Exchange Rate */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30"><Globe className="w-5 h-5 text-teal-600" /></div>
              <div><CardTitle className="text-base">Exchange Rate API</CardTitle><CardDescription>USD/INR conversion for international costs</CardDescription></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={exchangeRate.active ? 'default' : 'secondary'}>{exchangeRate.active ? 'Active' : 'Inactive'}</Badge>
              <Switch checked={exchangeRate.active} onCheckedChange={v => setExchangeRate({...exchangeRate, active: v})} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input type={showSecrets.exchangeKey ? 'text' : 'password'} value={exchangeRate.apiKey} onChange={e => setExchangeRate({...exchangeRate, apiKey: e.target.value})} placeholder="Your API key from exchangerate-api.com" />
              <Button variant="outline" size="icon" onClick={() => toggleSecret('exchangeKey')}>
                {showSecrets.exchangeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
