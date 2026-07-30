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
  const grouped: Record<string, Conversation[]> = {};
  for (const conv of conversations) {
    const group = getDateGroup(conv.updated_at);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(conv);
  }
  const groupOrder = ["Today", "Yesterday", "This Week", "Older"];

  return (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onCreateNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-primary text-surface rounded-xl hover:bg-[#1F3E23] transition-all font-sans font-bold text-sm cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-ink/40 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-xs font-sans text-red-600 mb-2">{error}</p>
          <button
            onClick={onCreateNew}
            className="text-xs font-sans font-bold text-primary hover:underline cursor-pointer"
          >
            Start a new chat
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && conversations.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <MessageSquare className="w-8 h-8 text-ink/20 mb-2" />
          <p className="text-xs font-sans text-ink/50">
            No conversations yet
          </p>
        </div>
      )}

      {/* Conversation List */}
      {!isLoading && !error && conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (!items) return null;
            return (
              <div key={group}>
                <div className="px-2 py-1.5 text-[11px] font-mono font-bold text-ink/40 uppercase tracking-wider">
                  {group}
                </div>
                {items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center rounded-xl transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-background text-ink/80"
                      }`}
                    >
                      <button
                        onClick={() => onSelect(conv.id)}
                        className="flex-1 text-left px-3 py-2.5 min-w-0"
                      >
                        <span className="block text-xs font-sans font-semibold truncate">
                          {conv.title}
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="absolute right-1.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all text-ink/30 cursor-pointer"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
