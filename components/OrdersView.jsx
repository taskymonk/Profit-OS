'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import {
  Plus, Trash2, Edit, Zap, UserCheck, Search, X, Info,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Package,
  TrendingUp, TrendingDown, DollarSign, Truck, MapPin, ReceiptText, ShoppingBag
} from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${Math.abs(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const STATUSES = ['all', 'Delivered', 'Unfulfilled', 'In Transit', 'RTO', 'Cancelled'];
const PAGE_SIZE = 20;

export default function OrdersView() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showGuide, setShowGuide] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [urgentDialogOpen, setUrgentDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [skuRecipes, setSkuRecipes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [profitData, setProfitData] = useState({});

  // Slide-out drawer state
  const [drawerOrder, setDrawerOrder] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [form, setForm] = useState({
    orderId: '', sku: '', productName: '', customerName: '',
    salePrice: '', discount: '0', status: 'Delivered',
    shippingMethod: 'shopify', shippingCost: '', orderDate: new Date().toISOString().split('T')[0],
    destinationPincode: '', destinationCity: '',
  });
  const [urgentForm, setUrgentForm] = useState({ manualCourierName: 'BlueDart', manualShippingCost: '' });
  const [assignForm, setAssignForm] = useState({ employeeId: '' });
  const [trackingEdits, setTrackingEdits] = useState({});
  const [savingTracking, setSavingTracking] = useState({});

  const saveTrackingNumber = async (orderId, value) => {
    setSavingTracking(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/orders/${orderId}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: value }),
      });
      if (res.ok) {
        toast.success('Tracking number saved');
        fetchOrders();
      } else {
        toast.error('Failed to save tracking number');
      }
    } catch (err) {
      toast.error('Error saving tracking number');
    }
    setSavingTracking(prev => ({ ...prev, [orderId]: false }));
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: 'orderDate',
        sortOrder: 'desc',
      });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();

      if (data.orders) {
        setOrders(data.orders);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else if (Array.isArray(data)) {
        setOrders(data);
        setTotal(data.length);
        setTotalPages(1);
      }
    } catch (err) {
      toast.error('Failed to load orders');
    }
    setLoading(false);
  }, [page, filterStatus, searchTerm]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [skuRes, empRes] = await Promise.all([
          fetch('/api/sku-recipes'),
          fetch('/api/employees'),
        ]);
        const skuData = await skuRes.json();
        const empData = await empRes.json();
        setSkuRecipes(Array.isArray(skuData) ? skuData : (skuData.orders || []));
        setEmployees(Array.isArray(empData) ? empData : []);
      } catch (err) { console.error(err); }
    }
    loadMeta();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setPage(1);
  };

  const handleSubmit = async () => {
    const data = { ...form, salePrice: Number(form.salePrice), discount: Number(form.discount), shippingCost: Number(form.shippingCost) };
    try {
      if (editingOrder) {
        await fetch(`/api/orders/${editingOrder._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Order updated');
      } else {
        await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Order created');
      }
      setDialogOpen(false); setEditingOrder(null); fetchOrders();
    } catch (err) { toast.error('Failed to save order'); }
  };

  const deleteOrder = async (id) => {
    if (!confirm('Delete this order?')) return;
    await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    toast.success('Order deleted'); fetchOrders();
    if (drawerOrder?._id === id) setDrawerOrder(null);
  };

  const handleMarkUrgent = async () => {
    if (!selectedOrder) return;
    try {
      await fetch(`/api/orders/${selectedOrder._id}/urgent`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualCourierName: urgentForm.manualCourierName, manualShippingCost: Number(urgentForm.manualShippingCost) }),
      });
      toast.success(`Order ${selectedOrder.orderId} marked URGENT`);
      setUrgentDialogOpen(false); setSelectedOrder(null); fetchOrders();
    } catch (err) { toast.error('Failed'); }
  };

  const handleAssignEmployee = async () => {
    if (!selectedOrder || !assignForm.employeeId) return;
    try {
      await fetch(`/api/orders/${selectedOrder._id}/assign`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: assignForm.employeeId }),
      });
      const emp = employees.find(e => e._id === assignForm.employeeId);
      toast.success(`Order assigned to ${emp?.name}`);
      setAssignDialogOpen(false); setSelectedOrder(null); fetchOrders();
    } catch (err) { toast.error('Failed'); }
  };

  const openDrawer = async (order) => {
    setDrawerOrder(order);
    if (!profitData[order._id]) {
      setDrawerLoading(true);
      try {
        const res = await fetch(`/api/calculate-profit/${order._id}`);
        const data = await res.json();
        setProfitData(prev => ({ ...prev, [order._id]: data }));
      } catch (err) { console.error(err); }
      setDrawerLoading(false);
    }
  };

  const openEdit = (order) => {
    setEditingOrder(order);
    setForm({
      orderId: order.orderId || '', sku: order.sku || '', productName: order.productName || '',
      customerName: order.customerName || '', salePrice: String(order.salePrice || ''),
      discount: String(order.discount || '0'), status: order.status || 'Delivered',
      shippingMethod: order.shippingMethod || 'shopify', shippingCost: String(order.shippingCost || ''),
      orderDate: order.orderDate ? order.orderDate.split('T')[0] : '',
      destinationPincode: order.destinationPincode || '', destinationCity: order.destinationCity || '',
    });
    setDialogOpen(true);
  };

  const statusColor = (s) => {
    switch (s) {
      case 'Delivered': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100';
      case 'RTO': return '';
      case 'In Transit': return '';
      case 'Unfulfilled': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100';
      case 'Cancelled': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100';
      default: return '';
    }
  };

  const statusVariant = (s) => {
    switch (s) {
      case 'Delivered': return 'default';
      case 'RTO': return 'destructive';
      case 'Cancelled': return 'outline';
      default: return 'secondary';
    }
  };

  const profit = drawerOrder ? profitData[drawerOrder._id] : null;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* UX Guide Banner */}
      {showGuide && (
        <div className="relative rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
          <button onClick={() => setShowGuide(false)} className="absolute top-2.5 right-2.5 text-blue-400 hover:text-blue-600">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 shrink-0"><ShoppingBag className="w-4 h-4 text-blue-600" /></div>
            <div>
              <h3 className="font-semibold text-sm text-blue-900">How Orders Work</h3>
              <p className="text-xs text-blue-700 mt-1">
                Orders sync from Shopify automatically. Click any order row to see its <strong>full profit breakdown</strong> — including COGS (from SKU Recipes), Shopify fees, Razorpay fees, and marketing allocation. Each order's true profit is calculated in real-time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map(s => (
              <Button key={s} size="sm" variant={filterStatus === s ? 'default' : 'outline'} onClick={() => handleFilterChange(s)} className="text-xs h-8">
                {s === 'all' ? 'All' : s}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 w-64 h-9" placeholder="Search Order ID, Customer, SKU..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingOrder(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setForm({ orderId: '', sku: '', productName: '', customerName: '', salePrice: '', discount: '0', status: 'Delivered', shippingMethod: 'shopify', shippingCost: '', orderDate: new Date().toISOString().split('T')[0], destinationPincode: '', destinationCity: '' })}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingOrder ? 'Edit Order' : 'Add New Order'}</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Order ID</Label><Input value={form.orderId} onChange={e => setForm({...form, orderId: e.target.value})} placeholder="SH-1234" /></div>
                  <div>
                    <Label>SKU</Label>
                    <Select value={form.sku} onValueChange={v => { const r = skuRecipes.find(s => s.sku === v); setForm({...form, sku: v, productName: r?.productName || ''}); }}>
                      <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                      <SelectContent>{skuRecipes.map(s => <SelectItem key={s._id} value={s.sku}>{s.sku}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Customer</Label><Input value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
                  <div><Label>Sale Price</Label><Input type="number" value={form.salePrice} onChange={e => setForm({...form, salePrice: e.target.value})} /></div>
                  <div><Label>Discount</Label><Input type="number" value={form.discount} onChange={e => setForm({...form, discount: e.target.value})} /></div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Delivered">Delivered</SelectItem>
                        <SelectItem value="Unfulfilled">Unfulfilled</SelectItem>
                        <SelectItem value="In Transit">In Transit</SelectItem>
                        <SelectItem value="RTO">RTO</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Shipping Cost</Label><Input type="number" value={form.shippingCost} onChange={e => setForm({...form, shippingCost: e.target.value})} /></div>
                  <div><Label>Dest. Pincode</Label><Input value={form.destinationPincode} onChange={e => setForm({...form, destinationPincode: e.target.value})} /></div>
                  <div><Label>Dest. City</Label><Input value={form.destinationCity} onChange={e => setForm({...form, destinationCity: e.target.value})} /></div>
                  <div className="col-span-2"><Label>Order Date</Label><Input type="date" value={form.orderDate} onChange={e => setForm({...form, orderDate: e.target.value})} /></div>
                </div>
                <Button onClick={handleSubmit} className="w-full mt-2">{editingOrder ? 'Update' : 'Create'} Order</Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total > 0 ? `Showing ${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} orders` : 'No orders found'}
            {searchTerm && <span className="ml-1">(searching: "{searchTerm}")</span>}
          </span>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      </div>

      {/* Urgent Dialog */}
      <Dialog open={urgentDialogOpen} onOpenChange={setUrgentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Mark as Urgent</DialogTitle>
            <DialogDescription>Override shipping for order {selectedOrder?.orderId}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Courier</Label>
              <Select value={urgentForm.manualCourierName} onValueChange={v => setUrgentForm({...urgentForm, manualCourierName: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BlueDart">BlueDart</SelectItem>
                  <SelectItem value="DTDC">DTDC</SelectItem>
                  <SelectItem value="Delhivery">Delhivery</SelectItem>
                  <SelectItem value="FedEx">FedEx</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Shipping Cost (INR)</Label><Input type="number" value={urgentForm.manualShippingCost} onChange={e => setUrgentForm({...urgentForm, manualShippingCost: e.target.value})} placeholder="180" /></div>
          </div>
          <Button onClick={handleMarkUrgent} className="w-full bg-amber-600 hover:bg-amber-700"><Zap className="w-4 h-4 mr-2" /> Confirm Urgent Override</Button>
        </DialogContent>
      </Dialog>

      {/* Assign Employee Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCheck className="w-5 h-5 text-primary" /> Assign Employee</DialogTitle>
            <DialogDescription>Assign order {selectedOrder?.orderId} to a team member</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Employee</Label>
            <Select value={assignForm.employeeId} onValueChange={v => setAssignForm({...assignForm, employeeId: v})}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map(e => <SelectItem key={e._id} value={e._id}>{e.name} ({e.role})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={handleAssignEmployee} className="w-full"><UserCheck className="w-4 h-4 mr-2" /> Assign</Button>
        </DialogContent>
      </Dialog>

      {/* Main Content: Table + Drawer */}
      <div className="flex gap-0">
        {/* Orders Table */}
        <Card className={`flex-1 transition-all duration-300 ${drawerOrder ? 'rounded-r-none border-r-0' : ''}`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b bg-muted/50">
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Order ID</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground hidden lg:table-cell">Product</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">AWB / Tracking</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Sale Price</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground w-28">Actions</th>
                </tr></thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order._id}
                      className={`border-b hover:bg-muted/30 group cursor-pointer transition-colors ${drawerOrder?._id === order._id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      onClick={() => openDrawer(order)}>
                      <td className="py-2.5 px-4 text-sm font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{order.orderId}</span>
                          {order.isUrgent && <Badge variant="destructive" className="text-[10px] px-1 py-0"><Zap className="w-2.5 h-2.5" /></Badge>}
                        </div>
                        <span className="text-[11px] text-muted-foreground font-mono lg:hidden">{order.sku}</span>
                      </td>
                      <td className="py-2.5 px-4 hidden lg:table-cell">
                        <div className="max-w-[200px] truncate text-xs">{order.productName}</div>
                        <span className="text-[10px] font-mono text-muted-foreground">{order.sku}</span>
                      </td>
                      <td className="py-2.5 px-4 text-sm">{order.customerName || '-'}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant={statusVariant(order.status)} className={statusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4" onClick={e => e.stopPropagation()}>
                        {['Unfulfilled', 'In Transit'].includes(order.status) ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 text-xs w-32 font-mono"
                              placeholder="Enter AWB..."
                              value={trackingEdits[order._id] !== undefined ? trackingEdits[order._id] : (order.trackingNumber || '')}
                              onChange={e => setTrackingEdits(prev => ({ ...prev, [order._id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const val = trackingEdits[order._id] !== undefined ? trackingEdits[order._id] : (order.trackingNumber || '');
                                  saveTrackingNumber(order._id, val);
                                  setTrackingEdits(prev => { const n = {...prev}; delete n[order._id]; return n; });
                                }
                              }}
                              onBlur={() => {
                                if (trackingEdits[order._id] !== undefined && trackingEdits[order._id] !== (order.trackingNumber || '')) {
                                  saveTrackingNumber(order._id, trackingEdits[order._id]);
                                  setTrackingEdits(prev => { const n = {...prev}; delete n[order._id]; return n; });
                                }
                              }}
                            />
                            {savingTracking[order._id] && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                          </div>
                        ) : order.trackingNumber ? (
                          <span className="text-xs font-mono text-muted-foreground">{order.trackingNumber}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-sm text-right font-medium">{fmt(order.salePrice)}</td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(order.orderDate)}</td>
                      <td className="py-2.5 px-4" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" title="Mark Urgent" className="h-7 w-7" onClick={() => { setSelectedOrder(order); setUrgentForm({ manualCourierName: 'BlueDart', manualShippingCost: '' }); setUrgentDialogOpen(true); }}>
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Assign Employee" className="h-7 w-7" onClick={() => { setSelectedOrder(order); setAssignForm({ employeeId: '' }); setAssignDialogOpen(true); }}>
                            <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(order)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteOrder(order._id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loading && orders.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg font-medium mb-1">No orders found</p>
                <p className="text-sm">
                  {searchTerm ? `No results for "${searchTerm}". Try a different search.` :
                   filterStatus !== 'all' ? `No ${filterStatus} orders.` :
                   'Sync orders from Shopify or add them manually.'}
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(1)} title="First page"><ChevronsLeft className="w-4 h-4" /></Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} title="Previous"><ChevronLeft className="w-4 h-4" /></Button>
                  {(() => {
                    const pages = [];
                    let start = Math.max(1, page - 2);
                    let end = Math.min(totalPages, page + 2);
                    if (end - start < 4) {
                      if (start === 1) end = Math.min(totalPages, start + 4);
                      else start = Math.max(1, end - 4);
                    }
                    for (let i = start; i <= end; i++) {
                      pages.push(<Button key={i} size="sm" variant={i === page ? 'default' : 'outline'} className="h-8 w-8 text-xs" onClick={() => setPage(i)}>{i}</Button>);
                    }
                    return pages;
                  })()}
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} title="Next"><ChevronRight className="w-4 h-4" /></Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Last page"><ChevronsRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slide-out Drawer */}
        {drawerOrder && (
          <Card className="w-[380px] shrink-0 rounded-l-none border-l-0 overflow-hidden">
            <CardContent className="p-0">
              <div className="sticky top-0 bg-card z-10 border-b p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-sm">Order {drawerOrder.orderId}</h3>
                    <p className="text-xs text-muted-foreground">{formatDate(drawerOrder.orderDate)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerOrder(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(drawerOrder.status)} className={statusColor(drawerOrder.status)}>{drawerOrder.status}</Badge>
                  {drawerOrder.isUrgent && <Badge variant="destructive" className="text-[10px]"><Zap className="w-3 h-3 mr-0.5" /> Urgent</Badge>}
                </div>
              </div>

              <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Product Info */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Product</p>
                  <p className="text-sm font-medium">{drawerOrder.productName}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{drawerOrder.sku}</p>
                </div>

                {/* Customer & Location */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
                    <p className="text-sm font-medium">{drawerOrder.customerName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                    <p className="text-sm font-medium flex items-center gap-1"><MapPin className="w-3 h-3" /> {drawerOrder.destinationCity || '-'}</p>
                    <p className="text-[11px] text-muted-foreground">{drawerOrder.destinationPincode || ''}</p>
                  </div>
                </div>

                {drawerOrder.preparedByName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Prepared By</p>
                    <Badge variant="outline"><UserCheck className="w-3 h-3 mr-1" /> {drawerOrder.preparedByName}</Badge>
                  </div>
                )}

                {drawerOrder.trackingNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Tracking Number</p>
                    <p className="text-sm font-mono">{drawerOrder.trackingNumber}</p>
                  </div>
                )}

                <Separator />

                {/* Profit Breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><ReceiptText className="w-3.5 h-3.5" /> PROFIT BREAKDOWN</p>
                  {drawerLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : profit ? (
                    <div className="space-y-2">
                      {/* Revenue */}
                      <div className="flex justify-between items-center py-1.5 px-2 rounded bg-emerald-50 dark:bg-emerald-950/30">
                        <span className="text-xs flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Net Revenue</span>
                        <span className="text-sm font-bold text-emerald-700">{fmt(Math.round(profit.netRevenue))}</span>
                      </div>

                      {/* Cost items */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center py-1 px-2 text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> COGS (Materials)</span>
                          <span className="font-medium text-red-600">-{fmt(Math.round(profit.totalCOGS))}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 px-2 text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Truck className="w-3 h-3" /> Shipping
                            {profit.isRTO && <Badge variant="destructive" className="text-[9px] h-4">RTO 2x</Badge>}
                            {drawerOrder.isUrgent && <Badge className="text-[9px] h-4 bg-amber-100 text-amber-700">{drawerOrder.manualCourierName}</Badge>}
                          </span>
                          <span className="font-medium text-red-600">-{fmt(Math.round(profit.shippingCost))}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 px-2 text-xs">
                          <span className="text-muted-foreground flex items-center gap-1.5"><ReceiptText className="w-3 h-3" /> Transaction Fees</span>
                          <span className="font-medium text-red-600">-{fmt(Math.round(profit.totalTransactionFee))}</span>
                        </div>
                        {profit.marketingAllocation > 0 && (
                          <div className="flex justify-between items-center py-1 px-2 text-xs">
                            <span className="text-muted-foreground flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Marketing</span>
                            <span className="font-medium text-red-600">-{fmt(Math.round(profit.marketingAllocation))}</span>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Net Profit */}
                      <div className={`flex justify-between items-center py-2 px-3 rounded-lg ${profit.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                        <span className="text-sm font-semibold flex items-center gap-1.5">
                          {profit.netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                          Net Profit
                        </span>
                        <span className={`text-lg font-bold ${profit.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {profit.netProfit >= 0 ? '' : '-'}{fmt(Math.round(profit.netProfit))}
                        </span>
                      </div>

                      {/* Margin */}
                      <p className="text-[11px] text-center text-muted-foreground">
                        Margin: {profit.netRevenue > 0 ? Math.round((profit.netProfit / profit.netRevenue) * 100) : 0}%
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">Could not calculate profit data</p>
                  )}
                </div>

                <Separator />

                {/* Quick Actions */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">ACTIONS</p>
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={() => openEdit(drawerOrder)}>
                    <Edit className="w-3.5 h-3.5 mr-2" /> Edit Order
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={() => { setSelectedOrder(drawerOrder); setUrgentForm({ manualCourierName: 'BlueDart', manualShippingCost: '' }); setUrgentDialogOpen(true); }}>
                    <Zap className="w-3.5 h-3.5 mr-2 text-amber-500" /> Mark Urgent
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={() => { setSelectedOrder(drawerOrder); setAssignForm({ employeeId: '' }); setAssignDialogOpen(true); }}>
                    <UserCheck className="w-3.5 h-3.5 mr-2 text-blue-500" /> Assign Employee
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs text-destructive hover:text-destructive" onClick={() => deleteOrder(drawerOrder._id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Order
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
