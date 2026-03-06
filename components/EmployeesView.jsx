'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  ClipboardList, Users, Package, CheckCircle2, Truck, Play,
  Clock, AlertOctagon, PlusCircle, RefreshCw, Loader2, Timer,
  TrendingUp, BarChart3, Check, X, ChevronRight, Edit, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS = {
  assigned: 'Assigned', in_progress: 'In Progress',
  completed: 'Completed', packed: 'Packed', cancelled: 'Cancelled',
};
const STATUS_COLORS = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  packed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const calcDuration = (from, to) => {
  if (!from || !to) return null;
  const diffMs = new Date(to) - new Date(from);
  if (diffMs <= 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
};

export default function EmployeesView() {
  const [activeTab, setActiveTab] = useState('assignments');
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [wastageLogs, setWastageLogs] = useState([]);
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [users, setUsers] = useState([]);
  const [respondingTo, setRespondingTo] = useState({});
  const [overrideDialog, setOverrideDialog] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('');
  const [overrideEmployee, setOverrideEmployee] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [assignRes, perfRes, reqRes, wastRes, usersRes] = await Promise.all([
        fetch('/api/kds/assignments'),
        fetch('/api/kds/performance'),
        fetch('/api/kds/material-requests'),
        fetch('/api/kds/wastage'),
        fetch('/api/users'),
      ]);
      const [assignData, perfData, reqData, wastData, usersData] = await Promise.all([
        assignRes.json(), perfRes.json(), reqRes.json(), wastRes.json(), usersRes.json(),
      ]);
      setAssignments(Array.isArray(assignData) ? assignData : []);
      setPerformance(Array.isArray(perfData) ? perfData : []);
      setMaterialRequests(Array.isArray(reqData) ? reqData : []);
      setWastageLogs(Array.isArray(wastData) ? wastData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (err) {
      toast.error('Failed to load KDS data');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRespondRequest = async (requestId, status) => {
    setRespondingTo(prev => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch(`/api/kds/material-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, respondedBy: 'admin' }),
      });
      if (res.ok) {
        toast.success(`Request ${status}`);
        setMaterialRequests(prev => prev.map(r => r._id === requestId ? { ...r, status } : r));
      }
    } catch (err) { toast.error('Failed'); }
    setRespondingTo(prev => ({ ...prev, [requestId]: false }));
  };

  // Group assignments by employee
  const groupedByEmployee = {};
  const filteredAssignments = filterEmployee === 'all'
    ? assignments
    : assignments.filter(a => a.employeeId === filterEmployee);

  filteredAssignments.forEach(a => {
    const key = a.employeeId;
    if (!groupedByEmployee[key]) {
      groupedByEmployee[key] = { name: a.employeeName || 'Unknown', items: [], stats: { assigned: 0, in_progress: 0, completed: 0, packed: 0 } };
    }
    groupedByEmployee[key].items.push(a);
    if (groupedByEmployee[key].stats[a.status] !== undefined) {
      groupedByEmployee[key].stats[a.status]++;
    }
  });

  // Summary stats
  const totalAssigned = assignments.filter(a => a.status === 'assigned').length;
  const totalInProgress = assignments.filter(a => a.status === 'in_progress').length;
  const totalCompleted = assignments.filter(a => a.status === 'completed').length;
  const totalPacked = assignments.filter(a => a.status === 'packed').length;
  const pendingRequests = materialRequests.filter(r => r.status === 'pending').length;

  const formatDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  const handleOverride = useCallback(async () => {
    if (!overrideDialog) return;
    setOverrideSaving(true);
    try {
      const updates = {};
      if (overrideStatus && overrideStatus !== overrideDialog.status) updates.status = overrideStatus;
      if (overrideEmployee && overrideEmployee !== overrideDialog.employeeId) updates.reassignTo = overrideEmployee;
      if (Object.keys(updates).length === 0) { toast.info('No changes to save'); setOverrideSaving(false); return; }
      const res = await fetch(`/api/kds/override/${overrideDialog._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else { toast.success('Assignment updated'); fetchAll(); }
    } catch { toast.error('Failed to update'); }
    setOverrideSaving(false);
    setOverrideDialog(null);
  }, [overrideDialog, overrideStatus, overrideEmployee, fetchAll]);

  const uniqueEmployees = [...new Map(assignments.map(a => [a.employeeId, { id: a.employeeId, name: a.employeeName }])).values()];

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Package className="w-4 h-4 text-blue-500" /> Assigned
          </div>
          <p className="text-2xl font-bold">{totalAssigned}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Play className="w-4 h-4 text-amber-500" /> In Progress
          </div>
          <p className="text-2xl font-bold">{totalInProgress}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Completed
          </div>
          <p className="text-2xl font-bold">{totalCompleted}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Truck className="w-4 h-4 text-purple-500" /> Packed
          </div>
          <p className="text-2xl font-bold">{totalPacked}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <PlusCircle className="w-4 h-4 text-red-500" /> Pending Requests
          </div>
          <p className="text-2xl font-bold">{pendingRequests}</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="assignments" className="gap-1.5">
              <ClipboardList className="w-4 h-4" /> Assignments
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5">
              <BarChart3 className="w-4 h-4" /> Performance
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              <PlusCircle className="w-4 h-4" /> Requests
              {pendingRequests > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{pendingRequests}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="wastage" className="gap-1.5">
              <AlertOctagon className="w-4 h-4" /> Wastage
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {uniqueEmployees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4 mt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : Object.keys(groupedByEmployee).length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No active KDS assignments</p>
              <p className="text-sm mt-1">Go to Orders page → select orders → assign to KDS</p>
            </Card>
          ) : (
            Object.entries(groupedByEmployee).map(([empId, group]) => (
              <Card key={empId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{group.name[0]}</span>
                      </div>
                      <div>
                        <CardTitle className="text-base">{group.name}</CardTitle>
                        <CardDescription>{group.items.length} orders assigned</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {group.stats.assigned > 0 && <Badge className={STATUS_COLORS.assigned}>{group.stats.assigned} assigned</Badge>}
                      {group.stats.in_progress > 0 && <Badge className={STATUS_COLORS.in_progress}>{group.stats.in_progress} in progress</Badge>}
                      {group.stats.completed > 0 && <Badge className={STATUS_COLORS.completed}>{group.stats.completed} completed</Badge>}
                      {group.stats.packed > 0 && <Badge className={STATUS_COLORS.packed}>{group.stats.packed} packed</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Order</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Product</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Status</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Assigned</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Started</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Completed</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Packed</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Production</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left">Total</th>
                          <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-left w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.sort((a, b) => {
                          const order = { assigned: 0, in_progress: 1, completed: 2, packed: 3 };
                          return (order[a.status] || 9) - (order[b.status] || 9);
                        }).map(a => {
                          const prodTime = calcDuration(a.startedAt, a.completedAt);
                          const packTime = calcDuration(a.completedAt, a.packedAt);
                          const totalTime = calcDuration(a.assignedAt, a.packedAt || a.completedAt);
                          return (
                          <tr key={a._id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="py-2 px-3 font-mono text-xs">{a.order?.orderId || '-'}</td>
                            <td className="py-2 px-3 text-xs max-w-[160px] truncate">{a.order?.productName || '-'}</td>
                            <td className="py-2 px-3">
                              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[a.status] || ''}`}>
                                {STATUS_LABELS[a.status] || a.status}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(a.assignedAt)}</td>
                            <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(a.startedAt)}</td>
                            <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(a.completedAt)}</td>
                            <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(a.packedAt)}</td>
                            <td className="py-2 px-3 text-[11px] font-medium">
                              {prodTime ? <span className="text-emerald-600">{prodTime}</span> : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="py-2 px-3 text-[11px] font-medium">
                              {totalTime ? <span className="text-blue-600">{totalTime}</span> : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="py-2 px-3">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Override" onClick={() => {
                                setOverrideDialog(a);
                                setOverrideStatus(a.status);
                                setOverrideEmployee(a.employeeId);
                              }}>
                                <Edit className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : performance.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No performance data yet</p>
              <p className="text-sm mt-1">Stats appear after employees start completing orders</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {performance.map(p => (
                <Card key={p.employeeId} className="overflow-hidden">
                  <div className="h-1 bg-primary" />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary">{(p.employeeName || '?')[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{p.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{p.totalAssigned} total orders</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                        <p className="text-lg font-bold text-emerald-600">{p.completed}</p>
                        <p className="text-[10px] text-muted-foreground">Completed</p>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                        <p className="text-lg font-bold text-blue-600">{p.todayCompleted}</p>
                        <p className="text-[10px] text-muted-foreground">Today</p>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                        <p className="text-lg font-bold text-amber-600">{p.inProgress}</p>
                        <p className="text-[10px] text-muted-foreground">In Progress</p>
                      </div>
                      <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/20">
                        <p className="text-lg font-bold text-violet-600">{p.avgTimeMinutes > 0 ? `${p.avgTimeMinutes}m` : '-'}</p>
                        <p className="text-[10px] text-muted-foreground">Avg Time</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Material Requests Tab */}
        <TabsContent value="requests" className="space-y-3 mt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : materialRequests.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <PlusCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No material requests yet</p>
              <p className="text-sm mt-1">Employees can request materials from their KDS dashboard</p>
            </Card>
          ) : (
            materialRequests.map(req => (
              <Card key={req._id} className={`transition-all ${req.status === 'pending' ? 'border-amber-300 dark:border-amber-700' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        req.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        req.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                        'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        {req.status === 'pending' ? <Clock className="w-4 h-4 text-amber-600" /> :
                         req.status === 'approved' ? <Check className="w-4 h-4 text-emerald-600" /> :
                         <X className="w-4 h-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {req.ingredient} <span className="text-muted-foreground">×{req.quantity} {req.unit || ''}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested by <span className="font-medium">{req.employeeName || 'Unknown'}</span> · {formatDate(req.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => handleRespondRequest(req._id, 'approved')}
                            disabled={respondingTo[req._id]}
                          >
                            {respondingTo[req._id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => handleRespondRequest(req._id, 'denied')}
                            disabled={respondingTo[req._id]}
                          >
                            <X className="w-3 h-3 mr-1" /> Deny
                          </Button>
                        </>
                      ) : (
                        <Badge variant={req.status === 'approved' ? 'default' : 'destructive'} className="text-xs">
                          {req.status === 'approved' ? 'Approved' : 'Denied'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Wastage Tab */}
        <TabsContent value="wastage" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : wastageLogs.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <AlertOctagon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No wastage reports</p>
              <p className="text-sm mt-1">Employees can report wastage from their KDS dashboard</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground text-left">Item</th>
                      <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground text-left">Qty</th>
                      <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground text-left">Reason</th>
                      <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground text-left">Reported By</th>
                      <th className="py-2.5 px-4 text-xs font-medium text-muted-foreground text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wastageLogs.map(w => (
                      <tr key={w._id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-medium">{w.ingredient}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{w.quantity} {w.unit || ''}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant="outline" className="text-[10px]">{w.reason}</Badge>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">{w.employeeName || '-'}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{formatDate(w.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Override Dialog */}
      <Dialog open={!!overrideDialog} onOpenChange={v => { if (!v) setOverrideDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5" />Override Assignment</DialogTitle>
            <DialogDescription>Change status or reassign order {overrideDialog?.order?.orderId || ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
              <p><strong>Order:</strong> {overrideDialog?.order?.orderId} — {overrideDialog?.order?.productName}</p>
              <p><strong>Current Employee:</strong> {overrideDialog?.employeeName}</p>
              <p><strong>Current Status:</strong> {STATUS_LABELS[overrideDialog?.status] || overrideDialog?.status}</p>
            </div>
            <div>
              <label className="text-xs font-medium">Change Status</label>
              <Select value={overrideStatus} onValueChange={setOverrideStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Reassign To</label>
              <Select value={overrideEmployee} onValueChange={setOverrideEmployee}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'employee').map(u => (
                    <SelectItem key={u._id} value={u._id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>Cancel</Button>
            <Button onClick={handleOverride} disabled={overrideSaving} className="gap-1.5">
              {overrideSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
