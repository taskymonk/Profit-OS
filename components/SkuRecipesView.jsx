'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, ChevronDown, ChevronUp, AlertCircle, Boxes, Info, X } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function SkuRecipesView() {
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showGuide, setShowGuide] = useState(true);

  const [form, setForm] = useState({
    sku: '', productName: '', defaultWastageBuffer: '5',
    ingredients: [],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, inv] = await Promise.all([
        fetch('/api/sku-recipes').then(r => r.json()),
        fetch('/api/inventory-items').then(r => r.json()),
      ]);
      setRecipes(Array.isArray(r) ? r : []);
      setInventoryItems(Array.isArray(inv) ? inv : []);
    } catch (err) { toast.error('Failed to load'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const inventoryByCategory = {};
  inventoryItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!inventoryByCategory[cat]) inventoryByCategory[cat] = [];
    inventoryByCategory[cat].push(item);
  });
  const categories = Object.keys(inventoryByCategory).sort();

  // Get baseCostPerUnit for an inventory item (backward-compatible)
  const getItemBaseCost = (item) => {
    if (item.baseCostPerUnit) return item.baseCostPerUnit;
    const price = item.purchasePrice ?? item.costPerUnit ?? 0;
    const qty = item.purchaseQuantity || item.yieldPerUnit || 1;
    return price / Math.max(1, qty);
  };

  // Calculate recipe costs using BOM architecture: quantityUsed * baseCostPerUnit
  const calcRecipeCost = (recipe) => {
    let total = 0;
    const breakdown = {};
    (recipe.ingredients || []).forEach(ing => {
      const baseCost = ing.baseCostPerUnit || 0;
      const qtyUsed = ing.quantityUsed || ing.quantity || 0;
      const lineCost = qtyUsed * baseCost;
      total += lineCost;
      const cat = ing.category || 'Uncategorized';
      breakdown[cat] = (breakdown[cat] || 0) + lineCost;
    });
    // Legacy format support
    (recipe.rawMaterials || []).forEach(rm => {
      const cost = (rm.pricePerUnit || 0) * (rm.quantity || 0);
      total += cost;
      breakdown['Raw Material'] = (breakdown['Raw Material'] || 0) + cost;
    });
    (recipe.packaging || []).forEach(pkg => {
      total += (pkg.pricePerUnit || 0);
      breakdown['Packaging'] = (breakdown['Packaging'] || 0) + (pkg.pricePerUnit || 0);
    });
    const wastage = total * ((recipe.defaultWastageBuffer || 0) / 100);
    return { subtotal: total, wastage, total: total + wastage, breakdown };
  };

  const handleSubmit = async () => {
    // Build BOM ingredients with baseCostPerUnit + quantityUsed
    // Also maintain backward-compatible rawMaterials/packaging for profitCalculator legacy path
    const rawMaterials = [];
    const packaging = [];
    const ingredients = form.ingredients.map(ing => {
      const item = inventoryItems.find(i => i._id === ing.inventoryItemId);
      const baseCost = item ? getItemBaseCost(item) : (ing.baseCostPerUnit || 0);
      const unit = item?.unit || item?.unitMeasurement || ing.unit || 'units';
      const result = {
        inventoryItemId: ing.inventoryItemId,
        name: item?.name || ing.name,
        category: item?.category || ing.category,
        quantityUsed: Number(ing.quantityUsed) || 0,
        baseCostPerUnit: Math.round(baseCost * 100) / 100,
        unit: unit,
      };
      // Legacy format for backward compatibility
      if (result.category === 'Raw Material') {
        rawMaterials.push({ name: result.name, quantity: result.quantityUsed, pricePerUnit: result.baseCostPerUnit, unitMeasurement: unit });
      } else if (result.category === 'Packaging') {
        packaging.push({ name: result.name, pricePerUnit: result.baseCostPerUnit * result.quantityUsed });
      }
      return result;
    });

    let consumableCost = 0;
    ingredients.forEach(ing => {
      if (ing.category !== 'Raw Material' && ing.category !== 'Packaging') {
        consumableCost += (ing.baseCostPerUnit || 0) * (ing.quantityUsed || 0);
      }
    });

    const data = {
      sku: form.sku,
      productName: form.productName,
      defaultWastageBuffer: Number(form.defaultWastageBuffer),
      ingredients,
      rawMaterials,
      packaging,
      consumableCost,
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

  const addIngredient = (itemId) => {
    if (!itemId) return;
    const item = inventoryItems.find(i => i._id === itemId);
    if (!item) return;
    if (form.ingredients.some(ing => ing.inventoryItemId === itemId)) {
      toast.error('Item already in recipe'); return;
    }
    const baseCost = getItemBaseCost(item);
    setForm({
      ...form,
      ingredients: [...form.ingredients, {
        inventoryItemId: item._id,
        name: item.name,
        category: item.category,
        quantityUsed: 1,
        baseCostPerUnit: Math.round(baseCost * 100) / 100,
        unit: item.unit || item.unitMeasurement || 'units',
      }],
    });
  };

  const openEdit = (recipe) => {
    setEditingRecipe(recipe);
    let ingredients = (recipe.ingredients || []).map(ing => {
      // For existing BOM ingredients, lookup latest baseCost from inventory
      const item = inventoryItems.find(i => i._id === ing.inventoryItemId);
      return {
        inventoryItemId: ing.inventoryItemId || '',
        name: ing.name,
        category: ing.category || 'Raw Material',
        quantityUsed: ing.quantityUsed || ing.quantity || 0,
        baseCostPerUnit: item ? getItemBaseCost(item) : (ing.baseCostPerUnit || ing.costPerUnit || 0),
        unit: ing.unit || ing.unitMeasurement || 'units',
      };
    });
    // Convert legacy format
    if (ingredients.length === 0) {
      (recipe.rawMaterials || []).forEach(rm => {
        ingredients.push({
          inventoryItemId: rm.materialId || '',
          name: rm.name, category: 'Raw Material',
          quantityUsed: rm.quantity || 0, baseCostPerUnit: rm.pricePerUnit || 0,
          unit: rm.unitMeasurement || 'units',
        });
      });
      (recipe.packaging || []).forEach(pkg => {
        ingredients.push({
          inventoryItemId: pkg.materialId || '',
          name: pkg.name, category: 'Packaging',
          quantityUsed: 1, baseCostPerUnit: pkg.pricePerUnit || 0,
          unit: 'units',
        });
      });
    }
    setForm({
      sku: recipe.sku, productName: recipe.productName,
      defaultWastageBuffer: String(recipe.defaultWastageBuffer || 5),
      ingredients,
    });
    setDialogOpen(true);
  };

  const getAvailable = (category) => {
    const catItems = inventoryByCategory[category] || [];
    return catItems.filter(i => !form.ingredients.some(ing => ing.inventoryItemId === i._id));
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Inline UX Guide */}
      {showGuide && (
        <div className="relative rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 p-5">
          <button onClick={() => setShowGuide(false)} className="absolute top-3 right-3 text-emerald-400 hover:text-emerald-600 transition">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Info className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">How SKU Recipes Work</h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Build your product recipes by selecting items from your Inventory. <strong>Example:</strong> If a mini album uses <strong>0.5 meters of bubble wrap</strong>, just enter '0.5'. The engine will calculate the exact cost per order (<strong>0.5 x {"\u20B9"}10 = {"\u20B9"}5.00</strong>).
              </p>
              <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-2">Line Cost = Quantity Used x Base Cost Per Unit (from Inventory)</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Define product BOM recipes. Materials from Inventory are auto-costed.</p>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingRecipe(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ sku: '', productName: '', defaultWastageBuffer: '5', ingredients: [] })}>
              <Plus className="w-4 h-4 mr-2" /> New Recipe
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingRecipe ? 'Edit' : 'New'} SKU Recipe</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>SKU Code</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="GS-ALBUM-MINI" /></div>
                <div><Label>Product Name</Label><Input value={form.productName} onChange={e => setForm({...form, productName: e.target.value})} /></div>
                <div className="col-span-2"><Label>Wastage Buffer %</Label><Input type="number" value={form.defaultWastageBuffer} onChange={e => setForm({...form, defaultWastageBuffer: e.target.value})} /></div>
              </div>

              {inventoryItems.length === 0 && (
                <div className="p-4 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    No inventory items found. Add items in the <strong>Inventory</strong> page first.
                  </p>
                </div>
              )}

              {categories.map(category => {
                const available = getAvailable(category);
                const categoryIngredients = form.ingredients.filter(ing => ing.category === category);
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-primary" />
                        <Label className="text-sm font-semibold">{category}</Label>
                        <Badge variant="outline" className="text-[10px]">{categoryIngredients.length} items</Badge>
                      </div>
                      {available.length > 0 && (
                        <Select onValueChange={addIngredient}>
                          <SelectTrigger className="w-56 h-8 text-xs">
                            <SelectValue placeholder={`Add ${category.toLowerCase()}...`} />
                          </SelectTrigger>
                          <SelectContent>
                            {available.map(item => (
                              <SelectItem key={item._id} value={item._id}>
                                {item.name} ({fmt(getItemBaseCost(item))}/{item.unit || item.unitMeasurement || 'unit'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {categoryIngredients.map((ing) => {
                      const globalIdx = form.ingredients.indexOf(ing);
                      const lineCost = (ing.baseCostPerUnit || 0) * (ing.quantityUsed || 0);
                      return (
                        <div key={globalIdx} className="flex gap-2 items-center pl-6">
                          <div className="flex-1 h-9 px-3 border rounded-md bg-muted/30 flex items-center text-sm truncate">
                            {ing.name}
                            <Badge variant="secondary" className="ml-2 text-[10px]">{fmt(ing.baseCostPerUnit)}/{ing.unit}</Badge>
                          </div>
                          <div className="w-24">
                            <Input type="number" min="0" step="0.01" className="h-9 text-sm" placeholder="Qty Used" value={ing.quantityUsed}
                              onChange={e => {
                                const arr = [...form.ingredients];
                                arr[globalIdx] = { ...arr[globalIdx], quantityUsed: Number(e.target.value) };
                                setForm({...form, ingredients: arr});
                              }}
                            />
                          </div>
                          <div className="w-24 text-right text-xs text-muted-foreground whitespace-nowrap">
                            <span className="font-medium text-foreground">{fmt(lineCost)}</span>
                            <br /><span className="text-[10px]">{ing.quantityUsed || 0} x {fmt(ing.baseCostPerUnit)}</span>
                          </div>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => {
                            setForm({...form, ingredients: form.ingredients.filter((_, j) => j !== globalIdx)});
                          }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      );
                    })}
                    {categoryIngredients.length === 0 && (
                      <p className="text-xs text-muted-foreground pl-6">No {category.toLowerCase()} added. Select from dropdown above.</p>
                    )}
                  </div>
                );
              })}

              {form.ingredients.length > 0 && (
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20 space-y-1">
                  <p className="text-xs font-semibold text-primary">Recipe Cost Preview</p>
                  {(() => {
                    const costs = calcRecipeCost({ ...form, defaultWastageBuffer: Number(form.defaultWastageBuffer) });
                    return (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Subtotal</span><p className="font-bold">{fmt(costs.subtotal)}</p></div>
                        <div><span className="text-muted-foreground">Wastage ({form.defaultWastageBuffer}%)</span><p className="font-bold">{fmt(costs.wastage)}</p></div>
                        <div><span className="text-muted-foreground">Total COGS</span><p className="font-bold text-lg text-primary">{fmt(costs.total)}</p></div>
                      </div>
                    );
                  })()}
                </div>
              )}
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
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(recipe)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteRecipe(recipe._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t p-4 bg-muted/20 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {Object.entries(costs.breakdown).map(([cat, amt]) => (
                      <div key={cat}><span className="text-muted-foreground">{cat}</span><p className="font-bold text-sm">{fmt(amt)}</p></div>
                    ))}
                    <div><span className="text-muted-foreground">Wastage ({recipe.defaultWastageBuffer || 0}%)</span><p className="font-bold text-sm">{fmt(Math.round(costs.wastage))}</p></div>
                    <div><span className="font-semibold">Total COGS</span><p className="font-bold text-lg text-primary">{fmt(Math.round(costs.total))}</p></div>
                  </div>
                  {(recipe.ingredients || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recipe.ingredients.map((ing, i) => {
                        const baseCost = ing.baseCostPerUnit || 0;
                        const qtyUsed = ing.quantityUsed || ing.quantity || 0;
                        return (
                          <Badge key={i} variant="outline" className="text-xs">
                            {ing.name}: {qtyUsed} {ing.unit || ''} x {fmt(baseCost)} = {fmt(qtyUsed * baseCost)}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {(recipe.ingredients || []).length === 0 && (recipe.rawMaterials || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(recipe.rawMaterials || []).map((rm, i) => (
                        <Badge key={`rm-${i}`} variant="outline" className="text-xs">{rm.name}: {rm.quantity} x {fmt(rm.pricePerUnit)}</Badge>
                      ))}
                      {(recipe.packaging || []).map((pkg, i) => (
                        <Badge key={`pkg-${i}`} variant="outline" className="text-xs">{pkg.name}: {fmt(pkg.pricePerUnit)}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {recipes.length === 0 && !loading && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
          <p className="font-medium">No SKU recipes yet</p>
          <p className="text-sm mt-1">Sync products from Shopify or create recipes manually. Add inventory items first.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
