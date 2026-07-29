"use client";

import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

interface TrendingTag {
  name: string;
  post_count: number;
}

interface PaginatedTagsResponse {
  items: TrendingTag[];
}

interface TrendingTagsProps {
  activeTag?: string | null;
  onSelectTag: (tag: string | null) => void;
}

export function TrendingTags({ activeTag, onSelectTag }: TrendingTagsProps) {
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTrendingTags = async () => {
      setIsLoading(true);
      try {
        const res = await apiRequest<PaginatedTagsResponse>("/api/v1/universities/me/trending-tags?limit=8");
        setTags(res.items || []);
      } catch {
        setTags([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrendingTags();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3 shadow-2xs animate-pulse">
        <div className="h-4 bg-border-muted/50 rounded w-1/2 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-6 w-16 bg-border-muted/40 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (tags.length === 0 && !activeTag) {
    return null;
  }

  return (
    <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3.5 shadow-2xs">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <span>Trending Hashtags</span>
        </h3>
        {activeTag && (
          <button
            onClick={() => onSelectTag(null)}
            className="text-xs font-sans text-primary hover:underline font-semibold cursor-pointer"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isActive = activeTag?.toLowerCase() === tag.name.toLowerCase();
          return (
            <button
              key={tag.name}
              onClick={() => onSelectTag(isActive ? null : tag.name)}
              className={`px-3 py-1 rounded-full text-xs font-mono font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? "bg-primary text-surface font-bold shadow-2xs"
                  : "bg-background border border-border-muted text-ink/80 hover:border-primary/40 hover:text-primary"
              }`}
            >
              <span>#{tag.name}</span>
              <span className={`text-[10px] ${isActive ? "opacity-90" : "text-ink/50"}`}>
                ({tag.post_count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
