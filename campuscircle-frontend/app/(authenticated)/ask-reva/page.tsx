"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest, ApiError } from "@/lib/api";
import { AnonAvatar } from "@/components/AnonAvatar";
import { useAuth } from "@/context/AuthContext";
import { RevaChatSidebar } from "@/components/RevaChatSidebar";

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "reva";
  text: string;
  timestamp: string;
}

const CATEGORY_CHIPS = [
  { label: "Code Debugging", category: "code", prompt: "Help me debug my C++ code or explain an algorithm concept." },
  { label: "Campus Discussions", category: "feed", prompt: "What are the latest discussions and posts trending on campus today?" },
  { label: "DBMS & SQL Prep", category: "learn", prompt: "Can you explain SQL Joins or DBMS concepts for viva prep?" },
  { label: "Viva Questions", category: "viva", prompt: "Give me top 5 viva questions and model answers for Operating Systems." },
];

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toChatMessage(apiMsg: ApiMessage): ChatMessage {
  return {
    id: apiMsg.id,
    sender: apiMsg.role === "user" ? "user" : "reva",
    text: apiMsg.content,
    timestamp: formatTimestamp(apiMsg.created_at),
  };
}

export default function AskRevaPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [modelMode, setModelMode] = useState<"fast" | "thinking">("fast");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Fetch conversations on mount
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoadingConversations(true);
      setConversationsError(null);
      try {
        const res = await apiRequest<{ items: ConversationItem[]; total: number }>(
          "/api/v1/reva/conversations"
        );
        setConversations(res.items);
      } catch (err) {
        setConversationsError("Failed to load conversations.");
        console.error(err);
      } finally {
        setIsLoadingConversations(false);
      }
    };
    fetchConversations();
  }, []);

  const handleCreateConversation = useCallback(async () => {
    try {
      const conv = await apiRequest<ConversationItem>("/api/v1/reva/conversations", {
        method: "POST",
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError("Failed to create conversation.");
    }
  }, []);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setIsLoadingMessages(true);
    setError(null);
    try {
      const res = await apiRequest<{ messages: ApiMessage[] }>(
        `/api/v1/reva/conversations/${id}`
      );
      setMessages(res.messages.map(toChatMessage));
    } catch (err) {
      setError("Failed to load conversation.");
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await apiRequest(`/api/v1/reva/conversations/${id}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError("Failed to delete conversation.");
    }
  }, [activeConversationId]);

  const sendMessageToActiveConversation = useCallback(async (textToSend: string) => {
    if (!activeConversationId) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: formatTimestamp(new Date().toISOString()),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);
    setError(null);

    try {
      const res = await apiRequest<{
        user_message: ApiMessage;
        reva_message: ApiMessage;
        title: string | null;
      }>(`/api/v1/reva/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: textToSend }),
      });

      const botMsg = toChatMessage(res.reva_message);
      setMessages((prev) => [...prev, botMsg]);

      if (res.title) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId ? { ...c, title: res.title! } : c
          )
        );
      }

      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, updated_at: new Date().toISOString() }
            : c
        );
        const moved = updated.filter((c) => c.id === activeConversationId);
        const rest = updated.filter((c) => c.id !== activeConversationId);
        return [...moved, ...rest];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Reva AI is currently unavailable. Please try again.");
      }
    } finally {
      setIsSending(false);
    }
  }, [activeConversationId]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isSending) return;

    if (!activeConversationId) {
      try {
        const conv = await apiRequest<ConversationItem>("/api/v1/reva/conversations", {
          method: "POST",
        });
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        await sendMessageToActiveConversation(textToSend);
      } catch (err) {
        setError("Failed to create conversation.");
      }
      return;
    }

    await sendMessageToActiveConversation(textToSend);
  };

  const username = user?.username || "student";
  const hasStarted = messages.length > 0 || activeConversationId !== null;

  return (
    <div className="flex-1 text-ink font-sans grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 py-6 items-start">
      {/* 1. Left Conversation Sidebar Panel (Cols 1-3) */}
      <div className="hidden lg:block lg:col-span-3 lg:sticky lg:top-20 bg-surface-subtle border border-border-muted/70 rounded-2xl p-4 shadow-2xs">
        <RevaChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          isLoading={isLoadingConversations}
          error={conversationsError}
          onCreateNew={handleCreateConversation}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* 2. Center Reading Chat Column (Cols 4-9) */}
      <div className="lg:col-span-6 w-full flex flex-col items-center justify-between min-h-[calc(100vh-8rem)]">
        <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col space-y-6">
          {/* Header with Mobile History Drawer Trigger */}
          <div className="flex items-center justify-between border-b border-border-muted/50 pb-4">
            <div className="space-y-0.5">
              <h1 className="font-display text-2xl font-bold text-primary">Ask Reva AI</h1>
              <p className="font-sans text-xs text-ink/60">
                Campus-aware AI agent trained on university topics, course discussions, and viva prep.
              </p>
            </div>

            {/* Mobile History Drawer Button */}
            <button
              onClick={() => setIsMobileHistoryOpen(true)}
              className="lg:hidden p-2 bg-surface-subtle border border-border-muted/70 rounded-xl text-ink/75 hover:text-primary transition-all flex items-center gap-1.5 font-sans text-xs font-bold cursor-pointer"
              aria-label="Open chat history"
            >
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>History</span>
            </button>
          </div>

          {!hasStarted ? (
            /* INITIAL OPEN STATE - VERTICALLY CENTERED */
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 my-auto min-h-[45vh]">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                  <AnonAvatar username="reva" size={40} shape="circle" />
                </div>
                <h2 className="font-display text-xl font-bold text-ink">What can I help you with today?</h2>
                <p className="font-sans text-xs text-ink/60 max-w-md mx-auto">
                  Ask about code issues, campus feed posts, exam concepts, or tag @reva in any discussion.
                </p>
              </div>

              {/* Minimal Suggestion Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg pt-2">
                {CATEGORY_CHIPS.map((chip) => (
                  <button
                    key={chip.category}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-sans font-medium bg-surface text-ink/75 border border-border-muted/60 hover:border-primary/40 hover:text-primary transition-all shadow-2xs cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ACTIVE OPEN CHAT MESSAGES STREAM */
            <div className="flex-1 space-y-6 pb-24">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isUser = msg.sender === "user";

                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isUser && (
                          <div className="shrink-0 mt-0.5">
                            <AnonAvatar username="reva" size={32} shape="circle" />
                          </div>
                        )}

                        <div
                          className={`space-y-1 text-xs sm:text-sm font-sans ${
                            isUser
                              ? "bg-surface border border-border-muted/60 text-ink rounded-2xl rounded-tr-xs p-4 shadow-2xs max-w-[85%] sm:max-w-[78%]"
                              : "text-ink max-w-full leading-relaxed py-1"
                          }`}
                        >
                          <div className="flex items-center gap-2 opacity-60 text-[10px] font-mono mb-1">
                            <span className="font-bold uppercase">{isUser ? `@${username}` : "Reva AI"}</span>
                            <span>•</span>
                            <span>{msg.timestamp}</span>
                          </div>

                          {isUser ? (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          ) : (
                            <div className="leading-relaxed [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-3 [&>h3]:font-bold [&>h3]:text-sm [&>h3]:mt-4 [&>h3]:mb-1.5 [&>strong]:font-bold [&>a]:text-primary [&>a]:underline [&>pre]:mb-3 [&>hr]:my-3">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({className, children, ...props}) {
                                    const isInline = !className?.startsWith("language-");
                                    return isInline ? (
                                      <code className="bg-ink/10 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                                    ) : (
                                      <pre className="bg-surface border border-border-muted p-3.5 rounded-xl overflow-x-auto my-2 text-xs font-mono">
                                        <code className={className} {...props}>{children}</code>
                                      </pre>
                                    );
                                  },
                                }}
                              >
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>

                        {isUser && (
                          <div className="shrink-0 mt-0.5">
                            <AnonAvatar username={username} size={32} shape="circle" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex items-center gap-3 py-2">
                      <AnonAvatar username="reva" size={32} shape="circle" />
                      <div className="text-xs font-sans text-ink/60 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                        <span className="font-mono text-[11px]">Thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          )}
        </div>

        {/* 3. Floating Pill-Shaped Input Bar (Sticky at Bottom) */}
        <div className="sticky bottom-4 w-full max-w-2xl mx-auto pt-2 bg-background/80 backdrop-blur-md">
          {error && (
            <div className="mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-sans text-red-700">
              {error}
            </div>
          )}

          <div className="bg-surface border border-border-muted/80 rounded-full px-4 py-2 shadow-lg flex items-center gap-3 transition-all">
            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask Reva anything..."
              className="flex-1 bg-transparent text-xs sm:text-sm text-ink placeholder:text-ink/40 outline-none border-none resize-none font-sans py-1 max-h-24 focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 shadow-none ring-0"
            />

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModelMode(modelMode === "fast" ? "thinking" : "fast")}
                className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border border-border-muted/60 text-ink/70 hover:text-primary hover:border-primary/40 transition-all"
              >
                {modelMode === "fast" ? "Fast" : "Deep Think"}
              </button>

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isSending}
                className="w-8 h-8 bg-primary hover:bg-[#1F3E23] text-surface rounded-full flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer shadow-xs"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Right Info & Quick Prompt Panel (Cols 10-12) */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 lg:sticky lg:top-20">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-5 space-y-4 shadow-2xs">
          <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Reva Capabilities</span>
          </h3>
          <p className="font-sans text-xs text-ink/75 leading-relaxed">
            Trained on campus discussions, course notes, and past viva exams. Tag @reva in any post comment.
          </p>

          <div className="space-y-2 pt-2 border-t border-border-muted/50">
            <span className="font-mono text-[10px] font-bold text-ink/40 uppercase tracking-wider">
              Quick Starters
            </span>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => handleSendMessage("Explain SQL Joins with real examples")}
                className="text-left p-2.5 bg-surface hover:bg-background border border-border-muted/60 rounded-xl text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer shadow-2xs"
              >
                "Explain SQL Joins with examples"
              </button>
              <button
                onClick={() => handleSendMessage("Give me top 5 DBMS viva questions")}
                className="text-left p-2.5 bg-surface hover:bg-background border border-border-muted/60 rounded-xl text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer shadow-2xs"
              >
                "Top 5 DBMS viva questions"
              </button>
              <button
                onClick={() => handleSendMessage("Summarize recent discussions on campus")}
                className="text-left p-2.5 bg-surface hover:bg-background border border-border-muted/60 rounded-xl text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer shadow-2xs"
              >
                "Summarize recent campus posts"
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile History Slide-In Drawer Overlay */}
      {isMobileHistoryOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            onClick={() => setIsMobileHistoryOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
          />
          <div className="relative z-10 w-4/5 max-w-xs bg-surface border-r border-border-muted h-full p-4 space-y-4 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-border-muted/50 pb-3">
              <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
                <AnonAvatar username="reva" size={24} shape="circle" />
                <span>Chat History</span>
              </h2>
              <button
                onClick={() => setIsMobileHistoryOpen(false)}
                className="p-1 rounded-lg text-ink/50 hover:bg-background hover:text-ink transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <RevaChatSidebar
                conversations={conversations}
                activeConversationId={activeConversationId}
                isLoading={isLoadingConversations}
                error={conversationsError}
                onCreateNew={() => {
                  handleCreateConversation();
                  setIsMobileHistoryOpen(false);
                }}
                onSelect={(id) => {
                  handleSelectConversation(id);
                  setIsMobileHistoryOpen(false);
                }}
                onDelete={handleDeleteConversation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
