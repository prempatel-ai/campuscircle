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
  { label: "Code Debugging", category: "code", prompt: "Help me debug my code or explain an algorithm concept." },
  { label: "Campus Discussions", category: "feed", prompt: "What are the latest discussions and posts trending on campus today?" },
  { label: "Concept Explanation", category: "learn", prompt: "Can you explain a complex subject like DBMS SQL Joins or System Design in simple terms?" },
  { label: "Viva Prep", category: "viva", prompt: "Give me top 5 viva questions and model answers for Database Management Systems." },
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

  const renderInputCard = () => (
    <div className="bg-surface border border-border-muted rounded-2xl p-4 space-y-3 shadow-2xs">
      <textarea
        rows={3}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        }}
        placeholder="Ask Reva about campus discussions, code debugging, or exam prep..."
        className="w-full bg-background border border-border-muted/80 rounded-xl p-3 text-sm text-ink placeholder:text-ink/40 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none font-sans transition-all"
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setModelMode(modelMode === "fast" ? "thinking" : "fast")}
          className="px-3.5 py-1.5 bg-background border border-border-muted hover:border-primary/40 rounded-full text-xs font-mono font-bold text-ink/75 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>{modelMode === "fast" ? "Fast Model" : "Deep Think"}</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isSending}
          className="px-5 py-2 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-30 cursor-pointer flex items-center gap-2"
        >
          <span>Send</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 text-ink font-sans grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 py-6 items-start">
      {/* 1. Left Sidebar Column */}
      <div className="lg:col-span-3 lg:sticky lg:top-20 bg-surface border border-border-muted rounded-2xl p-4 shadow-2xs">
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

      {/* 2. Main Center Chat Column */}
      <div className="lg:col-span-9 w-full flex flex-col space-y-6">
        {/* Standard Left-Aligned Header Banner (matches Learn, Settings, My Activity) */}
        <div className="space-y-1 border-b border-border-muted pb-5">
          <h1 className="font-display text-3xl font-bold text-primary">Ask Reva AI</h1>
          <p className="font-sans text-sm text-ink/75">
            Campus-aware AI agent trained on university topics, course discussions, and viva prep.
          </p>
        </div>

        {!hasStarted ? (
          /* INITIAL CHAT PROMPT STATE */
          <div className="space-y-6">
            {/* Input Card */}
            {renderInputCard()}

            {/* Suggestion Pills matching Community Tabs styling */}
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-bold text-ink/40 uppercase tracking-wider px-1">
                Suggested Topics
              </h3>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_CHIPS.map((chip) => (
                  <button
                    key={chip.category}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="px-4 py-1.5 rounded-full text-xs font-sans font-semibold tracking-tight whitespace-nowrap bg-surface text-ink/75 border border-border-muted hover:bg-background hover:text-primary hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-2xs"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE CONVERSATION MESSAGES STATE */
          <div className="flex flex-col space-y-4">
            <div className="bg-surface border border-border-muted rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs min-h-[400px] max-h-[600px] overflow-y-auto">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isUser = msg.sender === "user";

                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                      >
                        {isUser ? (
                          <AnonAvatar username={username} size={36} shape="circle" />
                        ) : (
                          <AnonAvatar username="reva" size={36} shape="circle" />
                        )}

                        <div
                          className={`max-w-[82%] sm:max-w-[75%] rounded-2xl p-4 space-y-1 text-xs sm:text-sm font-sans ${
                            isUser
                              ? "bg-primary text-surface rounded-tr-xs shadow-xs"
                              : "bg-background border border-border-muted text-ink rounded-tl-xs"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 border-b border-current/10 pb-1 mb-1 opacity-80">
                            <span className="font-mono text-[11px] font-bold uppercase">
                              {isUser ? `@${username}` : "@reva"}
                            </span>
                            <span className="text-[10px] font-mono opacity-60">{msg.timestamp}</span>
                          </div>
                          {isUser ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                          ) : (
                            <div className="leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-2 [&>h3]:font-bold [&>h3]:text-sm [&>h3]:mt-3 [&>h3]:mb-1.5 [&>h4]:font-bold [&>h4]:text-xs [&>h4]:mt-2 [&>h4]:mb-1 [&>strong]:font-bold [&>a]:text-primary [&>a]:underline [&>pre]:mb-2 [&>hr]:my-2">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({className, children, ...props}) {
                                    const isInline = !className?.startsWith("language-");
                                    return isInline ? (
                                      <code className="bg-ink/10 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                                    ) : (
                                      <pre className="bg-ink/5 p-3 rounded-xl overflow-x-auto mb-3 text-xs">
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
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex items-center gap-3">
                      <AnonAvatar username="reva" size={36} shape="circle" />
                      <div className="bg-background border border-border-muted rounded-2xl rounded-tl-xs px-4 py-3 text-xs font-sans text-ink/75 flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                        <span className="font-mono text-[11px] text-ink/60 ml-1">Reva is thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-sans text-red-700">
                {error}
              </div>
            )}

            {renderInputCard()}
          </div>
        )}
      </div>
    </div>
  );
}
