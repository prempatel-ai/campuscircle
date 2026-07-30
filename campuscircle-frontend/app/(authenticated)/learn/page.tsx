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

  const [viewState, setViewState] = useState<"input" | "loading" | "explanation" | "quiz">("input");
  const [loadingStep, setLoadingStep] = useState<string>("Processing topic content...");

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch student's recurring concept gaps for dashboard
  useEffect(() => {
    async function loadGaps() {
      try {
        const res = await apiRequest<{ gaps: ConceptGap[] }>("/api/v1/learn/me/gaps");
        setUserGaps(res.gaps || []);
      } catch (err) {
        // Non-critical, ignore
      }
    }
    loadGaps();
  }, []);

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
    <div className="flex-1 text-ink font-sans max-w-4xl mx-auto w-full px-4 py-8 pb-20">
      {/* 1. INPUT STATE */}
      {viewState === "input" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Hero Header */}
          <div className="text-center space-y-3 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-xs font-bold">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>AI Learning Accelerator</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight">
              Turn Any Topic into Mastery
            </h1>
            <p className="font-sans text-sm sm:text-base text-ink/75 leading-relaxed">
              Paste a YouTube link or study notes to generate storytelling explanations and test your retention with an adaptive 3-phase quiz.
            </p>
          </div>

          {/* DASHBOARD: REVIEW YOUR CONCEPT GAPS */}
          {userGaps.length > 0 && (
            <div className="bg-surface border border-primary/20 rounded-2xl p-6 shadow-2xs space-y-3 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h3 className="font-display text-sm font-bold text-primary">Review Your Concept Gaps</h3>
                </div>
                <span className="text-[11px] font-mono font-bold text-primary px-2.5 py-0.5 bg-primary/10 rounded-full">
                  {userGaps.length} Weak Area{userGaps.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="font-sans text-xs text-ink/75">
                These concepts caused repeated quiz misses across your studied topics:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {userGaps.map((g, idx) => (
                  <div key={idx} className="px-3 py-1.5 bg-background border border-border-muted rounded-xl flex items-center gap-2 text-xs font-sans">
                    <span className="font-bold text-ink">{g.concept_category}</span>
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-mono text-[10px] font-bold rounded-md">
                      {g.miss_count} miss{g.miss_count > 1 ? "es" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-surface border border-border-muted rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
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
  );
}
