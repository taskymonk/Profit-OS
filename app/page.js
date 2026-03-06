'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Receipt,
  Settings, Plug, ChevronLeft, ChevronRight, Menu, X,
  TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Boxes, Moon, Sun, BarChart3, LogOut, UserCircle, Shield,
  ChevronDown, ClipboardList, MessageSquare, Banknote, PackageX, HardDrive, Code2,
  Trophy, Sparkles, UsersRound, Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import DashboardView from '@/components/DashboardView';
import OrdersView from '@/components/OrdersView';
import SkuRecipesView from '@/components/SkuRecipesView';
import InventoryView from '@/components/InventoryView';
import EmployeesView from '@/components/EmployeesView';
import ExpensesView from '@/components/ExpensesView';
import IntegrationsView from '@/components/IntegrationsView';
import SettingsView from '@/components/SettingsView';
import ReportsView from '@/components/ReportsView';
import KDSView from '@/components/KDSView';
import WhatsAppView from '@/components/WhatsAppView';
import FinanceView from '@/components/FinanceView';
import RTOView from '@/components/RTOView';
import DataManagementView from '@/components/DataManagementView';
import ApiSettingsView from '@/components/ApiSettingsView';
import GamificationView from '@/components/GamificationView';
import UserManagementView from '@/components/UserManagementView';
import ShippingCarriersView from '@/components/ShippingCarriersView';
import ProfileView from '@/components/ProfileView';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';

// Organized nav with section groups
const NAV_SECTIONS = [
  {
    label: null, // No header for main section
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'admin', alwaysShow: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'orders', label: 'Orders', icon: ShoppingCart, minRole: 'admin', alwaysShow: true },
      { id: 'rto', label: 'Returns & RTO', icon: PackageX, minRole: 'admin', toggleKey: 'rto' },
      { id: 'shipping', label: 'Shipping', icon: Truck, minRole: 'admin', alwaysShow: true },
    ],
  },
  {
    label: 'Production',
    items: [
      { id: 'kds', label: 'Kitchen Display', icon: Boxes, minRole: 'employee', toggleKey: 'kds' },
      { id: 'employees', label: 'KDS Overview', icon: ClipboardList, minRole: 'admin', toggleKey: 'employees' },
    ],
  },
  {
    label: 'Products & Stock',
    items: [
      { id: 'products', label: 'SKU Recipes', icon: Package, minRole: 'admin', alwaysShow: true },
      { id: 'inventory', label: 'Inventory', icon: Boxes, minRole: 'admin', toggleKey: 'inventory' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'expenses', label: 'Expenses', icon: Receipt, minRole: 'admin', alwaysShow: true },
      { id: 'finance', label: 'Finance', icon: Banknote, minRole: 'admin', toggleKey: 'finance' },
      { id: 'reports', label: 'Reports', icon: BarChart3, minRole: 'admin', toggleKey: 'reports' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, minRole: 'admin', toggleKey: 'whatsapp' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'gamification', label: 'Achievements', icon: Trophy, minRole: 'admin', alwaysShow: true },
      { id: 'user-management', label: 'Users', icon: UsersRound, minRole: 'master_admin', alwaysShow: true },
      { id: 'integrations', label: 'Integrations', icon: Plug, minRole: 'master_admin', alwaysShow: true },
      { id: 'data-management', label: 'Data Management', icon: HardDrive, minRole: 'master_admin', alwaysShow: true },
      { id: 'api-settings', label: 'API', icon: Code2, minRole: 'master_admin', alwaysShow: true },
      { id: 'settings', label: 'Settings', icon: Settings, minRole: 'master_admin', alwaysShow: true },
    ],
  },
];

// Flatten for backwards compatibility
const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

const ROLE_LEVEL = { master_admin: 3, admin: 2, employee: 1 };

function getRoleLabel(role) {
  switch (role) {
    case 'master_admin': return 'Master Admin';
    case 'admin': return 'Admin';
    case 'employee': return 'Employee';
    default: return role || 'User';
  }
}

function getRoleBadgeVariant(role) {
  switch (role) {
    case 'master_admin': return 'default';
    case 'admin': return 'secondary';
    default: return 'outline';
  }
}

export default function App() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [moduleSettings, setModuleSettings] = useState({});
  const [gamificationData, setGamificationData] = useState(null);

  const userRole = session?.user?.role || 'employee';
  const userLevel = ROLE_LEVEL[userRole] || 1;

  // Filter nav sections based on role and module toggles
  const filteredSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => {
      // Role check
      if (userLevel < (ROLE_LEVEL[item.minRole] || 1)) return false;
      // Module toggle check (only if toggleKey is defined and not alwaysShow)
      if (item.toggleKey && !item.alwaysShow) {
        const mod = moduleSettings[item.toggleKey];
        if (mod && mod.enabled === false) return false;
      }
      return true;
    }),
  })).filter(section => section.items.length > 0);

  // Flat list for compatibility
  const navItems = filteredSections.flatMap(s => s.items);

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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Load tenant config on mount (once authenticated)
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function init() {
      try {
        const [configRes, moduleRes, gamRes] = await Promise.all([
          fetch('/api/tenant-config'),
          fetch('/api/module-settings'),
          fetch('/api/gamification/progress'),
        ]);
        const config = await configRes.json();
        if (config && config.tenantName) {
          setTenantConfig(config);
          if (config.primaryColor) applyPrimaryColor(config.primaryColor);
          applyTheme(config.themePreference || 'system');
          if (config.icon) setFavicon(config.icon);
          else if (config.logo) setFavicon(config.logo);
        }
        try { const modData = await moduleRes.json(); setModuleSettings(modData || {}); } catch {}
        try { const gamData = await gamRes.json(); setGamificationData(gamData); } catch {}
        setDataReady(true);
      } catch (err) {
        console.error('Init error:', err);
        setDataReady(true);
      }
    }
    init();
  }, [status, applyPrimaryColor, applyTheme, setFavicon]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themePreference: next ? 'dark' : 'light' }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // Set default view based on role when session loads, restore from localStorage if available
  const [initialViewSet, setInitialViewSet] = useState(false);
  useEffect(() => {
    if (status === 'authenticated' && !initialViewSet) {
      const role = session?.user?.role || 'employee';
      const savedView = typeof window !== 'undefined' ? localStorage.getItem('profitos_activeView') : null;
      if (savedView) {
        setActiveView(savedView);
      } else if (role === 'employee') {
        setActiveView('kds');
      } else {
        setActiveView('dashboard');
      }
      setInitialViewSet(true);
    }
  }, [status, session, initialViewSet]);

  // Persist activeView to localStorage on change
  useEffect(() => {
    if (initialViewSet && typeof window !== 'undefined') {
      localStorage.setItem('profitos_activeView', activeView);
    }
  }, [activeView, initialViewSet]);

  // Ensure active view is accessible by current role
  useEffect(() => {
    if (!initialViewSet) return;
    // 'profile' is accessible via dropdown, not sidebar nav
    const nonNavViews = ['profile'];
    if (nonNavViews.includes(activeView)) return;
    const isAccessible = navItems.some(item => item.id === activeView);
    if (!isAccessible && navItems.length > 0) {
      setActiveView(navItems[0].id);
    }
  }, [userRole, activeView, navItems, initialViewSet]);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'kds': return <KDSView />;
      case 'orders': return <OrdersView />;
      case 'rto': return <RTOView />;
      case 'products': return <SkuRecipesView />;
      case 'inventory': return <InventoryView />;
      case 'employees': return <EmployeesView />;
      case 'expenses': return <ExpensesView />;
      case 'finance': return <FinanceView />;
      case 'reports': return <ReportsView />;
      case 'whatsapp': return <WhatsAppView />;
      case 'integrations': return <IntegrationsView />;
      case 'data-management': return <DataManagementView />;
      case 'api-settings': return <ApiSettingsView />;
      case 'gamification': return <GamificationView onNavigate={(view) => setActiveView(view)} />;
      case 'user-management': return <UserManagementView moduleSettings={moduleSettings} />;
      case 'shipping': return <ShippingCarriersView />;
      case 'profile': return <ProfileView />;
      case 'settings': return <SettingsView moduleSettings={moduleSettings} onModuleSettingsChange={async (updates) => {
        try {
          await fetch('/api/module-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
          const res = await fetch('/api/module-settings');
          const data = await res.json();
          setModuleSettings(data || {});
          toast.success('Module settings updated');
        } catch { toast.error('Failed to update'); }
      }} />;
      default: return <DashboardView />;
    }
  };

  // Show loading state while checking auth
  if (status === 'loading' || (status === 'authenticated' && !dataReady)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-lg">Loading Profit OS...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`
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

        {/* Nav Items - Sectioned */}
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {filteredSections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.label && sidebarOpen && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 pt-3 pb-1">{section.label}</p>
              )}
              {section.label && !sidebarOpen && sIdx > 0 && (
                <div className="mx-2 my-2 border-t border-sidebar-border" />
              )}
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                      transition-all duration-200 min-h-[38px]
                      ${isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }
                      ${!sidebarOpen && 'justify-center px-2'}
                    `}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                    {sidebarOpen && <span className="truncate text-[13px]">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Gamification Progress Widget */}
        {sidebarOpen && gamificationData && (
          <div className="px-3 pb-2">
            <button
              onClick={() => { setActiveView('gamification'); setMobileMenuOpen(false); }}
              className="w-full p-2.5 rounded-lg border bg-gradient-to-r from-violet-50/50 to-amber-50/50 dark:from-violet-900/10 dark:to-amber-900/10 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{gamificationData.level?.icon}</span>
                <span className="text-xs font-semibold">{gamificationData.level?.name}</span>
                <Badge variant="outline" className="text-[8px] h-3.5 ml-auto">{gamificationData.xp} XP</Badge>
              </div>
              <Progress value={gamificationData.progressToNext || 100} className="h-1.5" />
              <p className="text-[9px] text-muted-foreground mt-1">{gamificationData.unlockedCount}/{gamificationData.totalAchievements} achievements</p>
            </button>
          </div>
        )}

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          {sidebarOpen && (
            <div className="text-center space-y-0.5">
              <p className="text-[10px] text-muted-foreground/60 tracking-wide">Powered by <span className="font-semibold text-muted-foreground/80">Profit OS</span></p>
              <p className="text-[9px] text-muted-foreground/40">v4.0.0 · © {new Date().getFullYear()} All rights reserved</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-sidebar-accent transition-colors"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" role="main" aria-label="Page content">
        {/* Top Bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation menu">
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold">
              {activeView === 'profile' ? 'My Profile' : (navItems.find(i => i.id === activeView)?.label || 'Dashboard')}
            </h2>
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">
              {tenantConfig?.baseCurrency || 'INR'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} title="Toggle theme">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={session?.user?.image} alt={session?.user?.name} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium max-w-[120px] truncate">
                    {session?.user?.name || session?.user?.email}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1.5">
                    <p className="text-sm font-medium">{session?.user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
                    <Badge variant={getRoleBadgeVariant(userRole)} className="w-fit text-[10px] px-1.5 py-0">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      {getRoleLabel(userRole)}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => { setActiveView('profile'); setMobileMenuOpen(false); }}
                >
                  <UserCircle className="w-4 h-4 mr-2" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary key={activeView}>
            {renderView()}
          </ErrorBoundary>
        </div>
      </main>
      <OfflineBanner />
    </div>
  );
}
