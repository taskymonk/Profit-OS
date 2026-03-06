'use client';

import { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * DismissibleGuideCard — A reusable, persistent guide card for every page.
 * 
 * Props:
 *   storageKey: string  — localStorage key, e.g. "guide_dashboard"
 *   icon: LucideIcon    — Icon component for the card header
 *   title: string       — Guide card title
 *   children: ReactNode — The content (bullets, emojis, etc.)
 */
export default function GuideCard({ storageKey, icon: Icon, title, children }) {
  const [visible, setVisible] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    setVisible(dismissed !== 'true');
    setInitialized(true);
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, 'true');
  };

  const show = () => {
    setVisible(true);
    localStorage.removeItem(storageKey);
  };

  if (!initialized) return null;

  if (!visible) {
    return (
      <button
        onClick={show}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
      >
        <Info className="w-3.5 h-3.5" />
        <span>Show page guide</span>
      </button>
    );
  }

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 dark:from-primary/10 dark:via-background dark:to-primary/10 p-4 shadow-sm">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Dismiss guide"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0 pr-6">
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <div className="mt-2 text-xs text-muted-foreground leading-relaxed space-y-1.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
