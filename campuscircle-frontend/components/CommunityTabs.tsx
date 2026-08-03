"use client";

import React from "react";

interface Community {
  id: string;
  name: string;
  description: string | null;
}

interface CommunityTabsProps {
  communities: Community[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCommunityCreated: (community: Community) => void;
  onComposePost?: () => void;
  onRequestCreate?: () => void;
}

export const CommunityTabs: React.FC<CommunityTabsProps> = ({
  communities,
  selectedId,
  onSelect,
  onCommunityCreated,
  onComposePost,
  onRequestCreate,
}) => {

  return (
    <>
      {/* ── 1. MOBILE / TABLET HORIZONTAL PILL TAB BAR (< lg) ── */}
      <div className="w-full border-b border-border-muted/50 bg-background/95 backdrop-blur-md sticky top-[57px] z-10 lg:hidden">
        <div className="max-w-2xl mx-auto flex items-center gap-2 overflow-x-auto px-4 py-3.5 no-scrollbar scroll-smooth">
          {/* Community pills */}
          {communities.map((comm) => {
            const isSelected = comm.id === selectedId;
            return (
              <button
                key={comm.id}
                onClick={() => onSelect(comm.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-sans whitespace-nowrap transition-all duration-200 cursor-pointer border shrink-0 ${
                  isSelected
                    ? "bg-primary text-white font-extrabold border-primary shadow-xs"
                    : "bg-surface text-ink/75 border-border-muted/70 hover:bg-surface-subtle hover:text-ink font-semibold shadow-2xs"
                }`}
              >
                #{comm.name}
              </button>
            );
          })}

          {/* New community pill — mobile */}
          <button
            id="new-community-btn"
            onClick={() => onRequestCreate?.()}
            aria-label="Create new community"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-sans font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer border border-dashed border-border-muted/80 text-ink/60 hover:border-primary/50 hover:text-primary hover:bg-primary/5 shrink-0 bg-surface/50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>New</span>
          </button>
        </div>
      </div>

      {/* ── 2. DESKTOP PERSISTENT LEFT SIDEBAR (>= lg) ── */}
      <aside className="hidden lg:flex flex-col w-full gap-5">
        {/* Desktop "+ New Post" primary action button */}
        {onComposePost && (
          <button
            id="sidebar-new-post"
            onClick={onComposePost}
            className="w-full py-3 bg-primary hover:bg-[#1F3E23] active:scale-[0.99] text-white font-sans font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Post
          </button>
        )}

        {/* Communities Section Card */}
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-4 shadow-2xs flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-mono text-xs font-bold text-ink/40 uppercase tracking-wider">
              Communities
            </h3>
            <span className="font-mono text-[10px] font-semibold text-ink/30">
              {communities.length}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {communities.map((comm) => {
              const isSelected = comm.id === selectedId;
              return (
                <button
                  key={comm.id}
                  onClick={() => onSelect(comm.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-sans transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? "bg-primary text-white font-bold shadow-sm"
                      : "text-ink/75 font-semibold hover:bg-surface hover:text-ink"
                  }`}
                >
                  <span className="truncate">#{comm.name}</span>
                </button>
              );
            })}

            {/* Desktop New Community button */}
            <button
              onClick={() => onRequestCreate?.()}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-sans font-semibold text-ink/50 hover:bg-surface hover:text-primary transition-all flex items-center gap-2 border border-dashed border-border-muted/80 mt-1 cursor-pointer"
            >
              <svg className="w-4 h-4 text-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Community
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
