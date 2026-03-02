'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Edit, Package, AlertTriangle, TrendingDown, TrendingUp, ChevronDown, ChevronRight, History, Boxes, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DEFAULT_CATEGORIES = ['Raw Material', 'Packaging', 'Consumables', 'Labels & Stickers'];

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

  const [form, setForm] = useState({
    name: '', category: 'Raw Material', purchasePrice: '',
    purchaseQuantity: '1', unit: 'units', lowStockThreshold: '0',
  });

  const [batchForm, setBatchForm] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '', costPerUnit: '',
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, summaryRes] = await Promise.all([
        fetch('/api/inventory-items'),
        fetch('/api/stock/summary'),
      ]);
      const itemsData = await itemsRes.json();
      const summaryData = await summaryRes.json();
      setItems(Array.isArray(itemsData) ? itemsData : (summaryData.items || []));
      setPreparable(summaryData.preparable || []);
    } catch (err) { toast.error('Failed to load inventory'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const fetchMovements = async (itemId) => {
    if (expandedItem === itemId) {
      setExpandedItem(null);
      return;
    }
    setMovementsLoading(true);
    setExpandedItem(itemId);
    try {
      const res = await fetch(`/api/stock/movements/${itemId}`);
      const data = await res.json();
      setMovements(Array.isArray(data) ? data : []);
    } catch (err) { toast.error('Failed to load movements'); }
    setMovementsLoading(false);
  };

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...items.map(i => i.category).filter(Boolean)])];
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

  const resetForm = () => {
    setForm({ name: '', category: 'Raw Material', purchasePrice: '', purchaseQuantity: '1', unit: 'units', lowStockThreshold: '0' });
    setEditingItem(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const payload = {
      name: form.name, category: form.category, unit: form.unit,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      purchaseQuantity: parseInt(form.purchaseQuantity) || 1,
      lowStockThreshold: parseInt(form.lowStockThreshold) || 0,
    };

    try {
      if (editingItem) {
        const res = await fetch(`/api/inventory-items/${editingItem._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Failed to update');
        toast.success('Item updated');
      } else {
        const res = await fetch('/api/inventory-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Failed to create');
        toast.success('Item created with initial stock batch');
      }
      setDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this item and all its stock batches?')) return;
    try {
      await fetch(`/api/inventory-items/${id}`, { method: 'DELETE' });
      toast.success('Item deleted');
      fetchItems();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const handleAddBatch = async () => {
    if (!batchForm.quantity || !batchForm.costPerUnit) return toast.error('Quantity and cost required');
    const item = items.find(i => i._id === batchItemId);
    try {
      const res = await fetch('/api/stock-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: batchItemId,
          inventoryItemName: item?.name || '',
          date: batchForm.date,
          quantity: parseFloat(batchForm.quantity),
          costPerUnit: parseFloat(batchForm.costPerUnit),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Stock batch added');
      setBatchDialogOpen(false);
      setBatchForm({ date: new Date().toISOString().split('T')[0], quantity: '', costPerUnit: '' });
      fetchItems();
      if (expandedItem === batchItemId) fetchMovements(batchItemId);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Inventory & Stock</h2>
          <p className="text-sm text-muted-foreground">FIFO-based stock tracking with purchase batches</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Package className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-xl font-bold">{items.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Boxes className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Stock Units</p>
                <p className="text-xl font-bold">{totalStock.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Stock Value</p>
                <p className="text-xl font-bold">{fmt(totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${lowStockCount > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
                <AlertTriangle className={`h-5 w-5 ${lowStockCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
                <p className={`text-xl font-bold ${lowStockCount > 0 ? 'text-red-500' : ''}`}>{lowStockCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders We Can Prepare */}
      {preparable.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Orders We Can Prepare
            </CardTitle>
            <CardDescription>Based on current stock levels and SKU recipes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {preparable.map(p => (
                <div key={p.sku} className="border rounded-lg p-3">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className={`text-lg font-bold ${p.canPrepare === 0 ? 'text-red-500' : p.canPrepare !== null && p.canPrepare < 10 ? 'text-amber-500' : 'text-green-600'}`}>
                    {p.canPrepare === null ? 'N/A' : p.canPrepare}
                  </p>
                  {p.missingItems.length > 0 && (
                    <p className="text-xs text-red-500 mt-1">Missing: {p.missingItems.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
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

      {/* Inventory Items grouped by category */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading inventory...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No inventory items yet</p>
            <p className="text-sm mt-1">Add your first item to start tracking stock with FIFO costing</p>
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
                          {item.isLowStock && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Low Stock
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Unit: {item.unit || 'units'} | Avg Cost: {fmt(item.avgCostPerUnit || item.baseCostPerUnit || 0)}/{item.unit || 'unit'}
                          {(item.lowStockThreshold || 0) > 0 && ` | Alert below: ${item.lowStockThreshold}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${item.isLowStock ? 'text-red-500' : item.currentStock > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {(item.currentStock || 0).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.batchCount || 0} active batches</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button variant="ghost" size="sm" onClick={() => fetchMovements(item._id)} title="Stock history">
                        {expandedItem === item._id ? <ChevronDown className="h-4 w-4" /> : <History className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setBatchItemId(item._id);
                        setBatchForm({ date: new Date().toISOString().split('T')[0], quantity: '', costPerUnit: '' });
                        setBatchDialogOpen(true);
                      }} title="Add stock batch">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingItem(item);
                        setForm({
                          name: item.name, category: item.category || 'Raw Material',
                          purchasePrice: String(item.purchasePrice || ''),
                          purchaseQuantity: String(item.purchaseQuantity || '1'),
                          unit: item.unit || 'units',
                          lowStockThreshold: String(item.lowStockThreshold || '0'),
                        });
                        setDialogOpen(true);
                      }} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  {/* Stock Movement History */}
                  {expandedItem === item._id && (
                    <div className="ml-6 mt-2 mb-2 border-l-2 border-muted pl-4">
                      {movementsLoading ? (
                        <p className="text-sm text-muted-foreground py-2">Loading...</p>
                      ) : movements.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No stock movements yet</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Stock Movement History (FIFO)</p>
                          {movements.map((m, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-sm py-1">
                              <span className="text-xs text-muted-foreground w-20">{m.date?.substring(0, 10)}</span>
                              {m.type === 'purchase' ? (
                                <TrendingUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                              <span className={m.type === 'purchase' ? 'text-green-600' : 'text-red-500'}>
                                {m.type === 'purchase' ? '+' : ''}{m.quantity}
                              </span>
                              <span className="text-muted-foreground">@ {fmt(m.costPerUnit)}</span>
                              <span className="text-muted-foreground">= {fmt(Math.abs(m.totalCost))}</span>
                              {m.type === 'purchase' && m.remainingQty !== undefined && (
                                <Badge variant="outline" className="text-xs">{m.remainingQty} left</Badge>
                              )}
                              {m.insufficientStock && (
                                <Badge variant="destructive" className="text-xs">Insufficient</Badge>
                              )}
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
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Item Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Red Roses" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['units', 'stems', 'kg', 'grams', 'liters', 'ml', 'meters', 'pieces', 'sheets', 'rolls'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!editingItem && (
              <>
                <Separator />
                <p className="text-sm font-medium text-muted-foreground">Initial Stock (creates first FIFO batch)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Total Purchase Price ({'\u20B9'})</Label>
                    <Input type="number" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" value={form.purchaseQuantity} onChange={e => setForm(p => ({ ...p, purchaseQuantity: e.target.value }))} placeholder="1" />
                  </div>
                </div>
                {form.purchasePrice && form.purchaseQuantity && parseInt(form.purchaseQuantity) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Cost per unit: {fmt(parseFloat(form.purchasePrice) / parseInt(form.purchaseQuantity))}
                  </p>
                )}
              </>
            )}
            <div>
              <Label>Low Stock Alert Threshold</Label>
              <Input type="number" value={form.lowStockThreshold} onChange={e => setForm(p => ({ ...p, lowStockThreshold: e.target.value }))} placeholder="0 (disabled)" />
              <p className="text-xs text-muted-foreground mt-1">Shows alert when stock falls below this. Set 0 to disable.</p>
            </div>
            <Button onClick={handleSave} className="w-full">{editingItem ? 'Update Item' : 'Create Item'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Stock Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Stock Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Add a new purchase batch for <strong>{items.find(i => i._id === batchItemId)?.name}</strong></p>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={batchForm.date} onChange={e => setBatchForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={batchForm.quantity} onChange={e => setBatchForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Cost per Unit ({'\u20B9'})</Label>
                <Input type="number" step="0.01" value={batchForm.costPerUnit} onChange={e => setBatchForm(p => ({ ...p, costPerUnit: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            {batchForm.quantity && batchForm.costPerUnit && (
              <p className="text-sm text-muted-foreground">
                Total: {fmt(parseFloat(batchForm.quantity) * parseFloat(batchForm.costPerUnit))}
              </p>
            )}
            <Button onClick={handleAddBatch} className="w-full">Add Batch</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
