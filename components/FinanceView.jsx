'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  DollarSign, Plus, Edit2, Trash2, Search, RefreshCw, Clock, AlertTriangle,
  CheckCircle2, XCircle, FileText, Users, Package, TrendingUp, TrendingDown,
  ArrowRight, Calendar, CreditCard, Building2, Receipt, ShoppingCart,
  AlertCircle, ChevronDown, ChevronRight, Eye, X, Info, Banknote
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const BASE = '/api';

const BILL_CATEGORIES = [
  'Platform Fees', 'Marketing & Ads', 'Raw Materials', 'Packaging',
  'Shipping & Logistics', 'GST Payable', 'Salary & Wages', 'Rent & Utilities',
  'Software & Tools', 'Professional Services', 'Other',
];

const PAYMENT_METHODS = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Cash', 'Cheque', 'Auto-Debit', 'Other'];

const PO_STATUSES = ['draft', 'sent', 'acknowledged', 'received', 'paid', 'cancelled'];

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700',
  partial: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700',
  due_soon: 'bg-orange-100 text-orange-700', cancelled: 'bg-gray-100 text-gray-600',
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  acknowledged: 'bg-purple-100 text-purple-700', received: 'bg-green-100 text-green-700',
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function FinanceView() {
  const [activeTab, setActiveTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [cashFlow, setCashFlow] = useState(null);
  const [priority, setPriority] = useState([]);
  const [loading, setLoading] = useState(false);

  // Bill form
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [billForm, setBillForm] = useState({
    vendorName: '', category: 'Other', description: '', amount: '', taxAmount: '',
    taxType: 'GST', dueDate: '', notes: '', recurring: false,
  });

  // Payment form
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: '', method: 'Bank Transfer', notes: '' });

  // Vendor form
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', category: '', contactPerson: '', phone: '', email: '', gstin: '', notes: '' });

  // PO form
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [poForm, setPOForm] = useState({
    vendorName: '', items: [{ name: '', quantity: '', unitPrice: '', unit: 'pcs' }],
    expectedDelivery: '', notes: '', taxAmount: '',
  });

  // Bill detail drawer
  const [detailBill, setDetailBill] = useState(null);

  // Filters
  const [billFilter, setBillFilter] = useState('all');
  const [poFilter, setPOFilter] = useState('all');
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

  const fetchPOs = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/purchase-orders`);
      if (res.ok) setPOs(await res.json());
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

  useEffect(() => {
    fetchBills(); fetchVendors(); fetchCashFlow(); fetchPriority();
  }, [fetchBills, fetchVendors, fetchCashFlow, fetchPriority]);

  useEffect(() => {
    if (activeTab === 'purchase-orders') fetchPOs();
  }, [activeTab, fetchPOs]);

  // Bill CRUD
  const handleCreateBill = () => {
    setEditingBill(null);
    setBillForm({ vendorName: '', category: 'Other', description: '', amount: '', taxAmount: '', taxType: 'GST', dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], notes: '', recurring: false });
    setBillDialogOpen(true);
  };

  const handleEditBill = (bill) => {
    setEditingBill(bill);
    setBillForm({
      vendorName: bill.vendorName || '', category: bill.category || 'Other',
      description: bill.description || '', amount: String(bill.amount || ''),
      taxAmount: String(bill.taxAmount || ''), taxType: bill.taxType || 'GST',
      dueDate: bill.dueDate ? bill.dueDate.split('T')[0] : '', notes: bill.notes || '',
      recurring: bill.recurring || false,
    });
    setBillDialogOpen(true);
  };

  const handleSaveBill = async () => {
    if (!billForm.amount) { toast.error('Amount is required'); return; }
    setLoading(true);
    try {
      const url = editingBill ? `${BASE}/bills/${editingBill._id}` : `${BASE}/bills`;
      const method = editingBill ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(billForm),
      });
      if (res.ok) {
        toast.success(editingBill ? 'Bill updated' : 'Bill created');
        setBillDialogOpen(false); fetchBills(); fetchCashFlow(); fetchPriority();
      } else toast.error('Failed to save bill');
    } catch (e) { toast.error('Error saving bill'); }
    setLoading(false);
  };

  const handleDeleteBill = async (id) => {
    if (!confirm('Delete this bill and all its payment records?')) return;
    try {
      await fetch(`${BASE}/bills/${id}`, { method: 'DELETE' });
      toast.success('Bill deleted'); fetchBills(); fetchCashFlow(); fetchPriority();
    } catch (e) { toast.error('Error deleting bill'); }
  };

  // Payment
  const handleRecordPayment = (bill) => {
    setPaymentBill(bill);
    setPaymentForm({
      amount: String(bill.outstanding || ''), date: new Date().toISOString().split('T')[0],
      method: 'Bank Transfer', notes: '',
    });
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
    setVendorForm({ name: '', category: '', contactPerson: '', phone: '', email: '', gstin: '', notes: '' });
    setVendorDialogOpen(true);
  };

  const handleEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setVendorForm({
      name: vendor.name || '', category: vendor.category || '',
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
    try {
      await fetch(`${BASE}/vendors/${id}`, { method: 'DELETE' });
      toast.success('Vendor deleted'); fetchVendors();
    } catch (e) { toast.error('Error'); }
  };

  // PO CRUD
  const handleCreatePO = () => {
    setEditingPO(null);
    setPOForm({ vendorName: '', items: [{ name: '', quantity: '', unitPrice: '', unit: 'pcs' }], expectedDelivery: '', notes: '', taxAmount: '' });
    setPODialogOpen(true);
  };

  const handleSavePO = async () => {
    if (!poForm.vendorName) { toast.error('Vendor required'); return; }
    if (!poForm.items.some(i => i.name)) { toast.error('At least one item required'); return; }
    setLoading(true);
    try {
      const totalAmount = poForm.items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0)), 0);
      const payload = { ...poForm, totalAmount, taxAmount: parseFloat(poForm.taxAmount) || 0 };
      const url = editingPO ? `${BASE}/purchase-orders/${editingPO._id}` : `${BASE}/purchase-orders`;
      const method = editingPO ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(editingPO ? 'PO updated' : 'PO created');
        setPODialogOpen(false); fetchPOs();
      } else toast.error('Failed to save PO');
    } catch (e) { toast.error('Error saving PO'); }
    setLoading(false);
  };

  const handleUpdatePOStatus = async (poId, status) => {
    try {
      if (status === 'received') {
        await fetch(`${BASE}/purchase-orders/receive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poId }),
        });
      } else {
        await fetch(`${BASE}/purchase-orders/${poId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
      }
      toast.success(`PO status updated to ${status}`);
      fetchPOs();
    } catch (e) { toast.error('Error updating PO'); }
  };

  const handleDeletePO = async (id) => {
    if (!confirm('Delete this PO?')) return;
    try { await fetch(`${BASE}/purchase-orders/${id}`, { method: 'DELETE' }); toast.success('PO deleted'); fetchPOs(); }
    catch (e) { toast.error('Error'); }
  };

  const addPOItem = () => setPOForm(prev => ({ ...prev, items: [...prev.items, { name: '', quantity: '', unitPrice: '', unit: 'pcs' }] }));
  const removePOItem = (idx) => setPOForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const updatePOItem = (idx, field, value) => setPOForm(prev => ({
    ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
  }));

  // Filtered data
  const filteredBills = bills.filter(b => {
    if (billFilter !== 'all' && b.computedStatus !== billFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (b.vendorName || '').toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  const filteredPOs = pos.filter(p => {
    if (poFilter !== 'all' && p.status !== poFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="w-7 h-7 text-emerald-500" />
            Finance & Bills
          </h1>
          <p className="text-muted-foreground mt-1">Track bills, payments, vendors & purchase orders</p>
        </div>
      </div>

      {/* Cash Flow Summary Cards */}
      {cashFlow && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
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
              <p className="text-xl font-bold text-foreground">{fmt(cashFlow.totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Total Paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-bold text-blue-600">{fmt(cashFlow.pendingPOAmount)}</p>
              <p className="text-xs text-muted-foreground">Pending POs ({cashFlow.pendingPOCount})</p>
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
          <TabsTrigger value="purchase-orders" className="gap-1">
            <ShoppingCart className="w-3.5 h-3.5" /> Purchase Orders ({pos.length})
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
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partially Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreateBill}><Plus className="w-4 h-4 mr-1" /> Add Bill</Button>
          </div>

          {filteredBills.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No bills yet. Add your first bill to track payments!</p>
                <Button className="mt-3" onClick={handleCreateBill}><Plus className="w-4 h-4 mr-1" /> Add Bill</Button>
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
                        <TableCell><Badge variant="outline" className="text-xs">{bill.category}</Badge></TableCell>
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
                            <Button variant="ghost" size="sm" className="h-7" onClick={() => handleEditBill(bill)}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => handleDeleteBill(bill._id)}><Trash2 className="w-3 h-3" /></Button>
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
            <p className="text-sm text-muted-foreground">Manage your suppliers and service providers</p>
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
                        {vendor.category && <Badge variant="outline" className="text-xs mt-1">{vendor.category}</Badge>}
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

        {/* Purchase Orders Tab */}
        <TabsContent value="purchase-orders" className="space-y-4 mt-4">
          <div className="flex gap-2 items-center">
            <Select value={poFilter} onValueChange={setPOFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {PO_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button onClick={handleCreatePO}><Plus className="w-4 h-4 mr-1" /> Create PO</Button>
          </div>

          {filteredPOs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No purchase orders yet.</p>
                <Button className="mt-3" onClick={handleCreatePO}><Plus className="w-4 h-4 mr-1" /> Create PO</Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPOs.map(po => (
                      <TableRow key={po._id}>
                        <TableCell className="font-mono text-sm font-medium">{po.poNumber}</TableCell>
                        <TableCell>{po.vendorName || '-'}</TableCell>
                        <TableCell className="text-sm">{(po.items || []).map(i => i.name).filter(Boolean).join(', ') || '-'}</TableCell>
                        <TableCell className="text-right font-mono">{fmt((po.totalAmount || 0) + (po.taxAmount || 0))}</TableCell>
                        <TableCell className="text-xs">
                          {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_COLORS[po.status] || 'bg-gray-100'}`}>{po.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {po.status === 'draft' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleUpdatePOStatus(po._id, 'sent')}>Mark Sent</Button>
                            )}
                            {po.status === 'sent' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleUpdatePOStatus(po._id, 'received')}>Receive</Button>
                            )}
                            {po.status === 'acknowledged' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleUpdatePOStatus(po._id, 'received')}>Receive</Button>
                            )}
                            {po.status === 'received' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleUpdatePOStatus(po._id, 'paid')}>Mark Paid</Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => handleDeletePO(po._id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
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

        {/* Cash Flow Tab */}
        <TabsContent value="cash-flow" className="space-y-4 mt-4">
          {cashFlow && (
            <>
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
                      <div className="flex justify-between text-sm text-muted-foreground"><span>Pending POs ({cashFlow.pendingPOCount})</span><span className="font-mono">{fmt(cashFlow.pendingPOAmount)}</span></div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Monthly Outflows</CardTitle>
                    <CardDescription>Payments made in last 6 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {cashFlow.monthlyData && cashFlow.monthlyData.length > 0 ? (
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
                        No payment data yet
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
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
              </div>
              {detailBill.notes && <p className="text-sm text-muted-foreground">{detailBill.notes}</p>}

              <div>
                <h4 className="font-medium text-sm mb-2">Payment History</h4>
                {(detailBill.payments || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No payments recorded</p>
                ) : (
                  <div className="space-y-2">
                    {detailBill.payments.map((p, i) => (
                      <div key={p._id || i} className="flex justify-between items-center bg-muted/50 rounded p-2 text-sm">
                        <div>
                          <span className="font-mono font-medium">{fmt(p.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">via {p.method}</span>
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

      {/* Bill Editor Dialog */}
      <Dialog open={billDialogOpen} onOpenChange={setBillDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBill ? 'Edit Bill' : 'Add New Bill'}</DialogTitle>
            <DialogDescription>Track an obligation to pay a vendor or service provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor Name</Label>
                <Input value={billForm.vendorName} onChange={e => setBillForm(p => ({ ...p, vendorName: e.target.value }))} placeholder="e.g., Meta Ads" list="vendor-list" />
                <datalist id="vendor-list">
                  {vendors.map(v => <option key={v._id} value={v.name} />)}
                </datalist>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={billForm.category} onValueChange={v => setBillForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={billForm.description} onChange={e => setBillForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g., January Meta Ads Invoice" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Amount (₹)</Label>
                <Input type="number" value={billForm.amount} onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))} placeholder="50000" />
              </div>
              <div>
                <Label>Tax Amount (₹)</Label>
                <Input type="number" value={billForm.taxAmount} onChange={e => setBillForm(p => ({ ...p, taxAmount: e.target.value }))} placeholder="9000" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={billForm.dueDate} onChange={e => setBillForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={billForm.notes} onChange={e => setBillForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." className="h-16" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBill} disabled={loading}>{loading ? 'Saving...' : editingBill ? 'Update Bill' : 'Create Bill'}</Button>
          </DialogFooter>
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
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor Name</Label>
                <Input value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Sunrise Packaging" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={vendorForm.category} onChange={e => setVendorForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g., Packaging" />
              </div>
            </div>
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

      {/* PO Editor Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPO ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor</Label>
                <Input value={poForm.vendorName} onChange={e => setPOForm(p => ({ ...p, vendorName: e.target.value }))} placeholder="Select vendor" list="vendor-list" />
              </div>
              <div>
                <Label>Expected Delivery</Label>
                <Input type="date" value={poForm.expectedDelivery} onChange={e => setPOForm(p => ({ ...p, expectedDelivery: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line Items</Label>
                <Button variant="outline" size="sm" onClick={addPOItem}><Plus className="w-3 h-3 mr-1" /> Add Item</Button>
              </div>
              <div className="space-y-2">
                {poForm.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input className="flex-1" placeholder="Item name" value={item.name} onChange={e => updatePOItem(idx, 'name', e.target.value)} />
                    <Input className="w-20" type="number" placeholder="Qty" value={item.quantity} onChange={e => updatePOItem(idx, 'quantity', e.target.value)} />
                    <Input className="w-16" placeholder="Unit" value={item.unit} onChange={e => updatePOItem(idx, 'unit', e.target.value)} />
                    <Input className="w-24" type="number" placeholder="Unit ₹" value={item.unitPrice} onChange={e => updatePOItem(idx, 'unitPrice', e.target.value)} />
                    <span className="text-sm font-mono w-20 text-right">{fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}</span>
                    {poForm.items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removePOItem(idx)}><X className="w-3 h-3" /></Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2 gap-4">
                <div className="text-sm">
                  <Label>Tax (₹)</Label>
                  <Input className="w-24" type="number" value={poForm.taxAmount} onChange={e => setPOForm(p => ({ ...p, taxAmount: e.target.value }))} />
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="font-mono font-bold">
                    {fmt(poForm.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0), 0) + (parseFloat(poForm.taxAmount) || 0))}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} className="h-16" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPODialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePO} disabled={loading}>{loading ? 'Saving...' : editingPO ? 'Update PO' : 'Create PO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
