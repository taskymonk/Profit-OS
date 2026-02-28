'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, Boxes, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const DEFAULT_CATEGORIES = ['Raw Material', 'Packaging', 'Consumables', 'Labels & Stickers'];

export default function InventoryView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [customCategory, setCustomCategory] = useState('');

  const [form, setForm] = useState({
    name: '', category: 'Raw Material', purchasePrice: '',
    purchaseQuantity: '1', unitMeasurement: 'grams', yieldFromTotalPurchase: '1',
  });

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory-items');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) { toast.error('Failed to load inventory'); }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  // Get all unique categories from data + defaults
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...items.map(i => i.category).filter(Boolean)])];

  const filteredItems = filterCategory === 'all' ? items : items.filter(i => i.category === filterCategory);

  // Group by category for display
  const grouped = {};
  filteredItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const handleSubmit = async () => {
    const finalCategory = form.category === '__custom__' ? customCategory : form.category;
    const data = {
      name: form.name,
      category: finalCategory,
      purchasePrice: Number(form.purchasePrice) || 0,
      purchaseQuantity: Math.max(1, Number(form.purchaseQuantity) || 1),
      unitMeasurement: form.unitMeasurement,
      yieldFromTotalPurchase: Math.max(1, Number(form.yieldFromTotalPurchase) || 1),
    };
    try {
      if (editingItem) {
        await fetch(`/api/inventory-items/${editingItem._id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        toast.success('Item updated');
      } else {
        await fetch('/api/inventory-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        toast.success('Item added');
      }
      setDialogOpen(false); setEditingItem(null); setCustomCategory(''); fetchItems();
    } catch (err) { toast.error('Failed to save'); }
  };

  const deleteItem = async (id) => {
    if (!confirm('Delete this inventory item?')) return;
    await fetch(`/api/inventory-items/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); fetchItems();
  };

  const openEdit = (item) => {
    setEditingItem(item);
    const isCustom = !DEFAULT_CATEGORIES.includes(item.category);
    setForm({
      name: item.name, category: isCustom ? '__custom__' : item.category,
      purchasePrice: String(item.purchasePrice ?? item.costPerUnit ?? ''),
      purchaseQuantity: String(item.purchaseQuantity || 1),
      unitMeasurement: item.unitMeasurement || 'units',
      yieldFromTotalPurchase: String(item.yieldFromTotalPurchase ?? item.yieldPerUnit ?? 1),
    });
    if (isCustom) setCustomCategory(item.category);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingItem(null); setCustomCategory('');
    setForm({ name: '', category: 'Raw Material', purchasePrice: '', purchaseQuantity: '1', unitMeasurement: 'grams', yieldFromTotalPurchase: '1' });
    setDialogOpen(true);
  };

  // Compute cost per use for display
  const getCostPerUse = (item) => {
    const price = item.purchasePrice ?? item.costPerUnit ?? 0;
    const yld = item.yieldFromTotalPurchase ?? item.yieldPerUnit ?? 1;
    return price / Math.max(1, yld);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Unified inventory with realistic purchase-to-yield costing. Cost per use = Purchase Price / Yield from Total Purchase.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingItem(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingItem ? 'Edit' : 'Add'} Inventory Item</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Item Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Belgian Chocolate 500g, BOPP Tape Roll" /></div>

                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      <SelectItem value="__custom__">+ Custom Category</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.category === '__custom__' && (
                    <Input className="mt-2" placeholder="Enter new category name" value={customCategory} onChange={e => setCustomCategory(e.target.value)} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Purchase Price ({"\u20B9"})</Label><Input type="number" value={form.purchasePrice} onChange={e => setForm({...form, purchasePrice: e.target.value})} placeholder="500" /></div>
                  <div><Label>Purchase Qty</Label><Input type="number" min="1" value={form.purchaseQuantity} onChange={e => setForm({...form, purchaseQuantity: e.target.value})} placeholder="1" /></div>
                </div>

                <div>
                  <Label>Unit of Measurement</Label>
                  <Select value={form.unitMeasurement} onValueChange={v => setForm({...form, unitMeasurement: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grams">grams</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="liters">liters</SelectItem>
                      <SelectItem value="meters">meters</SelectItem>
                      <SelectItem value="units">units</SelectItem>
                      <SelectItem value="pieces">pieces</SelectItem>
                      <SelectItem value="rolls">rolls</SelectItem>
                      <SelectItem value="boxes">boxes</SelectItem>
                      <SelectItem value="sheets">sheets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-md bg-muted/50 border space-y-2">
                  <div className="flex items-center gap-2">
                    <ArrowDownUp className="w-4 h-4 text-primary" />
                    <Label className="font-semibold text-sm">Yield from Total Purchase</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How many uses do you get from this purchase? Example: Buy 1 roll of tape for {"\u20B9"}500 that packs 100 boxes. Yield = 100 → Cost per use = {"\u20B9"}5.00
                  </p>
                  <Input type="number" min="1" value={form.yieldFromTotalPurchase} onChange={e => setForm({...form, yieldFromTotalPurchase: e.target.value})} placeholder="1" />
                  {Number(form.purchasePrice) > 0 && Number(form.yieldFromTotalPurchase) > 0 && (
                    <p className="text-sm font-medium text-primary">
                      Cost per use: {fmt(Number(form.purchasePrice) / Number(form.yieldFromTotalPurchase))}
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full mt-2">{editingItem ? 'Update' : 'Add'} Item</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Items grouped by category */}
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{category}</h3>
            <Badge variant="outline" className="text-xs">{categoryItems.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryItems.map(item => {
              const costPerUse = getCostPerUse(item);
              const purchasePrice = item.purchasePrice ?? item.costPerUnit ?? 0;
              const purchaseQty = item.purchaseQuantity || 1;
              const yld = item.yieldFromTotalPurchase ?? item.yieldPerUnit ?? 1;
              return (
                <Card key={item._id} className="group hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{item.name}</h4>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{item.unitMeasurement}</Badge>
                          {purchaseQty > 1 && <Badge variant="secondary" className="text-[10px]">Qty: {purchaseQty}</Badge>}
                          {yld > 1 && <Badge variant="secondary" className="text-[10px]">Yield: {yld}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item._id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-between items-end">
                      <div>
                        <p className="text-xs text-muted-foreground">Purchase Price</p>
                        <p className="text-sm font-bold">{fmt(purchasePrice)}<span className="text-xs font-normal text-muted-foreground"> / {purchaseQty > 1 ? `${purchaseQty} ${item.unitMeasurement}` : item.unitMeasurement}</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost Per Use</p>
                        <p className="text-lg font-bold text-primary">{fmt(costPerUse)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {items.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
            <p className="font-medium">Inventory is empty</p>
            <p className="text-sm mt-1">Add raw materials, packaging, and consumables. These will appear as selectable options in your SKU Recipes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
