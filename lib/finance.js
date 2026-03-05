// Finance helper functions for bills, vendors, purchase orders, and cash flow

/**
 * Calculate outstanding amount for a bill
 */
export function calculateOutstanding(bill) {
  const totalAmount = (bill.amount || 0) + (bill.taxAmount || 0);
  const totalPaid = (bill.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  return Math.max(0, totalAmount - totalPaid);
}

/**
 * Get bill status based on payments
 */
export function getBillStatus(bill) {
  const outstanding = calculateOutstanding(bill);
  if (outstanding <= 0) return 'paid';
  if ((bill.payments || []).length > 0) return 'partial';
  const now = new Date();
  const dueDate = new Date(bill.dueDate);
  if (dueDate < now) return 'overdue';
  // Due within 7 days
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (dueDate < sevenDays) return 'due_soon';
  return 'pending';
}

/**
 * Calculate payment priority recommendation
 */
export function getPaymentPriority(bills) {
  const unpaid = bills.filter(b => calculateOutstanding(b) > 0);
  
  return unpaid.sort((a, b) => {
    // Priority 1: Overdue bills first
    const aOverdue = new Date(a.dueDate) < new Date();
    const bOverdue = new Date(b.dueDate) < new Date();
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    
    // Priority 2: Statutory payments (GST, TDS) first
    const statutory = ['gst', 'tds', 'tax'];
    const aStatutory = statutory.some(s => (a.category || '').toLowerCase().includes(s));
    const bStatutory = statutory.some(s => (b.category || '').toLowerCase().includes(s));
    if (aStatutory && !bStatutory) return -1;
    if (!aStatutory && bStatutory) return 1;
    
    // Priority 3: Earlier due date first
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
}

/**
 * Default bill categories
 */
export const BILL_CATEGORIES = [
  'Platform Fees',
  'Marketing & Ads',
  'Raw Materials',
  'Packaging',
  'Shipping & Logistics',
  'GST Payable',
  'Salary & Wages',
  'Rent & Utilities',
  'Software & Tools',
  'Professional Services',
  'Other',
];

/**
 * Payment methods
 */
export const PAYMENT_METHODS = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Cheque',
  'Auto-Debit',
  'Other',
];

/**
 * PO statuses
 */
export const PO_STATUSES = ['draft', 'sent', 'acknowledged', 'received', 'paid', 'cancelled'];
