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

  // 3. Tab Select Handler — updates URL via router.push
  const handleSelectCommunity = (id: string) => {
    setSelectedCommunityId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("community", id);
    router.push(`/feed?${params.toString()}`, { scroll: false });
  };

  const handleSelectTag = (tag: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tag) {
      params.set("tag", tag);
    } else {
      params.delete("tag");
    }
    router.push(`/feed?${params.toString()}`, { scroll: false });
  };

  // 4. Fetch Posts callback
  const fetchPosts = useCallback(
    async (
      communityId: string | null,
      currentSort: SortType,
      currentPage: number,
      activeTag: string | null,
      append = false
    ) => {
      setIsPostsLoading(true);
      setError(null);
      try {
        let endpoint = "";
        if (currentSort === "for-you") {
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

  // 5. Trigger Post fetch when community, sort, or tag changes
  useEffect(() => {
    if (sort !== "for-you" && !selectedCommunityId) return;
    setPage(1);
    fetchPosts(selectedCommunityId, sort, 1, tagQueryParam, false);
  }, [selectedCommunityId, sort, tagQueryParam, fetchPosts]);

  // 6. Load More handler
  const handleLoadMore = () => {
    if (isPostsLoading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(selectedCommunityId, sort, nextPage, tagQueryParam, true);
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
    <div className="flex-1 text-ink font-sans flex flex-col lg:flex-row lg:gap-8 pb-16">
      {/* Community Tabs Sidebar */}
      {!isCommunitiesLoading && (
        <CommunityTabs
          communities={communities}
          selectedId={selectedCommunityId}
          onSelect={handleSelectCommunity}
          onCommunityCreated={handleCommunityCreated}
          onComposePost={selectedCommunityId ? () => setIsComposing(true) : undefined}
        />
      )}

      {/* Main Feed Column */}
      <div className="flex-1 max-w-2xl w-full mx-auto lg:mx-0 px-4 lg:px-0 mt-6 flex flex-col space-y-6">
        {/* Active Tag Filter Banner */}
        {tagQueryParam && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
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
                fetchPosts(selectedCommunityId, sort, 1, tagQueryParam, false);
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

        {/* Feed Sort Tabs: For You, New, Hot, Top */}
        {!isCommunitiesLoading && (communities.length > 0 || sort === "for-you") && !error && (
          <div className="flex bg-surface rounded-xl p-1 border border-border-muted max-w-sm mx-auto w-full">
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
              <div className="bg-surface border border-border-muted rounded-2xl p-10 text-center space-y-3">
                <h3 className="font-display text-lg font-bold text-primary">Nothing here yet</h3>
                <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">
                  {tagQueryParam
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
                className="w-full py-3 bg-surface border border-border-muted text-ink/75 hover:bg-background font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-sm text-sm"
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>

      {/* Trending Tags Sidebar (Desktop Right Column) */}
      <div className="hidden lg:block w-72 shrink-0 mt-6">
        <TrendingTags activeTag={tagQueryParam} onSelectTag={handleSelectTag} />
      </div>

      {/* Compose Dialog */}
      {isComposing && selectedCommunityId && (
        <ComposePost
          communityId={selectedCommunityId}
          communityName={communities.find((c) => c.id === selectedCommunityId)?.name || "community"}
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
