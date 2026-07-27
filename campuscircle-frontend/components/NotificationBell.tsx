"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  actor_username: string;
  type: string;
  target_id: string;
  related_post_id: string;
  is_read: boolean;
  created_at: string;
}

interface PaginatedNotifications {
  items: NotificationItem[];
  total: number;
}

export const NotificationBell: React.FC = () => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiRequest<{ unread_count: number }>("/api/v1/notifications/unread-count");
      setUnreadCount(res.unread_count);
    } catch (_) {}
  }, []);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest<PaginatedNotifications>("/api/v1/notifications?size=15");
      setNotifications(res.items);
    } catch (_) {
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await apiRequest(`/api/v1/notifications/${notif.id}/read`, { method: "POST" });
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch (_) {}
    }
    setIsOpen(false);
    router.push(`/posts/${notif.related_post_id}`);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative p-2 rounded-full border border-border-muted/60 bg-surface hover:bg-background transition-all cursor-pointer shadow-sm text-ink/70 hover:text-primary flex items-center justify-center"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 01-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold font-mono text-white shadow-sm animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface border border-border-muted rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-2.5 border-b border-border-muted/50 flex items-center justify-between">
            <span className="font-display font-bold text-sm text-primary">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border-muted/30">
            {isLoading ? (
              <div className="p-6 text-center text-xs font-sans text-ink/50">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs font-sans text-ink/50">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 hover:bg-background transition-colors flex items-start gap-3 cursor-pointer ${
                    !notif.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      !notif.is_read ? "bg-primary" : "bg-transparent"
                    }`}
                  />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-sans text-ink leading-snug">
                      <span className="font-mono font-bold text-accent">@{notif.actor_username}</span>{" "}
                      {notif.type === "reply_to_post"
                        ? "replied to your post"
                        : "replied to your comment"}
                    </p>
                    <span className="text-[10px] text-ink/40 font-mono">
                      {new Date(notif.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
