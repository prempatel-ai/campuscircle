"use client";

import React, { useEffect, useState, useRef } from "react";
import { apiRequest, ApiError } from "@/lib/api";

interface LessonChatMessage {
  id: string;
  session_id: string;
  sender: "user" | "reva";
  content: string;
  created_at: string;
}

interface LessonChatProps {
  sessionId: string;
  lessonTitle?: string;
}

const QUICK_ACTIONS = [
  "Explain simpler",
  "Code example in Python",
  "Real-world application",
  "Interview questions",
  "Common mistakes",
];

function RevaIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

export function LessonChat({ sessionId, lessonTitle }: LessonChatProps) {
  const [messages, setMessages] = useState<LessonChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Only fetch when opened for the first time
  useEffect(() => {
    if (!isOpen || hasFetched || !sessionId) return;
    async function fetchChatHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const history = await apiRequest<LessonChatMessage[]>(
          `/api/v1/learn/${sessionId}/chat/messages`
        );
        setMessages(history);
        setHasFetched(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load chat history.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchChatHistory();
  }, [isOpen, hasFetched, sessionId]);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isSending, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isSending) return;

    const userTempMsg: LessonChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      sender: "user",
      content: query.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userTempMsg]);
    if (!textToSend) setInputText("");
    setIsSending(true);
    setError(null);

    try {
      const revaReply = await apiRequest<LessonChatMessage>(
        `/api/v1/learn/${sessionId}/chat/messages`,
        { method: "POST", body: JSON.stringify({ message: query.trim() }) }
      );
      setMessages((prev) => [...prev, revaReply]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-surface border border-border-muted rounded-2xl overflow-hidden shadow-2xs animate-in fade-in duration-200">
      {/* Accordion Header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-subtle transition-colors group cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <RevaIcon className="w-4 h-4" />
          </span>
          <div className="text-left min-w-0">
            <p className="font-display text-sm font-bold text-primary leading-tight">
              Ask Reva About This Lesson
            </p>
            {lessonTitle && (
              <p className="font-mono text-[11px] text-ink/50 truncate max-w-[280px] sm:max-w-[400px] leading-tight mt-0.5">
                {lessonTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {messages.length > 0 && (
            <span className="hidden sm:flex px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[10px] font-bold">
              {messages.length} msg{messages.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-ink/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable Body */}
      {isOpen && (
        <div className="border-t border-border-muted/60">
          {/* Messages area — scrollable, no fixed height imposed externally */}
          <div
            className="max-h-80 overflow-y-auto px-5 py-4 space-y-3 font-sans text-sm [scrollbar-width:thin] [scrollbar-color:#2F523330_transparent]"
          >
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-ink/40 font-mono text-xs gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading chat history...
              </div>
            )}

            {!isLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="font-display text-sm font-bold text-ink">Have questions about this lesson?</p>
                <p className="font-sans text-xs text-ink/55 max-w-xs leading-relaxed">
                  Ask Reva for simpler explanations, code examples, real-world applications, or interview questions.
                </p>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser && (
                    <span className="w-6 h-6 rounded-full bg-primary text-surface flex items-center justify-center shrink-0 mt-0.5">
                      <RevaIcon className="w-3.5 h-3.5 text-surface" />
                    </span>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? "bg-primary text-surface font-sans font-medium shadow-2xs rounded-br-sm"
                        : "bg-background border border-border-muted/70 text-ink/90 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex gap-2.5 justify-start">
                <span className="w-6 h-6 rounded-full bg-primary/80 text-surface flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <RevaIcon className="w-3.5 h-3.5 text-surface" />
                </span>
                <div className="bg-background border border-border-muted/70 text-ink/50 px-4 py-2.5 rounded-2xl rounded-bl-sm text-xs font-mono flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span>Reva is thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-sans">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Chips — wrapping, no horizontal scroll */}
          <div className="px-5 py-3 border-t border-border-muted/40 bg-background/60 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-ink/40 shrink-0">Quick Ask:</span>
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isSending}
                onClick={() => handleSendMessage(action)}
                className="px-2.5 py-1 bg-surface border border-border-muted text-ink/70 hover:border-primary/50 hover:text-primary rounded-lg text-[11px] font-sans font-medium whitespace-nowrap transition-all cursor-pointer shadow-2xs disabled:opacity-40"
              >
                {action}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
            className="px-4 py-3 border-t border-border-muted/40 bg-surface flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              disabled={isSending}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask a follow-up question about this lesson..."
              className="flex-1 px-3.5 py-2.5 bg-background border border-border-muted/80 focus:border-primary focus:outline-none rounded-xl text-xs sm:text-sm text-ink placeholder:text-ink/40 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="px-4 py-2.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0"
            >
              <span>Send</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
