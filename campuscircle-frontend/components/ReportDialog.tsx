"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiRequest, ApiError } from "@/lib/api";

interface ReportDialogProps {
  targetId: string;
  targetType: "post" | "comment";
  onClose: () => void;
}

const REASON_MAX = 500;

type Stage = "form" | "success";

export const ReportDialog: React.FC<ReportDialogProps> = ({
  targetId,
  targetType,
  onClose,
}) => {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");

  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reasonRef.current?.focus();
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

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Please describe why you're reporting this.");
      reasonRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify({
          target_id: targetId,
          target_type: targetType,
          reason: trimmedReason,
        }),
      });
      setStage("success");
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

  const remaining = REASON_MAX - reason.length;
  const nearLimit = remaining <= 80;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
    >
      <div className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── SUCCESS STATE ── */}
        {stage === "success" ? (
          <div className="flex flex-col items-center text-center px-8 py-10 space-y-5">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-lg font-bold text-primary">
                Report submitted
              </h2>
              <p className="font-sans text-sm text-ink/65 max-w-xs">
                Thanks for helping keep the community safe. Our moderation team will review it.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 px-8 py-2.5 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-sm transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (

        /* ── FORM STATE ── */
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-muted/60 shrink-0">
            <div>
              <h2
                id="report-dialog-title"
                className="font-display text-base font-bold text-ink"
              >
                Report {targetType}
              </h2>
              <p className="font-sans text-xs text-ink/50 mt-0.5">
                Reports are anonymous to other users
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-xl hover:bg-background text-ink/50 hover:text-ink transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="px-5 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-r-xl text-sm font-sans text-red-700 font-semibold">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="report-reason"
                    className="font-mono text-xs text-ink/60 font-semibold uppercase tracking-wide"
                  >
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <span className={`font-mono text-xs font-semibold transition-colors ${nearLimit ? "text-accent" : "text-ink/30"}`}>
                    {remaining}
                  </span>
                </div>
                <textarea
                  ref={reasonRef}
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
                  placeholder="Describe the issue — e.g. spam, harassment, misinformation…"
                  rows={4}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 bg-background border border-border-muted rounded-xl font-sans text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none transition-all"
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
                id="report-submit"
                type="submit"
                disabled={isSubmitting || reason.trim().length === 0}
                className="flex-[2] py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-sans font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    Submit Report
                  </>
                )}
              </button>
            </div>
          </form>
        </>
        )}
      </div>
    </div>
  );
};
