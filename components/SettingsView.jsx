'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Building2, Palette, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function SettingsView() {
  const [config, setConfig] = useState({
    tenantName: '', logo: '', primaryColor: '#059669', themePreference: 'system',
    baseCurrency: 'INR', supportedCurrencies: ['INR', 'USD'], timezone: 'Asia/Kolkata',
    gstRate: 18, maxOrdersPerMonth: 5000, allowEmployeeTracking: true,
    integrations: { shopifyActive: false, indiaPostActive: false, metaAdsActive: false },
  });
  const [saving, setSaving] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmText, setConfirmText] = useState('');

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
      await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      toast.success('Settings saved!');
    } catch (err) { toast.error('Failed to save'); }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-[800px] mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">White-label configuration for your tenant</p>
        <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Settings'}</Button>
      </div>

      {/* Brand */}
      <Card>
        <CardHeader><div className="flex items-center gap-3"><Building2 className="w-5 h-5 text-primary" /><div><CardTitle className="text-base">Brand & Identity</CardTitle><CardDescription>Customize your dashboard branding</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Business Name</Label><Input value={config.tenantName} onChange={e => setConfig({...config, tenantName: e.target.value})} /></div>
          <div><Label>Logo URL</Label><Input value={config.logo} onChange={e => setConfig({...config, logo: e.target.value})} placeholder="https://..." /></div>
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

      {/* Localization */}
      <Card>
        <CardHeader><CardTitle className="text-base">Localization & Tax</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div><Label>GST Rate (%)</Label><Input type="number" value={config.gstRate} onChange={e => setConfig({...config, gstRate: Number(e.target.value)})} /></div>
            <div><Label>Max Orders/Month</Label><Input type="number" value={config.maxOrdersPerMonth} onChange={e => setConfig({...config, maxOrdersPerMonth: Number(e.target.value)})} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader><CardTitle className="text-base">Feature Toggles</CardTitle></CardHeader>
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

      {/* Danger Zone: Purge Demo Data */}
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
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
            <div>
              <p className="font-medium text-sm">Purge All Demo Data</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deletes all Orders, SKU Recipes, Employees, Vendors, Materials, and Expenses.
                <br />Preserves your Tenant Config and Integration credentials.
              </p>
            </div>
            <Button variant="destructive" onClick={() => { setPurgeDialogOpen(true); setConfirmText(''); }}>
              <Trash2 className="w-4 h-4 mr-2" /> Purge Data
            </Button>
          </div>
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
              This will permanently delete ALL demo data including orders, products, employees, vendors, and expenses.
              Your Tenant Config and Integration credentials will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-sm space-y-1">
              <p className="font-medium text-red-700 dark:text-red-400">Collections to be purged:</p>
              <ul className="text-xs text-red-600 dark:text-red-300 list-disc pl-5 space-y-0.5">
                <li>Orders</li>
                <li>SKU Recipes</li>
                <li>Raw Materials & Packaging Materials</li>
                <li>Vendors</li>
                <li>Employees</li>
                <li>Overhead Expenses</li>
              </ul>
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
                const res = await fetch('/api/purge', { method: 'POST' });
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
            {purging ? 'Purging...' : 'Permanently Delete All Demo Data'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
