'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function SkuRecipesView() {
  const [recipes, setRecipes] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [form, setForm] = useState({
    sku: '', productName: '', consumableCost: '0', totalWeightGrams: '0',
    defaultWastageBuffer: '5', rawMaterials: [], packaging: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, rm, pm] = await Promise.all([
        fetch('/api/sku-recipes').then(r => r.json()),
        fetch('/api/raw-materials').then(r => r.json()),
        fetch('/api/packaging-materials').then(r => r.json()),
      ]);
      setRecipes(r); setRawMaterials(rm); setPackagingMaterials(pm);
    } catch (err) { toast.error('Failed to load'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const calcRecipeCost = (recipe) => {
    const rmCost = (recipe.rawMaterials || []).reduce((s, m) => s + (m.pricePerUnit || 0) * (m.quantity || 0), 0);
    const pkgCost = (recipe.packaging || []).reduce((s, m) => s + (m.pricePerUnit || 0), 0);
    const sub = rmCost + pkgCost + (recipe.consumableCost || 0);
    const wastage = sub * ((recipe.defaultWastageBuffer || 0) / 100);
    return { rmCost, pkgCost, subtotal: sub, wastage, total: sub + wastage };
  };

  const handleSubmit = async () => {
    const data = {
      ...form,
      consumableCost: Number(form.consumableCost),
      totalWeightGrams: Number(form.totalWeightGrams),
      defaultWastageBuffer: Number(form.defaultWastageBuffer),
    };
    try {
      if (editingRecipe) {
        await fetch(`/api/sku-recipes/${editingRecipe._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Recipe updated');
      } else {
        await fetch('/api/sku-recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Recipe created');
      }
      setDialogOpen(false); setEditingRecipe(null); fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const deleteRecipe = async (id) => {
    if (!confirm('Delete this recipe?')) return;
    await fetch(`/api/sku-recipes/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); fetchData();
  };

  const addRawMaterial = () => {
    setForm({ ...form, rawMaterials: [...form.rawMaterials, { materialId: '', name: '', quantity: 1, pricePerUnit: 0, unitMeasurement: 'grams' }] });
  };

  const addPackaging = () => {
    setForm({ ...form, packaging: [...form.packaging, { materialId: '', name: '', pricePerUnit: 0 }] });
  };

  const openEdit = (recipe) => {
    setEditingRecipe(recipe);
    setForm({
      sku: recipe.sku, productName: recipe.productName,
      consumableCost: String(recipe.consumableCost || 0),
      totalWeightGrams: String(recipe.totalWeightGrams || 0),
      defaultWastageBuffer: String(recipe.defaultWastageBuffer || 5),
      rawMaterials: recipe.rawMaterials || [],
      packaging: recipe.packaging || [],
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">Define product recipes to auto-calculate COGS per order</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingRecipe(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ sku: '', productName: '', consumableCost: '0', totalWeightGrams: '0', defaultWastageBuffer: '5', rawMaterials: [], packaging: [] })}>
              <Plus className="w-4 h-4 mr-2" /> New Recipe
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingRecipe ? 'Edit' : 'New'} SKU Recipe</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>SKU Code</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="GS-CHOCO-500" /></div>
                <div><Label>Product Name</Label><Input value={form.productName} onChange={e => setForm({...form, productName: e.target.value})} /></div>
                <div><Label>Consumable Cost</Label><Input type="number" value={form.consumableCost} onChange={e => setForm({...form, consumableCost: e.target.value})} /></div>
                <div><Label>Weight (grams)</Label><Input type="number" value={form.totalWeightGrams} onChange={e => setForm({...form, totalWeightGrams: e.target.value})} /></div>
                <div><Label>Wastage Buffer %</Label><Input type="number" value={form.defaultWastageBuffer} onChange={e => setForm({...form, defaultWastageBuffer: e.target.value})} /></div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-sm font-semibold">Raw Materials</Label>
                  <Button size="sm" variant="outline" onClick={addRawMaterial}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                </div>
                {form.rawMaterials.map((rm, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <div className="flex-1"><Input placeholder="Name" value={rm.name} onChange={e => { const arr = [...form.rawMaterials]; arr[i].name = e.target.value; setForm({...form, rawMaterials: arr}); }} /></div>
                    <div className="w-20"><Input type="number" placeholder="Qty" value={rm.quantity} onChange={e => { const arr = [...form.rawMaterials]; arr[i].quantity = Number(e.target.value); setForm({...form, rawMaterials: arr}); }} /></div>
                    <div className="w-24"><Input type="number" placeholder="Price" value={rm.pricePerUnit} onChange={e => { const arr = [...form.rawMaterials]; arr[i].pricePerUnit = Number(e.target.value); setForm({...form, rawMaterials: arr}); }} /></div>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { const arr = form.rawMaterials.filter((_, j) => j !== i); setForm({...form, rawMaterials: arr}); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-sm font-semibold">Packaging</Label>
                  <Button size="sm" variant="outline" onClick={addPackaging}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                </div>
                {form.packaging.map((pkg, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <div className="flex-1"><Input placeholder="Name" value={pkg.name} onChange={e => { const arr = [...form.packaging]; arr[i].name = e.target.value; setForm({...form, packaging: arr}); }} /></div>
                    <div className="w-24"><Input type="number" placeholder="Price" value={pkg.pricePerUnit} onChange={e => { const arr = [...form.packaging]; arr[i].pricePerUnit = Number(e.target.value); setForm({...form, packaging: arr}); }} /></div>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { const arr = form.packaging.filter((_, j) => j !== i); setForm({...form, packaging: arr}); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={handleSubmit} className="w-full mt-2">{editingRecipe ? 'Update' : 'Create'} Recipe</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {recipes.map(recipe => {
          const costs = calcRecipeCost(recipe);
          const isExpanded = expandedId === recipe._id;
          return (
            <Card key={recipe._id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(isExpanded ? null : recipe._id)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">{recipe.productName}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{recipe.sku}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold">{fmt(Math.round(costs.total))}</p>
                    <p className="text-xs text-muted-foreground">Total COGS</p>
                  </div>
                  <Badge variant="outline">{recipe.totalWeightGrams}g</Badge>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(recipe)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteRecipe(recipe._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t p-4 bg-muted/20 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div><span className="text-muted-foreground">Raw Materials</span><p className="font-bold text-sm">{fmt(costs.rmCost)}</p></div>
                    <div><span className="text-muted-foreground">Packaging</span><p className="font-bold text-sm">{fmt(costs.pkgCost)}</p></div>
                    <div><span className="text-muted-foreground">Consumables</span><p className="font-bold text-sm">{fmt(recipe.consumableCost)}</p></div>
                    <div><span className="text-muted-foreground">Wastage ({recipe.defaultWastageBuffer}%)</span><p className="font-bold text-sm">{fmt(Math.round(costs.wastage))}</p></div>
                    <div><span className="font-semibold">Total COGS</span><p className="font-bold text-lg text-primary">{fmt(Math.round(costs.total))}</p></div>
                  </div>
                  {recipe.rawMaterials?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Raw Materials:</p>
                      <div className="flex flex-wrap gap-2">
                        {recipe.rawMaterials.map((rm, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{rm.name}: {rm.quantity} x {fmt(rm.pricePerUnit)}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {recipe.packaging?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Packaging:</p>
                      <div className="flex flex-wrap gap-2">
                        {recipe.packaging.map((pkg, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{pkg.name}: {fmt(pkg.pricePerUnit)}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {recipes.length === 0 && !loading && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No SKU recipes yet. Create one to start calculating COGS.</CardContent></Card>
      )}
    </div>
  );
}
