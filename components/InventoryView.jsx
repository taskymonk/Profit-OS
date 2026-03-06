'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import GuideCard from '@/components/GuideCard';
import PageSkeleton from '@/components/PageSkeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Trash2, Edit, Package, AlertTriangle, TrendingDown, TrendingUp, ChevronDown,
  ChevronRight, History, Boxes, ShoppingCart, X, Zap, CheckCircle2, FolderTree, Save, Info
} from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventoryView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [preparable, setPreparable] = useState([]);
  const [expandedItem, setExpandedItem] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchItemId, setBatchItemId] = useState(null);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [invCategories, setInvCategories] = useState([]);
  const [catEditing, setCatEditing] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newSubCat, setNewSubCat] = useState({});
  const [prepCollapsed, setPrepCollapsed] = useState(true);
  const [prepSortBy, setPrepSortBy] = useState('lowStock');

  const [form, setForm] = useState({
    name: '', category: 'Raw Material', subCategory: '', purchasePrice: '',
    purchaseQuantity: '1', unit: 'units', lowStockThreshold: '0',
  });

  const [batchForm, setBatchForm] = useState({
    date: new Date().toISOString().split('T')[0], quantity: '', costPerUnit: '',
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, summaryRes, catRes] = await Promise.all([
        fetch('/api/inventory-items'),
        fetch('/api/stock/summary'),
        fetch('/api/inventory-items/categories'),
      ]);
      const itemsData = await itemsRes.json();
      const summaryData = await summaryRes.json();
      const catData = await catRes.json();
      setItems(Array.isArray(itemsData) ? itemsData : (summaryData.items || []));
      setPreparable((summaryData.preparable || []).filter(p => p.canPrepare !== null));
      setInvCategories(Array.isArray(catData) ? catData : []);
    } catch (err) { toast.error('Failed to load inventory'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const fetchMovements = async (itemId) => {
    if (expandedItem === itemId) { setExpandedItem(null); return; }
    setMovementsLoading(true); setExpandedItem(itemId);
    try {
      const res = await fetch(`/api/stock/movements/${itemId}`);
      setMovements(Array.isArray(await res.clone().json()) ? await res.json() : []);
    } catch (err) { toast.error('Failed to load movements'); }
    setMovementsLoading(false);
  };

  const allCategories = [...new Set([...invCategories.map(c => c.name), ...items.map(i => i.category).filter(Boolean)])];
  const getSubCats = (cat) => invCategories.find(c => c.name === cat)?.subCategories || [];
  const filteredItems = filterCategory === 'all' ? items : items.filter(i => i.category === filterCategory);

  const grouped = {};
  filteredItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const totalStock = items.reduce((s, i) => s + (i.currentStock || 0), 0);
  const lowStockCount = items.filter(i => i.isLowStock).length;
  const totalValue = items.reduce((s, i) => s + ((i.currentStock || 0) * (i.avgCostPerUnit || i.baseCostPerUnit || 0)), 0);

  // Preparable: group by base product name (remove variant suffixes)
  const groupedPreparable = {};
  preparable.forEach(p => {
    const baseName = p.name.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*-\s*\d+\s*Photos?/gi, '').trim() || p.name;
    if (!groupedPreparable[baseName]) groupedPreparable[baseName] = { items: [], minPrepare: Infinity, totalMissing: [] };
    groupedPreparable[baseName].items.push(p);
    if (p.canPrepare < groupedPreparable[baseName].minPrepare) groupedPreparable[baseName].minPrepare = p.canPrepare;
    groupedPreparable[baseName].totalMissing.push(...p.missingItems);
  });
  const prepGroups = Object.entries(groupedPreparable).sort((a, b) => {
    const aGroup = a[1]; const bGroup = b[1];
    if (prepSortBy === 'lowStock') {
      // Low stock first (items that can prepare fewer units first)
      return (aGroup.minPrepare || 0) - (bGroup.minPrepare || 0);
    } else if (prepSortBy === 'mostOrders') {
      return (bGroup.items.reduce((s, i) => s + (i.orderCount || 0), 0)) - (aGroup.items.reduce((s, i) => s + (i.orderCount || 0), 0));
    } else if (prepSortBy === 'az') {
      return a[0].localeCompare(b[0]);
    } else if (prepSortBy === 'mostRevenue') {
      return (bGroup.items.reduce((s, i) => s + (i.revenue || 0), 0)) - (aGroup.items.reduce((s, i) => s + (i.revenue || 0), 0));
    }
    return 0;
  });

  const resetForm = () => {
    setForm({ name: '', category: 'Raw Material', subCategory: '', purchasePrice: '', purchaseQuantity: '1', unit: 'units', lowStockThreshold: '0' });
    setEditingItem(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const payload = {
      name: form.name, category: form.category, subCategory: form.subCategory, unit: form.unit,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      purchaseQuantity: parseInt(form.purchaseQuantity) || 1,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 0,
    };
    try {
      if (editingItem) {
        await fetch(`/api/inventory-items/${editingItem._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success('Item updated');
      } else {
        await fetch('/api/inventory-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success('Item created' + (parseFloat(form.purchasePrice) > 0 ? ' with initial stock batch' : ''));
      }
      setDialogOpen(false); resetForm(); fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this item and all its stock batches?')) return;
    try { await fetch(`/api/inventory-items/${id}`, { method: 'DELETE' }); toast.success('Item deleted'); fetchItems(); } catch (err) { toast.error('Failed to delete'); }
  };

  const handleAddBatch = async () => {
    if (!batchForm.quantity || !batchForm.costPerUnit) return toast.error('Quantity and cost required');
    const item = items.find(i => i._id === batchItemId);
    try {
      const res = await fetch('/api/stock-batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryItemId: batchItemId, inventoryItemName: item?.name || '', date: batchForm.date, quantity: parseFloat(batchForm.quantity), costPerUnit: parseFloat(batchForm.costPerUnit) }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Stock batch added');
      setBatchDialogOpen(false); setBatchForm({ date: new Date().toISOString().split('T')[0], quantity: '', costPerUnit: '' });
      fetchItems(); if (expandedItem === batchItemId) fetchMovements(batchItemId);
    } catch (err) { toast.error(err.message); }
  };

  const handleSaveCategories = async () => {
    try {
      await fetch('/api/inventory-items/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: catEditing }),
      });
      toast.success('Categories saved'); setCatDialogOpen(false); fetchItems();
    } catch (err) { toast.error('Failed'); }
  };

  const hasRecipes = preparable.length > 0;
  const hasExpenses = items.some(i => (i.currentStock || 0) > 0);

  return (
    <div className="space-y-6">
      {/* Page Guide */}
      <GuideCard storageKey="guide_inventory" icon={Zap} title="📦 Inventory & Stock Guide">
        <p>• 🏷️ <strong>Add raw materials & packaging</strong> — List everything you use to make products</p>
        <p>• 📥 <strong>Enter stock batches</strong> — Add batches with purchase prices, or log purchases as Expenses for auto-creation</p>
        <p>• 🔗 <strong>Link to SKU Recipes</strong> — Go to SKU Recipes and add these as ingredients to enable auto COGS</p>
        <p>• 📊 <strong>FIFO costing</strong> — Orders consume stock from the oldest batch first, giving you accurate cost of goods sold</p>
        <p>• ⚠️ <strong>Low stock alerts</strong> — Set minimum thresholds to get notified when stock runs low</p>
        <p>• 📂 <strong>Categories</strong> — Organize items by type for easier management</p>
      </GuideCard>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Inventory & Stock</h2>
          <p className="text-sm text-muted-foreground">FIFO-based stock tracking with purchase batches</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setCatEditing(JSON.parse(JSON.stringify(invCategories))); setCatDialogOpen(true); }}>
            <FolderTree className="h-4 w-4 mr-2" /> Categories
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-blue-500/10"><Package className="h-5 w-5 text-blue-500" /></div><div><p className="text-sm text-muted-foreground">Total Items</p><p className="text-xl font-bold">{items.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-green-500/10"><Boxes className="h-5 w-5 text-green-500" /></div><div><p className="text-sm text-muted-foreground">Total Stock</p><p className="text-xl font-bold">{totalStock.toLocaleString('en-IN')}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-purple-500/10"><TrendingUp className="h-5 w-5 text-purple-500" /></div><div><p className="text-sm text-muted-foreground">Stock Value</p><p className="text-xl font-bold">{fmt(totalValue)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${lowStockCount > 0 ? 'bg-red-500/10' : 'bg-muted'}`}><AlertTriangle className={`h-5 w-5 ${lowStockCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`} /></div><div><p className="text-sm text-muted-foreground">Low Stock</p><p className={`text-xl font-bold ${lowStockCount > 0 ? 'text-red-500' : ''}`}>{lowStockCount}</p></div></div></CardContent></Card>
      </div>

      {/* Orders We Can Prepare — Compact grouped view */}
      {prepGroups.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-4 pt-3 pb-2 cursor-pointer" onClick={() => setPrepCollapsed(!prepCollapsed)}>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Orders We Can Prepare</span>
              <Badge variant="outline" className="text-xs">{prepGroups.length} products</Badge>
            </div>
            {prepCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          {!prepCollapsed && (
            <CardContent className="pt-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">Based on current stock and SKU recipe ingredients.</p>
                <Select value={prepSortBy} onValueChange={setPrepSortBy}>
                  <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lowStock">Low Stock First</SelectItem>
                    <SelectItem value="mostOrders">Most Orders</SelectItem>
                    <SelectItem value="mostRevenue">Most Revenue</SelectItem>
                    <SelectItem value="az">A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {prepGroups.map(([name, data]) => (
                  <div key={name} className={`border rounded-lg p-2.5 ${data.minPrepare === 0 ? 'border-red-200 bg-red-50/50' : data.minPrepare < 10 ? 'border-amber-200 bg-amber-50/50' : ''}`}>
                    <p className="text-xs font-medium truncate" title={name}>{name}</p>
                    <p className={`text-lg font-bold ${data.minPrepare === 0 ? 'text-red-500' : data.minPrepare < 10 ? 'text-amber-500' : 'text-green-600'}`}>
                      {data.minPrepare === Infinity ? '—' : data.minPrepare}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{data.items.length} variant{data.items.length > 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Items */}
      {loading ? (
        <PageSkeleton variant="list" />
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No inventory items yet</p>
            <p className="text-sm mt-1 max-w-md mx-auto">Add your raw materials and packaging items here. They'll be used as ingredients in SKU Recipes to calculate your Cost of Goods Sold (COGS).</p>
            <Button className="mt-4" onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Add Your First Item</Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{cat} <Badge variant="secondary" className="ml-2">{catItems.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {catItems.map(item => (
                <div key={item._id}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{item.name}</p>
                          {item.subCategory && <Badge variant="outline" className="text-[10px]">{item.subCategory}</Badge>}
                          {item.isLowStock && <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> Low Stock</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.unit || 'units'} · Avg Cost: {fmt(item.avgCostPerUnit || item.baseCostPerUnit || 0)}/{item.unit || 'unit'}
                          {(item.lowStockThreshold || 0) > 0 && ` · Alert below: ${item.lowStockThreshold}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${item.isLowStock ? 'text-red-500' : item.currentStock > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {(item.currentStock || 0).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.batchCount || 0} batches</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button variant="ghost" size="sm" onClick={() => fetchMovements(item._id)} title="View stock movement history (purchases in, consumption out)">
                        {expandedItem === item._id ? <ChevronDown className="h-4 w-4" /> : <History className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" title="Add a new purchase batch (for existing stock, use this; for new purchases, use Expenses)" onClick={() => {
                        setBatchItemId(item._id);
                        setBatchForm({ date: new Date().toISOString().split('T')[0], quantity: '', costPerUnit: '' });
                        setBatchDialogOpen(true);
                      }}><Plus className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingItem(item);
                        setForm({ name: item.name, category: item.category || 'Raw Material', subCategory: item.subCategory || '', purchasePrice: String(item.purchasePrice || ''), purchaseQuantity: String(item.purchaseQuantity || '1'), unit: item.unit || 'units', lowStockThreshold: String(item.lowStockThreshold || '0') });
                        setDialogOpen(true);
                      }} title="Edit item details"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id)} title="Delete item and all stock batches"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                  {expandedItem === item._id && (
                    <div className="ml-6 mt-2 mb-2 border-l-2 border-muted pl-4">
                      {movementsLoading ? <p className="text-sm text-muted-foreground py-2">Loading...</p> : movements.length === 0 ? <p className="text-sm text-muted-foreground py-2">No stock movements yet. Add a batch or log a purchase expense.</p> : (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Stock Movement History (FIFO — oldest consumed first)</p>
                          {movements.map((m, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-sm py-1">
                              <span className="text-xs text-muted-foreground w-20">{m.date?.substring(0, 10)}</span>
                              {m.type === 'purchase' ? <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <span className={m.type === 'purchase' ? 'text-green-600' : 'text-red-500'}>{m.type === 'purchase' ? '+' : ''}{m.quantity}</span>
                              <span className="text-muted-foreground">@ {fmt(m.costPerUnit)}</span>
                              <span className="text-muted-foreground">= {fmt(Math.abs(m.totalCost))}</span>
                              {m.type === 'purchase' && m.remainingQty !== undefined && <Badge variant="outline" className="text-xs">{m.remainingQty} remaining</Badge>}
                              {m.insufficientStock && <Badge variant="destructive" className="text-xs">Insufficient</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add/Edit Item Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Edit' : 'Add'} Inventory Item</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Item Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Red Roses" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v, subCategory: '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-Category</Label>
                <Select value={form.subCategory || 'none'} onValueChange={v => setForm(p => ({ ...p, subCategory: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {getSubCats(form.category).map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['units', 'stems', 'kg', 'grams', 'liters', 'ml', 'meters', 'pieces', 'sheets', 'rolls'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!editingItem && (
              <>
                <Separator />
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                  <p className="text-xs font-medium text-blue-700 flex items-center gap-1"><Info className="w-3 h-3" /> Initial Stock (creates first FIFO batch)</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Enter your current stock quantity and what you paid. For future purchases, log them as Expenses under "Raw Material Purchases" — batches are created automatically.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Total Purchase Price ({'\u20B9'})</Label><Input type="number" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="0" /></div>
                  <div><Label>Quantity</Label><Input type="number" value={form.purchaseQuantity} onChange={e => setForm(p => ({ ...p, purchaseQuantity: e.target.value }))} placeholder="1" /></div>
                </div>
                {form.purchasePrice && form.purchaseQuantity && parseInt(form.purchaseQuantity) > 0 && (
                  <p className="text-sm text-muted-foreground">Cost per unit: {fmt(parseFloat(form.purchasePrice) / parseInt(form.purchaseQuantity))}</p>
                )}
              </>
            )}
            <div><Label>Low Stock Alert Threshold</Label><Input type="number" value={form.lowStockThreshold} onChange={e => setForm(p => ({ ...p, lowStockThreshold: e.target.value }))} placeholder="0 (disabled)" /><p className="text-xs text-muted-foreground mt-1">You'll see a red alert badge when stock falls below this number. Set 0 to disable.</p></div>
            <Button onClick={handleSave} className="w-full">{editingItem ? 'Update Item' : 'Create Item'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Stock Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Stock Batch</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <p className="text-xs text-blue-700"><Info className="w-3 h-3 inline mr-1" />Use this for existing stock you already have. For new purchases, add them as <strong>Expenses → Raw Material Purchases</strong> — the stock batch will be created automatically.</p>
            </div>
            <p className="text-sm text-muted-foreground">Adding batch for <strong>{items.find(i => i._id === batchItemId)?.name}</strong></p>
            <div><Label>Purchase Date</Label><Input type="date" value={batchForm.date} onChange={e => setBatchForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity</Label><Input type="number" value={batchForm.quantity} onChange={e => setBatchForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" /></div>
              <div><Label>Cost per Unit ({'\u20B9'})</Label><Input type="number" step="0.01" value={batchForm.costPerUnit} onChange={e => setBatchForm(p => ({ ...p, costPerUnit: e.target.value }))} placeholder="0.00" /></div>
            </div>
            {batchForm.quantity && batchForm.costPerUnit && <p className="text-sm text-muted-foreground">Total: {fmt(parseFloat(batchForm.quantity) * parseFloat(batchForm.costPerUnit))}</p>}
            <Button onClick={handleAddBatch} className="w-full">Add Batch</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Manager Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manage Inventory Categories</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Organize your inventory items into categories and sub-categories for better management.</p>
          <div className="space-y-3 mt-2">
            {catEditing.map((cat, ci) => (
              <div key={ci} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Input value={cat.name} onChange={e => { const c = [...catEditing]; c[ci] = { ...c[ci], name: e.target.value }; setCatEditing(c); }} className="font-medium h-8 w-48" />
                  <Button variant="ghost" size="sm" onClick={() => setCatEditing(catEditing.filter((_, i) => i !== ci))}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 ml-4">
                  {(cat.subCategories || []).map((sc, si) => (
                    <Badge key={si} variant="secondary" className="text-xs gap-1">{sc}
                      <button onClick={() => { const c = [...catEditing]; c[ci] = { ...c[ci], subCategories: c[ci].subCategories.filter((_, i) => i !== si) }; setCatEditing(c); }} className="ml-1 hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                    </Badge>
                  ))}
                  <div className="flex gap-1">
                    <Input placeholder="Add sub-category" className="h-6 w-32 text-xs" value={newSubCat[ci] || ''} onChange={e => setNewSubCat({ ...newSubCat, [ci]: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' && newSubCat[ci]?.trim()) { const c = [...catEditing]; c[ci] = { ...c[ci], subCategories: [...(c[ci].subCategories || []), newSubCat[ci].trim()] }; setCatEditing(c); setNewSubCat({ ...newSubCat, [ci]: '' }); } }} />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { if (newSubCat[ci]?.trim()) { const c = [...catEditing]; c[ci] = { ...c[ci], subCategories: [...(c[ci].subCategories || []), newSubCat[ci].trim()] }; setCatEditing(c); setNewSubCat({ ...newSubCat, [ci]: '' }); } }}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Input placeholder="New category name" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="h-8" />
              <Button size="sm" variant="outline" onClick={() => { if (newCatName.trim()) { setCatEditing([...catEditing, { name: newCatName.trim(), subCategories: [] }]); setNewCatName(''); } }}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
            </div>
            <Button onClick={handleSaveCategories} className="w-full"><Save className="w-3.5 h-3.5 mr-2" /> Save Categories</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
