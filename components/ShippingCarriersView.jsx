'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import GuideCard from '@/components/GuideCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Truck, Plus, Trash2, Edit, ExternalLink, Loader2, Globe, Package,
  CheckCircle, AlertCircle, Palette
} from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_CARRIERS = [
  { id: 'indiapost', name: 'India Post / Speed Post', shortName: 'India Post', color: '#E31837', trackUrlTemplate: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id={tracking}', hasApiIntegration: true, builtIn: true },
  { id: 'bluedart', name: 'Blue Dart', shortName: 'Blue Dart', color: '#003399', trackUrlTemplate: 'https://www.bluedart.com/tracking/{tracking}', builtIn: true },
  { id: 'delhivery', name: 'Delhivery', shortName: 'Delhivery', color: '#E74C3C', trackUrlTemplate: 'https://www.delhivery.com/track/package/{tracking}', builtIn: true },
  { id: 'dtdc', name: 'DTDC', shortName: 'DTDC', color: '#FF6600', trackUrlTemplate: 'https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno={tracking}', builtIn: true },
  { id: 'xpressbees', name: 'XpressBees', shortName: 'XpressBees', color: '#FFC107', trackUrlTemplate: 'https://www.xpressbees.com/track?awb={tracking}', builtIn: true },
  { id: 'fedex', name: 'FedEx', shortName: 'FedEx', color: '#4D148C', trackUrlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={tracking}', builtIn: true },
  { id: 'ecom', name: 'Ecom Express', shortName: 'Ecom Express', color: '#00B050', trackUrlTemplate: 'https://www.ecomexpress.in/tracking/?awb_field={tracking}', builtIn: true },
  { id: 'shadowfax', name: 'Shadowfax', shortName: 'Shadowfax', color: '#1A237E', trackUrlTemplate: 'https://tracker.shadowfax.in/#/track?awb={tracking}', builtIn: true },
];

export default function ShippingCarriersView() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editCarrier, setEditCarrier] = useState(null);
  const [form, setForm] = useState({ name: '', shortName: '', color: '#3b82f6', trackUrlTemplate: '' });
  const [saving, setSaving] = useState(false);

  const loadCarriers = useCallback(async () => {
    try {
      const res = await fetch('/api/shipping-carriers');
      const data = await res.json();
      // Merge custom carriers with defaults
      const customMap = {};
      (Array.isArray(data) ? data : []).forEach(c => { customMap[c.id || c._id] = c; });
      const merged = DEFAULT_CARRIERS.map(d => customMap[d.id] ? { ...d, ...customMap[d.id] } : d);
      // Add any custom carriers not in defaults
      (Array.isArray(data) ? data : []).filter(c => !DEFAULT_CARRIERS.find(d => d.id === (c.id || c._id))).forEach(c => merged.push(c));
      setCarriers(merged);
    } catch { setCarriers(DEFAULT_CARRIERS); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCarriers(); }, [loadCarriers]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { toast.error('Carrier name is required'); return; }
    setSaving(true);
    try {
      const body = { ...form };
      if (editCarrier) body.id = editCarrier.id || editCarrier._id;
      const res = await fetch('/api/shipping-carriers', {
        method: editCarrier ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else {
        toast.success(editCarrier ? 'Carrier updated' : 'Carrier added');
        setShowAddDialog(false);
        setEditCarrier(null);
        loadCarriers();
      }
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  }, [form, editCarrier, loadCarriers]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Remove this custom carrier?')) return;
    try {
      await fetch(`/api/shipping-carriers/${id}`, { method: 'DELETE' });
      toast.success('Carrier removed');
      loadCarriers();
    } catch { toast.error('Failed to remove'); }
  }, [loadCarriers]);

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      <GuideCard storageKey="guide_carriers" icon={Truck} title="🚚 Shipping Carriers Guide">
        <p>• 📮 <strong>Manage carriers</strong> — India Post, Blue Dart, Delhivery, DTDC, XpressBees, FedEx, and more</p>
        <p>• 🔗 <strong>Tracking URLs</strong> — Set custom tracking URL patterns for each carrier</p>
        <p>• 🤖 <strong>Auto-detection</strong> — OCR on shipping labels automatically identifies the carrier from the label text</p>
        <p>• ➕ <strong>Add custom carriers</strong> — for regional or niche shipping partners</p>
        <p>• 📦 Carrier data is used across <strong>Orders, KDS, and RTO</strong> for unified tracking</p>
      </GuideCard>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Truck className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{carriers.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Carriers</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Globe className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{carriers.filter(c => c.hasApiIntegration).length}</p>
          <p className="text-[10px] text-muted-foreground">API Integrated</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Package className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{carriers.filter(c => !c.builtIn).length}</p>
          <p className="text-[10px] text-muted-foreground">Custom Carriers</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Truck className="w-5 h-5 text-blue-600" /></div>
              <div><CardTitle className="text-base">Shipping Carriers</CardTitle><CardDescription>Manage carriers, tracking URLs, and integrations</CardDescription></div>
            </div>
            <Button onClick={() => { setEditCarrier(null); setForm({ name: '', shortName: '', color: '#3b82f6', trackUrlTemplate: '' }); setShowAddDialog(true); }} className="gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" />Add Carrier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {carriers.map(carrier => (
              <div key={carrier.id || carrier._id} className="flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${carrier.color}15`, border: `2px solid ${carrier.color}` }}>
                  <Truck className="w-4 h-4" style={{ color: carrier.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{carrier.name}</span>
                    {carrier.builtIn && <Badge variant="outline" className="text-[9px] h-4">Built-in</Badge>}
                    {carrier.hasApiIntegration && <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-600 border-green-200">API</Badge>}
                  </div>
                  {carrier.trackUrlTemplate && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{carrier.trackUrlTemplate}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                    setEditCarrier(carrier);
                    setForm({ name: carrier.name, shortName: carrier.shortName || '', color: carrier.color || '#3b82f6', trackUrlTemplate: carrier.trackUrlTemplate || '' });
                    setShowAddDialog(true);
                  }}>
                    <Edit className="w-3 h-3" />
                  </Button>
                  {!carrier.builtIn && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(carrier.id || carrier._id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-700 space-y-0.5">
            <p><strong>India Post</strong> has full API integration for automatic tracking updates.</p>
            <p>Other carriers use the <strong>tracking URL template</strong> — use <code>{'{tracking}'}</code> as placeholder for the tracking number.</p>
            <p>The <strong>Scan Label</strong> feature on KDS and Orders will auto-detect carriers based on tracking number format and label text.</p>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!v) { setShowAddDialog(false); setEditCarrier(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="w-5 h-5" />{editCarrier ? 'Edit Carrier' : 'Add Carrier'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Carrier Name *</Label><Input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g., Blue Dart Express" className="mt-1" /></div>
            <div><Label className="text-xs">Short Name</Label><Input value={form.shortName} onChange={e => setForm(p => ({...p, shortName: e.target.value}))} placeholder="e.g., Blue Dart" className="mt-1" /></div>
            <div>
              <Label className="text-xs">Brand Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))} className="w-8 h-8 rounded cursor-pointer border" />
                <Input value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))} className="flex-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Tracking URL Template</Label>
              <Input value={form.trackUrlTemplate} onChange={e => setForm(p => ({...p, trackUrlTemplate: e.target.value}))} placeholder="https://carrier.com/track?awb={tracking}" className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Use <code>{'{tracking}'}</code> as placeholder for the tracking number</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditCarrier(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editCarrier ? 'Update' : 'Add Carrier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
