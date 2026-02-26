'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (val) => `\u20B9${(val || 0).toLocaleString('en-IN')}`;

export default function EmployeesView() {
  const [employees, setEmployees] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', monthlySalary: '', shiftStart: '09:00', shiftEnd: '18:00' });

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

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ name: emp.name, role: emp.role, monthlySalary: String(emp.monthlySalary), shiftStart: emp.shiftStart || '09:00', shiftEnd: emp.shiftEnd || '18:00' });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Track team members, salaries, and shift schedules</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map(emp => (
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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Salary</span><p className="font-bold text-sm">{fmt(emp.monthlySalary)}</p></div>
                <div><span className="text-muted-foreground">Shift</span><p className="font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{emp.shiftStart} - {emp.shiftEnd}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {employees.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">No employees added yet</CardContent></Card>}
    </div>
  );
}
