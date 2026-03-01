'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  TrendingUp, TrendingDown, ShoppingCart, AlertTriangle,
  Target, ChevronDown, ChevronUp, RefreshCw,
  Package, Truck, CreditCard, Megaphone, ArrowUpRight, ArrowDownRight,
  CalendarDays, Zap, Building2, BarChart3, LineChart as LineChartIcon, ArrowDown, ArrowRight, RotateCcw,
  Landmark, Wallet, Banknote, Clock
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line
} from 'recharts';

const fmt = (val, currency = 'INR') => {
  if (val === undefined || val === null) return '₹0.00';
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (currency === 'INR') return `${sign}\u20B9${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'alltime', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

function MetricCard({ title, value, subtitle, icon: Icon, trend, trendLabel, variant = 'default' }) {
  const colorMap = {
    profit: 'text-emerald-600 dark:text-emerald-400',
    loss: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
    default: 'text-foreground',
  };
  const bgMap = {
    profit: 'bg-emerald-100 dark:bg-emerald-900/30',
    loss: 'bg-red-100 dark:bg-red-900/30',
    warning: 'bg-amber-100 dark:bg-amber-900/30',
    info: 'bg-blue-100 dark:bg-blue-900/30',
    default: 'bg-muted',
  };
  const iconColorMap = {
    profit: 'text-emerald-600 dark:text-emerald-400',
    loss: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
    default: 'text-muted-foreground',
  };
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`text-2xl lg:text-3xl font-bold tracking-tight ${colorMap[variant]}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${bgMap[variant]}`}>
            <Icon className={`w-5 h-5 ${iconColorMap[variant]}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-3">
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
            <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {Math.abs(trend).toFixed(1)}%
            </span>
            {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {payload.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name}:</span>
            <span className="font-medium text-foreground">{fmt(item.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function OrderRow({ order, expanded, onToggle }) {
  const profit = order._profitData || order;
  const isProfit = profit.netProfit >= 0;
  return (
    <>
      <tr className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-3 px-4 text-sm font-medium">
          <div className="flex items-center gap-2">
            {order.orderId || '-'}
            {order.isUrgent && <Badge variant="destructive" className="text-[10px] px-1 py-0"><Zap className="w-2.5 h-2.5 mr-0.5 inline" />Urgent</Badge>}
          </div>
        </td>
        <td className="py-3 px-4 text-sm"><span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{order.sku}</span></td>
        <td className="py-3 px-4">
          <Badge variant={order.status === 'Delivered' ? 'default' : order.status === 'RTO' ? 'destructive' : 'secondary'}
            className={order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100' : ''}>
            {order.status}
          </Badge>
        </td>
        <td className="py-3 px-4 text-sm text-right">{fmt(profit.grossRevenue)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(profit.totalCOGS)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(profit.shippingCost)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(profit.marketingAllocation)}</td>
        <td className={`py-3 px-4 text-sm text-right font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {fmt(profit.netProfit)}
        </td>
        <td className="py-3 px-4 text-center">
          {expanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={9} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">Revenue</div>
                <p className="font-semibold">{fmt(profit.grossRevenue)}</p>
                <p className="text-muted-foreground">Discount: {fmt(profit.discount)}</p>
                <p className="text-muted-foreground">GST: {fmt(profit.gstOnRevenue)}</p>
                <p className="font-medium text-foreground">Net: {fmt(profit.netRevenue)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Package className="w-3 h-3" /> COGS</div>
                <p className="text-muted-foreground">Materials: {fmt(profit.rawMaterialCost)}</p>
                <p className="text-muted-foreground">Packaging: {fmt(profit.packagingCost)}</p>
                <p className="text-muted-foreground">Consumable: {fmt(profit.consumableCost)}</p>
                <p className="text-muted-foreground">Wastage: {fmt(profit.wastageCost)}</p>
                <p className="font-medium text-foreground">Total: {fmt(profit.totalCOGS)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Truck className="w-3 h-3" /> Shipping</div>
                <p className="text-muted-foreground">Method: {order.isUrgent ? order.manualCourierName || 'Urgent' : order.shippingMethod || 'N/A'}</p>
                {profit.isRTO && <p className="text-red-500 font-medium">RTO (2x cost)</p>}
                {order.isUrgent && <Badge variant="outline" className="text-[10px]"><Zap className="w-2.5 h-2.5 mr-0.5 inline" />Urgent Override</Badge>}
                <p className="font-medium text-foreground">{fmt(profit.shippingCost)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="w-3 h-3" /> Txn Fees</div>
                <p className="text-muted-foreground">Gateway (2%): {fmt(profit.gatewayFee)}</p>
                <p className="text-muted-foreground">GST: {fmt(profit.gstOnGateway)}</p>
                <p className="font-medium text-foreground">{fmt(profit.totalTransactionFee)}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Megaphone className="w-3 h-3" /> Marketing</div>
                <p className="font-medium text-foreground">{fmt(profit.marketingAllocation)}</p>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Prepared By</div>
                <p className="font-medium">{order.preparedByName || 'Unassigned'}</p>
                {order.destinationCity && <p className="text-muted-foreground">{order.destinationCity} ({order.destinationPincode})</p>}
              </div>
              <div className="space-y-1">
                <div className="font-semibold">Net Profit</div>
                <p className={`text-xl font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmt(profit.netProfit)}
                </p>
                <p className={`text-sm ${profit.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {profit.profitMargin.toFixed(1)}% margin
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [dateRange, setDateRange] = useState('7days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [pendingRange, setPendingRange] = useState({ from: undefined, to: undefined });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/dashboard?range=${dateRange}`;
      if (dateRange === 'custom' && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    // For custom range, only fetch when BOTH from and to dates are fully selected
    if (dateRange === 'custom' && (!customStart || !customEnd)) return;
    fetchData();
  }, [dateRange, customStart, customEnd]);

  // Settlements state (fetched separately — hook must be before any early return)
  const [settlements, setSettlements] = useState(null);
  useEffect(() => {
    async function fetchSettlements() {
      try {
        const res = await fetch('/api/razorpay/settlements');
        const sData = await res.json();
        if (sData && !sData.error) setSettlements(sData);
      } catch (err) { /* silently ignore if Razorpay not configured */ }
    }
    fetchSettlements();
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const { filtered, allTime, dailyData, recentOrders, exchangeRate, overhead, plBreakdown, dateRange: activeDateRange, revenueSplit } = data;

  // Trend calc
  const mid = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, mid).reduce((s, d) => s + d.netProfit, 0);
  const secondHalf = dailyData.slice(mid).reduce((s, d) => s + d.netProfit, 0);
  const profitTrend = firstHalf !== 0 ? ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100 : 0;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Date Range Picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {DATE_RANGES.map(r => (
            <Button key={r.value} size="sm" variant={dateRange === r.value ? 'default' : 'outline'}
              onClick={() => setDateRange(r.value)} className="min-h-[36px]">
              {r.label}
            </Button>
          ))}
          {/* Show active date range for all presets */}
          {activeDateRange && activeDateRange.start && activeDateRange.end && dateRange !== 'alltime' && (
            <span className="text-sm font-medium text-muted-foreground ml-2 bg-muted px-3 py-1.5 rounded-md border border-border">
              {format(new Date(activeDateRange.start + 'T00:00:00'), 'dd MMM yyyy')}
              {activeDateRange.start !== activeDateRange.end && (
                <> — {format(new Date(activeDateRange.end + 'T00:00:00'), 'dd MMM yyyy')}</>
              )}
            </span>
          )}
        </div>
        {dateRange === 'custom' && (
          <Popover open={calendarOpen} onOpenChange={(open) => {
            // Only allow OPENING via this handler, never auto-close
            // Closing is handled explicitly by Apply/Cancel buttons
            if (open) setCalendarOpen(true);
          }}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 px-3 gap-2 text-sm font-normal" onClick={() => setCalendarOpen(true)}>
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                {customStart && customEnd
                  ? `${format(new Date(customStart + 'T00:00:00'), 'dd MMM yyyy')} — ${format(new Date(customEnd + 'T00:00:00'), 'dd MMM yyyy')}`
                  : 'Pick date range'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" sideOffset={8} onInteractOutside={(e) => {
              // Prevent popover from closing on outside clicks while selecting
              // User must use Cancel or Apply buttons
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
                    setCustomStart(format(pendingRange.from, 'yyyy-MM-dd'));
                    setCustomEnd(format(pendingRange.to, 'yyyy-MM-dd'));
                    setPendingRange({ from: undefined, to: undefined });
                    setCalendarOpen(false);
                  }}>Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>USD/INR: {exchangeRate?.toFixed(2)}</span>
          <Button variant="ghost" size="icon" onClick={fetchData} className="h-7 w-7"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Net Profit"
          value={fmt(filtered.netProfit)}
          subtitle={overhead && overhead.proratedAmount > 0 ? `After ${fmt(overhead.proratedAmount)} overhead` : `Revenue: ${fmt(filtered.revenue)}`}
          icon={filtered.netProfit >= 0 ? TrendingUp : TrendingDown}
          variant={filtered.netProfit >= 0 ? 'profit' : 'loss'}
          trend={profitTrend}
          trendLabel="trend"
        />
        <MetricCard
          title="Total Orders"
          value={filtered.totalOrders.toString()}
          subtitle={`All time: ${allTime.totalOrders}`}
          icon={ShoppingCart}
          variant="info"
        />
        <MetricCard
          title="RTO Rate"
          value={`${filtered.rtoRate}%`}
          subtitle={`${filtered.rtoCount} RTOs of ${filtered.totalOrders} orders`}
          icon={AlertTriangle}
          variant={filtered.rtoRate > 15 ? 'loss' : filtered.rtoRate > 5 ? 'warning' : 'profit'}
        />
        <MetricCard
          title="ROAS (Ad ROI)"
          value={filtered.roas > 0 ? `${filtered.roas}x` : 'N/A'}
          subtitle={`Ad Spend: ${fmt(filtered.adSpend)}`}
          icon={Target}
          variant={filtered.roas >= 3 ? 'profit' : filtered.roas >= 1 ? 'warning' : 'loss'}
        />
      </div>

      {/* COD vs Prepaid Split + Cashflow Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COD vs Prepaid Revenue Split */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Revenue Split — Prepaid vs COD</CardTitle>
                <CardDescription>Cash locked in logistics vs. digitally settled</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {revenueSplit && revenueSplit.totalRevenue > 0 ? (
              <div className="space-y-4">
                {/* Split Progress Bar */}
                <div className="relative h-6 rounded-full overflow-hidden bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-l-full transition-all duration-500"
                    style={{ width: `${revenueSplit.prepaid.percent}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 bg-gradient-to-r from-amber-400 to-amber-500 rounded-r-full transition-all duration-500"
                    style={{ width: `${revenueSplit.cod.percent}%` }}
                  />
                  {revenueSplit.prepaid.percent > 15 && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white">{revenueSplit.prepaid.percent}%</span>
                  )}
                  {revenueSplit.cod.percent > 15 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white">{revenueSplit.cod.percent}%</span>
                  )}
                </div>
                {/* Labels */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50">
                    <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Prepaid ({revenueSplit.prepaid.count} orders)</p>
                      <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{fmt(revenueSplit.prepaid.revenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                    <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/50">
                      <Banknote className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">COD ({revenueSplit.cod.count} orders)</p>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{fmt(revenueSplit.cod.revenue)}</p>
                    </div>
                  </div>
                </div>
                {revenueSplit.unknown.count > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    {revenueSplit.unknown.count} orders ({fmt(revenueSplit.unknown.revenue)}) not yet classified — sync Razorpay to classify
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No revenue data for selected period</p>
                <p className="text-xs mt-1">Sync Razorpay in Integrations to see the Prepaid / COD split</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cashflow Forecast — Bank Settlements */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Cashflow Forecast</CardTitle>
                <CardDescription>Upcoming Razorpay bank settlements</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {settlements?.active && settlements.settlements?.length > 0 ? (
              <div className="space-y-3">
                {/* Next Settlement (first one) */}
                {(() => {
                  const next = settlements.settlements[0];
                  return (
                    <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                            {next.status === 'processed' ? 'Latest Settlement' : 'Next Settlement'}
                          </p>
                          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{fmt(next.amount)}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={next.status === 'processed' ? 'default' : 'outline'} className="text-[10px]">
                            {next.status === 'processed' ? 'Settled' : next.status === 'created' ? 'Pending' : next.status}
                          </Badge>
                          {next.createdAt && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {new Date(next.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      {next.utr && <p className="text-[10px] text-muted-foreground mt-2">UTR: {next.utr}</p>}
                    </div>
                  );
                })()}
                {/* Upcoming settlements list */}
                {settlements.settlements.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Recent Settlements</p>
                    {settlements.settlements.slice(1, 4).map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">
                            {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'}
                          </span>
                          <Badge variant={s.status === 'processed' ? 'default' : 'secondary'} className="text-[9px] h-4">
                            {s.status}
                          </Badge>
                        </div>
                        <span className="text-sm font-semibold">{fmt(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {settlements.settlements.length > 4 && (
                  <p className="text-[11px] text-center text-muted-foreground">
                    +{settlements.settlements.length - 4} more settlements
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Landmark className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No pending bank settlements</p>
                <p className="text-xs mt-1">
                  {settlements?.active
                    ? 'All settlements have been processed.'
                    : 'Connect Razorpay in Integrations to track bank settlements'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Profit Trend</CardTitle>
            <CardDescription>Net profit with revenue overlay</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={v => `\u20B9${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#059669" fill="url(#profitGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Cost Breakdown</CardTitle>
                <CardDescription>COGS, Shipping & Ads per day</CardDescription>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <Button size="sm" variant={chartType === 'bar' ? 'default' : 'ghost'}
                  className="h-7 px-2.5 text-xs gap-1" onClick={() => setChartType('bar')}>
                  <BarChart3 className="w-3.5 h-3.5" /> Bar
                </Button>
                <Button size="sm" variant={chartType === 'line' ? 'default' : 'ghost'}
                  className="h-7 px-2.5 text-xs gap-1" onClick={() => setChartType('line')}>
                  <LineChartIcon className="w-3.5 h-3.5" /> Line
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={v => `\u20B9${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[2,2,0,0]} />
                    <Bar dataKey="shipping" name="Shipping" fill="#8b5cf6" radius={[2,2,0,0]} />
                    <Bar dataKey="adSpend" name="Ads" fill="#ec4899" radius={[2,2,0,0]} />
                  </BarChart>
                ) : (
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={v => `\u20B9${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="cogs" name="COGS" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="shipping" name="Shipping" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="adSpend" name="Ads" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Breakdown — P&L Waterfall */}
      {plBreakdown && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Financial Breakdown</CardTitle>
            <CardDescription>P&L waterfall from Gross Revenue to Net Profit for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {/* Gross Revenue */}
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold">Gross Revenue</span>
                </div>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmt(plBreakdown.grossRevenue)}</span>
              </div>
              {/* Deductions */}
              {[
                { label: 'Discounts', value: plBreakdown.discount, color: 'text-orange-500' },
                { label: 'Refunds', value: plBreakdown.refunds || 0, color: 'text-red-500' },
                { label: 'GST on Revenue (18%)', value: plBreakdown.gstOnRevenue, color: 'text-amber-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 pl-6 border-b border-dashed border-border/60">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className={`text-sm font-medium ${item.color}`}>-{fmt(item.value)}</span>
                </div>
              ))}
              {/* Net Revenue */}
              <div className="flex items-center justify-between py-2.5 border-b border-border bg-muted/30 px-3 rounded-md my-1">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold">Net Revenue</span>
                </div>
                <span className="text-sm font-bold">{fmt(plBreakdown.netRevenue)}</span>
              </div>
              {/* Operating Costs */}
              {[
                { label: 'Cost of Goods Sold (COGS)', value: plBreakdown.totalCOGS, color: 'text-amber-600', icon: Package },
                { label: 'Shipping & Logistics', value: plBreakdown.totalShipping, color: 'text-violet-500', icon: Truck },
                { label: 'Transaction Fees', value: plBreakdown.totalTxnFees, color: 'text-slate-500', icon: CreditCard },
                { label: 'Ad Spend (incl. Tax)', value: plBreakdown.adSpend, color: 'text-pink-500', icon: Megaphone },
                { label: 'Pro-Rata Overhead', value: plBreakdown.overhead, color: 'text-amber-700', icon: Building2 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 pl-6 border-b border-dashed border-border/60">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className={`text-sm font-medium ${item.color}`}>-{fmt(item.value)}</span>
                </div>
              ))}
              {/* Net Profit */}
              <div className={`flex items-center justify-between py-3 px-3 rounded-lg mt-2 ${plBreakdown.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50'}`}>
                <div className="flex items-center gap-2">
                  {plBreakdown.netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                  <span className="text-sm font-bold">True Net Profit</span>
                </div>
                <span className={`text-lg font-bold ${plBreakdown.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmt(plBreakdown.netProfit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pro-Rata Overhead Deduction */}
      {overhead && overhead.proratedAmount > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Pro-Rata Overhead Deduction</p>
                  <p className="text-xs text-muted-foreground">
                    Monthly expenses spread across {overhead.daysInRange} days ({fmt(overhead.monthlyTotal)}/mo)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                {(overhead.breakdown || []).map((item, i) => (
                  <div key={i} className="text-right">
                    <p className="text-[11px] text-muted-foreground">{item.name}</p>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">-{fmt(item.prorated)}</p>
                  </div>
                ))}
                <div className="text-right pl-3 border-l border-amber-200 dark:border-amber-800">
                  <p className="text-[11px] text-muted-foreground">Total Deduction</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-300">-{fmt(overhead.proratedAmount)}</p>
                </div>
                {overhead.perOrder > 0 && (
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Per Order</p>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">-{fmt(overhead.perOrder)}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All-Time Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time Revenue</p>
              <p className="text-lg font-bold">{fmt(allTime.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time Profit</p>
              <p className={`text-lg font-bold ${allTime.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(allTime.netProfit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
              <p className="text-lg font-bold">{allTime.totalOrders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time RTO Rate</p>
              <p className={`text-lg font-bold ${allTime.rtoRate > 10 ? 'text-red-600' : 'text-foreground'}`}>{allTime.rtoRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders - Profit Breakdown</CardTitle>
          <CardDescription>Click any row to expand the full cost breakdown</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Order ID</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">SKU</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">COGS</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Shipping</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Ad Cost</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Net Profit</th>
                  <th className="py-3 px-4 text-xs font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(recentOrders || []).map((order, i) => (
                  <OrderRow
                    key={order._id || i}
                    order={order}
                    expanded={expandedRow === (order._id || i)}
                    onToggle={() => setExpandedRow(expandedRow === (order._id || i) ? null : (order._id || i))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
