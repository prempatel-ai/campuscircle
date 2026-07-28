"use client";

import React from "react";
import { AnonAvatar } from "./AnonAvatar";
import { VoteControl } from "./VoteControl";
import { ThreadProgressDots } from "./ThreadProgressDots";

interface PostPart {
  id: string;
  community_id: string;
  author_id: string;
  author_username: string;
  title: string;
  content: string;
  score: number;
  comment_count: number;
  thread_id?: string | null;
  thread_position?: number | null;
  thread_total_parts?: number;
  created_at: string;
  updated_at: string;
}

interface ThreadViewProps {
  parts: PostPart[];
  onReportClick?: (postId: string) => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ parts, onReportClick }) => {
  if (!parts || parts.length === 0) return null;

  return (
    <div className="bg-surface border border-border-muted rounded-2xl p-5 shadow-sm space-y-6">
      {/* Thread Header Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-border-muted/50">
        <h2 className="font-display text-base font-bold text-primary">
          Multi-Part Thread
        </h2>
        <ThreadProgressDots totalParts={parts.length} currentPosition={parts.length} />
      </div>

      {/* Connected Thread Parts Sequence */}
      <div className="space-y-0 relative">
        {parts.map((part, idx) => {
          const isLast = idx === parts.length - 1;
          const pos = part.thread_position || idx + 1;
          const total = parts.length;

          return (
            <div key={part.id} className="relative flex gap-4 pb-6 group">
              {/* Vertical Thread Connector Line */}
              {!isLast && (
                <div
                  className="absolute left-4 top-10 bottom-0 w-0.5 bg-primary/25 group-hover:bg-primary/45 transition-colors z-0"
                  aria-hidden="true"
                />
              )}

              {/* Avatar Column */}
              <div className="shrink-0 z-10">
                <AnonAvatar username={part.author_username} size={34} shape="circle" />
              </div>

              {/* Part Content Column */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-accent font-semibold">
                      @{part.author_username}
                    </span>
                    <ThreadProgressDots totalParts={total} currentPosition={pos} />
                  </div>

                  {onReportClick && (
                    <button
                      onClick={() => onReportClick(part.id)}
                      className="p-1 rounded-lg text-ink/30 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Report part"
                      aria-label="Report thread part"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Show Title on Part 1 */}
                {idx === 0 && (
                  <h3 className="font-display text-xl font-bold text-ink leading-snug">
                    {part.title}
                  </h3>
                )}

                {/* Part Body Content */}
                <p className="font-sans text-sm text-ink/85 leading-relaxed break-words whitespace-pre-wrap">
                  {part.content}
                </p>

                {/* Per-Part Vote Control */}
                <div className="pt-2 flex items-center gap-3">
                  <VoteControl targetId={part.id} targetType="post" initialScore={part.score} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
