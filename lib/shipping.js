// Shipping carrier detection and tracking URL generation

export const CARRIERS = {
  indiapost: { name: 'India Post / Speed Post', shortName: 'India Post', color: '#E31837',
    trackUrl: (t) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${t}`,
    patterns: [/^[A-Z]{2}\d{9}[A-Z]{2}$/i, /^[A-Z]{2}\d{9}IN$/i, /^6\d{10}$/],
  },
  bluedart: { name: 'Blue Dart', shortName: 'Blue Dart', color: '#003399',
    trackUrl: (t) => `https://www.bluedart.com/tracking/${t}`,
    patterns: [/^\d{10,11}$/, /^[A-Z]\d{10}$/i],
  },
  delhivery: { name: 'Delhivery', shortName: 'Delhivery', color: '#E74C3C',
    trackUrl: (t) => `https://www.delhivery.com/track/package/${t}`,
    patterns: [/^\d{13,18}$/],
  },
  dtdc: { name: 'DTDC', shortName: 'DTDC', color: '#FF6600',
    trackUrl: (t) => `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${t}`,
    patterns: [/^[A-Z]\d{8,9}$/i, /^[A-Z]{2}\d{7,9}$/i],
  },
  xpressbees: { name: 'XpressBees', shortName: 'XpressBees', color: '#FFC107',
    trackUrl: (t) => `https://www.xpressbees.com/track?awb=${t}`,
    patterns: [/^\d{10,15}$/],
  },
  fedex: { name: 'FedEx', shortName: 'FedEx', color: '#4D148C',
    trackUrl: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`,
    patterns: [/^\d{12,22}$/, /^\d{15}$/],
  },
  ecom: { name: 'Ecom Express', shortName: 'Ecom Express', color: '#00B050',
    trackUrl: (t) => `https://www.ecomexpress.in/tracking/?awb_field=${t}`,
    patterns: [/^\d{10,12}$/],
  },
  other: { name: 'Other', shortName: 'Other', color: '#666',
    trackUrl: () => null,
    patterns: [],
  },
};

// Known carrier keywords to look for in OCR text
const CARRIER_KEYWORDS = {
  indiapost: ['india post', 'speed post', 'indiapost', 'registered post', 'ems speed post', 'dept of posts', 'department of posts'],
  bluedart: ['blue dart', 'bluedart'],
  delhivery: ['delhivery', 'delhivry'],
  dtdc: ['dtdc', 'dtdc express', 'dtdc courier'],
  xpressbees: ['xpressbees', 'xpress bees'],
  fedex: ['fedex', 'federal express'],
  ecom: ['ecom express', 'ecomexpress'],
};

// Extract tracking number from OCR text
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

  // Step 2: Extract potential tracking numbers
  // Look for common patterns: AWB, Tracking, Consignment, Article number
  const trackingPatterns = [
    /(?:awb|tracking|track|consignment|article|ref|barcode|shipment)[\s.:=#-]*([A-Z0-9]{8,22})/gi,
    /(?:AWB|CN|REF|TRK)[\s.:=#-]*([A-Z0-9]{8,22})/g,
    /\b([A-Z]{2}\d{9}[A-Z]{2})\b/g,  // India Post format: EE123456789IN
    /\b([A-Z]{2}\d{9}IN)\b/gi,       // India Post specifically ending in IN
    /\b(\d{10,18})\b/g,               // Long numeric (Blue Dart, Delhivery, etc.)
  ];

  const candidates = [];
  for (const pattern of trackingPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = match[1] || match[0];
      if (num && num.length >= 8 && num.length <= 22) {
        candidates.push(num.trim());
      }
    }
  }

  // Remove duplicates
  const uniqueCandidates = [...new Set(candidates)];

  // Step 3: Match candidates against carrier patterns
  let bestMatch = null;
  let bestCarrier = detectedCarrier;
  let bestScore = 0;

  for (const candidate of uniqueCandidates) {
    for (const [carrierId, info] of Object.entries(CARRIERS)) {
      if (carrierId === 'other') continue;
      for (const regex of info.patterns) {
        if (regex.test(candidate)) {
          const score = (carrierId === detectedCarrier) ? 1.0 : 0.7;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
            bestCarrier = carrierId;
          }
        }
      }
    }
  }

  // If no pattern match, take the first candidate
  if (!bestMatch && uniqueCandidates.length > 0) {
    bestMatch = uniqueCandidates[0];
    bestScore = 0.4;
  }

  return {
    trackingNumber: bestMatch,
    carrier: bestCarrier || (bestMatch ? 'other' : null),
    confidence: bestMatch ? Math.max(bestScore, carrierConfidence) : 0,
    allCandidates: uniqueCandidates,
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
