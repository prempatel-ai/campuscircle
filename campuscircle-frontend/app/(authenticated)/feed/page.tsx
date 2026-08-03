"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { CommunityTabs } from "@/components/CommunityTabs";
import { PostCard } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/PostCardSkeleton";
import { ComposePost } from "@/components/ComposePost";
import { CreateCommunityDialog } from "@/components/CreateCommunityDialog";
import { TrendingTags } from "@/components/TrendingTags";

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

type SortType = "for-you" | "new" | "hot" | "top";

const SORT_OPTIONS: SortType[] = ["for-you", "new", "hot", "top"];
const PAGE_SIZE = 10;

function FeedContent() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const communityQueryParam = searchParams.get("community");
  const tagQueryParam = searchParams.get("tag");
  const searchQueryParam = searchParams.get("search");

  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<SortType>("for-you");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const [isCommunitiesLoading, setIsCommunitiesLoading] = useState(true);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);

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

  // 2. Sync selectedCommunityId with URL query param
  useEffect(() => {
    if (communities.length === 0) return;

    if (communityQueryParam) {
      const match = communities.find((c) => c.id === communityQueryParam);
      if (match) {
        setSelectedCommunityId(match.id);
        return;
      }
    }

    const firstId = communities[0].id;
    setSelectedCommunityId(firstId);
  }, [communities, communityQueryParam]);

  // 3. Tab & Tag Select Handlers
  const handleSelectCommunity = (id: string) => {
    setSelectedCommunityId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("community", id);
    params.delete("search");
    router.push(`/feed?${params.toString()}`, { scroll: false });
  };

  const handleSelectTag = (tag: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tag) {
      params.set("tag", tag);
    } else {
      params.delete("tag");
    }
    params.delete("search");
    router.push(`/feed?${params.toString()}`, { scroll: false });
  };

  const handleClearSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    router.push(`/feed?${params.toString()}`, { scroll: false });
  };

  // 4. Fetch Posts callback
  const fetchPosts = useCallback(
    async (
      communityId: string | null,
      currentSort: SortType,
      currentPage: number,
      activeTag: string | null,
      activeSearch: string | null,
      append = false
    ) => {
      setIsPostsLoading(true);
      setError(null);
      try {
        let endpoint = "";
        if (activeSearch) {
          endpoint = `/api/v1/posts/search?q=${encodeURIComponent(activeSearch)}&page=${currentPage}&size=${PAGE_SIZE}`;
        } else if (currentSort === "for-you") {
          endpoint = `/api/v1/feed/for-you?page=${currentPage}&size=${PAGE_SIZE}`;
        } else if (communityId) {
          endpoint = `/api/v1/communities/${communityId}/posts?sort=${currentSort}&page=${currentPage}&size=${PAGE_SIZE}${
            activeTag ? `&tag=${encodeURIComponent(activeTag)}` : ""
          }`;
        } else {
          setIsPostsLoading(false);
          return;
        }

        const response = await apiRequest<PaginatedResponse<Post>>(endpoint);

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

  // 5. Trigger Post fetch when community, sort, tag, or search changes
  useEffect(() => {
    if (!searchQueryParam && sort !== "for-you" && !selectedCommunityId) return;
    setPage(1);
    fetchPosts(selectedCommunityId, sort, 1, tagQueryParam, searchQueryParam, false);
  }, [selectedCommunityId, sort, tagQueryParam, searchQueryParam, fetchPosts]);

  // 6. Load More handler
  const handleLoadMore = () => {
    if (isPostsLoading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(selectedCommunityId, sort, nextPage, tagQueryParam, searchQueryParam, true);
  };

  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev]);
    setIsComposing(false);
  };

  const handleCommunityCreated = (newCommunity: Community) => {
    setCommunities((prev) => [...prev, newCommunity]);
    setSelectedCommunityId(newCommunity.id);
    setIsCreatingCommunity(false);
  };

  return (
    <div className="flex-1 text-ink font-sans grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 py-6 items-start pb-16">
      {/* 1. Left Sidebar Column */}
      <div className="lg:col-span-3 lg:sticky lg:top-20">
        {!isCommunitiesLoading && (
          <CommunityTabs
            communities={communities}
            selectedId={selectedCommunityId}
            onSelect={handleSelectCommunity}
            onCommunityCreated={handleCommunityCreated}
            onComposePost={selectedCommunityId ? () => setIsComposing(true) : undefined}
            onRequestCreate={() => setIsCreatingCommunity(true)}
          />
        )}
      </div>

      {/* 2. Main Center Feed Column */}
      <div className="lg:col-span-6 w-full flex flex-col space-y-6">
        {/* Search Results Filter Banner */}
        {searchQueryParam && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-sans text-ink/80">Search results for:</span>
              <span className="font-mono text-sm font-bold text-primary">"{searchQueryParam}"</span>
            </div>
            <button
              onClick={handleClearSearch}
              className="text-xs font-sans text-primary hover:underline font-bold cursor-pointer"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Active Tag Filter Banner */}
        {tagQueryParam && !searchQueryParam && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-sm font-sans text-ink/80">Filtering posts tagged:</span>
              <span className="font-mono text-sm font-bold text-primary">#{tagQueryParam}</span>
            </div>
            <button
              onClick={() => handleSelectTag(null)}
              className="text-xs font-sans text-primary hover:underline font-bold cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-surface border border-red-200 rounded-2xl p-6 text-center space-y-4 shadow-sm">
            <h3 className="font-display text-lg font-bold text-red-700">Couldn't load feed</h3>
            <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchPosts(selectedCommunityId, sort, 1, tagQueryParam, searchQueryParam, false);
              }}
              className="px-6 py-2.5 bg-primary text-surface font-sans font-semibold rounded-xl text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Communities Loading Skeleton */}
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

        {/* Zero Communities State */}
        {!isCommunitiesLoading && communities.length === 0 && !error && (
          <div className="bg-surface border border-border-muted rounded-2xl p-8 text-center space-y-4 shadow-2xs">
            <h2 className="font-display text-xl font-bold text-primary">No Communities Found</h2>
            <p className="font-sans text-sm text-ink/75 max-w-sm mx-auto">
              Your university doesn't have any communities set up yet. Create the first community!
            </p>
            <button
              onClick={() => setIsCreatingCommunity(true)}
              className="px-6 py-2.5 bg-primary text-surface font-sans font-bold text-sm rounded-xl"
            >
              Create First Community
            </button>
          </div>
        )}

        {/* Feed Sort Tabs */}
        {!isCommunitiesLoading && !searchQueryParam && (communities.length > 0 || sort === "for-you") && !error && (
          <div className="flex bg-surface rounded-xl p-1 border border-border-muted w-full shadow-2xs">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`flex-1 py-2 text-[11px] sm:text-xs font-mono font-bold capitalize rounded-lg transition-all cursor-pointer whitespace-nowrap text-center px-1 ${
                  sort === s
                    ? "bg-primary text-surface shadow-sm"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {s === "for-you" ? "For You" : s}
              </button>
            ))}
          </div>
        )}

        {/* Post List */}
        {!isCommunitiesLoading && !error && (
          <div className="flex flex-col space-y-4">
            {isPostsLoading && page === 1 ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((n) => (
                  <PostCardSkeleton key={n} />
                ))}
              </div>
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}

            {!isPostsLoading && posts.length === 0 && (
              <div className="bg-surface border border-border-muted rounded-2xl p-10 text-center space-y-3 shadow-2xs">
                <h3 className="font-display text-lg font-bold text-primary">Nothing here yet</h3>
                <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">
                  {searchQueryParam
                    ? `No posts or topics found matching "${searchQueryParam}".`
                    : tagQueryParam
                    ? `No posts found tagged #${tagQueryParam}.`
                    : "Be the first to post and spark a discussion!"}
                </p>
              </div>
            )}

            {isPostsLoading && page > 1 && (
              <div className="flex justify-center py-4">
                <div className="border-4 border-primary border-t-transparent animate-spin w-8 h-8 rounded-full" />
              </div>
            )}

            {!isPostsLoading && hasMore && (
              <button
                onClick={handleLoadMore}
                className="w-full py-3 bg-surface border border-border-muted text-ink/75 hover:bg-background font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-2xs text-sm"
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Right Sidebar Column */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 lg:sticky lg:top-20">
        <TrendingTags activeTag={tagQueryParam} onSelectTag={handleSelectTag} />

        {/* Campus Guidelines Card */}
        <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3 shadow-2xs">
          <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Campus Accountability</span>
          </h3>
          <p className="font-sans text-xs text-ink/75 leading-relaxed">
            CampusCircle pairs verified student emails with pseudonymous handles. Be candid, respectful, and helpful to your peers.
          </p>
        </div>
      </div>

      {/* Mobile Floating Action Button (+ New Post) */}
      <button
        onClick={() => setIsComposing(true)}
        aria-label="Create new post"
        className="md:hidden fixed right-4 bottom-20 z-40 w-12 h-12 bg-primary hover:bg-[#1F3E23] text-surface rounded-full shadow-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Compose Dialog */}
      {isComposing && (
        <ComposePost
          communityId={selectedCommunityId || communities[0]?.id || ""}
          communityName={communities.find((c) => c.id === selectedCommunityId)?.name || communities[0]?.name || "community"}
          onClose={() => setIsComposing(false)}
          onSuccess={handlePostCreated}
        />
      )}

      {/* Create Community Dialog */}
      {isCreatingCommunity && (
        <CreateCommunityDialog
          onClose={() => setIsCreatingCommunity(false)}
          onSuccess={handleCommunityCreated}
        />
      )}
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full" />
        </div>
      }
    >
      <FeedContent />
    </Suspense>
  );
}
