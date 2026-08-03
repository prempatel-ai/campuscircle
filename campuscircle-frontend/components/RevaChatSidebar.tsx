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
    <div className="flex flex-col h-full space-y-3">
      {/* New Chat Button */}
      <button
        onClick={onCreateNew}
        className="w-full py-3 bg-primary hover:bg-[#1F3E23] active:scale-[0.99] text-white font-sans font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>New Chat</span>
      </button>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-ink/40 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="flex-1 flex flex-col items-center justify-center py-6 px-3 text-center space-y-2">
          <p className="text-xs font-sans text-red-600">{error}</p>
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
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-3 text-center space-y-2">
          <MessageSquare className="w-6 h-6 text-ink/30 mx-auto" />
          <p className="text-xs font-sans text-ink/50 font-medium">
            No past conversations
          </p>
        </div>
      )}

      {/* Conversation List */}
      {!isLoading && !error && conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[calc(100vh-14rem)]">
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (!items) return null;
            return (
              <div key={group} className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-mono font-bold text-ink/40 uppercase tracking-wider">
                  {group}
                </div>
                {items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center rounded-xl transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary text-white font-bold shadow-sm"
                          : "text-ink/75 font-semibold hover:bg-background hover:text-ink"
                      }`}
                    >
                      <button
                        onClick={() => onSelect(conv.id)}
                        className="flex-1 text-left px-3 py-2 min-w-0"
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
                        className={`absolute right-1.5 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer ${
                          isActive
                            ? "hover:bg-white/20 text-white"
                            : "hover:bg-red-100 hover:text-red-600 text-ink/40"
                        }`}
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
