'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import GuideCard from '@/components/GuideCard';
import PageSkeleton from '@/components/PageSkeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit2, FolderTree, Save, Loader2, RefreshCw,
  Calendar, Repeat, Infinity as InfinityIcon, StopCircle, ChevronDown, ChevronRight, Banknote, ReceiptText, Settings2, Package, X, Zap, CheckCircle2, Info, ScanLine, FileText
} from 'lucide-react';
import InvoiceScanner from '@/components/InvoiceScanner';

const fmt = (val) => `₹${Math.abs(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpensesView() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});

  // Form state
  const [form, setForm] = useState({
    expenseName: '', category: '', subCategory: '', amount: '',
    gstInclusive: false, frequency: 'monthly', totalCycles: '12',
    infiniteCycles: false, date: new Date().toISOString().split('T')[0],
    inventoryItemId: '', inventoryItemName: '', purchaseQty: '',
    vendorId: '', vendorName: '',
  });

  // Category manager state
  const [catEditing, setCatEditing] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newSubCat, setNewSubCat] = useState({});
  const [inventoryItems, setInventoryItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showInvoiceScanner, setShowInvoiceScanner] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, catRes, invRes, vendorRes] = await Promise.all([
        fetch('/api/overhead-expenses'),
        fetch('/api/expense-categories'),
        fetch('/api/inventory-items'),
        fetch('/api/vendors'),
      ]);
      const expData = await expRes.json();
      const catData = await catRes.json();
      const invData = await invRes.json();
      const vendorData = await vendorRes.json();
      setExpenses(Array.isArray(expData) ? expData : []);
      setCategories(Array.isArray(catData) ? catData : []);
      setInventoryItems(Array.isArray(invData) ? invData : []);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-generate recurring expenses on load
  useEffect(() => {
    async function generateRecurring() {
      try {
        const res = await fetch('/api/expense-recurring/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        if (data.generated > 0) {
          toast.info(`Auto-generated ${data.generated} recurring expense(s)`);
          loadData();
        }
      } catch (err) { /* ignore */ }
    }
    if (!loading && expenses.length > 0) generateRecurring();
  }, [loading]);

  const handleSubmit = async () => {
    if (!form.expenseName || !form.amount || !form.category) {
      toast.error('Name, Category, and Amount are required');
      return;
    }
    try {
      if (editingExpense) {
        await fetch(`/api/overhead-expenses/${editingExpense._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
        });
        toast.success('Expense updated');
      } else {
        await fetch('/api/overhead-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
        });
        toast.success('Expense added');
      }
      setShowForm(false);
      setEditingExpense(null);
      resetForm();
      loadData();
    } catch (err) { toast.error('Failed: ' + err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/overhead-expenses/${id}`, { method: 'DELETE' });
      toast.success('Expense deleted');
      loadData();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const handleStop = async (id) => {
    try {
      await fetch('/api/expense-recurring/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: id }),
      });
      toast.success('Recurring stopped');
      loadData();
    } catch (err) { toast.error('Failed to stop'); }
  };

  const resetForm = () => {
    setForm({
      expenseName: '', category: '', subCategory: '', amount: '',
      gstInclusive: false, frequency: 'monthly', totalCycles: '12',
      infiniteCycles: false, date: new Date().toISOString().split('T')[0],
      inventoryItemId: '', inventoryItemName: '', purchaseQty: '',
      vendorId: '', vendorName: '',
    });
  };

  const startEdit = (exp) => {
    setEditingExpense(exp);
    setForm({
      expenseName: exp.expenseName || '',
      category: exp.category || '',
      subCategory: exp.subCategory || '',
      amount: String(exp.amount || ''),
      gstInclusive: exp.gstInclusive || false,
      frequency: exp.frequency || 'monthly',
      totalCycles: String(exp.totalCycles || '1'),
      infiniteCycles: exp.infiniteCycles || false,
      date: exp.date ? exp.date.split('T')[0] : '',
    });
    setShowForm(true);
  };

  // Save categories
  const saveCategories = async () => {
    try {
      await fetch('/api/expense-categories/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: catEditing }),
      });
      toast.success('Categories saved');
      setShowCatManager(false);
      loadData();
    } catch (err) { toast.error('Failed to save categories'); }
  };

  // Group expenses by category
  const grouped = {};
  expenses.filter(e => e.category !== 'MetaAds').forEach(e => {
    const cat = e.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(e);
  });

  // Get sub-categories for a given category
  const getSubCategories = (catName) => {
    const cat = categories.find(c => c.name === catName);
    return cat?.subCategories || [];
  };

  const toggleCat = (cat) => setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));

  // Calc total monthly
  const totalMonthly = expenses.filter(e => e.category !== 'MetaAds' && (e.frequency === 'monthly' || e.frequency === 'recurring')).reduce((s, e) => s + (e.amount || 0), 0);
  const totalYearly = expenses.filter(e => e.category !== 'MetaAds' && e.frequency === 'yearly').reduce((s, e) => s + (e.amount || 0), 0);

  if (loading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Banknote className="w-5 h-5" /> Expenses & Overhead</h2>
          <p className="text-sm text-muted-foreground">Manage recurring and one-time business expenses. These are pro-rated in your P&L.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setCatEditing(categories.map(c => ({ ...c }))); setShowCatManager(true); }}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Categories
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInvoiceScanner(true)}>
            <ScanLine className="w-3.5 h-3.5 mr-1.5" /> Scan Invoice
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setEditingExpense(null); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Page Guide */}
      <GuideCard storageKey="guide_expenses" icon={Zap} title="💰 Expense Tracking Guide">
        <p>• 🔄 <strong>Recurring costs</strong> — Add Shopify subscription, salaries, rent etc. Set Monthly/Yearly with auto-generation</p>
        <p>• 📦 <strong>Raw material purchases</strong> — Link to inventory items for automatic FIFO stock batch creation</p>
        <p>• 📸 <strong>Invoice OCR</strong> — Scan expense invoices to auto-fill amount, vendor, date, and tax</p>
        <p>• 🏪 <strong>Vendor tracking</strong> — Assign vendors to expenses for better financial visibility</p>
        <p>• 📊 <strong>P&L impact</strong> — All expenses are pro-rated in the Dashboard P&L waterfall automatically</p>
      </GuideCard>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Monthly Expenses</p>
          <p className="text-lg font-bold">{fmt(totalMonthly)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Yearly Expenses</p>
          <p className="text-lg font-bold">{fmt(totalYearly)}<span className="text-xs text-muted-foreground font-normal">/yr</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total Categories</p>
          <p className="text-lg font-bold">{Object.keys(grouped).length}</p>
        </CardContent></Card>
      </div>

      {/* Expenses grouped by category */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader className="py-3 cursor-pointer" onClick={() => toggleCat(cat)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedCats[cat] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <CardTitle className="text-sm">{cat}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
              </div>
              <span className="text-sm font-semibold text-muted-foreground">
                {fmt(items.filter(e => e.frequency === 'monthly' || e.frequency === 'recurring').reduce((s, e) => s + (e.amount || 0), 0))}/mo
              </span>
            </div>
          </CardHeader>
          {expandedCats[cat] && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {items.sort((a, b) => (a.subCategory || '').localeCompare(b.subCategory || '')).map(exp => (
                  <div key={exp._id} className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${exp.autoGenerated ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-900/30' : 'bg-muted/30 border-border/50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{exp.expenseName}</span>
                        {exp.subCategory && <Badge variant="outline" className="text-[10px] h-4">{exp.subCategory}</Badge>}
                        {exp.gstInclusive && <Badge variant="outline" className="text-[10px] h-4 text-orange-600 border-orange-300">GST incl.</Badge>}
                        {exp.autoGenerated && (
                          <Badge variant="outline" className="text-[10px] h-4 text-blue-600 border-blue-300">
                            Auto · Cycle {exp.currentCycle}/{exp.infiniteCycles ? '∞' : exp.totalCycles}
                          </Badge>
                        )}
                        {!exp.autoGenerated && (exp.frequency === 'monthly' || exp.frequency === 'yearly') && !exp.stopped && (
                          <Badge variant="default" className="text-[10px] h-4 gap-0.5">
                            <Repeat className="w-2.5 h-2.5" />
                            {exp.frequency === 'monthly' ? 'Monthly' : 'Yearly'}
                            {exp.totalCycles > 0 && !exp.infiniteCycles ? ` · ${exp.currentCycle || 1}/${exp.totalCycles}` : ''}
                            {exp.infiniteCycles && ' · ∞'}
                          </Badge>
                        )}
                        {exp.stopped && <Badge variant="destructive" className="text-[10px] h-4">Stopped</Badge>}
                        {exp.frequency === 'one-time' && <Badge variant="secondary" className="text-[10px] h-4">One-time</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        {exp.date && <span>{new Date(exp.date + (exp.date.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        {exp.autoGenerated && exp.parentExpenseId && <span className="text-blue-500">Auto-generated from parent</span>}
                        {!exp.autoGenerated && exp.nextGenerationDate && !exp.stopped && (
                          <span className="text-emerald-600">Next: {new Date(exp.nextGenerationDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-sm font-bold whitespace-nowrap">{fmt(exp.amount)}</span>
                      {!exp.autoGenerated && (exp.frequency === 'monthly' || exp.frequency === 'yearly') && !exp.stopped && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleStop(exp._id)} title="Stop recurring">
                          <StopCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(exp)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(exp._id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {Object.keys(grouped).length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No expenses yet. Click "Add Expense" to get started.</p>
        </CardContent></Card>
      )}

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
            <DialogDescription>Enter expense details. Recurring expenses are auto-generated on schedule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Expense Name *</Label>
              <Input value={form.expenseName} onChange={e => setForm({ ...form, expenseName: e.target.value })} placeholder="e.g., Shopify Subscription" />
            </div>
            {/* Vendor Selection */}
            <div>
              <Label>Vendor</Label>
              <Select value={form.vendorId || '__none__'} onValueChange={v => {
                if (v === '__none__') {
                  setForm({ ...form, vendorId: '', vendorName: '' });
                } else {
                  const vendor = vendors.find(vn => vn._id === v);
                  setForm({ ...form, vendorId: v, vendorName: vendor?.name || '' });
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Select vendor (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No vendor —</SelectItem>
                  {vendors.map(v => <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v, subCategory: '' })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-Category</Label>
                <Select value={form.subCategory || '__none__'} onValueChange={v => setForm({ ...form, subCategory: v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {getSubCategories(form.category).map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch checked={form.gstInclusive} onCheckedChange={v => setForm({ ...form, gstInclusive: v })} />
                <Label className="text-sm">Amount includes GST (18%)</Label>
              </div>
            </div>
            {/* Inventory Bridge: Show when category is Raw Material Purchases */}
            {form.category === 'Raw Material Purchases' && inventoryItems.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                <p className="text-sm font-medium text-blue-700 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Link to Inventory Item (creates stock batch)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Inventory Item</Label>
                    <Select value={form.inventoryItemId || 'none'} onValueChange={v => {
                      const item = inventoryItems.find(i => i._id === v);
                      setForm({ ...form, inventoryItemId: v === 'none' ? '' : v, inventoryItemName: item?.name || '' });
                    }}>
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— No link —</SelectItem>
                        {inventoryItems.map(item => (
                          <SelectItem key={item._id} value={item._id}>
                            {item.name} ({item.unit}) — Stock: {item.currentStock || 0}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.inventoryItemId && (
                    <div>
                      <Label className="text-xs">Purchase Quantity</Label>
                      <Input type="number" className="bg-white" value={form.purchaseQty}
                        onChange={e => setForm({ ...form, purchaseQty: e.target.value })}
                        placeholder="e.g. 500" />
                      {form.purchaseQty && form.amount && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Cost/unit: ₹{(parseFloat(form.amount) / parseFloat(form.purchaseQty)).toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one-time">One-time</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.frequency !== 'one-time' && (
                <>
                  <div>
                    <Label>Total Cycles</Label>
                    <Input type="number" min="1" value={form.infiniteCycles ? '' : form.totalCycles} disabled={form.infinityCycles}
                      onChange={e => setForm({ ...form, totalCycles: e.target.value })}
                      placeholder={form.infiniteCycles ? '∞' : '12'} />
                  </div>
                  <div className="flex items-end gap-2 pb-0.5">
                    <Switch checked={form.infiniteCycles} onCheckedChange={v => setForm({ ...form, infiniteCycles: v })} />
                    <Label className="text-sm flex items-center gap-1"><InfinityIcon className="w-3.5 h-3.5" /> Infinite</Label>
                  </div>
                </>
              )}
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              {form.frequency !== 'one-time' && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cycle 1 starts on this date. Next cycles auto-generated {form.frequency === 'monthly' ? 'every month' : 'every year'}.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingExpense(null); }}>Cancel</Button>
              <Button onClick={handleSubmit}><Save className="w-3.5 h-3.5 mr-1.5" />{editingExpense ? 'Update' : 'Add Expense'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Manager Dialog */}
      <Dialog open={showCatManager} onOpenChange={setShowCatManager}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderTree className="w-4 h-4" /> Manage Categories & Sub-Categories</DialogTitle>
            <DialogDescription>Organize your expense categories. Sub-categories appear in the expense form dropdown.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {catEditing.map((cat, catIdx) => (
              <div key={catIdx} className="p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Input value={cat.name} onChange={e => {
                    const updated = [...catEditing];
                    updated[catIdx] = { ...cat, name: e.target.value };
                    setCatEditing(updated);
                  }} className="font-medium" />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setCatEditing(catEditing.filter((_, i) => i !== catIdx))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="pl-4 space-y-1.5">
                  {(cat.subCategories || []).map((sc, scIdx) => (
                    <div key={scIdx} className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">└</span>
                      <Input value={sc} className="h-7 text-sm" onChange={e => {
                        const updated = [...catEditing];
                        const subs = [...(updated[catIdx].subCategories || [])];
                        subs[scIdx] = e.target.value;
                        updated[catIdx] = { ...cat, subCategories: subs };
                        setCatEditing(updated);
                      }} />
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 shrink-0" onClick={() => {
                        const updated = [...catEditing];
                        const subs = [...(updated[catIdx].subCategories || [])];
                        subs.splice(scIdx, 1);
                        updated[catIdx] = { ...cat, subCategories: subs };
                        setCatEditing(updated);
                      }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">└</span>
                    <Input className="h-7 text-sm" placeholder="New sub-category..." value={newSubCat[catIdx] || ''}
                      onChange={e => setNewSubCat({ ...newSubCat, [catIdx]: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newSubCat[catIdx]?.trim()) {
                          const updated = [...catEditing];
                          updated[catIdx] = { ...cat, subCategories: [...(cat.subCategories || []), newSubCat[catIdx].trim()] };
                          setCatEditing(updated);
                          setNewSubCat({ ...newSubCat, [catIdx]: '' });
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => {
                      if (newSubCat[catIdx]?.trim()) {
                        const updated = [...catEditing];
                        updated[catIdx] = { ...cat, subCategories: [...(cat.subCategories || []), newSubCat[catIdx].trim()] };
                        setCatEditing(updated);
                        setNewSubCat({ ...newSubCat, [catIdx]: '' });
                      }
                    }}><Plus className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && newCatName.trim()) {
                    setCatEditing([...catEditing, { name: newCatName.trim(), subCategories: [] }]);
                    setNewCatName('');
                  }
                }} />
              <Button variant="outline" onClick={() => {
                if (newCatName.trim()) {
                  setCatEditing([...catEditing, { name: newCatName.trim(), subCategories: [] }]);
                  setNewCatName('');
                }
              }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Category</Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCatManager(false)}>Cancel</Button>
              <Button onClick={saveCategories}><Save className="w-3.5 h-3.5 mr-1.5" /> Save Categories</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Scanner */}
      <InvoiceScanner
        open={showInvoiceScanner}
        onOpenChange={setShowInvoiceScanner}
        vendors={vendors}
        categories={categories}
        onConfirm={(data) => {
          // Pre-fill expense form with extracted data
          const matchedVendor = vendors.find(v => v.name?.toLowerCase() === data.vendor?.toLowerCase());
          const matchedCategory = categories.find(c => c.name === data.category);
          setForm(prev => ({
            ...prev,
            expenseName: data.description || data.invoiceNumber || 'Invoice Expense',
            amount: String(data.amount || ''),
            category: matchedCategory ? data.category : (data.category || prev.category),
            date: data.date || prev.date,
            vendorId: matchedVendor?._id || '',
            vendorName: data.vendor || '',
            gstInclusive: (data.taxAmount || 0) > 0,
            frequency: 'one-time',
          }));
          setEditingExpense(null);
          setShowForm(true);
        }}
      />
    </div>
  );
}
