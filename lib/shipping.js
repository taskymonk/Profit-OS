// Shipping carrier detection and tracking URL generation

export const CARRIERS = {
  indiapost: { name: 'India Post / Speed Post', shortName: 'India Post', color: '#E31837',
    trackUrl: (t) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${t}`,
    patterns: [/^[A-Z]{2}\d{9}[A-Z]{2}$/i, /^[A-Z]{2}\d{9}IN$/i, /^6\d{10}$/],
    builtIn: true,
  },
  bluedart: { name: 'Blue Dart', shortName: 'Blue Dart', color: '#003399',
    trackUrl: (t) => `https://www.bluedart.com/tracking/${t}`,
    patterns: [/^[A-Z]\d{10}$/i, /^\d{11}$/],
    builtIn: true,
  },
  delhivery: { name: 'Delhivery', shortName: 'Delhivery', color: '#E74C3C',
    trackUrl: (t) => `https://www.delhivery.com/track/package/${t}`,
    patterns: [/^\d{13,18}$/],
    builtIn: true,
  },
  dtdc: { name: 'DTDC', shortName: 'DTDC', color: '#FF6600',
    trackUrl: (t) => `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${t}`,
    patterns: [/^[A-Z]\d{8,9}$/i, /^[A-Z]{2}\d{7,9}$/i],
    builtIn: true,
  },
  xpressbees: { name: 'XpressBees', shortName: 'XpressBees', color: '#FFC107',
    trackUrl: (t) => `https://www.xpressbees.com/track?awb=${t}`,
    patterns: [/^\d{14,15}$/],
    builtIn: true,
  },
  fedex: { name: 'FedEx', shortName: 'FedEx', color: '#4D148C',
    trackUrl: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`,
    patterns: [/^\d{12}$/, /^\d{15}$/, /^\d{20,22}$/],
    builtIn: true,
  },
  ecom: { name: 'Ecom Express', shortName: 'Ecom Express', color: '#00B050',
    trackUrl: (t) => `https://www.ecomexpress.in/tracking/?awb_field=${t}`,
    patterns: [/^\d{10,12}$/],
    builtIn: true,
  },
  shadowfax: { name: 'Shadowfax', shortName: 'Shadowfax', color: '#1A237E',
    trackUrl: (t) => `https://tracker.shadowfax.in/#/track?awb=${t}`,
    patterns: [/^SF[A-Z0-9]{10,14}$/i],
    builtIn: true,
  },
  other: { name: 'Other', shortName: 'Other', color: '#666',
    trackUrl: () => null,
    patterns: [],
    builtIn: true,
  },
};

// Known carrier keywords to look for in OCR text
const CARRIER_KEYWORDS = {
  indiapost: ['india post', 'speed post', 'indiapost', 'registered post', 'ems speed post', 'dept of posts', 'department of posts', 'book now pay later', 'booked at'],
  bluedart: ['blue dart', 'bluedart'],
  delhivery: ['delhivery', 'delhivry'],
  dtdc: ['dtdc', 'dtdc express', 'dtdc courier'],
  xpressbees: ['xpressbees', 'xpress bees'],
  fedex: ['fedex', 'federal express'],
  ecom: ['ecom express', 'ecomexpress'],
  shadowfax: ['shadowfax'],
};

// Keywords that appear near tracking numbers on shipping labels
const TRACKING_LABEL_KEYWORDS = [
  'awb', 'tracking', 'track', 'consignment', 'article', 'ref', 'barcode',
  'shipment', 'waybill', 'cn no', 'speed post', 'booking', 'receipt',
  'article number', 'consignment number', 'airway bill',
];

// ========== EXCLUSION FILTERS ==========

// Indian phone number pattern: starts with 6/7/8/9 followed by 9 digits
function isIndianPhoneNumber(str) {
  // Match: 10 digits starting with 6-9, or +91/91 prefix
  if (/^[6-9]\d{9}$/.test(str)) return true;
  if (/^\+?91[6-9]\d{9}$/.test(str)) return true;
  return false;
}

// Indian pincode: exactly 6 digits, typically 1-8 starting
function isLikelyPincode(str, context) {
  if (/^\d{6}$/.test(str)) {
    // Check if "pin" or "pincode" appears nearby in context
    const lowerCtx = (context || '').toLowerCase();
    if (lowerCtx.includes('pin') || lowerCtx.includes('postal') || lowerCtx.includes('zip')) return true;
    // Most Indian pincodes start with 1-8
    if (/^[1-8]\d{5}$/.test(str)) return true;
  }
  return false;
}

// Check if a number is likely a price/amount (has decimal or currency nearby)
function isLikelyPrice(str, context) {
  const lowerCtx = (context || '').toLowerCase();
  const idx = lowerCtx.indexOf(str.toLowerCase());
  if (idx < 0) return false;
  const nearby = lowerCtx.substring(Math.max(0, idx - 15), idx + str.length + 15);
  return /[\u20B9$]/.test(nearby) || /rs\.?\s*\d/.test(nearby) || /\.\d{2}/.test(str);
}

// Check keyword proximity — is a tracking-related keyword near this candidate?
function getKeywordProximityScore(candidate, rawText) {
  const lowerText = rawText.toLowerCase();
  const candidateIdx = lowerText.indexOf(candidate.toLowerCase());
  if (candidateIdx < 0) return 0;

  let bestScore = 0;
  for (const keyword of TRACKING_LABEL_KEYWORDS) {
    const kwIdx = lowerText.indexOf(keyword);
    if (kwIdx < 0) continue;
    const distance = Math.abs(candidateIdx - kwIdx);
    // Closer = higher score. Within 50 chars = great, within 100 = good
    if (distance < 30) bestScore = Math.max(bestScore, 0.5);
    else if (distance < 60) bestScore = Math.max(bestScore, 0.35);
    else if (distance < 120) bestScore = Math.max(bestScore, 0.2);
  }
  return bestScore;
}

// ========== MAIN EXTRACTION ==========

export function extractTrackingInfo(ocrText) {
  if (!ocrText) return { trackingNumber: null, carrier: null, confidence: 0 };

  const text = ocrText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const textLower = text.toLowerCase();

  // Step 1: Detect carrier from keywords
  let detectedCarrier = null;
  let carrierConfidence = 0;

  for (const [carrierId, keywords] of Object.entries(CARRIER_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw)) {
        detectedCarrier = carrierId;
        carrierConfidence = 0.9;
        break;
      }
    }
    if (detectedCarrier) break;
  }

  // Step 2: Extract potential tracking numbers using patterns
  // Priority order: labeled patterns first, then format-specific, then generic
  const trackingPatterns = [
    // Labeled: "AWB: XXXX", "Tracking: XXXX", "Article: XXXX", "CN No: XXXX"
    /(?:awb|tracking|track|consignment|article|ref|barcode|shipment|waybill|cn\s*no|receipt\s*no|booking\s*id)[\s.:=#\-]*([A-Z0-9]{8,22})/gi,
    // Explicit format labels
    /(?:AWB|CN|REF|TRK|ART)[\s.:=#\-]*([A-Z0-9]{8,22})/g,
    // India Post format: XX123456789XX (always 13 chars, letters+digits+letters)
    /\b([A-Z]{2}\d{9}[A-Z]{2})\b/g,
    // India Post ending in IN
    /\b([A-Z]{2}\d{9}IN)\b/gi,
    // Shadowfax format
    /\b(SF[A-Z0-9]{10,14})\b/gi,
    // Alphanumeric tracking (letter + digits, e.g. B1234567890)
    /\b([A-Z]\d{10,11})\b/g,
    // Long numeric — only 11+ digits to avoid phone numbers (most carriers use 11+)
    /\b(\d{11,18})\b/g,
  ];

  const candidates = [];
  for (const pattern of trackingPatterns) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const num = (match[1] || match[0]).trim();
      if (num && num.length >= 8 && num.length <= 22) {
        candidates.push(num);
      }
    }
  }

  // Remove duplicates, preserve order (first found = higher priority from pattern ordering)
  const uniqueCandidates = [...new Set(candidates)];

  // Step 3: Filter out phone numbers, pincodes, prices
  const filteredCandidates = uniqueCandidates.filter(c => {
    if (isIndianPhoneNumber(c)) return false;
    if (isLikelyPincode(c, text)) return false;
    if (isLikelyPrice(c, text)) return false;
    // Exclude very short pure-digit numbers (likely not tracking)
    if (/^\d+$/.test(c) && c.length < 10) return false;
    return true;
  });

  // Step 4: Score each candidate
  let bestMatch = null;
  let bestCarrier = detectedCarrier;
  let bestScore = 0;

  for (const candidate of filteredCandidates) {
    let score = 0;

    // A) Check carrier pattern match
    let patternCarrier = null;
    for (const [carrierId, info] of Object.entries(CARRIERS)) {
      if (carrierId === 'other') continue;
      for (const regex of info.patterns) {
        // Create a fresh regex to avoid lastIndex issues
        const freshRegex = new RegExp(regex.source, regex.flags);
        if (freshRegex.test(candidate)) {
          patternCarrier = carrierId;
          // Bonus if pattern matches the detected carrier from keywords
          score += (carrierId === detectedCarrier) ? 0.5 : 0.3;
          break;
        }
      }
      if (patternCarrier) break;
    }

    // B) Alphanumeric candidates score higher than pure numeric (less likely to be phone/pin)
    if (/[A-Z]/i.test(candidate)) score += 0.25;

    // C) Keyword proximity score
    score += getKeywordProximityScore(candidate, text);

    // D) Labeled extraction bonus (if it came from a "AWB:", "Tracking:" pattern)
    const labelPattern = /(?:awb|tracking|consignment|article|waybill|cn\s*no)[\s.:=#\-]/i;
    const candidateIdx = text.indexOf(candidate);
    if (candidateIdx > 0) {
      const preceding = text.substring(Math.max(0, candidateIdx - 40), candidateIdx);
      if (labelPattern.test(preceding)) score += 0.4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestCarrier = patternCarrier || detectedCarrier;
    }
  }

  // Fallback: if no scored match, take first filtered candidate
  if (!bestMatch && filteredCandidates.length > 0) {
    bestMatch = filteredCandidates[0];
    bestScore = 0.2;
  }

  return {
    trackingNumber: bestMatch,
    carrier: bestCarrier || (bestMatch ? 'other' : null),
    confidence: bestMatch ? Math.min(Math.max(bestScore, carrierConfidence), 1.0) : 0,
    allCandidates: filteredCandidates,
    rawText: text.substring(0, 500),
  };
}

// Get tracking URL for a carrier + tracking number
export function getTrackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const c = CARRIERS[carrier];
  if (!c) return null;
  return c.trackUrl(trackingNumber);
}

// Get carrier info
export function getCarrierInfo(carrierId) {
  return CARRIERS[carrierId] || CARRIERS.other;
}

// Get all carrier options for dropdown
export function getCarrierOptions() {
  return Object.entries(CARRIERS).map(([id, info]) => ({
    id, name: info.name, shortName: info.shortName, color: info.color,
  }));
}
