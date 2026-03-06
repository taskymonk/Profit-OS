'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import GuideCard from '@/components/GuideCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download, Upload, Database, FileJson, FileSpreadsheet, Package, ShoppingCart,
  Receipt, Boxes, Users, MessageSquare, PackageX, Settings2, Loader2, CheckCircle,
  AlertCircle, ArrowRight, Calendar, HardDrive, Shield, FileUp, X,
  Clock, Trash2, RotateCcw, CloudUpload, ExternalLink, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

const EXPORT_MODULES = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart, description: 'All orders with profit data', hasDateFilter: true, color: 'blue' },
  { id: 'recipes', label: 'SKU Recipes & Templates', icon: Package, description: 'Product recipes, ingredients, and templates', color: 'green' },
  { id: 'expenses', label: 'Expenses & Finance', icon: Receipt, description: 'Expenses, categories, bills, and vendors', hasDateFilter: true, color: 'purple' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, description: 'Inventory items, categories, raw materials', color: 'amber' },
  { id: 'employees', label: 'Employees & KDS', icon: Users, description: 'Employee data, assignments, wastage logs', color: 'indigo' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, description: 'Templates, messages, opt-outs', color: 'emerald' },
  { id: 'rto', label: 'Returns & RTO', icon: PackageX, description: 'RTO parcels and action history', color: 'red' },
  { id: 'settings', label: 'Settings & Users', icon: Settings2, description: 'Tenant config, users (no secrets)', color: 'slate' },
];

const fmtNum = (n) => (n || 0).toLocaleString('en-IN');
const fmtSize = (bytes) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};
const fmtTime = (d) => {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    const now = new Date();
    const diff = now - dt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
};

export default function DataManagementView() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('export');

  // Export state
  const [selectedExportModules, setSelectedExportModules] = useState(new Set(['orders', 'recipes', 'expenses']));
  const [exportFormat, setExportFormat] = useState('json');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importStep, setImportStep] = useState('upload');
  const [selectedImportModules, setSelectedImportModules] = useState(new Set());
  const [conflictStrategy, setConflictStrategy] = useState('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Backup state
  const [backups, setBackups] = useState([]);
  const [backupConfig, setBackupConfig] = useState(null);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreModules, setRestoreModules] = useState(new Set());
  const [restoreStrategy, setRestoreStrategy] = useState('overwrite');
  const [restoreResult, setRestoreResult] = useState(null);
  const [uploadingToDrive, setUploadingToDrive] = useState({});
  const [connectingDrive, setConnectingDrive] = useState(false);

  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [cRes, bRes, bcRes] = await Promise.all([
        fetch('/api/data/export-counts'),
        fetch('/api/backups'),
        fetch('/api/backups/config'),
      ]);
      setCounts(await cRes.json());
      setBackups(await bRes.json());
      setBackupConfig(await bcRes.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Check for gdrive callback params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const gdrive = url.searchParams.get('gdrive');
    if (gdrive === 'success') {
      toast.success('Google Drive connected successfully!');
      setActiveTab('backup');
      loadData();
      window.history.replaceState({}, '', url.pathname);
    } else if (gdrive === 'error') {
      const msg = url.searchParams.get('msg') || 'Unknown error';
      toast.error(`Google Drive connection failed: ${msg}`);
      setActiveTab('backup');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [loadData]);

  // ==================== EXPORT ====================
  const toggleExportModule = (id) => setSelectedExportModules(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleExport = useCallback(async () => {
    if (selectedExportModules.size === 0) { toast.error('Select at least one module'); return; }
    setExporting(true);
    setExportResult(null);
    try {
      const modules = Array.from(selectedExportModules).join(',');
      let url = `/api/data/export?modules=${modules}&format=${exportFormat}`;
      if (exportDateFrom) url += `&dateFrom=${exportDateFrom}`;
      if (exportDateTo) url += `&dateTo=${exportDateTo}`;
      const res = await fetch(url);

      if (exportFormat === 'csv') {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `profitos-orders-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setExportResult({ success: true, format: 'csv', message: 'CSV downloaded!' });
        toast.success('CSV export downloaded!');
      } else {
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `profitos-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setExportResult({ success: true, summary: data._meta?.summary, size: fmtSize(blob.size), message: 'JSON downloaded!' });
        toast.success('Export downloaded!');
      }
    } catch (err) { toast.error(`Export failed: ${err.message}`); }
    setExporting(false);
  }, [selectedExportModules, exportFormat, exportDateFrom, exportDateTo]);

  // ==================== IMPORT ====================
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.json')) { toast.error('Select a JSON file'); return; }
    setImportFile(file);
    setImportStep('preview');
    try {
      const data = JSON.parse(await file.text());
      setImportData(data);
      if (!data._meta || data._meta.version !== '1.0') { toast.error('Invalid export file'); resetImport(); return; }
      const res = await fetch('/api/data/import-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const preview = await res.json();
      if (preview.error) { toast.error(preview.error); resetImport(); return; }
      setImportPreview(preview);
      setSelectedImportModules(new Set(Object.keys(preview.modules)));
    } catch { toast.error('Failed to parse file'); resetImport(); }
    e.target.value = '';
  }, []);

  const resetImport = () => { setImportFile(null); setImportData(null); setImportPreview(null); setImportStep('upload'); setSelectedImportModules(new Set()); setImportResult(null); };

  const handleImport = useCallback(async () => {
    if (!importData || selectedImportModules.size === 0) return;
    setImporting(true); setImportStep('importing');
    try {
      const res = await fetch('/api/data/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ importData, selectedModules: Array.from(selectedImportModules), conflictStrategy }) });
      const result = await res.json();
      if (result.error) { toast.error(result.error); setImportStep('preview'); }
      else { setImportResult(result); setImportStep('done'); toast.success('Import completed!'); loadData(); }
    } catch (err) { toast.error(`Import failed: ${err.message}`); setImportStep('preview'); }
    setImporting(false);
  }, [importData, selectedImportModules, conflictStrategy, loadData]);

  // ==================== BACKUP ====================
  const handleCreateBackup = useCallback(async () => {
    setCreatingBackup(true);
    try {
      const res = await fetch('/api/backups/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: `Manual backup` }) });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else { toast.success(`Backup created! ${data.totalRecords} records, ${fmtSize(data.sizeBytes)}`); loadData(); }
    } catch (err) { toast.error('Backup failed'); }
    setCreatingBackup(false);
  }, [loadData]);

  const handleDeleteBackup = useCallback(async (id) => {
    try {
      const res = await fetch('/api/backups/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupId: id }) });
      if ((await res.json()).success) { toast.success('Backup deleted'); loadData(); }
    } catch { toast.error('Delete failed'); }
  }, [loadData]);

  const handleDownloadBackup = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/backups/download?id=${id}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `profitos-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast.success('Backup downloaded!');
    } catch { toast.error('Download failed'); }
  }, []);

  const handleRestore = useCallback(async () => {
    if (!restoreDialog || restoreModules.size === 0) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/backups/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupId: restoreDialog._id, selectedModules: Array.from(restoreModules), conflictStrategy: restoreStrategy }) });
      const data = await res.json();
      if (data.success) { setRestoreResult(data); toast.success('Restore completed!'); loadData(); }
      else toast.error(data.error || 'Restore failed');
    } catch { toast.error('Restore failed'); }
    setRestoring(false);
  }, [restoreDialog, restoreModules, restoreStrategy, loadData]);

  const handleUploadToDrive = useCallback(async (id) => {
    setUploadingToDrive(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/backups/gdrive/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupId: id }) });
      const data = await res.json();
      if (data.success) { toast.success(`Uploaded to Drive: ${data.fileName}`); loadData(); }
      else toast.error(data.error || 'Upload failed');
    } catch { toast.error('Drive upload failed'); }
    setUploadingToDrive(prev => ({ ...prev, [id]: false }));
  }, [loadData]);

  const handleConnectDrive = useCallback(async () => {
    setConnectingDrive(true);
    try {
      const res = await fetch('/api/backups/gdrive/auth-url');
      const data = await res.json();
      if (data.error) { toast.error(data.error); setConnectingDrive(false); return; }
      window.location.href = data.authUrl;
    } catch { toast.error('Failed to initiate Drive connection'); setConnectingDrive(false); }
  }, []);

  const handleDisconnectDrive = useCallback(async () => {
    try {
      await fetch('/api/backups/gdrive/disconnect', { method: 'POST' });
      toast.success('Google Drive disconnected');
      loadData();
    } catch { toast.error('Disconnect failed'); }
  }, [loadData]);

  const handleBackupConfigUpdate = useCallback(async (updates) => {
    try {
      await fetch('/api/backups/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      loadData();
      toast.success('Backup settings updated!');
    } catch { toast.error('Failed to update settings'); }
  }, [loadData]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;

  const totalRecords = counts ? Object.values(counts).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      <GuideCard storageKey="guide_data" icon={Database} title="💾 Data Management Guide">
        <p>• 📤 <strong>Export data</strong> — Download orders, recipes, inventory, expenses, etc. as JSON or CSV</p>
        <p>• 📥 <strong>Import data</strong> — Upload JSON files to restore or migrate data with conflict resolution</p>
        <p>• 💾 <strong>Backups</strong> — Create manual snapshots or set up auto-backup schedules (Daily/Weekly/Monthly)</p>
        <p>• ☁️ <strong>Google Drive</strong> — Connect your Drive to auto-upload backups to the cloud</p>
        <p>• 🔄 <strong>Selective restore</strong> — Choose specific modules to restore without overwriting everything</p>
        <p>• ⚠️ Always create a backup <strong>before importing</strong> to avoid data loss</p>
      </GuideCard>
      <p className="text-sm text-muted-foreground">Export, import, backup, and restore your business data.</p>

      {/* Data Overview */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        {[
          { label: 'Orders', count: counts?.orders, icon: ShoppingCart },
          { label: 'Recipes', count: counts?.recipes, icon: Package },
          { label: 'Expenses', count: counts?.expenses, icon: Receipt },
          { label: 'Inventory', count: (counts?.inventoryItems || 0) + (counts?.inventoryCategories || 0), icon: Boxes },
          { label: 'Users', count: counts?.users, icon: Users },
          { label: 'RTO', count: counts?.rtoParcels, icon: PackageX },
          { label: 'Backups', count: backups.length, icon: HardDrive },
        ].map(i => {
          const Icon = i.icon;
          return (
            <div key={i.label} className="text-center p-2 rounded-lg bg-muted/50 border">
              <Icon className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{fmtNum(i.count)}</p>
              <p className="text-[10px] text-muted-foreground">{i.label}</p>
            </div>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="export" className="gap-1.5"><Download className="w-3.5 h-3.5" />Export</TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5"><Upload className="w-3.5 h-3.5" />Import</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5"><HardDrive className="w-3.5 h-3.5" />Backup & Restore ({backups.length})</TabsTrigger>
        </TabsList>

        {/* ==================== EXPORT TAB ==================== */}
        <TabsContent value="export" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Download className="w-5 h-5 text-blue-600" /></div>
                <div><CardTitle className="text-base">Export Data</CardTitle><CardDescription>Download as JSON (reimportable) or CSV (readable)</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">Select Modules</Label>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setSelectedExportModules(new Set(EXPORT_MODULES.map(m => m.id)))}>All</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setSelectedExportModules(new Set())}>Clear</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {EXPORT_MODULES.map(mod => {
                  const Icon = mod.icon;
                  const sel = selectedExportModules.has(mod.id);
                  const mc = mod.id === 'recipes' ? (counts?.recipes||0)+(counts?.recipeTemplates||0) : mod.id === 'expenses' ? (counts?.expenses||0)+(counts?.expenseCategories||0)+(counts?.bills||0)+(counts?.vendors||0) : mod.id === 'inventory' ? (counts?.inventoryItems||0)+(counts?.inventoryCategories||0)+(counts?.rawMaterials||0) : mod.id === 'employees' ? (counts?.employees||0)+(counts?.kdsAssignments||0) : mod.id === 'whatsapp' ? (counts?.whatsappTemplates||0)+(counts?.whatsappMessages||0) : mod.id === 'rto' ? counts?.rtoParcels||0 : mod.id === 'settings' ? counts?.users||0 : counts?.[mod.id]||0;
                  return (
                    <button key={mod.id} onClick={() => toggleExportModule(mod.id)} className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${sel ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                      <Checkbox checked={sel} className="pointer-events-none" />
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium">{mod.label}</p></div>
                      <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{fmtNum(mc)}</Badge>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Format</Label>
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json"><span className="flex items-center gap-1.5"><FileJson className="w-3 h-3" />JSON</span></SelectItem>
                      <SelectItem value="csv"><span className="flex items-center gap-1.5"><FileSpreadsheet className="w-3 h-3" />CSV (orders only)</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {Array.from(selectedExportModules).some(m => EXPORT_MODULES.find(e => e.id === m)?.hasDateFilter) && (
                  <>
                    <div className="flex-1"><Label className="text-xs">From</Label><Input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} className="mt-1 h-8 text-xs" /></div>
                    <div className="flex-1"><Label className="text-xs">To</Label><Input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} className="mt-1 h-8 text-xs" /></div>
                  </>
                )}
              </div>

              <Button onClick={handleExport} disabled={exporting || selectedExportModules.size === 0} className="w-full gap-2">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export {selectedExportModules.size} Module{selectedExportModules.size !== 1 ? 's' : ''}
              </Button>

              {exportResult?.success && (
                <div className="p-2.5 rounded-lg bg-green-50 border border-green-200 text-xs">
                  <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="font-medium text-green-700">{exportResult.message}</span></div>
                  {exportResult.summary && <div className="flex flex-wrap gap-1 mt-1.5">{Object.entries(exportResult.summary).map(([k,v]) => <Badge key={k} variant="secondary" className="text-[9px]">{k}: {v}</Badge>)}</div>}
                  {exportResult.size && <p className="text-[10px] text-muted-foreground mt-1">Size: {exportResult.size}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== IMPORT TAB ==================== */}
        <TabsContent value="import" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Upload className="w-5 h-5 text-emerald-600" /></div>
                <div><CardTitle className="text-base">Import Data</CardTitle><CardDescription>Restore from a Profit OS JSON export file</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {importStep === 'upload' && (
                <>
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="p-4 rounded-full bg-muted"><FileUp className="w-8 h-8 text-muted-foreground" /></div>
                    <p className="text-sm text-muted-foreground text-center">Upload a JSON file exported from Profit OS.</p>
                    <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2"><Upload className="w-4 h-4" />Select File</Button>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-700 space-y-0.5">
                        <p><strong>Safety:</strong> Only Profit OS JSON exports accepted. Passwords & API keys are never exported.</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {importStep === 'preview' && importPreview && (
                <div className="space-y-3">
                  {importFile && (
                    <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                      <div className="flex items-center gap-2"><FileJson className="w-4 h-4 text-blue-600" /><span className="text-xs font-medium">{importFile.name}</span><Badge variant="secondary" className="text-[9px]">{fmtSize(importFile.size)}</Badge></div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetImport}><X className="w-3 h-3" /></Button>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {Object.entries(importPreview.modules).map(([key, info]) => (
                      <button key={key} onClick={() => setSelectedImportModules(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors ${selectedImportModules.has(key) ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20' : 'border-transparent hover:bg-muted/50'}`}>
                        <Checkbox checked={selectedImportModules.has(key)} className="pointer-events-none" />
                        <div className="flex-1">
                          <p className="text-xs font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            {info.importCount !== undefined && <Badge variant="outline" className="text-[9px] h-4">{info.importCount} to import</Badge>}
                            {info.newCount > 0 && <Badge variant="secondary" className="text-[9px] h-4 bg-green-100 text-green-700">{info.newCount} new</Badge>}
                            {info.duplicateCount > 0 && <Badge variant="secondary" className="text-[9px] h-4 bg-amber-100 text-amber-700">{info.duplicateCount} duplicates</Badge>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div>
                    <Label className="text-xs">Conflict Resolution</Label>
                    <Select value={conflictStrategy} onValueChange={setConflictStrategy}>
                      <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip duplicates (safest)</SelectItem>
                        <SelectItem value="overwrite">Overwrite existing</SelectItem>
                        <SelectItem value="merge">Merge (fill empty fields)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetImport} className="flex-1">Cancel</Button>
                    <Button onClick={handleImport} disabled={selectedImportModules.size === 0} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"><Upload className="w-4 h-4" />Import</Button>
                  </div>
                </div>
              )}
              {importStep === 'importing' && <div className="flex flex-col items-center gap-4 py-8"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /><p className="text-sm text-muted-foreground">Importing...</p></div>}
              {importStep === 'done' && importResult && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-sm font-medium text-green-700">Import Complete!</span></div>
                    {importResult.results?.imported && Object.entries(importResult.results.imported).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs"><span className="font-medium min-w-[80px] capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        {v.inserted > 0 && <Badge className="text-[9px] h-4 bg-green-100 text-green-700 border-0">{v.inserted} added</Badge>}
                        {v.updated > 0 && <Badge className="text-[9px] h-4 bg-blue-100 text-blue-700 border-0">{v.updated} updated</Badge>}
                        {v.skipped > 0 && <Badge className="text-[9px] h-4 bg-gray-100 text-gray-600 border-0">{v.skipped} skipped</Badge>}
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" onClick={resetImport} className="w-full">Import Another</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== BACKUP & RESTORE TAB ==================== */}
        <TabsContent value="backup" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Create Backup */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><HardDrive className="w-4 h-4" />Create Backup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Full snapshot of all your data. Backups are stored securely and can be downloaded or uploaded to Google Drive.</p>
                <Button onClick={handleCreateBackup} disabled={creatingBackup} className="w-full gap-2">
                  {creatingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                  {creatingBackup ? 'Creating...' : 'Create Backup Now'}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">Retention: last {backupConfig?.retention || 5} backups kept</p>
              </CardContent>
            </Card>

            {/* Auto-Backup */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />Auto-Backup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Enable Auto-Backup</span>
                  <Switch checked={backupConfig?.autoEnabled || false} onCheckedChange={v => handleBackupConfigUpdate({ autoEnabled: v })} />
                </div>
                {backupConfig?.autoEnabled && (
                  <Select value={backupConfig?.frequency || 'off'} onValueChange={v => handleBackupConfigUpdate({ frequency: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <div>
                  <Label className="text-xs">Retention (max backups)</Label>
                  <Select value={String(backupConfig?.retention || 5)} onValueChange={v => handleBackupConfigUpdate({ retention: parseInt(v) })}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3,5,10,20].map(n => <SelectItem key={n} value={String(n)}>{n} backups</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {backupConfig?.lastAutoBackup && <p className="text-[10px] text-muted-foreground">Last: {fmtTime(backupConfig.lastAutoBackup)}</p>}
              </CardContent>
            </Card>

            {/* Google Drive */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/><path d="M43.65 25.15L29.9 1.35c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-32.05z" fill="#00AC47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.2c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#EA4335"/><path d="M43.65 25.15L57.4 1.35C56.05.55 54.5 0 52.8 0H34.5c-1.7 0-3.35.55-4.6 1.35l13.75 23.8z" fill="#00832D"/><path d="M59.85 52.7h-32.3L13.8 76.5c1.35.8 2.9 1.3 4.6 1.3h22.1c1.7 0 3.25-.45 4.6-1.3L59.85 52.7z" fill="#2684FC"/><path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25.15l16.2 27.55h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00"/></svg>
                  Google Drive
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {backupConfig?.gdrive?.connected ? (
                  <>
                    <div className="p-2 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="text-xs text-green-700 font-medium">Connected</span></div>
                      {backupConfig.gdrive.email && <p className="text-[10px] text-green-600 mt-0.5">{backupConfig.gdrive.email}</p>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs">Auto-upload to Drive</span>
                      <Switch checked={backupConfig.gdrive.autoUpload || false} onCheckedChange={v => handleBackupConfigUpdate({ gdriveAutoUpload: v })} />
                    </div>
                    {backupConfig.gdrive.lastUpload && <p className="text-[10px] text-muted-foreground">Last upload: {fmtTime(backupConfig.gdrive.lastUpload)}</p>}
                    <Button variant="outline" size="sm" className="w-full text-xs text-red-600 border-red-200" onClick={handleDisconnectDrive}>Disconnect Drive</Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Connect Google Drive to auto-upload backups for extra safety.</p>
                    <Button onClick={handleConnectDrive} disabled={connectingDrive} variant="outline" className="w-full gap-2 text-xs">
                      {connectingDrive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                      Connect Google Drive
                    </Button>
                    <p className="text-[10px] text-muted-foreground">Requires Google OAuth credentials in Integrations → Authentication.</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Backup History */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Backup History ({backups.length})</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadData}><RefreshCw className="w-3 h-3 mr-1" />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              {backups.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No backups yet. Create your first backup above.</p>
              ) : (
                <div className="space-y-2">
                  {backups.map(b => (
                    <div key={b._id} className="flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow">
                      <HardDrive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{b.label}</span>
                          <Badge variant="secondary" className="text-[9px] h-4">{b.trigger || 'manual'}</Badge>
                          {b.driveFileId && <Badge variant="outline" className="text-[9px] h-4 border-blue-200 text-blue-600">
                            <svg className="w-2 h-2 mr-0.5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg"><path d="M43.65 25.15L29.9 1.35c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-32.05z" fill="#00AC47"/></svg>
                            Drive
                          </Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{fmtNum(b.totalRecords)} records • {fmtSize(b.sizeBytes)} • {fmtTime(b.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDownloadBackup(b._id)}><Download className="w-3 h-3" /></Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setRestoreDialog(b); setRestoreModules(new Set(Object.keys(b.summary || {}).filter(k => b.summary[k] > 0))); setRestoreResult(null); }}><RotateCcw className="w-3 h-3" /></Button>
                        {backupConfig?.gdrive?.connected && !b.driveFileId && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={uploadingToDrive[b._id]} onClick={() => handleUploadToDrive(b._id)}>
                            {uploadingToDrive[b._id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-500" onClick={() => handleDeleteBackup(b._id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== RESTORE DIALOG ==================== */}
      <Dialog open={!!restoreDialog} onOpenChange={v => { if (!v) { setRestoreDialog(null); setRestoreResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5" />Restore from Backup</DialogTitle>
            <DialogDescription>{restoreDialog?.label} • {fmtNum(restoreDialog?.totalRecords)} records • {fmtTime(restoreDialog?.createdAt)}</DialogDescription>
          </DialogHeader>
          {!restoreResult ? (
            <div className="space-y-3 py-2">
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /><p className="text-xs text-amber-700"><strong>Warning:</strong> Restoring with &quot;Overwrite&quot; will replace existing data. Use &quot;Skip&quot; to only add missing records.</p></div>
              </div>
              <div>
                <Label className="text-xs font-medium mb-2 block">Select Modules to Restore</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {restoreDialog?.summary && Object.entries(restoreDialog.summary).filter(([,v]) => v > 0).map(([key, count]) => (
                    <button key={key} onClick={() => setRestoreModules(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                      className={`w-full flex items-center gap-2 p-1.5 rounded text-left text-xs ${restoreModules.has(key) ? 'bg-blue-50' : 'hover:bg-muted/50'}`}>
                      <Checkbox checked={restoreModules.has(key)} className="pointer-events-none" />
                      <span className="flex-1 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <Badge variant="secondary" className="text-[9px] h-4">{count}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Conflict Strategy</Label>
                <Select value={restoreStrategy} onValueChange={setRestoreStrategy}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip existing (safest)</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreDialog(null)}>Cancel</Button>
                <Button onClick={handleRestore} disabled={restoring || restoreModules.size === 0} className="bg-amber-600 hover:bg-amber-700 gap-2">
                  {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Restore {restoreModules.size} Module{restoreModules.size !== 1 ? 's' : ''}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-sm font-medium text-green-700">Restore Complete!</span></div>
                {restoreResult.results?.imported && Object.entries(restoreResult.results.imported).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="min-w-[80px] capitalize font-medium">{k.replace(/([A-Z])/g, ' $1')}</span>
                    {v.inserted > 0 && <Badge className="text-[9px] h-4 bg-green-100 text-green-700 border-0">{v.inserted} added</Badge>}
                    {v.updated > 0 && <Badge className="text-[9px] h-4 bg-blue-100 text-blue-700 border-0">{v.updated} updated</Badge>}
                    {v.skipped > 0 && <Badge className="text-[9px] h-4 bg-gray-100 text-gray-600 border-0">{v.skipped} skipped</Badge>}
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={() => { setRestoreDialog(null); setRestoreResult(null); }} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
