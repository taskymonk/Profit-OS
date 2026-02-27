'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import {
  Plus, Trash2, Edit, Zap, UserCheck, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Package
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [urgentDialogOpen, setUrgentDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [skuRecipes, setSkuRecipes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [profitData, setProfitData] = useState({});

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

  // Reset page when filter changes
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

  const fetchProfit = async (orderId) => {
    try {
      const res = await fetch(`/api/calculate-profit/${orderId}`);
      const data = await res.json();
      setProfitData(prev => ({ ...prev, [orderId]: data }));
    } catch (err) { console.error(err); }
  };

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!profitData[id]) fetchProfit(id);
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

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Toolbar: Filters + Search + Add */}
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
              <Input
                className="pl-9 w-64 h-9"
                placeholder="Search Order ID, Customer, SKU..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
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

        {/* Summary bar */}
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

      {/* Orders Table */}
      <Card>
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
                  <tr key={order._id} className="border-b hover:bg-muted/30 group">
                    <td className="py-2.5 px-4 text-sm font-medium cursor-pointer" onClick={() => toggleExpand(order._id)}>
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
                    <td className="py-2.5 px-4 text-sm text-right font-medium">{fmt(order.salePrice)}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(order.orderDate)}</td>
                    <td className="py-2.5 px-4">
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
                {/* Expanded profit row */}
                {orders.map(order => (
                  expandedId === order._id && profitData[order._id] ? (
                    <tr key={`${order._id}-detail`} className="bg-muted/20">
                      <td colSpan={7} className="p-4">
                        <div className="grid grid-cols-3 md:grid-cols-7 gap-3 text-xs">
                          <div><span className="text-muted-foreground">Net Revenue</span><p className="font-bold">{fmt(Math.round(profitData[order._id].netRevenue))}</p></div>
                          <div><span className="text-muted-foreground">COGS</span><p className="font-bold">{fmt(Math.round(profitData[order._id].totalCOGS))}</p></div>
                          <div>
                            <span className="text-muted-foreground">Shipping</span>
                            <p className="font-bold">{fmt(Math.round(profitData[order._id].shippingCost))}</p>
                            {profitData[order._id].isRTO && <Badge variant="destructive" className="text-[10px]">RTO 2x</Badge>}
                            {order.isUrgent && <Badge className="text-[10px] bg-amber-100 text-amber-700">{order.manualCourierName}</Badge>}
                          </div>
                          <div><span className="text-muted-foreground">Txn Fees</span><p className="font-bold">{fmt(Math.round(profitData[order._id].totalTransactionFee))}</p></div>
                          <div><span className="text-muted-foreground">Marketing</span><p className="font-bold">{fmt(Math.round(profitData[order._id].marketingAllocation))}</p></div>
                          <div><span className="text-muted-foreground">Location</span><p className="font-medium">{order.destinationCity || '-'}</p><p className="text-muted-foreground">{order.destinationPincode}</p></div>
                          <div>
                            <span className="font-semibold">Net Profit</span>
                            <p className={`text-lg font-bold ${profitData[order._id].netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {profitData[order._id].netProfit >= 0 ? '' : '-'}{fmt(Math.round(profitData[order._id].netProfit))}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(1)} title="First page">
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} title="Previous">
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* Page number buttons */}
                {(() => {
                  const pages = [];
                  let start = Math.max(1, page - 2);
                  let end = Math.min(totalPages, page + 2);
                  if (end - start < 4) {
                    if (start === 1) end = Math.min(totalPages, start + 4);
                    else start = Math.max(1, end - 4);
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <Button key={i} size="sm" variant={i === page ? 'default' : 'outline'} className="h-8 w-8 text-xs" onClick={() => setPage(i)}>
                        {i}
                      </Button>
                    );
                  }
                  return pages;
                })()}

                <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} title="Next">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Last page">
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
