'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * PageSkeleton — Shows a shimmer loading skeleton matching common page layouts.
 * Variants: 'dashboard' | 'list' | 'cards' | 'form'
 */
export default function PageSkeleton({ variant = 'list' }) {
  if (variant === 'dashboard') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border bg-card">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-28 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        {/* Chart area */}
        <div className="rounded-xl border bg-card p-6">
          <Skeleton className="h-4 w-40 mb-4" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        {/* Table */}
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-32 mb-4" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border bg-card">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="space-y-6 max-w-[700px] mx-auto animate-in fade-in duration-300">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
    );
  }

  // Default: 'list' variant
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      {/* Guide card placeholder */}
      <Skeleton className="h-24 w-full rounded-xl" />
      {/* Filter/search bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 flex-1 max-w-xs rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      {/* Table rows */}
      <div className="rounded-xl border bg-card">
        <div className="p-3 border-b">
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 border-b last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
