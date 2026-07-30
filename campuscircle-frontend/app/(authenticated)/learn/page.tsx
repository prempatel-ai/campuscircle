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
    title: "Graph Data Structure Overview",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title: "System Design Fundamentals",
    url: "https://www.youtube.com/watch?v=b1670bfe517",
  },
  {
    title: "FastAPI & Async Python Tutorial",
    url: "https://www.youtube.com/watch?v=f9876543210",
  },
];

export default function LearnPage() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [viewState, setViewState] = useState<"input" | "loading" | "explanation" | "quiz">("input");
  const [loadingStep, setLoadingStep] = useState<string>("Extracting YouTube transcript...");

  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtractAndExplain = async (urlToProcess: string) => {
    if (!urlToProcess.trim()) {
      setError("Please paste a valid YouTube URL.");
      return;
    }

    setError(null);
    setViewState("loading");
    setLoadingStep("1. Extracting YouTube transcript...");

    try {
      // Step 2 simulation text transition for honest progress reporting
      const progressTimer = setTimeout(() => {
        setLoadingStep("2. Generating AI storytelling explanation via Groq...");
      }, 1800);

      const response = await apiRequest<ExplainResponse>("/api/v1/learn/explain", {
        method: "POST",
        body: JSON.stringify({ youtube_url: urlToProcess.trim() }),
      });

      clearTimeout(progressTimer);
      setExplainData(response);
      setViewState("explanation");
    } catch (err) {
      setViewState("input");
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to extract transcript or generate explanation.");
      }
    }
  };

  const handleStartNew = () => {
    setExplainData(null);
    setYoutubeUrl("");
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
              Turn YouTube Videos into Mastery
            </h1>
            <p className="font-sans text-sm sm:text-base text-ink/75 leading-relaxed">
              Paste any technical YouTube video URL to generate a storytelling explanation and test your retention with an adaptive 3-phase quiz.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-surface border border-border-muted rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExtractAndExplain(youtubeUrl);
              }}
              className="space-y-4"
            >
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

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-sans text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Extract & Explain Topic</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>

            {/* Quick Sample Links */}
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
          </div>
        </div>
      )}

      {/* 2. LOADING STATE */}
      {viewState === "loading" && (
        <div className="bg-surface border border-border-muted rounded-2xl p-12 text-center space-y-6 shadow-2xs max-w-lg mx-auto my-12 animate-in fade-in duration-200">
          <div className="border-4 border-primary border-t-transparent animate-spin w-12 h-12 rounded-full mx-auto" />
          <div className="space-y-2">
            <h3 className="font-display text-lg font-bold text-primary">Processing Video Topic</h3>
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
              <span>Explain Another Video</span>
            </button>
          </div>

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
