"use client";

import React, { useState, useRef, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AnonAvatar } from "@/components/AnonAvatar";
import { useAuth } from "@/context/AuthContext";

interface ChatMessage {
  id: string;
  sender: "user" | "reva";
  text: string;
  timestamp: string;
}

const SUGGESTED_PROMPTS = [
  "What are students discussing on campus today?",
  "How do I tag @reva in a post to get instant replies?",
  "Give me 3 tips for upcoming CS & database viva exams.",
  "Summarize top discussions across engineering communities.",
];

export default function AskRevaPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "reva",
      text: "Hello! I am Reva, your Grok-inspired AI Agent for CampusCircle. Ask me anything about campus posts, coursework, exam prep, or tag me (@reva) directly under any post for witty auto-replies!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);
    setError(null);

    try {
      const historyPayload = messages.map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await apiRequest<{ reply: string; context_posts_count: number }>(
        "/api/v1/reva/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: textToSend,
            history: historyPayload,
          }),
        }
      );

      const botMsg: ChatMessage = {
        id: `reva_${Date.now()}`,
        sender: "reva",
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Reva AI is currently unavailable. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 text-ink font-sans max-w-4xl mx-auto w-full px-4 py-6 flex flex-col h-[calc(100vh-5rem)]">
      {/* Header Banner */}
      <div className="bg-surface border border-border-muted rounded-2xl p-5 shadow-2xs space-y-2 mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary text-surface flex items-center justify-center font-mono font-bold text-lg shadow-xs">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg sm:text-xl font-bold text-ink">Ask Reva AI</h1>
              <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono font-bold rounded-full uppercase">
                Grok-Inspired Campus Agent
              </span>
            </div>
            <p className="font-sans text-xs text-ink/60">
              Context-aware assistant for campus posts, coursework, and live queries
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-semibold text-primary px-3 py-1 bg-primary/5 rounded-xl border border-primary/15">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span>Tag @reva in posts for auto-replies</span>
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 bg-surface border border-border-muted rounded-2xl p-4 sm:p-6 overflow-y-auto space-y-4 shadow-2xs min-h-0 flex flex-col">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} animate-in fade-in duration-150`}
            >
              {isUser ? (
                <AnonAvatar username={user?.username || "you"} size={36} shape="circle" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary text-surface flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
                  R
                </div>
              )}

              <div
                className={`max-w-[82%] sm:max-w-[75%] rounded-2xl p-4 space-y-1 text-xs sm:text-sm font-sans ${
                  isUser
                    ? "bg-primary text-surface rounded-tr-xs shadow-xs"
                    : "bg-background border border-border-muted text-ink rounded-tl-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1.5 mb-1.5 opacity-90">
                  <span className="font-mono text-[11px] font-bold uppercase">
                    {isUser ? `@${user?.username || "you"}` : "Reva AI Agent"}
                  </span>
                  <span className="text-[10px] font-mono opacity-60">{msg.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-3 animate-in fade-in duration-150">
            <div className="w-9 h-9 rounded-xl bg-primary text-surface flex items-center justify-center font-mono font-bold text-sm shrink-0">
              R
            </div>
            <div className="bg-background border border-border-muted rounded-2xl rounded-tl-xs px-4 py-3 text-xs font-sans text-ink/75 flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="font-mono text-[11px] text-ink/60 ml-1">Reva is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts & Error */}
      <div className="pt-3 space-y-2 shrink-0">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-sans text-red-700">
            {error}
          </div>
        )}

        {messages.length < 3 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                className="px-3 py-1.5 bg-surface hover:bg-background border border-border-muted rounded-xl text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer shadow-2xs"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 bg-surface border border-border-muted rounded-2xl p-2 shadow-2xs"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask Reva about campus posts, viva prep, or advice..."
            className="flex-1 px-4 py-2.5 bg-transparent text-sm font-sans text-ink placeholder:text-ink/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="px-5 py-2.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-40 cursor-pointer shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
