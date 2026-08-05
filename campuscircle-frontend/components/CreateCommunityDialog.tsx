"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiRequest, ApiError } from "@/lib/api";

interface Community {
  id: string;
  name: string;
  description: string | null;
}

interface CreateCommunityDialogProps {
  onSuccess: (community: Community) => void;
  onClose: () => void;
}

const NAME_MAX = 64;
const DESC_MAX = 500;

export const CreateCommunityDialog: React.FC<CreateCommunityDialogProps> = ({
  onSuccess,
  onClose,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedDesc = description.trim();

    if (!trimmedName) {
      setError("Community name is required.");
      nameRef.current?.focus();
      return;
    }
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const community = await apiRequest<Community>("/api/v1/communities", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDesc || null,
        }),
      });
      onSuccess(community);
    } catch (err) {
      if (err instanceof ApiError) {
        // Surface the 409 duplicate-name message directly — requirement says
        // "show the actual 409 error message, not a silent failure"
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const nameRemaining = NAME_MAX - name.length;
  const nameNearLimit = nameRemaining <= 15;
  const nameOverLimit = nameRemaining < 0;

  const descRemaining = DESC_MAX - description.length;
  const descNearLimit = descRemaining <= 60;

  const canSubmit = name.trim().length >= 2 && !nameOverLimit && !isSubmitting;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-community-title"
    >
      <div className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-muted/60 shrink-0">
          <div>
            <h2
              id="create-community-title"
              className="font-display text-lg font-bold text-primary"
            >
              New Community
            </h2>
            <p className="font-sans text-xs text-ink/75 mt-0.5">
              Visible to your university only
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-xl hover:bg-background text-ink/60 hover:text-ink transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col overflow-y-auto"
          noValidate
        >
          <div className="flex flex-col gap-5 px-5 py-5">
            {/* 409 / API Error Banner */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-r-xl text-sm font-sans text-red-700 font-semibold leading-snug">
                {error}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="community-name"
                  className="font-mono text-xs text-ink/75 font-semibold uppercase tracking-wide"
                >
                  Name <span className="text-red-500">*</span>
                </label>
                <span
                  className={`font-mono text-xs font-semibold transition-colors ${
                    nameOverLimit
                      ? "text-red-600"
                      : nameNearLimit
                      ? "text-accent"
                      : "text-ink/40"
                  }`}
                >
                  {nameRemaining}
                </span>
              </div>
              <input
                ref={nameRef}
                id="community-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setError(null);
                  setName(e.target.value.slice(0, NAME_MAX + 1));
                }}
                placeholder="e.g. Late Night Study, CS Majors, Campus Jobs…"
                className={`w-full px-4 py-3 bg-background border rounded-xl font-sans text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 transition-all ${
                  nameOverLimit
                    ? "border-red-400 focus:ring-red-300"
                    : "border-border-muted focus:ring-primary/30 focus:border-primary/40"
                }`}
                disabled={isSubmitting}
              />
              <p className="font-sans text-xs text-ink/70">
                Must be unique within your university.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="community-description"
                  className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wide"
                >
                  Description{" "}
                  <span className="text-ink/30 normal-case font-normal">(optional)</span>
                </label>
                <span
                  className={`font-mono text-xs font-semibold transition-colors ${
                    descNearLimit ? "text-accent" : "text-ink/30"
                  }`}
                >
                  {descRemaining}
                </span>
              </div>
              <textarea
                id="community-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                placeholder="What's this community for? Who should join?"
                rows={3}
                className="w-full px-4 py-3 bg-background border border-border-muted rounded-xl font-sans text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-border-muted/60 bg-background shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 border border-border-muted bg-surface hover:bg-background text-ink/70 font-sans font-semibold rounded-xl text-sm transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="create-community-submit"
              type="submit"
              disabled={!canSubmit}
              className="flex-[2] py-3 bg-primary hover:bg-[#1F3E23] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-sans font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Community
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
