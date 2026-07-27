"use client";

import React, { useState, useMemo } from "react";
import { AnonAvatar } from "./AnonAvatar";
import { ReplyComposer } from "./ReplyComposer";
import { VoteControl } from "./VoteControl";
import { ReportDialog } from "./ReportDialog";

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

interface CommentThreadProps {
  comments: Comment[];
  postId: string;
  onAddComment: (comment: Comment) => void;
  focusCommentId: string | null;
  onSetFocusCommentId: (id: string | null) => void;
}

// Simple FNV-1a hashing
function getHashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Deterministic PRNG
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  choice<T>(list: T[]): T {
    const index = Math.floor(this.next() * list.length);
    return list[index];
  }
}

// Deterministic username from author_id
function getAnonUsername(authorId: string): string {
  const hash = getHashCode(authorId);
  const rand = new SeededRandom(hash);
  const adjectives = ["silent", "clever", "wise", "bold", "swift", "hidden", "studious", "curious", "enigmatic", "creative"];
  const animals = ["owl", "badger", "fox", "gator", "panda", "eagle", "beaver", "wolf", "coyote", "panther"];
  return `${rand.choice(adjectives)}_${rand.choice(animals)}`;
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
    return `${diffDays}d ago`;
  } catch (_) {
    return "recently";
  }
}

export const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  postId,
  onAddComment,
  focusCommentId,
  onSetFocusCommentId,
}) => {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);

  // Group comments by their parent_id
  const commentsByParent = useMemo(() => {
    const map: { [parentId: string]: Comment[] } = {};
    comments.forEach((c) => {
      const pId = c.parent_id || "root";
      if (!map[pId]) map[pId] = [];
      map[pId].push(c);
    });
    return map;
  }, [comments]);

  // Recursively counts total replies for a specific comment
  const countReplies = (commentId: string): number => {
    let count = 0;
    const directChildren = commentsByParent[commentId] || [];
    count += directChildren.length;
    directChildren.forEach((child) => {
      count += countReplies(child.id);
    });
    return count;
  };

  // Find the focused comment if set
  const focusedComment = useMemo(() => {
    if (!focusCommentId) return null;
    return comments.find((c) => c.id === focusCommentId) || null;
  }, [comments, focusCommentId]);

  // Recursive renderer for comment nodes
  const renderCommentNode = (comment: Comment, visualDepth: number) => {
    const username = getAnonUsername(comment.author_id);
    const relativeTime = getRelativeTime(comment.created_at);
    const directReplies = commentsByParent[comment.id] || [];
    const totalRepliesCount = countReplies(comment.id);
    const isReplying = activeReplyId === comment.id;

    return (
      <div key={comment.id} className="flex flex-col">
        {/* Comment Card */}
        <div className="bg-surface border border-border-muted/60 rounded-xl p-4 space-y-2.5 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-2">
            <AnonAvatar username={username} size={28} shape="circle" />
            <div className="flex flex-col">
              <span className="font-mono text-xs text-accent font-semibold tracking-tight">
                @{username}
              </span>
              <span className="text-[9px] text-ink/40 font-sans">
                {relativeTime}
              </span>
            </div>
          </div>

          {/* Content */}
          <p className="font-sans text-sm text-ink/85 break-words leading-relaxed">
            {comment.content}
          </p>

          {/* Footer Controls */}
          <div className="flex items-center gap-4 text-xs font-semibold text-ink/65 pt-1">
            <VoteControl targetId={comment.id} targetType="comment" initialScore={comment.score} />
            <button
              onClick={() => setActiveReplyId(isReplying ? null : comment.id)}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Reply
            </button>
            <button
              onClick={() => setReportingCommentId(comment.id)}
              aria-label="Report comment"
              className="ml-auto text-ink/30 hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              Report
            </button>
          </div>

          {/* Inline Reply Composer */}
          {isReplying && (
            <div className="pt-2 border-t border-border-muted/30">
              <ReplyComposer
                postId={postId}
                parentId={comment.id}
                placeholder={`Replying to @${username}...`}
                autoFocus
                onSuccess={(newComment) => {
                  onAddComment(newComment);
                  setActiveReplyId(null);
                }}
                onCancel={() => setActiveReplyId(null)}
              />
            </div>
          )}
        </div>

        {/* Children Render Logic */}
        {directReplies.length > 0 && (
          <div className="pl-4 border-l-2 border-border-muted/40 ml-4 mt-2 space-y-3 flex flex-col">
            {/* If visualDepth is less than 2, render inline children with incremented depth */}
            {visualDepth < 2 ? (
              directReplies.map((reply) => renderCommentNode(reply, visualDepth + 1))
            ) : (
              /* If visualDepth exceeds 2, show "Continue Thread" link instead of deeper nesting */
              <button
                onClick={() => onSetFocusCommentId(comment.id)}
                className="text-xs font-sans font-semibold text-primary hover:underline flex items-center gap-1.5 py-1 px-3 bg-surface border border-border-muted/40 rounded-full w-max shadow-sm cursor-pointer"
              >
                Continue thread ({totalRepliesCount} {totalRepliesCount === 1 ? "reply" : "replies"}) →
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // If a specific comment is focused, render it as root
  if (focusedComment) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-xs font-semibold text-accent-foreground">
          <span>Showing replies for @{getAnonUsername(focusedComment.author_id)}</span>
          <button
            onClick={() => onSetFocusCommentId(null)}
            className="text-primary hover:underline cursor-pointer"
          >
            Show all comments
          </button>
        </div>
        <div className="space-y-4">
          {renderCommentNode(focusedComment, 0)}
        </div>
      </div>
    );
  }

  // Render top-level comments (parent_id is null)
  const rootComments = commentsByParent["root"] || [];

  if (rootComments.length === 0) {
    return (
      <>
        <div className="bg-surface border border-border-muted rounded-2xl p-8 text-center space-y-2">
          <h4 className="font-display text-base font-bold text-primary">No comments yet</h4>
          <p className="font-sans text-xs text-ink/70">
            Be the first to share your thoughts on this post!
          </p>
        </div>
        {reportingCommentId && (
          <ReportDialog
            targetId={reportingCommentId}
            targetType="comment"
            onClose={() => setReportingCommentId(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {rootComments.map((comment) => renderCommentNode(comment, 0))}
      </div>
      {reportingCommentId && (
        <ReportDialog
          targetId={reportingCommentId}
          targetType="comment"
          onClose={() => setReportingCommentId(null)}
        />
      )}
    </>
  );
};
