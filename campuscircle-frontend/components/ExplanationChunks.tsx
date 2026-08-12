"use client";

import React, { useState } from "react";
import { InteractiveVisual } from "./InteractiveVisual";
import { useSpeech } from "@/hooks/useSpeech";
import { Volume2, Square } from "lucide-react";

interface Chunk {
  title: string;
  explanation: string;
  has_visual?: boolean;
  visual_html?: string | null;
}

interface ExplanationChunksProps {
  videoTitle: string;
  videoUrl: string;
  chunks: Chunk[];
  dailyRemaining: number;
  onStartQuiz: () => void;
}

export function ExplanationChunks({
  videoTitle,
  videoUrl,
  chunks,
  dailyRemaining,
  onStartQuiz,
}: ExplanationChunksProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { speak, currentlySpeaking } = useSpeech();

  const currentChunk = chunks[activeIndex] || chunks[0];

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-surface border border-border-muted rounded-2xl p-6 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-primary/10 text-primary font-mono font-bold text-xs rounded-lg border border-primary/20">
              AI Storytelling Explanation
            </span>
            <span className="text-xs font-sans text-ink/60">
              {dailyRemaining} extractions left today
            </span>
          </div>

          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-sans text-primary hover:underline font-semibold flex items-center gap-1"
          >
            <span>Watch on YouTube</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <h1 className="font-display text-xl sm:text-2xl font-bold text-primary leading-snug">
          {videoTitle}
        </h1>
      </div>

      {/* Chunk Stepper Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        {chunks.map((chunk, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeIndex === idx
                ? "bg-primary text-surface shadow-xs"
                : "bg-surface border border-border-muted text-ink/70 hover:text-ink"
            }`}
          >
            <span>Part {idx + 1}</span>
            {chunk.has_visual && chunk.visual_html && (
              <span className={`w-1.5 h-1.5 rounded-full ${activeIndex === idx ? "bg-surface" : "bg-primary"}`} />
            )}
          </button>
        ))}
      </div>

      {/* Main Active Chunk Story Card */}
      <div className="bg-surface border border-border-muted rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xs min-h-[260px] flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border-muted/60 pb-3">
            <span className="font-mono text-xs text-primary font-bold">
              PART {activeIndex + 1} OF {chunks.length}
            </span>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => speak(currentChunk.explanation, currentChunk.title)} 
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${currentlySpeaking === currentChunk.title ? "bg-primary/10 text-primary animate-pulse" : "text-ink/40 hover:text-primary hover:bg-primary/10"}`}
                title={currentlySpeaking === currentChunk.title ? "Stop Reading" : "Read Aloud"}
              >
                {currentlySpeaking === currentChunk.title ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span className="text-xs font-sans text-ink/50">
                Interactive Storytelling Format
              </span>
            </div>
          </div>

          <h2 className="font-display text-lg sm:text-xl font-bold text-ink">
            {currentChunk.title}
          </h2>

          <p className="font-sans text-sm sm:text-base text-ink/80 leading-relaxed whitespace-pre-line">
            {currentChunk.explanation}
          </p>

          {/* Render Sandboxed Interactive Visual if present */}
          {currentChunk.has_visual && currentChunk.visual_html && (
            <div className="pt-2">
              <InteractiveVisual visualHtml={currentChunk.visual_html} title={currentChunk.title} />
            </div>
          )}
        </div>

        {/* Next / Previous Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-border-muted/60 gap-4">
          <button
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
            className="px-4 py-2 bg-background border border-border-muted rounded-xl text-xs font-sans font-bold text-ink/70 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface transition-all"
          >
            Previous Part
          </button>

          {activeIndex < chunks.length - 1 ? (
            <button
              onClick={() => setActiveIndex((prev) => Math.min(chunks.length - 1, prev + 1))}
              className="px-5 py-2.5 bg-primary text-surface rounded-xl text-xs font-sans font-bold hover:opacity-95 transition-all shadow-xs"
            >
              Next Part
            </button>
          ) : (
            <button
              onClick={onStartQuiz}
              className="px-6 py-2.5 bg-primary text-surface rounded-xl text-xs font-sans font-bold hover:opacity-95 transition-all shadow-sm flex items-center gap-2 animate-bounce"
            >
              <span>Take 3-Phase Quiz</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Action Banner to Start Quiz */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="font-display text-base font-bold text-primary">
            Ready to test your comprehension?
          </h3>
          <p className="font-sans text-xs text-ink/75">
            Take the adaptive 3-phase quiz (Recall, Application, and Synthesis) to master this topic.
          </p>
        </div>
        <button
          onClick={onStartQuiz}
          className="px-6 py-3 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shrink-0 cursor-pointer shadow-sm"
        >
          Start 3-Phase Quiz
        </button>
      </div>
    </div>
  );
}
