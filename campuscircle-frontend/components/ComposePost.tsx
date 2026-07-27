"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";
import { AnonAvatar } from "./AnonAvatar";

interface Post {
  id: string;
  community_id: string;
  author_id: string;
  author_username: string;
  title: string;
  content: string;
  score: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface ComposePostProps {
  communityId: string;
  communityName: string;
  onSuccess: (post: Post) => void;
  onClose: () => void;
}

const TITLE_MAX = 300;
const CONTENT_MAX = 4000;
const MAX_PARTS = 25;

function ProgressRing({ current, max }: { current: number; max: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius; // ~62.83
  const ratio = Math.min(Math.max(current / max, 0), 1);
  const strokeDashoffset = circumference - ratio * circumference;

  const isNearLimit = current >= max - 20 && current <= max;
  const isOverLimit = current > max;

  const strokeColor = isOverLimit
    ? "#EF4444"
    : isNearLimit
    ? "#EAB308"
    : ratio > 0.85
    ? "#F59E0B"
    : "#2D5A27";

  return (
    <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
      <svg className="w-6 h-6 -rotate-90 transform" viewBox="0 0 28 28">
        <circle
          cx="14"
          cy="14"
          r={radius}
          stroke="#E5E7EB"
          strokeWidth="2.5"
          fill="none"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset,
            transition: "stroke-dashoffset 150ms ease-out, stroke 150ms ease-out"
          }}
        />
      </svg>
      {isNearLimit && (
        <span className="absolute font-mono text-[8px] font-bold text-ink/70">
          {max - current}
        </span>
      )}
    </div>
  );
}

export const ComposePost: React.FC<ComposePostProps> = ({
  communityId,
  communityName,
  onSuccess,
  onClose,
}) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 150);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) handleClose();
  };

  const addPart = () => {
    if (parts.length >= MAX_PARTS) return;
    setParts((prev) => [...prev, ""]);
  };

  const removePart = (index: number) => {
    if (parts.length <= 1) return;
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePart = (index: number, val: string) => {
    setParts((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }
    if (trimmedTitle.length < 3) {
      setError("Title must be at least 3 characters.");
      return;
    }

    const trimmedParts = parts.map((p) => p.trim());
    
    // Validation for single vs thread
    if (parts.length === 1) {
      if (trimmedParts[0].length < 3) {
        setError("Post content must be at least 3 characters.");
        return;
      }
    } else {
      const invalidIdx = trimmedParts.findIndex((p) => p.length < 3);
      if (invalidIdx !== -1) {
        setError(`Part ${invalidIdx + 1} must contain at least 3 characters.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (parts.length === 1) {
        const newPost = await apiRequest<Post>(
          `/api/v1/communities/${communityId}/posts`,
          {
            method: "POST",
            body: JSON.stringify({ title: trimmedTitle, content: trimmedParts[0] }),
          }
        );
        onSuccess(newPost);
      } else {
        const createdThread = await apiRequest<Post[]>(
          `/api/v1/communities/${communityId}/posts/thread`,
          {
            method: "POST",
            body: JSON.stringify({
              title: trimmedTitle,
              parts: trimmedParts,
            }),
          }
        );
        if (createdThread && createdThread.length > 0) {
          onSuccess(createdThread[0]);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleLength = title.length;
  const titleOverLimit = titleLength > TITLE_MAX;

  const isAnyPartInvalid = parts.some((p) => p.trim().length < 3 || p.length > CONTENT_MAX);

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm px-0 sm:px-4 transition-opacity duration-150 ${
        isClosing ? "opacity-0" : "animate-backdrop-in"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-title"
    >
      {/* Sheet / Modal */}
      <div
        className={`w-full sm:max-w-xl bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden transition-all duration-150 ${
          isClosing ? "opacity-0 scale-95" : "animate-modal-in"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-muted/60 shrink-0">
          <div className="flex items-center gap-3">
            <AnonAvatar username={user?.username || "anonymous"} size={34} shape="circle" />
            <div>
              <h2
                id="compose-title"
                className="font-display text-base font-bold text-primary flex items-center gap-2"
              >
                <span>{parts.length > 1 ? "New Thread" : "New Post"}</span>
                <span className="font-mono text-xs font-semibold text-accent">@{user?.username || "you"}</span>
              </h2>
              <p className="font-mono text-xs text-ink/50 mt-0.5">
                in #{communityName}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close composer"
            className="p-2 rounded-xl hover:bg-background text-ink/50 hover:text-ink transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-y-auto"
          noValidate
        >
          <div className="flex flex-col gap-5 px-6 py-5 flex-1">
            {/* Error Banner */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-r-xl text-sm font-sans text-red-700 font-semibold">
                {error}
              </div>
            )}

            {/* Title Field — Open Canvas Style */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="post-title"
                  className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wide"
                >
                  Title <span className="text-red-500">*</span>
                </label>
                <ProgressRing current={titleLength} max={TITLE_MAX} />
              </div>
              <input
                ref={titleRef}
                id="post-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                maxLength={TITLE_MAX}
                placeholder="Title..."
                className="w-full bg-transparent border-0 border-b border-border-muted/50 rounded-none px-0 pb-2.5 font-display text-xl font-bold text-ink placeholder:text-ink/35 placeholder:font-normal focus:outline-none focus:ring-0 focus:border-primary/60 transition-colors"
                disabled={isSubmitting}
              />
            </div>

            {/* Thread Parts List — Open Canvas Style */}
            <div className="space-y-4">
              {parts.map((partContent, idx) => {
                return (
                  <div key={idx} className="space-y-1.5 flex flex-col">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wide flex items-center gap-2">
                        <span>{parts.length > 1 ? `Part ${idx + 1}` : "Details"}</span>
                        {parts.length > 1 && idx === 0 && (
                          <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            First Post
                          </span>
                        )}
                      </label>
                      <div className="flex items-center gap-3">
                        <ProgressRing current={partContent.length} max={CONTENT_MAX} />
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => removePart(idx)}
                            className="p-1 rounded-lg text-ink/40 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove part"
                            aria-label={`Remove Part ${idx + 1}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={partContent}
                      onChange={(e) => updatePart(idx, e.target.value.slice(0, CONTENT_MAX))}
                      maxLength={CONTENT_MAX}
                      placeholder={
                        idx === 0
                          ? "Expand your thoughts, share context, ask questions..."
                          : `Add to your thread (Part ${idx + 1})...`
                      }
                      rows={parts.length > 1 ? 3 : 5}
                      className="w-full bg-transparent border-0 border-b border-border-muted/40 rounded-none px-0 pb-2 font-sans text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-0 focus:border-primary/60 resize-none transition-colors"
                      disabled={isSubmitting}
                    />
                  </div>
                );
              })}

              {/* "+ Add to thread" Action Section */}
              <div className="pt-1 flex items-center justify-between">
                {parts.length < MAX_PARTS ? (
                  <button
                    type="button"
                    id="add-thread-part-btn"
                    onClick={addPart}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold text-primary bg-primary/10 hover:bg-primary/15 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    + Add to thread {parts.length > 1 ? `(Part ${parts.length + 1})` : ""}
                  </button>
                ) : (
                  <p className="font-mono text-xs text-accent font-semibold bg-accent/10 px-3.5 py-2.5 rounded-xl border border-accent/20">
                    Maximum thread length reached (25 parts)
                  </p>
                )}

                {parts.length > 1 && (
                  <span className="font-mono text-xs font-bold text-ink/60 bg-surface px-3 py-1.5 rounded-lg border border-border-muted/60 shadow-xs">
                    {parts.length} / {MAX_PARTS} parts
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border-muted/60 bg-background shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 border border-border-muted bg-surface hover:bg-background text-ink/70 font-sans font-semibold rounded-xl text-xs transition-all cursor-pointer"
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              id="compose-submit"
              disabled={isSubmitting || titleOverLimit || title.trim().length < 3 || isAnyPartInvalid}
              className="px-6 py-2.5 bg-primary hover:bg-[#1F3E23] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-sans font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Posting…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  {parts.length > 1 ? `Post thread (${parts.length})` : "Post"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
