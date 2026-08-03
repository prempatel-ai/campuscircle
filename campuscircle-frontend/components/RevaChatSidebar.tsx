"use client";

import React from "react";
import { Plus, Trash2, MessageSquare, Loader2 } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface RevaChatSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  onCreateNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function getDateGroup(updatedAt: string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return "Older";
}

export const RevaChatSidebar: React.FC<RevaChatSidebarProps> = ({
  conversations,
  activeConversationId,
  isLoading,
  error,
  onCreateNew,
  onSelect,
  onDelete,
}) => {
  // Filter out empty placeholder conversations (title: "New Chat") so duplicate entries don't appear
  const realConversations = conversations.filter(
    (c) => c.title && c.title.trim() !== "" && c.title.toLowerCase() !== "new chat"
  );

  const grouped: Record<string, Conversation[]> = {};
  for (const conv of realConversations) {
    const group = getDateGroup(conv.updated_at);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(conv);
  }
  const groupOrder = ["Today", "Yesterday", "This Week", "Older"];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Quiet Minimal New Chat Button */}
      <button
        onClick={onCreateNew}
        className="w-full px-3 py-2 bg-surface hover:bg-surface-subtle border border-border-muted/80 hover:border-primary/40 text-ink/80 hover:text-primary font-sans font-bold text-xs rounded-xl transition-all flex items-center justify-between cursor-pointer shadow-2xs"
      >
        <span className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-primary" />
          <span>New Chat</span>
        </span>
      </button>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-ink/30 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="py-4 px-2 text-center space-y-1">
          <p className="text-[11px] font-sans text-red-600">{error}</p>
          <button
            onClick={onCreateNew}
            className="text-[11px] font-sans font-bold text-primary hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && realConversations.length === 0 && (
        <div className="py-8 px-2 text-center space-y-1">
          <MessageSquare className="w-5 h-5 text-ink/20 mx-auto" />
          <p className="text-[11px] font-sans text-ink/40">No conversations</p>
        </div>
      )}

      {/* Minimal Conversation List */}
      {!isLoading && !error && realConversations.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[calc(100vh-14rem)]">
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (!items) return null;
            return (
              <div key={group} className="space-y-0.5">
                <div className="px-2 py-0.5 text-[10px] font-mono font-bold text-ink/40 uppercase tracking-wider">
                  {group}
                </div>
                {items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary/10 text-primary font-bold"
                          : "text-ink/65 font-medium hover:bg-surface-subtle hover:text-ink"
                      }`}
                    >
                      <button
                        onClick={() => onSelect(conv.id)}
                        className="flex-1 text-left px-2.5 py-1.5 min-w-0"
                      >
                        <span className="block text-xs font-sans truncate">
                          {conv.title}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className={`absolute right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer ${
                          isActive
                            ? "hover:bg-primary/20 text-primary"
                            : "hover:bg-red-100 hover:text-red-600 text-ink/40"
                        }`}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
