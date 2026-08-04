"use client";

import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WeeklyReport {
  id: string;
  week_start: string;
  week_end: string;
  total_study_time_seconds: number;
  lessons_completed: number;
  quizzes_completed: number;
  avg_quiz_score: number;
  highest_quiz_score: number;
  streak_days: number;
  topics_completed: string[];
  topics_needing_revision: string[];
  most_improved_concepts: string[];
  weak_concepts: string[];
  recommended_next_topics: string[];
  ai_summary: string;
  career_goal: string | null;
  is_ai_generated: boolean;
  generated_at: string;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStudyTime(seconds: number): string {
  if (seconds === 0) return "0m";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - now.getDay() + 1);
  thisMonday.setHours(0, 0, 0, 0);
  s.setHours(0, 0, 0, 0);

  if (s.getTime() === thisMonday.getTime()) return "This Week";

  const sLabel = s.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  const eLabel = e.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  return `${sLabel} – ${eLabel}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

// ─── Individual Report Card ─────────────────────────────────────────────────

function ReportCard({ report, isExpanded, onToggle }: {
  report: WeeklyReport;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const weekLabel = formatWeekLabel(report.week_start, report.week_end);
  const isThisWeek = weekLabel === "This Week";

  return (
    <div className={`bg-surface border rounded-2xl overflow-hidden transition-all duration-200 shadow-2xs ${
      isThisWeek ? "border-primary/30 ring-1 ring-primary/10" : "border-border-muted"
    }`}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-subtle transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Week icon */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isThisWeek ? "bg-primary text-surface" : "bg-primary/10 text-primary"
          }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-sm font-bold text-primary leading-tight">{weekLabel}</p>
              {isThisWeek && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[10px] font-bold">
                  Current
                </span>
              )}
              {report.is_ai_generated && (
                <span className="px-2 py-0.5 bg-surface border border-border-muted rounded-full font-mono text-[10px] text-ink/50">
                  AI Summary
                </span>
              )}
            </div>
            {/* Mini stats row */}
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="font-mono text-[11px] text-ink/50">
                {report.lessons_completed} lesson{report.lessons_completed !== 1 ? "s" : ""}
              </span>
              {report.avg_quiz_score > 0 && (
                <span className={`font-mono text-[11px] font-bold ${scoreColor(report.avg_quiz_score)}`}>
                  {report.avg_quiz_score}% avg
                </span>
              )}
              {report.streak_days > 0 && (
                <span className="font-mono text-[11px] text-amber-600">
                  {report.streak_days}d streak
                </span>
              )}
            </div>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-ink/40 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border-muted/60 px-5 py-5 space-y-5 animate-in fade-in duration-150">

          {/* AI Summary */}
          {report.ai_summary && (
            <div className="bg-primary/6 border border-primary/15 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="font-mono text-[10px] font-bold text-primary uppercase">Reva's Summary</span>
              </div>
              <p className="font-sans text-xs text-ink/80 leading-relaxed">{report.ai_summary}</p>
            </div>
          )}

          {/* Stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Study Time", value: formatStudyTime(report.total_study_time_seconds) },
              { label: "Lessons", value: String(report.lessons_completed) },
              { label: "Avg Score", value: report.avg_quiz_score > 0 ? `${report.avg_quiz_score}%` : "—" },
              { label: "Best Score", value: report.highest_quiz_score > 0 ? `${report.highest_quiz_score}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-background border border-border-muted/70 rounded-xl p-3 text-center">
                <p className="font-mono text-base font-bold text-primary">{value}</p>
                <p className="font-sans text-[11px] text-ink/60 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Topics mastered + needing revision */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.topics_completed.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-sans text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Topics Mastered</p>
                </div>
                <ul className="space-y-0.5">
                  {report.topics_completed.slice(0, 5).map((t) => (
                    <li key={t} className="font-sans text-[11px] text-emerald-800 truncate">{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.topics_needing_revision.length > 0 && (
              <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-sans text-[10px] font-bold text-amber-700 uppercase tracking-wide">Needs Revision</p>
                </div>
                <ul className="space-y-0.5">
                  {report.topics_needing_revision.slice(0, 5).map((t) => (
                    <li key={t} className="font-sans text-[11px] text-amber-800 truncate">{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Weak concepts + Recommendations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.weak_concepts.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-bold text-ink/50 uppercase">Concept Gaps</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.weak_concepts.slice(0, 5).map((c) => (
                    <span key={c} className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-sans text-[11px]">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {report.recommended_next_topics.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] font-bold text-ink/50 uppercase">Recommended Next</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.recommended_next_topics.slice(0, 4).map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-primary/8 border border-primary/20 text-primary rounded-lg font-sans text-[11px]">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Career goal */}
          {report.career_goal && (
            <p className="font-mono text-[10px] text-ink/40">
              Goal: <span className="text-primary/60">{report.career_goal}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function LearningReports() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [currentReport, setCurrentReport] = useState<WeeklyReport | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch list of past reports when first opened
  useEffect(() => {
    if (!isOpen || hasFetched) return;

    async function fetchReports() {
      setIsLoading(true);
      setError(null);
      try {
        const list = await apiRequest<WeeklyReport[]>("/api/v1/learn/me/reports");
        setReports(list);
        setHasFetched(true);
        // Auto-expand the most recent if it exists
        if (list.length > 0) setExpandedId(list[0].id);
      } catch {
        setError("Failed to load learning reports.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchReports();
  }, [isOpen, hasFetched]);

  const handleGenerateCurrent = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const report = await apiRequest<WeeklyReport>("/api/v1/learn/me/reports/current");
      setCurrentReport(report);
      // Update list — replace or prepend
      setReports((prev) => {
        const filtered = prev.filter((r) => r.id !== report.id);
        return [report, ...filtered];
      });
      setExpandedId(report.id);
    } catch {
      setError("Failed to generate this week's report.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if current week's report already exists in the list
  const thisWeekExists = reports.some((r) => {
    const s = new Date(r.week_start);
    const now = new Date();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - now.getDay() + 1);
    thisMonday.setHours(0, 0, 0, 0);
    s.setHours(0, 0, 0, 0);
    return s.getTime() === thisMonday.getTime();
  });

  return (
    <div className="bg-surface border border-border-muted rounded-2xl overflow-hidden shadow-2xs animate-in fade-in duration-200">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-subtle transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          <div className="text-left min-w-0">
            <p className="font-display text-sm font-bold text-primary leading-tight">Weekly Learning Reports</p>
            <p className="font-mono text-[11px] text-ink/50 mt-0.5">
              {hasFetched ? `${reports.length} report${reports.length !== 1 ? "s" : ""} available` : "Your weekly AI-generated progress summaries"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {reports.length > 0 && (
            <span className="hidden sm:flex px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full font-mono text-[10px] font-bold">
              {reports.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-ink/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="border-t border-border-muted/60 p-5 space-y-4">

          {/* Generate this week's report */}
          {!thisWeekExists && (
            <div className="bg-primary/6 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-primary">This Week's Report</p>
                <p className="font-sans text-[11px] text-ink/60 mt-0.5 leading-snug">
                  Generate your personalized weekly summary for this week's learning activity.
                </p>
              </div>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateCurrent}
                className="px-4 py-2 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50 shrink-0 flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <span>Generate Report</span>
                )}
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-border-muted/40 rounded-2xl" />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-sans">
              {error}
            </div>
          )}

          {/* Reports list */}
          {!isLoading && reports.length > 0 && (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  isExpanded={expandedId === report.id}
                  onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && hasFetched && reports.length === 0 && !thisWeekExists && (
            <div className="text-center py-6 space-y-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-display text-sm font-bold text-ink">No reports yet</p>
              <p className="font-sans text-xs text-ink/55 max-w-xs mx-auto leading-relaxed">
                Complete your first lesson and generate your first weekly report above.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
