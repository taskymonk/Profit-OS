'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Camera, Upload, Loader2, CheckCircle2, Edit3, ScanLine, AlertCircle, X, FileText, Sparkles, Eye } from 'lucide-react';
import { toast } from 'sonner';

const EXPENSE_CATEGORIES = [
  'Raw Material Purchases', 'Packaging', 'Shipping', 'Software & SaaS',
  'Utilities', 'Office Supplies', 'Marketing', 'Professional Services', 'Miscellaneous',
];

export default function InvoiceScanner({ open, onOpenChange, onConfirm, vendors = [], categories = [] }) {
  const [step, setStep] = useState('upload'); // upload → scanning → verify → done
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [ocrMethod, setOcrMethod] = useState(null); // will be set from integrations config
  const [extractedData, setExtractedData] = useState({
    vendor: '', amount: '', date: '', invoiceNumber: '',
    category: '', description: '', taxAmount: '', currency: 'INR',
  });
  const [editMode, setEditMode] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setImageData(null);
    setImagePreview(null);
    setScanning(false);
    setScanProgress(0);
    setExtractedData({ vendor: '', amount: '', date: '', invoiceNumber: '', category: '', description: '', taxAmount: '', currency: 'INR' });
    setEditMode(false);
    setConfidence(0);
    setRawText('');
    setShowRawText(false);
  }, []);

  // Load OCR settings from integrations
  const loadOcrSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      const settings = data?.ocrSettings || {};
      if (settings.method === 'llm' && settings.apiKey && !settings.apiKey.includes('*')) {
        setOcrMethod('llm');
      } else {
        setOcrMethod('tesseract');
      }
      return settings;
    } catch {
      setOcrMethod('tesseract');
      return { method: 'tesseract' };
    }
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Please select an image or PDF file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Full = ev.target.result;
      setImageData(base64Full);
      setImagePreview(base64Full);
      
      const settings = await loadOcrSettings();
      runOCR(base64Full, file.type, settings);
    };
    reader.readAsDataURL(file);
  }, [loadOcrSettings]);

  const runOCR = useCallback(async (imageBase64, mimeType, settings) => {
    setStep('scanning');
    setScanning(true);
    setScanProgress(0);

    const method = (settings?.method === 'llm' && settings?.apiKey) ? 'llm' : 'tesseract';
    setOcrMethod(method);

    try {
      if (method === 'llm') {
        // Send to backend LLM endpoint
        setScanProgress(30);
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        
        const res = await fetch('/api/ocr/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, mimeType: mimeType || 'image/jpeg' }),
        });
        
        setScanProgress(80);
        const data = await res.json();
        
        if (data.error) {
          toast.error(data.error);
          // Fallback to Tesseract
          await runTesseractOCR(imageBase64);
          return;
        }

        setExtractedData({
          vendor: data.vendor || '',
          amount: String(data.amount || ''),
          date: data.date || '',
          invoiceNumber: data.invoiceNumber || '',
          category: data.category || 'Miscellaneous',
          description: data.description || '',
          taxAmount: String(data.taxAmount || ''),
          currency: data.currency || 'INR',
        });
        setConfidence(0.9);
        setScanProgress(100);
        setStep('verify');
        toast.success('Invoice parsed with AI!');
      } else {
        await runTesseractOCR(imageBase64);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      toast.error('OCR failed. Please enter details manually.');
      setStep('verify');
      setEditMode(true);
    } finally {
      setScanning(false);
    }
  }, []);

  const runTesseractOCR = useCallback(async (imageBase64) => {
    try {
      const Tesseract = await import('tesseract.js');
      
      const result = await Tesseract.recognize(imageBase64, 'eng', {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            setScanProgress(Math.round((info.progress || 0) * 100));
          }
        },
      });

      const ocrText = result.data.text;
      setRawText(ocrText);
      
      // Send to backend for parsing
      const parseRes = await fetch('/api/ocr/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText }),
      });
      const parsed = await parseRes.json();

      setExtractedData({
        vendor: parsed.vendor || '',
        amount: String(parsed.amount || ''),
        date: parsed.date || '',
        invoiceNumber: parsed.invoiceNumber || '',
        category: parsed.category || 'Miscellaneous',
        description: parsed.description || '',
        taxAmount: String(parsed.taxAmount || ''),
        currency: parsed.currency || 'INR',
      });
      setConfidence(parsed.confidence || 0);
      setStep('verify');

      if (parsed.vendor || parsed.amount) {
        toast.success('Invoice text extracted!');
      } else {
        toast.info('Could not auto-detect fields. Please enter manually.');
        setEditMode(true);
      }
    } catch (err) {
      console.error('Tesseract Error:', err);
      toast.error('Text extraction failed. Enter details manually.');
      setStep('verify');
      setEditMode(true);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!extractedData.amount || parseFloat(extractedData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (onConfirm) {
      onConfirm({
        ...extractedData,
        amount: parseFloat(extractedData.amount) || 0,
        taxAmount: parseFloat(extractedData.taxAmount) || 0,
        imageData,
      });
    }

    toast.success('Invoice data applied to expense form!');
    setStep('done');
    setTimeout(() => {
      resetState();
      onOpenChange(false);
    }, 800);
  }, [extractedData, imageData, onConfirm, onOpenChange, resetState]);

  const confLabel = confidence >= 0.7 ? 'High' : confidence >= 0.4 ? 'Medium' : 'Low';
  const confColor = confidence >= 0.7 ? 'text-emerald-600' : confidence >= 0.4 ? 'text-amber-600' : 'text-red-500';

  const allCategories = [...new Set([...EXPENSE_CATEGORIES, ...(categories || []).map(c => c.name || c)])];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Scan Invoice / Receipt
          </DialogTitle>
          <DialogDescription>
            Upload an invoice photo to auto-extract expense details
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Upload invoice or receipt</p>
                  <p className="text-xs text-muted-foreground mt-1">Take a photo or upload an image of the invoice</p>
                </div>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    <Upload className="w-4 h-4 mr-1" /> Upload Image
                  </Button>
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>
                {ocrMethod === 'llm'
                  ? 'AI-powered extraction enabled — higher accuracy for complex invoices'
                  : 'Using Tesseract OCR — configure AI in Integrations for better accuracy'}
              </span>
            </div>

            <Separator />
            <div className="text-center">
              <button className="text-sm text-primary hover:underline font-medium"
                onClick={() => { setStep('verify'); setEditMode(true); }}>
                Skip scan — enter details manually
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Scanning */}
        {step === 'scanning' && (
          <div className="space-y-4 py-4">
            {imagePreview && (
              <div className="w-full h-40 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                <img src={imagePreview} alt="Invoice" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <div className="text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <FileText className="absolute inset-0 m-auto w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {ocrMethod === 'llm' ? 'AI is reading your invoice...' : 'Extracting text with OCR...'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ocrMethod === 'llm' ? 'Using AI vision model' : 'Processing with Tesseract.js'}
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${scanProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{scanProgress}%</p>
            </div>
          </div>
        )}

        {/* Step 3: Verify */}
        {step === 'verify' && (
          <div className="space-y-4">
            {imagePreview && (
              <div className="w-full h-28 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                <img src={imagePreview} alt="Invoice" className="max-h-full max-w-full object-contain" />
              </div>
            )}

            {confidence > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Detection confidence:</span>
                  <span className={`font-medium ${confColor}`}>{confLabel} ({Math.round(confidence * 100)}%)</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {ocrMethod === 'llm' ? '✨ AI' : '📝 OCR'}
                </Badge>
              </div>
            )}

            <div className="space-y-3">
              {/* Vendor */}
              <div>
                <Label className="text-xs font-medium">Vendor / Company</Label>
                <div className="flex gap-2 mt-1">
                  {vendors.length > 0 && !editMode ? (
                    <Select value={extractedData.vendor || '__custom__'} onValueChange={v => {
                      if (v === '__custom__') setEditMode(true);
                      else setExtractedData(prev => ({ ...prev, vendor: v }));
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.map(v => <SelectItem key={v._id || v.name} value={v.name}>{v.name}</SelectItem>)}
                        <SelectItem value="__custom__">+ Enter custom...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={extractedData.vendor} onChange={e => setExtractedData(prev => ({ ...prev, vendor: e.target.value }))}
                      placeholder="Vendor name" className="h-9 text-sm" />
                  )}
                </div>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Amount (₹)</Label>
                  <Input type="number" step="0.01" value={extractedData.amount}
                    onChange={e => setExtractedData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00" className="h-9 text-sm font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Invoice Date</Label>
                  <Input type="date" value={extractedData.date}
                    onChange={e => setExtractedData(prev => ({ ...prev, date: e.target.value }))}
                    className="h-9 text-sm" />
                </div>
              </div>

              {/* Invoice Number + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Invoice No.</Label>
                  <Input value={extractedData.invoiceNumber}
                    onChange={e => setExtractedData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="INV-001" className="h-9 text-sm font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Category</Label>
                  <Select value={extractedData.category || 'Miscellaneous'}
                    onValueChange={v => setExtractedData(prev => ({ ...prev, category: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tax + Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Tax Amount</Label>
                  <Input type="number" step="0.01" value={extractedData.taxAmount}
                    onChange={e => setExtractedData(prev => ({ ...prev, taxAmount: e.target.value }))}
                    placeholder="0.00" className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Description</Label>
                  <Input value={extractedData.description}
                    onChange={e => setExtractedData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description" className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Raw text toggle (Tesseract only) */}
            {rawText && (
              <div>
                <button onClick={() => setShowRawText(!showRawText)}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {showRawText ? 'Hide' : 'Show'} raw OCR text
                </button>
                {showRawText && (
                  <pre className="mt-2 p-2 rounded bg-muted text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                    {rawText}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleConfirm} disabled={!extractedData.amount}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Apply to Expense Form
              </Button>
              <Button variant="outline" onClick={resetState}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="font-medium text-emerald-600">Invoice data extracted!</p>
            <p className="text-xs text-muted-foreground">Fields have been pre-filled in the expense form</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
