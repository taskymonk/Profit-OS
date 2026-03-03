'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Building2, Palette, Trash2, AlertTriangle, Loader2, CheckCircle2, AlertCircle, Globe, DollarSign, Settings2, ToggleLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function SettingsView() {
  const [config, setConfig] = useState({
    tenantName: '', logo: '', primaryColor: '#059669', themePreference: 'system',
    baseCurrency: 'INR', supportedCurrencies: ['INR', 'USD'], timezone: 'Asia/Kolkata',
    gstRate: 18, shopifyTxnFeeRate: 2, adSpendTaxRate: 18, allowEmployeeTracking: true,
    integrations: { shopifyActive: false, indiaPostActive: false, metaAdsActive: false },
  });
  const [saving, setSaving] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [purgeType, setPurgeType] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tenant-config');
        const data = await res.json();
        if (data && data.tenantName) setConfig(prev => ({ ...prev, ...data }));
      } catch (err) { console.error(err); }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Remove maxOrdersPerMonth from config before saving
      const saveData = { ...config };
      delete saveData.maxOrdersPerMonth;
      await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData),
      });
      toast.success('Settings saved!');
    } catch (err) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const purgeOptions = [
    { value: 'all', label: 'Everything', desc: 'Orders, Inventory, Expenses, Recipes, Templates, Stock Batches, Marketing Data', color: 'text-red-600' },
    { value: 'orders', label: 'Orders Only', desc: 'All synced & manual orders', color: 'text-orange-600' },
    { value: 'inventory', label: 'Inventory & Stock', desc: 'Inventory items, categories, FIFO stock batches, consumption records', color: 'text-orange-600' },
    { value: 'expenses', label: 'Expenses & Marketing', desc: 'Overhead expenses, expense categories, daily ad spend data', color: 'text-orange-600' },
    { value: 'recipes', label: 'Recipes & Templates', desc: 'SKU recipes and recipe templates', color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-6 max-w-[800px] mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Configure your dashboard settings and preferences</p>
        <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Settings'}</Button>
      </div>

      {/* Setup Checklist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'GST Rate', done: config.gstRate > 0, value: `${config.gstRate || 0}%` },
          { label: 'Shopify Txn Fee', done: (config.shopifyTxnFeeRate || 0) > 0, value: `${config.shopifyTxnFeeRate || 0}%` },
          { label: 'Ad Spend Tax', done: (config.adSpendTaxRate || 0) > 0, value: `${config.adSpendTaxRate || 0}%` },
          { label: 'Business Name', done: config.tenantName && config.tenantName !== 'My Business', value: config.tenantName || 'Not set' },
        ].map((item, i) => (
          <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${item.done ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            {item.done ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            <div>
              <p className="font-medium">{item.label}</p>
              <p className="text-muted-foreground">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Brand & Identity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Building2 className="w-4 h-4 text-primary" /></div>
            <div><CardTitle className="text-base">Brand & Identity</CardTitle><CardDescription>Customize your dashboard branding</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Business Name</Label><Input value={config.tenantName} onChange={e => setConfig({...config, tenantName: e.target.value})} /></div>
          <div>
            <Label>Logo</Label>
            <div className="flex items-start gap-4 mt-1.5">
              {/* Logo Preview */}
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                {config.logo ? (
                  <img src={config.logo} alt="Logo" className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center text-muted-foreground ${config.logo ? 'hidden' : ''}`}>
                  <Building2 className="w-8 h-8" />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {/* Upload Button */}
                <div>
                  <input type="file" accept="image/*" className="hidden" id="logo-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500 * 1024) { toast.error('Logo must be under 500KB'); return; }
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const base64 = ev.target.result;
                        try {
                          const res = await fetch('/api/upload-logo', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageData: base64, fileName: file.name }),
                          });
                          const data = await res.json();
                          if (data.logo) {
                            setConfig(prev => ({ ...prev, logo: data.logo }));
                            toast.success('Logo uploaded!');
                          } else {
                            toast.error(data.error || 'Upload failed');
                          }
                        } catch (err) { toast.error('Upload failed'); }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => document.getElementById('logo-upload').click()}>
                    <Building2 className="w-3.5 h-3.5 mr-1.5" /> Upload Logo
                  </Button>
                  <span className="text-[10px] text-muted-foreground ml-2">Max 500KB, PNG/JPG/SVG</span>
                </div>
                {/* Or paste URL */}
                <div>
                  <Input value={config.logo?.startsWith('data:') ? '' : (config.logo || '')} placeholder="Or paste logo URL..."
                    onChange={e => setConfig({...config, logo: e.target.value})}
                    className="h-8 text-xs" />
                </div>
                {config.logo && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setConfig({...config, logo: ''})}>
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Primary Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="w-10 h-10 rounded cursor-pointer border" />
                <Input value={config.primaryColor} onChange={e => setConfig({...config, primaryColor: e.target.value})} className="flex-1" />
              </div>
            </div>
            <div>
              <Label>Theme Preference</Label>
              <Select value={config.themePreference} onValueChange={v => setConfig({...config, themePreference: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Fees */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><DollarSign className="w-4 h-4 text-emerald-700" /></div>
            <div><CardTitle className="text-base">Tax & Fees</CardTitle><CardDescription>Configure tax rates and transaction fee percentages</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>GST Rate (%)</Label>
              <Input type="number" value={config.gstRate} onChange={e => setConfig({...config, gstRate: Number(e.target.value)})} />
              <p className="text-[11px] text-muted-foreground mt-1">Applied to relevant expenses and deductions</p>
            </div>
            <div>
              <Label>Shopify Txn Fee Rate (%)</Label>
              <Input type="number" step="0.1" value={config.shopifyTxnFeeRate} onChange={e => setConfig({...config, shopifyTxnFeeRate: Number(e.target.value)})} />
              <p className="text-[11px] text-muted-foreground mt-1">Basic=2%, Shopify=1%, Advanced=0.5%</p>
            </div>
            <div>
              <Label>Ad Spend Tax Rate (%)</Label>
              <Input type="number" value={config.adSpendTaxRate ?? 18} onChange={e => setConfig({...config, adSpendTaxRate: Number(e.target.value)})} />
              <p className="text-[11px] text-muted-foreground mt-1">Meta charges auction price + GST (18% for India)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Localization */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><Globe className="w-4 h-4 text-blue-700" /></div>
            <div><CardTitle className="text-base">Localization</CardTitle><CardDescription>Currency, timezone, and regional settings</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Base Currency</Label>
              <Select value={config.baseCurrency} onValueChange={v => setConfig({...config, baseCurrency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR (Indian Rupee)</SelectItem>
                  <SelectItem value="USD">USD (US Dollar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Timezone</Label>
              <Select value={config.timezone} onValueChange={v => setConfig({...config, timezone: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100"><ToggleLeft className="w-4 h-4 text-purple-700" /></div>
            <div><CardTitle className="text-base">Feature Toggles</CardTitle><CardDescription>Enable or disable optional features</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><Label>Employee Tracking</Label><p className="text-xs text-muted-foreground">Track employee shifts and daily output</p></div>
            <Switch checked={config.allowEmployeeTracking} onCheckedChange={v => setConfig({...config, allowEmployeeTracking: v})} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div><Label>Shopify Integration</Label><p className="text-xs text-muted-foreground">Auto-sync orders from Shopify</p></div>
            <Switch checked={config.integrations?.shopifyActive} onCheckedChange={v => setConfig({...config, integrations: {...config.integrations, shopifyActive: v}})} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>India Post Tracking</Label><p className="text-xs text-muted-foreground">Auto-track shipments via India Post API</p></div>
            <Switch checked={config.integrations?.indiaPostActive} onCheckedChange={v => setConfig({...config, integrations: {...config.integrations, indiaPostActive: v}})} />
          </div>
          <div className="flex items-center justify-between">
            <div><Label>Meta Ads Sync</Label><p className="text-xs text-muted-foreground">Pull daily ad spend automatically</p></div>
            <Switch checked={config.integrations?.metaAdsActive} onCheckedChange={v => setConfig({...config, integrations: {...config.integrations, metaAdsActive: v}})} />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div>
              <CardTitle className="text-base text-red-600 dark:text-red-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions that affect your data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Select what you want to purge. <strong>Config and integration credentials are always preserved.</strong></p>
          <div className="grid grid-cols-1 gap-2">
            {purgeOptions.map(opt => (
              <div key={opt.value}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${purgeType === opt.value ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-border hover:border-red-200 hover:bg-red-50/50'}`}
                onClick={() => setPurgeType(opt.value)}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${purgeType === opt.value ? 'border-red-500' : 'border-muted-foreground/40'}`}>
                    {purgeType === opt.value && <div className="w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                  <div>
                    <p className={`font-medium text-sm ${opt.color}`}>{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="destructive" className="w-full" onClick={() => { setPurgeDialogOpen(true); setConfirmText(''); }}>
            <Trash2 className="w-4 h-4 mr-2" /> Purge {purgeOptions.find(p => p.value === purgeType)?.label || 'Data'}
          </Button>
        </CardContent>
      </Card>

      {/* Purge Confirmation Dialog */}
      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> Confirm Data Purge
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{purgeOptions.find(p => p.value === purgeType)?.label}</strong>.
              Your Tenant Config and Integration credentials will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-sm">
              <p className="font-medium text-red-700 dark:text-red-400 mb-1">What will be deleted:</p>
              <p className="text-xs text-red-600 dark:text-red-300">{purgeOptions.find(p => p.value === purgeType)?.desc}</p>
            </div>
            <div>
              <Label className="text-sm">Type <span className="font-bold text-red-600">PURGE</span> to confirm</Label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type PURGE"
                className="mt-1 border-red-200 focus-visible:ring-red-500"
              />
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full"
            disabled={confirmText !== 'PURGE' || purging}
            onClick={async () => {
              setPurging(true);
              try {
                const res = await fetch('/api/purge', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ purgeType }),
                });
                const data = await res.json();
                toast.success(data.message || 'Data purged successfully');
                setPurgeDialogOpen(false);
              } catch (err) {
                toast.error('Purge failed');
              }
              setPurging(false);
            }}
          >
            {purging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {purging ? 'Purging...' : `Permanently Delete ${purgeOptions.find(p => p.value === purgeType)?.label}`}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
