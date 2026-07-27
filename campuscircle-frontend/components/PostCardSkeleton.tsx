import React from "react";

export const PostCardSkeleton: React.FC = () => {
  return (
    <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-4 animate-pulse shadow-sm">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-border-muted/60 shrink-0" />
          <div className="flex flex-col space-y-1.5">
            <div className="h-3.5 bg-border-muted/70 rounded-full w-28" />
            <div className="h-2.5 bg-border-muted/40 rounded-full w-14" />
          </div>
        </div>
        <div className="w-6 h-6 rounded-lg bg-border-muted/30" />
      </div>

      {/* Title & Body Lines */}
      <div className="space-y-2 py-0.5">
        <div className="h-5 bg-border-muted/70 rounded-full w-4/5" />
        <div className="h-4 bg-border-muted/40 rounded-full w-full" />
        <div className="h-4 bg-border-muted/40 rounded-full w-5/6" />
      </div>

      {/* Interaction Bar */}
      <div className="flex items-center gap-5 pt-2 border-t border-border-muted/50">
        <div className="h-7 w-20 bg-border-muted/60 rounded-full" />
        <div className="h-4 w-24 bg-border-muted/40 rounded-full" />
      </div>
    </div>
  );
};

export const CommentSkeleton: React.FC = () => {
  return (
    <div className="bg-surface border border-border-muted/60 rounded-xl p-4 space-y-2.5 animate-pulse shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-border-muted/60 shrink-0" />
        <div className="h-3 bg-border-muted/70 rounded-full w-24" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 bg-border-muted/40 rounded-full w-11/12" />
        <div className="h-3.5 bg-border-muted/40 rounded-full w-3/4" />
      </div>
    </div>
  );
};
