"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { PostCard } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/PostCardSkeleton";

interface Post {
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

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

type TabType = "posts" | "saved" | "commented";

export default function MyPostsPage() {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("posts");

  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTabData = useCallback(
    async (tab: TabType, currentPage: number, append = false) => {
      setIsLoading(true);
      setError(null);

      let endpoint = "/api/v1/users/me/posts";
      if (tab === "saved") {
        endpoint = "/api/v1/users/me/saved";
      } else if (tab === "commented") {
        endpoint = "/api/v1/users/me/commented";
      }

      try {
        const response = await apiRequest<PaginatedResponse<Post>>(
          `${endpoint}?page=${currentPage}&size=10`
        );
        if (append) {
          setPosts((prev) => [...prev, ...response.items]);
        } else {
          setPosts(response.items);
        }
        setHasMore(currentPage * 10 < response.total);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load posts.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isAuthenticated) {
      setPage(1);
      fetchTabData(activeTab, 1, false);
    }
  }, [isAuthenticated, activeTab, fetchTabData]);

  const handleLoadMore = () => {
    if (isLoading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTabData(activeTab, nextPage, true);
  };

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border-muted/60 pb-4 space-y-1">
        <h1 className="font-display text-2xl font-bold text-primary">My Activity & Bookmarks</h1>
        <p className="font-sans text-sm text-ink/75">
          Track your posts, saved bookmarks, and comment discussions for <span className="font-mono font-bold text-accent">@{user?.username}</span>
        </p>
      </div>

      {/* 3 Activity Tabs */}
      <div className="flex items-center gap-2 border-b border-border-muted pb-3">
        <button
          onClick={() => setActiveTab("posts")}
          className={`px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "posts"
              ? "bg-primary text-surface shadow-xs"
              : "bg-surface border border-border-muted text-ink/70 hover:text-ink"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <span>My Posts</span>
        </button>

        <button
          onClick={() => setActiveTab("saved")}
          className={`px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "saved"
              ? "bg-primary text-surface shadow-xs"
              : "bg-surface border border-border-muted text-ink/70 hover:text-ink"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span>Saved Posts</span>
        </button>

        <button
          onClick={() => setActiveTab("commented")}
          className={`px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "commented"
              ? "bg-primary text-surface shadow-xs"
              : "bg-surface border border-border-muted text-ink/70 hover:text-ink"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>Commented Posts</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-surface border border-red-200 rounded-2xl p-6 text-center space-y-3 shadow-sm">
          <p className="font-sans text-sm text-red-600 font-semibold">{error}</p>
          <button
            onClick={() => fetchTabData(activeTab, 1, false)}
            className="px-5 py-2 bg-primary text-white font-sans text-xs font-bold rounded-xl"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Posts List */}
      {!error && (
        <div className="flex flex-col space-y-4">
          {isLoading && page === 1 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <PostCardSkeleton key={n} />
              ))}
            </div>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} showAuthorViewCount={true} />)
          )}

          {/* Empty State */}
          {!isLoading && posts.length === 0 && (
            <div className="bg-surface border border-border-muted rounded-2xl p-10 text-center space-y-4 shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                {activeTab === "saved" ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                ) : activeTab === "commented" ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-primary">
                  {activeTab === "saved"
                    ? "No saved posts yet"
                    : activeTab === "commented"
                    ? "No commented posts yet"
                    : "No posts yet"}
                </h3>
                <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">
                  {activeTab === "saved"
                    ? "Click the 'Save' button on any post to bookmark it for quick reading later."
                    : activeTab === "commented"
                    ? "Join discussions in your campus feed! Any post you comment on will appear here."
                    : "You haven't published any posts yet. Create a post in your campus feed!"}
                </p>
              </div>
              <Link
                href="/feed"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-[#1F3E23] text-white font-sans font-bold text-xs rounded-xl shadow-sm transition-all"
              >
                Go to Community Feed
              </Link>
            </div>
          )}

          {/* Load More Button */}
          {!isLoading && hasMore && (
            <button
              onClick={handleLoadMore}
              className="w-full py-3 bg-surface border border-border-muted text-ink/75 hover:bg-background font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-sm text-sm"
            >
              Load More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
