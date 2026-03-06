'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import GuideCard from '@/components/GuideCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Trash2, Edit, Package, ChevronDown, ChevronRight, AlertCircle, Boxes, Info, X,
  Search, FileText, Copy, Link2, Unlink, RefreshCw, CheckCircle2, ArrowUpDown, LayoutTemplate, Zap
} from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SkuRecipesView() {
  const [recipes, setRecipes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'needs-setup' | 'has-recipe'
  const [sortBy, setSortBy] = useState('orders'); // 'orders' | 'name' | 'revenue'
  const [searchTerm, setSearchTerm] = useState('');
  const [applySearch, setApplySearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Dialogs
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [applyingTemplate, setApplyingTemplate] = useState(null);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState([]);

  // Recipe form
  const [recipeForm, setRecipeForm] = useState({
    sku: '', productName: '', defaultWastageBuffer: '5', ingredients: [],
  });

  // Template form
  const [templateForm, setTemplateForm] = useState({
    name: '', description: '', defaultWastageBuffer: '5', ingredients: [],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t, inv] = await Promise.all([
        fetch('/api/sku-recipes').then(r => r.json()),
        fetch('/api/recipe-templates').then(r => r.json()),
        fetch('/api/inventory-items').then(r => r.json()),
      ]);
      setRecipes(Array.isArray(r) ? r : []);
      setTemplates(Array.isArray(t) ? t : []);
      setInventoryItems(Array.isArray(inv) ? inv : []);
    } catch (err) { toast.error('Failed to load data'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== Derived data =====
  const inventoryByCategory = useMemo(() => {
    const map = {};
    inventoryItems.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [inventoryItems]);

  const categories = Object.keys(inventoryByCategory).sort();

  const getItemBaseCost = (item) => {
    if (item.avgCostPerUnit && item.avgCostPerUnit > 0) return item.avgCostPerUnit;
    if (item.baseCostPerUnit) return item.baseCostPerUnit;
    const price = item.purchasePrice ?? 0;
    const qty = item.purchaseQuantity || 1;
    return price / Math.max(1, qty);
  };

  const calcRecipeCost = (recipe) => {
    let total = 0;
    const breakdown = {};
    (recipe.ingredients || []).forEach(ing => {
      const baseCost = ing.baseCostPerUnit || 0;
      const qtyUsed = ing.quantityUsed || 0;
      const lineCost = qtyUsed * baseCost;
      total += lineCost;
      const cat = ing.category || 'Uncategorized';
      breakdown[cat] = (breakdown[cat] || 0) + lineCost;
    });
    (recipe.rawMaterials || []).forEach(rm => {
      const cost = (rm.pricePerUnit || 0) * (rm.quantity || 0);
      total += cost;
      breakdown['Raw Material'] = (breakdown['Raw Material'] || 0) + cost;
    });
    (recipe.packaging || []).forEach(pkg => {
      total += pkg.pricePerUnit || 0;
      breakdown['Packaging'] = (breakdown['Packaging'] || 0) + (pkg.pricePerUnit || 0);
    });
    const wastage = total * ((recipe.defaultWastageBuffer || 0) / 100);
    return { subtotal: total, wastage, total: total + wastage, breakdown };
  };

  // Stats
  const totalRecipes = recipes.length;
  const needsSetup = recipes.filter(r => r.needsCostInput || (r.ingredients || []).length === 0).length;
  const hasRecipe = totalRecipes - needsSetup;
  const totalOrders = recipes.reduce((s, r) => s + (r.orderCount || 0), 0);
  const coveredOrders = recipes.filter(r => (r.ingredients || []).length > 0).reduce((s, r) => s + (r.orderCount || 0), 0);
  const coveragePercent = totalOrders > 0 ? Math.round((coveredOrders / totalOrders) * 100) : 0;

  // Filtered & sorted
  const filteredRecipes = useMemo(() => {
    let list = [...recipes];
    if (filter === 'needs-setup') list = list.filter(r => r.needsCostInput || (r.ingredients || []).length === 0);
    if (filter === 'has-recipe') list = list.filter(r => (r.ingredients || []).length > 0);
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(r => r.productName?.toLowerCase().includes(s) || r.sku?.toLowerCase().includes(s));
    }
    if (sortBy === 'orders') list.sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
    if (sortBy === 'name') list.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    if (sortBy === 'revenue') list.sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0));
    return list;
  }, [recipes, filter, searchTerm, sortBy]);

  // ===== Ingredient helpers =====
  const addIngredient = (form, setForm, itemId) => {
    const item = inventoryItems.find(i => i._id === itemId);
    if (!item) return;
    if (form.ingredients.some(ing => ing.inventoryItemId === itemId)) {
      toast.error('Already added'); return;
    }
    setForm({
      ...form,
      ingredients: [...form.ingredients, {
        inventoryItemId: item._id, name: item.name,
        inventoryItemName: item.name,
        category: item.category, quantityUsed: 1,
        baseCostPerUnit: Math.round(getItemBaseCost(item) * 100) / 100,
        unit: item.unit || 'units',
      }],
    });
  };

  const removeIngredient = (form, setForm, idx) => {
    setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== idx) });
  };

  const updateIngredientQty = (form, setForm, idx, qty) => {
    const arr = [...form.ingredients];
    arr[idx] = { ...arr[idx], quantityUsed: Number(qty) };
    setForm({ ...form, ingredients: arr });
  };

  const updateIngredientYield = (form, setForm, idx, yieldCount) => {
    const arr = [...form.ingredients];
    const yc = Number(yieldCount);
    arr[idx] = { ...arr[idx], yieldPerUnit: yc, quantityUsed: yc > 0 ? Math.round((1 / yc) * 10000) / 10000 : 0 };
    setForm({ ...form, ingredients: arr });
  };

  const toggleYieldMode = (form, setForm, idx) => {
    const arr = [...form.ingredients];
    const current = arr[idx];
    if (current.yieldPerUnit) {
      // Switch back to direct qty mode
      arr[idx] = { ...current, yieldPerUnit: null };
    } else {
      // Switch to yield mode - calculate yieldPerUnit from current quantityUsed
      const qtyUsed = current.quantityUsed || 0;
      const yieldVal = qtyUsed > 0 ? Math.round(1 / qtyUsed) : 1;
      arr[idx] = { ...current, yieldPerUnit: yieldVal };
    }
    setForm({ ...form, ingredients: arr });
  };

  // ===== Handlers =====
  const handleSaveRecipe = async () => {
    const ingredients = recipeForm.ingredients.map(ing => ({
      inventoryItemId: ing.inventoryItemId, name: ing.name,
      inventoryItemName: ing.name,
      category: ing.category, quantityUsed: Number(ing.quantityUsed) || 0,
      baseCostPerUnit: ing.baseCostPerUnit, unit: ing.unit,
      ...(ing.yieldPerUnit ? { yieldPerUnit: Number(ing.yieldPerUnit) } : {}),
    }));
    const data = {
      sku: recipeForm.sku, productName: recipeForm.productName,
      defaultWastageBuffer: Number(recipeForm.defaultWastageBuffer),
      ingredients,
      needsCostInput: ingredients.length === 0,
    };
    try {
      if (editingRecipe) {
        await fetch(`/api/sku-recipes/${editingRecipe._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Recipe updated');
      } else {
        await fetch('/api/sku-recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Recipe created');
      }
      setRecipeDialogOpen(false);
      setEditingRecipe(null);
      fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) return toast.error('Template name required');
    const ingredients = templateForm.ingredients.map(ing => ({
      inventoryItemId: ing.inventoryItemId, name: ing.name,
      inventoryItemName: ing.name,
      category: ing.category, quantityUsed: Number(ing.quantityUsed) || 0,
      baseCostPerUnit: ing.baseCostPerUnit, unit: ing.unit,
      ...(ing.yieldPerUnit ? { yieldPerUnit: Number(ing.yieldPerUnit) } : {}),
    }));
    const data = {
      name: templateForm.name, description: templateForm.description,
      defaultWastageBuffer: Number(templateForm.defaultWastageBuffer), ingredients,
    };
    try {
      if (editingTemplate) {
        await fetch(`/api/recipe-templates/${editingTemplate._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Template updated');
      } else {
        await fetch('/api/recipe-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Template created');
      }
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleApplyTemplate = async () => {
    if (!applyingTemplate || selectedRecipeIds.length === 0) return toast.error('Select products');
    try {
      const res = await fetch('/api/recipe-templates/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: applyingTemplate._id, recipeIds: selectedRecipeIds }),
      });
      const data = await res.json();
      toast.success(data.message || `Applied to ${data.applied} products`);
      setApplyDialogOpen(false);
      setSelectedRecipeIds([]);
      await fetchData(); // Await to ensure coverage bar updates immediately
    } catch (err) { toast.error('Failed to apply'); }
  };

  const handleRepush = async (tplId) => {
    try {
      const res = await fetch('/api/recipe-templates/repush', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tplId }),
      });
      const data = await res.json();
      toast.success(data.message);
      await fetchData();
    } catch (err) { toast.error('Failed'); }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template? Linked recipes will keep their current ingredients but be unlinked.')) return;
    // Unlink all recipes first
    await fetch('/api/recipe-templates/unlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: id }) });
    await fetch(`/api/recipe-templates/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    fetchData();
  };

  const openEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    let ingredients = (recipe.ingredients || []).map(ing => {
      const item = inventoryItems.find(i => i._id === ing.inventoryItemId);
      return {
        inventoryItemId: ing.inventoryItemId || '', name: ing.name || ing.inventoryItemName || '',
        category: ing.category || 'Raw Material',
        quantityUsed: ing.quantityUsed || 0,
        baseCostPerUnit: item ? getItemBaseCost(item) : (ing.baseCostPerUnit || 0),
        unit: ing.unit || 'units',
      };
    });
    setRecipeForm({
      sku: recipe.sku, productName: recipe.productName,
      defaultWastageBuffer: String(recipe.defaultWastageBuffer || 5), ingredients,
    });
    setRecipeDialogOpen(true);
  };

  const openEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    const ingredients = (tpl.ingredients || []).map(ing => {
      const item = inventoryItems.find(i => i._id === ing.inventoryItemId);
      return {
        inventoryItemId: ing.inventoryItemId || '', name: ing.name || '',
        category: ing.category || 'Raw Material',
        quantityUsed: ing.quantityUsed || 0,
        baseCostPerUnit: item ? getItemBaseCost(item) : (ing.baseCostPerUnit || 0),
        unit: ing.unit || 'units',
      };
    });
    setTemplateForm({
      name: tpl.name, description: tpl.description || '',
      defaultWastageBuffer: String(tpl.defaultWastageBuffer || 5), ingredients,
    });
    setTemplateDialogOpen(true);
  };

  const openApplyTemplate = (tpl) => {
    setApplyingTemplate(tpl);
    // Pre-select recipes that match the template name pattern
    const nameWords = tpl.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const suggestedIds = recipes
      .filter(r => nameWords.some(w => r.productName?.toLowerCase().includes(w)))
      .map(r => r._id);
    setSelectedRecipeIds(suggestedIds);
    setApplyDialogOpen(true);
  };

  // ===== Ingredient Form Component =====
  const IngredientForm = ({ form: f, setForm: sf, label }) => (
    <div className="space-y-3">
      {inventoryItems.length === 0 ? (
        <div className="p-3 rounded-md border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Add items in <strong>Inventory</strong> page first, then come back here.
          </p>
        </div>
      ) : (
        categories.map(cat => {
          const available = (inventoryByCategory[cat] || []).filter(i => !f.ingredients.some(ing => ing.inventoryItemId === i._id));
          const catIngredients = f.ingredients.filter(ing => ing.category === cat);
          return (
            <div key={cat} className="space-y-1.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-medium">{cat}</span>
                  <Badge variant="outline" className="text-[10px]">{catIngredients.length}</Badge>
                </div>
                {available.length > 0 && (
                  <Select onValueChange={v => addIngredient(f, sf, v)}>
                    <SelectTrigger className="w-52 h-7 text-xs"><SelectValue placeholder={`+ Add ${cat.toLowerCase()}`} /></SelectTrigger>
                    <SelectContent>
                      {available.map(item => (
                        <SelectItem key={item._id} value={item._id}>
                          {item.name} ({fmt(getItemBaseCost(item))}/{item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {catIngredients.length > 0 && (
                <div className="flex gap-2 items-center pl-5 text-[10px] text-muted-foreground font-medium mb-0.5">
                  <span className="flex-1">Item</span>
                  <span className="w-40 text-center">Qty / Yield per unit</span>
                  <span className="w-16 text-right">Line Cost</span>
                  <span className="w-7"></span>
                </div>
              )}
              {catIngredients.map(ing => {
                const idx = f.ingredients.indexOf(ing);
                const lineCost = (ing.baseCostPerUnit || 0) * (ing.quantityUsed || 0);
                const isYieldMode = !!ing.yieldPerUnit;
                return (
                  <div key={idx} className="flex gap-2 items-center pl-5">
                    <div className="flex-1 h-8 px-2 border rounded bg-muted/30 flex items-center text-sm truncate">
                      {ing.name}
                      <Badge variant="secondary" className="ml-auto text-[10px]">{fmt(ing.baseCostPerUnit)}/{ing.unit}</Badge>
                    </div>
                    <div className="w-40 flex items-center gap-1">
                      {isYieldMode ? (
                        <>
                          <span className="text-[9px] text-muted-foreground shrink-0">1 {ing.unit} →</span>
                          <Input type="number" min="1" step="1" className="h-8 text-sm text-center w-14" placeholder="6"
                            value={ing.yieldPerUnit || ''}
                            onChange={e => updateIngredientYield(f, sf, idx, e.target.value)} />
                          <span className="text-[9px] text-muted-foreground shrink-0">pcs</span>
                          <span className="text-[9px] text-muted-foreground ml-0.5">=&nbsp;{ing.quantityUsed}</span>
                        </>
                      ) : (
                        <>
                          <Input type="number" min="0" step="0.01" className="h-8 text-sm text-center" placeholder="e.g. 0.5"
                            value={ing.quantityUsed}
                            onChange={e => updateIngredientQty(f, sf, idx, e.target.value)} />
                          <span className="text-[10px] text-muted-foreground shrink-0">{ing.unit}</span>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title={isYieldMode ? 'Switch to direct qty' : 'Switch to yield mode (e.g. 1 sheet → 6 pcs)'}
                        onClick={() => toggleYieldMode(f, sf, idx)}>
                        <RefreshCw className="w-2.5 h-2.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <span className="text-xs font-medium w-16 text-right">{fmt(lineCost)}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => removeIngredient(f, sf, idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
      {f.ingredients.length > 0 && (
        <div className="p-2.5 rounded bg-primary/5 border border-primary/20">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-muted-foreground">Subtotal</span><p className="font-bold">{fmt(f.ingredients.reduce((s, i) => s + (i.baseCostPerUnit || 0) * (i.quantityUsed || 0), 0))}</p></div>
            <div><span className="text-muted-foreground">Wastage ({f.defaultWastageBuffer}%)</span><p className="font-bold">{fmt(f.ingredients.reduce((s, i) => s + (i.baseCostPerUnit || 0) * (i.quantityUsed || 0), 0) * (Number(f.defaultWastageBuffer) / 100))}</p></div>
            <div><span className="text-muted-foreground">Total COGS</span><p className="font-bold text-primary">{fmt(f.ingredients.reduce((s, i) => s + (i.baseCostPerUnit || 0) * (i.quantityUsed || 0), 0) * (1 + Number(f.defaultWastageBuffer) / 100))}</p></div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page Guide */}
      <GuideCard storageKey="guide_recipes" icon={Zap} title="🧾 SKU Recipes Guide">
        <p>• 📦 <strong>Step 1:</strong> Add raw materials & packaging in the <strong>Inventory</strong> page first</p>
        <p>• 🧩 <strong>Step 2:</strong> Create <strong>Recipe Templates</strong> — define ingredient combos you reuse (e.g., "Standard Gift Box")</p>
        <p>• 🔗 <strong>Step 3:</strong> Assign templates to Shopify products — auto-calculates COGS per order</p>
        <p>• 💰 <strong>Auto COGS:</strong> Each order uses FIFO batch prices from Inventory for accurate cost tracking</p>
        <p>• 📊 Use the <strong>progress bar</strong> above to track how many products have recipes set up</p>
      </GuideCard>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">Recipe Coverage</p>
              <p className="text-xs text-muted-foreground">{hasRecipe}/{totalRecipes} products have recipes — {coveragePercent}% of orders costed</p>
            </div>
            <Badge variant={coveragePercent >= 80 ? 'default' : coveragePercent >= 40 ? 'secondary' : 'destructive'}>
              {coveragePercent}%
            </Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${totalRecipes > 0 ? (hasRecipe / totalRecipes) * 100 : 0}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Recipe Templates Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Recipe Templates</h3>
            <Badge variant="outline">{templates.length}</Badge>
          </div>
          <Button size="sm" onClick={() => {
            setEditingTemplate(null);
            setTemplateForm({ name: '', description: '', defaultWastageBuffer: '5', ingredients: [] });
            setTemplateDialogOpen(true);
          }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <LayoutTemplate className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No templates yet</p>
              <p className="text-sm mt-1">Create a template to define ingredients once, then apply to multiple products.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => {
                setEditingTemplate(null);
                setTemplateForm({ name: '', description: '', defaultWastageBuffer: '5', ingredients: [] });
                setTemplateDialogOpen(true);
              }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Create First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map(tpl => {
              const cost = calcRecipeCost(tpl);
              return (
                <Card key={tpl._id} className="overflow-hidden">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{tpl.name}</p>
                        {tpl.description && <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>}
                      </div>
                      <Badge variant="secondary" className="shrink-0">{fmt(cost.total)}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(tpl.ingredients || []).map((ing, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {ing.name}: {ing.quantityUsed} {ing.unit}
                        </Badge>
                      ))}
                      {(tpl.ingredients || []).length === 0 && (
                        <p className="text-xs text-muted-foreground">No ingredients — edit to add</p>
                      )}
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        <Link2 className="w-3 h-3 inline mr-1" />
                        {tpl.linkedRecipeCount || 0} products linked
                      </p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openApplyTemplate(tpl)}>
                          <Copy className="w-3 h-3 mr-1" /> Apply
                        </Button>
                        {(tpl.linkedRecipeCount || 0) > 0 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRepush(tpl._id)} title="Re-push template changes to all linked products">
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => openEditTemplate(tpl)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleDeleteTemplate(tpl._id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Products Section */}
      <div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold">Products ({filteredRecipes.length})</h3>
            <p className="text-xs text-muted-foreground">Sorted by most orders first. Products without recipes show ₹0 COGS.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 h-9 w-52 text-sm" placeholder="Search products..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({totalRecipes})</SelectItem>
                <SelectItem value="needs-setup">Needs Setup ({needsSetup})</SelectItem>
                <SelectItem value="has-recipe">Has Recipe ({hasRecipe})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="orders">Most Orders</SelectItem>
                <SelectItem value="revenue">Most Revenue</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {filteredRecipes.map(recipe => {
            const costs = calcRecipeCost(recipe);
            const hasIngredients = (recipe.ingredients || []).length > 0;
            const isExpanded = expandedId === recipe._id;
            return (
              <Card key={recipe._id} className={`overflow-hidden ${!hasIngredients ? 'border-amber-200' : ''}`}>
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : recipe._id)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${hasIngredients ? 'bg-primary/10' : 'bg-amber-100'}`}>
                      <Package className={`w-4 h-4 ${hasIngredients ? 'text-primary' : 'text-amber-600'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{recipe.productName}</h4>
                        {!hasIngredients && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 shrink-0">Needs Setup</Badge>}
                        {recipe.templateName && <Badge variant="secondary" className="text-[10px] shrink-0"><Link2 className="w-2.5 h-2.5 mr-0.5" />{recipe.templateName}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{recipe.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-2">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">{recipe.orderCount || 0} orders</p>
                      <p className="text-xs text-muted-foreground">{fmt(recipe.totalRevenue || 0)} rev</p>
                    </div>
                    <div className="text-right w-20">
                      <p className={`text-sm font-bold ${hasIngredients ? '' : 'text-muted-foreground'}`}>
                        {hasIngredients ? fmt(costs.total) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">COGS</p>
                    </div>
                    <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditRecipe(recipe)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {recipe.templateId && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:text-amber-700" title={`Unlink from ${recipe.templateName || 'template'}`}
                          onClick={async () => {
                            if (!confirm(`Unlink "${recipe.productName}" from template "${recipe.templateName}"? The recipe ingredients will be cleared.`)) return;
                            try {
                              await fetch(`/api/sku-recipes/${recipe._id}/unlink`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                              toast.success('Recipe unlinked from template');
                              fetchData();
                            } catch (err) { toast.error('Failed to unlink'); }
                          }}>
                          <Unlink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t p-3 bg-muted/20 space-y-2">
                    {hasIngredients ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {recipe.ingredients.map((ing, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {ing.name}: {ing.quantityUsed} {ing.unit} x {fmt(ing.baseCostPerUnit)} = {fmt((ing.quantityUsed || 0) * (ing.baseCostPerUnit || 0))}
                            </Badge>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div><span className="text-muted-foreground">Materials</span><p className="font-bold">{fmt(costs.subtotal)}</p></div>
                          <div><span className="text-muted-foreground">Wastage ({recipe.defaultWastageBuffer || 0}%)</span><p className="font-bold">{fmt(costs.wastage)}</p></div>
                          <div><span className="text-muted-foreground">Total COGS</span><p className="font-bold text-primary">{fmt(costs.total)}</p></div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-sm text-muted-foreground mb-2">No recipe defined — COGS will be ₹0 for this product.</p>
                        <div className="flex justify-center gap-2">
                          <Button size="sm" variant="default" onClick={() => openEditRecipe(recipe)}>
                            <Edit className="w-3.5 h-3.5 mr-1" /> Set Up Recipe
                          </Button>
                          {templates.length > 0 && (
                            <Select onValueChange={tplId => {
                              const tpl = templates.find(t => t._id === tplId);
                              if (tpl) { setApplyingTemplate(tpl); setSelectedRecipeIds([recipe._id]); setApplyDialogOpen(true); }
                            }}>
                              <SelectTrigger className="h-8 w-auto text-xs"><SelectValue placeholder="Apply Template..." /></SelectTrigger>
                              <SelectContent>
                                {templates.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {filteredRecipes.length === 0 && !loading && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No products match your filter.</p>
          </CardContent></Card>
        )}
      </div>

      {/* Recipe Edit Dialog */}
      <Dialog open={recipeDialogOpen} onOpenChange={v => { setRecipeDialogOpen(v); if (!v) setEditingRecipe(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRecipe ? 'Edit' : 'New'} Product Recipe</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>SKU Code</Label><Input value={recipeForm.sku} onChange={e => setRecipeForm({ ...recipeForm, sku: e.target.value })} placeholder="GS-ALBUM-MINI" disabled={!!editingRecipe?.shopifySynced} /></div>
              <div><Label>Product Name</Label><Input value={recipeForm.productName} onChange={e => setRecipeForm({ ...recipeForm, productName: e.target.value })} /></div>
            </div>
            <div>
              <Label>Wastage Buffer %</Label>
              <Input type="number" className="w-32" value={recipeForm.defaultWastageBuffer}
                onChange={e => setRecipeForm({ ...recipeForm, defaultWastageBuffer: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">Added on top of material cost to account for spoilage/waste</p>
            </div>
            <Separator />
            <p className="text-sm font-medium">Ingredients (from Inventory)</p>
            <IngredientForm form={recipeForm} setForm={setRecipeForm} />
            <Button onClick={handleSaveRecipe} className="w-full">{editingRecipe ? 'Update' : 'Create'} Recipe</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={v => { setTemplateDialogOpen(v); if (!v) setEditingTemplate(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTemplate ? 'Edit' : 'New'} Recipe Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 inline mr-1" />
              Templates let you define ingredients once, then apply to multiple products. When you update a template, you can re-push changes to all linked products.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Template Name *</Label><Input value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g. Tin Mini Album Recipe" /></div>
              <div><Label>Description</Label><Input value={templateForm.description} onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div>
              <Label>Wastage Buffer %</Label>
              <Input type="number" className="w-32" value={templateForm.defaultWastageBuffer}
                onChange={e => setTemplateForm({ ...templateForm, defaultWastageBuffer: e.target.value })} />
            </div>
            <Separator />
            <p className="text-sm font-medium">Template Ingredients</p>
            <IngredientForm form={templateForm} setForm={setTemplateForm} />
            <Button onClick={handleSaveTemplate} className="w-full">{editingTemplate ? 'Update' : 'Create'} Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply Template Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={v => { setApplyDialogOpen(v); if (!v) { setApplyingTemplate(null); setSelectedRecipeIds([]); setApplySearch(''); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply Template: {applyingTemplate?.name}</DialogTitle>
          </DialogHeader>
          {(() => {
            // Local filtered list for the apply dialog — separate from page search
            const applyFiltered = recipes
              .filter(r => !applySearch.trim() || r.productName?.toLowerCase().includes(applySearch.toLowerCase()) || r.sku?.toLowerCase().includes(applySearch.toLowerCase()))
              .sort((a, b) => {
                // Sort: needs-setup first, then by order count
                const aNeeds = (a.needsCostInput || (a.ingredients || []).length === 0) ? 1 : 0;
                const bNeeds = (b.needsCostInput || (b.ingredients || []).length === 0) ? 1 : 0;
                if (aNeeds !== bNeeds) return bNeeds - aNeeds;
                return (b.orderCount || 0) - (a.orderCount || 0);
              });
            const allFilteredIds = applyFiltered.map(r => r._id);
            const allFilteredSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedRecipeIds.includes(id));
            const needsSetupFiltered = applyFiltered.filter(r => r.needsCostInput || (r.ingredients || []).length === 0);
            
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Select products to apply this template. This will <strong>replace</strong> their current ingredients. Products will be linked for future re-pushes.
                </div>

                {/* Search - separate from page search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input className="pl-8 h-9 text-sm" placeholder="Search products by name or SKU..."
                    value={applySearch} onChange={e => setApplySearch(e.target.value)} />
                  {applySearch && (
                    <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-7 w-7" onClick={() => setApplySearch('')}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* Selection controls */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm">
                    <span className="font-semibold text-primary">{selectedRecipeIds.length}</span>
                    <span className="text-muted-foreground"> selected</span>
                    {applySearch && <span className="text-muted-foreground"> · {applyFiltered.length} shown</span>}
                  </p>
                  <div className="flex gap-1.5">
                    {needsSetupFiltered.length > 0 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => {
                          const needsIds = needsSetupFiltered.map(r => r._id);
                          setSelectedRecipeIds(prev => [...new Set([...prev, ...needsIds])]);
                        }}>
                        Select Needs Setup ({needsSetupFiltered.length})
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => {
                        if (allFilteredSelected) {
                          // Deselect only the filtered ones
                          setSelectedRecipeIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
                        } else {
                          // Select all filtered ones (merge with existing)
                          setSelectedRecipeIds(prev => [...new Set([...prev, ...allFilteredIds])]);
                        }
                      }}>
                      {allFilteredSelected ? `Deselect${applySearch ? ' Shown' : ' All'}` : `Select${applySearch ? ' Shown' : ' All'} (${applyFiltered.length})`}
                    </Button>
                    {selectedRecipeIds.length > 0 && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                        onClick={() => setSelectedRecipeIds([])}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {/* Product list */}
                <div className="max-h-[350px] overflow-y-auto border rounded-lg">
                  {applyFiltered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No products match "{applySearch}"</p>
                  ) : applyFiltered.map(recipe => {
                    const checked = selectedRecipeIds.includes(recipe._id);
                    const hasIngredients = (recipe.ingredients || []).length > 0;
                    const needsSetup = recipe.needsCostInput || !hasIngredients;
                    const hasOtherTemplate = recipe.templateId && recipe.templateId !== applyingTemplate?._id;
                    const isAlreadyLinked = recipe.templateId === applyingTemplate?._id;
                    return (
                      <div key={recipe._id}
                        className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors ${checked ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                        onClick={() => {
                          setSelectedRecipeIds(prev => checked ? prev.filter(id => id !== recipe._id) : [...prev, recipe._id]);
                        }}>
                        <Checkbox checked={checked} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{recipe.productName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{recipe.sku}</p>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                          <span className="text-xs text-muted-foreground">{recipe.orderCount || 0} orders</span>
                          {needsSetup && <Badge variant="destructive" className="text-[9px] px-1.5 h-4">Needs Setup</Badge>}
                          {hasOtherTemplate && (
                            <Badge variant="outline" className="text-[9px] text-orange-600 border-orange-300">
                              <Unlink className="w-2.5 h-2.5 mr-0.5" /> {recipe.templateName}
                            </Badge>
                          )}
                          {isAlreadyLinked && (
                            <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">
                              <Link2 className="w-2.5 h-2.5 mr-0.5" /> Linked
                            </Badge>
                          )}
                          {hasIngredients && !needsSetup && !hasOtherTemplate && !isAlreadyLinked && (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground">Has Recipe</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button onClick={handleApplyTemplate} className="w-full" disabled={selectedRecipeIds.length === 0}>
                  Apply to {selectedRecipeIds.length} Product{selectedRecipeIds.length !== 1 ? 's' : ''}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
