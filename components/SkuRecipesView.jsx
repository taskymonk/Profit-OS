'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
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
      setRecipes(Array.isArray(r) ? r : []);
      setRawMaterials(Array.isArray(rm) ? rm : []);
      setPackagingMaterials(Array.isArray(pm) ? pm : []);
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

  // Add raw material from dropdown
  const addRawMaterial = (materialId) => {
    if (!materialId) return;
    const mat = rawMaterials.find(m => m._id === materialId);
    if (!mat) return;
    // Prevent duplicates
    if (form.rawMaterials.some(rm => rm.materialId === materialId)) {
      toast.error('Material already added');
      return;
    }
    setForm({
      ...form,
      rawMaterials: [...form.rawMaterials, {
        materialId: mat._id,
        name: mat.name,
        quantity: 1,
        pricePerUnit: mat.pricePerUnit || 0,
        unitMeasurement: mat.unitMeasurement || 'grams'
      }]
    });
  };

  // Add raw material manually (when no materials in DB)
  const addManualRawMaterial = () => {
    setForm({
      ...form,
      rawMaterials: [...form.rawMaterials, {
        materialId: '', name: '', quantity: 1, pricePerUnit: 0, unitMeasurement: 'grams'
      }]
    });
  };

  // Add packaging from dropdown
  const addPackaging = (materialId) => {
    if (!materialId) return;
    const mat = packagingMaterials.find(m => m._id === materialId);
    if (!mat) return;
    if (form.packaging.some(p => p.materialId === materialId)) {
      toast.error('Packaging already added');
      return;
    }
    setForm({
      ...form,
      packaging: [...form.packaging, {
        materialId: mat._id,
        name: mat.name,
        pricePerUnit: mat.pricePerUnit || 0,
      }]
    });
  };

  // Add packaging manually
  const addManualPackaging = () => {
    setForm({
      ...form,
      packaging: [...form.packaging, {
        materialId: '', name: '', pricePerUnit: 0
      }]
    });
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

  // Get materials not yet added to the form
  const availableRawMaterials = rawMaterials.filter(m => !form.rawMaterials.some(rm => rm.materialId === m._id));
  const availablePackaging = packagingMaterials.filter(m => !form.packaging.some(p => p.materialId === m._id));

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
                <div className="col-span-2"><Label>Wastage Buffer %</Label><Input type="number" value={form.defaultWastageBuffer} onChange={e => setForm({...form, defaultWastageBuffer: e.target.value})} /></div>
              </div>

              {/* ============ RAW MATERIALS ============ */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-sm font-semibold">Raw Materials</Label>
                  <div className="flex gap-2">
                    {rawMaterials.length > 0 ? (
                      <Select onValueChange={addRawMaterial}>
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Select material..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRawMaterials.map(m => (
                            <SelectItem key={m._id} value={m._id}>
                              {m.name} ({fmt(m.pricePerUnit)}/{m.unitMeasurement || 'unit'})
                            </SelectItem>
                          ))}
                          {availableRawMaterials.length === 0 && (
                            <SelectItem value="_none" disabled>All materials added</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button size="sm" variant="outline" onClick={addManualRawMaterial}>
                        <Plus className="w-3 h-3 mr-1" /> Add Manually
                      </Button>
                    )}
                  </div>
                </div>
                {rawMaterials.length === 0 && form.rawMaterials.length === 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No materials in inventory. Add materials in the Inventory page, or type manually below.
                  </p>
                )}
                {form.rawMaterials.map((rm, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <div className="flex-1">
                      {rm.materialId && rawMaterials.find(m => m._id === rm.materialId) ? (
                        <div className="h-9 px-3 border rounded-md bg-muted/30 flex items-center text-sm">{rm.name}</div>
                      ) : (
                        <Input placeholder="Material name" value={rm.name} onChange={e => {
                          const arr = [...form.rawMaterials]; arr[i] = { ...arr[i], name: e.target.value };
                          setForm({...form, rawMaterials: arr});
                        }} />
                      )}
                    </div>
                    <div className="w-20">
                      <Input type="number" placeholder="Qty" value={rm.quantity} onChange={e => {
                        const arr = [...form.rawMaterials]; arr[i] = { ...arr[i], quantity: Number(e.target.value) };
                        setForm({...form, rawMaterials: arr});
                      }} />
                    </div>
                    <div className="w-24">
                      <Input type="number" placeholder="Price/unit" value={rm.pricePerUnit} onChange={e => {
                        const arr = [...form.rawMaterials]; arr[i] = { ...arr[i], pricePerUnit: Number(e.target.value) };
                        setForm({...form, rawMaterials: arr});
                      }} />
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => {
                      setForm({...form, rawMaterials: form.rawMaterials.filter((_, j) => j !== i)});
                    }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>

              {/* ============ PACKAGING ============ */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-sm font-semibold">Packaging</Label>
                  <div className="flex gap-2">
                    {packagingMaterials.length > 0 ? (
                      <Select onValueChange={addPackaging}>
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Select packaging..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePackaging.map(m => (
                            <SelectItem key={m._id} value={m._id}>
                              {m.name} ({fmt(m.pricePerUnit)})
                            </SelectItem>
                          ))}
                          {availablePackaging.length === 0 && (
                            <SelectItem value="_none" disabled>All packaging added</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button size="sm" variant="outline" onClick={addManualPackaging}>
                        <Plus className="w-3 h-3 mr-1" /> Add Manually
                      </Button>
                    )}
                  </div>
                </div>
                {packagingMaterials.length === 0 && form.packaging.length === 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No packaging in inventory. Add items in the Inventory page, or type manually below.
                  </p>
                )}
                {form.packaging.map((pkg, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <div className="flex-1">
                      {pkg.materialId && packagingMaterials.find(m => m._id === pkg.materialId) ? (
                        <div className="h-9 px-3 border rounded-md bg-muted/30 flex items-center text-sm">{pkg.name}</div>
                      ) : (
                        <Input placeholder="Packaging name" value={pkg.name} onChange={e => {
                          const arr = [...form.packaging]; arr[i] = { ...arr[i], name: e.target.value };
                          setForm({...form, packaging: arr});
                        }} />
                      )}
                    </div>
                    <div className="w-24">
                      <Input type="number" placeholder="Price" value={pkg.pricePerUnit} onChange={e => {
                        const arr = [...form.packaging]; arr[i] = { ...arr[i], pricePerUnit: Number(e.target.value) };
                        setForm({...form, packaging: arr});
                      }} />
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => {
                      setForm({...form, packaging: form.packaging.filter((_, j) => j !== i)});
                    }}><Trash2 className="w-3.5 h-3.5" /></Button>
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
        <Card><CardContent className="py-12 text-center text-muted-foreground">No SKU recipes yet. Sync from Shopify or create one manually to start calculating COGS.</CardContent></Card>
      )}
    </div>
  );
}
