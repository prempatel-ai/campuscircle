"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExplanationChunks } from "@/components/ExplanationChunks";
import { LearnQuiz } from "@/components/LearnQuiz";
import { LessonChat } from "@/components/LessonChat";
import { LearningDashboard, type DashboardData } from "@/components/LearningDashboard";
import { LearningReports } from "@/components/LearningReports";
import { apiRequest, ApiError } from "@/lib/api";
import { STEM_CATEGORIES } from "@/lib/stem-topics";

interface Chunk {
  title: string;
  explanation: string;
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

interface ConceptGap {
  concept_category: string;
  miss_count: number;
  last_seen_at: string;
}

interface StudentProfile {
  user_id: string;
  total_sessions: number;
  total_study_time_seconds: number;
  topics_completed: number;
  topics_learning: number;
  avg_quiz_score: number;
  highest_quiz_score: number;
  total_quizzes_completed: number;
  strong_concepts: string[];
  weak_concepts: string[];
  preferred_language: string;
  current_streak_days: number;
  career_goal: string | null;
}

interface PreSessionMentor {
  greeting: string;
  mentor_message: string;
  suggested_next_topic?: string;
  career_goal?: string;
  streak_days: number;
}



const LANGUAGES = [
  { code: "en", label: "English", tag: "EN" },
  { code: "hi", label: "Hindi (हिंदी)", tag: "HI" },
  { code: "es", label: "Spanish (Español)", tag: "ES" },
  { code: "fr", label: "French (Français)", tag: "FR" },
  { code: "gu", label: "Gujarati (ગુજરાતી)", tag: "GU" },
];

export default function LearnPage() {
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const [selectedMainField, setSelectedMainField] = useState<string>("Computer Science");
  const [selectedSubField, setSelectedSubField] = useState<string>("Web Development");
  const [randomizedVideos, setRandomizedVideos] = useState<{title: string, url: string}[]>([]);

  useEffect(() => {
    if (selectedMainField && selectedSubField && STEM_CATEGORIES[selectedMainField]?.[selectedSubField]) {
      const videos = [...STEM_CATEGORIES[selectedMainField][selectedSubField]];
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
      }
      setRandomizedVideos(videos.slice(0, 6)); // show up to 6 shuffled videos
    } else {
      setRandomizedVideos([]);
    }
  }, [selectedMainField, selectedSubField]);

  const [userGaps, setUserGaps] = useState<ConceptGap[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [mentorGuidance, setMentorGuidance] = useState<PreSessionMentor | null>(null);
  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [onboardingMainField, setOnboardingMainField] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState<boolean>(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const router = useRouter();
  const [viewState, setViewState] = useState<"input" | "loading" | "explanation" | "quiz">("input");
  const [loadingStep, setLoadingStep] = useState<string>("Processing topic content...");

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMobileDashboardOpen, setIsMobileDashboardOpen] = useState(false);

  // Refresh dashboard data (called on mount and after lesson/quiz events)
  const refreshDashboard = useCallback(async () => {
    try {
      const dash = await apiRequest<DashboardData>("/api/v1/learn/me/dashboard");
      setDashboardData(dash);
    } catch {
      // Non-critical — dashboard will show previous data or empty state
    }
  }, []);

  // Fetch student's profile, mentor guidance, concept gaps, and dashboard on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [gapsRes, profileRes, mentorRes] = await Promise.all([
          apiRequest<{ gaps: ConceptGap[] }>("/api/v1/learn/me/gaps"),
          apiRequest<StudentProfile>("/api/v1/learn/me/profile"),
          apiRequest<PreSessionMentor>("/api/v1/learn/me/mentor/pre-session"),
        ]);
        setUserGaps(gapsRes.gaps || []);
        setProfile(profileRes);
        setMentorGuidance(mentorRes);
        if (!profileRes.career_goal) {
          setShowGoalModal(true);
        }
      } catch {
        // Non-critical, ignore
      }
      // Load dashboard independently so a mentor failure doesn't block it
      refreshDashboard();
    }
    loadData();
  }, [refreshDashboard]);

  // Auto-refresh dashboard whenever dashboardRefreshKey increments
  useEffect(() => {
    if (dashboardRefreshKey > 0) refreshDashboard();
  }, [dashboardRefreshKey, refreshDashboard]);

  const handleSelectCareerGoal = async (goal: string) => {
    setIsSavingGoal(true);
    try {
      const updated = await apiRequest<StudentProfile>("/api/v1/learn/me/career-goal", {
        method: "PATCH",
        body: JSON.stringify({ career_goal: goal }),
      });
      setProfile(updated);
      setShowGoalModal(false);
    } catch (err) {
      setError("Failed to save career goal. Please try again.");
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleExtractAndExplain = async (urlToProcess: string, directText?: string) => {
    if (inputMode === "url" && !urlToProcess.trim()) {
      setError("Please paste a valid YouTube URL.");
      return;
    }

    if (inputMode === "text" && !directText?.trim()) {
      setError("Please paste your topic transcript or study notes.");
      return;
    }

    setError(null);
    setViewState("loading");
    setLoadingStep("1. Processing topic content...");

    try {
      const progressTimer = setTimeout(() => {
        setLoadingStep(`2. Generating AI storytelling explanation in ${LANGUAGES.find(l => l.code === selectedLanguage)?.label || "English"}...`);
      }, 1500);

      const requestBody =
        inputMode === "text"
          ? { youtube_url: "", transcript: directText?.trim(), language: selectedLanguage }
          : { youtube_url: urlToProcess.trim(), language: selectedLanguage };

      const response = await apiRequest<ExplainResponse>("/api/v1/learn/explain", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      clearTimeout(progressTimer);
      // Navigate directly to session URL /learn/[sessionId]
      router.push(`/learn/${response.session_id}`);
    } catch (err) {
      setViewState("input");
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to generate explanation. Please try again.");
      }
    }
  };

  const handleStartNew = () => {
    setExplainData(null);
    setYoutubeUrl("");
    setPastedText("");
    setError(null);
    setViewState("input");
  };

  return (
    <div className="flex-1 text-ink font-sans grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 py-6 items-start">
      {/* LEFT PANEL: Learning Dashboard */}
      <div className="hidden lg:block lg:col-span-3 lg:sticky lg:top-20 max-h-[calc(100vh-5rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#2F523330_transparent] space-y-4 pr-0.5">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border-muted/50 pb-3 mb-4">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="font-display text-sm font-bold text-primary">Learning Dashboard</h3>
          </div>

          {dashboardData ? (
            <LearningDashboard
              data={dashboardData}
              mentor={mentorGuidance}
              onChangeGoal={() => setShowGoalModal(true)}
            />
          ) : (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-border-muted/40 rounded-xl" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CENTER COLUMN: Main Learn & Quiz Content */}
      <div className="lg:col-span-6 w-full space-y-6">
        {/* 1. INPUT STATE */}
        {viewState === "input" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Hero Header */}
            <div className="space-y-2 border-b border-border-muted/50 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[11px] font-bold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>AI Learning Accelerator</span>
                </div>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary tracking-tight">
                Turn Any Topic into Mastery
              </h1>
              <p className="font-sans text-xs sm:text-sm text-ink/75 leading-relaxed">
                Paste a YouTube link or study notes to generate storytelling explanations and test your retention with an adaptive 3-phase quiz.
              </p>
            </div>

            {/* Mobile Learning Dashboard Collapsible (< lg) */}
            <div className="lg:hidden bg-surface-subtle border border-border-muted/70 rounded-2xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setIsMobileDashboardOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002-2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="font-display text-xs font-bold text-primary">Your Learning Dashboard & Stats</span>
                </div>
                <svg
                  className={`w-4 h-4 text-ink/50 transition-transform duration-200 ${isMobileDashboardOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isMobileDashboardOpen && dashboardData && (
                <div className="p-4 border-t border-border-muted/60 animate-in fade-in duration-150">
                  <LearningDashboard
                    data={dashboardData}
                    mentor={mentorGuidance}
                    onChangeGoal={() => setShowGoalModal(true)}
                  />
                </div>
              )}
            </div>

            {/* Reva AI Mentor Card */}
            {mentorGuidance && (
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-surface border border-primary/20 rounded-2xl p-5 space-y-3 shadow-2xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary text-surface font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                      <svg className="w-4 h-4 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </span>
                    <span className="font-display text-sm font-bold text-primary">
                      {mentorGuidance.greeting}
                    </span>
                  </div>
                  {mentorGuidance.streak_days > 0 && (
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-mono text-[10px] font-bold rounded-full border border-amber-200 flex items-center gap-1">
                      <svg className="w-3 h-3 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 23c-5.52 0-10-4.48-10-10 0-4.59 3.09-8.46 7.35-9.62.48-.13.96.22.96.72 0 .34-.21.64-.52.76C7.03 5.92 5 8.71 5 12c0 3.87 3.13 7 7 7s7-3.13 7-7c0-1.89-.75-3.6-1.97-4.88-.26-.27-.24-.7.04-.95.27-.24.69-.22.94.05C19.34 7.6 20 9.71 20 12c0 5.52-4.48 10-10 10z"/>
                      </svg>
                      <span>{mentorGuidance.streak_days} Day Streak</span>
                    </span>
                  )}
                </div>

                <p className="font-sans text-xs sm:text-sm text-ink/80 leading-relaxed">
                  {mentorGuidance.mentor_message}
                </p>

                {mentorGuidance.suggested_next_topic && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-sans text-ink/60 font-semibold">Suggested Next Topic:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setInputMode("text");
                        setPastedText(mentorGuidance.suggested_next_topic || "");
                      }}
                      className="px-3 py-1 bg-surface border border-primary/30 hover:bg-primary/10 text-primary font-sans font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                    >
                      <span>{mentorGuidance.suggested_next_topic}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Clean 3-Step Learning Stepper */}
            <div className="flex items-center justify-between bg-surface border border-border-muted/80 rounded-2xl p-3 px-5 text-xs font-sans font-bold text-ink/70 shadow-2xs overflow-x-auto no-scrollbar gap-2">
              <div className="flex items-center gap-2 text-primary font-bold shrink-0">
                <span className="w-5 h-5 rounded-full bg-primary text-surface font-mono text-[11px] flex items-center justify-center">1</span>
                <span>Story Chunks</span>
              </div>
              <svg className="w-4 h-4 text-ink/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-5 h-5 rounded-full bg-surface-subtle border border-border-muted text-ink/60 font-mono text-[11px] flex items-center justify-center">2</span>
                <span>Adaptive Quiz</span>
              </div>
              <svg className="w-4 h-4 text-ink/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-5 h-5 rounded-full bg-surface-subtle border border-border-muted text-ink/60 font-mono text-[11px] flex items-center justify-center">3</span>
                <span>Socratic Discussion</span>
              </div>
            </div>

            {/* Main Card */}
            <div className="bg-surface border border-border-muted rounded-2xl p-6 space-y-6 shadow-2xs">
            {/* Input Mode Selector (URL vs Text) */}
            <div className="flex items-center gap-2 border-b border-border-muted pb-4">
              <button
                type="button"
                onClick={() => { setInputMode("url"); setError(null); }}
                className={`px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer ${
                  inputMode === "url"
                    ? "bg-primary text-surface shadow-xs"
                    : "text-ink/70 hover:text-ink bg-background"
                }`}
              >
                YouTube URL
              </button>
              <button
                type="button"
                onClick={() => { setInputMode("text"); setError(null); }}
                className={`px-4 py-2 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer ${
                  inputMode === "text"
                    ? "bg-primary text-surface shadow-xs"
                    : "text-ink/70 hover:text-ink bg-background"
                }`}
              >
                Paste Notes / Text
              </button>
            </div>

            {/* MULTILINGUAL LANGUAGE SELECTOR */}
            <div className="space-y-2">
              <label className="block text-xs font-mono font-bold text-ink/70 uppercase">
                Explanation & Quiz Language:
              </label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-sans font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedLanguage === lang.code
                        ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/20"
                        : "bg-background border-border-muted text-ink/70 hover:border-border-muted/80"
                    }`}
                  >
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {inputMode === "url" ? (
              <div className="space-y-3">
                <label className="block text-xs font-mono font-bold text-ink/70 uppercase">
                  YouTube Video Link
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 px-4 py-3 bg-background border border-border-muted rounded-xl font-sans text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleExtractAndExplain(youtubeUrl)}
                    className="px-6 py-3 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    Explain & Quiz
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-mono font-bold text-ink/70 uppercase">
                  Paste Transcript or Study Notes
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste your lecture notes, transcript, or article content here..."
                  className="w-full px-4 py-3 bg-background border border-border-muted rounded-xl font-sans text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-primary transition-all resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleExtractAndExplain("", pastedText)}
                    className="px-6 py-3 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Explain & Quiz
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-sans text-red-700">
                {error}
              </div>
            )}

            {/* Sample Topics */}
            <div className="pt-2 border-t border-border-muted/60 space-y-4">
              <span className="text-[11px] font-mono text-ink/50 uppercase font-bold">
                Try a sample topic:
              </span>
              
              {/* Main Field Selector */}
              <div className="flex flex-wrap gap-2">
                {Object.keys(STEM_CATEGORIES).map((mainField) => (
                  <button
                    key={mainField}
                    type="button"
                    onClick={() => {
                      setSelectedMainField(mainField);
                      setSelectedSubField(Object.keys(STEM_CATEGORIES[mainField])[0]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold border transition-all cursor-pointer ${
                      selectedMainField === mainField
                        ? "bg-primary text-surface border-primary shadow-xs"
                        : "bg-surface border-border-muted text-ink/70 hover:border-primary/50"
                    }`}
                  >
                    {mainField}
                  </button>
                ))}
              </div>
              
              {/* Sub Field Selector */}
              {selectedMainField && STEM_CATEGORIES[selectedMainField] && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border-muted/30">
                  {Object.keys(STEM_CATEGORIES[selectedMainField]).map((subField) => (
                    <button
                      key={subField}
                      type="button"
                      onClick={() => setSelectedSubField(subField)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold border transition-all cursor-pointer ${
                        selectedSubField === subField
                          ? "bg-primary/10 text-primary border-primary ring-1 ring-primary/20 shadow-xs"
                          : "bg-background border-border-muted text-ink/70 hover:border-border-muted/80"
                      }`}
                    >
                      {subField}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Videos */}
              {randomizedVideos.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {randomizedVideos.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputMode("url");
                        setYoutubeUrl(sample.url);
                        handleExtractAndExplain(sample.url);
                      }}
                      className="px-3 py-1.5 bg-background hover:bg-surface border border-border-muted rounded-lg text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <svg className="w-3 h-3 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                      </svg>
                      {sample.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. LOADING STATE */}
      {viewState === "loading" && (
        <div className="bg-surface border border-border-muted rounded-2xl p-12 text-center space-y-6 shadow-2xs my-12 animate-in fade-in duration-200">
          <div className="border-4 border-primary border-t-transparent animate-spin w-12 h-12 rounded-full mx-auto" />
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold text-primary">Generating AI Learning Materials</h2>
            <p className="font-sans text-sm text-ink/75 font-mono">{loadingStep}</p>
          </div>
        </div>
      )}

      {/* 3. EXPLANATION STATE */}
      {viewState === "explanation" && explainData && (
        <div className="space-y-6">
          <button
            onClick={handleStartNew}
            className="text-xs font-sans font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Start Another Topic</span>
          </button>

          <ExplanationChunks
            videoTitle={explainData.video_title}
            videoUrl={`https://www.youtube.com/watch?v=${explainData.video_id}`}
            chunks={explainData.chunks}
            dailyRemaining={explainData.daily_explanations_remaining}
            onStartQuiz={() => setViewState("quiz")}
          />

          {/* Interactive Lesson Chat */}
          <LessonChat
            sessionId={explainData.session_id}
            lessonTitle={explainData.video_title}
          />
        </div>
      )}

      {/* 4. QUIZ STATE */}
      {viewState === "quiz" && explainData && (
        <div className="space-y-6">
          <LearnQuiz
            sessionId={explainData.session_id}
            onBackToExplanation={() => setViewState("explanation")}
            onQuizComplete={() => setDashboardRefreshKey((k) => k + 1)}
          />

          {/* Interactive Lesson Chat */}
          <LessonChat
            sessionId={explainData.session_id}
            lessonTitle={explainData.video_title}
          />

          {/* Weekly Reports */}
          <LearningReports />
        </div>
      )}
      </div>

      {/* RIGHT PANEL: Quick Start Tips */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-4 lg:sticky lg:top-20">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-5 space-y-4 shadow-2xs">
          <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2 border-b border-border-muted/50 pb-2.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>How It Works</span>
          </h3>
          <div className="space-y-3 font-sans text-xs text-ink/70 leading-relaxed">
            {[
              { n: "1", title: "Input Material", desc: "Paste a YouTube link or lecture notes." },
              { n: "2", title: "Story Chunks", desc: "AI breaks it into storytelling chapters." },
              { n: "3", title: "3-Phase Quiz", desc: "Test retention and surface weak areas." },
              { n: "4", title: "Ask Reva", desc: "Follow-up chat about any part of the lesson." },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                <p><strong className="text-ink">{title}:</strong> {desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Daily stats summary from dashboard */}
        {dashboardData && dashboardData.total_sessions > 0 && (
          <div className="bg-primary/6 border border-primary/15 rounded-2xl p-4 space-y-2">
            <p className="font-mono text-[10px] font-bold text-primary/70 uppercase">Today's Goal</p>
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs text-ink/70">Avg Score</span>
              <span className="font-mono text-xs font-bold text-primary">{dashboardData.avg_quiz_score}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs text-ink/70">Topics Done</span>
              <span className="font-mono text-xs font-bold text-primary">{dashboardData.topics_completed}</span>
            </div>
            {dashboardData.current_streak_days > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs text-ink/70">Streak</span>
                <span className="font-mono text-xs font-bold text-amber-600">{dashboardData.current_streak_days}d</span>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Onboarding & Goal Selector Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface border border-border-muted rounded-3xl max-w-xl w-full shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh] [scrollbar-width:thin] [scrollbar-color:#2F523340_transparent] flex flex-col">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-surface rounded-t-3xl px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-border-muted/50 space-y-2 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[11px] font-bold">
                <span>Personalized Learning Context</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-primary">
                What are you learning for?
              </h2>
              <p className="font-sans text-xs sm:text-sm text-ink/70 leading-relaxed">
                Select your primary career learning goal so Reva AI can tailor real-world examples, domain focus, and interview emphasis specifically for you.
              </p>
            </div>

            <div className="px-6 sm:px-8 py-5 flex-1">
              {!onboardingMainField ? (
                <div className="space-y-3">
                  <p className="text-xs font-mono font-bold text-ink/50 uppercase">Step 1: Choose a Field</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.keys(STEM_CATEGORIES).map((mainField) => (
                      <button
                        key={mainField}
                        type="button"
                        onClick={() => setOnboardingMainField(mainField)}
                        className="p-4 rounded-2xl border bg-background border-border-muted/80 text-left transition-all cursor-pointer hover:border-primary/50 hover:bg-surface flex items-center justify-between"
                      >
                        <span className="font-sans text-sm font-bold text-ink/80">{mainField}</span>
                        <svg className="w-4 h-4 text-ink/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono font-bold text-ink/50 uppercase">Step 2: Choose a Sub-Field</p>
                    <button
                      type="button"
                      onClick={() => setOnboardingMainField(null)}
                      className="text-xs font-sans font-bold text-primary hover:underline cursor-pointer"
                    >
                      ← Back to Fields
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.keys(STEM_CATEGORIES[onboardingMainField]).map((subField) => {
                      const isSelected = profile?.career_goal === subField;
                      return (
                        <button
                          key={subField}
                          type="button"
                          disabled={isSavingGoal}
                          onClick={() => handleSelectCareerGoal(subField)}
                          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/30"
                              : "bg-background border-border-muted/80 text-ink hover:border-primary/50 hover:bg-surface"
                          }`}
                        >
                          <span className="font-sans text-sm font-bold truncate">{subField}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer */}
            {profile?.career_goal && (
              <div className="sticky bottom-0 z-10 bg-surface rounded-b-3xl px-6 sm:px-8 py-4 border-t border-border-muted/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="px-4 py-2 bg-background border border-border-muted hover:bg-surface text-ink/80 text-xs font-sans font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
