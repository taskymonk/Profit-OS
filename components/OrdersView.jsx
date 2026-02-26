'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${Math.abs(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function OrdersView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [skuRecipes, setSkuRecipes] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [profitData, setProfitData] = useState({});

  const [form, setForm] = useState({
    orderId: '', sku: '', productName: '', customerName: '',
    salePrice: '', discount: '0', status: 'Delivered',
    shippingMethod: 'indiapost', shippingCost: '', orderDate: new Date().toISOString().split('T')[0]
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const query = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await fetch(`/api/orders${query}`);
      setOrders(await res.json());
    } catch (err) { toast.error('Failed to load orders'); }
    setLoading(false);
  };

  const fetchSkus = async () => {
    const res = await fetch('/api/sku-recipes');
    setSkuRecipes(await res.json());
  };

  useEffect(() => { fetchOrders(); fetchSkus(); }, [filterStatus]);

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
      setDialogOpen(false);
      setEditingOrder(null);
      fetchOrders();
    } catch (err) { toast.error('Failed to save order'); }
  };

  const deleteOrder = async (id) => {
    if (!confirm('Delete this order?')) return;
    await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    toast.success('Order deleted');
    fetchOrders();
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
      shippingMethod: order.shippingMethod || 'indiapost', shippingCost: String(order.shippingCost || ''),
      orderDate: order.orderDate ? order.orderDate.split('T')[0] : '',
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2">
          {['all', 'Delivered', 'RTO', 'In Transit'].map(s => (
            <Button key={s} size="sm" variant={filterStatus === s ? 'default' : 'outline'} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'All' : s}
            </Button>
          ))}
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingOrder(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm({ orderId: '', sku: '', productName: '', customerName: '', salePrice: '', discount: '0', status: 'Delivered', shippingMethod: 'indiapost', shippingCost: '', orderDate: new Date().toISOString().split('T')[0] }); }}>
              <Plus className="w-4 h-4 mr-2" /> Add Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingOrder ? 'Edit Order' : 'Add New Order'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Order ID</Label><Input value={form.orderId} onChange={e => setForm({...form, orderId: e.target.value})} placeholder="GS-1234" /></div>
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
                    <SelectItem value="RTO">RTO</SelectItem>
                    <SelectItem value="In Transit">In Transit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Shipping Method</Label>
                <Select value={form.shippingMethod} onValueChange={v => setForm({...form, shippingMethod: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indiapost">India Post</SelectItem>
                    <SelectItem value="manual">Manual Courier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Shipping Cost</Label><Input type="number" value={form.shippingCost} onChange={e => setForm({...form, shippingCost: e.target.value})} /></div>
              <div className="col-span-2"><Label>Order Date</Label><Input type="date" value={form.orderDate} onChange={e => setForm({...form, orderDate: e.target.value})} /></div>
            </div>
            <Button onClick={handleSubmit} className="w-full mt-2">{editingOrder ? 'Update' : 'Create'} Order</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b bg-muted/50">
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Order ID</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">SKU</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Customer</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Status</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Sale Price</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Shipping</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Date</th>
                <th className="py-3 px-4 text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr></thead>
              <tbody>
                {orders.map(order => (
                  <>
                    <tr key={order._id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggleExpand(order._id)}>
                      <td className="py-3 px-4 text-sm font-medium">{order.orderId}</td>
                      <td className="py-3 px-4 text-xs font-mono bg-muted/30 inline-block mt-2 px-2 rounded">{order.sku}</td>
                      <td className="py-3 px-4 text-sm">{order.customerName}</td>
                      <td className="py-3 px-4"><Badge variant={order.status === 'Delivered' ? 'default' : order.status === 'RTO' ? 'destructive' : 'secondary'} className={order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100' : ''}>{order.status}</Badge></td>
                      <td className="py-3 px-4 text-sm text-right">{fmt(order.salePrice)}</td>
                      <td className="py-3 px-4 text-sm text-right">{fmt(order.shippingCost)}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">{order.orderDate?.split('T')[0]}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(order)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteOrder(order._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === order._id && profitData[order._id] && (
                      <tr key={`${order._id}-detail`} className="bg-muted/20">
                        <td colSpan={8} className="p-4">
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Net Revenue</span><p className="font-bold">{fmt(Math.round(profitData[order._id].netRevenue))}</p></div>
                            <div><span className="text-muted-foreground">COGS</span><p className="font-bold">{fmt(Math.round(profitData[order._id].totalCOGS))}</p></div>
                            <div><span className="text-muted-foreground">Shipping</span><p className="font-bold">{fmt(Math.round(profitData[order._id].shippingCost))}</p></div>
                            <div><span className="text-muted-foreground">Txn Fees</span><p className="font-bold">{fmt(Math.round(profitData[order._id].totalTransactionFee))}</p></div>
                            <div><span className="text-muted-foreground">Marketing</span><p className="font-bold">{fmt(Math.round(profitData[order._id].marketingAllocation))}</p></div>
                            <div><span className="font-semibold">Net Profit</span><p className={`text-lg font-bold ${profitData[order._id].netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(Math.round(profitData[order._id].netProfit))}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {orders.length === 0 && <div className="text-center py-12 text-muted-foreground">No orders found</div>}
        </CardContent>
      </Card>
    </div>
  );
}
