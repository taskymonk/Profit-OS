'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Receipt,
  Settings, Plug, ChevronLeft, ChevronRight, Menu, X,
  TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Boxes, Moon, Sun, BarChart3
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
  const [dataReady, setDataReady] = useState(false);

  // Hex to HSL converter for CSS variables
  const hexToHSL = useCallback((hex) => {
    if (!hex) return null;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }, []);

  // Apply primary color to CSS variables
  const applyPrimaryColor = useCallback((hex) => {
    if (!hex) return;
    const hsl = hexToHSL(hex);
    if (hsl) {
      document.documentElement.style.setProperty('--primary', hsl);
      // Generate foreground (white for dark colors, dark for light ones)
      const l = parseInt(hsl.split('%')[0].split(' ').pop());
      document.documentElement.style.setProperty('--primary-foreground', l > 55 ? '0 0% 10%' : '0 0% 100%');
    }
  }, [hexToHSL]);

  // Apply theme preference
  const applyTheme = useCallback((preference) => {
    if (preference === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (preference === 'light') {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDarkMode(prefersDark);
      if (prefersDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, []);

  // Set favicon from icon
  const setFavicon = useCallback((iconDataUrl) => {
    if (!iconDataUrl) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = iconDataUrl;
  }, []);

  // Load tenant config on mount
  useEffect(() => {
    async function init() {
      try {
        const configRes = await fetch('/api/tenant-config');
        const config = await configRes.json();
        if (config && config.tenantName) {
          setTenantConfig(config);
          if (config.primaryColor) applyPrimaryColor(config.primaryColor);
          applyTheme(config.themePreference || 'system');
          // Set favicon from icon (or logo fallback)
          if (config.icon) setFavicon(config.icon);
          else if (config.logo) setFavicon(config.logo);
        }
        setDataReady(true);
      } catch (err) {
        console.error('Init error:', err);
        setDataReady(true);
      }
    }
    init();
  }, [applyPrimaryColor, applyTheme, setFavicon]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      // Save preference to backend
      fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themePreference: next ? 'dark' : 'light' }),
      }).catch(() => {});
      return next;
    });
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'orders': return <OrdersView />;
      case 'products': return <SkuRecipesView />;
      case 'inventory': return <InventoryView />;
      case 'employees': return <EmployeesView />;
      case 'expenses': return <ExpensesView />;
      case 'reports': return <ReportsView />;
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
        {/* Logo Area */}
        <div className={`flex items-center border-b border-sidebar-border ${sidebarOpen ? 'h-16 px-4' : 'h-16 px-2 justify-center'}`}>
          {sidebarOpen ? (
            <div className="flex items-center w-full overflow-hidden h-full py-2">
              {tenantConfig?.logo ? (
                <img src={tenantConfig.logo} alt={tenantConfig?.tenantName || ''} className="max-h-full w-auto object-contain object-left"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="flex flex-col justify-center">
                  <h1 className="font-bold text-sidebar-foreground text-base truncate">{tenantConfig?.tenantName || 'Profit OS'}</h1>
                  <p className="text-[9px] text-muted-foreground tracking-wide">True Profit OS</p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              {tenantConfig?.icon ? (
                <img src={tenantConfig.icon} alt="" className="w-full h-full object-contain" />
              ) : tenantConfig?.logo ? (
                <img src={tenantConfig.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-lg font-bold text-primary">{(tenantConfig?.tenantName || 'P')[0]}</span>
              )}
            </div>
          )}
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
        <div className="p-3 border-t border-sidebar-border space-y-1">
          {sidebarOpen && (
            <p className="text-[10px] text-muted-foreground/60 text-center tracking-wide">Powered by <span className="font-semibold text-muted-foreground/80">Profit OS</span></p>
          )}
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
