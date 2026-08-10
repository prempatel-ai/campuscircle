"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ExplanationChunks } from "@/components/ExplanationChunks";
import { LearnQuiz } from "@/components/LearnQuiz";
import { LessonChat } from "@/components/LessonChat";
import { LearningDashboard, type DashboardData } from "@/components/LearningDashboard";
import { apiRequest, ApiError } from "@/lib/api";

interface Chunk {
  title: string;
  explanation: string;
  has_visual?: boolean;
  visual_html?: string | null;
}

interface ExplainResponse {
  session_id: string;
  video_id: string;
  video_title: string;
  language: string;
  chunks: Chunk[];
  is_cached: boolean;
  daily_explanations_remaining: number;
}

interface PreSessionMentor {
  greeting: string;
  mentor_message: string;
  suggested_next_topic?: string;
  career_goal?: string;
  streak_days: number;
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [viewState, setViewState] = useState<"loading" | "explanation" | "quiz">("loading");
  const [error, setError] = useState<string | null>(null);

  // Left Panel State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [mentorGuidance, setMentorGuidance] = useState<PreSessionMentor | null>(null);

  // Fetch Dashboard & Mentor Data
  const refreshDashboard = useCallback(async () => {
    try {
      const data = await apiRequest<DashboardData>("/api/v1/learn/me/dashboard");
      setDashboardData(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const mData = await apiRequest<PreSessionMentor>("/api/v1/learn/me/mentor/pre-session");
        setMentorGuidance(mData);
      } catch {}
      refreshDashboard();
    }
    loadData();
  }, [refreshDashboard]);

  // Fetch session data on mount
  useEffect(() => {
    if (!sessionId) return;
    async function fetchSession() {
      setViewState("loading");
      setError(null);
      try {
        const response = await apiRequest<ExplainResponse>(`/api/v1/learn/sessions/${sessionId}`);
        setExplainData(response);
        setViewState("explanation");
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Learning session not found or expired.");
        }
        // Gracefully redirect to Learn homepage after brief delay
        setTimeout(() => {
          router.push("/learn");
        }, 2500);
      }
    }
    fetchSession();
  }, [sessionId, router]);

  if (viewState === "loading") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-xs font-bold text-primary uppercase tracking-wider">
          Restoring Learning Session...
        </p>
      </div>
    );
  }

  if (error || !explainData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4 text-center px-4">
        <div className="p-3 bg-red-500/10 text-red-600 rounded-full">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="font-display text-lg font-bold text-ink">Session Not Found</h2>
        <p className="font-sans text-xs text-ink/70 max-w-sm">
          {error || "We couldn't locate this learning session. Redirecting you to Learn homepage..."}
        </p>
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-sans text-xs font-bold hover:bg-primary/90 transition-colors"
        >
          Return to Learn Home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 text-ink font-sans grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 py-6 items-start">
      {/* LEFT PANEL: Learning Dashboard */}
      <div className="hidden lg:block lg:col-span-3 lg:sticky lg:top-20 max-h-[calc(100vh-5rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#2F523330_transparent] space-y-4 pr-0.5">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border-muted/50 pb-3 mb-4">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002-2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="font-display text-sm font-bold text-primary">Learning Dashboard</h3>
          </div>
          {dashboardData && (
            <LearningDashboard data={dashboardData} mentor={mentorGuidance} />
          )}
        </div>
      </div>

      {/* CENTER COLUMN: Session Content & Quiz */}
      <div className="lg:col-span-6 w-full space-y-6">
        {/* Navigation Breadcrumb & Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border-muted/60 pb-3">
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-primary hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Learn
          </Link>
          <span className="font-mono text-[10px] font-bold text-ink/40 uppercase tracking-wider">
            Session: {explainData.session_id.substring(0, 8)}
          </span>
        </div>

        {viewState === "explanation" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <ExplanationChunks
              videoTitle={explainData.video_title}
              videoUrl={explainData.video_id ? `https://www.youtube.com/watch?v=${explainData.video_id}` : ""}
              chunks={explainData.chunks}
              dailyRemaining={explainData.daily_explanations_remaining || 999999}
              onStartQuiz={() => setViewState("quiz")}
            />
          </div>
        )}

        {viewState === "quiz" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <LearnQuiz
              sessionId={explainData.session_id}
              onBackToExplanation={() => setViewState("explanation")}
              onQuizComplete={() => refreshDashboard()}
            />
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Lesson Chat Assistant */}
      <div className="lg:col-span-3 lg:sticky lg:top-20 max-h-[calc(100vh-5rem)] overflow-y-auto space-y-4">
        <LessonChat
          sessionId={explainData.session_id}
          lessonTitle={explainData.video_title}
        />
      </div>
    </div>
  );
}
