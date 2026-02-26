'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Receipt,
  Settings, Plug, ChevronLeft, ChevronRight, Menu, X,
  TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Boxes, Moon, Sun, RefreshCw, Database, BarChart3, RefreshCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardView from '@/components/DashboardView';
import OrdersView from '@/components/OrdersView';
import SkuRecipesView from '@/components/SkuRecipesView';
import InventoryView from '@/components/InventoryView';
import EmployeesView from '@/components/EmployeesView';
import ExpensesView from '@/components/ExpensesView';
import IntegrationsView from '@/components/IntegrationsView';
import SettingsView from '@/components/SettingsView';
import ReportsView from '@/components/ReportsView';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'products', label: 'SKU Recipes', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Seed data and load tenant config on mount
  useEffect(() => {
    async function init() {
      try {
        // Seed demo data
        const seedRes = await fetch('/api/seed', { method: 'POST' });
        const seedData = await seedRes.json();
        if (seedData.seeded) {
          toast.success('Demo data loaded successfully!');
        }
        // Load tenant config
        const configRes = await fetch('/api/tenant-config');
        const config = await configRes.json();
        if (config && config.tenantName) {
          setTenantConfig(config);
          if (config.themePreference === 'dark') {
            setDarkMode(true);
            document.documentElement.classList.add('dark');
          }
        }
        setDataReady(true);
      } catch (err) {
        console.error('Init error:', err);
        setDataReady(true);
      }
    }
    init();
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  }, []);

  const handleReseed = async () => {
    setSeeding(true);
    try {
      // Drop all collections first
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      toast.success(data.message || 'Data refreshed');
      window.location.reload();
    } catch (err) {
      toast.error('Failed to reseed data');
    }
    setSeeding(false);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'orders': return <OrdersView />;
      case 'products': return <SkuRecipesView />;
      case 'inventory': return <InventoryView />;
      case 'employees': return <EmployeesView />;
      case 'expenses': return <ExpensesView />;
      case 'integrations': return <IntegrationsView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  if (!dataReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-lg">Loading Profit OS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'w-64' : 'w-[70px]'}
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
          <div className={`flex items-center gap-3 overflow-hidden ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="font-bold text-sidebar-foreground text-sm truncate">
                  {tenantConfig?.tenantName || 'Profit OS'}
                </h1>
                <p className="text-[10px] text-muted-foreground">True Profit Engine</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200 min-h-[44px]
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }
                  ${!sidebarOpen && 'justify-center px-2'}
                `}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-sidebar-accent transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold">
              {NAV_ITEMS.find(i => i.id === activeView)?.label || 'Dashboard'}
            </h2>
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">
              {tenantConfig?.baseCurrency || 'INR'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} title="Toggle theme">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
