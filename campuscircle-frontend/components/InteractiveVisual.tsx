"use client";

import React from "react";

interface InteractiveVisualProps {
  visualHtml: string;
  title?: string;
}

export function InteractiveVisual({ visualHtml, title }: InteractiveVisualProps) {
  if (!visualHtml) return null;

  return (
    <div className="bg-background border border-border-muted/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs transition-all">
      <div className="flex items-center justify-between gap-2 border-b border-border-muted/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-[11px] font-bold text-primary uppercase tracking-wider">
            Interactive Visual Simulation
          </span>
        </div>
        {title && (
          <span className="font-sans text-xs text-ink/60 font-medium truncate max-w-[200px] sm:max-w-[300px]">
            {title}
          </span>
        )}
      </div>

      <div className="w-full rounded-xl overflow-hidden border border-border-muted/60 bg-surface shadow-inner">
        <iframe
          title={title || "Interactive Concept Visual"}
          srcDoc={visualHtml}
          /* SECURITY REQUIREMENT: sandbox="allow-scripts" ONLY.
             Explicitly NO allow-same-origin, NO allow-top-navigation, NO allow-popups, NO allow-forms.
             This ensures JS executes isolated inside the iframe with zero access to window.parent, cookies, localStorage, or JWTs.
          */
          sandbox="allow-scripts"
          className="w-full h-[260px] sm:h-[320px] border-0 block bg-transparent"
        />
      </div>
    </div>
  );
}
