'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Receipt, Megaphone, Home, Laptop, Zap, Tag } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN')}`;

// Default icon/color mapping — dynamic categories get a generic style
const catIcons = { MetaAds: Megaphone, Rent: Home, Software: Laptop, Utilities: Zap };
const catColors = {
  MetaAds: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  Rent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Software: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Utilities: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};
const PRESET_CATEGORIES = ['MetaAds', 'Rent', 'Software', 'Utilities'];

export default function ExpensesView() {
  const [expenses, setExpenses] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [customCategory, setCustomCategory] = useState('');
  const [form, setForm] = useState({ expenseName: '', category: 'Rent', amount: '', currency: 'INR', frequency: 'recurring', date: new Date().toISOString().split('T')[0] });

  const fetchData = async () => {
    const res = await fetch('/api/overhead-expenses');
    setExpenses(await res.json());
  };
  useEffect(() => { fetchData(); }, []);

  // Build dynamic category list: presets + any user-created ones from existing data
  const allCategories = [...new Set([
    ...PRESET_CATEGORIES,
    ...expenses.map(e => e.category).filter(Boolean)
  ])];

  const handleSubmit = async () => {
    const finalCategory = form.category === '__custom__' ? customCategory.trim() : form.category;
    if (!finalCategory) { toast.error('Category is required'); return; }
    const data = { ...form, category: finalCategory, amount: Number(form.amount) };
    try {
      if (editing) {
        await fetch(`/api/overhead-expenses/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Expense updated');
      } else {
        await fetch('/api/overhead-expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Expense added');
      }
      setDialogOpen(false); setEditing(null); setCustomCategory(''); fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/overhead-expenses/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); fetchData();
  };

  const openEdit = (exp) => {
    setEditing(exp);
    const isPreset = PRESET_CATEGORIES.includes(exp.category);
    setForm({
      expenseName: exp.expenseName,
      category: isPreset ? exp.category : '__custom__',
      amount: String(exp.amount),
      currency: exp.currency || 'INR',
      frequency: exp.frequency || 'recurring',
      date: exp.date?.split('T')[0] || '',
    });
    if (!isPreset) setCustomCategory(exp.category);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null); setCustomCategory('');
    setForm({ expenseName: '', category: 'Rent', amount: '', currency: 'INR', frequency: 'recurring', date: new Date().toISOString().split('T')[0] });
    setDialogOpen(true);
  };

  // Group by category
  const grouped = expenses.reduce((acc, e) => { acc[e.category] = acc[e.category] || []; acc[e.category].push(e); return acc; }, {});
  const totalByCategory = Object.entries(grouped).map(([cat, items]) => ({ category: cat, total: items.reduce((s, i) => s + (i.amount || 0), 0), count: items.length }));

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Track overhead costs that impact your true profit. Create your own expense categories.</p>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditing(null); setCustomCategory(''); } }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Expense</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.expenseName} onChange={e => setForm({...form, expenseName: e.target.value})} placeholder="e.g. Kitchen Rent, Shopify Subscription" /></div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => { setForm({...form, category: v}); if (v !== '__custom__') setCustomCategory(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">+ Create New Category</SelectItem>
                  </SelectContent>
                </Select>
                {form.category === '__custom__' && (
                  <Input className="mt-2" placeholder="Enter new category name" value={customCategory} onChange={e => setCustomCategory(e.target.value)} />
                )}
              </div>
              <div><Label>Amount (INR)</Label><Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm({...form, frequency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">Recurring (Monthly)</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            </div>
            <Button onClick={handleSubmit} className="w-full mt-2">{editing ? 'Update' : 'Add'} Expense</Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {totalByCategory.map(({ category, total, count }) => {
          const Icon = catIcons[category] || Tag;
          return (
            <Card key={category}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${catColors[category] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}><Icon className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{category}</p>
                  <p className="font-bold">{fmt(total)}</p>
                  <p className="text-xs text-muted-foreground">{count} entries</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b bg-muted/50">
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Name</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Category</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Amount</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Frequency</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Date</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr></thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp._id} className="border-b hover:bg-muted/30">
                    <td className="py-3 px-4 text-sm font-medium">{exp.expenseName}</td>
                    <td className="py-3 px-4"><Badge className={`text-xs ${catColors[exp.category] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{exp.category}</Badge></td>
                    <td className="py-3 px-4 text-sm text-right font-mono">{fmt(exp.amount)}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{exp.frequency}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{exp.date?.split('T')[0]}</td>
                    <td className="py-3 px-4"><div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(exp)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(exp._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {expenses.length === 0 && <div className="text-center py-12 text-muted-foreground">No expenses recorded yet. Add your first overhead expense above.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
