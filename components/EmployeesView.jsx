'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Edit, Users, Clock, ScanLine, CheckCircle, Package } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN')}`;

export default function EmployeesView() {
  const [employees, setEmployees] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', monthlySalary: '', shiftStart: '09:00', shiftEnd: '18:00' });
  const [claimForm, setClaimForm] = useState({ employeeId: '', orderIds: '' });
  const [claimResult, setClaimResult] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const fetchData = async () => {
    const res = await fetch('/api/employees');
    setEmployees(await res.json());
  };
  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    const data = { ...form, monthlySalary: Number(form.monthlySalary) };
    try {
      if (editing) {
        await fetch(`/api/employees/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Employee updated');
      } else {
        await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        toast.success('Employee added');
      }
      setDialogOpen(false); setEditing(null); fetchData();
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this employee?')) return;
    await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    toast.success('Deleted'); fetchData();
  };

  const handleClaim = async () => {
    if (!claimForm.employeeId || !claimForm.orderIds.trim()) {
      toast.error('Select employee and enter at least one Order ID'); return;
    }
    setClaiming(true);
    try {
      const res = await fetch('/api/employee-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: claimForm.employeeId, orderId: claimForm.orderIds }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error); setClaimResult(null);
      } else {
        toast.success(data.message);
        setClaimResult(data);
        setClaimForm(prev => ({ ...prev, orderIds: '' }));
        fetchData();
      }
    } catch (err) { toast.error('Claim failed'); }
    setClaiming(false);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ name: emp.name, role: emp.role, monthlySalary: String(emp.monthlySalary), shiftStart: emp.shiftStart || '09:00', shiftEnd: emp.shiftEnd || '18:00' });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Order Claiming Station */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-base">Bulk Order Claiming Station</CardTitle>
              <CardDescription>Paste or scan multiple Order IDs (comma or newline separated)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="sm:w-64">
                <Select value={claimForm.employeeId} onValueChange={v => setClaimForm({...claimForm, employeeId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e._id} value={e._id}>{e.name} ({e.role})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleClaim} disabled={claiming} className="sm:self-start">
                <CheckCircle className="w-4 h-4 mr-2" /> {claiming ? 'Claiming...' : 'Claim All Orders'}
              </Button>
            </div>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              value={claimForm.orderIds}
              onChange={e => setClaimForm({...claimForm, orderIds: e.target.value})}
              placeholder={"Paste Order IDs here (comma or newline separated):\nGS-1005, GS-1006, GS-1007\nor\nGS-1005\nGS-1006\nGS-1007"}
              rows={3}
            />
            {claimForm.orderIds.trim() && (
              <p className="text-xs text-muted-foreground">
                {claimForm.orderIds.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).length} order(s) to claim
              </p>
            )}
          </div>
          {claimResult && (
            <div className="mt-3 p-3 rounded-lg bg-background border space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                <span>{claimResult.message}</span>
              </div>
              {claimResult.claimed?.length > 0 && (
                <p className="text-xs text-muted-foreground">Claimed: {claimResult.claimed.join(', ')}</p>
              )}
              {claimResult.notFound?.length > 0 && (
                <p className="text-xs text-red-500">Not found: {claimResult.notFound.join(', ')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Management Header */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Track team members, salaries, and daily output</p>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: '', role: '', monthlySalary: '', shiftStart: '09:00', shiftEnd: '18:00' })}>
              <Plus className="w-4 h-4 mr-2" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Employee</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><Label>Role</Label><Input value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="Packer, Chocolatier, etc." /></div>
              <div><Label>Monthly Salary (INR)</Label><Input type="number" value={form.monthlySalary} onChange={e => setForm({...form, monthlySalary: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Shift Start</Label><Input type="time" value={form.shiftStart} onChange={e => setForm({...form, shiftStart: e.target.value})} /></div>
                <div><Label>Shift End</Label><Input type="time" value={form.shiftEnd} onChange={e => setForm({...form, shiftEnd: e.target.value})} /></div>
              </div>
            </div>
            <Button onClick={handleSubmit} className="w-full mt-2">{editing ? 'Update' : 'Add'} Employee</Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Employee Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map(emp => {
          const todayOutput = (emp.dailyOutputs || []).find(d => d.date === new Date().toISOString().split('T')[0]);
          const totalOrders = (emp.dailyOutputs || []).reduce((s, d) => s + (d.ordersPrepared || 0), 0);
          return (
            <Card key={emp._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{emp.name}</h3>
                      <Badge variant="outline" className="text-xs">{emp.role}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(emp)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(emp._id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><span className="text-muted-foreground">Salary</span><p className="font-bold text-sm">{fmt(emp.monthlySalary)}</p></div>
                  <div><span className="text-muted-foreground">Shift</span><p className="font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{emp.shiftStart} - {emp.shiftEnd}</p></div>
                  <div><span className="text-muted-foreground">Today</span><p className="font-bold text-sm text-primary">{todayOutput?.ordersPrepared || 0} orders</p></div>
                  <div><span className="text-muted-foreground">All Time</span><p className="font-bold text-sm">{totalOrders} orders</p></div>
                </div>
                {/* Recent daily outputs */}
                {(emp.dailyOutputs || []).length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-xs font-semibold mb-1">Recent Output:</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {(emp.dailyOutputs || []).slice(-3).reverse().map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{d.date}</span>
                          <div className="flex items-center gap-1">
                            <Package className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium">{d.ordersPrepared} orders</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {employees.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No employees added yet</CardContent></Card>}
    </div>
  );
}
