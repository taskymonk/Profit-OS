'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import GuideCard from '@/components/GuideCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Users, UserPlus, Trash2, Shield, ShieldCheck, ShieldAlert,
  Loader2, Mail, Clock, Activity, MoreVertical, Edit, CheckCircle, Info,
  Eye, ChevronRight, Search, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_CONFIG = {
  master_admin: { label: 'Master Admin', color: 'bg-red-100 text-red-700 border-red-200', icon: ShieldAlert, desc: 'Full access — Dashboard, P&L, Settings, Integrations, all data' },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: ShieldCheck, desc: 'Everything except Settings & Integrations' },
  employee: { label: 'Employee', color: 'bg-green-100 text-green-700 border-green-200', icon: Shield, desc: 'KDS Dashboard, assigned orders, mark progress, report wastage' },
};

const fmtDate = (d) => {
  if (!d) return 'Never';
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; }
};

const fmtRelative = (d) => {
  if (!d) return 'Never';
  try {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return fmtDate(d);
  } catch { return '-'; }
};

export default function UserManagementView({ moduleSettings = {} }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'employee' });
  const [saving, setSaving] = useState(false);
  const [changingRole, setChangingRole] = useState({});
  const [search, setSearch] = useState('');
  const [activityLog, setActivityLog] = useState([]);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [activityUser, setActivityUser] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [moduleAccess, setModuleAccess] = useState({});

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { setUsers([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleAddUser = useCallback(async () => {
    if (!newUser.email.trim()) { toast.error('Email is required'); return; }
    if (!newUser.password || newUser.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); }
      else {
        toast.success(`User ${newUser.email} created!`);
        setShowAddDialog(false);
        setNewUser({ email: '', name: '', password: '', role: 'employee' });
        loadUsers();
      }
    } catch { toast.error('Failed to create user'); }
    setSaving(false);
  }, [newUser, loadUsers]);

  const handleRoleChange = useCallback(async (userId, newRole) => {
    setChangingRole(prev => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else {
        toast.success(`Role updated to ${ROLE_CONFIG[newRole]?.label}`);
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
      }
    } catch { toast.error('Failed to update role'); }
    setChangingRole(prev => ({ ...prev, [userId]: false }));
  }, []);

  const handleDeleteUser = useCallback(async (userId, userName) => {
    if (!confirm(`Remove ${userName}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else { toast.success(`${userName} removed`); setUsers(prev => prev.filter(u => u._id !== userId)); }
    } catch { toast.error('Failed to remove user'); }
  }, []);

  const handleViewActivity = useCallback(async (user) => {
    setActivityUser(user);
    setShowActivityDialog(true);
    setLoadingActivity(true);
    try {
      const res = await fetch(`/api/users/${user._id}/activity`);
      const data = await res.json();
      setActivityLog(Array.isArray(data) ? data : []);
    } catch { setActivityLog([]); }
    setLoadingActivity(false);
  }, []);

  const handleSaveModuleAccess = useCallback(async (userId, access) => {
    try {
      await fetch(`/api/users/${userId}/module-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleAccess: access }),
      });
      toast.success('Module access updated');
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, moduleAccess: access } : u));
    } catch { toast.error('Failed to update'); }
  }, []);

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
  });

  const roleCounts = { master_admin: 0, admin: 0, employee: 0 };
  users.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      <GuideCard storageKey="guide_users" icon={Info} title="👤 User Management Guide">
        <p>• ➕ <strong>Invite team members</strong> — users appear here after they sign in with Google or Email</p>
        <p>• 🔐 <strong>Assign roles</strong> to control access:</p>
        <p>&nbsp;&nbsp;&nbsp;◦ <strong>Master Admin</strong> — Full access including Settings & Integrations</p>
        <p>&nbsp;&nbsp;&nbsp;◦ <strong>Admin</strong> — Everything except Settings & Integrations</p>
        <p>&nbsp;&nbsp;&nbsp;◦ <strong>Employee</strong> — Dashboard + KDS only (no financial data)</p>
        <p>• 🗑️ Remove users who no longer need access — this cannot be undone</p>
      </GuideCard>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{users.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Users</p>
        </div>
        {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
          <div key={role} className="text-center p-3 rounded-lg bg-muted/50 border">
            <cfg.icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{roleCounts[role]}</p>
            <p className="text-[10px] text-muted-foreground">{cfg.label}s</p>
          </div>
        ))}
      </div>

      {/* User List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Users className="w-5 h-5 text-violet-600" /></div>
              <div><CardTitle className="text-base">Team Members</CardTitle><CardDescription>Manage users, roles, and module access</CardDescription></div>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 w-[180px] text-xs" />
              </div>
              <Button onClick={() => setShowAddDialog(true)} className="gap-1.5 h-8 text-xs">
                <UserPlus className="w-3.5 h-3.5" />Add User
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">{search ? 'No users match your search' : 'No users yet. Add your first team member.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(user => {
                const roleInfo = ROLE_CONFIG[user.role] || ROLE_CONFIG.employee;
                const RoleIcon = roleInfo.icon;
                return (
                  <div key={user._id} className="p-3 rounded-lg border hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="text-sm font-bold text-primary">{(user.name || user.email || 'U')[0].toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{user.name || 'Unnamed'}</span>
                          <Badge variant="outline" className={`text-[9px] h-4 ${roleInfo.color}`}>{roleInfo.label}</Badge>
                          {user.googleId && <Badge variant="outline" className="text-[9px] h-4">Google</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{user.email}</span>
                          <span className="text-[10px] text-muted-foreground">Joined {fmtRelative(user.createdAt)}</span>
                          {user.lastLoginAt && <span className="text-[10px] text-muted-foreground">Last login {fmtRelative(user.lastLoginAt)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Select value={user.role} onValueChange={(val) => handleRoleChange(user._id, val)} disabled={changingRole[user._id]}>
                          <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                              <SelectItem key={role} value={role}>
                                <span className="text-xs">{cfg.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditUser(user); setModuleAccess(user.moduleAccess || {}); setShowEditDialog(true); }}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewActivity(user)}>
                          <Activity className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteUser(user._id, user.name || user.email)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />Add Team Member</DialogTitle>
            <DialogDescription>Create a new user with email and password login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Name</Label><Input value={newUser.name} onChange={e => setNewUser(p => ({...p, name: e.target.value}))} placeholder="Full name" className="mt-1" /></div>
            <div><Label className="text-xs">Email *</Label><Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))} placeholder="user@example.com" className="mt-1" /></div>
            <div><Label className="text-xs">Password *</Label><Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))} placeholder="Min 6 characters" className="mt-1" /></div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={newUser.role} onValueChange={val => setNewUser(p => ({...p, role: val}))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                    <SelectItem key={role} value={role}>
                      <div><span className="text-xs font-medium">{cfg.label}</span><span className="text-[10px] text-muted-foreground ml-2">{cfg.desc}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User / Module Access Dialog */}
      <Dialog open={showEditDialog} onOpenChange={v => { if (!v) setShowEditDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit className="w-5 h-5" />Edit {editUser?.name || 'User'}</DialogTitle>
            <DialogDescription>Configure module access for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{(editUser?.name || 'U')[0].toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{editUser?.name || 'Unnamed'}</p>
                <p className="text-[11px] text-muted-foreground">{editUser?.email}</p>
              </div>
              <Badge variant="outline" className={`ml-auto text-[9px] h-4 ${ROLE_CONFIG[editUser?.role]?.color}`}>{ROLE_CONFIG[editUser?.role]?.label}</Badge>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold mb-2">Module Access</p>
              <p className="text-[10px] text-muted-foreground mb-3">Control which modules this user can see. Only applies to Admin and Employee roles.</p>
              {Object.entries(moduleSettings).map(([key, mod]) => (
                <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-xs">{mod.label}</span>
                  <Switch
                    checked={moduleAccess[key] !== false}
                    onCheckedChange={checked => setModuleAccess(prev => ({...prev, [key]: checked}))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => { handleSaveModuleAccess(editUser._id, moduleAccess); setShowEditDialog(false); }} className="gap-1.5">
              <CheckCircle className="w-4 h-4" />Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Log Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={v => { if (!v) setShowActivityDialog(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Activity className="w-5 h-5" />Activity — {activityUser?.name || 'User'}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {loadingActivity ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : activityLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet.</p>
            ) : (
              <div className="space-y-1">
                {activityLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <p>{log.action}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(log.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
