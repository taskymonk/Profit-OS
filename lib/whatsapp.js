// WhatsApp Cloud API Helper Library
// Uses Meta's Graph API v21.0 for sending messages

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Load WhatsApp config from the integrations collection
 */
export async function getWhatsAppConfig(db) {
  const config = await db.collection('integrations').findOne({ _id: 'integrations-config' });
  if (!config?.whatsapp?.active || !config?.whatsapp?.phoneNumberId || !config?.whatsapp?.accessToken) {
    return null;
  }
  return config.whatsapp;
}

/**
 * Send a text message via WhatsApp Cloud API
 */
export async function sendTextMessage(config, to, text) {
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: formatPhone(to),
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `WhatsApp API error: ${res.status}`);
  return data;
}

/**
 * Send a template message via WhatsApp Cloud API
 * Templates must be pre-approved in Meta Business Manager
 */
export async function sendTemplateMessage(config, to, templateName, languageCode = 'en', bodyParams = []) {
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;

  const templatePayload = {
    name: templateName,
    language: { code: languageCode },
  };

  // Add body parameters if provided
  if (bodyParams && bodyParams.length > 0) {
    templatePayload.components = [
      {
        type: 'body',
        parameters: bodyParams.map(p => ({ type: 'text', text: String(p) })),
      },
    ];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: formatPhone(to),
      type: 'template',
      template: templatePayload,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `WhatsApp API error: ${res.status}`);
  return data;
}

/**
 * Send an image message via WhatsApp Cloud API
 */
export async function sendImageMessage(config, to, imageUrl, caption) {
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;
  const imagePayload = { link: imageUrl };
  if (caption) imagePayload.caption = caption;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: formatPhone(to),
      type: 'image',
      image: imagePayload,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `WhatsApp API error: ${res.status}`);
  return data;
}

/**
 * Format phone number to WhatsApp format (strip +, ensure country code)
 */
export function formatPhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  // If starts with 0 and is 10 digits, assume Indian number
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '91' + cleaned.substring(1);
  }
  // If 10 digits without country code, assume India
  if (cleaned.length === 10 && !cleaned.startsWith('91')) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Resolve template variables with order data
 */
export function resolveTemplateVariables(bodyText, order, config) {
  if (!bodyText) return '';
  const trackingLink = order.trackingNumber && order.shippingCarrier
    ? getTrackingLink(order.shippingCarrier, order.trackingNumber)
    : '';
  
  const productNames = order.items
    ? order.items.map(i => i.title || i.name).join(', ')
    : order.productTitle || '';

  const vars = {
    '{{customer_name}}': order.customerName || order.customer?.name || 'Customer',
    '{{customer_phone}}': order.customerPhone || order.customer?.phone || '',
    '{{order_id}}': order.orderId || order._id || '',
    '{{order_total}}': order.salePrice ? `₹${order.salePrice}` : '',
    '{{tracking_number}}': order.trackingNumber || '',
    '{{tracking_link}}': trackingLink,
    '{{carrier}}': getCarrierName(order.shippingCarrier) || '',
    '{{product_names}}': productNames,
    '{{estimated_delivery}}': '',
    '{{business_name}}': config?.businessName || 'GiftSugar',
    '{{support_number}}': config?.supportNumber || '',
    '{{status}}': order.kdsStatus || order.status || '',
  };

  let resolved = bodyText;
  for (const [key, value] of Object.entries(vars)) {
    resolved = resolved.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '');
  }
  return resolved;
}

function getTrackingLink(carrier, trackingNumber) {
  const links = {
    indiapost: `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${trackingNumber}`,
    bluedart: `https://www.bluedart.com/tracking/${trackingNumber}`,
    delhivery: `https://www.delhivery.com/track/package/${trackingNumber}`,
    dtdc: `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${trackingNumber}`,
    xpressbees: `https://www.xpressbees.com/track?awb=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    ecom: `https://www.ecomexpress.in/tracking/?awb_field=${trackingNumber}`,
  };
  return links[carrier] || '';
}

function getCarrierName(carrierId) {
  const names = {
    indiapost: 'India Post', bluedart: 'Blue Dart', delhivery: 'Delhivery',
    dtdc: 'DTDC', xpressbees: 'XpressBees', fedex: 'FedEx', ecom: 'Ecom Express',
  };
  return names[carrierId] || carrierId || '';
}

/**
 * Check if phone is opted out
 */
export async function isOptedOut(db, phone) {
  const formatted = formatPhone(phone);
  if (!formatted) return true;
  const record = await db.collection('whatsappOptOuts').findOne({ phone: formatted });
  return !!record;
}

/**
 * Check quiet hours (9 PM - 9 AM IST)
 */
export function isQuietHours() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hour = istTime.getUTCHours();
  return hour >= 21 || hour < 9;
}

/**
 * Default WhatsApp templates to seed
 */
export const DEFAULT_TEMPLATES = [
  {
    name: 'Order Confirmed',
    triggerEvent: 'order_confirmed',
    metaTemplateName: 'order_confirmed',
    languageCode: 'en',
    body: 'Hi {{customer_name}}, your order #{{order_id}} has been confirmed! We\'re preparing it with care. 🎁\n\nOrder Total: {{order_total}}\nProduct: {{product_names}}\n\nThank you for choosing {{business_name}}!',
    variables: ['customer_name', 'order_id', 'order_total', 'product_names', 'business_name'],
    enabled: true,
    metaApprovalStatus: 'pending',
    useTextFallback: true,
  },
  {
    name: 'Order Dispatched',
    triggerEvent: 'order_dispatched',
    metaTemplateName: 'order_dispatched',
    languageCode: 'en',
    body: 'Great news {{customer_name}}! 📦 Your order #{{order_id}} has been shipped via {{carrier}}.\n\nTracking: {{tracking_number}}\nTrack here: {{tracking_link}}\n\nYou\'ll receive it soon!',
    variables: ['customer_name', 'order_id', 'carrier', 'tracking_number', 'tracking_link'],
    enabled: true,
    metaApprovalStatus: 'pending',
    useTextFallback: true,
  },
  {
    name: 'Order Delivered',
    triggerEvent: 'order_delivered',
    metaTemplateName: 'order_delivered',
    languageCode: 'en',
    body: 'Hi {{customer_name}}, your order #{{order_id}} has been delivered! ✅\n\nWe hope you love it! Reply with any feedback.\n\nThank you for shopping with {{business_name}}! 💝',
    variables: ['customer_name', 'order_id', 'business_name'],
    enabled: true,
    metaApprovalStatus: 'pending',
    useTextFallback: true,
    delay: 30, // 30 minute delay
  },
  {
    name: 'Order Status Update',
    triggerEvent: 'order_status_update',
    metaTemplateName: 'order_status_update',
    languageCode: 'en',
    body: 'Update on your order #{{order_id}}: Status is now {{status}}.\n\nIf you have questions, reach us at {{support_number}}.',
    variables: ['order_id', 'status', 'support_number'],
    enabled: false,
    metaApprovalStatus: 'pending',
    useTextFallback: true,
  },
  {
    name: 'Order Cancelled',
    triggerEvent: 'order_cancelled',
    metaTemplateName: 'order_cancelled',
    languageCode: 'en',
    body: 'Hi {{customer_name}}, your order #{{order_id}} has been cancelled.\n\nIf this was a mistake or you need help, reach us at {{support_number}}.',
    variables: ['customer_name', 'order_id', 'support_number'],
    enabled: true,
    metaApprovalStatus: 'pending',
    useTextFallback: true,
  },
];
