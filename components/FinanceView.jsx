'use client';

import React, { useState, useEffect, useCallback } from 'react';
import GuideCard from '@/components/GuideCard';
import { toast } from 'sonner';
import {
  DollarSign, Plus, Edit2, Trash2, Search, RefreshCw, Clock, AlertTriangle,
  CheckCircle2, XCircle, FileText, Users, TrendingUp, TrendingDown,
  ArrowRight, Calendar, CreditCard, Building2, Receipt,
  AlertCircle, Eye, X, Info, Banknote, ExternalLink, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const BASE = '/api';

const PAYMENT_METHODS = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Cash', 'Cheque', 'Auto-Debit', 'Other'];

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700',
  partial: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700',
  due_soon: 'bg-orange-100 text-orange-700',
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function FinanceView() {
  const [activeTab, setActiveTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [cashFlow, setCashFlow] = useState(null);
  const [priority, setPriority] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Payment form
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: '', method: 'Bank Transfer', notes: '' });

  // Vendor form
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', category: '', subCategory: '', contactPerson: '', phone: '', email: '', gstin: '', notes: '' });

  // Bill detail drawer
  const [detailBill, setDetailBill] = useState(null);

  // Filters
  const [billFilter, setBillFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchBills = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/bills`);
      if (res.ok) setBills(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/vendors`);
      if (res.ok) setVendors(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchCashFlow = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/finance/cash-flow`);
      if (res.ok) setCashFlow(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchPriority = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/finance/priority`);
      if (res.ok) setPriority(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchExpenseCategories = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/expense-categories`);
      if (res.ok) setExpenseCategories(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  // Sync bills from expenses on mount
  const syncBills = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE}/bills/sync-from-expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) {
        const data = await res.json();
        if (data.generated > 0) {
          toast.success(`${data.generated} new bill(s) synced from expenses`);
        }
      }
    } catch (e) { console.error(e); }
    setSyncing(false);
  }, []);

  useEffect(() => {
    syncBills().then(() => {
      fetchBills(); fetchCashFlow(); fetchPriority();
    });
    fetchVendors(); fetchExpenseCategories();
  }, [syncBills, fetchBills, fetchVendors, fetchCashFlow, fetchPriority, fetchExpenseCategories]);

  // Payment
  const handleRecordPayment = (bill) => {
    setPaymentBill(bill);
    setPaymentForm({ amount: String(bill.outstanding || ''), date: new Date().toISOString().split('T')[0], method: 'Bank Transfer', notes: '' });
    setPaymentDialogOpen(true);
  };

  const handleSavePayment = async () => {
    if (!paymentForm.amount) { toast.error('Amount required'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/bills/payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: paymentBill._id, ...paymentForm, amount: parseFloat(paymentForm.amount) }),
      });
      if (res.ok) {
        toast.success('Payment recorded'); setPaymentDialogOpen(false);
        fetchBills(); fetchCashFlow(); fetchPriority();
      } else toast.error('Failed to record payment');
    } catch (e) { toast.error('Error recording payment'); }
    setLoading(false);
  };

  // Vendor CRUD
  const handleCreateVendor = () => {
    setEditingVendor(null);
    setVendorForm({ name: '', category: '', subCategory: '', contactPerson: '', phone: '', email: '', gstin: '', notes: '' });
    setVendorDialogOpen(true);
  };

  const handleEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setVendorForm({
      name: vendor.name || '', category: vendor.category || '', subCategory: vendor.subCategory || '',
      contactPerson: vendor.contactPerson || '', phone: vendor.phone || '',
      email: vendor.email || '', gstin: vendor.gstin || '', notes: vendor.notes || '',
    });
    setVendorDialogOpen(true);
  };

  const handleSaveVendor = async () => {
    if (!vendorForm.name) { toast.error('Vendor name required'); return; }
    setLoading(true);
    try {
      const url = editingVendor ? `${BASE}/vendors/${editingVendor._id}` : `${BASE}/vendors`;
      const method = editingVendor ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vendorForm),
      });
      if (res.ok) {
        toast.success(editingVendor ? 'Vendor updated' : 'Vendor added');
        setVendorDialogOpen(false); fetchVendors();
      } else toast.error('Failed to save vendor');
    } catch (e) { toast.error('Error saving vendor'); }
    setLoading(false);
  };

  const handleDeleteVendor = async (id) => {
    if (!confirm('Delete this vendor?')) return;
    try { await fetch(`${BASE}/vendors/${id}`, { method: 'DELETE' }); toast.success('Vendor deleted'); fetchVendors(); }
    catch (e) { toast.error('Error'); }
  };

  const handleDeleteBill = async (id) => {
    if (!confirm('Delete this bill?')) return;
    try { await fetch(`${BASE}/bills/${id}`, { method: 'DELETE' }); toast.success('Bill deleted'); fetchBills(); fetchCashFlow(); fetchPriority(); }
    catch (e) { toast.error('Error'); }
  };

  // Selected category's sub-categories
  const selectedCatSubs = expenseCategories.find(c => c.name === vendorForm.category)?.subCategories || [];

  // Filtered data
  const filteredBills = bills.filter(b => {
    if (billFilter !== 'all' && b.computedStatus !== billFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (b.vendorName || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <GuideCard storageKey="guide_finance" icon={Info} title="🏦 Finance & Bills Guide">
        <p>• 📄 <strong>Create bills</strong> — track vendor invoices, GST payable, subscription costs, and ad spend</p>
        <p>• 💳 <strong>Record payments</strong> against bills — partial payments supported with remaining balance tracking</p>
        <p>• 🏪 <strong>Manage vendors</strong> — add vendor details and track spending per vendor</p>
        <p>• 📊 <strong>Cash flow overview</strong> — see inflows (settlements) vs outflows (payments) at a glance</p>
        <p>• ⏰ Bills are <strong>sorted by due date</strong> — overdue items highlighted in red for priority</p>
        <p>• 🔗 Auto-generated bills for Meta Ads and GST based on synced data</p>
      </GuideCard>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="w-7 h-7 text-emerald-500" />
            Finance & Bills
          </h1>
          <p className="text-muted-foreground mt-1">Track payments, vendors & cash flow</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => syncBills().then(() => { fetchBills(); fetchCashFlow(); fetchPriority(); })} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync from Expenses'}
        </Button>
      </div>

      {/* Info Banner */}
      <Alert className="border-blue-200 bg-blue-50/50">
        <Zap className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          Bills are <strong>auto-generated from your Expenses</strong>. Add or edit costs in the <strong>Expenses</strong> page — they'll appear here with payment tracking.
        </AlertDescription>
      </Alert>

      {/* Cash Flow Summary Cards */}
      {cashFlow && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-foreground">{fmt(cashFlow.totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
            </CardContent>
          </Card>
          <Card className={cashFlow.overdueAmount > 0 ? 'border-red-200' : ''}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-xl font-bold ${cashFlow.overdueAmount > 0 ? 'text-red-600' : 'text-foreground'}`}>
                {fmt(cashFlow.overdueAmount)}
              </p>
              <p className="text-xs text-muted-foreground">Overdue ({cashFlow.overdueCount})</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-orange-600">{fmt(cashFlow.dueThisMonthAmount)}</p>
              <p className="text-xs text-muted-foreground">Due This Month ({cashFlow.dueThisMonthCount})</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-green-600">{fmt(cashFlow.totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Total Paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-foreground">{cashFlow.totalBills}</p>
              <p className="text-xs text-muted-foreground">Total Bills</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Priority */}
      {priority.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-4 h-4" /> Payment Priority Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priority.slice(0, 5).map((b, i) => (
                <div key={b._id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <span className="font-medium">{b.vendorName || b.description || b.category}</span>
                    <Badge variant="outline" className="text-xs">{b.category}</Badge>
                    {new Date(b.dueDate) < new Date() && <Badge className="bg-red-100 text-red-700 text-xs">Overdue</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Due: {new Date(b.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    <span className="font-semibold text-amber-800">{fmt(b.outstanding)}</span>
                    <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => handleRecordPayment(b)}>Pay</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bills" className="gap-1">
            <Receipt className="w-3.5 h-3.5" /> Bills ({bills.length})
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-1">
            <Building2 className="w-3.5 h-3.5" /> Vendors ({vendors.length})
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Cash Flow
          </TabsTrigger>
        </TabsList>

        {/* Bills Tab */}
        <TabsContent value="bills" className="space-y-4 mt-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search bills..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={billFilter} onValueChange={setBillFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partially Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredBills.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-2">No bills yet.</p>
                <p className="text-sm text-muted-foreground">Add expenses in the <strong>Expenses</strong> page and they will auto-appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor / Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBills.map(bill => (
                      <TableRow key={bill._id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailBill(bill)}>
                        <TableCell>
                          <p className="font-medium text-sm">{bill.vendorName || bill.description || '-'}</p>
                          {bill.description && bill.vendorName && <p className="text-xs text-muted-foreground">{bill.description}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{bill.category}</Badge>
                          {bill.subCategory && <span className="text-xs text-muted-foreground ml-1">/ {bill.subCategory}</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${bill.autoGenerated ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {bill.autoGenerated ? 'Auto' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(bill.totalAmount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">{fmt(bill.totalPaid)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{fmt(bill.outstanding)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_COLORS[bill.computedStatus] || 'bg-gray-100'}`}>
                            {bill.computedStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {bill.outstanding > 0 && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRecordPayment(bill)}>
                                <CreditCard className="w-3 h-3 mr-1" /> Pay
                              </Button>
                            )}
                            {!bill.autoGenerated && (
                              <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => handleDeleteBill(bill._id)}><Trash2 className="w-3 h-3" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-4 mt-4">
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">Manage suppliers & service providers — each linked to an expense category</p>
            <Button onClick={handleCreateVendor}><Plus className="w-4 h-4 mr-1" /> Add Vendor</Button>
          </div>

          {vendors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No vendors yet. Add your first vendor!</p>
                <Button className="mt-3" onClick={handleCreateVendor}><Plus className="w-4 h-4 mr-1" /> Add Vendor</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map(vendor => (
                <Card key={vendor._id}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{vendor.name}</h3>
                        <div className="flex items-center gap-1 mt-1">
                          {vendor.category && <Badge variant="outline" className="text-xs">{vendor.category}</Badge>}
                          {vendor.subCategory && <Badge variant="secondary" className="text-xs">{vendor.subCategory}</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditVendor(vendor)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteVendor(vendor._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                      {vendor.contactPerson && <p>Contact: {vendor.contactPerson}</p>}
                      {vendor.phone && <p>Phone: {vendor.phone}</p>}
                      {vendor.email && <p>Email: {vendor.email}</p>}
                      {vendor.gstin && <p>GSTIN: {vendor.gstin}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Cash Flow Tab */}
        <TabsContent value="cash-flow" className="space-y-4 mt-4">
          {cashFlow && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Financial Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm"><span>Total Billed</span><span className="font-mono font-semibold">{fmt(cashFlow.totalBilled)}</span></div>
                    <div className="flex justify-between text-sm"><span>Total Paid</span><span className="font-mono font-semibold text-green-600">{fmt(cashFlow.totalPaid)}</span></div>
                    <div className="border-t pt-2 flex justify-between text-sm"><span className="font-semibold">Outstanding</span><span className="font-mono font-bold text-red-600">{fmt(cashFlow.totalOutstanding)}</span></div>
                    <div className="flex justify-between text-sm text-muted-foreground"><span>Overdue ({cashFlow.overdueCount})</span><span className="font-mono">{fmt(cashFlow.overdueAmount)}</span></div>
                    <div className="flex justify-between text-sm text-muted-foreground"><span>Due This Month ({cashFlow.dueThisMonthCount})</span><span className="font-mono">{fmt(cashFlow.dueThisMonthAmount)}</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly Outflows</CardTitle>
                  <CardDescription>Payments made in last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                  {cashFlow.monthlyData && cashFlow.monthlyData.some(d => d.outflows > 0) ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={cashFlow.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={v => fmt(v)} />
                        <Bar dataKey="outflows" fill="#ef4444" name="Outflows" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                      No payment data yet — record payments against bills to see the chart
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bill Detail Drawer */}
      <Dialog open={!!detailBill} onOpenChange={() => setDetailBill(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bill Details</DialogTitle>
          </DialogHeader>
          {detailBill && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Vendor:</span> <span className="font-medium">{detailBill.vendorName || '-'}</span></div>
                <div><span className="text-muted-foreground">Category:</span> <Badge variant="outline" className="text-xs">{detailBill.category}</Badge></div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono">{fmt(detailBill.amount)}</span></div>
                <div><span className="text-muted-foreground">Tax:</span> <span className="font-mono">{fmt(detailBill.taxAmount)} ({detailBill.taxType})</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold">{fmt(detailBill.totalAmount)}</span></div>
                <div><span className="text-muted-foreground">Outstanding:</span> <span className="font-mono font-bold text-red-600">{fmt(detailBill.outstanding)}</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> {detailBill.dueDate ? new Date(detailBill.dueDate).toLocaleDateString('en-IN') : '-'}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_COLORS[detailBill.computedStatus]}>{detailBill.computedStatus}</Badge></div>
                <div><span className="text-muted-foreground">Source:</span> <Badge className={detailBill.autoGenerated ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}>{detailBill.autoGenerated ? 'Auto from Expenses' : 'Manual'}</Badge></div>
              </div>
              {detailBill.notes && <p className="text-sm text-muted-foreground">{detailBill.notes}</p>}

              <div>
                <h4 className="font-medium text-sm mb-2">Payment History</h4>
                {(detailBill.payments || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No payments recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {detailBill.payments.map((p, i) => (
                      <div key={p._id || i} className="flex justify-between items-center bg-muted/50 rounded p-2 text-sm">
                        <div>
                          <span className="font-mono font-medium">{fmt(p.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">via {p.method}</span>
                          {p.notes && <span className="text-xs text-muted-foreground ml-2">— {p.notes}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detailBill.outstanding > 0 && (
                <Button className="w-full" onClick={() => { setDetailBill(null); handleRecordPayment(detailBill); }}>
                  <CreditCard className="w-4 h-4 mr-1" /> Record Payment
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {paymentBill && `${paymentBill.vendorName || paymentBill.description} — Outstanding: ${fmt(paymentBill.outstanding)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Payment Amount (₹)</Label>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={paymentForm.date} onChange={e => setPaymentForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentForm.method} onValueChange={v => setPaymentForm(p => ({ ...p, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g., UTR: 12345" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePayment} disabled={loading}>{loading ? 'Recording...' : 'Record Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Editor Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
            <DialogDescription>Link the vendor to an expense category for automatic bill categorization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor Name *</Label>
                <Input value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Sunrise Packaging" />
              </div>
              <div>
                <Label>Expense Category *</Label>
                <Select value={vendorForm.category} onValueChange={v => setVendorForm(p => ({ ...p, category: v, subCategory: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map(c => <SelectItem key={c._id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedCatSubs.length > 0 && (
              <div>
                <Label>Sub-Category</Label>
                <Select value={vendorForm.subCategory} onValueChange={v => setVendorForm(p => ({ ...p, subCategory: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select sub-category (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {selectedCatSubs.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact Person</Label>
                <Input value={vendorForm.contactPerson} onChange={e => setVendorForm(p => ({ ...p, contactPerson: e.target.value }))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={vendorForm.phone} onChange={e => setVendorForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={vendorForm.email} onChange={e => setVendorForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={vendorForm.gstin} onChange={e => setVendorForm(p => ({ ...p, gstin: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveVendor} disabled={loading}>{loading ? 'Saving...' : editingVendor ? 'Update' : 'Add Vendor'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
