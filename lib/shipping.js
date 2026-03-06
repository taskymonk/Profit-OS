// Shipping carrier detection and tracking URL generation
// v2.0 — Enhanced with UPU S10 priority, context exclusion, known prefixes

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

// ======== UPU S10 STANDARD (India Post) ========
// Format: XX123456789IN (2 letters + 9 digits + 2-letter country code)
// Known India Post service prefixes
const INDIA_POST_PREFIXES = [
  'EE', 'EG', 'EM', 'EN', 'EP', 'EF', 'EA', 'EB', 'EC', 'ED', // EMS / Speed Post
  'RR', 'RB', 'RL', 'RM', 'RN', 'RO', 'RA', 'RC', 'RD', 'RE', // Registered Post
  'CC', 'CP', 'CL', 'CA', 'CB',                                   // Parcels
  'LM', 'LC', 'LB',                                                // Letter Mail
  'VV', 'VB', 'VA',                                                // Insured
];

// India Post carrier keywords
const INDIA_POST_KEYWORDS = [
  'india post', 'speed post', 'indiapost', 'registered post', 'ems speed post',
  'dept of posts', 'department of posts', 'booked at', 'book now',
  'ems', 'speed post tracking', 'india post tracking',
];

// Carrier keywords
const CARRIER_KEYWORDS = {
  indiapost: INDIA_POST_KEYWORDS,
  bluedart: ['blue dart', 'bluedart'],
  delhivery: ['delhivery', 'delhivry'],
  dtdc: ['dtdc', 'dtdc express', 'dtdc courier'],
  xpressbees: ['xpressbees', 'xpress bees'],
  fedex: ['fedex', 'federal express'],
  ecom: ['ecom express', 'ecomexpress'],
  shadowfax: ['shadowfax'],
};

// ======== CONTEXT-BASED EXCLUSION PATTERNS ========

// Words/patterns that precede phone numbers
const PHONE_CONTEXT = [
  'ph', 'phone', 'mob', 'mobile', 'contact', 'tel', 'call', 'whatsapp',
  'sender', 'receiver', 'from', 'to', 'cell',
];

// Words/patterns that precede pincodes
const PINCODE_CONTEXT = [
  'pin', 'pincode', 'pin code', 'postal', 'zip', 'post office',
];

// Words/patterns that precede amounts
const AMOUNT_CONTEXT = [
  'rs', 'rs.', 'inr', 'amount', 'postage', 'charge', 'fee', 'total',
  'weight', 'wt', 'grams', 'kg', 'gm',
];

// Tracking-related keywords (boost score if near candidate)
const TRACKING_KEYWORDS = [
  'awb', 'tracking', 'track', 'consignment', 'article', 'ref', 'barcode',
  'shipment', 'waybill', 'cn no', 'speed post', 'booking', 'receipt',
  'article number', 'consignment number', 'airway bill', 'article no',
];

// ======== EXCLUSION HELPERS ========

function isIndianPhoneNumber(str) {
  if (/^[6-9]\d{9}$/.test(str)) return true;
  if (/^\+?91[6-9]\d{9}$/.test(str)) return true;
  return false;
}

function hasPhoneContext(candidate, text) {
  const idx = text.toLowerCase().indexOf(candidate.toLowerCase());
  if (idx < 0) return false;
  const preceding = text.substring(Math.max(0, idx - 30), idx).toLowerCase();
  return PHONE_CONTEXT.some(w => preceding.includes(w));
}

function isLikelyPincode(str, text) {
  if (!/^\d{6}$/.test(str)) return false;
  if (/^[1-8]\d{5}$/.test(str)) {
    const idx = text.toLowerCase().indexOf(str);
    if (idx >= 0) {
      const preceding = text.substring(Math.max(0, idx - 30), idx).toLowerCase();
      if (PINCODE_CONTEXT.some(w => preceding.includes(w))) return true;
      // Also check if it's in an address context (after a city/state name)
      if (/[a-z]{3,}\s*[-,]?\s*$/.test(preceding)) return true;
    }
    return true; // Most 6-digit numbers starting 1-8 are pincodes in India
  }
  return false;
}

function isLikelyAmount(str, text) {
  const idx = text.toLowerCase().indexOf(str.toLowerCase());
  if (idx < 0) return false;
  const surrounding = text.substring(Math.max(0, idx - 20), idx + str.length + 10).toLowerCase();
  if (/[\u20B9$]/.test(surrounding)) return true;
  if (AMOUNT_CONTEXT.some(w => surrounding.includes(w))) return true;
  if (/\.\d{2}/.test(str)) return true; // Decimal with 2 places = likely money
  return false;
}

function getKeywordProximityScore(candidate, rawText) {
  const lowerText = rawText.toLowerCase();
  const candidateIdx = lowerText.indexOf(candidate.toLowerCase());
  if (candidateIdx < 0) return 0;
  let bestScore = 0;
  for (const keyword of TRACKING_KEYWORDS) {
    const kwIdx = lowerText.indexOf(keyword);
    if (kwIdx < 0) continue;
    const distance = Math.abs(candidateIdx - kwIdx);
    if (distance < 30) bestScore = Math.max(bestScore, 0.5);
    else if (distance < 60) bestScore = Math.max(bestScore, 0.35);
    else if (distance < 120) bestScore = Math.max(bestScore, 0.2);
  }
  return bestScore;
}

// ======== MAIN EXTRACTION ========

export function extractTrackingInfo(ocrText) {
  if (!ocrText) return { trackingNumber: null, carrier: null, confidence: 0 };

  const text = ocrText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const textLower = text.toLowerCase();

  // === STEP 1: Detect carrier from keywords ===
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

  // === STEP 2: India Post FAST PATH ===
  // If India Post keywords detected, immediately search for UPU S10 format
  if (detectedCarrier === 'indiapost' || textLower.includes('speed post') || textLower.includes('india post') || textLower.includes('ems')) {
    // Search for S10 format: XX123456789IN or XX123456789XX
    const s10Regex = /\b([A-Z]{2}\d{9}[A-Z]{2})\b/gi;
    let match;
    const s10Candidates = [];
    while ((match = s10Regex.exec(text)) !== null) {
      s10Candidates.push(match[1].toUpperCase());
    }

    // Filter by known India Post prefixes
    const prefixMatches = s10Candidates.filter(c => {
      const prefix = c.substring(0, 2);
      return INDIA_POST_PREFIXES.includes(prefix);
    });

    // Also accept any XX########IN pattern
    const inSuffix = s10Candidates.filter(c => c.endsWith('IN'));

    const bestS10 = prefixMatches[0] || inSuffix[0] || s10Candidates[0];
    if (bestS10) {
      return {
        trackingNumber: bestS10,
        carrier: 'indiapost',
        confidence: prefixMatches.includes(bestS10) ? 0.98 : 0.92,
        allCandidates: s10Candidates,
        rawText: text.substring(0, 500),
      };
    }
  }

  // === STEP 3: General extraction with scoring ===
  const trackingPatterns = [
    // Labeled: "AWB: XXXX", "Tracking: XXXX", etc.
    /(?:awb|tracking|track|consignment|article|ref|barcode|shipment|waybill|cn\s*no|receipt\s*no|booking\s*id|article\s*no)[\s.:=#\-]*([A-Z0-9]{8,22})/gi,
    // UPU S10 (any country)
    /\b([A-Z]{2}\d{9}[A-Z]{2})\b/g,
    // Shadowfax
    /\b(SF[A-Z0-9]{10,14})\b/gi,
    // Alphanumeric (letter + digits)
    /\b([A-Z]\d{10,11})\b/g,
    // Long numeric (12+ digits only — avoids phones)
    /\b(\d{12,18})\b/g,
    // 11-digit numeric (could be BlueDart)
    /\b(\d{11})\b/g,
  ];

  const candidates = [];
  for (const pattern of trackingPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = (match[1] || match[0]).trim();
      if (num && num.length >= 8 && num.length <= 22) {
        candidates.push(num);
      }
    }
  }

  const uniqueCandidates = [...new Set(candidates)];

  // === STEP 4: Aggressive filtering ===
  const filteredCandidates = uniqueCandidates.filter(c => {
    if (isIndianPhoneNumber(c)) return false;
    if (hasPhoneContext(c, text)) return false;
    if (isLikelyPincode(c, text)) return false;
    if (isLikelyAmount(c, text)) return false;
    if (/^\d+$/.test(c) && c.length < 10) return false;
    // Exclude 10-digit pure numbers (very likely phone in India context)
    if (/^\d{10}$/.test(c)) return false;
    return true;
  });

  // === STEP 5: Score candidates ===
  let bestMatch = null;
  let bestCarrier = detectedCarrier;
  let bestScore = 0;

  for (const candidate of filteredCandidates) {
    let score = 0;

    // A) Carrier pattern match
    let patternCarrier = null;
    for (const [carrierId, info] of Object.entries(CARRIERS)) {
      if (carrierId === 'other') continue;
      for (const regex of info.patterns) {
        const freshRegex = new RegExp(regex.source, regex.flags);
        if (freshRegex.test(candidate)) {
          patternCarrier = carrierId;
          score += (carrierId === detectedCarrier) ? 0.5 : 0.3;
          break;
        }
      }
      if (patternCarrier) break;
    }

    // B) Alphanumeric bonus
    if (/[A-Z]/i.test(candidate)) score += 0.25;

    // C) UPU S10 format bonus
    if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(candidate)) score += 0.3;

    // D) Keyword proximity
    score += getKeywordProximityScore(candidate, text);

    // E) Labeled extraction bonus
    const candidateIdx = text.indexOf(candidate);
    if (candidateIdx > 0) {
      const preceding = text.substring(Math.max(0, candidateIdx - 40), candidateIdx).toLowerCase();
      if (/(?:awb|tracking|consignment|article|waybill|cn\s*no|barcode)[\s.:=#\-]/i.test(preceding)) score += 0.4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestCarrier = patternCarrier || detectedCarrier;
    }
  }

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

export function getTrackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const c = CARRIERS[carrier];
  return c ? c.trackUrl(trackingNumber) : null;
}

export function getCarrierInfo(carrierId) {
  return CARRIERS[carrierId] || CARRIERS.other;
}

export function getCarrierOptions() {
  return Object.entries(CARRIERS).map(([id, info]) => ({
    id, name: info.name, shortName: info.shortName, color: info.color,
  }));
}
