'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import GuideCard from '@/components/GuideCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff, Shield, Clock,
  ExternalLink, Code2, Loader2, CheckCircle, AlertCircle,
  BookOpen, Zap, Lock, Unlock, RefreshCw, Activity, FileJson
} from 'lucide-react';
import { toast } from 'sonner';

const SCOPE_LABELS = {
  read: { label: 'Read Only', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Eye, desc: 'Can read orders, products, expenses, dashboard data' },
  readwrite: { label: 'Read & Write', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Unlock, desc: 'Can read and modify data' },
  full: { label: 'Full Access', color: 'bg-red-100 text-red-700 border-red-200', icon: Shield, desc: 'Full API access including admin operations' },
};

const fmtTime = (d) => {
  if (!d) return 'Never';
  try {
    const dt = new Date(d);
    const now = new Date();
    const diff = now - dt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '-'; }
};

export default function ApiSettingsView() {
  const [activeTab, setActiveTab] = useState('keys');
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState('read');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState('100');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [showKey, setShowKey] = useState({});
  const [deleting, setDeleting] = useState(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      setApiKeys(Array.isArray(data) ? data : []);
    } catch { setApiKeys([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) { toast.error('Enter a key name'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scope: newKeyScope, rateLimit: parseInt(newKeyRateLimit) || 100 }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); }
      else {
        setCreatedKey(data);
        toast.success('API key created!');
        loadKeys();
      }
    } catch { toast.error('Failed to create key'); }
    setCreating(false);
  }, [newKeyName, newKeyScope, newKeyRateLimit, loadKeys]);

  const handleRevoke = useCallback(async (id) => {
    setDeleting(id);
    try {
      await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      toast.success('API key revoked');
      loadKeys();
    } catch { toast.error('Failed to revoke key'); }
    setDeleting(null);
  }, [loadKeys]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      <GuideCard storageKey="guide_api" icon={Info} title="🔑 API Keys & Developer Access Guide">
        <p>• 🔐 <strong>Generate API keys</strong> to access your data programmatically from external apps</p>
        <p>• 📋 <strong>Scope control</strong> — set keys as Read-Only, Read-Write, or Full Access</p>
        <p>• 🏷️ <strong>Name your keys</strong> for easy identification (e.g., "Zapier Integration", "Custom Dashboard")</p>
        <p>• ⚡ <strong>Rate limiting</strong> — configurable per key (default: 100 requests/minute)</p>
        <p>• 🔄 <strong>Revoke or regenerate</strong> keys anytime from this panel</p>
        <p>• 📖 Access API documentation for endpoint details, code examples, and response formats</p>
      </GuideCard>
      <p className="text-sm text-muted-foreground">Manage API keys and explore the public REST API documentation.</p>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Key className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{apiKeys.filter(k => !k.revoked).length}</p>
          <p className="text-[10px] text-muted-foreground">Active Keys</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Activity className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">{apiKeys.reduce((s, k) => s + (k.requestCount || 0), 0).toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Total Requests</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50 border">
          <Zap className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-xl font-bold">10</p>
          <p className="text-[10px] text-muted-foreground">Endpoints</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="keys" className="gap-1.5"><Key className="w-3.5 h-3.5" />API Keys</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" />Documentation</TabsTrigger>
          <TabsTrigger value="examples" className="gap-1.5"><Code2 className="w-3.5 h-3.5" />Code Examples</TabsTrigger>
        </TabsList>

        {/* ==================== API KEYS TAB ==================== */}
        <TabsContent value="keys" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Key className="w-5 h-5 text-violet-600" /></div>
                  <div><CardTitle className="text-base">API Keys</CardTitle><CardDescription>Generate and manage keys for external integrations</CardDescription></div>
                </div>
                <Button onClick={() => { setShowCreateDialog(true); setCreatedKey(null); setNewKeyName(''); setNewKeyScope('read'); setNewKeyRateLimit('100'); }} className="gap-2">
                  <Plus className="w-4 h-4" />Create Key
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No API keys yet. Create your first key to start using the API.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map(key => {
                    const scopeInfo = SCOPE_LABELS[key.scope] || SCOPE_LABELS.read;
                    const ScopeIcon = scopeInfo.icon;
                    return (
                      <div key={key._id} className={`p-3 rounded-lg border transition-shadow hover:shadow-sm ${key.revoked ? 'opacity-50 bg-muted/30' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="shrink-0">
                            <ScopeIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{key.name}</span>
                              <Badge variant="outline" className={`text-[9px] h-4 ${scopeInfo.color}`}>{scopeInfo.label}</Badge>
                              {key.revoked && <Badge variant="destructive" className="text-[9px] h-4">Revoked</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">{key.maskedKey}</code>
                              <span className="text-[10px] text-muted-foreground">Created {fmtTime(key.createdAt)}</span>
                              {key.lastUsedAt && <span className="text-[10px] text-muted-foreground">Last used {fmtTime(key.lastUsedAt)}</span>}
                              <span className="text-[10px] text-muted-foreground">{(key.requestCount || 0).toLocaleString()} requests</span>
                              <span className="text-[10px] text-muted-foreground">{key.rateLimit || 100}/min</span>
                            </div>
                          </div>
                          {!key.revoked && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" disabled={deleting === key._id} onClick={() => handleRevoke(key._id)}>
                              {deleting === key._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-700 space-y-0.5">
                <p><strong>Security:</strong> API keys provide direct access to your data. Use read-only keys when possible, and rotate keys regularly.</p>
                <p>Keys are hashed before storage. The full key is shown <strong>only once</strong> at creation time.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ==================== DOCUMENTATION TAB ==================== */}
        <TabsContent value="docs" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><BookOpen className="w-5 h-5 text-emerald-600" /></div>
                  <div><CardTitle className="text-base">Interactive API Documentation</CardTitle><CardDescription>Full Swagger/OpenAPI docs with try-it-out</CardDescription></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyToClipboard(`${baseUrl}/api/v1/openapi.json`)}>
                    <FileJson className="w-3 h-3" />Copy Spec URL
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.open(`${baseUrl}/api-docs`, '_blank')}>
                    <ExternalLink className="w-3 h-3" />Open Full Page
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden" style={{ height: '600px' }}>
                <iframe
                  src="/api-docs"
                  className="w-full h-full border-0"
                  title="API Documentation"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== CODE EXAMPLES TAB ==================== */}
        <TabsContent value="examples" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Code2 className="w-5 h-5 text-blue-600" /></div>
                <div><CardTitle className="text-base">Code Examples</CardTitle><CardDescription>Quick-start snippets for popular languages</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  lang: 'cURL',
                  icon: '🖥️',
                  code: `curl -X GET "${baseUrl}/api/v1/orders?page=1&limit=10" \\
  -H "X-API-Key: pos_your_key_here"`,
                },
                {
                  lang: 'JavaScript (fetch)',
                  icon: '🟨',
                  code: `const response = await fetch('${baseUrl}/api/v1/orders?page=1&limit=10', {
  headers: { 'X-API-Key': 'pos_your_key_here' }
});
const { success, data, meta } = await response.json();
console.log(\`Found \${meta.total} orders\`);`,
                },
                {
                  lang: 'Python (requests)',
                  icon: '🐍',
                  code: `import requests

response = requests.get(
    '${baseUrl}/api/v1/orders',
    headers={'X-API-Key': 'pos_your_key_here'},
    params={'page': 1, 'limit': 10}
)
data = response.json()
print(f"Found {data['meta']['total']} orders")`,
                },
                {
                  lang: 'Node.js (axios)',
                  icon: '🟢',
                  code: `const axios = require('axios');

const { data } = await axios.get('${baseUrl}/api/v1/orders', {
  headers: { 'X-API-Key': 'pos_your_key_here' },
  params: { page: 1, limit: 10 }
});
console.log(\`Found \${data.meta.total} orders\`);`,
                },
              ].map(ex => (
                <div key={ex.lang} className="rounded-lg border">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <span className="text-xs font-medium">{ex.icon} {ex.lang}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => copyToClipboard(ex.code)}>
                      <Copy className="w-3 h-3 mr-1" />Copy
                    </Button>
                  </div>
                  <pre className="p-3 text-[11px] font-mono overflow-x-auto bg-slate-950 text-slate-200 rounded-b-lg">
                    <code>{ex.code}</code>
                  </pre>
                </div>
              ))}

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Available Endpoints</h4>
                <div className="space-y-1">
                  {[
                    { method: 'GET', path: '/api/v1/orders', desc: 'List orders (paginated)' },
                    { method: 'GET', path: '/api/v1/orders/{id}', desc: 'Get order with profit data' },
                    { method: 'GET', path: '/api/v1/products', desc: 'List SKU recipes' },
                    { method: 'GET', path: '/api/v1/products/{id}', desc: 'Get product details' },
                    { method: 'GET', path: '/api/v1/expenses', desc: 'List overhead expenses' },
                    { method: 'GET', path: '/api/v1/dashboard', desc: 'Aggregated metrics' },
                    { method: 'GET', path: '/api/v1/finance/bills', desc: 'List bills' },
                    { method: 'GET', path: '/api/v1/finance/vendors', desc: 'List vendors' },
                    { method: 'GET', path: '/api/v1/inventory', desc: 'List inventory items' },
                    { method: 'GET', path: '/api/v1/employees', desc: 'List employees' },
                  ].map(ep => (
                    <div key={ep.path} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 text-xs">
                      <Badge variant="outline" className={`text-[9px] h-4 font-mono min-w-[36px] justify-center ${ep.method === 'GET' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{ep.method}</Badge>
                      <code className="font-mono text-[11px] text-foreground">{ep.path}</code>
                      <span className="text-muted-foreground flex-1">{ep.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== CREATE KEY DIALOG ==================== */}
      <Dialog open={showCreateDialog} onOpenChange={v => { if (!v) { setShowCreateDialog(false); setCreatedKey(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{createdKey ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Key className="w-5 h-5" />}{createdKey ? 'API Key Created' : 'Create API Key'}</DialogTitle>
            <DialogDescription>{createdKey ? 'Copy your key now. It won\'t be shown again.' : 'Generate a new API key for external access.'}</DialogDescription>
          </DialogHeader>

          {!createdKey ? (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Key Name</Label>
                <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g., Zapier Integration" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Permission Scope</Label>
                <Select value={newKeyScope} onValueChange={setNewKeyScope}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCOPE_LABELS).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span>{info.label}</span>
                          <span className="text-[10px] text-muted-foreground">— {info.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Rate Limit (requests/min)</Label>
                <Select value={newKeyRateLimit} onValueChange={setNewKeyRateLimit}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['50', '100', '200', '500', '1000'].map(v => <SelectItem key={v} value={v}>{v}/min</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Generate Key
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xs text-green-700 font-medium mb-2">Your API key (copy it now!):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border break-all">{createdKey.key}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdKey.key)}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700"><strong>Important:</strong> This is the only time your full key will be displayed. Store it securely.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); setCreatedKey(null); }} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
