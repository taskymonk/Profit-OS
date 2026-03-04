'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  MessageSquare, Plus, Edit2, Trash2, Send, ToggleLeft, ToggleRight,
  RefreshCw, Eye, Clock, CheckCircle2, AlertTriangle, XCircle,
  Phone, Search, ChevronDown, Info, Zap, Settings2, Users,
  BarChart3, ArrowRight, Copy, ExternalLink, Ban, Check, X, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Alert, AlertDescription
} from '@/components/ui/alert';

const BASE = '/api';

const TRIGGER_EVENTS = [
  { value: 'order_confirmed', label: 'Order Confirmed', description: 'When a new order is created/synced' },
  { value: 'order_dispatched', label: 'Order Dispatched', description: 'When order is marked as packed/ready to ship' },
  { value: 'order_delivered', label: 'Order Delivered', description: 'When tracking shows delivered' },
  { value: 'order_status_update', label: 'Order Status Update', description: 'Generic status change notification' },
  { value: 'order_cancelled', label: 'Order Cancelled', description: 'When order is cancelled' },
  { value: 'manual', label: 'Manual Only', description: 'Only sent when manually triggered by admin' },
];

const TEMPLATE_VARIABLES = [
  { key: '{{customer_name}}', description: 'Customer full name' },
  { key: '{{customer_phone}}', description: 'Customer phone number' },
  { key: '{{order_id}}', description: 'Order ID (e.g., SH-3005)' },
  { key: '{{order_total}}', description: 'Order total with currency' },
  { key: '{{tracking_number}}', description: 'Tracking/AWB number' },
  { key: '{{tracking_link}}', description: 'Tracking URL for carrier' },
  { key: '{{carrier}}', description: 'Shipping carrier name' },
  { key: '{{product_names}}', description: 'Product name(s) in order' },
  { key: '{{business_name}}', description: 'Your business name' },
  { key: '{{support_number}}', description: 'Support phone number' },
  { key: '{{status}}', description: 'Current order status' },
];

const STATUS_COLORS = {
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  read: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  queued: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-600',
};

const APPROVAL_COLORS = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function WhatsAppView() {
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [optOuts, setOptOuts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);

  // Template editor state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '', triggerEvent: 'manual', metaTemplateName: '', languageCode: 'en',
    body: '', enabled: true, metaApprovalStatus: 'pending', useTextFallback: true, delay: 0,
  });

  // Message search
  const [messageSearch, setMessageSearch] = useState('');
  const [messageFilter, setMessageFilter] = useState('all');

  // Send dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ phone: '', templateId: '', customMessage: '' });
  const [sendLoading, setSendLoading] = useState(false);

  // Info dialog
  const [showInfoCard, setShowInfoCard] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/whatsapp/templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.error('Error fetching templates:', e); }
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/whatsapp/messages?limit=100`);
      if (res.ok) setMessages(await res.json());
    } catch (e) { console.error('Error fetching messages:', e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/whatsapp/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error('Error fetching stats:', e); }
  }, []);

  const fetchOptOuts = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/whatsapp/opt-outs`);
      if (res.ok) setOptOuts(await res.json());
    } catch (e) { console.error('Error fetching opt-outs:', e); }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/integrations`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.whatsapp || null);
      }
    } catch (e) { console.error('Error fetching config:', e); }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchStats();
    fetchConfig();
  }, [fetchTemplates, fetchStats, fetchConfig]);

  useEffect(() => {
    if (activeTab === 'messages') fetchMessages();
    if (activeTab === 'opt-outs') fetchOptOuts();
  }, [activeTab, fetchMessages, fetchOptOuts]);

  // Template CRUD
  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '', triggerEvent: 'manual', metaTemplateName: '', languageCode: 'en',
      body: '', enabled: true, metaApprovalStatus: 'pending', useTextFallback: true, delay: 0,
    });
    setEditDialogOpen(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name || '',
      triggerEvent: template.triggerEvent || 'manual',
      metaTemplateName: template.metaTemplateName || '',
      languageCode: template.languageCode || 'en',
      body: template.body || '',
      enabled: template.enabled !== false,
      metaApprovalStatus: template.metaApprovalStatus || 'pending',
      useTextFallback: template.useTextFallback !== false,
      delay: template.delay || 0,
    });
    setEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.body) {
      toast.error('Template name and body are required');
      return;
    }
    setLoading(true);
    try {
      const url = editingTemplate
        ? `${BASE}/whatsapp/templates/${editingTemplate._id}`
        : `${BASE}/whatsapp/templates`;
      const method = editingTemplate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      });
      if (res.ok) {
        toast.success(editingTemplate ? 'Template updated' : 'Template created');
        setEditDialogOpen(false);
        fetchTemplates();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save template');
      }
    } catch (e) {
      toast.error('Error saving template');
    }
    setLoading(false);
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await fetch(`${BASE}/whatsapp-templates/${id}`, { method: 'DELETE' });
      toast.success('Template deleted');
      fetchTemplates();
    } catch (e) {
      toast.error('Error deleting template');
    }
  };

  const handleToggleTemplate = async (template) => {
    try {
      await fetch(`${BASE}/whatsapp/templates/${template._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !template.enabled }),
      });
      toast.success(`Template ${template.enabled ? 'disabled' : 'enabled'}`);
      fetchTemplates();
    } catch (e) {
      toast.error('Error toggling template');
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!sendForm.phone && !sendForm.templateId) {
      toast.error('Phone number is required');
      return;
    }
    if (!sendForm.templateId && !sendForm.customMessage) {
      toast.error('Select a template or enter a custom message');
      return;
    }
    setSendLoading(true);
    try {
      const res = await fetch(`${BASE}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: sendForm.phone,
          templateId: sendForm.templateId || undefined,
          customMessage: !sendForm.templateId ? sendForm.customMessage : undefined,
          triggerEvent: 'manual',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.queued ? 'Message queued (quiet hours)' : 'Message sent!');
        setSendDialogOpen(false);
        setSendForm({ phone: '', templateId: '', customMessage: '' });
        fetchMessages();
        fetchStats();
      } else {
        toast.error(data.error || 'Failed to send message');
      }
    } catch (e) {
      toast.error('Error sending message');
    }
    setSendLoading(false);
  };

  // Retry failed messages
  const handleRetryFailed = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/whatsapp/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Retried ${data.retried} of ${data.total} failed messages`);
        fetchMessages();
        fetchStats();
      }
    } catch (e) {
      toast.error('Error retrying messages');
    }
    setLoading(false);
  };

  // Remove opt-out
  const handleRemoveOptOut = async (id) => {
    try {
      await fetch(`${BASE}/whatsapp/opt-outs/${id}`, { method: 'PUT' });
      toast.success('Opt-out removed — customer will receive messages again');
      fetchOptOuts();
    } catch (e) {
      toast.error('Error removing opt-out');
    }
  };

  // Insert variable into template body
  const insertVariable = (variable) => {
    setTemplateForm(prev => ({ ...prev, body: prev.body + variable }));
  };

  const filteredMessages = messages.filter(msg => {
    if (messageFilter !== 'all' && msg.deliveryStatus !== messageFilter) return false;
    if (messageSearch) {
      const search = messageSearch.toLowerCase();
      return (
        (msg.orderId || '').toLowerCase().includes(search) ||
        (msg.customerPhone || '').includes(search) ||
        (msg.templateName || '').toLowerCase().includes(search) ||
        (msg.messageBody || '').toLowerCase().includes(search)
      );
    }
    return true;
  });

  const isConfigured = config?.active && config?.phoneNumberId && config?.accessToken;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-green-500" />
            WhatsApp Automation
          </h1>
          <p className="text-muted-foreground mt-1">Automated order notifications & customer communication</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSendDialogOpen(true)} disabled={!isConfigured}>
            <Send className="w-4 h-4 mr-1" /> Send Message
          </Button>
          <Button onClick={handleCreateTemplate}>
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        </div>
      </div>

      {/* Connection Status Banner */}
      {!isConfigured && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>WhatsApp not configured.</strong> Go to <strong>Integrations</strong> to add your WhatsApp Business API credentials (Phone Number ID, Access Token).
          </AlertDescription>
        </Alert>
      )}

      {/* Info Card */}
      {showInfoCard && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 space-y-1">
                  <p className="font-medium">How WhatsApp Automation Works</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-blue-700">
                    <li>Templates are sent automatically when order status changes (e.g., Confirmed, Dispatched, Delivered)</li>
                    <li>Messages use <strong>WhatsApp Cloud API via Meta</strong> — you need a Meta Business Account</li>
                    <li>For automated outbound messages, templates must be <strong>approved by Meta</strong> first</li>
                    <li>Customers can reply <strong>STOP</strong> to opt out, or <strong>STATUS</strong> to get order updates</li>
                    <li>Quiet hours (9 PM - 9 AM IST) — messages are queued and sent at 9 AM</li>
                  </ul>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowInfoCard(false)} className="text-blue-600">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.today}</p>
              <p className="text-xs text-muted-foreground">Sent Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.thisWeek}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Sent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.deliveryRate}%</p>
              <p className="text-xs text-muted-foreground">Delivery Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.readRate}%</p>
              <p className="text-xs text-muted-foreground">Read Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
              {stats.failed > 0 && (
                <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1" onClick={handleRetryFailed}>
                  Retry All
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-1">
            <FileText className="w-3.5 h-3.5" /> Templates ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Message Log ({messages.length})
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-1">
            <Zap className="w-3.5 h-3.5" /> Automation Rules
          </TabsTrigger>
          <TabsTrigger value="opt-outs" className="gap-1">
            <Ban className="w-3.5 h-3.5" /> Opt-Outs ({optOuts.length})
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No templates yet. Create your first message template!</p>
                <Button className="mt-3" onClick={handleCreateTemplate}>
                  <Plus className="w-4 h-4 mr-1" /> Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {templates.map(template => (
                <Card key={template._id} className={`transition-all ${!template.enabled ? 'opacity-60' : ''}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-foreground">{template.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {TRIGGER_EVENTS.find(t => t.value === template.triggerEvent)?.label || template.triggerEvent}
                          </Badge>
                          <Badge className={`text-xs ${APPROVAL_COLORS[template.metaApprovalStatus] || 'bg-gray-100 text-gray-600'}`}>
                            Meta: {template.metaApprovalStatus}
                          </Badge>
                          {template.enabled ? (
                            <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 text-xs">Disabled</Badge>
                          )}
                          {template.delay > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" /> {template.delay}min delay
                            </Badge>
                          )}
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 mt-2 font-mono text-sm text-muted-foreground whitespace-pre-wrap border">
                          {template.body}
                        </div>
                        {template.metaTemplateName && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Meta Template Name: <code className="bg-muted px-1 rounded">{template.metaTemplateName}</code>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleToggleTemplate(template)} title={template.enabled ? 'Disable' : 'Enable'}>
                          {template.enabled ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditTemplate(template)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(template._id)} className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-4 mt-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order, phone, or template..."
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={messageFilter} onValueChange={setMessageFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchMessages}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {filteredMessages.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No messages yet. Send your first WhatsApp message!</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessages.map(msg => (
                      <TableRow key={msg._id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {msg.sentAt ? new Date(msg.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{msg.orderId || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{msg.customerPhone || '-'}</TableCell>
                        <TableCell className="text-xs">{msg.templateName || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {msg.triggerEvent || 'manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_COLORS[msg.deliveryStatus] || 'bg-gray-100'}`}>
                            {msg.deliveryStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {msg.messageBody || '-'}
                          {msg.failedReason && (
                            <span className="text-red-500 block">{msg.failedReason}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Automation Rules Tab */}
        <TabsContent value="automation" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" /> Automation Trigger Rules
              </CardTitle>
              <CardDescription>
                Configure which templates are sent automatically when order events occur.
                Templates must be enabled and mapped to a trigger event to fire automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trigger Event</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Mapped Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TRIGGER_EVENTS.filter(t => t.value !== 'manual').map(trigger => {
                    const mapped = templates.find(t => t.triggerEvent === trigger.value);
                    return (
                      <TableRow key={trigger.value}>
                        <TableCell className="font-medium">{trigger.label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{trigger.description}</TableCell>
                        <TableCell>
                          {mapped ? (
                            <span className="text-sm font-medium">{mapped.name}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Not configured</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {mapped ? (
                            mapped.enabled ? (
                              <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600 text-xs">Disabled</Badge>
                            )
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500 text-xs">No Template</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {mapped?.delay ? `${mapped.delay} min` : 'Immediate'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Smart Delay Rules</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <strong>Quiet Hours (9 PM - 9 AM IST):</strong> Messages are queued and sent at 9 AM
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <strong>Delivery Confirmation:</strong> 30-minute delay to avoid premature notifications
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <strong>Consolidation:</strong> Won't send Dispatch + Out-for-Delivery within 1 hour
                  </li>
                </ul>
              </div>

              <Alert className="mt-4 border-amber-200 bg-amber-50">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  <strong>Meta Template Approval:</strong> For automated outbound messages, WhatsApp requires templates to be pre-approved in your Meta Business Manager.
                  Templates marked as "pending" or "rejected" will use the <strong>text message fallback</strong> (only works within 24hr customer message window).
                  <a href="https://business.facebook.com/latest/whatsapp_manager/message_templates" target="_blank" rel="noopener noreferrer" className="ml-1 underline text-amber-900">
                    Manage Templates in Meta <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opt-Outs Tab */}
        <TabsContent value="opt-outs" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" /> Opted-Out Customers
              </CardTitle>
              <CardDescription>
                Customers who replied "STOP" or were manually opted out. They will not receive any WhatsApp messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {optOuts.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2" />
                  <p>No opted-out customers.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Opted Out</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {optOuts.map(opt => (
                      <TableRow key={opt._id}>
                        <TableCell className="font-mono">{opt.phone}</TableCell>
                        <TableCell className="text-sm">
                          {opt.optedOutAt ? new Date(opt.optedOutAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{opt.reason || 'manual'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveOptOut(opt._id)} className="text-green-600">
                            Re-opt In
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Editor Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              Configure your WhatsApp message template. Use variables like {'{{customer_name}}'} for dynamic content.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Order Confirmed"
                />
              </div>
              <div>
                <Label>Trigger Event</Label>
                <Select value={templateForm.triggerEvent} onValueChange={(v) => setTemplateForm(prev => ({ ...prev, triggerEvent: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trigger" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meta Template Name <span className="text-muted-foreground">(for approved templates)</span></Label>
                <Input
                  value={templateForm.metaTemplateName}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, metaTemplateName: e.target.value }))}
                  placeholder="e.g., order_confirmed"
                />
              </div>
              <div>
                <Label>Approval Status</Label>
                <Select value={templateForm.metaApprovalStatus} onValueChange={(v) => setTemplateForm(prev => ({ ...prev, metaApprovalStatus: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Message Body</Label>
              <Textarea
                value={templateForm.body}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Hi {{customer_name}}, your order #{{order_id}} has been confirmed..."
                className="min-h-[120px] font-mono text-sm"
              />
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Insert Variable:</p>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map(v => (
                    <Button
                      key={v.key}
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => insertVariable(v.key)}
                      title={v.description}
                    >
                      {v.key.replace(/[{}]/g, '')}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            {templateForm.body && (
              <div>
                <Label className="text-xs text-muted-foreground">Preview</Label>
                <div className="bg-[#dcf8c6] rounded-xl p-3 max-w-sm text-sm shadow-sm border border-green-200">
                  <p className="whitespace-pre-wrap">
                    {templateForm.body
                      .replace(/\{\{customer_name\}\}/g, 'Rahul Sharma')
                      .replace(/\{\{order_id\}\}/g, 'SH-3005')
                      .replace(/\{\{order_total\}\}/g, '₹1,299')
                      .replace(/\{\{tracking_number\}\}/g, 'EE123456789IN')
                      .replace(/\{\{tracking_link\}\}/g, 'https://track.example.com/EE123456789IN')
                      .replace(/\{\{carrier\}\}/g, 'India Post')
                      .replace(/\{\{product_names\}\}/g, 'Gift Hamper Deluxe')
                      .replace(/\{\{business_name\}\}/g, 'GiftSugar')
                      .replace(/\{\{support_number\}\}/g, '+91-XXXXX-XXXXX')
                      .replace(/\{\{status\}\}/g, 'Dispatched')}
                  </p>
                  <p className="text-[10px] text-green-700 text-right mt-1">
                    {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ✓✓
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Delay (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={templateForm.delay}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, delay: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={templateForm.enabled}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={templateForm.useTextFallback}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, useTextFallback: e.target.checked }))}
                    className="rounded"
                  />
                  Text Fallback
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={loading}>
              {loading ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-green-500" /> Send WhatsApp Message
            </DialogTitle>
            <DialogDescription>Send a message to a customer or test number.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Phone Number (with country code)</Label>
              <Input
                value={sendForm.phone}
                onChange={(e) => setSendForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g., 919876543210"
              />
            </div>

            <div>
              <Label>Use Template (optional)</Label>
              <Select value={sendForm.templateId} onValueChange={(v) => setSendForm(prev => ({ ...prev, templateId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template or type custom message" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Custom Message</SelectItem>
                  {templates.filter(t => t.enabled).map(t => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!sendForm.templateId && (
              <div>
                <Label>Custom Message</Label>
                <Textarea
                  value={sendForm.customMessage}
                  onChange={(e) => setSendForm(prev => ({ ...prev, customMessage: e.target.value }))}
                  placeholder="Type your message..."
                  className="min-h-[80px]"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendMessage} disabled={sendLoading} className="bg-green-600 hover:bg-green-700">
              {sendLoading ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
