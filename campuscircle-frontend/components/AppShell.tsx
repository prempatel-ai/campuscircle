"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AnonAvatar } from "@/components/AnonAvatar";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 1. Enforce authentication check
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full" />
      </div>
    );
  }

  const avatarSeed = user?.username || "anonymous";

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background text-ink font-sans flex flex-col">
      {/* Shared Persistent Top Header */}
      <header className="bg-surface border-b border-border-muted px-4 py-3 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Logo / Wordmark */}
          <Link
            href="/feed"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="font-display text-2xl font-bold tracking-tight text-primary">
              CampusCircle
            </span>
          </Link>

          {/* Account Menu Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Account menu"
              aria-expanded={isMenuOpen}
              className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full border border-border-muted/60 bg-surface hover:bg-background transition-all cursor-pointer shadow-sm"
            >
              <AnonAvatar username={avatarSeed} size={30} shape="circle" />
              <svg
                className={`w-4 h-4 text-ink/60 transition-transform duration-200 ${
                  isMenuOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface border border-border-muted rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Account Details Header */}
                <div className="px-4 py-3 border-b border-border-muted/50 flex items-center gap-3">
                  <AnonAvatar username={avatarSeed} size={42} shape="circle" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-xs font-bold text-accent tracking-tight truncate">
                      @{user?.username || "user"}
                    </span>
                    <span className="inline-block mt-0.5 text-[10px] font-mono font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full w-max">
                      {user?.role === "admin" ? "Administrator" : "Student"}
                    </span>
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="py-1">
                  <Link
                    href="/feed"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-sans font-semibold text-ink/80 hover:bg-background hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                    Community Feed
                  </Link>
                  <Link
                    href="/my-posts"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-sans font-semibold text-ink/80 hover:bg-background hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    My Posts
                  </Link>
                  <a
                    href="mailto:support@campuscircle.edu?subject=CampusCircle%20Issue%20Report"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-sans font-semibold text-ink/80 hover:bg-background hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Report an Issue
                  </a>
                </div>

                {/* Logout Item */}
                <div className="border-t border-border-muted/50 pt-1 mt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-sans font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Children Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col">{children}</main>
    </div>
  );
};
