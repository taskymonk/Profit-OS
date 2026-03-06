'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import {
  Download, Upload, Database, FileJson, FileSpreadsheet, Package, ShoppingCart,
  Receipt, Boxes, Users, MessageSquare, PackageX, Settings2, Loader2, CheckCircle,
  AlertCircle, ArrowRight, ArrowDown, ChevronRight, Archive, RefreshCw, Calendar,
  HardDrive, Shield, AlertTriangle, FileUp, X
} from 'lucide-react';
import { toast } from 'sonner';

// Module definitions
const EXPORT_MODULES = [
  { id: 'orders', label: 'Orders', icon: ShoppingCart, description: 'All orders with profit data', hasDateFilter: true, color: 'blue' },
  { id: 'recipes', label: 'SKU Recipes & Templates', icon: Package, description: 'Product recipes, ingredients, and templates', color: 'green' },
  { id: 'expenses', label: 'Expenses & Finance', icon: Receipt, description: 'Expenses, categories, bills, and vendors', hasDateFilter: true, color: 'purple' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, description: 'Inventory items, categories, raw materials, stock', color: 'amber' },
  { id: 'employees', label: 'Employees & KDS', icon: Users, description: 'Employee data, assignments, wastage logs', color: 'indigo' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, description: 'Templates, messages, opt-outs', color: 'emerald' },
  { id: 'rto', label: 'Returns & RTO', icon: PackageX, description: 'RTO parcels and action history', color: 'red' },
  { id: 'settings', label: 'Settings & Users', icon: Settings2, description: 'Tenant config, users (sanitized, no secrets)', color: 'slate' },
];

const fmtNum = (n) => (n || 0).toLocaleString('en-IN');
const fmtSize = (bytes) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export default function DataManagementView() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);

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
  const [importStep, setImportStep] = useState('upload'); // upload → preview → importing → done
  const [selectedImportModules, setSelectedImportModules] = useState(new Set());
  const [conflictStrategy, setConflictStrategy] = useState('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/data/export-counts');
        const data = await res.json();
        setCounts(data);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  // ==================== EXPORT ====================
  const toggleExportModule = (id) => {
    setSelectedExportModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllExport = () => {
    setSelectedExportModules(new Set(EXPORT_MODULES.map(m => m.id)));
  };

  const deselectAllExport = () => {
    setSelectedExportModules(new Set());
  };

  const handleExport = useCallback(async () => {
    if (selectedExportModules.size === 0) { toast.error('Select at least one module to export'); return; }
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
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `profitos-orders-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        setExportResult({ success: true, format: 'csv', message: 'CSV file downloaded!' });
        toast.success('CSV export downloaded!');
      } else {
        const data = await res.json();
        if (data.error) { toast.error(data.error); setExportResult({ error: data.error }); return; }

        // Download as JSON file
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `profitos-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        setExportResult({
          success: true, format: 'json',
          summary: data._meta?.summary || {},
          size: fmtSize(new Blob([jsonStr]).size),
          message: 'JSON export downloaded!',
        });
        toast.success('Export downloaded!');
      }
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
      setExportResult({ error: err.message });
    }
    setExporting(false);
  }, [selectedExportModules, exportFormat, exportDateFrom, exportDateTo]);

  // ==================== IMPORT ====================
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please select a JSON file (exported from Profit OS)');
      return;
    }

    setImportFile(file);
    setImportStep('preview');
    setImportPreview(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);

      if (!data._meta || data._meta.version !== '1.0') {
        toast.error('Invalid or unsupported export file');
        resetImport();
        return;
      }

      // Get preview from backend
      const res = await fetch('/api/data/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const preview = await res.json();

      if (preview.error) {
        toast.error(preview.error);
        resetImport();
        return;
      }

      setImportPreview(preview);
      // Pre-select all available modules
      setSelectedImportModules(new Set(Object.keys(preview.modules)));
    } catch (err) {
      toast.error('Failed to parse JSON file');
      resetImport();
    }

    e.target.value = '';
  }, []);

  const resetImport = () => {
    setImportFile(null);
    setImportData(null);
    setImportPreview(null);
    setImportStep('upload');
    setSelectedImportModules(new Set());
    setImportResult(null);
  };

  const toggleImportModule = (id) => {
    setSelectedImportModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = useCallback(async () => {
    if (!importData || selectedImportModules.size === 0) { toast.error('Select modules to import'); return; }
    setImporting(true);
    setImportStep('importing');

    try {
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importData,
          selectedModules: Array.from(selectedImportModules),
          conflictStrategy,
        }),
      });
      const result = await res.json();

      if (result.error) {
        toast.error(result.error);
        setImportStep('preview');
      } else {
        setImportResult(result);
        setImportStep('done');
        toast.success('Import completed!');
        // Reload counts
        const cRes = await fetch('/api/data/export-counts');
        const cData = await cRes.json();
        setCounts(cData);
      }
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
      setImportStep('preview');
    }
    setImporting(false);
  }, [importData, selectedImportModules, conflictStrategy]);

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}</div>;

  const totalRecords = counts ? Object.values(counts).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">Export, import, and manage your business data. All exports are in Profit OS format for easy reimport.</p>
      </div>

      {/* Data Overview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Database className="w-5 h-5 text-primary" /></div>
            <div>
              <CardTitle className="text-base">Data Overview</CardTitle>
              <CardDescription>{fmtNum(totalRecords)} total records across {Object.keys(counts || {}).filter(k => counts[k] > 0).length} collections</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Orders', count: counts?.orders, icon: ShoppingCart },
              { label: 'Recipes', count: counts?.recipes, icon: Package },
              { label: 'Expenses', count: counts?.expenses, icon: Receipt },
              { label: 'Inventory', count: (counts?.inventoryItems || 0) + (counts?.inventoryCategories || 0), icon: Boxes },
              { label: 'Users', count: counts?.users, icon: Users },
              { label: 'RTO', count: counts?.rtoParcels, icon: PackageX },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="text-center p-2 rounded-lg bg-muted/50">
                  <Icon className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{fmtNum(item.count)}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ==================== EXPORT SECTION ==================== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Download className="w-5 h-5 text-blue-600" /></div>
              <div>
                <CardTitle className="text-base">Export Data</CardTitle>
                <CardDescription>Download your data as JSON or CSV</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Module Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Select Modules</Label>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAllExport}>Select All</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={deselectAllExport}>Clear</Button>
                </div>
              </div>
              <div className="space-y-1.5">
                {EXPORT_MODULES.map(mod => {
                  const Icon = mod.icon;
                  const isSelected = selectedExportModules.has(mod.id);
                  const moduleCount = mod.id === 'recipes' ? (counts?.recipes || 0) + (counts?.recipeTemplates || 0) :
                    mod.id === 'expenses' ? (counts?.expenses || 0) + (counts?.expenseCategories || 0) + (counts?.bills || 0) + (counts?.vendors || 0) :
                    mod.id === 'inventory' ? (counts?.inventoryItems || 0) + (counts?.inventoryCategories || 0) + (counts?.rawMaterials || 0) :
                    mod.id === 'employees' ? (counts?.employees || 0) + (counts?.kdsAssignments || 0) :
                    mod.id === 'whatsapp' ? (counts?.whatsappTemplates || 0) + (counts?.whatsappMessages || 0) :
                    mod.id === 'rto' ? counts?.rtoParcels || 0 :
                    mod.id === 'settings' ? (counts?.users || 0) :
                    counts?.[mod.id] || 0;

                  return (
                    <button key={mod.id} onClick={() => toggleExportModule(mod.id)}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{mod.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{mod.description}</p>
                      </div>
                      <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{fmtNum(moduleCount)}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format & Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Format</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json"><span className="flex items-center gap-1.5"><FileJson className="w-3 h-3" />JSON (reimportable)</span></SelectItem>
                    <SelectItem value="csv"><span className="flex items-center gap-1.5"><FileSpreadsheet className="w-3 h-3" />CSV (orders only)</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Range - only show if date-filterable modules selected */}
            {Array.from(selectedExportModules).some(m => EXPORT_MODULES.find(em => em.id === m)?.hasDateFilter) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />From Date</Label>
                  <Input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />To Date</Label>
                  <Input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} className="mt-1 h-8 text-xs" />
                </div>
              </div>
            )}

            <Button onClick={handleExport} disabled={exporting || selectedExportModules.size === 0} className="w-full gap-2">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? 'Exporting...' : `Export ${selectedExportModules.size} Module${selectedExportModules.size !== 1 ? 's' : ''}`}
            </Button>

            {exportResult && (
              <div className={`p-3 rounded-lg ${exportResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-2">
                  {exportResult.error ? <AlertCircle className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-green-600" />}
                  <span className="text-sm font-medium">{exportResult.error || exportResult.message}</span>
                </div>
                {exportResult.summary && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(exportResult.summary).map(([key, count]) => (
                      <Badge key={key} variant="secondary" className="text-[9px]">{key}: {count}</Badge>
                    ))}
                  </div>
                )}
                {exportResult.size && <p className="text-[10px] text-muted-foreground mt-1">File size: {exportResult.size}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ==================== IMPORT SECTION ==================== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Upload className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-base">Import Data</CardTitle>
                <CardDescription>Restore data from a Profit OS JSON export</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Step: Upload */}
            {importStep === 'upload' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="p-4 rounded-full bg-muted"><FileUp className="w-8 h-8 text-muted-foreground" /></div>
                <p className="text-sm text-muted-foreground text-center">Upload a JSON file exported from Profit OS.</p>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2"><Upload className="w-4 h-4" />Select File</Button>
              </div>
            )}

            {/* Step: Preview */}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                {importFile && (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium">{importFile.name}</span>
                      <Badge variant="secondary" className="text-[9px]">{fmtSize(importFile.size)}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetImport}><X className="w-3 h-3" /></Button>
                  </div>
                )}

                {importData?._meta && (
                  <p className="text-[11px] text-muted-foreground">Exported: {new Date(importData._meta.exportedAt).toLocaleString('en-IN')}</p>
                )}

                <div>
                  <Label className="text-xs font-medium mb-2 block">Select Modules to Import</Label>
                  <div className="space-y-1.5">
                    {Object.entries(importPreview.modules).map(([key, info]) => {
                      const isSelected = selectedImportModules.has(key);
                      return (
                        <button key={key} onClick={() => toggleImportModule(key)}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors ${isSelected ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20' : 'border-transparent hover:bg-muted/50'}`}>
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <div className="flex-1">
                            <p className="text-xs font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                            <div className="flex gap-2 mt-0.5">
                              {info.importCount !== undefined && <Badge variant="outline" className="text-[9px] h-4">{info.importCount} to import</Badge>}
                              {info.newCount !== undefined && info.newCount > 0 && <Badge variant="secondary" className="text-[9px] h-4 bg-green-100 text-green-700">{info.newCount} new</Badge>}
                              {info.duplicateCount > 0 && <Badge variant="secondary" className="text-[9px] h-4 bg-amber-100 text-amber-700">{info.duplicateCount} duplicates</Badge>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium">Conflict Resolution</Label>
                  <Select value={conflictStrategy} onValueChange={setConflictStrategy}>
                    <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip duplicates (safest)</SelectItem>
                      <SelectItem value="overwrite">Overwrite existing</SelectItem>
                      <SelectItem value="merge">Merge (fill empty fields)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {conflictStrategy === 'skip' && 'Existing records will be kept. Only new records will be added.'}
                    {conflictStrategy === 'overwrite' && 'Existing records will be replaced with imported data.'}
                    {conflictStrategy === 'merge' && 'Only empty fields in existing records will be filled from import.'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetImport} className="flex-1">Cancel</Button>
                  <Button onClick={handleImport} disabled={selectedImportModules.size === 0} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700">
                    <Upload className="w-4 h-4" />
                    Import {selectedImportModules.size} Module{selectedImportModules.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}

            {/* Step: Importing */}
            {importStep === 'importing' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-sm text-muted-foreground">Importing data... This may take a moment.</p>
              </div>
            )}

            {/* Step: Done */}
            {importStep === 'done' && importResult && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Import Complete!</span>
                  </div>
                  {importResult.results?.imported && (
                    <div className="space-y-1">
                      {Object.entries(importResult.results.imported).map(([key, info]) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="font-medium capitalize min-w-[100px]">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <div className="flex gap-1.5">
                            {info.inserted > 0 && <Badge className="text-[9px] h-4 bg-green-100 text-green-700 border-0">{info.inserted} added</Badge>}
                            {info.updated > 0 && <Badge className="text-[9px] h-4 bg-blue-100 text-blue-700 border-0">{info.updated} updated</Badge>}
                            {info.skipped > 0 && <Badge className="text-[9px] h-4 bg-gray-100 text-gray-600 border-0">{info.skipped} skipped</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {importResult.results?.errors?.length > 0 && (
                    <div className="mt-2 p-2 rounded bg-red-50 border border-red-200">
                      <p className="text-xs text-red-600 font-medium">{importResult.results.errors.length} error(s):</p>
                      {importResult.results.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-[10px] text-red-500">{err.module}: {err.error}</p>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={resetImport} className="w-full">Done — Import Another File</Button>
              </div>
            )}

            {importStep === 'upload' && (
              <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-700 space-y-1">
                    <p><strong>Import Safety:</strong></p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Only Profit OS JSON exports are supported</li>
                      <li>Choose &quot;Skip duplicates&quot; to safely add new records only</li>
                      <li>User passwords are never exported or imported</li>
                      <li>API keys and secrets are excluded from exports</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
