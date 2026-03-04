'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, Building2, Palette, Trash2, AlertTriangle, Loader2, CheckCircle2, AlertCircle, Globe, DollarSign, Settings2, ToggleLeft, Upload, Image, Check, Sun, Moon, Monitor, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

// Preset brand color swatches
const COLOR_PRESETS = [
  { hex: '#059669', name: 'Emerald' },
  { hex: '#2563EB', name: 'Blue' },
  { hex: '#4F46E5', name: 'Indigo' },
  { hex: '#7C3AED', name: 'Violet' },
  { hex: '#DB2777', name: 'Pink' },
  { hex: '#DC2626', name: 'Red' },
  { hex: '#EA580C', name: 'Orange' },
  { hex: '#D97706', name: 'Amber' },
  { hex: '#0D9488', name: 'Teal' },
  { hex: '#475569', name: 'Slate' },
];

// Helper: Hex to HSL for CSS variable application
function hexToHSL(hex) {
  if (!hex) return null;
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Helper: Extract dominant colors from an image using canvas pixel sampling
function extractColorsFromImage(imgSrc) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 50; // sample at small size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const colorMap = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue; // skip transparent pixels
        // Quantize to reduce noise (group similar colors)
        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        // Skip near-white (bg) and near-black
        const brightness = (qr + qg + qb) / 3;
        if (brightness > 230 || brightness < 25) continue;
        const key = `${qr},${qg},${qb}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
      }
      const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
      const topColors = sorted.slice(0, 3).map(([rgb]) => {
        const [r, g, b] = rgb.split(',').map(Number);
        return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
      });
      resolve(topColors);
    };
    img.onerror = () => resolve([]);
    img.src = imgSrc;
  });
}

export default function SettingsView() {
  const [config, setConfig] = useState({
    tenantName: '', logo: '', icon: '', primaryColor: '#059669', themePreference: 'system',
    baseCurrency: 'INR', supportedCurrencies: ['INR', 'USD'], timezone: 'Asia/Kolkata',
    gstRate: 18, shopifyTxnFeeRate: 2, adSpendTaxRate: 18, allowEmployeeTracking: true,
    integrations: { shopifyActive: false, indiaPostActive: false, metaAdsActive: false },
  });
  const [saving, setSaving] = useState(false);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [purgeType, setPurgeType] = useState('all');
  const [suggestedColors, setSuggestedColors] = useState([]);
  const [liveColor, setLiveColor] = useState('#059669');
  const colorInputRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [changingRole, setChangingRole] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tenant-config');
        const data = await res.json();
        if (data && data.tenantName) {
          setConfig(prev => ({ ...prev, ...data }));
          setLiveColor(data.primaryColor || '#059669');
        }
      } catch (err) { console.error(err); }
    }
    load();
  }, []);

  // Load users for user management
  useEffect(() => {
    async function loadUsers() {
      setLoadingUsers(true);
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (Array.isArray(data)) setUsers(data);
      } catch (err) { console.error('Failed to load users:', err); }
      setLoadingUsers(false);
    }
    loadUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    setChangingRole(prev => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Role updated to ${newRole.replace('_', ' ')}`);
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
      }
    } catch (err) { toast.error('Failed to update role'); }
    setChangingRole(prev => ({ ...prev, [userId]: false }));
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!confirm(`Are you sure you want to remove ${userName}? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`${userName} removed successfully`);
        setUsers(prev => prev.filter(u => u._id !== userId));
      }
    } catch (err) { toast.error('Failed to remove user'); }
  };

  // Extract colors from logo when logo changes
  useEffect(() => {
    if (config.logo && config.logo.startsWith('data:')) {
      extractColorsFromImage(config.logo).then(colors => {
        setSuggestedColors(colors);
      });
    } else {
      setSuggestedColors([]);
    }
  }, [config.logo]);

  // Live preview: apply color to CSS variables in real-time
  const applyColorLive = useCallback((hex) => {
    setLiveColor(hex);
    const hsl = hexToHSL(hex);
    if (hsl) {
      document.documentElement.style.setProperty('--primary', hsl);
      const l = parseInt(hsl.split('%')[0].split(' ').pop());
      document.documentElement.style.setProperty('--primary-foreground', l > 55 ? '0 0% 10%' : '0 0% 100%');
    }
  }, []);

  // Apply theme live
  const applyThemeLive = useCallback((preference) => {
    if (preference === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (preference === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, []);

  const selectColor = (hex) => {
    setConfig(prev => ({ ...prev, primaryColor: hex }));
    applyColorLive(hex);
  };

  const selectTheme = (pref) => {
    setConfig(prev => ({ ...prev, themePreference: pref }));
    applyThemeLive(pref);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saveData = { ...config };
      delete saveData.maxOrdersPerMonth;
      delete saveData._id;
      delete saveData.createdAt;
      await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData),
      });
      toast.success('Settings saved!');
    } catch (err) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const handleFileUpload = async (file, type) => {
    if (!file) return;
    const maxSize = type === 'logo' ? 500 * 1024 : 200 * 1024;
    const label = type === 'logo' ? 'Logo' : 'Icon';
    if (file.size > maxSize) {
      toast.error(`${label} must be under ${maxSize / 1024}KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      try {
        const endpoint = type === 'logo' ? '/api/upload-logo' : '/api/upload-icon';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: base64, fileName: file.name }),
        });
        const data = await res.json();
        if (data[type]) {
          setConfig(prev => ({ ...prev, [type]: data[type] }));
          toast.success(`${label} uploaded!`);
        } else {
          toast.error(data.error || 'Upload failed');
        }
      } catch (err) { toast.error('Upload failed'); }
    };
    reader.readAsDataURL(file);
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
          <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${item.done ? 'border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800'}`}>
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
        <CardContent className="space-y-5">
          {/* Business Name */}
          <div>
            <Label>Business Name</Label>
            <Input value={config.tenantName} onChange={e => setConfig({...config, tenantName: e.target.value})} className="mt-1" />
          </div>

          {/* Logo Upload */}
          <div>
            <Label className="flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" /> Logo
              <span className="text-[10px] text-muted-foreground font-normal ml-1">Displayed in expanded sidebar</span>
            </Label>
            <div className="flex items-start gap-4 mt-1.5">
              <div className="w-48 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                {config.logo ? (
                  <img src={config.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input type="file" accept="image/*" className="hidden" id="logo-upload"
                  onChange={(e) => {
                    handleFileUpload(e.target.files?.[0], 'logo');
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => document.getElementById('logo-upload').click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Logo
                  </Button>
                  <span className="text-[10px] text-muted-foreground">Max 500KB, PNG/JPG/SVG. Horizontal recommended.</span>
                </div>
                {config.logo && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setConfig({...config, logo: ''})}>
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Icon Upload */}
          <div>
            <Label className="flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" /> Icon
              <span className="text-[10px] text-muted-foreground font-normal ml-1">Displayed in collapsed sidebar & browser tab</span>
            </Label>
            <div className="flex items-start gap-4 mt-1.5">
              <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                {config.icon ? (
                  <img src={config.icon} alt="Icon" className="w-full h-full object-contain" />
                ) : config.logo ? (
                  <img src={config.logo} alt="Logo fallback" className="w-full h-full object-contain opacity-40" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">{(config.tenantName || 'P')[0]}</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input type="file" accept="image/*" className="hidden" id="icon-upload"
                  onChange={(e) => {
                    handleFileUpload(e.target.files?.[0], 'icon');
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => document.getElementById('icon-upload').click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Icon
                  </Button>
                  <span className="text-[10px] text-muted-foreground">Max 200KB, square PNG/SVG recommended.</span>
                </div>
                {!config.icon && (
                  <p className="text-[10px] text-muted-foreground italic">
                    {config.logo ? 'No icon set — using logo as fallback. Upload a square icon for best results.' : 'No icon set — showing first letter of business name.'}
                  </p>
                )}
                {config.icon && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setConfig({...config, icon: ''})}>
                    Remove icon
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Palette className="w-4 h-4 text-violet-700 dark:text-violet-300" /></div>
            <div><CardTitle className="text-base">Appearance</CardTitle><CardDescription>Primary color and theme preference</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Primary Color */}
          <div>
            <Label className="mb-2 block">Primary Color</Label>
            <p className="text-[11px] text-muted-foreground mb-3">This color is applied to buttons, active states, and accents across the entire app. Changes preview live.</p>

            {/* Suggested from logo */}
            {suggestedColors.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Suggested from your logo:</p>
                <div className="flex gap-2">
                  {suggestedColors.map((c, i) => (
                    <button key={i}
                      onClick={() => selectColor(c)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${liveColor === c ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20' : 'border-border hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                      title={`Suggested: ${c}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Preset Swatches */}
            <div className="mb-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Presets:</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button key={preset.hex}
                    onClick={() => selectColor(preset.hex)}
                    className={`group relative w-8 h-8 rounded-lg border-2 transition-all ${liveColor === preset.hex ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20' : 'border-border hover:scale-105'}`}
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                  >
                    {liveColor === preset.hex && (
                      <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-sm" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Color */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer overflow-hidden"
                  style={{ backgroundColor: liveColor }}
                  onClick={() => colorInputRef.current?.click()}
                >
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={liveColor}
                    onChange={e => selectColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <Input
                value={config.primaryColor}
                onChange={e => {
                  const val = e.target.value;
                  setConfig(prev => ({ ...prev, primaryColor: val }));
                  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    applyColorLive(val);
                  }
                }}
                placeholder="#059669"
                className="w-32 font-mono text-sm"
              />
              <span className="text-[11px] text-muted-foreground">Custom hex — type or pick</span>
            </div>

            {/* Live preview button */}
            <div className="mt-3 p-3 rounded-lg border bg-muted/30">
              <p className="text-[11px] text-muted-foreground mb-2">Live preview:</p>
              <div className="flex items-center gap-3">
                <Button size="sm" className="h-8">Primary Button</Button>
                <Button size="sm" variant="outline" className="h-8 border-primary text-primary">Outline</Button>
                <Badge>Active Badge</Badge>
                <div className="w-3 h-3 rounded-full bg-primary" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Theme Preference */}
          <div>
            <Label className="mb-2 block">Theme</Label>
            <p className="text-[11px] text-muted-foreground mb-3">Choose between light, dark, or automatic system theme. Changes apply instantly.</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', icon: Sun, desc: 'Always light' },
                { value: 'dark', label: 'Dark', icon: Moon, desc: 'Always dark' },
                { value: 'system', label: 'System', icon: Monitor, desc: 'Match OS' },
              ].map(t => {
                const Icon = t.icon;
                const isActive = config.themePreference === t.value;
                return (
                  <button key={t.value}
                    onClick={() => selectTheme(t.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Fees */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><DollarSign className="w-4 h-4 text-emerald-700 dark:text-emerald-300" /></div>
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
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Globe className="w-4 h-4 text-blue-700 dark:text-blue-300" /></div>
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
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30"><ToggleLeft className="w-4 h-4 text-purple-700 dark:text-purple-300" /></div>
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

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base">User Management</CardTitle>
              <CardDescription>Manage team members and their access roles</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No users found. Users appear here after they sign in.</p>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <div key={user._id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-sm font-semibold text-primary">{(user.name || user.email || 'U')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'Unnamed'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={user.role}
                      onValueChange={(val) => handleRoleChange(user._id, val)}
                      disabled={changingRole[user._id]}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="master_admin">Master Admin</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteUser(user._id, user.name || user.email)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:block">
                    {user.googleId ? '🔗 Google' : '📧 Email'}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t">
                <p className="text-[11px] text-muted-foreground">
                  <strong>Master Admin</strong>: Full access including Settings & Integrations. <strong>Admin</strong>: Everything except Settings & Integrations. <strong>Employee</strong>: Dashboard only (KDS in future).
                </p>
              </div>
            </div>
          )}
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
