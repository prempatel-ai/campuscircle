"use client";

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectMasteryItem {
  subject: string;
  mastery_percent: number;
  sessions_count: number;
}

interface RecentActivityItem {
  topic_title: string;
  subject_category: string;
  quiz_score: number;
  mastery_level: string;
  completed_at: string;
}

export interface DashboardData {
  total_sessions: number;
  total_study_time_seconds: number;
  topics_completed: number;
  avg_quiz_score: number;
  highest_quiz_score: number;
  current_streak_days: number;
  career_goal: string | null;
  strong_concepts: string[];
  weak_concepts: string[];
  subject_mastery: SubjectMasteryItem[];
  overall_mastery_percent: number;
  recent_activity: RecentActivityItem[];
  top_concept_gaps: string[];
}

interface MentorGuidance {
  greeting: string;
  mentor_message: string;
  suggested_next_topic?: string;
  career_goal?: string;
  streak_days: number;
}

interface LearningDashboardProps {
  data: DashboardData;
  mentor: MentorGuidance | null;
  onChangeGoal?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function relativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function masteryColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-primary";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function masteryLabel(pct: number) {
  if (pct >= 80) return "Strong";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Developing";
  return "Weak";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary">{icon}</span>
      <h3 className="font-display text-xs font-bold text-ink/90 uppercase tracking-wide">{label}</h3>
    </div>
  );
}

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background border border-border-muted/70 rounded-xl p-3 flex flex-col gap-0.5">
      <span className="font-mono text-lg font-bold text-primary leading-none">{value}</span>
      <span className="font-sans text-[11px] font-semibold text-ink/80 leading-tight">{label}</span>
      {sub && <span className="font-mono text-[10px] text-ink/60">{sub}</span>}
    </div>
  );
}

// Circular SVG progress ring
function MasteryRing({ percent }: { percent: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  const color = percent >= 70 ? "#2F5233" : percent >= 45 ? "#D4A017" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text x="48" y="52" textAnchor="middle" fontSize="16" fontWeight="700" fill={color} fontFamily="monospace">
          {Math.round(percent)}%
        </text>
      </svg>
      <span className="font-sans text-[11px] text-ink/75 font-semibold">Overall Mastery</span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LearningDashboard({ data, mentor, onChangeGoal }: LearningDashboardProps) {
  const isNew = data.total_sessions === 0;

  const effectiveOverallMastery =
    data.overall_mastery_percent > 0
      ? data.overall_mastery_percent
      : data.avg_quiz_score > 0
      ? data.avg_quiz_score
      : 0;

  const displaySubjectMastery = data.subject_mastery;

  return (
    <div className="space-y-4">

      {/* ── Career Goal banner ─────────────────────────────────── */}
      {data.career_goal && (
        <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
            </svg>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-primary/70 uppercase font-bold">Learning Goal</p>
              <p className="font-sans text-xs font-bold text-primary truncate">{data.career_goal}</p>
            </div>
          </div>
          {onChangeGoal && (
            <button
              onClick={onChangeGoal}
              className="text-[10px] font-mono text-primary/60 hover:text-primary underline cursor-pointer shrink-0 transition-colors"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* ── Stat chips ─────────────────────────────────────────── */}
      <div>
        <SectionHeading
          label="Your Progress"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="Sessions" value={String(data.total_sessions)} />
          <StatChip label="Avg Score" value={data.avg_quiz_score > 0 ? `${data.avg_quiz_score}%` : "—"} />
          <StatChip
            label="Study Time"
            value={data.total_study_time_seconds > 0 ? formatStudyTime(data.total_study_time_seconds) : "—"}
          />
          <StatChip
            label="Streak"
            value={data.current_streak_days > 0 ? `${data.current_streak_days}d` : "—"}
            sub={data.current_streak_days > 0 ? "consecutive days" : "start today"}
          />
        </div>
      </div>

      {/* ── Overall Mastery Ring ───────────────────────────────── */}
      {!isNew && (
        <div className="bg-surface-subtle border border-border-muted/60 rounded-xl p-4 flex items-center gap-5">
          <MasteryRing percent={effectiveOverallMastery} />
          <div className="space-y-1.5 min-w-0">
            <p className="font-display text-sm font-bold text-ink leading-tight">
              {masteryLabel(effectiveOverallMastery)} Performance
            </p>
            <p className="font-sans text-[11px] text-ink/60 leading-relaxed">
              Based on {data.topics_completed} topic{data.topics_completed !== 1 ? "s" : ""} completed.
              {data.highest_quiz_score > 0 && ` Best score: ${data.highest_quiz_score}%.`}
            </p>
          </div>
        </div>
      )}

      {/* ── Subject Mastery bars ───────────────────────────────── */}
      {displaySubjectMastery.length > 0 && (
        <div>
          <SectionHeading
            label="Subject Mastery"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002-2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
          <div className="space-y-2.5">
            {displaySubjectMastery.slice(0, 6).map((item) => (
              <div key={item.subject} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-ink/80 font-medium truncate max-w-[60%]">{item.subject}</span>
                  <span className="font-mono text-[11px] font-bold text-ink/60">{item.mastery_percent}%</span>
                </div>
                <div className="h-1.5 bg-border-muted/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${masteryColor(item.mastery_percent)} transition-all duration-700`}
                    style={{ width: `${Math.min(item.mastery_percent, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Strong / Weak Concepts ─────────────────────────────── */}
      {(data.strong_concepts.length > 0 || data.weak_concepts.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {data.strong_concepts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-sans text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Strong</p>
              </div>
              <ul className="space-y-0.5">
                {data.strong_concepts.slice(0, 4).map((c) => (
                  <li key={c} className="font-sans text-[11px] text-emerald-800 leading-snug truncate">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.weak_concepts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-sans text-[10px] font-bold text-amber-700 uppercase tracking-wide">Needs Work</p>
              </div>
              <ul className="space-y-0.5">
                {data.weak_concepts.slice(0, 4).map((c) => (
                  <li key={c} className="font-sans text-[11px] text-amber-800 leading-snug truncate">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Recent Activity ────────────────────────────────────── */}
      {data.recent_activity.length > 0 && (
        <div>
          <SectionHeading
            label="Recent Activity"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <div className="space-y-2">
            {data.recent_activity.map((item, i) => {
              const dayLabel = relativeDay(item.completed_at);
              const prevDay = i > 0 ? relativeDay(data.recent_activity[i - 1].completed_at) : null;
              const showDay = dayLabel !== prevDay;
              return (
                <div key={i}>
                  {showDay && (
                    <p className="font-mono text-[10px] font-bold text-ink/40 uppercase mb-1 mt-2 first:mt-0">
                      {dayLabel}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border-muted/40 last:border-0">
                    <p className="font-sans text-xs text-ink/80 truncate">{item.topic_title}</p>
                    <span
                      className={`font-mono text-[10px] font-bold shrink-0 ${
                        item.quiz_score >= 80 ? "text-emerald-600" : item.quiz_score >= 60 ? "text-amber-600" : "text-red-500"
                      }`}
                    >
                      {item.quiz_score > 0 ? `${item.quiz_score}%` : item.mastery_level}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mentor Recommendations ─────────────────────────────── */}
      {mentor && (
        <div className="bg-primary/6 border border-primary/15 rounded-xl p-4 space-y-2">
          <SectionHeading
            label="Reva's Recommendations"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
          />
          <p className="font-sans text-xs text-ink/75 leading-relaxed">{mentor.mentor_message}</p>
          {mentor.suggested_next_topic && (
            <div className="flex items-center gap-2 pt-1">
              <svg className="w-3 h-3 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="font-sans text-[11px] font-semibold text-primary">
                Next: {mentor.suggested_next_topic}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state for brand-new users ───────────────────── */}
      {isNew && (
        <div className="bg-surface-subtle border border-border-muted/60 rounded-xl p-5 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="font-display text-sm font-bold text-ink">Your dashboard awaits</p>
          <p className="font-sans text-xs text-ink/55 leading-relaxed">
            Complete your first lesson to see subject mastery, concept strength, and personalized recommendations here.
          </p>
        </div>
      )}
    </div>
  );
}
