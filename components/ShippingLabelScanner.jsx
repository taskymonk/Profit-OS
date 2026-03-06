'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Camera, Upload, Loader2, CheckCircle2, Edit3, ScanLine, AlertCircle, X, Image as ImageIcon, Eye } from 'lucide-react';
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
  const [showRawText, setShowRawText] = useState(false);
  const [scanMethod, setScanMethod] = useState('');
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
    setShowRawText(false);
    setScanMethod('');
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

  // Preprocess image for better OCR: enhance contrast, convert to grayscale
  const preprocessImage = useCallback((imageBase64) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // Draw original
        ctx.drawImage(img, 0, 0);
        
        // Get image data and enhance contrast + threshold for OCR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // Increase contrast
          const contrast = 1.5;
          const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
          const newGray = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
          // Apply threshold for cleaner text
          const final = newGray > 140 ? 255 : 0;
          data[i] = final;
          data[i + 1] = final;
          data[i + 2] = final;
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = imageBase64;
    });
  }, []);

  // Try barcode scanning using canvas + manual detection patterns
  const scanBarcode = useCallback(async (imageBase64) => {
    try {
      const barcodeReader = (await import('javascript-barcode-reader')).default;
      // Try multiple barcode types
      const types = ['code-128', 'code-39', 'code-2of5'];
      for (const type of types) {
        try {
          const result = await barcodeReader({ image: imageBase64, barcode: type, options: { useAdaptiveThreshold: true } });
          if (result && result.length >= 8) {
            console.log(`Barcode found (${type}):`, result);
            return result;
          }
        } catch { /* try next type */ }
      }
    } catch (err) {
      console.log('Barcode scan unavailable:', err.message);
    }
    return null;
  }, []);

  // Try LLM-based label reading (if configured in integrations)
  const tryLLMScan = useCallback(async (imageBase64) => {
    try {
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';
      
      const res = await fetch('/api/ocr/shipping-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mimeType }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.trackingNumber) {
          return data;
        }
      }
    } catch (err) {
      console.log('LLM shipping scan unavailable:', err.message);
    }
    return null;
  }, []);

  const runOCR = useCallback(async (imageBase64) => {
    setStep('scanning');
    setScanning(true);
    setScanProgress(0);

    let barcodeResult = null;
    let ocrText = '';
    let extracted = { trackingNumber: null, carrier: null, confidence: 0 };

    try {
      // Run barcode scan and Tesseract in parallel
      setScanProgress(10);

      // Step 1: Try barcode scanning first (fast)
      try {
        barcodeResult = await scanBarcode(imageBase64);
        if (barcodeResult) {
          console.log('Barcode result:', barcodeResult);
          setScanMethod('barcode');
          setScanProgress(50);
        }
      } catch (err) {
        console.log('Barcode scan failed:', err);
      }

      // Step 2: Run Tesseract OCR (also try enhanced image)
      setScanProgress(20);
      const Tesseract = await import('tesseract.js');
      
      // First try with original image
      const result = await Tesseract.recognize(imageBase64, 'eng', {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            setScanProgress(20 + Math.round((info.progress || 0) * 50));
          }
        },
      });
      ocrText = result.data.text || '';

      // If Tesseract didn't find much, try with preprocessed image
      if (ocrText.trim().length < 30) {
        try {
          const enhanced = await preprocessImage(imageBase64);
          const result2 = await Tesseract.recognize(enhanced, 'eng');
          if ((result2.data.text || '').length > ocrText.length) {
            ocrText = result2.data.text;
          }
        } catch {}
      }

      setScanProgress(80);

      // Step 3: Try to extract tracking from OCR text
      extracted = extractTrackingInfo(ocrText);

      // Step 4: If barcode found a valid tracking number, prefer it
      if (barcodeResult) {
        const barcodeExtracted = extractTrackingInfo(barcodeResult + ' ' + ocrText);
        if (barcodeExtracted.trackingNumber) {
          extracted = barcodeExtracted;
          setScanMethod('barcode');
        } else {
          // Use barcode result directly if it matches known tracking patterns
          const s10Match = barcodeResult.match(/^[A-Z]{2}\d{9}[A-Z]{2}$/i);
          if (s10Match) {
            extracted = { trackingNumber: barcodeResult.toUpperCase(), carrier: 'indiapost', confidence: 0.95 };
            setScanMethod('barcode');
          } else if (/^[A-Z0-9]{8,22}$/.test(barcodeResult)) {
            extracted = { ...extracted, trackingNumber: barcodeResult, confidence: Math.max(extracted.confidence, 0.7) };
            setScanMethod('barcode');
          }
        }
      }

      // Step 5: Also scan for tracking-like patterns in raw OCR with relaxed matching
      if (!extracted.trackingNumber && ocrText) {
        // Try to find S10-like patterns even with OCR errors (e.g., "EG56O2O5521IN" → "EG560205521IN")
        const relaxedS10 = ocrText.replace(/[oO]/g, '0').replace(/[lI]/g, '1').replace(/[sS]/g, '5');
        const relaxedExtracted = extractTrackingInfo(relaxedS10);
        if (relaxedExtracted.trackingNumber && relaxedExtracted.confidence > 0.5) {
          extracted = relaxedExtracted;
          setScanMethod('ocr-corrected');
        }
      }

      // Step 6: If still no tracking number, try LLM-based scan (if configured)
      if (!extracted.trackingNumber) {
        try {
          const llmResult = await tryLLMScan(imageBase64);
          if (llmResult?.trackingNumber) {
            extracted = {
              trackingNumber: llmResult.trackingNumber,
              carrier: llmResult.carrier || extracted.carrier || 'indiapost',
              confidence: 0.95,
              allCandidates: llmResult.allCandidates || [],
            };
            setScanMethod('ai-vision');
          }
        } catch {}
      }

      setScanProgress(100);

      if (!scanMethod && extracted.trackingNumber) setScanMethod('ocr');

      setExtractedData({
        trackingNumber: extracted.trackingNumber || '',
        carrier: extracted.carrier || '',
        confidence: extracted.confidence || 0,
        rawText: ocrText?.substring(0, 800) || '',
        allCandidates: extracted.allCandidates || [],
      });

      setStep('verify');
      
      if (extracted.trackingNumber) {
        toast.success(`Tracking number found${scanMethod === 'barcode' ? ' via barcode' : ''}!`);
      } else {
        toast.info('Could not auto-detect tracking number. Please enter manually.');
        setEditMode(true);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      toast.error('Scan failed. Please enter tracking details manually.');
      setExtractedData(prev => ({ ...prev, rawText: ocrText?.substring(0, 800) || '' }));
      setStep('verify');
      setEditMode(true);
    } finally {
      setScanning(false);
    }
  }, [scanBarcode, preprocessImage, scanMethod]);

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
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Detection confidence:</span>
                  <span className={`font-medium ${confidenceColor}`}>{confidenceLabel} ({Math.round(extractedData.confidence * 100)}%)</span>
                </div>
                {scanMethod && (
                  <Badge variant="outline" className="text-[10px]">
                    {scanMethod === 'barcode' ? '📊 Barcode' : scanMethod === 'ocr-corrected' ? '🔧 OCR+' : scanMethod === 'ai-vision' ? '✨ AI Vision' : '📝 OCR'}
                  </Badge>
                )}
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

            {/* Raw OCR text toggle for debugging */}
            {extractedData.rawText && (
              <div>
                <button onClick={() => setShowRawText(!showRawText)}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {showRawText ? 'Hide' : 'Show'} raw OCR text
                </button>
                {showRawText && (
                  <pre className="mt-2 p-2 rounded bg-muted text-[10px] max-h-32 overflow-y-auto whitespace-pre-wrap font-mono border">
                    {extractedData.rawText}
                  </pre>
                )}
              </div>
            )}

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
