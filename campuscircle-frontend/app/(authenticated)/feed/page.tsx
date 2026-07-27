"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { CommunityTabs } from "@/components/CommunityTabs";
import { PostCard } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/PostCardSkeleton";
import { ComposePost } from "@/components/ComposePost";

interface Community {
  id: string;
  name: string;
  description: string | null;
}

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

const SORT_OPTIONS: ("hot" | "top" | "new")[] = ["hot", "top", "new"];
const PAGE_SIZE = 10;

function FeedContent() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const communityQueryParam = searchParams.get("community");

  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<"hot" | "top" | "new">("new");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const [isCommunitiesLoading, setIsCommunitiesLoading] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Communities on Mount
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCommunities = async () => {
      setIsCommunitiesLoading(true);
      setError(null);
      try {
        const response = await apiRequest<PaginatedResponse<Community>>("/api/v1/communities?page=1&size=100");
        setCommunities(response.items);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load communities.");
        }
      } finally {
        setIsCommunitiesLoading(false);
      }
    };

    fetchCommunities();
  }, [isAuthenticated]);

  // 2. Sync selectedCommunityId with URL query param + communities list
  useEffect(() => {
    if (communities.length === 0) return;

    if (communityQueryParam) {
      const match = communities.find((c) => c.id === communityQueryParam);
      if (match) {
        setSelectedCommunityId(match.id);
        return;
      }
    }

    // Default to first community if missing or invalid param
    const firstId = communities[0].id;
    setSelectedCommunityId(firstId);
    router.replace(`/feed?community=${firstId}`, { scroll: false });
  }, [communities, communityQueryParam, router]);

  // 3. Tab Select Handler — updates URL via router.push
  const handleSelectCommunity = (id: string) => {
    setSelectedCommunityId(id);
    router.push(`/feed?community=${id}`, { scroll: false });
  };

  // 2. Fetch Posts callback
  const fetchPosts = useCallback(
    async (communityId: string, currentSort: "hot" | "top" | "new", currentPage: number, append = false) => {
      setIsPostsLoading(true);
      setError(null);
      try {
        const response = await apiRequest<PaginatedResponse<Post>>(
          `/api/v1/communities/${communityId}/posts?sort=${currentSort}&page=${currentPage}&size=${PAGE_SIZE}`
        );
        
        if (append) {
          setPosts((prev) => [...prev, ...response.items]);
        } else {
          setPosts(response.items);
        }
        
        setHasMore(currentPage * PAGE_SIZE < response.total);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to retrieve posts.");
        }
      } finally {
        setIsPostsLoading(false);
      }
    },
    []
  );

  // 3. Trigger Post fetch when community or sort changes
  useEffect(() => {
    if (!selectedCommunityId) return;
    setPage(1);
    fetchPosts(selectedCommunityId, sort, 1, false);
  }, [selectedCommunityId, sort, fetchPosts]);

  // 4. Load More handler
  const handleLoadMore = () => {
    if (!selectedCommunityId || isPostsLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(selectedCommunityId, sort, nextPage, true);
  };

  // 5. Handle new post created — prepend to list without refresh
  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev]);
    setIsComposing(false);
  };

  // 6. Handle new community created — append tab and auto-select it
  const handleCommunityCreated = (newCommunity: Community) => {
    setCommunities((prev) => [...prev, newCommunity]);
    setSelectedCommunityId(newCommunity.id);
  };

  return (
    <div className="flex-1 text-ink font-sans flex flex-col lg:flex-row lg:gap-8 pb-16">
      {/* Community Tabs (Mobile Horizontal Bar + Desktop Left Sidebar) */}
      {!isCommunitiesLoading && communities.length > 0 && (
        <CommunityTabs
          communities={communities}
          selectedId={selectedCommunityId}
          onSelect={handleSelectCommunity}
          onCommunityCreated={handleCommunityCreated}
          onComposePost={() => setIsComposing(true)}
        />
      )}

      {/* Main Feed Content Column */}
      <div className="flex-1 max-w-2xl w-full mx-auto lg:mx-0 px-4 lg:px-0 mt-6 flex flex-col space-y-6">
        {/* Error State with Retry */}
        {error && (
          <div className="bg-surface border border-red-200 rounded-2xl p-6 text-center space-y-4 shadow-sm">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold text-red-700">Couldn't load feed</h3>
              <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">{error}</p>
            </div>
            <button
              onClick={() => {
                setError(null);
                if (communities.length === 0) {
                  setIsCommunitiesLoading(true);
                  apiRequest<PaginatedResponse<Community>>("/api/v1/communities?page=1&size=100")
                    .then((res) => {
                      setCommunities(res.items);
                      if (res.items.length > 0) setSelectedCommunityId(res.items[0].id);
                    })
                    .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load communities."))
                    .finally(() => setIsCommunitiesLoading(false));
                } else if (selectedCommunityId) {
                  fetchPosts(selectedCommunityId, sort, 1, false);
                }
              }}
              className="px-6 py-2.5 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-sm transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          </div>
        )}

        {/* Communities Loading State (Skeletons) */}
        {isCommunitiesLoading && !error && (
          <div className="space-y-4 py-2">
            <div className="h-8 bg-surface border border-border-muted/50 rounded-full animate-pulse max-w-xs mx-auto" />
            <div className="space-y-4 mt-6">
              {[1, 2, 3, 4].map((n) => (
                <PostCardSkeleton key={n} />
              ))}
            </div>
          </div>
        )}

        {!isCommunitiesLoading && communities.length === 0 && !error && (
          <div className="bg-surface border border-border-muted rounded-2xl p-8 text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-primary">No Communities Found</h2>
            <p className="font-sans text-sm text-ink/75">
              Your university doesn't have any communities setup yet. Use the "+ New" button above to create one.
            </p>
          </div>
        )}

        {/* Sort Segmented Control */}
        {!isCommunitiesLoading && communities.length > 0 && !error && (
          <div className="flex bg-surface rounded-xl p-1 border border-border-muted max-w-xs mx-auto w-full">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`flex-1 py-1.5 text-xs font-mono font-bold capitalize rounded-lg transition-all cursor-pointer ${
                  sort === s
                    ? "bg-primary text-surface shadow-sm"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Post List */}
        {!isCommunitiesLoading && selectedCommunityId && !error && (
          <div className="flex flex-col space-y-4">
            {/* Initial Posts Loading Skeleton */}
            {isPostsLoading && page === 1 ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((n) => (
                  <PostCardSkeleton key={n} />
                ))}
              </div>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}

            {/* Empty Post State */}
            {!isPostsLoading && posts.length === 0 && (
              <div className="bg-surface border border-border-muted rounded-2xl p-10 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-1">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="font-display text-lg font-bold text-primary">Nothing here yet</h3>
                <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">
                  Be the first to post and spark a discussion in this community!
                </p>
              </div>
            )}

            {/* Loading Indicator for Next Pages */}
            {isPostsLoading && page > 1 && (
              <div className="flex justify-center py-4">
                <div className="border-4 border-primary border-t-transparent animate-spin w-8 h-8 rounded-full" />
              </div>
            )}

            {/* Load More Button */}
            {!isPostsLoading && hasMore && (
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

      {/* Floating Action Button — Mobile Only (< lg) */}
      {!isCommunitiesLoading && selectedCommunityId && (
        <button
          id="fab-new-post"
          onClick={() => setIsComposing(true)}
          aria-label="New post"
          className="fixed bottom-6 right-5 z-40 lg:hidden flex items-center gap-2 bg-primary hover:bg-[#1F3E23] active:scale-95 text-white font-sans font-bold text-sm px-5 py-3.5 rounded-full shadow-lg transition-all cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Post
        </button>
      )}

      {/* Compose Modal */}
      {isComposing && selectedCommunityId && (
        <ComposePost
          communityId={selectedCommunityId}
          communityName={
            communities.find((c) => c.id === selectedCommunityId)?.name ?? "community"
          }
          onSuccess={handlePostCreated}
          onClose={() => setIsComposing(false)}
        />
      )}
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 py-6 max-w-2xl mx-auto">
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      }
    >
      <FeedContent />
    </Suspense>
  );
}
