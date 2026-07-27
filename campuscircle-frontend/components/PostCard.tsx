"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnonAvatar } from "./AnonAvatar";
import { VoteControl } from "./VoteControl";
import { ReportDialog } from "./ReportDialog";

interface Post {
  id: string;
  community_id: string;
  author_id: string;
  author_username: string;   // real username from API — never fabricated
  title: string;
  content: string;
  score: number;
  comment_count: number;     // real COUNT from API — never fabricated
  thread_id?: string | null;
  thread_position?: number | null;
  thread_total_parts?: number;
  created_at: string;
  updated_at: string;
}

interface PostCardProps {
  post: Post;
}

// Relative time formatter — only non-data utility kept in this file
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

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const relativeTime = getRelativeTime(post.created_at);
  const [reporting, setReporting] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const isThread = post.thread_total_parts && post.thread_total_parts > 1;

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
            {/* AnonAvatar seeds from the real username so it's still deterministic */}
            <AnonAvatar username={post.author_username} size={36} shape="circle" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent font-semibold tracking-tight">
                  @{post.author_username}
                </span>
                {isThread && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                    🧵 1/{post.thread_total_parts}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-ink/40 font-sans tracking-wide">
                {relativeTime}
              </span>
            </div>
          </div>

          {/* Report button — top-right corner of header */}
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

        {/* Title & Body - clickable to detail page */}
        <Link href={`/posts/${post.id}`} className="space-y-1.5 group block">
          <h3 className="font-display text-lg font-bold text-ink group-hover:text-primary transition-colors leading-snug">
            {post.title}
          </h3>
          <p className="font-sans text-sm text-ink/75 leading-relaxed break-words whitespace-pre-wrap line-clamp-4">
            {post.content}
          </p>
        </Link>

        {/* Interaction Bar */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border-muted/50 text-ink/60">
          <div className="flex items-center gap-5">
            {/* Score Control */}
            <VoteControl targetId={post.id} targetType="post" initialScore={post.score} />

            {/* Comment Count — real value from API, links to post detail */}
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

      {/* Report Dialog — rendered outside article so it escapes the card stacking context */}
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
