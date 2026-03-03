'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp, TrendingDown, MapPin, Users, CalendarDays, AlertTriangle,
  Package, Crown, ShieldAlert, DollarSign, ChevronLeft, ChevronRight,
  Repeat, UserCheck, BarChart3, PieChart as PieChartIcon
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
];

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState('skus');
  const [datePreset, setDatePreset] = useState('Last 30 Days');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [customOpen, setCustomOpen] = useState(false);

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

  const applyPreset = (preset) => {
    setDatePreset(preset.label);
    const now = new Date();
    if (preset.value === 'allTime') {
      setStartDate('2020-01-01');
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset.value === 'thisMonth') {
      setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else {
      const d = new Date();
      d.setDate(d.getDate() - preset.days);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    }
    setCustomOpen(false);
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

  const CHART_COLORS = ['#059669', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Date Filter - Dashboard Style */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {DATE_PRESETS.map(p => (
            <Button key={p.label} size="sm" variant={datePreset === p.label ? 'default' : 'outline'} className="h-8 text-xs"
              onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant={datePreset === 'Custom' ? 'default' : 'outline'} className="h-8 text-xs">
                <CalendarDays className="w-3.5 h-3.5 mr-1" />
                {datePreset === 'Custom' ? `${startDate} – ${endDate}` : 'Custom'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <div className="flex items-center gap-2">
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDatePreset('Custom'); }} className="w-36 h-8 text-xs" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDatePreset('Custom'); }} className="w-36 h-8 text-xs" />
                <Button size="sm" className="h-8 text-xs" onClick={() => setCustomOpen(false)}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {loading && <Badge variant="outline" className="animate-pulse"><CalendarDays className="w-3 h-3 mr-1" /> Loading...</Badge>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 max-w-3xl">
          <TabsTrigger value="skus" className="gap-1 text-xs"><Crown className="w-3.5 h-3.5" /> SKU Profit</TabsTrigger>
          <TabsTrigger value="monthly-pl" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> Monthly P&L</TabsTrigger>
          <TabsTrigger value="cogs" className="gap-1 text-xs"><Package className="w-3.5 h-3.5" /> COGS</TabsTrigger>
          <TabsTrigger value="customers" className="gap-1 text-xs"><Repeat className="w-3.5 h-3.5" /> Customers</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1 text-xs"><DollarSign className="w-3.5 h-3.5" /> Expenses</TabsTrigger>
          <TabsTrigger value="rto" className="gap-1 text-xs"><MapPin className="w-3.5 h-3.5" /> RTO Map</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" /> Team</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
