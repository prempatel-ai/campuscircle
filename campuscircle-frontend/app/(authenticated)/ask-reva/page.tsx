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

const CATEGORY_CHIPS = [
  { label: "Code", category: "code", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", prompt: "Help me debug my code or explain an algorithm concept." },
  { label: "Campus Feed", category: "feed", icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z", prompt: "What are the latest discussions and posts trending on campus today?" },
  { label: "Learn", category: "learn", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", prompt: "Can you explain a complex subject like DBMS SQL Joins or System Design in simple terms?" },
  { label: "Viva Prep", category: "viva", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", prompt: "Give me top 5 viva questions and model answers for Database Management Systems." },
];

export default function AskRevaPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [modelMode, setModelMode] = useState<"fast" | "thinking">("fast");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

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

  const username = user?.username || "student";
  const hasStarted = messages.length > 0;

  // Shared Grok / Claude style Input Box component for perfect UI consistency
  const renderGrokInputBox = (compact = false) => (
    <div className={`w-full bg-surface border border-border-muted/90 rounded-3xl shadow-md transition-all ${compact ? "p-3 space-y-2" : "p-4 space-y-3"}`}>
      <textarea
        rows={compact ? 2 : 3}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        }}
        placeholder="How can Reva help you today? Ask about code, campus, or tag @reva in posts..."
        className="w-full bg-transparent text-sm sm:text-base text-ink placeholder:text-ink/40 border-0 outline-none focus:outline-none focus:ring-0 focus:border-0 resize-none px-2 pt-1 font-sans shadow-none ring-0"
      />

      <div className="flex items-center justify-between pt-1 px-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModelMode(modelMode === "fast" ? "thinking" : "fast")}
            className="px-3 py-1 bg-background border border-border-muted hover:border-primary/40 rounded-full text-xs font-mono font-bold text-ink/75 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{modelMode === "fast" ? "Fast Model" : "Deep Think"}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="w-9 h-9 bg-primary hover:bg-[#1F3E23] text-surface rounded-full flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 text-ink font-sans max-w-4xl mx-auto w-full px-4 py-6 flex flex-col min-h-[calc(100vh-5rem)]">
      {!hasStarted ? (
        /* HERO INITIAL STATE */
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-300 py-12">
          <div className="space-y-3 text-center">
            <div className="w-14 h-14 bg-primary text-surface rounded-2xl flex items-center justify-center mx-auto shadow-md transform hover:scale-105 transition-transform">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              {getGreeting()}, <span className="text-primary">{username}</span>
            </h1>
            <p className="font-sans text-sm text-ink/60 max-w-sm mx-auto">
              Reva has direct context on campus posts, coursework, and developer topics.
            </p>
          </div>

          <div className="w-full max-w-2xl">
            {renderGrokInputBox(false)}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.category}
                onClick={() => handleSendMessage(chip.prompt)}
                className="px-3.5 py-2 bg-surface border border-border-muted hover:border-primary/40 text-ink/80 hover:text-primary rounded-xl text-xs font-sans font-medium transition-all shadow-2xs cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={chip.icon} />
                </svg>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ACTIVE CONVERSATION STATE */
        <div className="flex-1 flex flex-col h-full space-y-4">
          <div className="bg-surface border border-border-muted rounded-2xl p-4 shadow-2xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary text-surface flex items-center justify-center font-mono font-bold text-sm shadow-xs">
                R
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-ink">Reva AI Assistant</h2>
                <p className="font-sans text-[11px] text-ink/60">Grok & Claude-powered Campus Intelligence</p>
              </div>
            </div>

            <button
              onClick={() => setMessages([])}
              className="px-3 py-1.5 bg-background border border-border-muted hover:bg-surface text-ink/75 hover:text-ink font-sans text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              New Chat
            </button>
          </div>

          <div className="flex-1 bg-surface border border-border-muted rounded-2xl p-4 sm:p-6 overflow-y-auto space-y-4 shadow-2xs min-h-0">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} animate-in fade-in duration-150`}
                >
                  {isUser ? (
                    <AnonAvatar username={username} size={36} shape="circle" />
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
                        {isUser ? `@${username}` : "Reva AI"}
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

          <div className="pt-2 space-y-2 shrink-0">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-sans text-red-700">
                {error}
              </div>
            )}

            {renderGrokInputBox(true)}
          </div>
        </div>
      )}
    </div>
  );
}
