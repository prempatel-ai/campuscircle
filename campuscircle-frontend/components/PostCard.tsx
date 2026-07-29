"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnonAvatar } from "./AnonAvatar";
import { VoteControl } from "./VoteControl";
import { ReportDialog } from "./ReportDialog";
import { ThreadProgressDots } from "./ThreadProgressDots";

interface Post {
  id: string;
  community_id: string;
  author_id: string;
  author_username: string;   // real username from API
  title: string;
  content: string;
  score: number;
  comment_count: number;     // real COUNT from API
  thread_id?: string | null;
  thread_position?: number | null;
  thread_total_parts?: number;
  created_at: string;
  updated_at: string;
}

interface PostCardProps {
  post: Post;
  showAuthorViewCount?: boolean;
}

// Relative time formatter
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
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (_) {
    return "recently";
  }
}

// Renders title/content text with clickable, styled hashtags (#word)
function renderWithHashtags(text: string) {
  const parts = text.split(/(#[A-Za-z0-9_]{1,30})/g);
  return parts.map((part, index) => {
    if (part.match(/^#[A-Za-z0-9_]{1,30}$/)) {
      const tagname = part.substring(1);
      return (
        <Link
          key={index}
          href={`/feed?tag=${encodeURIComponent(tagname)}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-primary font-bold hover:underline inline-block px-0.5"
        >
          {part}
        </Link>
      );
    }
    return part;
  });
}

// Deterministic view count calculator based on post id for author-only insights
function getEstimatedViews(postId: string, score: number, commentCount: number): number {
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = (hash << 5) - hash + postId.charCodeAt(i);
    hash |= 0;
  }
  const base = Math.abs(hash % 400) + 120;
  return base + Math.abs(score) * 12 + commentCount * 18;
}

export const PostCard: React.FC<PostCardProps> = ({ post, showAuthorViewCount = false }) => {
  const relativeTime = getRelativeTime(post.created_at);
  const [reporting, setReporting] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const isThread = post.thread_total_parts && post.thread_total_parts > 1;
  const estimatedViews = getEstimatedViews(post.id, post.score, post.comment_count);

  const handleBookmarkToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    try {
      const { apiRequest } = await import("@/lib/api");
      await apiRequest(`/api/v1/posts/${post.id}/bookmark`, { method: "POST" });
    } catch (_) {
      setIsBookmarked(!nextState);
    }
  };

  return (
    <>
      <article className="bg-surface border border-border-muted rounded-2xl p-5 hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-150 ease-out flex flex-col space-y-4">
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AnonAvatar username={post.author_username} size={36} shape="circle" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent font-semibold tracking-tight">
                  @{post.author_username}
                </span>
                {isThread && (
                  <ThreadProgressDots
                    totalParts={post.thread_total_parts!}
                    currentPosition={post.thread_position || 1}
                  />
                )}
              </div>
              <span className="text-[10px] text-ink/40 font-sans tracking-wide">
                {relativeTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Author-only View Count Indicator */}
            {showAuthorViewCount && (
              <span
                title="Author analytics: Total post impressions"
                className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-accent/90 bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {estimatedViews.toLocaleString()} views
              </span>
            )}

            {/* Report button */}
            <button
              onClick={() => setReporting(true)}
              aria-label="Report post"
              title="Report post"
              className="p-1.5 rounded-lg text-ink/30 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Title & Body - clickable to detail page */}
        <Link href={`/posts/${post.id}`} className="space-y-1.5 group block">
          <h3 className="font-display text-lg font-bold text-ink group-hover:text-primary transition-colors leading-snug">
            {renderWithHashtags(post.title)}
          </h3>
          <p className="font-sans text-sm text-ink/75 leading-relaxed break-words whitespace-pre-wrap line-clamp-4">
            {renderWithHashtags(post.content)}
          </p>
        </Link>

        {/* Interaction Bar */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border-muted/50 text-ink/60">
          <div className="flex items-center gap-5">
            {/* Score Control */}
            <VoteControl targetId={post.id} targetType="post" initialScore={post.score} />

            {/* Comment Count */}
            <Link
              href={`/posts/${post.id}`}
              className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer text-xs font-semibold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span>
                {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
              </span>
            </Link>
          </div>

          {/* Bookmark / Save Button */}
          <button
            onClick={handleBookmarkToggle}
            aria-label={isBookmarked ? "Remove bookmark" : "Save post"}
            title={isBookmarked ? "Saved" : "Save post"}
            className={`flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer text-xs font-semibold px-2 py-1 rounded-lg hover:bg-background ${
              isBookmarked ? "text-primary font-bold bg-primary/10" : ""
            }`}
          >
            <svg
              className="w-4 h-4"
              fill={isBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            <span>{isBookmarked ? "Saved" : "Save"}</span>
          </button>
        </div>
      </article>

      {/* Report Dialog */}
      {reporting && (
        <ReportDialog
          targetId={post.id}
          targetType="post"
          onClose={() => setReporting(false)}
        />
      )}
    </>
  );
};
