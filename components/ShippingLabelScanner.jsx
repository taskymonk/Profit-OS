'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Camera, Upload, Loader2, CheckCircle2, Edit3, ScanLine, AlertCircle, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { extractTrackingInfo, getCarrierOptions, getCarrierInfo } from '@/lib/shipping';

export default function ShippingLabelScanner({ open, onOpenChange, orderId, orderNumber, onConfirm }) {
  const [step, setStep] = useState('upload'); // upload → scanning → verify → done
  const [imageData, setImageData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [extractedData, setExtractedData] = useState({ trackingNumber: '', carrier: '', confidence: 0, rawText: '' });
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const carrierOptions = getCarrierOptions();

  const resetState = useCallback(() => {
    setStep('upload');
    setImageData(null);
    setImagePreview(null);
    setScanning(false);
    setScanProgress(0);
    setExtractedData({ trackingNumber: '', carrier: '', confidence: 0, rawText: '' });
    setEditMode(false);
    setSaving(false);
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Read as base64 for storage
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageData(ev.target.result);
      setImagePreview(ev.target.result);
      runOCR(ev.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  const runOCR = useCallback(async (imageBase64) => {
    setStep('scanning');
    setScanning(true);
    setScanProgress(0);

    try {
      // Dynamic import of Tesseract
      const Tesseract = await import('tesseract.js');
      
      const result = await Tesseract.recognize(imageBase64, 'eng', {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            setScanProgress(Math.round((info.progress || 0) * 100));
          }
        },
      });

      const ocrText = result.data.text;
      const extracted = extractTrackingInfo(ocrText);

      setExtractedData({
        trackingNumber: extracted.trackingNumber || '',
        carrier: extracted.carrier || '',
        confidence: extracted.confidence || 0,
        rawText: extracted.rawText || ocrText?.substring(0, 500) || '',
        allCandidates: extracted.allCandidates || [],
      });

      setStep('verify');
      
      if (extracted.trackingNumber) {
        toast.success('Tracking information extracted!');
      } else {
        toast.info('Could not auto-detect tracking number. Please enter manually.');
        setEditMode(true);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      toast.error('OCR failed. Please enter tracking details manually.');
      setStep('verify');
      setEditMode(true);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!extractedData.trackingNumber) {
      toast.error('Please enter a tracking number');
      return;
    }
    if (!extractedData.carrier) {
      toast.error('Please select a shipping carrier');
      return;
    }

    setSaving(true);
    try {
      // Save parcel image
      if (imageData) {
        await fetch('/api/parcel-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            imageData,
            extractedTrackingNo: extractedData.trackingNumber,
            extractedCarrier: extractedData.carrier,
          }),
        });
      }

      // Call parent callback with the confirmed data
      if (onConfirm) {
        await onConfirm({
          trackingNumber: extractedData.trackingNumber,
          carrier: extractedData.carrier,
          imageData,
        });
      }

      toast.success('Shipping details saved!');
      setStep('done');
      setTimeout(() => {
        resetState();
        onOpenChange(false);
      }, 1000);
    } catch (err) {
      toast.error('Failed to save shipping details');
    }
    setSaving(false);
  }, [extractedData, imageData, orderId, onConfirm, onOpenChange, resetState]);

  const confidenceLabel = extractedData.confidence >= 0.8 ? 'High' : extractedData.confidence >= 0.5 ? 'Medium' : 'Low';
  const confidenceColor = extractedData.confidence >= 0.8 ? 'text-emerald-600' : extractedData.confidence >= 0.5 ? 'text-amber-600' : 'text-red-500';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            Scan Shipping Label
          </DialogTitle>
          <DialogDescription>
            {orderNumber ? `Order ${orderNumber} — ` : ''}Upload a photo of the shipping label to extract tracking info
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Camera className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Upload shipping label photo</p>
                  <p className="text-xs text-muted-foreground mt-1">Take a clear photo or upload an image of the shipping label</p>
                </div>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-1" /> Camera
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-1" /> Upload
                  </Button>
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <Separator />

            <div className="text-center">
              <button
                className="text-sm text-primary hover:underline font-medium"
                onClick={() => { setStep('verify'); setEditMode(true); }}
              >
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
                <img src={imagePreview} alt="Label" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <div className="text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <ScanLine className="absolute inset-0 m-auto w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Scanning label...</p>
                <p className="text-xs text-muted-foreground mt-1">Extracting text with OCR</p>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{scanProgress}%</p>
            </div>
          </div>
        )}

        {/* Step 3: Verify */}
        {step === 'verify' && (
          <div className="space-y-4">
            {imagePreview && (
              <div className="w-full h-32 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                <img src={imagePreview} alt="Label" className="max-h-full max-w-full object-contain" />
              </div>
            )}

            {extractedData.confidence > 0 && !editMode && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Detection confidence:</span>
                <span className={`font-medium ${confidenceColor}`}>{confidenceLabel} ({Math.round(extractedData.confidence * 100)}%)</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Tracking Number</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={extractedData.trackingNumber}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, trackingNumber: e.target.value }))}
                    placeholder="Enter tracking / AWB number"
                    className="font-mono"
                    readOnly={!editMode && extractedData.trackingNumber}
                  />
                  {!editMode && extractedData.trackingNumber && (
                    <Button variant="outline" size="icon" onClick={() => setEditMode(true)}>
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {extractedData.allCandidates?.length > 1 && editMode && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Other candidates:</span>
                    {extractedData.allCandidates.filter(c => c !== extractedData.trackingNumber).map((c, i) => (
                      <button
                        key={i}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                        onClick={() => setExtractedData(prev => ({ ...prev, trackingNumber: c }))}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">Shipping Carrier</Label>
                <Select
                  value={extractedData.carrier}
                  onValueChange={(v) => setExtractedData(prev => ({ ...prev, carrier: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select carrier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {carrierOptions.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleConfirm} disabled={saving || !extractedData.trackingNumber}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Confirm & Save
              </Button>
              <Button variant="outline" onClick={() => { resetState(); }}>
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
            <p className="font-medium text-emerald-600">Shipping details saved!</p>
            <p className="text-xs text-muted-foreground">
              {getCarrierInfo(extractedData.carrier)?.shortName} — {extractedData.trackingNumber}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
