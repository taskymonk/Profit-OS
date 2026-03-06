'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Star, Lock, CheckCircle, Zap, Target, TrendingUp, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  setup: { label: 'Setup & Integrations', icon: '⚙️' },
  recipes: { label: 'Recipes & Products', icon: '📝' },
  orders: { label: 'Orders & Sales', icon: '🛒' },
  finance: { label: 'Finance & Expenses', icon: '💰' },
  inventory: { label: 'Inventory & Stock', icon: '📦' },
  team: { label: 'Team & Employees', icon: '👥' },
  api: { label: 'Developer & API', icon: '🔑' },
  system: { label: 'System & Backup', icon: '🛡️' },
};

export default function GamificationView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const loadProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/gamification/progress');
      const json = await res.json();
      setData(json);
    } catch { toast.error('Failed to load progress'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}</div>;
  if (!data) return <p className="text-muted-foreground">Unable to load progress.</p>;

  const { xp, maxXp, level, nextLevel, progressToNext, unlocked, locked, unlockedCount, totalAchievements, setupChecklist } = data;

  // Group achievements by category
  const allAchievements = [...unlocked.map(a => ({...a, _unlocked: true})), ...locked.map(a => ({...a, _unlocked: false}))];
  const categories = {};
  allAchievements.forEach(a => {
    if (!categories[a.category]) categories[a.category] = [];
    categories[a.category].push(a);
  });

  return (
    <div className="space-y-6 max-w-[960px] mx-auto">
      {/* Hero Level Card */}
      <Card className="overflow-hidden">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-pink-500/10" />
          <CardContent className="relative p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-lg" style={{ background: `linear-gradient(135deg, ${level.color}20, ${level.color}40)`, border: `3px solid ${level.color}` }}>
                  {level.icon}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-background rounded-full px-2 py-0.5 border shadow-sm">
                  <span className="text-xs font-bold" style={{ color: level.color }}>{xp} XP</span>
                </div>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h2 className="text-2xl font-bold">{level.name}</h2>
                  <Badge variant="outline" className="text-xs" style={{ borderColor: level.color, color: level.color }}>
                    Level {['Beginner','Intermediate','Pro','Champion','Legend'].indexOf(level.name) + 1}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {unlockedCount} of {totalAchievements} achievements unlocked
                </p>
                {nextLevel ? (
                  <div className="mt-3 max-w-xs sm:max-w-none">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{level.icon} {level.name}</span>
                      <span className="text-muted-foreground">{nextLevel.icon} {nextLevel.name}</span>
                    </div>
                    <Progress value={progressToNext} className="h-2.5" />
                    <p className="text-[11px] text-muted-foreground mt-1">{nextLevel.minXp - xp} XP to next level</p>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-600 font-medium mt-2">Max level reached! You're a Profit OS Legend!</p>
                )}
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold" style={{ color: level.color }}>{Math.round((xp/maxXp)*100)}%</div>
                <p className="text-[11px] text-muted-foreground">Overall Progress</p>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border">
          <Trophy className="w-4 h-4 mx-auto text-violet-500 mb-1" />
          <p className="text-lg font-bold">{unlockedCount}</p>
          <p className="text-[10px] text-muted-foreground">Unlocked</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border">
          <Star className="w-4 h-4 mx-auto text-amber-500 mb-1" />
          <p className="text-lg font-bold">{xp}</p>
          <p className="text-[10px] text-muted-foreground">Total XP</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border">
          <Target className="w-4 h-4 mx-auto text-blue-500 mb-1" />
          <p className="text-lg font-bold">{totalAchievements - unlockedCount}</p>
          <p className="text-[10px] text-muted-foreground">Remaining</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border">
          <Zap className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-bold">{setupChecklist?.filter(s => s.completed).length || 0}/{setupChecklist?.length || 6}</p>
          <p className="text-[10px] text-muted-foreground">Setup Done</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="achievements" className="gap-1.5"><Trophy className="w-3.5 h-3.5" />All Achievements</TabsTrigger>
          <TabsTrigger value="setup" className="gap-1.5"><Target className="w-3.5 h-3.5" />Setup Guide</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Recent Achievements */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Recently Unlocked</CardTitle>
            </CardHeader>
            <CardContent>
              {unlocked.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No achievements yet. Start by setting up your business!</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {unlocked.slice(0, 8).map(a => (
                    <div key={a.id} className="p-3 rounded-lg border bg-gradient-to-br from-amber-50/50 to-yellow-50/50 dark:from-amber-900/10 dark:to-yellow-900/10 text-center">
                      <div className="text-3xl mb-1">{a.icon}</div>
                      <p className="text-xs font-semibold">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                      <Badge variant="outline" className="mt-1 text-[9px] h-4 bg-amber-50 text-amber-600 border-amber-200">+{a.xp} XP</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Next Up */}
          {locked.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" />Next Achievements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {locked.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30">
                      <div className="text-2xl opacity-40">{a.icon}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium flex items-center gap-1.5"><Lock className="w-3 h-3 text-muted-foreground" />{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">{a.desc}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] h-4">+{a.xp} XP</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ALL ACHIEVEMENTS TAB */}
        <TabsContent value="achievements" className="mt-4 space-y-4">
          {Object.entries(categories).map(([catId, items]) => {
            const catInfo = CATEGORY_LABELS[catId] || { label: catId, icon: '🎯' };
            const catUnlocked = items.filter(a => a._unlocked).length;
            return (
              <Card key={catId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{catInfo.icon}</span>{catInfo.label}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">{catUnlocked}/{items.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {items.map(a => (
                      <div key={a.id} className={`p-3 rounded-lg border text-center transition-all ${
                        a._unlocked
                          ? 'bg-gradient-to-br from-amber-50/50 to-yellow-50/30 dark:from-amber-900/10 dark:to-yellow-900/5 border-amber-200/50'
                          : 'bg-muted/20 opacity-60'
                      }`}>
                        <div className="text-2xl mb-1">{a._unlocked ? a.icon : '🔒'}</div>
                        <p className="text-xs font-semibold">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                        <div className="mt-1">
                          {a._unlocked ? (
                            <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-600 border-green-200">
                              <CheckCircle className="w-2.5 h-2.5 mr-0.5" />+{a.xp} XP
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] h-4 text-muted-foreground">
                              <Lock className="w-2.5 h-2.5 mr-0.5" />{a.xp} XP
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* SETUP GUIDE TAB */}
        <TabsContent value="setup" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Target className="w-5 h-5 text-emerald-600" /></div>
                <div>
                  <CardTitle className="text-base">Quick Setup Guide</CardTitle>
                  <CardDescription>Complete these steps to get the most out of Profit OS</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(setupChecklist || []).map((item, i) => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    item.completed ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200/50' : 'hover:bg-muted/50'
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      item.completed ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                    }`}>
                      {item.completed ? <CheckCircle className="w-5 h-5" /> : i + 1}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.completed ? 'line-through text-muted-foreground' : ''}`}>{item.label}</p>
                      <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                    </div>
                    {!item.completed && onNavigate && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onNavigate(item.navigateTo)}>
                        Go <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                    {item.completed && <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-600 border-green-200">Done</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
