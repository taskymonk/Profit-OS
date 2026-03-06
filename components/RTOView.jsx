'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import GuideCard from '@/components/GuideCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Package, Camera, Upload, Loader2, CheckCircle, AlertCircle, ScanLine, Search,
  RotateCcw, Truck, CreditCard, X, Ban, Send, ArrowRight, Clock, Eye, Info,
  TrendingDown, DollarSign, BarChart3, RefreshCw, ChevronRight, MessageSquare,
  PackageX, ArrowLeftRight, Archive, XCircle, Link2, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  pending_action: { label: 'Pending Action', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  reshipping: { label: 'Reshipping', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Truck },
  refunded: { label: 'Refunded', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: CreditCard },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  reship_delivered: { label: 'Reship Delivered', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
};

const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }); } catch { return '-'; } };
const fmtTime = (d) => { try { const dt = new Date(d); return `${dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`; } catch { return '-'; } };

export default function RTOView() {
  const [activeTab, setActiveTab] = useState('intake');
  const [stats, setStats] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pipelineFilter, setPipelineFilter] = useState('all');

  // Intake state
  const [intakeStep, setIntakeStep] = useState('upload'); // upload → scanning → match → confirm → action
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [extractedAwb, setExtractedAwb] = useState('');
  const [extractedCarrier, setExtractedCarrier] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [matchResult, setMatchResult] = useState(null);
  const [matching, setMatching] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [registering, setRegistering] = useState(false);

  // Action dialog state
  const [actionDialog, setActionDialog] = useState(null); // { parcel, action }
  const [actionDetails, setActionDetails] = useState({});
  const [actionSaving, setActionSaving] = useState(false);
  const [detailDialog, setDetailDialog] = useState(null);

  // WhatsApp dialog
  const [waDialog, setWaDialog] = useState(null);
  const [waMessageType, setWaMessageType] = useState('reship_charges');
  const [waCustomMsg, setWaCustomMsg] = useState('');
  const [waSending, setWaSending] = useState(false);

  const fileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, parcelsRes] = await Promise.all([
        fetch('/api/rto/stats'),
        fetch('/api/rto/parcels'),
      ]);
      const statsData = await statsRes.json();
      const parcelsData = await parcelsRes.json();
      setStats(statsData);
      setParcels(Array.isArray(parcelsData) ? parcelsData : []);
    } catch (err) {
      console.error('Failed to load RTO data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ==================== OCR SCANNING ====================
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const imageBase64 = ev.target.result;
      setImageData(imageBase64);
      setImagePreview(imageBase64);
      setIntakeStep('scanning');
      setScanning(true);
      setScanProgress(0);

      let extracted = { trackingNumber: null, carrier: null, confidence: 0 };
      let ocrText = '';

      try {
        // Step 1: Run Tesseract OCR on original image
        setScanProgress(5);
        const Tesseract = await import('tesseract.js');
        const result = await Tesseract.recognize(imageBase64, 'eng', {
          logger: m => { if (m.progress) setScanProgress(5 + Math.round(m.progress * 70)); }
        });

        ocrText = result.data.text || '';
        setOcrRawText(ocrText);
        setScanProgress(80);

        // Step 2: Extract tracking info from OCR text
        const { extractTrackingInfo } = await import('@/lib/shipping');
        extracted = extractTrackingInfo(ocrText);

        // Step 3: If not found, try fixing common OCR misreads (O→0, l→1, etc.)
        if (!extracted.trackingNumber && ocrText) {
          const corrected = ocrText
            .replace(/(?<=[A-Z]{2})[oO]/g, '0')   // O→0 only after letter prefix
            .replace(/(?<=[A-Z]{2}\d*)[lI]/g, '1') // l/I→1 in number context
            .replace(/(?<=\d)[sS](?=\d)/g, '5');    // S→5 between digits
          const correctedResult = extractTrackingInfo(corrected);
          if (correctedResult.trackingNumber) {
            extracted = correctedResult;
          }
        }

        // Step 4: Direct regex scan on ALL text for S10-like patterns
        // This catches cases where extractTrackingInfo might miss due to context
        if (!extracted.trackingNumber) {
          // UPU S10 format: 2 letters + 9 digits + 2 letter country code (with possible OCR spaces)
          const s10Regex = /([A-Z]{2}\s*\d[\d\s]{7,10}\d\s*[A-Z]{2})/gi;
          const fullText = ocrText.replace(/\n/g, ' ');
          let match;
          while ((match = s10Regex.exec(fullText)) !== null) {
            const cleaned = match[1].replace(/\s/g, '');
            if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cleaned)) {
              extracted = { trackingNumber: cleaned, carrier: 'indiapost', confidence: 0.9 };
              break;
            }
          }
          // Also look for labeled tracking numbers of any carrier
          if (!extracted.trackingNumber) {
            const labeledRegex = /(?:awb|tracking|waybill|consignment|article|cn\s*no|docket|ref)[\s.:=#\-]*([A-Z0-9][\w\-]{7,21})/gi;
            let m;
            while ((m = labeledRegex.exec(fullText)) !== null) {
              const val = m[1].replace(/\s/g, '');
              if (val.length >= 8 && val.length <= 22 && !isNaN(val) ? !/^[6-9]\d{9}$/.test(val) : true) {
                extracted = { trackingNumber: val, carrier: extracted.carrier || 'other', confidence: 0.85 };
                break;
              }
            }
          }
        }

        // Step 5: Look for any 13-digit number (common AWB format)
        if (!extracted.trackingNumber) {
          const nums = ocrText.match(/\b\d{13,18}\b/g) || [];
          // Filter out phone numbers (10 digits starting with 6-9 in India)
          const awbCandidates = nums.filter(n => {
            if (n.length === 10 && /^[6-9]/.test(n)) return false; // phone
            if (n.length === 6) return false; // pincode
            return true;
          });
          if (awbCandidates.length > 0) {
            extracted = { trackingNumber: awbCandidates[0], carrier: extracted.carrier || 'other', confidence: 0.6 };
          }
        }

        setScanProgress(100);
        setExtractedAwb(extracted.trackingNumber || '');
        setExtractedCarrier(extracted.carrier || 'indiapost');
        setIntakeStep('match');

        if (extracted.trackingNumber) {
          toast.success(`Tracking number found: ${extracted.trackingNumber}`);
        } else {
          toast.info('Could not auto-detect tracking number. Please enter it manually.');
        }
      } catch (err) {
        console.error('OCR Error:', err);
        toast.error('OCR scan failed. You can enter the AWB manually.');
        setIntakeStep('match');
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // ==================== AWB MATCHING ====================
  const handleMatchAwb = useCallback(async () => {
    if (!extractedAwb.trim()) { toast.error('Please enter an AWB number'); return; }
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch(`/api/rto/match-awb?awb=${encodeURIComponent(extractedAwb.trim())}`);
      const data = await res.json();
      setMatchResult(data);
      if (data.matched && data.matchMethod === 'tracking_number') {
        setSelectedOrder(data.order);
        toast.success('Order matched with AWB!');
      } else if (data.matched && data.matchMethod === 'rto_parcel_exists') {
        toast.info('This AWB is already registered as an RTO parcel.');
      } else {
        toast.info('No matching order found. You can search manually.');
      }
    } catch (err) {
      toast.error('Matching failed');
    }
    setMatching(false);
  }, [extractedAwb]);

  // ==================== MANUAL ORDER SEARCH ====================
  const handleSearch = useCallback(async (query) => {
    setManualSearch(query);
    if (!query || query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/rto/search-orders?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  // ==================== REGISTER RTO PARCEL ====================
  const handleRegister = useCallback(async () => {
    if (!extractedAwb.trim()) { toast.error('AWB number is required'); return; }
    setRegistering(true);
    try {
      const res = await fetch('/api/rto/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          awbNumber: extractedAwb.trim(),
          carrier: extractedCarrier || 'indiapost',
          orderId: selectedOrder?._id || null,
          parcelImageData: imageData || null,
          ocrText: ocrRawText,
          matchMethod: selectedOrder ? (matchResult?.matchMethod === 'tracking_number' ? 'auto' : 'manual') : 'no_match',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('RTO parcel registered successfully!');
        resetIntake();
        loadData();
        setActiveTab('pipeline');
      } else {
        toast.error(data.error || 'Failed to register');
      }
    } catch (err) { toast.error('Registration failed'); }
    setRegistering(false);
  }, [extractedAwb, extractedCarrier, selectedOrder, imageData, ocrRawText, matchResult, loadData]);

  const resetIntake = () => {
    setIntakeStep('upload');
    setImageData(null);
    setImagePreview(null);
    setScanning(false);
    setScanProgress(0);
    setExtractedAwb('');
    setExtractedCarrier('');
    setOcrRawText('');
    setMatchResult(null);
    setManualSearch('');
    setSearchResults([]);
    setSelectedOrder(null);
  };

  // ==================== ACTIONS ====================
  const handleAction = useCallback(async () => {
    if (!actionDialog) return;
    setActionSaving(true);
    try {
      const res = await fetch('/api/rto/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelId: actionDialog.parcel._id,
          action: actionDialog.action,
          details: actionDetails,
          actionBy: 'admin',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${actionDialog.action.charAt(0).toUpperCase() + actionDialog.action.slice(1)} action recorded!`);
        setActionDialog(null);
        setActionDetails({});
        loadData();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch (err) { toast.error('Action failed'); }
    setActionSaving(false);
  }, [actionDialog, actionDetails, loadData]);

  // ==================== WHATSAPP ====================
  const handleSendWhatsApp = useCallback(async () => {
    if (!waDialog) return;
    setWaSending(true);
    try {
      const res = await fetch('/api/rto/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcelId: waDialog._id,
          messageType: waMessageType,
          customMessage: waCustomMsg || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) { toast.success('WhatsApp message sent!'); setWaDialog(null); setWaCustomMsg(''); loadData(); }
      else toast.error(data.error || 'Failed to send');
    } catch (err) { toast.error('Send failed'); }
    setWaSending(false);
  }, [waDialog, waMessageType, waCustomMsg, loadData]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;

  const filteredParcels = pipelineFilter === 'all' ? parcels : parcels.filter(p => p.status === pipelineFilter);

  return (
    <div className="space-y-6">
      <GuideCard storageKey="guide_rto" icon={Info} title="📦 RTO / Returns Management">
        <p>• 📸 <strong>Scan returned parcels</strong> — upload a photo and OCR extracts the AWB number automatically</p>
        <p>• 🔍 <strong>Auto-match</strong> with India Post tracking to find the original order</p>
        <p>• ⚡ <strong>3 actions</strong> for each RTO: Reship (with payment link), Refund, or Cancel</p>
        <p>• 💬 Customers get <strong>WhatsApp updates</strong> on RTO status (if WhatsApp is connected)</p>
        <p>• 📊 Track <strong>RTO rates</strong> and financial impact in the dashboard above</p>
        <p>• 🔄 <strong>Reshipped orders</strong> re-enter the KDS workflow as linked orders</p>
      </GuideCard>
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100"><PackageX className="w-4 h-4 text-red-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">RTO Rate</p>
              <p className="text-lg font-bold text-red-600">{stats?.rtoRate || 0}%</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-100"><Clock className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Pending Action</p>
              <p className="text-lg font-bold">{stats?.pipeline?.pendingAction || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100"><ArrowLeftRight className="w-4 h-4 text-blue-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Reshipping</p>
              <p className="text-lg font-bold">{stats?.pipeline?.reshipping || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-100"><CreditCard className="w-4 h-4 text-purple-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Refunded</p>
              <p className="text-lg font-bold">{stats?.pipeline?.refunded || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-100"><TrendingDown className="w-4 h-4 text-red-600" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">RTO Cost</p>
              <p className="text-lg font-bold">{fmtCurrency(stats?.financial?.totalDoubleShipping)}</p>
            </div>
          </div>
        </Card>
      </div>

      {stats?.unprocessedRtoOrders > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700"><strong>{stats.unprocessedRtoOrders}</strong> RTO orders haven&apos;t been processed yet. Use the Intake tab to scan and register return parcels.</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="intake" className="gap-1.5"><ScanLine className="w-3.5 h-3.5" />Return Intake</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1.5"><Package className="w-3.5 h-3.5" />Pipeline ({parcels.length})</TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Dashboard</TabsTrigger>
        </TabsList>

        {/* ==================== INTAKE TAB ==================== */}
        <TabsContent value="intake" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ScanLine className="w-5 h-5" /> Return Parcel Intake</CardTitle>
              <CardDescription>Upload a photo of the returned parcel, scan the AWB, and match it to an order.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step Progress */}
              <div className="flex items-center gap-2 mb-6">
                {['Upload Photo', 'OCR Scan', 'Match Order', 'Register'].map((step, i) => {
                  const stepKeys = ['upload', 'scanning', 'match', 'confirm'];
                  const currentIdx = stepKeys.indexOf(intakeStep);
                  const isActive = i === currentIdx;
                  const isDone = i < currentIdx;
                  return (
                    <React.Fragment key={step}>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {isDone ? <CheckCircle className="w-3 h-3" /> : null}
                        {step}
                      </div>
                      {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    </React.Fragment>
                  );
                })}
                {intakeStep !== 'upload' && (
                  <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={resetIntake}><RotateCcw className="w-3 h-3 mr-1" />Start Over</Button>
                )}
              </div>

              {/* Step: Upload */}
              {intakeStep === 'upload' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="p-4 rounded-full bg-muted"><Camera className="w-8 h-8 text-muted-foreground" /></div>
                  <p className="text-sm text-muted-foreground text-center max-w-md">Upload a photo of the returned parcel showing the shipping label. We&apos;ll extract the AWB number automatically.</p>
                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    <Button onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />Upload Photo</Button>
                    <Button variant="outline" onClick={() => { setIntakeStep('match'); }}>
                      Skip — Enter AWB Manually
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: Scanning */}
              {intakeStep === 'scanning' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  {imagePreview && <img src={imagePreview} alt="Return parcel" className="max-h-48 rounded-lg border shadow-sm" />}
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm">Scanning label... {scanProgress}%</span>
                  </div>
                  <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${scanProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Step: Match */}
              {intakeStep === 'match' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Extracted data + photo */}
                    <div className="space-y-3">
                      {imagePreview && (
                        <div className="relative">
                          <img src={imagePreview} alt="Return parcel" className="w-full max-h-40 object-contain rounded-lg border" />
                        </div>
                      )}
                      <div>
                        <Label className="text-xs font-medium">AWB / Tracking Number</Label>
                        <div className="flex gap-2 mt-1">
                          <Input value={extractedAwb} onChange={e => setExtractedAwb(e.target.value)} placeholder="Enter AWB number" className="font-mono" />
                          <Button onClick={handleMatchAwb} disabled={matching || !extractedAwb.trim()} size="sm">
                            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          </Button>
                        </div>
                        {/* Show raw OCR text for debugging */}
                        {ocrRawText && (
                          <details className="mt-2">
                            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary">Show raw OCR text (debug)</summary>
                            <pre className="mt-1 p-2 rounded bg-muted text-[9px] max-h-24 overflow-y-auto whitespace-pre-wrap font-mono border text-muted-foreground">
                              {ocrRawText}
                            </pre>
                          </details>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Carrier</Label>
                        <Select value={extractedCarrier || 'indiapost'} onValueChange={setExtractedCarrier}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="indiapost">India Post / Speed Post</SelectItem>
                            <SelectItem value="bluedart">Blue Dart</SelectItem>
                            <SelectItem value="delhivery">Delhivery</SelectItem>
                            <SelectItem value="dtdc">DTDC</SelectItem>
                            <SelectItem value="xpressbees">XpressBees</SelectItem>
                            <SelectItem value="fedex">FedEx</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Right: Match result or manual search */}
                    <div className="space-y-3">
                      {matchResult?.matched && matchResult.matchMethod === 'tracking_number' && (
                        <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700">Perfect Match Found!</span>
                          </div>
                          <div className="text-xs space-y-1 text-green-600">
                            <p><strong>Order:</strong> {matchResult.order?.orderId}</p>
                            <p><strong>Product:</strong> {matchResult.order?.productName}</p>
                            <p><strong>Customer:</strong> {matchResult.order?.customerName}</p>
                            <p><strong>Status:</strong> {matchResult.order?.status}</p>
                          </div>
                        </div>
                      )}

                      {matchResult?.matched && matchResult.matchMethod === 'rto_parcel_exists' && (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                            <span className="text-sm text-amber-700">This AWB is already registered.</span>
                          </div>
                        </div>
                      )}

                      {matchResult && !matchResult.matched && (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                            <span className="text-sm text-amber-700">No auto-match found</span>
                          </div>
                          <p className="text-xs text-amber-600">Search for the order manually below.</p>
                        </div>
                      )}

                      {/* Manual search */}
                      <div>
                        <Label className="text-xs font-medium">Search Order (by ID, name, or tracking)</Label>
                        <Input value={manualSearch} onChange={e => handleSearch(e.target.value)} placeholder="Search orders..." className="mt-1" />
                        {searching && <p className="text-xs text-muted-foreground mt-1"><Loader2 className="w-3 h-3 inline animate-spin mr-1" />Searching...</p>}
                        {searchResults.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border divide-y">
                            {searchResults.map(o => (
                              <button key={o._id} onClick={() => { setSelectedOrder(o); setSearchResults([]); setManualSearch(''); toast.success(`Order ${o.orderId} selected`); }}
                                className={`w-full text-left p-2.5 hover:bg-muted/50 text-xs transition-colors ${selectedOrder?._id === o._id ? 'bg-primary/5' : ''}`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">{o.orderId}</span>
                                  <Badge variant="outline" className="text-[9px] h-4">{o.status}</Badge>
                                </div>
                                <p className="text-muted-foreground">{o.customerName} — {o.productName}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedOrder && (
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-blue-700">Selected Order</span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setSelectedOrder(null)}><X className="w-3 h-3" /></Button>
                          </div>
                          <div className="text-xs space-y-0.5 text-blue-600">
                            <p><strong>{selectedOrder.orderId}</strong> — {selectedOrder.productName}</p>
                            <p>{selectedOrder.customerName} • {fmtCurrency(selectedOrder.salePrice)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetIntake}>Cancel</Button>
                    <Button onClick={handleRegister} disabled={registering || !extractedAwb.trim() || (matchResult?.matchMethod === 'rto_parcel_exists')}>
                      {registering ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Package className="w-4 h-4 mr-1.5" />}
                      Register RTO Parcel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PIPELINE TAB ==================== */}
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant={pipelineFilter === 'all' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setPipelineFilter('all')}>
              All ({parcels.length})
            </Button>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = parcels.filter(p => p.status === key).length;
              return (
                <Button key={key} size="sm" variant={pipelineFilter === key ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setPipelineFilter(key)}>
                  {cfg.label} ({count})
                </Button>
              );
            })}
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={loadData}><RefreshCw className="w-3 h-3 mr-1" />Refresh</Button>
          </div>

          {filteredParcels.length === 0 ? (
            <div className="text-center py-12">
              <Archive className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No RTO parcels{pipelineFilter !== 'all' ? ` with status "${STATUS_CONFIG[pipelineFilter]?.label}"` : ''}.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab('intake')}>Scan a Return Parcel</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredParcels.map(p => {
                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending_action;
                const Icon = cfg.icon;
                return (
                  <Card key={p._id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${cfg.color} shrink-0`}><Icon className="w-4 h-4" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium font-mono">{p.awbNumber}</span>
                            <Badge variant="outline" className={`text-[9px] h-4 ${cfg.color}`}>{cfg.label}</Badge>
                            {p.carrier && <Badge variant="secondary" className="text-[9px] h-4">{p.carrier}</Badge>}
                          </div>
                          {p.order && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {p.order.orderId} — {p.order.productName} — {p.order.customerName} — {fmtCurrency(p.order.salePrice)}
                            </p>
                          )}
                          {p.actionDetails?.reshippingCharges > 0 && (
                            <p className="text-xs text-blue-600 mt-0.5">Reship charges: {fmtCurrency(p.actionDetails.reshippingCharges)} • Payment: {p.actionDetails.paymentStatus || 'pending'}</p>
                          )}
                          {p.actionDetails?.refundAmount > 0 && (
                            <p className="text-xs text-purple-600 mt-0.5">Refund: {fmtCurrency(p.actionDetails.refundAmount)} via {p.actionDetails.refundMethod}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">Registered: {fmtTime(p.createdAt)}{p.actionAt ? ` • Action: ${fmtTime(p.actionAt)}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.status === 'pending_action' && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-600 border-blue-200" onClick={() => { setActionDialog({ parcel: p, action: 'reship' }); setActionDetails({ reshippingCharges: p.order?.shippingCost || 0 }); }}>
                                <Truck className="w-3 h-3" />Reship
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-purple-600 border-purple-200" onClick={() => { setActionDialog({ parcel: p, action: 'refund' }); setActionDetails({ refundAmount: p.order?.salePrice || 0 }); }}>
                                <CreditCard className="w-3 h-3" />Refund
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200" onClick={() => { setActionDialog({ parcel: p, action: 'cancel' }); setActionDetails({}); }}>
                                <Ban className="w-3 h-3" />Cancel
                              </Button>
                            </>
                          )}
                          {p.status === 'reshipping' && p.order?.customerPhone && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-600 border-green-200" onClick={() => { setWaDialog(p); setWaMessageType('reship_charges'); }}>
                              <MessageSquare className="w-3 h-3" />WhatsApp
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailDialog(p)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ==================== DASHBOARD TAB ==================== */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Financial Impact</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Double Shipping Cost</span>
                  <span className="text-sm font-medium text-red-600">{fmtCurrency(stats?.financial?.totalDoubleShipping)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Recovered (Reship)</span>
                  <span className="text-sm font-medium text-green-600">+{fmtCurrency(stats?.financial?.recoveredViaReship)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Refunded</span>
                  <span className="text-sm font-medium text-purple-600">{fmtCurrency(stats?.financial?.totalRefunded)}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Net RTO Loss</span>
                  <span className="text-sm font-bold text-red-600">{fmtCurrency((stats?.financial?.totalDoubleShipping || 0) - (stats?.financial?.recoveredViaReship || 0))}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = stats?.pipeline?.[key === 'reship_delivered' ? 'reshipDelivered' : key] || 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs">{cfg.label}</span>
                      </div>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">RTO Overview</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Orders</span>
                  <span className="text-sm font-medium">{stats?.totalOrders || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">RTO Orders</span>
                  <span className="text-sm font-medium text-red-600">{stats?.rtoCount || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">RTO Rate</span>
                  <span className="text-sm font-bold text-red-600">{stats?.rtoRate || 0}%</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Unprocessed RTOs</span>
                  <span className={`text-sm font-bold ${stats?.unprocessedRtoOrders > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {stats?.unprocessedRtoOrders || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Trend */}
          {stats?.monthlyTrend?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly RTO Trend (Last 6 Months)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32">
                  {stats.monthlyTrend.map(m => {
                    const rate = m.total > 0 ? Math.round((m.rto / m.total) * 100) : 0;
                    const barH = Math.max(rate * 3, 4);
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-muted-foreground">{rate}%</span>
                        <div className="w-full bg-red-100 rounded-t" style={{ height: `${barH}px` }}>
                          <div className="w-full h-full bg-red-400 rounded-t" />
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}
                        </span>
                        <span className="text-[8px] text-muted-foreground">{m.rto}/{m.total}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== ACTION DIALOG ==================== */}
      <Dialog open={!!actionDialog} onOpenChange={(v) => { if (!v) { setActionDialog(null); setActionDetails({}); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionDialog?.action === 'reship' && <><Truck className="w-5 h-5 text-blue-600" /> Reship Order</>}
              {actionDialog?.action === 'refund' && <><CreditCard className="w-5 h-5 text-purple-600" /> Refund Order</>}
              {actionDialog?.action === 'cancel' && <><Ban className="w-5 h-5 text-red-600" /> Cancel Order</>}
            </DialogTitle>
            <DialogDescription>
              AWB: {actionDialog?.parcel?.awbNumber} • Order: {actionDialog?.parcel?.order?.orderId || 'No linked order'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {actionDialog?.action === 'reship' && (
              <>
                <div>
                  <Label className="text-xs">Reshipping Charges (₹)</Label>
                  <Input type="number" value={actionDetails.reshippingCharges || ''} onChange={e => setActionDetails({ ...actionDetails, reshippingCharges: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Payment Link (optional)</Label>
                  <Input value={actionDetails.paymentLink || ''} onChange={e => setActionDetails({ ...actionDetails, paymentLink: e.target.value })} placeholder="https://rzp.io/..." className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <Textarea value={actionDetails.note || ''} onChange={e => setActionDetails({ ...actionDetails, note: e.target.value })} placeholder="Any additional notes..." rows={2} className="mt-1" />
                </div>
              </>
            )}
            {actionDialog?.action === 'refund' && (
              <>
                <div>
                  <Label className="text-xs">Refund Amount (₹)</Label>
                  <Input type="number" value={actionDetails.refundAmount || ''} onChange={e => setActionDetails({ ...actionDetails, refundAmount: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Refund Method</Label>
                  <Select value={actionDetails.refundMethod || 'original'} onValueChange={v => setActionDetails({ ...actionDetails, refundMethod: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">Original Payment Method</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="store_credit">Store Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reference ID (optional)</Label>
                  <Input value={actionDetails.refundReference || ''} onChange={e => setActionDetails({ ...actionDetails, refundReference: e.target.value })} placeholder="Refund reference number" className="mt-1" />
                </div>
              </>
            )}
            {actionDialog?.action === 'cancel' && (
              <>
                <div>
                  <Label className="text-xs">Cancellation Reason</Label>
                  <Select value={actionDetails.cancelReason || ''} onValueChange={v => setActionDetails({ ...actionDetails, cancelReason: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer_request">Customer Request</SelectItem>
                      <SelectItem value="damaged_product">Product Damaged</SelectItem>
                      <SelectItem value="wrong_address">Wrong Address</SelectItem>
                      <SelectItem value="unclaimed">Unclaimed by Customer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <Textarea value={actionDetails.note || ''} onChange={e => setActionDetails({ ...actionDetails, note: e.target.value })} rows={2} className="mt-1" />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setActionDetails({}); }}>Cancel</Button>
            <Button onClick={handleAction} disabled={actionSaving}
              className={actionDialog?.action === 'reship' ? 'bg-blue-600 hover:bg-blue-700' : actionDialog?.action === 'refund' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'}>
              {actionSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Confirm {actionDialog?.action?.charAt(0).toUpperCase()}{actionDialog?.action?.slice(1)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== WHATSAPP DIALOG ==================== */}
      <Dialog open={!!waDialog} onOpenChange={v => { if (!v) { setWaDialog(null); setWaCustomMsg(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-green-600" /> Send WhatsApp</DialogTitle>
            <DialogDescription>Send a message to {waDialog?.order?.customerName} ({waDialog?.order?.customerPhone})</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Message Type</Label>
              <Select value={waMessageType} onValueChange={setWaMessageType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reship_charges">Reship Charges + Payment Link</SelectItem>
                  <SelectItem value="refund_confirmation">Refund Confirmation</SelectItem>
                  <SelectItem value="reship_dispatched">Reship Dispatched</SelectItem>
                  <SelectItem value="custom">Custom Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {waMessageType === 'custom' && (
              <div>
                <Label className="text-xs">Custom Message</Label>
                <Textarea value={waCustomMsg} onChange={e => setWaCustomMsg(e.target.value)} rows={4} className="mt-1" placeholder="Type your message..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWaDialog(null); setWaCustomMsg(''); }}>Cancel</Button>
            <Button onClick={handleSendWhatsApp} disabled={waSending} className="bg-green-600 hover:bg-green-700">
              {waSending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DETAIL DIALOG ==================== */}
      <Dialog open={!!detailDialog} onOpenChange={v => { if (!v) setDetailDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>RTO Parcel Details</DialogTitle>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">AWB:</span> <span className="font-mono font-medium">{detailDialog.awbNumber}</span></div>
                <div><span className="text-muted-foreground">Carrier:</span> <span className="font-medium">{detailDialog.carrier}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={`text-[9px] h-4 ${STATUS_CONFIG[detailDialog.status]?.color}`}>{STATUS_CONFIG[detailDialog.status]?.label}</Badge></div>
                <div><span className="text-muted-foreground">Match:</span> <span className="font-medium">{detailDialog.matchMethod}</span></div>
                <div><span className="text-muted-foreground">Registered:</span> <span>{fmtTime(detailDialog.createdAt)}</span></div>
                {detailDialog.actionAt && <div><span className="text-muted-foreground">Action taken:</span> <span>{fmtTime(detailDialog.actionAt)}</span></div>}
              </div>

              {detailDialog.order && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium mb-2">Linked Order</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Order:</span> <span className="font-medium">{detailDialog.order.orderId}</span></div>
                      <div><span className="text-muted-foreground">Customer:</span> <span>{detailDialog.order.customerName}</span></div>
                      <div><span className="text-muted-foreground">Product:</span> <span>{detailDialog.order.productName}</span></div>
                      <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium">{fmtCurrency(detailDialog.order.salePrice)}</span></div>
                    </div>
                  </div>
                </>
              )}

              {detailDialog.action && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium mb-2">Action: {detailDialog.action.toUpperCase()}</p>
                    <div className="text-xs space-y-1">
                      {detailDialog.actionDetails?.reshippingCharges > 0 && <p>Reship charges: {fmtCurrency(detailDialog.actionDetails.reshippingCharges)}</p>}
                      {detailDialog.actionDetails?.paymentLink && <p>Payment link: <a href={detailDialog.actionDetails.paymentLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{detailDialog.actionDetails.paymentLink}</a></p>}
                      {detailDialog.actionDetails?.refundAmount > 0 && <p>Refund amount: {fmtCurrency(detailDialog.actionDetails.refundAmount)}</p>}
                      {detailDialog.actionDetails?.refundMethod && <p>Method: {detailDialog.actionDetails.refundMethod}</p>}
                      {detailDialog.actionDetails?.cancelReason && <p>Reason: {detailDialog.actionDetails.cancelReason}</p>}
                      {detailDialog.actionDetails?.note && <p>Note: {detailDialog.actionDetails.note}</p>}
                    </div>
                  </div>
                </>
              )}

              {detailDialog.whatsappMessages?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium mb-2">WhatsApp Messages ({detailDialog.whatsappMessages.length})</p>
                    <div className="space-y-1.5">
                      {detailDialog.whatsappMessages.map((msg, i) => (
                        <div key={i} className="text-[11px] flex items-center gap-2">
                          {msg.status === 'sent' ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                          <span>{msg.messageType}</span>
                          <span className="text-muted-foreground">→ {msg.phone}</span>
                          <span className="text-muted-foreground">{fmtTime(msg.sentAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {detailDialog.parcelImageData && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium mb-2">Parcel Photo</p>
                    <img src={detailDialog.parcelImageData} alt="Return parcel" className="max-h-48 rounded-lg border" />
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
