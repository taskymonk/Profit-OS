'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import GuideCard from '@/components/GuideCard';
import PageSkeleton from '@/components/PageSkeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Package, Play, CheckCircle2, Truck, AlertTriangle, Loader2,
  Clock, ChevronRight, RefreshCw, Camera, X, Info, Boxes,
  AlertOctagon, PlusCircle, LayoutGrid, List
} from 'lucide-react';
import { toast } from 'sonner';
import ShippingLabelScanner from '@/components/ShippingLabelScanner';

const KDS_STATUSES = ['assigned', 'in_progress', 'completed', 'packed'];
const STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  packed: 'Packed',
};
const STATUS_COLORS = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  packed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};
const STATUS_ICONS = {
  assigned: Package,
  in_progress: Play,
  completed: CheckCircle2,
  packed: Truck,
};

const NEXT_STATUS = {
  assigned: 'in_progress',
  in_progress: 'completed',
  completed: 'packed',
};

const WASTAGE_REASONS = ['Damaged', 'Defective', 'Spillage', 'Wrong Material', 'Expired', 'Other'];

export default function KDSView() {
  const { data: session } = useSession();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [updatingStatus, setUpdatingStatus] = useState({});

  // Wastage dialog
  const [wastageDialogOpen, setWastageDialogOpen] = useState(false);
  const [wastageForm, setWastageForm] = useState({ ingredient: '', quantity: '', reason: 'Damaged', orderId: '' });
  const [submittingWastage, setSubmittingWastage] = useState(false);

  // Material request dialog
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ ingredient: '', quantity: '', orderId: '' });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Inventory items for material dropdowns
  const [inventoryItems, setInventoryItems] = useState([]);

  // Shipping label scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerAssignment, setScannerAssignment] = useState(null);

  const userId = session?.user?.id;
  const userName = session?.user?.name;

  const fetchAssignments = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ employeeId: userId });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/kds/assignments?${params.toString()}`);
      const data = await res.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load assignments');
    }
    setLoading(false);
  }, [userId, filterStatus]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  // Fetch inventory items for wastage/request dropdowns
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory-items');
        const data = await res.json();
        if (Array.isArray(data)) {
          setInventoryItems(data.map(item => ({
            id: item._id,
            name: item.name,
            category: item.category || '',
            unit: item.unit || 'pcs',
            stock: item.currentStock || 0,
          })));
        }
      } catch (err) { console.error('Failed to load inventory:', err); }
    }
    loadInventory();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAssignments, 30000);
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  const updateStatus = async (assignmentId, newStatus, skipScanner = false) => {
    // If transitioning to packed, open the scanner first
    if (newStatus === 'packed' && !skipScanner) {
      const assignment = assignments.find(a => a._id === assignmentId);
      if (assignment) {
        setScannerAssignment(assignment);
        setScannerOpen(true);
        return;
      }
    }

    setUpdatingStatus(prev => ({ ...prev, [assignmentId]: true }));
    try {
      const res = await fetch(`/api/kds/assignments/${assignmentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
        fetchAssignments();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
    setUpdatingStatus(prev => ({ ...prev, [assignmentId]: false }));
  };

  const handleShippingConfirm = async ({ trackingNumber, carrier }) => {
    if (!scannerAssignment) return;
    // Save tracking info to the order
    await fetch(`/api/orders/${scannerAssignment.orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber, shippingCarrier: carrier }),
    });
    // Now update KDS status to packed
    await updateStatus(scannerAssignment._id, 'packed', true);
    setScannerAssignment(null);
  };

  const submitWastage = async () => {
    if (!wastageForm.ingredient || !wastageForm.quantity) {
      toast.error('Select an item and enter quantity');
      return;
    }
    setSubmittingWastage(true);
    try {
      const item = inventoryItems.find(i => i.name === wastageForm.ingredient);
      await fetch('/api/kds/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...wastageForm,
          unit: item?.unit || 'pcs',
          employeeId: userId,
          employeeName: userName,
        }),
      });
      toast.success('Wastage reported');
      setWastageDialogOpen(false);
      setWastageForm({ ingredient: '', quantity: '', reason: 'Damaged', orderId: '' });
    } catch (err) {
      toast.error('Failed to report wastage');
    }
    setSubmittingWastage(false);
  };

  const submitMaterialRequest = async () => {
    if (!requestForm.ingredient || !requestForm.quantity) {
      toast.error('Select an item and enter quantity');
      return;
    }
    setSubmittingRequest(true);
    try {
      const item = inventoryItems.find(i => i.name === requestForm.ingredient);
      await fetch('/api/kds/material-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestForm,
          unit: item?.unit || 'pcs',
          employeeId: userId,
          employeeName: userName,
        }),
      });
      toast.success('Material request submitted');
      setRequestDialogOpen(false);
      setRequestForm({ ingredient: '', quantity: '', orderId: '' });
    } catch (err) {
      toast.error('Failed to submit request');
    }
    setSubmittingRequest(false);
  };

  const filteredAssignments = filterStatus === 'all'
    ? assignments
    : assignments.filter(a => a.status === filterStatus);

  const counts = {
    assigned: assignments.filter(a => a.status === 'assigned').length,
    in_progress: assignments.filter(a => a.status === 'in_progress').length,
    completed: assignments.filter(a => a.status === 'completed').length,
    packed: assignments.filter(a => a.status === 'packed').length,
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try { return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <GuideCard storageKey="guide_kds" icon={Info} title="👨‍🍳 Kitchen Display System (KDS)">
        <p>• 📋 View your <strong>assigned orders</strong> — each card shows the order, customer, SKU recipe, and ingredients needed</p>
        <p>• ▶️ Progress orders through stages: <strong>Assigned → In Progress → Completed → Packed</strong></p>
        <p>• ⚠️ <strong>Report wastage</strong> — damaged materials are auto-deducted from FIFO stock</p>
        <p>• 📦 <strong>Request materials</strong> if you need more — admin gets notified for approval</p>
        <p>• 📸 Upload <strong>shipping label photo</strong> when packing — OCR extracts tracking number automatically</p>
        <p>• 🔄 Board <strong>auto-refreshes</strong> every 30 seconds to keep you up to date</p>
      </GuideCard>
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KDS_STATUSES.map(status => {
          const Icon = STATUS_ICONS[status];
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-2xl font-bold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                  {counts[status]}
                </span>
              </div>
              <p className="text-xs font-medium text-muted-foreground">{STATUS_LABELS[status]}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAssignments}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFilterStatus('all')}>
            Show All ({assignments.length})
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setWastageForm({ ...wastageForm, orderId: '' }); setWastageDialogOpen(true); }}>
            <AlertOctagon className="w-4 h-4 mr-1 text-red-500" /> Report Wastage
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRequestForm({ ...requestForm, orderId: '' }); setRequestDialogOpen(true); }}>
            <PlusCircle className="w-4 h-4 mr-1 text-blue-500" /> Request Material
          </Button>
          <div className="border rounded-lg p-0.5 flex">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-muted' : ''}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-muted' : ''}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <PageSkeleton variant="cards" />
      ) : filteredAssignments.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No orders {filterStatus !== 'all' ? `with status "${STATUS_LABELS[filterStatus]}"` : 'assigned to you'}</p>
          <p className="text-sm mt-1">Orders will appear here when assigned by admin</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}>
          {filteredAssignments.map(assignment => {
            const order = assignment.order;
            if (!order) return null;
            const nextStatus = NEXT_STATUS[assignment.status];
            const StatusIcon = STATUS_ICONS[assignment.status];
            const isUpdating = updatingStatus[assignment._id];

            return (
              <Card key={assignment._id} className={`overflow-hidden transition-all hover:shadow-md ${
                order.isUrgent ? 'ring-2 ring-amber-400' : ''
              }`}>
                {/* Status Bar */}
                <div className={`h-1.5 ${
                  assignment.status === 'assigned' ? 'bg-blue-500' :
                  assignment.status === 'in_progress' ? 'bg-amber-500' :
                  assignment.status === 'completed' ? 'bg-emerald-500' : 'bg-purple-500'
                }`} />
                
                <CardContent className="p-4 space-y-3">
                  {/* Order Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{order.orderId}</span>
                        {order.isUrgent && <Badge variant="destructive" className="text-[10px] px-1 py-0 animate-pulse">⚡ URGENT</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{order.customerName || 'Unknown Customer'}</p>
                    </div>
                    <Badge className={`text-[10px] px-2 py-0.5 ${STATUS_COLORS[assignment.status]}`}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {STATUS_LABELS[assignment.status]}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Product Info */}
                  <div>
                    <p className="text-sm font-medium">
                      {order.quantity > 1 && (
                        <Badge className="bg-primary text-primary-foreground text-xs mr-1.5 px-1.5">{order.quantity}x</Badge>
                      )}
                      {order.productName || order.sku}
                    </p>
                    {order.variantName && (
                      <p className="text-xs text-primary/80 font-medium mt-0.5">
                        Variant: {order.variantName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono">SKU: {order.sku}</p>
                    {order.quantity > 1 && (
                      <p className="text-xs text-amber-600 font-semibold mt-1 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-0.5 inline-block">
                        ⚠️ Make {order.quantity} units — ship in 1 parcel
                      </p>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Assigned {formatTime(assignment.assignedAt)}
                    </span>
                    {assignment.startedAt && (
                      <span className="flex items-center gap-1">
                        <Play className="w-3 h-3" /> Started {formatTime(assignment.startedAt)}
                      </span>
                    )}
                  </div>

                  {/* Shipping Info */}
                  {order.destinationCity && (
                    <div className="text-xs text-muted-foreground">
                      📍 {order.destinationCity} {order.destinationPincode ? `- ${order.destinationPincode}` : ''}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    {nextStatus && (
                      <Button
                        size="sm"
                        className="flex-1 h-10 text-sm font-medium"
                        onClick={() => updateStatus(assignment._id, nextStatus)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <>
                            {nextStatus === 'in_progress' && <Play className="w-4 h-4 mr-1" />}
                            {nextStatus === 'completed' && <CheckCircle2 className="w-4 h-4 mr-1" />}
                            {nextStatus === 'packed' && <Truck className="w-4 h-4 mr-1" />}
                          </>
                        )}
                        {nextStatus === 'in_progress' ? 'Start' :
                         nextStatus === 'completed' ? 'Mark Complete' :
                         nextStatus === 'packed' ? 'Mark Packed' : 'Next'}
                      </Button>
                    )}
                    {assignment.status !== 'packed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={() => {
                          setWastageForm({ ...wastageForm, orderId: order.orderId });
                          setWastageDialogOpen(true);
                        }}
                      >
                        <AlertOctagon className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Wastage Dialog */}
      <Dialog open={wastageDialogOpen} onOpenChange={setWastageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-500" /> Report Wastage
            </DialogTitle>
            <DialogDescription>Report damaged or wasted materials</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item</Label>
              <Select value={wastageForm.ingredient} onValueChange={v => setWastageForm({...wastageForm, ingredient: v})}>
                <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  {inventoryItems.map(item => (
                    <SelectItem key={item.id} value={item.name}>
                      <span className="flex items-center gap-2">
                        {item.name}
                        <span className="text-muted-foreground text-[10px]">({item.category}) — Stock: {item.stock} {item.unit}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity {wastageForm.ingredient && inventoryItems.find(i => i.name === wastageForm.ingredient)?.unit ? `(${inventoryItems.find(i => i.name === wastageForm.ingredient).unit})` : ''}</Label>
              <Input type="number" value={wastageForm.quantity} onChange={e => setWastageForm({...wastageForm, quantity: e.target.value})} placeholder="5" />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={wastageForm.reason} onValueChange={v => setWastageForm({...wastageForm, reason: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WASTAGE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {wastageForm.orderId && (
              <div className="text-xs text-muted-foreground">For order: <span className="font-mono font-medium">{wastageForm.orderId}</span></div>
            )}
          </div>
          <Button onClick={submitWastage} disabled={submittingWastage} className="w-full bg-red-600 hover:bg-red-700">
            {submittingWastage ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <AlertOctagon className="w-4 h-4 mr-1" />}
            Report Wastage
          </Button>
        </DialogContent>
      </Dialog>

      {/* Material Request Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-500" /> Request Material
            </DialogTitle>
            <DialogDescription>Request additional materials from admin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item</Label>
              <Select value={requestForm.ingredient} onValueChange={v => setRequestForm({...requestForm, ingredient: v})}>
                <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  {inventoryItems.map(item => (
                    <SelectItem key={item.id} value={item.name}>
                      <span className="flex items-center gap-2">
                        {item.name}
                        <span className="text-muted-foreground text-[10px]">({item.category}) — Stock: {item.stock} {item.unit}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity Needed {requestForm.ingredient && inventoryItems.find(i => i.name === requestForm.ingredient)?.unit ? `(${inventoryItems.find(i => i.name === requestForm.ingredient).unit})` : ''}</Label>
              <Input type="number" value={requestForm.quantity} onChange={e => setRequestForm({...requestForm, quantity: e.target.value})} placeholder="10" />
            </div>
          </div>
          <Button onClick={submitMaterialRequest} disabled={submittingRequest} className="w-full">
            {submittingRequest ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PlusCircle className="w-4 h-4 mr-1" />}
            Submit Request
          </Button>
        </DialogContent>
      </Dialog>
      {/* Shipping Label Scanner */}
      <ShippingLabelScanner
        open={scannerOpen}
        onOpenChange={(v) => { setScannerOpen(v); if (!v) setScannerAssignment(null); }}
        orderId={scannerAssignment?.orderId}
        orderNumber={scannerAssignment?.order?.orderId}
        onConfirm={handleShippingConfirm}
      />
    </div>
  );
}
