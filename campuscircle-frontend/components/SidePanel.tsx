"use client";

import React from "react";

interface SidePanelProps {
  children: React.ReactNode;
  className?: string;
}

export function SidePanel({ children, className = "" }: SidePanelProps) {
  return (
    <aside
      className={`hidden lg:flex lg:col-span-3 flex-col gap-5 lg:sticky lg:top-20 shrink-0 ${className}`}
    >
      {children}
    </aside>
  );
}

interface SidePanelCardProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SidePanelCard({ title, icon, children, className = "" }: SidePanelCardProps) {
  return (
    <div
      className={`bg-surface-subtle border border-border-muted/70 rounded-2xl p-5 space-y-3.5 shadow-2xs ${className}`}
    >
      {title && (
        <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2 border-b border-border-muted/50 pb-2.5">
          {icon}
          <span>{title}</span>
        </h3>
      )}
      {children}
    </div>
  );
}
