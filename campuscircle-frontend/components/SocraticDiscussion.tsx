"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SocraticMessage {
  id: string;
  sender: "reva" | "user";
  content: string;
  created_at: string;
}

interface SocraticStatus {
  session_id: string;
  is_concluded: boolean;
  understanding_level: string | null;
  exchange_count: number;
  messages: SocraticMessage[];
}

interface SocraticRespondOut {
  message: SocraticMessage;
  is_concluded: boolean;
  understanding_level: string | null;
}

interface SocraticDiscussionProps {
  sessionId: string;
  lessonTitle: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const UNDERSTANDING_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  strong:       { label: "Strong Understanding", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  adequate:     { label: "Adequate Understanding", color: "text-primary",   bg: "bg-primary/8 border-primary/20" },
  developing:   { label: "Developing Understanding", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  needs_review: { label: "Needs Further Review",    color: "text-red-700",   bg: "bg-red-50 border-red-200" },
};

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: SocraticMessage }) {
  const isReva = message.sender === "reva";
  return (
    <div className={`flex gap-3 ${isReva ? "items-start" : "items-start flex-row-reverse"}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isReva ? "bg-primary text-surface" : "bg-border-muted/80 text-ink/60"
      }`}>
        {isReva ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-sans ${
        isReva
          ? "bg-primary/8 border border-primary/15 text-ink/85 rounded-tl-none"
          : "bg-surface border border-border-muted text-ink/85 rounded-tr-none"
      }`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SocraticDiscussion({ sessionId, lessonTitle }: SocraticDiscussionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SocraticStatus | null>(null);
  const [messages, setMessages] = useState<SocraticMessage[]>([]);
  const [isConcluded, setIsConcluded] = useState(false);
  const [understandingLevel, setUnderstandingLevel] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch status when first opened
  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiRequest<SocraticStatus>(`/api/v1/learn/${sessionId}/socratic/messages`);
      setStatus(data);
      setMessages(data.messages);
      setIsConcluded(data.is_concluded);
      setUnderstandingLevel(data.understanding_level);
    } catch {
      // Non-critical — silently ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen && !status) {
      fetchStatus();
    }
  }, [isOpen, status, fetchStatus]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const msg = await apiRequest<SocraticMessage>(`/api/v1/learn/${sessionId}/socratic/start`, {
        method: "POST",
      });
      setMessages([msg]);
    } catch {
      setError("Failed to start discussion. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);
    setDraft("");

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const optimistic: SocraticMessage = {
      id: tempId,
      sender: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await apiRequest<SocraticRespondOut>(
        `/api/v1/learn/${sessionId}/socratic/respond`,
        {
          method: "POST",
          body: JSON.stringify({ student_text: text }),
        }
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.message,
      ]);
      if (res.is_concluded) {
        setIsConcluded(true);
        setUnderstandingLevel(res.understanding_level);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError("Failed to send response. Please try again.");
      setDraft(text); // restore
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMsgs = messages.length > 0;
  const levelInfo = understandingLevel ? UNDERSTANDING_LABELS[understandingLevel] : null;

  return (
    <div className={`bg-surface border rounded-2xl overflow-hidden shadow-2xs transition-all duration-200 ${
      isOpen ? "border-primary/30 ring-1 ring-primary/10" : "border-border-muted"
    }`}>
      {/* ── Header / Trigger ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-subtle transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            isOpen ? "bg-primary text-surface" : "bg-primary/10 text-primary"
          }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-sm font-bold text-primary leading-tight">
                Discuss This Topic with Reva
              </p>
              {isConcluded && levelInfo && (
                <span className={`px-2 py-0.5 rounded-full border font-mono text-[10px] font-bold ${levelInfo.bg} ${levelInfo.color}`}>
                  {levelInfo.label}
                </span>
              )}
              {!isConcluded && hasMsgs && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full font-mono text-[10px] font-bold">
                  In Progress
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-ink/75 mt-0.5">
              {isConcluded
                ? "Discussion complete"
                : hasMsgs
                ? `${messages.filter((m) => m.sender === "user").length} response${messages.filter((m) => m.sender === "user").length !== 1 ? "s" : ""} given`
                : "Reva will ask you Socratic questions to test your understanding"}
            </p>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-ink/40 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="border-t border-border-muted/60 flex flex-col" style={{ maxHeight: "580px" }}>

          {/* ── Completion Banner ─────────────────────────────── */}
          {isConcluded && levelInfo && (
            <div className={`mx-4 mt-4 p-4 rounded-xl border ${levelInfo.bg} space-y-1.5`}>
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 shrink-0 ${levelInfo.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={`font-display text-sm font-bold ${levelInfo.color}`}>
                  Discussion Concluded — {levelInfo.label}
                </p>
              </div>
              <p className="font-sans text-xs text-ink/65 leading-relaxed">
                This discussion outcome has been recorded and will influence Reva's future recommendations for you.
              </p>
            </div>
          )}

          {/* ── Messages ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0" style={{ maxHeight: "380px" }}>
            {/* Start CTA — shown when no messages yet */}
            {!hasMsgs && (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="font-display text-sm font-bold text-ink">Ready to discuss?</p>
                  <p className="font-sans text-xs text-ink/55 max-w-xs mx-auto leading-relaxed">
                    Reva will ask you reasoning-based questions about{" "}
                    <span className="font-semibold text-ink/70">
                      {lessonTitle.length > 40 ? lessonTitle.slice(0, 40) + "…" : lessonTitle}
                    </span>{" "}
                    to evaluate whether you truly understand the concept.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center text-[11px] font-mono text-ink/50">
                  {[
                    "Why does this work?",
                    "Explain it your way",
                    "What if this changed?",
                    "Which approach is better?",
                  ].map((ex) => (
                    <span key={ex} className="px-2.5 py-1 bg-background border border-border-muted rounded-lg">
                      {ex}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={handleStart}
                  className="px-6 py-2.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {isStarting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                      <span>Starting Discussion...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <span>Start Discussion with Reva</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Sending indicator */}
            {isSending && (
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-primary text-surface flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="bg-primary/8 border border-primary/15 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1.5 items-center">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Error ─────────────────────────────────────────── */}
          {error && (
            <div className="mx-4 mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-sans text-red-700 text-center">
              {error}
            </div>
          )}

          {/* ── Input ─────────────────────────────────────────── */}
          {hasMsgs && !isConcluded && (
            <div className="border-t border-border-muted/60 p-3 flex items-end gap-2 bg-surface-subtle">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Share your understanding... (Enter to send)"
                rows={2}
                className="flex-1 resize-none bg-background border border-border-muted rounded-xl px-3.5 py-2.5 text-xs font-sans text-ink/90 placeholder-ink/35 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all leading-relaxed"
              />
              <button
                type="button"
                disabled={!draft.trim() || isSending}
                onClick={handleSend}
                className="w-9 h-9 bg-primary hover:bg-[#1F3E23] text-surface rounded-xl flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 shrink-0"
              >
                <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 21L23 12 2 3v7l15 2-15 2v7z" />
                </svg>
              </button>
            </div>
          )}

          {/* Exchange counter + hint */}
          {hasMsgs && !isConcluded && (
            <div className="px-4 pb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] text-ink/35">
                {messages.filter((m) => m.sender === "user").length} / 8 exchanges
              </p>
              <p className="font-mono text-[10px] text-ink/35">Shift+Enter for new line</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
