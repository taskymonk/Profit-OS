'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import {
  TrendingUp, MapPin, Users, CalendarDays, AlertTriangle,
  Package, Crown, ShieldAlert, DollarSign, ChevronLeft, ChevronRight
} from 'lucide-react';

const fmt = (val) => `\u20B9${Math.abs(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 space-y-1">
        <p className="text-sm font-semibold">{label}</p>
        {payload.map((item, i) => (
          <p key={i} className="text-xs"><span className="text-muted-foreground">{item.name}:</span> <span className="font-medium">{typeof item.value === 'number' && item.name.includes('Rate') ? `${item.value}%` : fmt(item.value)}</span></p>
        ))}
      </div>
    );
  }
  return null;
}

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState('skus');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [skuData, setSkuData] = useState([]);
  const [rtoData, setRtoData] = useState([]);
  const [empData, setEmpData] = useState([]);
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adSpendTaxRate, setAdSpendTaxRate] = useState(18);
  const LEDGER_PAGE_SIZE = 15;

  const fetchReports = async () => {
    setLoading(true);
    try {
      const qs = `?startDate=${startDate}&endDate=${endDate}`;
      const [s, r, e, l, tc] = await Promise.all([
        fetch(`/api/reports/profitable-skus${qs}`).then(r => r.json()),
        fetch(`/api/reports/rto-locations${qs}`).then(r => r.json()),
        fetch(`/api/reports/employee-output${qs}`).then(r => r.json()),
        fetch('/api/daily-marketing-spend').then(r => r.json()),
        fetch('/api/tenant-config').then(r => r.json()),
      ]);
      setSkuData(s); setRtoData(r); setEmpData(e);
      setLedgerData(Array.isArray(l) ? l : []);
      setAdSpendTaxRate(tc?.adSpendTaxRate ?? 18);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, [startDate, endDate]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Date Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 h-9" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 h-9" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="skus" className="gap-1.5"><Crown className="w-4 h-4" /> SKU Profit</TabsTrigger>
          <TabsTrigger value="rto" className="gap-1.5"><MapPin className="w-4 h-4" /> RTO Map</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5"><Users className="w-4 h-4" /> Team</TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5"><DollarSign className="w-4 h-4" /> Ad Ledger</TabsTrigger>
        </TabsList>

        {/* SKU Profitability */}
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
                      <BarChart data={skuData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `\u20B9${(v/1000).toFixed(0)}k`} />
                        <YAxis dataKey="sku" type="category" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="totalProfit" name="Total Profit" radius={[0,4,4,0]}>
                          {skuData.map((entry, i) => (
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
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Avg Profit/Order</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Margin</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">RTO Rate</th>
                      </tr></thead>
                      <tbody>
                        {skuData.map((sku, i) => (
                          <tr key={sku.sku} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4">
                              {i === 0 ? <Crown className="w-4 h-4 text-amber-500" /> : <span className="text-sm text-muted-foreground">#{i + 1}</span>}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono">{sku.sku}</td>
                            <td className="py-3 px-4 text-sm">{sku.productName}</td>
                            <td className="py-3 px-4 text-sm text-right">{sku.totalOrders}</td>
                            <td className="py-3 px-4 text-sm text-right">{fmt(sku.totalRevenue)}</td>
                            <td className="py-3 px-4 text-sm text-right text-muted-foreground">{fmt(sku.totalCOGS)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-bold ${sku.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(sku.totalProfit)}</td>
                            <td className="py-3 px-4 text-sm text-right">{fmt(sku.avgProfitPerOrder)}</td>
                            <td className={`py-3 px-4 text-sm text-right font-medium ${sku.profitMargin >= 20 ? 'text-emerald-600' : sku.profitMargin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{sku.profitMargin}%</td>
                            <td className={`py-3 px-4 text-sm text-right ${sku.rtoRate > 15 ? 'text-red-600 font-medium' : ''}`}>{sku.rtoRate}%</td>
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

        {/* RTO Locations */}
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
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total Orders</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Delivered</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">RTO</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">RTO Rate</th>
                      </tr></thead>
                      <tbody>
                        {rtoData.map(loc => (
                          <tr key={loc.pincode} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-4 text-sm font-medium flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />{loc.city}
                            </td>
                            <td className="py-3 px-4 text-sm font-mono">{loc.pincode}</td>
                            <td className="py-3 px-4 text-sm text-right">{loc.totalOrders}</td>
                            <td className="py-3 px-4 text-sm text-right text-emerald-600">{loc.deliveredCount}</td>
                            <td className="py-3 px-4 text-sm text-right text-red-600 font-medium">{loc.rtoCount}</td>
                            <td className="py-3 px-4 text-right">
                              <Badge variant={loc.rtoRate > 30 ? 'destructive' : loc.rtoRate > 15 ? 'secondary' : 'default'}
                                className={loc.rtoRate <= 15 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : ''}>
                                {loc.rtoRate}%
                              </Badge>
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

        {/* Employee Output */}
        <TabsContent value="employees" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-80 rounded-xl" /> : (
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
                        <div>
                          <span className="text-muted-foreground">Orders Prepared</span>
                          <p className="text-lg font-bold">{emp.totalOrdersPrepared}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Daily Average</span>
                          <p className="text-lg font-bold">{emp.dailyAverage}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Delivered</span>
                          <p className="text-sm font-semibold text-emerald-600">{emp.deliveredCount}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Error Rate (RTO)</span>
                          <p className={`text-sm font-semibold ${emp.errorRate > 20 ? 'text-red-600' : emp.errorRate > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {emp.errorRate}%
                            {emp.errorRate > 20 && <ShieldAlert className="w-3.5 h-3.5 inline ml-1" />}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Employee Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={empData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="deliveredCount" name="Delivered" fill="#059669" radius={[4,4,0,0]} />
                        <Bar dataKey="rtoCount" name="RTO (Errors)" fill="#dc2626" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Marketing Ledger */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marketing Ledger</CardTitle>
              <CardDescription>Daily ad spend synced from Meta Ads. This data drives the per-order marketing deduction in the True Profit engine.</CardDescription>
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
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Raw Meta Spend</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Tax Applied</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Total Billed Amount</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Currency</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground text-right">Exchange Rate</th>
                        <th className="py-3 px-4 text-xs font-medium text-muted-foreground">Source</th>
                      </tr></thead>
                      <tbody>
                        {ledgerData
                          .slice((ledgerPage - 1) * LEDGER_PAGE_SIZE, ledgerPage * LEDGER_PAGE_SIZE)
                          .map((row, i) => {
                          const rawSpendINR = row.spendAmount || 0;
                          const taxMultiplier = 1 + (adSpendTaxRate / 100);
                          const totalBilled = rawSpendINR * taxMultiplier;
                          const taxAmount = totalBilled - rawSpendINR;
                          return (
                          <tr key={row._id || i} className="border-b hover:bg-muted/30">
                            <td className="py-2.5 px-4 text-sm font-medium">
                              {(() => {
                                try {
                                  const d = new Date(row.date + 'T00:00:00+05:30');
                                  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                } catch { return row.date; }
                              })()}
                            </td>
                            <td className="py-2.5 px-4 text-sm text-right font-medium">{fmt(Math.round(rawSpendINR))}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-amber-600 dark:text-amber-400">
                              +{fmt(Math.round(taxAmount))} <span className="text-[10px] text-muted-foreground">({adSpendTaxRate}%)</span>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-right font-bold text-primary">{fmt(Math.round(totalBilled))}</td>
                            <td className="py-2.5 px-4 text-xs"><Badge variant="outline">{row.currency || 'INR'}</Badge></td>
                            <td className="py-2.5 px-4 text-sm text-right text-muted-foreground">
                              {row.exchangeRate && row.exchangeRate !== 1 ? row.exchangeRate.toFixed(2) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground">{row.source || 'meta_ads'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30">
                          <td className="py-3 px-4 text-sm font-bold">Total ({ledgerData.length} days)</td>
                          <td className="py-3 px-4 text-sm text-right font-bold">
                            {fmt(Math.round(ledgerData.reduce((s, r) => s + (r.spendAmount || 0), 0)))}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-bold text-amber-600 dark:text-amber-400">
                            +{fmt(Math.round(ledgerData.reduce((s, r) => s + (r.spendAmount || 0), 0) * (adSpendTaxRate / 100)))}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-bold text-primary">
                            {fmt(Math.round(ledgerData.reduce((s, r) => s + (r.spendAmount || 0), 0) * (1 + adSpendTaxRate / 100)))}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {/* Ledger Pagination */}
                  {ledgerData.length > LEDGER_PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">
                        Page {ledgerPage} of {Math.ceil(ledgerData.length / LEDGER_PAGE_SIZE)}
                      </span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={ledgerPage <= 1}
                          onClick={() => setLedgerPage(p => Math.max(1, p - 1))}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8"
                          disabled={ledgerPage >= Math.ceil(ledgerData.length / LEDGER_PAGE_SIZE)}
                          onClick={() => setLedgerPage(p => p + 1)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
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
