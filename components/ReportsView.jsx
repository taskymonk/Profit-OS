'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import GuideCard from '@/components/GuideCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp, TrendingDown, MapPin, Users, CalendarDays, AlertTriangle,
  Package, Crown, ShieldAlert, DollarSign, ChevronLeft, ChevronRight,
  Repeat, UserCheck, BarChart3, PieChart as PieChartIcon, CreditCard, Landmark, CheckCircle2, XCircle, Eye, EyeOff, Clock
} from 'lucide-react';

const fmt = (val) => `\u20B9${Math.abs(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtMonth = (m) => {
  try {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  } catch { return m; }
};

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 space-y-1">
        <p className="text-sm font-semibold">{label}</p>
        {payload.map((item, i) => (
          <p key={i} className="text-xs"><span className="text-muted-foreground">{item.name}:</span> <span className="font-medium">{typeof item.value === 'number' && (item.name.includes('Rate') || item.name.includes('Margin')) ? `${item.value}%` : fmt(item.value)}</span></p>
        ))}
      </div>
    );
  }
  return null;
}

const DATE_PRESETS = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'All Time', value: 'allTime' },
  { label: 'Custom Range', value: 'custom' },
];

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState('skus');
  const [datePreset, setDatePreset] = useState('Last 30 Days');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 31); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0];
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState({ from: undefined, to: undefined });

  const [skuData, setSkuData] = useState([]);
  const [rtoData, setRtoData] = useState([]);
  const [empData, setEmpData] = useState([]);
  const [ledgerData, setLedgerData] = useState([]);
  const [plData, setPlData] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  const [cogsData, setCogsData] = useState([]);
  const [expenseTrend, setExpenseTrend] = useState({ data: [], categories: [] });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adSpendTaxRate, setAdSpendTaxRate] = useState(18);
  const LEDGER_PAGE_SIZE = 15;
  const [teamPerfData, setTeamPerfData] = useState(null);
  const [teamPerfLoading, setTeamPerfLoading] = useState(false);

  // Payments & Settlements state
  const [paymentsData, setPaymentsData] = useState({
    reconciliation: null,
    settlements: [],
    unmatchedPayments: [],
    settlementsActive: false,
  });
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [unmatchedFilter, setUnmatchedFilter] = useState('unresolved'); // 'unresolved' | 'ignored' | 'all'
  const [settlementPage, setSettlementPage] = useState(1);
  const SETTLEMENT_PAGE_SIZE = 10;

  const applyPreset = (preset) => {
    setDatePreset(preset.label);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    if (preset.value === 'allTime') {
      setStartDate('2020-01-01');
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset.value === 'thisMonth') {
      setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset.value === 'custom') {
      setDatePreset('Custom Range');
      setCalendarOpen(true);
    } else {
      // "Last X Days" = X complete days before today (excluding today)
      const d = new Date(yesterday.getTime() - (preset.days - 1) * 86400000);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(yesterday.toISOString().split('T')[0]);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const qs = `?startDate=${startDate}&endDate=${endDate}`;
      const [s, r, e, l, tc, pl, cust, cogs, expT] = await Promise.all([
        fetch(`/api/reports/profitable-skus${qs}`).then(r => r.json()),
        fetch(`/api/reports/rto-locations${qs}`).then(r => r.json()),
        fetch(`/api/reports/employee-output${qs}`).then(r => r.json()),
        fetch('/api/daily-marketing-spend').then(r => r.json()),
        fetch('/api/tenant-config').then(r => r.json()),
        fetch(`/api/reports/monthly-pl${qs}`).then(r => r.json()),
        fetch(`/api/reports/customer-repeat${qs}`).then(r => r.json()),
        fetch(`/api/reports/product-cogs${qs}`).then(r => r.json()),
        fetch(`/api/reports/expense-trend${qs}`).then(r => r.json()),
      ]);
      setSkuData(s); setRtoData(r); setEmpData(e);
      setLedgerData(Array.isArray(l) ? l : []);
      setAdSpendTaxRate(tc?.adSpendTaxRate ?? 18);
      setPlData(Array.isArray(pl) ? pl : []);
      setCustomerData(cust || null);
      setCogsData(Array.isArray(cogs) ? cogs : []);
      setExpenseTrend(expT || { data: [], categories: [] });
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, [startDate, endDate]);

  // Fetch payments data when the tab is 'payments'
  const fetchPaymentsData = async () => {
    setPaymentsLoading(true);
    try {
      const [recon, sett, unmatched] = await Promise.all([
        fetch('/api/razorpay/reconciliation-summary').then(r => r.json()),
        fetch('/api/razorpay/settlements').then(r => r.json()),
        fetch('/api/razorpay/unmatched').then(r => r.json()),
      ]);
      setPaymentsData({
        reconciliation: recon || null,
        settlements: sett?.settlements || [],
        unmatchedPayments: unmatched?.payments || [],
        settlementsActive: sett?.active || false,
        estimated: sett?.estimated || null,
        accuracy: sett?.accuracy || null,
      });
    } catch (err) { console.error('Payments fetch error:', err); }
    setPaymentsLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'payments') fetchPaymentsData();
    if (activeTab === 'team-performance') fetchTeamPerformance();
  }, [activeTab]);

  const fetchTeamPerformance = async () => {
    setTeamPerfLoading(true);
    try {
      const res = await fetch(`/api/reports/team-performance?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setTeamPerfData(data);
    } catch (err) { console.error('Team performance fetch error:', err); }
    setTeamPerfLoading(false);
  };

  // Resolve unmatched payment
  const resolvePayment = async (paymentId, status) => {
    try {
      await fetch(`/api/razorpay/unmatched/${paymentId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setPaymentsData(prev => ({
        ...prev,
        unmatchedPayments: prev.unmatchedPayments.map(p =>
          p._id === paymentId ? { ...p, status, resolvedAt: new Date().toISOString() } : p
        ),
      }));
    } catch (err) { console.error(err); }
  };

  // Bulk resolve unmatched
  const bulkResolve = async (status) => {
    const ids = filteredUnmatched.filter(p => p.status === 'unresolved').map(p => p._id);
    if (ids.length === 0) return;
    try {
      await fetch('/api/razorpay/unmatched/bulk-resolve', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIds: ids, status }),
      });
      setPaymentsData(prev => ({
        ...prev,
        unmatchedPayments: prev.unmatchedPayments.map(p =>
          ids.includes(p._id) ? { ...p, status, resolvedAt: new Date().toISOString() } : p
        ),
      }));
    } catch (err) { console.error(err); }
  };

  // Filtered unmatched payments
  const filteredUnmatched = useMemo(() => {
    if (unmatchedFilter === 'all') return paymentsData.unmatchedPayments;
    return paymentsData.unmatchedPayments.filter(p => p.status === unmatchedFilter);
  }, [paymentsData.unmatchedPayments, unmatchedFilter]);

  const CHART_COLORS = ['#059669', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <GuideCard storageKey="guide_reports" icon={BarChart3} title="📈 Reports & Analytics Guide">
        <p>• 📊 <strong>P&L Report</strong> — Full profit & loss breakdown with revenue, COGS, expenses, marketing, and net profit</p>
        <p>• 💳 <strong>Payments Tab</strong> — Razorpay payment reconciliation, settlement tracking, and unmatched payment alerts</p>
        <p>• 📢 <strong>Marketing Tab</strong> — ROAS, CPA, and ad spend efficiency across Meta Ads campaigns</p>
        <p>• 📦 <strong>Product Performance</strong> — Per-SKU revenue, order count, COGS, and profit margin analysis</p>
        <p>• 👥 <strong>Team Performance</strong> — Employee KDS metrics, efficiency scores, and comparison charts</p>
        <p>• 📅 All reports respect the <strong>date range filter</strong> — switch between weekly, monthly, or custom periods</p>
      </GuideCard>
      {/* Date Filter - Dashboard Style with Calendar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {DATE_PRESETS.map(p => (
            <Button key={p.label} size="sm" variant={datePreset === p.label ? 'default' : 'outline'} className="h-8 text-xs"
              onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
          {/* Show active date range */}
          {startDate && endDate && datePreset !== 'All Time' && datePreset !== 'Custom Range' && (
            <span className="text-sm font-medium text-muted-foreground ml-1 bg-muted px-3 py-1.5 rounded-md border border-border">
              {format(new Date(startDate + 'T00:00:00'), 'dd MMM yyyy')}
              {startDate !== endDate && (
                <> — {format(new Date(endDate + 'T00:00:00'), 'dd MMM yyyy')}</>
              )}
            </span>
          )}
        </div>
        {datePreset === 'Custom Range' && (
          <Popover open={calendarOpen} onOpenChange={(open) => {
            if (open) setCalendarOpen(true);
          }}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 px-3 gap-2 text-sm font-normal" onClick={() => setCalendarOpen(true)}>
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                {startDate && endDate
                  ? `${format(new Date(startDate + 'T00:00:00'), 'dd MMM yyyy')} — ${format(new Date(endDate + 'T00:00:00'), 'dd MMM yyyy')}`
                  : 'Pick date range'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" sideOffset={8} onInteractOutside={(e) => {
              e.preventDefault();
            }}>
              <Calendar
                mode="range"
                selected={pendingRange}
                onSelect={(range) => {
                  setPendingRange({ from: range?.from, to: range?.to });
                }}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />
              <div className="flex items-center justify-between p-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {pendingRange.from && !pendingRange.to && 'Now select an end date'}
                  {pendingRange.from && pendingRange.to && (
                    <>{format(pendingRange.from, 'dd MMM yyyy')} — {format(pendingRange.to, 'dd MMM yyyy')}</>
                  )}
                  {!pendingRange.from && 'Select a start date'}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                    setPendingRange({ from: undefined, to: undefined });
                    setCalendarOpen(false);
                  }}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" disabled={!pendingRange.from || !pendingRange.to} onClick={() => {
                    setStartDate(format(pendingRange.from, 'yyyy-MM-dd'));
                    setEndDate(format(pendingRange.to, 'yyyy-MM-dd'));
                    setPendingRange({ from: undefined, to: undefined });
                    setCalendarOpen(false);
                  }}>Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {loading && <Badge variant="outline" className="animate-pulse"><CalendarDays className="w-3 h-3 mr-1" /> Loading...</Badge>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-9 max-w-4xl">
          <TabsTrigger value="skus" className="gap-1 text-xs"><Crown className="w-3.5 h-3.5" /> SKU Profit</TabsTrigger>
          <TabsTrigger value="monthly-pl" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> Monthly P&L</TabsTrigger>
          <TabsTrigger value="cogs" className="gap-1 text-xs"><Package className="w-3.5 h-3.5" /> COGS</TabsTrigger>
          <TabsTrigger value="customers" className="gap-1 text-xs"><Repeat className="w-3.5 h-3.5" /> Customers</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /> Expenses</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1 text-xs"><CreditCard className="w-3.5 h-3.5" /> Payments</TabsTrigger>
          <TabsTrigger value="rto" className="gap-1 text-xs"><MapPin className="w-3.5 h-3.5" /> RTO Map</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" /> Team</TabsTrigger>
          <TabsTrigger value="team-performance" className="gap-1 text-xs"><Clock className="w-3.5 h-3.5" /> Team Performance</TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /> Ad Ledger</TabsTrigger>
        </TabsList>

        {/* SKU Profitability - existing */}
        <TabsContent value="skus" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most Profitable SKUs</CardTitle>
                  <CardDescription>Ranked by total net profit in the selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={skuData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `\u20B9${(v/1000).toFixed(0)}k`} />
                        <YAxis dataKey="sku" type="category" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="totalProfit" name="Total Profit" radius={[0,4,4,0]}>
                          {skuData.slice(0, 10).map((entry, i) => (
                            <Cell key={i} fill={entry.totalProfit >= 0 ? '#059669' : '#dc2626'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Rank</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">SKU</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Product</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Orders</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Revenue</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">COGS</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total Profit</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Margin</th>
                      </tr></thead>
                      <tbody>
                        {skuData.map((sku, i) => (
                          <tr key={sku.sku} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4">{i === 0 ? <Crown className="w-4 h-4 text-amber-500" /> : <span className="text-sm text-muted-foreground">#{i + 1}</span>}</td>
                            <td className="py-3 px-4 text-xs font-mono">{sku.sku}</td>
                            <td className="py-3 px-4 text-sm">{sku.productName}</td>
                            <td className="py-3 px-4 text-sm text-right">{sku.totalOrders}</td>
                            <td className="py-3 px-4 text-sm text-right">{fmt(sku.totalRevenue)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(sku.totalCOGS)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-bold ${sku.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(sku.totalProfit)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-medium ${sku.profitMargin >= 20 ? 'text-emerald-600' : sku.profitMargin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{sku.profitMargin}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Monthly P&L */}
        <TabsContent value="monthly-pl" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly P&L Summary</CardTitle>
                  <CardDescription>Month-over-month comparison of revenue, costs, and profit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={plData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={fmtMonth} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="revenue" name="Revenue" fill="#0ea5e9" radius={[4,4,0,0]} />
                        <Bar dataKey="netProfit" name="Net Profit" radius={[4,4,0,0]}>
                          {plData.map((entry, i) => (
                            <Cell key={i} fill={entry.netProfit >= 0 ? '#059669' : '#dc2626'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Month</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Orders</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Revenue</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">COGS</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Shopify Fees</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Gateway Fees</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Ad Spend</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Overhead</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Net Profit</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Margin</th>
                      </tr></thead>
                      <tbody>
                        {plData.map(m => (
                          <tr key={m.month} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4 text-sm font-medium">{fmtMonth(m.month)}</td>
                            <td className="py-3 px-4 text-sm text-right">{m.orderCount}</td>
                            <td className="py-3 px-4 text-sm text-right font-medium">{fmt(m.revenue)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(m.cogs)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(m.shopifyFees)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(m.razorpayFees)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(m.adSpend)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(m.overhead)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-bold ${m.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(m.netProfit)}</td>
                            <td className={`py-3 px-4 text-sm text-right ${m.margin >= 20 ? 'text-emerald-600' : m.margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{m.margin}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Product COGS Analysis */}
        <TabsContent value="cogs" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Product-wise COGS Analysis</CardTitle>
                  <CardDescription>Which SKUs have the highest/lowest COGS margins</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cogsData.slice(0, 15)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="sku" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="revenue" name="Revenue" fill="#0ea5e9" radius={[4,4,0,0]} />
                        <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[4,4,0,0]} />
                        <Bar dataKey="grossProfit" name="Gross Profit" radius={[4,4,0,0]}>
                          {cogsData.slice(0, 15).map((entry, i) => (
                            <Cell key={i} fill={entry.grossProfit >= 0 ? '#059669' : '#dc2626'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">SKU</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Product</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-center">Recipe?</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Orders</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Revenue</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total COGS</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Avg COGS/Order</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Gross Profit</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Margin</th>
                      </tr></thead>
                      <tbody>
                        {cogsData.map(s => (
                          <tr key={s.sku} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4 text-xs font-mono">{s.sku}</td>
                            <td className="py-3 px-4 text-sm">{s.productName}</td>
                            <td className="py-3 px-4 text-center">
                              {s.hasRecipe ? <Badge variant="default" className="text-[10px]">Yes</Badge> : <Badge variant="outline" className="text-[10px] text-amber-600">No</Badge>}
                            </td>
                            <td className="py-3 px-4 text-sm text-right">{s.orders}</td>
                            <td className="py-3 px-4 text-sm text-right">{fmt(s.revenue)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(s.cogs)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(s.avgCOGSPerOrder)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-bold ${s.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(s.grossProfit)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-medium ${s.margin >= 40 ? 'text-emerald-600' : s.margin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{s.margin}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Customer Retention */}
        <TabsContent value="customers" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : customerData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{customerData.summary.totalCustomers}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Repeat Customers</p>
                  <p className="text-2xl font-bold text-emerald-600">{customerData.summary.repeatCustomers}</p>
                  <Badge variant={customerData.summary.repeatRate >= 20 ? 'default' : 'secondary'} className="mt-1">{customerData.summary.repeatRate}% repeat rate</Badge>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Avg Order Value</p>
                  <p className="text-2xl font-bold">{fmt(customerData.summary.avgOrderValue)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Repeat Revenue</p>
                  <p className="text-2xl font-bold text-primary">{fmt(customerData.summary.repeatRevenue)}</p>
                  <p className="text-[11px] text-muted-foreground">vs {fmt(customerData.summary.oneTimeRevenue)} one-time</p>
                </CardContent></Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Repeat Customers</CardTitle>
                  <CardDescription>Customers with the most orders in this period (avg {customerData.summary.avgRepeatOrders} orders per repeat customer)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">#</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Customer</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Orders</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total Spent</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Avg Order</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">First Order</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Last Order</th>
                      </tr></thead>
                      <tbody>
                        {(customerData.topRepeatCustomers || []).map((c, i) => (
                          <tr key={c.email} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4">{i === 0 ? <Crown className="w-4 h-4 text-amber-500" /> : <span className="text-sm text-muted-foreground">#{i+1}</span>}</td>
                            <td className="py-3 px-4 text-sm font-medium">{c.name}</td>
                            <td className="py-3 px-4 text-sm text-right font-bold">{c.orders}</td>
                            <td className="py-3 px-4 text-sm text-right">{fmt(c.totalSpent)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(c.avgOrderValue)}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(c.firstOrder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(c.lastOrder).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Repeat className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No customer data available</p>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Expense Trend */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expense Trend by Category</CardTitle>
                <CardDescription>Monthly expense breakdown over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseTrend.data.length > 0 ? (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expenseTrend.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={fmtMonth} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        {expenseTrend.categories.map((cat, i) => (
                          <Bar key={cat} dataKey={cat} name={cat} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="font-medium">No expense data to show</p>
                    <p className="text-sm mt-1">Add expenses in the Expenses page to see trends here.</p>
                  </div>
                )}
                {expenseTrend.categories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {expenseTrend.categories.map((cat, i) => (
                      <Badge key={cat} variant="outline" className="text-[10px]">
                        <span className="w-2 h-2 rounded-full mr-1.5 inline-block" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* RTO Locations - existing */}
        <TabsContent value="rto" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Highest RTO Pincodes / Cities</CardTitle>
                  <CardDescription>Locations with the most return-to-origin orders</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rtoData.slice(0, 10)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="rtoCount" name="RTO Orders" fill="#dc2626" radius={[4,4,0,0]} />
                        <Bar dataKey="deliveredCount" name="Delivered" fill="#059669" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">City</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Pincode</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Delivered</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">RTO</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">RTO Rate</th>
                      </tr></thead>
                      <tbody>
                        {rtoData.map(loc => (
                          <tr key={loc.pincode} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4 text-sm font-medium flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{loc.city}</td>
                            <td className="py-3 px-4 text-sm font-mono">{loc.pincode}</td>
                            <td className="py-3 px-4 text-sm text-right">{loc.totalOrders}</td>
                            <td className="py-3 px-4 text-sm text-right text-emerald-600">{loc.deliveredCount}</td>
                            <td className="py-3 px-4 text-sm text-right text-red-600 font-medium">{loc.rtoCount}</td>
                            <td className="py-3 px-4 text-right">
                              <Badge variant={loc.rtoRate > 30 ? 'destructive' : loc.rtoRate > 15 ? 'secondary' : 'default'}
                                className={loc.rtoRate <= 15 ? 'bg-emerald-100 text-emerald-700' : ''}>{loc.rtoRate}%</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Employee Output - existing */}
        <TabsContent value="employees" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : empData.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {empData.map((emp, i) => (
                  <Card key={emp.employeeId} className={i === 0 ? 'border-primary/50 shadow-md' : ''}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${i === 0 ? 'bg-primary/10' : 'bg-muted'}`}>
                            <Users className={`w-5 h-5 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm">{emp.name}</h3>
                            <Badge variant="outline" className="text-xs">{emp.role}</Badge>
                          </div>
                        </div>
                        {i === 0 && <Crown className="w-5 h-5 text-amber-500" />}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><span className="text-muted-foreground">Orders Prepared</span><p className="text-lg font-bold">{emp.totalOrdersPrepared}</p></div>
                        <div><span className="text-muted-foreground">Daily Average</span><p className="text-lg font-bold">{emp.dailyAverage}</p></div>
                        <div><span className="text-muted-foreground">Delivered</span><p className="text-sm font-semibold text-emerald-600">{emp.deliveredCount}</p></div>
                        <div><span className="text-muted-foreground">Error Rate (RTO)</span><p className={`text-sm font-semibold ${emp.errorRate > 20 ? 'text-red-600' : emp.errorRate > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>{emp.errorRate}%</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No employee data</p>
              <p className="text-sm mt-1">Add employees and assign orders to see performance reports.</p>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Team Performance - detailed KDS metrics */}
        <TabsContent value="team-performance" className="space-y-4 mt-4">
          {teamPerfLoading ? <Skeleton className="h-80 rounded-xl" /> : teamPerfData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Employees</p>
                  <p className="text-2xl font-bold">{teamPerfData.summary?.totalEmployees || 0}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Assignments</p>
                  <p className="text-2xl font-bold">{teamPerfData.summary?.totalAssignments || 0}</p>
                  <p className="text-[10px] text-emerald-600">{teamPerfData.summary?.totalCompleted || 0} completed</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Production</p>
                  <p className="text-2xl font-bold">{teamPerfData.summary?.avgTeamProductionTime || 0}<span className="text-sm text-muted-foreground"> min</span></p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Packing</p>
                  <p className="text-2xl font-bold">{teamPerfData.summary?.avgTeamPackingTime || 0}<span className="text-sm text-muted-foreground"> min</span></p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Wastage</p>
                  <p className="text-2xl font-bold text-red-600">{teamPerfData.summary?.totalWastage || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{fmt(teamPerfData.summary?.totalWastageValue || 0)} value</p>
                </CardContent></Card>
              </div>

              {/* Top Performer */}
              {teamPerfData.summary?.topPerformer && teamPerfData.summary.topPerformer !== 'N/A' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="text-sm"><strong>{teamPerfData.summary.topPerformer}</strong> — Top performer by efficiency score</span>
                </div>
              )}

              {/* Employee Detail Table */}
              {teamPerfData.employees?.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Employee Performance Details</CardTitle>
                    <CardDescription className="text-xs">Metrics from KDS assignments within the selected date range</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 px-2 font-medium">Employee</th>
                            <th className="text-center py-2 px-1 font-medium">Efficiency</th>
                            <th className="text-center py-2 px-1 font-medium">Assigned</th>
                            <th className="text-center py-2 px-1 font-medium">Completed</th>
                            <th className="text-center py-2 px-1 font-medium">Rate</th>
                            <th className="text-center py-2 px-1 font-medium">Avg Prod</th>
                            <th className="text-center py-2 px-1 font-medium">Avg Pack</th>
                            <th className="text-center py-2 px-1 font-medium">Avg Total</th>
                            <th className="text-center py-2 px-1 font-medium">Fastest</th>
                            <th className="text-center py-2 px-1 font-medium">Wastage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamPerfData.employees.map((emp, i) => (
                            <tr key={emp.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-2">
                                  {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                                  <div>
                                    <p className="font-medium">{emp.employeeName}</p>
                                    <p className="text-[10px] text-muted-foreground">{emp.role}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-center py-2.5 px-1">
                                <Badge variant={emp.efficiencyScore >= 70 ? 'default' : emp.efficiencyScore >= 40 ? 'secondary' : 'outline'}
                                  className="text-[10px] font-mono">
                                  {emp.efficiencyScore}
                                </Badge>
                              </td>
                              <td className="text-center py-2.5 px-1 font-mono">{emp.totalAssigned}</td>
                              <td className="text-center py-2.5 px-1 font-mono text-emerald-600">{emp.completed}</td>
                              <td className="text-center py-2.5 px-1">
                                <span className={emp.completionRate >= 80 ? 'text-emerald-600' : emp.completionRate >= 50 ? 'text-amber-600' : 'text-red-500'}>
                                  {emp.completionRate}%
                                </span>
                              </td>
                              <td className="text-center py-2.5 px-1 font-mono">{emp.avgProductionTime || '—'}<span className="text-muted-foreground">m</span></td>
                              <td className="text-center py-2.5 px-1 font-mono">{emp.avgPackingTime || '—'}<span className="text-muted-foreground">m</span></td>
                              <td className="text-center py-2.5 px-1 font-mono font-semibold">{emp.avgTotalTime || '—'}<span className="text-muted-foreground">m</span></td>
                              <td className="text-center py-2.5 px-1 font-mono text-blue-600">{emp.fastestTime || '—'}<span className="text-muted-foreground">m</span></td>
                              <td className="text-center py-2.5 px-1">
                                {emp.wastageCount > 0 ? (
                                  <span className="text-red-500 font-medium">{emp.wastageCount} ({emp.wastageRate}%)</span>
                                ) : (
                                  <span className="text-emerald-600">0</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Efficiency Chart */}
              {teamPerfData.employees?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Efficiency Score Comparison</CardTitle>
                    <CardDescription className="text-xs">Composite score based on completion rate, speed, volume, and wastage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={teamPerfData.employees} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis dataKey="employeeName" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload?.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-card border rounded-lg shadow-lg p-3 text-xs space-y-1">
                                <p className="font-semibold">{d.employeeName}</p>
                                <p>Efficiency: <strong>{d.efficiencyScore}</strong>/100</p>
                                <p>Completed: {d.completed}/{d.totalAssigned}</p>
                                <p>Avg Time: {d.avgTotalTime}min</p>
                                <p>Wastage: {d.wastageCount} ({d.wastageRate}%)</p>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Bar dataKey="efficiencyScore" radius={[0, 4, 4, 0]}>
                          {(teamPerfData.employees || []).map((entry, i) => (
                            <Cell key={i} fill={entry.efficiencyScore >= 70 ? '#10b981' : entry.efficiencyScore >= 40 ? '#f59e0b' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {teamPerfData.employees?.length === 0 && (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No KDS data in this date range</p>
                  <p className="text-sm mt-1">Assign orders to employees in KDS to see performance metrics here.</p>
                </CardContent></Card>
              )}
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Click to load team performance data</p>
              <p className="text-sm mt-1">Select a date range above and this tab will load detailed KDS metrics.</p>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Marketing Ledger - existing */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marketing Ledger</CardTitle>
              <CardDescription>Daily ad spend synced from Meta Ads</CardDescription>
            </CardHeader>
            <CardContent>
              {ledgerData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="font-medium">No ad spend data yet</p>
                  <p className="text-sm mt-1">Sync from Meta Ads in the Integrations panel to populate this ledger.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Raw Spend</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Tax</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total Billed</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Currency</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Source</th>
                      </tr></thead>
                      <tbody>
                        {ledgerData.slice((ledgerPage - 1) * LEDGER_PAGE_SIZE, ledgerPage * LEDGER_PAGE_SIZE).map((row, i) => {
                          const rawSpendINR = row.spendAmount || 0;
                          const taxMultiplier = 1 + (adSpendTaxRate / 100);
                          const totalBilled = rawSpendINR * taxMultiplier;
                          const taxAmount = totalBilled - rawSpendINR;
                          return (
                            <tr key={row._id || i} className="border-b hover:bg-muted/30">
                              <td className="py-2.5 px-4 text-sm font-medium">{(() => { try { return new Date(row.date + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return row.date; } })()}</td>
                              <td className="py-2.5 px-4 text-sm text-right font-medium">{fmt(Math.round(rawSpendINR))}</td>
                              <td className="py-2.5 px-4 text-sm text-right text-amber-600">+{fmt(Math.round(taxAmount))} <span className="text-[10px] text-muted-foreground">({adSpendTaxRate}%)</span></td>
                              <td className="py-2.5 px-4 text-sm text-right font-bold text-primary">{fmt(Math.round(totalBilled))}</td>
                              <td className="py-2.5 px-4 text-xs"><Badge variant="outline">{row.currency || 'INR'}</Badge></td>
                              <td className="py-2.5 px-4 text-xs text-muted-foreground">{row.source || 'meta_ads'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {ledgerData.length > LEDGER_PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">Page {ledgerPage} of {Math.ceil(ledgerData.length / LEDGER_PAGE_SIZE)}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={ledgerPage <= 1} onClick={() => setLedgerPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={ledgerPage >= Math.ceil(ledgerData.length / LEDGER_PAGE_SIZE)} onClick={() => setLedgerPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments & Settlements */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {paymentsLoading ? <Skeleton className="h-80 rounded-xl" /> : (
            <>
              {/* Reconciliation Summary Cards */}
              {paymentsData.reconciliation && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Match Rate</p>
                    <p className="text-2xl font-bold">{paymentsData.reconciliation.matchRate}%</p>
                    <p className="text-[11px] text-muted-foreground">{paymentsData.reconciliation.reconciledCount} / {paymentsData.reconciliation.totalOrders} orders</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Gateway Fees</p>
                    <p className="text-2xl font-bold">{fmt(paymentsData.reconciliation.totalFees)}</p>
                    <p className="text-[11px] text-muted-foreground">from reconciled orders</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gateway Tax</p>
                    <p className="text-2xl font-bold">{fmt(paymentsData.reconciliation.totalTax)}</p>
                    <p className="text-[11px] text-muted-foreground">GST on fees</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Effective Fee Rate</p>
                    <p className="text-2xl font-bold">{paymentsData.reconciliation.effectiveFeeRate}%</p>
                    <p className="text-[11px] text-muted-foreground">fees / revenue</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unmatched Payments</p>
                    <p className={`text-2xl font-bold ${paymentsData.reconciliation.unmatchedPayments > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {paymentsData.reconciliation.unmatchedPayments}
                    </p>
                    <p className="text-[11px] text-muted-foreground">need attention</p>
                  </Card>
                </div>
              )}

              {/* Reconciliation Progress Bar */}
              {paymentsData.reconciliation && paymentsData.reconciliation.totalOrders > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Reconciliation Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="h-4 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${paymentsData.reconciliation.matchRate}%` }} />
                        <div className="h-full bg-amber-400 transition-all" style={{ width: `${100 - paymentsData.reconciliation.matchRate}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                          <span>Matched: {fmt(paymentsData.reconciliation.reconciledRevenue)} ({paymentsData.reconciliation.reconciledCount} orders)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-amber-400" />
                          <span>Unmatched: {fmt(paymentsData.reconciliation.unreconciledRevenue)} ({paymentsData.reconciliation.unreconciledCount} orders)</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Estimated Balance & Accuracy */}
              {paymentsData.settlementsActive && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Settlement Estimates */}
                  {paymentsData.estimated && (paymentsData.estimated.availableNet > 0 || paymentsData.estimated.todaySettlement > 0) ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" /> Settlement Estimates
                          <Badge variant="outline" className="text-[10px] ml-1">Calculated</Badge>
                        </CardTitle>
                        <CardDescription>Computed from unsettled order data (last {paymentsData.estimated.lookbackDays} days)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Available Balance */}
                          {paymentsData.estimated.availableNet > 0 && (
                            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Available Balance</p>
                              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{fmt(paymentsData.estimated.availableNet)}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {paymentsData.estimated.availableOrderCount} unsettled orders · Gross {fmt(paymentsData.estimated.availableBalance)} − Fees {fmt(paymentsData.estimated.availableFees + paymentsData.estimated.availableTax)}
                              </p>
                            </div>
                          )}
                          {/* Today's Settlement */}
                          {paymentsData.estimated.todaySettlement > 0 && (
                            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Today's Expected Settlement</p>
                              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{fmt(paymentsData.estimated.todaySettlement)}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Expected before 9 PM IST · {paymentsData.estimated.todayOrderCount} orders
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Payments from {paymentsData.estimated.todaySettlementWindow}
                              </p>
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground italic">
                            Estimated from order data. Final amounts may vary due to refunds, chargebacks, and Razorpay adjustments. Re-sync for better accuracy.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" /> Settlement Estimates
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center py-6 text-muted-foreground">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No unsettled orders detected</p>
                          <p className="text-xs mt-1">All recent reconciled orders appear to be settled.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Accuracy History */}
                  {paymentsData.accuracy && paymentsData.accuracy.samples > 0 ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500" /> Estimation Accuracy
                        </CardTitle>
                        <CardDescription>How close our estimates are to actual settlements</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                              <p className="text-[10px] text-muted-foreground">Average Accuracy</p>
                              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{paymentsData.accuracy.avgAccuracy}%</p>
                              <p className="text-[10px] text-muted-foreground">{paymentsData.accuracy.samples} samples</p>
                            </div>
                            {paymentsData.accuracy.recentAccuracy && (
                              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                <p className="text-[10px] text-muted-foreground">Recent (Last 5)</p>
                                <p className="text-2xl font-bold">{paymentsData.accuracy.recentAccuracy}%</p>
                                <p className="text-[10px] text-muted-foreground">last 5 settlements</p>
                              </div>
                            )}
                          </div>
                          {paymentsData.accuracy.history && paymentsData.accuracy.history.length > 0 && (
                            <div className="overflow-x-auto rounded border">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="bg-muted/50 border-b">
                                    <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground">Date</th>
                                    <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground text-right">Estimated</th>
                                    <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground text-right">Actual</th>
                                    <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground text-right">Accuracy</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paymentsData.accuracy.history.map((h, i) => (
                                    <tr key={i} className="border-b last:border-b-0">
                                      <td className="py-2 px-3 text-xs">{h.date}</td>
                                      <td className="py-2 px-3 text-xs text-right">{fmt(h.estimated)}</td>
                                      <td className="py-2 px-3 text-xs text-right font-medium">{fmt(h.actual)}</td>
                                      <td className="py-2 px-3 text-xs text-right">
                                        <Badge variant={h.accuracy >= 95 ? 'default' : h.accuracy >= 85 ? 'secondary' : 'outline'} className="text-[10px]">
                                          {h.accuracy}%
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-muted-foreground" /> Estimation Accuracy
                        </CardTitle>
                        <CardDescription>Tracks how close estimates are to actual settlements</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center py-6 text-muted-foreground">
                          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No accuracy data yet</p>
                          <p className="text-xs mt-1">Accuracy tracking starts once estimates are matched with actual settlements over time.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Settlement History */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><Landmark className="w-4 h-4" /> Settlement History</CardTitle>
                    <Badge variant="outline">{paymentsData.settlements.length} settlements</Badge>
                  </div>
                  <CardDescription>Complete history of Razorpay bank deposits with dates, UTR, and fees</CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentsData.settlements.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No settlements found. Connect Razorpay in Integrations.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Date</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Settlement ID</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">UTR</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-right">Amount</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-right">Fees</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-right">Tax</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentsData.settlements
                              .slice((settlementPage - 1) * SETTLEMENT_PAGE_SIZE, settlementPage * SETTLEMENT_PAGE_SIZE)
                              .map((s, i) => (
                              <tr key={s.id || i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                <td className="py-2.5 px-3 text-xs">
                                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                  <span className="block text-[10px] text-muted-foreground">
                                    {s.createdAt ? new Date(s.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] font-mono text-muted-foreground">{s.id ? s.id.slice(-12) : '—'}</td>
                                <td className="py-2.5 px-3 text-[11px] font-mono text-muted-foreground">{s.utr || '—'}</td>
                                <td className="py-2.5 px-3 text-sm font-bold text-right">{fmt(s.amount)}</td>
                                <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{s.fees ? fmt(s.fees) : '—'}</td>
                                <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{s.tax ? fmt(s.tax) : '—'}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <Badge variant={s.status === 'processed' ? 'default' : s.status === 'failed' ? 'destructive' : 'outline'} className="text-[10px]">
                                    {s.status === 'processed' ? 'Settled' : s.status === 'created' ? 'Pending' : s.status === 'initiated' ? 'Initiated' : s.status || 'Unknown'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {paymentsData.settlements.length > SETTLEMENT_PAGE_SIZE && (
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-muted-foreground">Page {settlementPage} of {Math.ceil(paymentsData.settlements.length / SETTLEMENT_PAGE_SIZE)}</span>
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" className="h-8 w-8" disabled={settlementPage <= 1} onClick={() => setSettlementPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                            <Button size="icon" variant="outline" className="h-8 w-8" disabled={settlementPage >= Math.ceil(paymentsData.settlements.length / SETTLEMENT_PAGE_SIZE)} onClick={() => setSettlementPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      )}
                      {/* Summary row */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-muted-foreground">
                          Total settled: {paymentsData.settlements.filter(s => s.status === 'processed').length} deposits
                        </span>
                        <span className="text-sm font-bold">
                          {fmt(paymentsData.settlements.filter(s => s.status === 'processed').reduce((sum, s) => sum + (s.amount || 0), 0))}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Unmatched Payments */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Unmatched Payments
                      </CardTitle>
                      <CardDescription>Razorpay payments that didn't match any Shopify order. Review and resolve.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-md border overflow-hidden">
                        {[
                          { value: 'unresolved', label: 'Unresolved' },
                          { value: 'ignored', label: 'Ignored' },
                          { value: 'all', label: 'All' },
                        ].map(f => (
                          <button key={f.value}
                            onClick={() => setUnmatchedFilter(f.value)}
                            className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${unmatchedFilter === f.value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted text-muted-foreground'}`}
                          >{f.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredUnmatched.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
                      <p className="text-sm">
                        {unmatchedFilter === 'unresolved' ? 'No unresolved payments — all clear!' : `No ${unmatchedFilter} payments found.`}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Bulk actions */}
                      {unmatchedFilter === 'unresolved' && filteredUnmatched.length > 0 && (
                        <div className="flex items-center justify-between mb-3 p-2.5 rounded-lg bg-muted/50 border">
                          <span className="text-xs text-muted-foreground">{filteredUnmatched.filter(p => p.status === 'unresolved').length} unresolved payments</span>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkResolve('ignored')}>
                            <EyeOff className="w-3 h-3 mr-1" /> Ignore All
                          </Button>
                        </div>
                      )}
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Date</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Payment ID</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-right">Amount</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Method</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground">Contact</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-right">Fee</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-center">Status</th>
                              <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUnmatched.map((p, i) => (
                              <tr key={p._id || i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                <td className="py-2.5 px-3 text-xs">
                                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                  <span className="block text-[10px] text-muted-foreground">
                                    {p.createdAt ? new Date(p.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] font-mono text-muted-foreground">{(p.paymentId || p._id || '').slice(-14)}</td>
                                <td className="py-2.5 px-3 text-sm font-bold text-right">{fmt(p.amount)}</td>
                                <td className="py-2.5 px-3 text-xs capitalize">{p.method || '—'}</td>
                                <td className="py-2.5 px-3 text-[11px]">
                                  {p.email ? <span className="block truncate max-w-[140px]" title={p.email}>{p.email}</span> : null}
                                  {p.contact ? <span className="block text-[10px] text-muted-foreground">{p.contact}</span> : null}
                                </td>
                                <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{p.fee ? fmt(p.fee) : '—'}</td>
                                <td className="py-2.5 px-3 text-center">
                                  {p.status === 'unresolved' ? (
                                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-300">Unresolved</Badge>
                                  ) : p.status === 'ignored' ? (
                                    <Badge variant="secondary" className="text-[10px]">Ignored</Badge>
                                  ) : (
                                    <Badge className="text-[10px]">{p.status}</Badge>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {p.status === 'unresolved' ? (
                                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => resolvePayment(p._id, 'ignored')}>
                                      <EyeOff className="w-3 h-3 mr-1" /> Ignore
                                    </Button>
                                  ) : p.status === 'ignored' ? (
                                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => resolvePayment(p._id, 'unresolved')}>
                                      <Eye className="w-3 h-3 mr-1" /> Undo
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
