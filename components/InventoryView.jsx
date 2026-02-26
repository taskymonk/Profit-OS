'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Boxes, Package } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function MaterialsTable({ items, type, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead><tr className="border-b bg-muted/50">
          <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Name</th>
          <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Vendor</th>
          <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Price/Unit</th>
          {type === 'raw' && <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Unit</th>}
          {type === 'raw' && <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Wastage %</th>}
          <th className="py-3 px-4 text-xs font-medium text-muted-foreground w-24">Actions</th>
        </tr></thead>
        <tbody>
          {items.map(item => (
            <tr key={item._id} className="border-b hover:bg-muted/30">
              <td className="py-3 px-4 text-sm font-medium">{item.name}</td>
              <td className="py-3 px-4 text-sm text-muted-foreground">{item.vendorName || '-'}</td>
              <td className="py-3 px-4 text-sm text-right font-mono">{fmt(item.pricePerUnit)}</td>
              {type === 'raw' && <td className="py-3 px-4 text-sm"><Badge variant="outline" className="text-xs">{item.unitMeasurement}</Badge></td>}
              {type === 'raw' && <td className="py-3 px-4 text-sm text-right">{item.defaultWastageBuffer}%</td>}
              <td className="py-3 px-4">
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(item._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No items yet</div>}
    </div>
  );
}

export default function InventoryView() {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activeTab, setActiveTab] = useState('raw');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({ name: '', vendorId: '', vendorName: '', pricePerUnit: '', unitMeasurement: 'grams', defaultWastageBuffer: '0' });

  const fetchData = async () => {
    const [rm, pm, v] = await Promise.all([
      fetch('/api/raw-materials').then(r => r.json()),
      fetch('/api/packaging-materials').then(r => r.json()),
      fetch('/api/vendors').then(r => r.json()),
    ]);
    setRawMaterials(rm); setPackagingMaterials(pm); setVendors(v);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    const endpoint = activeTab === 'raw' ? '/api/raw-materials' : '/api/packaging-materials';
    const data = { ...form, pricePerUnit: Number(form.pricePerUnit), defaultWastageBuffer: Number(form.defaultWastageBuffer) };
    try {
      if (editing) {
        await fetch(`${endpoint}/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Updated');
      } else {
        await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Created');
      }
      setDialogOpen(false); setEditing(null); fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this item?')) return;
    const endpoint = activeTab === 'raw' ? '/api/raw-materials' : '/api/packaging-materials';
    await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); fetchData();
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ name: item.name, vendorId: item.vendorId || '', vendorName: item.vendorName || '', pricePerUnit: String(item.pricePerUnit), unitMeasurement: item.unitMeasurement || 'grams', defaultWastageBuffer: String(item.defaultWastageBuffer || 0) });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="raw" className="gap-1"><Boxes className="w-4 h-4" /> Raw Materials ({rawMaterials.length})</TabsTrigger>
            <TabsTrigger value="packaging" className="gap-1"><Package className="w-4 h-4" /> Packaging ({packagingMaterials.length})</TabsTrigger>
          </TabsList>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm({ name: '', vendorId: '', vendorName: '', pricePerUnit: '', unitMeasurement: 'grams', defaultWastageBuffer: '0' })}>
                <Plus className="w-4 h-4 mr-2" /> Add {activeTab === 'raw' ? 'Material' : 'Packaging'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} {activeTab === 'raw' ? 'Raw Material' : 'Packaging'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div><Label>Vendor</Label><Input value={form.vendorName} onChange={e => setForm({...form, vendorName: e.target.value})} placeholder="Vendor name" /></div>
                <div><Label>Price Per Unit (INR)</Label><Input type="number" value={form.pricePerUnit} onChange={e => setForm({...form, pricePerUnit: e.target.value})} /></div>
                {activeTab === 'raw' && (
                  <>
                    <div><Label>Unit of Measurement</Label><Input value={form.unitMeasurement} onChange={e => setForm({...form, unitMeasurement: e.target.value})} placeholder="grams, ml, units" /></div>
                    <div><Label>Default Wastage Buffer %</Label><Input type="number" value={form.defaultWastageBuffer} onChange={e => setForm({...form, defaultWastageBuffer: e.target.value})} /></div>
                  </>
                )}
              </div>
              <Button onClick={handleSubmit} className="w-full mt-2">{editing ? 'Update' : 'Create'}</Button>
            </DialogContent>
          </Dialog>
        </div>
        <TabsContent value="raw">
          <Card><CardContent className="p-0"><MaterialsTable items={rawMaterials} type="raw" onEdit={openEdit} onDelete={handleDelete} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="packaging">
          <Card><CardContent className="p-0"><MaterialsTable items={packagingMaterials} type="packaging" onEdit={openEdit} onDelete={handleDelete} /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
