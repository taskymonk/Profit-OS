'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp, TrendingDown, ShoppingCart, AlertTriangle,
  Target, IndianRupee, ChevronDown, ChevronUp, RefreshCw,
  Package, Truck, CreditCard, Megaphone, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

const fmt = (val, currency = 'INR') => {
  if (val === undefined || val === null) return '0';
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  if (currency === 'INR') return `${sign}\u20B9${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

function MetricCard({ title, value, subtitle, icon: Icon, trend, trendLabel, variant = 'default' }) {
  const colorMap = {
    profit: 'text-emerald-600 dark:text-emerald-400',
    loss: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
    default: 'text-foreground',
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
          <div className={`p-2.5 rounded-xl ${variant === 'profit' ? 'bg-emerald-100 dark:bg-emerald-900/30' : variant === 'loss' ? 'bg-red-100 dark:bg-red-900/30' : variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <Icon className={`w-5 h-5 ${variant === 'profit' ? 'text-emerald-600 dark:text-emerald-400' : variant === 'loss' ? 'text-red-600 dark:text-red-400' : variant === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`} />
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
      <tr
        className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-3 px-4 text-sm font-medium">{order.orderId || '-'}</td>
        <td className="py-3 px-4 text-sm">
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{order.sku}</span>
        </td>
        <td className="py-3 px-4">
          <Badge variant={order.status === 'Delivered' ? 'default' : order.status === 'RTO' ? 'destructive' : 'secondary'}
            className={`text-xs ${order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100' : ''}`}>
            {order.status}
          </Badge>
        </td>
        <td className="py-3 px-4 text-sm text-right">{fmt(profit.grossRevenue)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(profit.totalCOGS)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(profit.shippingCost)}</td>
        <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(Math.round(profit.marketingAllocation))}</td>
        <td className={`py-3 px-4 text-sm text-right font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {fmt(Math.round(profit.netProfit))}
        </td>
        <td className="py-3 px-4 text-center">
          {expanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={9} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><IndianRupee className="w-3 h-3" /> Revenue</div>
                <p className="font-semibold">{fmt(profit.grossRevenue)}</p>
                <p className="text-muted-foreground">Discount: {fmt(profit.discount)}</p>
                <p className="text-muted-foreground">GST: {fmt(Math.round(profit.gstOnRevenue))}</p>
                <p className="font-medium text-foreground">Net: {fmt(Math.round(profit.netRevenue))}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Package className="w-3 h-3" /> COGS</div>
                <p className="text-muted-foreground">Materials: {fmt(Math.round(profit.rawMaterialCost))}</p>
                <p className="text-muted-foreground">Packaging: {fmt(Math.round(profit.packagingCost))}</p>
                <p className="text-muted-foreground">Consumable: {fmt(profit.consumableCost)}</p>
                <p className="text-muted-foreground">Wastage: {fmt(Math.round(profit.wastageCost))}</p>
                <p className="font-medium text-foreground">Total: {fmt(Math.round(profit.totalCOGS))}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Truck className="w-3 h-3" /> Shipping</div>
                <p className="text-muted-foreground">Method: {order.shippingMethod || 'N/A'}</p>
                {profit.isRTO && <p className="text-red-500 font-medium">RTO (2x cost)</p>}
                <p className="font-medium text-foreground">{fmt(Math.round(profit.shippingCost))}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="w-3 h-3" /> Txn Fees</div>
                <p className="text-muted-foreground">Gateway (2%): {fmt(Math.round(profit.gatewayFee))}</p>
                <p className="text-muted-foreground">GST on fee: {fmt(Math.round(profit.gstOnGateway))}</p>
                <p className="font-medium text-foreground">{fmt(Math.round(profit.totalTransactionFee))}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Megaphone className="w-3 h-3" /> Marketing</div>
                <p className="font-medium text-foreground">{fmt(Math.round(profit.marketingAllocation))}</p>
                <p className="text-muted-foreground">Per order allocation</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">Net Profit</div>
                <p className={`text-xl font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmt(Math.round(profit.netProfit))}
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

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

  const { today, allTime, dailyData, recentOrders } = data;

  // Calculate 7-day trend
  const prev3DayProfit = dailyData.slice(0, 3).reduce((s, d) => s + d.netProfit, 0);
  const last3DayProfit = dailyData.slice(4, 7).reduce((s, d) => s + d.netProfit, 0);
  const profitTrend = prev3DayProfit !== 0 ? ((last3DayProfit - prev3DayProfit) / Math.abs(prev3DayProfit)) * 100 : 0;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Net Profit (Today)"
          value={fmt(today.netProfit)}
          subtitle={`Revenue: ${fmt(today.revenue)}`}
          icon={today.netProfit >= 0 ? TrendingUp : TrendingDown}
          variant={today.netProfit >= 0 ? 'profit' : 'loss'}
          trend={profitTrend}
          trendLabel="vs prev 3 days"
        />
        <MetricCard
          title="Total Orders (Today)"
          value={today.totalOrders.toString()}
          subtitle={`All time: ${allTime.totalOrders}`}
          icon={ShoppingCart}
          variant="info"
        />
        <MetricCard
          title="RTO Rate"
          value={`${today.rtoRate}%`}
          subtitle={`All time: ${allTime.rtoRate}% (${allTime.rtoCount} RTOs)`}
          icon={AlertTriangle}
          variant={today.rtoRate > 15 ? 'loss' : today.rtoRate > 5 ? 'warning' : 'profit'}
        />
        <MetricCard
          title="ROAS (Ad ROI)"
          value={today.roas > 0 ? `${today.roas}x` : 'N/A'}
          subtitle={`Ad Spend: ${fmt(today.adSpend)}`}
          icon={Target}
          variant={today.roas >= 3 ? 'profit' : today.roas >= 1 ? 'warning' : 'loss'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profit Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">7-Day Profit Trend</CardTitle>
                <CardDescription>Net profit with revenue and cost overlay</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={fetchData}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
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

        {/* Daily Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Breakdown</CardTitle>
            <CardDescription>Orders, costs & shipping</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All-Time Summary Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time Revenue</p>
              <p className="text-lg font-bold">{fmt(allTime.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time Profit</p>
              <p className={`text-lg font-bold ${allTime.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {fmt(allTime.netProfit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
              <p className="text-lg font-bold">{allTime.totalOrders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">All-Time RTO Rate</p>
              <p className={`text-lg font-bold ${allTime.rtoRate > 10 ? 'text-red-600' : 'text-foreground'}`}>
                {allTime.rtoRate}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Orders - Profit Breakdown</CardTitle>
              <CardDescription>Click any row to expand the full cost breakdown</CardDescription>
            </div>
          </div>
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
