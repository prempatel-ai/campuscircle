"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AnonAvatar } from "@/components/AnonAvatar";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/feed?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-ink font-sans flex flex-col">
      {/* Shared Persistent Top Header */}
      <header className="bg-surface border-b border-border-muted px-4 py-3 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-2 sm:px-4">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-6">
            <Link
              href="/feed"
              className="flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0"
            >
              <span className="font-display text-2xl font-bold tracking-tight text-primary">
                CampusCircle
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/feed"
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all ${
                  pathname.startsWith("/feed")
                    ? "bg-primary/10 text-primary"
                    : "text-ink/60 hover:text-ink hover:bg-background"
                }`}
              >
                Feed
              </Link>
              <Link
                href="/learn"
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all flex items-center gap-1.5 ${
                  pathname.startsWith("/learn")
                    ? "bg-primary/10 text-primary"
                    : "text-ink/60 hover:text-ink hover:bg-background"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>Learn</span>
              </Link>
            </nav>
          </div>

          {/* Global Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-4 hidden sm:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics, posts, or communities..."
                className="w-full pl-9 pr-4 py-1.5 bg-background border border-border-muted/80 rounded-full text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          </form>

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
                    My Activity & Posts
                  </Link>
                  <a
                    href="mailto:rolexhere03@gmail.com?subject=CampusCircle%20Issue%20Report"
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
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col">{children}</main>
    </div>
  );
};
