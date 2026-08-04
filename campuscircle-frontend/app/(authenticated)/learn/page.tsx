"use client";

import React, { useState, useEffect } from "react";
import { ExplanationChunks } from "@/components/ExplanationChunks";
import { LearnQuiz } from "@/components/LearnQuiz";
import { apiRequest, ApiError } from "@/lib/api";

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

const CAREER_GOALS = [
  { id: "Placement Preparation", label: "Placement Preparation", icon: "💼", desc: "Coding interviews, DS/Algo, time complexity" },
  { id: "AI / Machine Learning", label: "AI / Machine Learning", icon: "🤖", desc: "ML models, neural nets, math, vector spaces" },
  { id: "Data Science", label: "Data Science", icon: "📊", desc: "Data analysis, SQL, statistics, visualization" },
  { id: "Web Development", label: "Web Development", icon: "🌐", desc: "Frontend, backend, APIs, system architecture" },
  { id: "Mobile Development", label: "Mobile Development", icon: "📱", desc: "iOS, Android, cross-platform apps, UI/UX" },
  { id: "Competitive Programming", label: "Competitive Programming", icon: "⚡", desc: "Fast problem solving, edge cases, algorithms" },
  { id: "GATE", label: "GATE Exam", icon: "🎓", desc: "Core CS theory, formulas, exam problems" },
  { id: "Research", label: "Academic Research", icon: "🔬", desc: "Papers, deep theory, mathematical proofs" },
  { id: "Other", label: "General Learning", icon: "🚀", desc: "Comprehensive foundational understanding" },
];

const SAMPLE_VIDEOS = [
  {
    title: "Python in 100 Seconds",
    url: "https://www.youtube.com/watch?v=x7X9w_GIm1s",
  },
  {
    title: "Docker Containers Overview",
    url: "https://www.youtube.com/watch?v=Gjnup-PuquQ",
  },
  {
    title: "FastAPI Backend Crash Course",
    url: "https://www.youtube.com/watch?v=0sOvCWFmrtA",
  },
  {
    title: "SQL & Databases Explained",
    url: "https://www.youtube.com/watch?v=zsjvFFKOm3c",
  },
];

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "hi", label: "Hindi (हिंदी)", flag: "🇮🇳" },
  { code: "es", label: "Spanish (Español)", flag: "🇪🇸" },
  { code: "fr", label: "French (Français)", flag: "🇫🇷" },
  { code: "gu", label: "Gujarati (ગુજરાતી)", flag: "🇮🇳" },
];

export default function LearnPage() {
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const [userGaps, setUserGaps] = useState<ConceptGap[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [mentorGuidance, setMentorGuidance] = useState<PreSessionMentor | null>(null);
  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [isSavingGoal, setIsSavingGoal] = useState<boolean>(false);

  const [viewState, setViewState] = useState<"input" | "loading" | "explanation" | "quiz">("input");
  const [loadingStep, setLoadingStep] = useState<string>("Processing topic content...");

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch student's profile, mentor guidance & concept gaps on mount
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
      } catch (err) {
        // Non-critical, ignore
      }
    }
    loadData();
  }, []);

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
      setExplainData(response);
      setViewState("explanation");
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
      {/* LEFT PANEL: Concept Gaps */}
      <div className="hidden lg:block lg:col-span-3 lg:sticky lg:top-20 space-y-4">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-5 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-border-muted/50 pb-2.5">
            <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>Concept Gaps</span>
            </h3>
            {userGaps.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-primary px-2 py-0.5 bg-primary/10 rounded-full">
                {userGaps.length}
              </span>
            )}
          </div>

          <p className="font-sans text-xs text-ink/75 leading-relaxed">
            Concepts flagged for review based on your previous adaptive quiz performance.
          </p>

          {userGaps.length === 0 ? (
            <div className="p-3 bg-surface border border-border-muted/60 rounded-xl text-center">
              <p className="text-xs font-sans text-ink/50">No concept gaps yet. Complete a quiz to track weak areas!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {userGaps.map((g, idx) => (
                <div key={idx} className="p-2.5 bg-surface border border-border-muted/60 rounded-xl flex items-center justify-between text-xs font-sans shadow-2xs">
                  <span className="font-semibold text-ink truncate">{g.concept_category}</span>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 font-mono text-[10px] font-bold rounded-md shrink-0">
                    {g.miss_count} miss{g.miss_count > 1 ? "es" : ""}
                  </span>
                </div>
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

                {profile?.career_goal && (
                  <button
                    onClick={() => setShowGoalModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface border border-border-muted text-ink/80 hover:border-primary/40 rounded-full font-mono text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <span>Goal: {profile.career_goal}</span>
                    <span className="text-primary text-[10px] underline">(Change)</span>
                  </button>
                )}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary tracking-tight">
                Turn Any Topic into Mastery
              </h1>
              <p className="font-sans text-xs sm:text-sm text-ink/75 leading-relaxed">
                Paste a YouTube link or study notes to generate storytelling explanations and test your retention with an adaptive 3-phase quiz.
              </p>
            </div>

            {/* Reva AI Mentor Card */}
            {mentorGuidance && (
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-surface border border-primary/20 rounded-2xl p-5 space-y-3 shadow-2xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-primary text-surface font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                      🤖
                    </span>
                    <span className="font-display text-sm font-bold text-primary">
                      {mentorGuidance.greeting}
                    </span>
                  </div>
                  {mentorGuidance.streak_days > 0 && (
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-mono text-[10px] font-bold rounded-full border border-amber-200">
                      🔥 {mentorGuidance.streak_days} Day Streak
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
            <div className="pt-2 border-t border-border-muted/60 space-y-2">
              <span className="text-[11px] font-mono text-ink/50 uppercase font-bold">
                Try a sample topic:
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_VIDEOS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputMode("url");
                      setYoutubeUrl(sample.url);
                      handleExtractAndExplain(sample.url);
                    }}
                    className="px-3 py-1.5 bg-background hover:bg-surface border border-border-muted rounded-lg text-xs font-sans text-ink/80 hover:text-primary transition-all cursor-pointer"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
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
        </div>
      )}

      {/* 4. QUIZ STATE */}
      {viewState === "quiz" && explainData && (
        <LearnQuiz
          sessionId={explainData.session_id}
          onBackToExplanation={() => setViewState("explanation")}
        />
      )}
      </div>

      {/* RIGHT PANEL: How It Works */}
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 lg:sticky lg:top-20">
        <div className="bg-surface-subtle border border-border-muted/70 rounded-2xl p-5 space-y-4 shadow-2xs">
          <h3 className="font-display text-sm font-bold text-primary flex items-center gap-2 border-b border-border-muted/50 pb-2.5">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>How Learn AI Works</span>
          </h3>

          <div className="space-y-3 font-sans text-xs text-ink/75 leading-relaxed">
            <div className="flex gap-2.5 items-start">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p><strong className="text-ink">Input Material:</strong> Paste a YouTube video link or lecture notes in any supported language.</p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p><strong className="text-ink">Story Chunks:</strong> AI breaks down complex topics into bite-sized storytelling chapters.</p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p><strong className="text-ink">3-Phase Quiz:</strong> Test recall and identify weak concept gaps for targeted review.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding & Goal Selector Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface border border-border-muted rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-2 text-center sm:text-left border-b border-border-muted/50 pb-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
              {CAREER_GOALS.map((goal) => {
                const isSelected = profile?.career_goal === goal.id;
                return (
                  <button
                    key={goal.id}
                    disabled={isSavingGoal}
                    onClick={() => handleSelectCareerGoal(goal.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/30"
                        : "bg-background border-border-muted/80 text-ink hover:border-primary/50 hover:bg-surface"
                    }`}
                  >
                    <span className="text-xl shrink-0 mt-0.5">{goal.icon}</span>
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-sans text-xs font-bold truncate">{goal.label}</p>
                      <p className="font-sans text-[11px] text-ink/60 leading-snug line-clamp-2">{goal.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {profile?.career_goal && (
              <div className="flex justify-end pt-2 border-t border-border-muted/50">
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
