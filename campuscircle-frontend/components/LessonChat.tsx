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

export function LessonChat({ sessionId, lessonTitle }: LessonChatProps) {
  const [messages, setMessages] = useState<LessonChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    async function fetchChatHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const history = await apiRequest<LessonChatMessage[]>(
          `/api/v1/learn/${sessionId}/chat/messages`
        );
        setMessages(history);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load chat history.");
        }
      } finally {
        setIsLoading(false);
      }
    }
    if (sessionId) {
      fetchChatHistory();
    }
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

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
        {
          method: "POST",
          body: JSON.stringify({ message: query.trim() }),
        }
      );
      setMessages((prev) => [...prev, revaReply]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to send follow-up message.");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-surface border border-border-muted rounded-2xl flex flex-col h-[520px] shadow-sm overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-4 border-b border-border-muted/60 bg-surface-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-primary text-surface font-mono font-bold text-xs flex items-center justify-center shadow-2xs">
            <svg className="w-4 h-4 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-primary">Ask Reva About This Lesson</h3>
            <p className="font-sans text-[11px] text-ink/60 truncate max-w-xs sm:max-w-md">
              {lessonTitle ? `Context: ${lessonTitle}` : "Interactive Lesson Follow-up Chat"}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[10px] font-bold shrink-0">
          Lesson Context Active
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 font-sans text-xs sm:text-sm">
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-ink/50 font-mono text-xs">
            Loading lesson chat context...
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2 p-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h4 className="font-display text-sm font-bold text-ink">Have questions about this lesson?</h4>
            <p className="font-sans text-xs text-ink/65 max-w-xs">
              Ask Reva for simpler explanations, Python code examples, real-world applications, or interview questions!
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <span className="w-6 h-6 rounded-full bg-primary text-surface font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </span>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap break-words ${
                  isUser
                    ? "bg-primary text-surface font-sans font-medium shadow-2xs rounded-br-xs"
                    : "bg-surface-subtle border border-border-muted/70 text-ink/90 rounded-bl-xs"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex gap-2.5 justify-start">
            <span className="w-6 h-6 rounded-full bg-primary text-surface font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <svg className="w-3.5 h-3.5 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            <div className="bg-surface-subtle border border-border-muted/70 text-ink/60 px-4 py-2 rounded-2xl rounded-bl-xs text-xs font-mono flex items-center gap-1.5">
              <span>Reva is formulating answer...</span>
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

      {/* Quick Action Chips */}
      <div className="px-4 py-2 border-t border-border-muted/50 bg-background flex items-center gap-1.5 overflow-x-auto text-[11px] font-sans">
        <span className="text-ink/40 font-mono shrink-0">Quick Ask:</span>
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            disabled={isSending}
            onClick={() => handleSendMessage(action)}
            className="px-2.5 py-1 bg-surface border border-border-muted text-ink/75 hover:border-primary/40 hover:text-primary rounded-lg whitespace-nowrap font-medium transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 border-t border-border-muted bg-surface flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          disabled={isSending}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a follow-up question about this lesson..."
          className="flex-1 px-3.5 py-2 bg-background border border-border-muted/80 focus:border-primary focus:outline-none rounded-xl text-xs sm:text-sm text-ink placeholder:text-ink/40 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="px-4 py-2 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
        >
          <span>Send</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
}
