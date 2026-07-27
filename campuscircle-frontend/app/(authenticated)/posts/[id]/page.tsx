"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { AnonAvatar } from "@/components/AnonAvatar";
import { VoteControl } from "@/components/VoteControl";
import { CommentThread } from "@/components/CommentThread";
import { ReplyComposer } from "@/components/ReplyComposer";
import { PostCardSkeleton, CommentSkeleton } from "@/components/PostCardSkeleton";
import { ThreadView } from "@/components/ThreadView";

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

interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  depth: number;
  score: number;
  is_deleted: boolean;
  created_at: string;
}

function getRelativeTime(dateString: string): string {
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch (_) {
    return "recently";
  }
}

export default function PostDetailPage() {
  const { id } = useParams();
  const { isAuthenticated } = useAuth();
  
  const postId = id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [threadParts, setThreadParts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  
  const [isPostLoading, setIsPostLoading] = useState(true);
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Post & optional Thread details
  useEffect(() => {
    if (!isAuthenticated || !postId) return;

    const fetchPostAndThread = async () => {
      setIsPostLoading(true);
      setError(null);
      try {
        const data = await apiRequest<Post>(`/api/v1/posts/${postId}`);
        setPost(data);

        // If this post is part of a multi-part thread, fetch all parts
        if (data.thread_total_parts && data.thread_total_parts > 1) {
          try {
            const partsData = await apiRequest<Post[]>(`/api/v1/posts/${postId}/thread`);
            if (Array.isArray(partsData) && partsData.length > 0) {
              setThreadParts(partsData);
            }
          } catch (threadErr) {
            console.error("Failed to load thread sequence:", threadErr);
          }
        } else {
          setThreadParts([]);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Post not found.");
        }
      } finally {
        setIsPostLoading(false);
      }
    };

    fetchPostAndThread();
  }, [isAuthenticated, postId]);

  // 2. Fetch Comments
  useEffect(() => {
    if (!isAuthenticated || !postId) return;

    const fetchComments = async () => {
      setIsCommentsLoading(true);
      try {
        const data = await apiRequest<Comment[]>(`/api/v1/posts/${postId}/comments`);
        setComments(data);
      } catch (_) {
        setComments([]);
      } finally {
        setIsCommentsLoading(false);
      }
    };

    fetchComments();
  }, [isAuthenticated, postId]);

  const handleCommentSuccess = (newComment: Comment) => {
    setComments((prev) => [newComment, ...prev]);
    if (post) {
      setPost({ ...post, comment_count: post.comment_count + 1 });
    }
  };

  const is404 = error?.toLowerCase().includes("not found");
  const postRelativeTime = post ? getRelativeTime(post.created_at) : "";

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-ink/60 hover:text-primary transition-colors py-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Feed
        </Link>
      </div>

      {/* Main Content Area */}
      {is404 ? (
        /* 404 Empty State */
        <div className="bg-surface border border-border-muted rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-background text-ink/40 mb-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-ink">Post Not Found</h3>
            <p className="font-sans text-sm text-ink/60 max-w-sm mx-auto">
              This post doesn't exist, was deleted, or belongs to another university circle.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/feed"
              className="inline-block py-2.5 px-6 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              Back to Feed
            </Link>
          </div>
        </div>
      ) : error ? (
        /* General Error State with Retry */
        <div className="bg-surface border border-red-200 rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-red-700">Couldn't load post</h3>
            <p className="font-sans text-sm text-ink/75 max-w-xs mx-auto">{error}</p>
          </div>
          <div className="flex justify-center gap-3">
            <Link
              href="/feed"
              className="py-2.5 px-4 border border-border-muted bg-surface text-ink/75 font-sans font-semibold text-sm rounded-xl hover:bg-background transition-all"
            >
              Back to Feed
            </Link>
            <button
              onClick={() => {
                setError(null);
                setIsPostLoading(true);
                setIsCommentsLoading(true);
                apiRequest<Post>(`/api/v1/posts/${postId}`)
                  .then((data) => {
                    setPost(data);
                    return apiRequest<Comment[]>(`/api/v1/posts/${postId}/comments`);
                  })
                  .then((commentsData) => setComments(commentsData))
                  .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load post."))
                  .finally(() => {
                    setIsPostLoading(false);
                    setIsCommentsLoading(false);
                  });
              }}
              className="py-2.5 px-5 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold text-sm rounded-xl transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          </div>
        </div>
      ) : null}

      {/* Post Loading Skeleton */}
      {isPostLoading && !error && (
        <PostCardSkeleton />
      )}

      {/* Post Details Card / Connected Thread View */}
      {post && !error && (
        threadParts.length > 1 ? (
          <ThreadView parts={threadParts} />
        ) : (
          <article className="bg-surface border border-border-muted rounded-2xl p-5 space-y-4 shadow-sm">
            {/* Author Header */}
            <div className="flex items-center gap-2.5">
              <AnonAvatar username={post.author_username} size={38} shape="circle" />
              <div className="flex flex-col">
                <span className="font-mono text-xs text-accent font-semibold tracking-tight">
                  @{post.author_username}
                </span>
                <span className="text-[10px] text-ink/40 font-sans">
                  {postRelativeTime}
                </span>
              </div>
            </div>

            {/* Title & Body */}
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold text-ink leading-snug">
                {post.title}
              </h2>
              <p className="font-sans text-sm text-ink/80 leading-relaxed break-words whitespace-pre-wrap">
                {post.content}
              </p>
            </div>

            {/* Voting Bar */}
            <div className="pt-2 border-t border-border-muted/50 flex justify-between items-center">
              <VoteControl targetId={post.id} targetType="post" initialScore={post.score} />
            </div>
          </article>
        )
      )}

      {/* Write Comment Box */}
      {post && !error && (
        <section className="bg-surface border border-border-muted rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="font-display text-base font-bold text-primary">Share your thoughts</h3>
          <ReplyComposer
            postId={post.id}
            parentId={null}
            placeholder="What are your thoughts? Keep it academic..."
            onSuccess={handleCommentSuccess}
          />
        </section>
      )}

      {/* Comments Section */}
      {post && !error && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border-muted/50 pb-2">
            <h3 className="font-display text-base font-bold text-primary">
              Discussion ({post.comment_count})
            </h3>
          </div>

          {isCommentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <CommentSkeleton key={n} />
              ))}
            </div>
          ) : (
            <CommentThread
              comments={comments}
              postId={post.id}
              onAddComment={handleCommentSuccess}
              focusCommentId={focusCommentId}
              onSetFocusCommentId={setFocusCommentId}
            />
          )}
        </section>
      )}
    </div>
  );
}
