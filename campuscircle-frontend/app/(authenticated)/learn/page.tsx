"use client";

import React, { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { ExplanationChunks } from "@/components/ExplanationChunks";
import { LearnQuiz } from "@/components/LearnQuiz";

interface Chunk {
  title: string;
  explanation: string;
}

interface ExplainResponse {
  session_id: string;
  video_id: string;
  video_title: string;
  chunks: Chunk[];
  is_cached: boolean;
  daily_explanations_remaining: number;
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

export default function LearnPage() {
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pastedText, setPastedText] = useState("");

  const [viewState, setViewState] = useState<"input" | "loading" | "explanation" | "quiz">("input");
  const [loadingStep, setLoadingStep] = useState<string>("Processing topic content...");

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setLoadingStep("2. Generating AI storytelling explanation via Groq...");
      }, 1500);

      const requestBody =
        inputMode === "text"
          ? { youtube_url: "", transcript: directText?.trim() }
          : { youtube_url: urlToProcess.trim() };

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
              Paste a YouTube link or paste your study notes to generate storytelling explanations and test your retention with an adaptive 3-phase quiz.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-surface border border-border-muted rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
            {/* Input Mode Selector Tabs */}
            <div className="flex bg-background p-1 border border-border-muted rounded-xl w-full max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setInputMode("url")}
                className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  inputMode === "url" ? "bg-primary text-surface shadow-xs" : "text-ink/60 hover:text-ink"
                }`}
              >
                YouTube URL
              </button>
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  inputMode === "text" ? "bg-primary text-surface shadow-xs" : "text-ink/60 hover:text-ink"
                }`}
              >
                Paste Notes / Text
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExtractAndExplain(youtubeUrl, pastedText);
              }}
              className="space-y-4"
            >
              {inputMode === "url" ? (
                <div className="space-y-2">
                  <label className="block text-xs font-mono font-bold text-ink/80 uppercase">
                    YouTube Video Link
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink/40">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full pl-10 pr-4 py-3 bg-background border border-border-muted rounded-xl text-sm font-sans text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-mono font-bold text-ink/80 uppercase">
                    Paste Transcript or Study Notes
                  </label>
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste full transcript, lecture notes, or topic summary here..."
                    className="w-full p-4 bg-background border border-border-muted rounded-xl text-sm font-sans text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
                  />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-sans text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Explain Topic & Generate Quiz</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>

            {/* Quick Sample Links */}
            {inputMode === "url" && (
              <div className="space-y-3 pt-4 border-t border-border-muted/60">
                <span className="text-xs font-mono font-bold text-ink/50 uppercase">Try a sample topic:</span>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_VIDEOS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setYoutubeUrl(sample.url);
                        handleExtractAndExplain(sample.url);
                      }}
                      className="px-3 py-1.5 bg-background border border-border-muted rounded-lg text-xs font-sans text-ink/75 hover:text-ink hover:border-border-muted/80 transition-all cursor-pointer"
                    >
                      {sample.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. LOADING STATE */}
      {viewState === "loading" && (
        <div className="bg-surface border border-border-muted rounded-2xl p-12 text-center space-y-6 shadow-2xs max-w-lg mx-auto my-12 animate-in fade-in duration-200">
          <div className="border-4 border-primary border-t-transparent animate-spin w-12 h-12 rounded-full mx-auto" />
          <div className="space-y-2">
            <h3 className="font-display text-lg font-bold text-primary">Processing Topic Material</h3>
            <p className="font-sans text-xs text-ink/70 animate-pulse">{loadingStep}</p>
          </div>
        </div>
      )}

      {/* 3. EXPLANATION STATE */}
      {viewState === "explanation" && explainData && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <button
              onClick={handleStartNew}
              className="text-xs font-sans font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Explain Another Topic</span>
            </button>
          </div>

          <ExplanationChunks
            videoTitle={explainData.video_title}
            videoUrl={explainData.video_id.startsWith("custom_") ? "#" : `https://www.youtube.com/watch?v=${explainData.video_id}`}
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
