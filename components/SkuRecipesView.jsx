'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Package, ChevronDown, ChevronUp, AlertCircle, Boxes } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function SkuRecipesView() {
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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

  // Group inventory items by category
  const inventoryByCategory = {};
  inventoryItems.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!inventoryByCategory[cat]) inventoryByCategory[cat] = [];
    inventoryByCategory[cat].push(item);
  });
  const categories = Object.keys(inventoryByCategory).sort();

  // Calculate recipe costs using yield-aware math
  const calcRecipeCost = (recipe) => {
    let total = 0;
    const breakdown = {};
    (recipe.ingredients || []).forEach(ing => {
      const costPerUse = (ing.costPerUnit || 0) / Math.max(1, ing.yieldPerUnit || 1);
      const lineCost = costPerUse * (ing.quantity || 0);
      total += lineCost;
      const cat = ing.category || 'Uncategorized';
      breakdown[cat] = (breakdown[cat] || 0) + lineCost;
    });
    // Support legacy rawMaterials/packaging format
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
    // Build the recipe data with ingredients + backward-compatible rawMaterials/packaging
    const rawMaterials = [];
    const packaging = [];
    const ingredients = form.ingredients.map(ing => {
      const item = inventoryItems.find(i => i._id === ing.inventoryItemId);
      const result = {
        inventoryItemId: ing.inventoryItemId,
        name: item?.name || ing.name,
        category: item?.category || ing.category,
        quantity: Number(ing.quantity) || 0,
        costPerUnit: item?.costPerUnit || ing.costPerUnit || 0,
        yieldPerUnit: item?.yieldPerUnit || ing.yieldPerUnit || 1,
        unitMeasurement: item?.unitMeasurement || ing.unitMeasurement || 'units',
      };
      // Also populate legacy format for backward compatibility with profitCalculator
      if (result.category === 'Raw Material') {
        rawMaterials.push({
          name: result.name,
          quantity: result.quantity,
          pricePerUnit: result.costPerUnit / Math.max(1, result.yieldPerUnit),
          unitMeasurement: result.unitMeasurement,
        });
      } else if (result.category === 'Packaging') {
        packaging.push({
          name: result.name,
          pricePerUnit: (result.costPerUnit / Math.max(1, result.yieldPerUnit)) * result.quantity,
        });
      }
      return result;
    });

    // Include non-Raw/Packaging items as consumableCost
    let consumableCost = 0;
    ingredients.forEach(ing => {
      if (ing.category !== 'Raw Material' && ing.category !== 'Packaging') {
        const costPerUse = (ing.costPerUnit || 0) / Math.max(1, ing.yieldPerUnit || 1);
        consumableCost += costPerUse * (ing.quantity || 0);
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

  // Add an inventory item as ingredient
  const addIngredient = (itemId) => {
    if (!itemId) return;
    const item = inventoryItems.find(i => i._id === itemId);
    if (!item) return;
    if (form.ingredients.some(ing => ing.inventoryItemId === itemId)) {
      toast.error('Item already in recipe'); return;
    }
    setForm({
      ...form,
      ingredients: [...form.ingredients, {
        inventoryItemId: item._id,
        name: item.name,
        category: item.category,
        quantity: 1,
        costPerUnit: item.costPerUnit,
        yieldPerUnit: item.yieldPerUnit || 1,
        unitMeasurement: item.unitMeasurement,
      }],
    });
  };

  const openEdit = (recipe) => {
    setEditingRecipe(recipe);
    // Convert legacy format to ingredients if needed
    let ingredients = recipe.ingredients || [];
    if (ingredients.length === 0) {
      (recipe.rawMaterials || []).forEach(rm => {
        ingredients.push({
          inventoryItemId: rm.materialId || '',
          name: rm.name, category: 'Raw Material',
          quantity: rm.quantity || 0, costPerUnit: rm.pricePerUnit || 0,
          yieldPerUnit: 1, unitMeasurement: rm.unitMeasurement || 'units',
        });
      });
      (recipe.packaging || []).forEach(pkg => {
        ingredients.push({
          inventoryItemId: pkg.materialId || '',
          name: pkg.name, category: 'Packaging',
          quantity: 1, costPerUnit: pkg.pricePerUnit || 0,
          yieldPerUnit: 1, unitMeasurement: 'units',
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

  // Get available items per category (not yet in recipe)
  const getAvailable = (category) => {
    const catItems = inventoryByCategory[category] || [];
    return catItems.filter(i => !form.ingredients.some(ing => ing.inventoryItemId === i._id));
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Define product recipes with yield-aware COGS. Materials from Inventory are auto-costed.</p>
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
                <div><Label>SKU Code</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="GS-CHOCO-500" /></div>
                <div><Label>Product Name</Label><Input value={form.productName} onChange={e => setForm({...form, productName: e.target.value})} /></div>
                <div className="col-span-2"><Label>Wastage Buffer %</Label><Input type="number" value={form.defaultWastageBuffer} onChange={e => setForm({...form, defaultWastageBuffer: e.target.value})} /></div>
              </div>

              {/* Dynamic Category Sections from Inventory */}
              {inventoryItems.length === 0 && (
                <div className="p-4 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    No inventory items found. Add items in the <strong>Inventory</strong> page first to populate dropdowns here.
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
                                {item.name} ({fmt(item.costPerUnit / Math.max(1, item.yieldPerUnit))}/use)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {categoryIngredients.map((ing, idx) => {
                      const globalIdx = form.ingredients.indexOf(ing);
                      const costPerUse = (ing.costPerUnit || 0) / Math.max(1, ing.yieldPerUnit || 1);
                      const lineCost = costPerUse * (ing.quantity || 0);
                      return (
                        <div key={globalIdx} className="flex gap-2 items-center pl-6">
                          <div className="flex-1 h-9 px-3 border rounded-md bg-muted/30 flex items-center text-sm truncate">
                            {ing.name}
                            {ing.yieldPerUnit > 1 && <Badge variant="secondary" className="ml-2 text-[10px]">yield:{ing.yieldPerUnit}</Badge>}
                          </div>
                          <div className="w-20">
                            <Input type="number" min="0" step="0.01" className="h-9 text-sm" placeholder="Qty" value={ing.quantity}
                              onChange={e => {
                                const arr = [...form.ingredients];
                                arr[globalIdx] = { ...arr[globalIdx], quantity: Number(e.target.value) };
                                setForm({...form, ingredients: arr});
                              }}
                            />
                          </div>
                          <div className="w-24 text-right text-xs text-muted-foreground whitespace-nowrap">
                            <span className="font-medium text-foreground">{fmt(lineCost)}</span>
                            <br />{fmt(costPerUse)}/use
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

              {/* Recipe Cost Preview */}
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

      {/* Recipe Cards */}
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
                  {/* Cost breakdown by category */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {Object.entries(costs.breakdown).map(([cat, amt]) => (
                      <div key={cat}><span className="text-muted-foreground">{cat}</span><p className="font-bold text-sm">{fmt(amt)}</p></div>
                    ))}
                    <div><span className="text-muted-foreground">Wastage ({recipe.defaultWastageBuffer || 0}%)</span><p className="font-bold text-sm">{fmt(Math.round(costs.wastage))}</p></div>
                    <div><span className="font-semibold">Total COGS</span><p className="font-bold text-lg text-primary">{fmt(Math.round(costs.total))}</p></div>
                  </div>
                  {/* Ingredient list */}
                  {(recipe.ingredients || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recipe.ingredients.map((ing, i) => {
                        const cpu = (ing.costPerUnit || 0) / Math.max(1, ing.yieldPerUnit || 1);
                        return (
                          <Badge key={i} variant="outline" className="text-xs">
                            {ing.name}: {ing.quantity} x {fmt(cpu)}
                            {ing.yieldPerUnit > 1 && <span className="text-muted-foreground ml-1">(yield:{ing.yieldPerUnit})</span>}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {/* Legacy display */}
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
          <p className="text-sm mt-1">Sync products from Shopify or create recipes manually. Add inventory items first for dropdown selection.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
