"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { SocraticDiscussion } from "@/components/SocraticDiscussion";

interface Question {
  id: string;
  question: string;
  options: string[];
  chunk_id?: string;
  concept_category?: string;
}

interface PhaseData {
  phase: number;
  name: string;
  description: string;
  is_unlocked: boolean;
  is_passed: boolean;
  questions: Question[];
  attempts_count?: number;
  max_attempts?: number;
}

interface QuizSession {
  session_id: string;
  video_id: string;
  video_title: string;
  current_unlocked_phase: number;
  is_completed: boolean;
  phase1: PhaseData;
  phase2: PhaseData | null;
  phase3: PhaseData | null;
}

interface QuestionDetail {
  question_id: string;
  user_index: number;
  correct_index: number;
  is_correct: boolean;
  explanation: string;
  chunk_id?: string;
  concept_title?: string;
  concept_category?: string;
}

interface SubmitResult {
  phase: number;
  passed: boolean;
  score_percent: number;
  correct_count: number;
  total_questions: number;
  passing_threshold_percent: number;
  next_phase_unlocked: number | null;
  is_session_completed: boolean;
  attempts_count?: number;
  max_attempts?: number;
  can_retry?: boolean;
  details: QuestionDetail[];
  failed_chunk_ids?: string[];
}

interface RemediateData {
  session_id: string;
  chunk_id: string;
  concept_title: string;
  re_explanation: string;
  analogy?: string;
  is_cached: boolean;
}

interface ConceptGap {
  concept_category: string;
  miss_count: number;
  last_seen_at: string;
}

interface PostSessionMentor {
  summary_message: string;
  strengths: string[];
  needs_practice: string[];
  suggested_next_topic?: string;
}

interface LearnQuizProps {
  sessionId: string;
  onBackToExplanation: () => void;
  onQuizComplete?: () => void;
}

export function LearnQuiz({ sessionId, onBackToExplanation, onQuizComplete }: LearnQuizProps) {
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [activePhase, setActivePhase] = useState<number>(1);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [phaseResults, setPhaseResults] = useState<Record<number, SubmitResult>>({});
  const [postSessionMentor, setPostSessionMentor] = useState<PostSessionMentor | null>(null);
  const [remediations, setRemediations] = useState<Record<string, RemediateData>>({});
  const [loadingRemediationChunk, setLoadingRemediationChunk] = useState<string | null>(null);

  const [userGaps, setUserGaps] = useState<ConceptGap[]>([]);

  // 1. Fetch Quiz Session Data
  const fetchQuizData = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<QuizSession>(`/api/v1/learn/${sessionId}/quiz`, {
        method: "POST",
      });
      setQuizSession(data);
      if (isInitial && data.current_unlocked_phase) {
        setActivePhase(data.current_unlocked_phase);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load quiz session.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // 2. Fetch User Concept Gaps Profile
  const fetchUserGaps = useCallback(async () => {
    try {
      const data = await apiRequest<{ gaps: ConceptGap[] }>("/api/v1/learn/me/gaps");
      setUserGaps(data.gaps || []);
    } catch (err) {
      // Non-critical, ignore
    }
  }, []);

  useEffect(() => {
    fetchQuizData(true);
    fetchUserGaps();
  }, [fetchQuizData, fetchUserGaps]);

  // 3. Select Option Handler
  const handleSelectOption = (questionId: string, optionIdx: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx,
    }));
  };

  // 4. Submit Phase Handler
  const handleSubmitPhase = async (phaseNum: number) => {
    const currentPhaseData =
      phaseNum === 1
        ? quizSession?.phase1
        : phaseNum === 2
        ? quizSession?.phase2
        : quizSession?.phase3;

    if (!currentPhaseData) return;

    const unanswered = currentPhaseData.questions.filter(
      (q) => selectedAnswers[q.id] === undefined
    );

    if (unanswered.length > 0) {
      setError(`Please answer all ${currentPhaseData.questions.length} questions before submitting.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await apiRequest<SubmitResult>(
        `/api/v1/learn/${sessionId}/quiz/${phaseNum}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ answers: selectedAnswers }),
        }
      );

      setPhaseResults((prev) => ({
        ...prev,
        [phaseNum]: result,
      }));

      await fetchQuizData(false);
      await fetchUserGaps();

      // Notify parent to refresh dashboard
      onQuizComplete?.();

      // Fetch Reva AI Post-Session Mentor Summary
      try {
        const mentorSummary = await apiRequest<PostSessionMentor>(`/api/v1/learn/${sessionId}/mentor/post-session`, {
          method: "POST"
        });
        setPostSessionMentor(mentorSummary);
      } catch (mentorErr) {
        // Non-critical, fallback UI will handle
      }

      if (result.passed && result.next_phase_unlocked) {
        setActivePhase(result.next_phase_unlocked);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to grade submission.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Remediation Fetcher
  const handleFetchRemediation = async (chunkId: string) => {
    setLoadingRemediationChunk(chunkId);
    try {
      const data = await apiRequest<RemediateData>(`/api/v1/learn/${sessionId}/remediate`, {
        method: "POST",
        body: JSON.stringify({ chunk_id: chunkId }),
      });
      setRemediations((prev) => ({
        ...prev,
        [chunkId]: data,
      }));
    } catch (err) {
      setError("Failed to fetch targeted concept remediation.");
    } finally {
      setLoadingRemediationChunk(null);
    }
  };

  // 6. Targeted Retry Handler (Clears answers for questions tied to remediated chunk)
  const handleRetryChunkQuestions = (chunkId: string) => {
    if (!currentPhaseInfo) return;
    setSelectedAnswers((prev) => {
      const updated = { ...prev };
      currentPhaseInfo.questions.forEach((q) => {
        if (q.chunk_id === chunkId) {
          delete updated[q.id];
        }
      });
      return updated;
    });
    // Clear result banner so user can submit again
    setPhaseResults((prev) => {
      const updated = { ...prev };
      delete updated[activePhase];
      return updated;
    });
  };

  const [isRetryingPhase, setIsRetryingPhase] = useState<boolean>(false);

  const handleRetryPhase = async (phaseNum: number) => {
    setIsRetryingPhase(true);
    setError(null);
    try {
      const updatedPhase = await apiRequest<PhaseData>(`/api/v1/learn/${sessionId}/quiz/${phaseNum}/retry`, {
        method: "POST",
      });

      setQuizSession((prev) => {
        if (!prev) return prev;
        const phaseKey = `phase${phaseNum}` as keyof QuizSession;
        return {
          ...prev,
          [phaseKey]: updatedPhase,
        };
      });

      // Clear selected answers for this phase's questions
      setSelectedAnswers((prev) => {
        const next = { ...prev };
        updatedPhase.questions.forEach((q) => {
          delete next[q.id];
        });
        return next;
      });

      // Clear previous phase result so user can take fresh test
      setPhaseResults((prev) => {
        const next = { ...prev };
        delete next[phaseNum];
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to generate fresh questions for retry. Please try again.");
      }
    } finally {
      setIsRetryingPhase(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface border border-border-muted rounded-2xl p-12 text-center space-y-4 shadow-2xs">
        <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full mx-auto" />
        <p className="font-sans text-sm text-ink/75">Loading adaptive quiz questions...</p>
      </div>
    );
  }

  if (error && !quizSession) {
    return (
      <div className="bg-surface border border-red-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <h3 className="font-display text-lg font-bold text-red-700">Couldn't load quiz</h3>
        <p className="font-sans text-sm text-ink/75">{error}</p>
        <button
          onClick={() => fetchQuizData(true)}
          className="px-6 py-2 bg-primary text-surface font-sans font-bold text-sm rounded-xl cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!quizSession) return null;

  const currentPhaseInfo =
    activePhase === 1
      ? quizSession.phase1
      : activePhase === 2
      ? quizSession.phase2
      : quizSession.phase3;

  const isCompleted = quizSession.is_completed;
  const currentResult = phaseResults[activePhase];

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-surface border border-border-muted rounded-2xl p-6 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-mono font-bold text-primary uppercase">Adaptive Assessment</span>
          <h2 className="font-display text-xl font-bold text-ink">{quizSession.video_title}</h2>
        </div>

        <button
          onClick={onBackToExplanation}
          className="text-xs font-sans font-bold text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to Story Explanation</span>
        </button>
      </div>

      {/* Celebratory Completion Banner if Topic Mastered */}
      {isCompleted && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 bg-primary text-surface rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-display text-xl font-bold text-primary">Topic Mastered!</h3>
          <p className="font-sans text-sm text-ink/80 max-w-md mx-auto">
            You've successfully passed all 3 phases (Recall, Application, and Synthesis) for this topic.
          </p>
        </div>
      )}

      {/* Socratic Follow-up Discussion — shown after full quiz completion */}
      {isCompleted && (
        <SocraticDiscussion
          sessionId={sessionId}
          lessonTitle={quizSession.video_title}
        />
      )}

      {/* Reva AI Post-Session Mentor Summary Banner */}
      {postSessionMentor && (
        <div className="bg-gradient-to-r from-primary/10 via-surface to-primary/5 border border-primary/20 rounded-2xl p-6 space-y-4 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 border-b border-primary/10 pb-3">
            <span className="w-7 h-7 rounded-full bg-primary text-surface font-mono font-bold text-xs flex items-center justify-center shadow-xs">
              <svg className="w-4 h-4 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            <h3 className="font-display text-base font-bold text-primary">
              Reva Mentor Feedback
            </h3>
          </div>

          <p className="font-sans text-xs sm:text-sm text-ink/80 leading-relaxed">
            {postSessionMentor.summary_message}
          </p>

          <div className="flex flex-wrap gap-4 text-xs font-sans pt-1 border-t border-border-muted/50">
            {postSessionMentor.strengths && postSessionMentor.strengths.length > 0 && (
              <div className="space-y-1">
                <span className="font-bold text-emerald-700 font-mono text-[11px]">STRENGTHS SHOWN:</span>
                <div className="flex flex-wrap gap-1.5">
                  {postSessionMentor.strengths.map((s, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-semibold text-[11px]">
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {postSessionMentor.needs_practice && postSessionMentor.needs_practice.length > 0 && (
              <div className="space-y-1">
                <span className="font-bold text-amber-700 font-mono text-[11px]">PRACTICE AREAS:</span>
                <div className="flex flex-wrap gap-1.5">
                  {postSessionMentor.needs_practice.map((np, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-semibold text-[11px]">
                      • {np}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {postSessionMentor.suggested_next_topic && (
            <div className="pt-2 border-t border-primary/10 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-sans text-ink/60">Suggested Follow-Up Topic:</span>
              <span className="px-3 py-1 bg-primary/10 text-primary font-mono text-xs font-bold rounded-lg border border-primary/20">
                {postSessionMentor.suggested_next_topic}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3-Phase Tab Navigation Bar */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
        {[
          { num: 1, name: "Recall", fullName: "Phase 1: Recall", data: quizSession.phase1, unlocked: true },
          { num: 2, name: "Application", fullName: "Phase 2: Application", data: quizSession.phase2, unlocked: !!quizSession.phase2 },
          { num: 3, name: "Synthesis", fullName: "Phase 3: Synthesis", data: quizSession.phase3, unlocked: !!quizSession.phase3 },
        ].map((tab) => {
          const isPassed = tab.data?.is_passed;
          const isActive = activePhase === tab.num;

          return (
            <button
              key={tab.num}
              disabled={!tab.unlocked}
              onClick={() => setActivePhase(tab.num)}
              className={`p-2.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[84px] sm:min-h-[90px] ${
                isActive
                  ? "bg-surface border-primary ring-2 ring-primary/20 shadow-xs"
                  : tab.unlocked
                  ? "bg-surface border-border-muted hover:border-border-muted/80 opacity-90"
                  : "bg-background border-border-muted/40 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-mono text-[10px] sm:text-xs font-bold text-ink/75">P{tab.num}</span>
                {isPassed ? (
                  <span className="w-4 h-4 sm:w-5 sm:h-5 bg-primary text-surface rounded-full flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : !tab.unlocked ? (
                  <svg className="w-3.5 h-3.5 text-ink/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : null}
              </div>

              <div>
                <h4 className="font-display text-xs sm:text-sm font-bold text-ink truncate">
                  <span className="hidden sm:inline">{tab.fullName}</span>
                  <span className="sm:hidden">{tab.name}</span>
                </h4>
                <p className="font-sans text-[10px] sm:text-[11px] text-ink/70 truncate">
                  {tab.unlocked ? (isPassed ? "Passed" : "Available") : "Locked"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Phase Locked Error State */}
      {!currentPhaseInfo ? (
        <div className="bg-surface border border-border-muted rounded-2xl p-10 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 bg-background border border-border-muted rounded-full flex items-center justify-center mx-auto text-ink/40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-display text-base font-bold text-ink">Phase {activePhase} is Locked</h3>
          <p className="font-sans text-xs text-ink/70 max-w-xs mx-auto">
            You must pass Phase {activePhase - 1} with at least 70% to unlock this phase.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Phase Header Card */}
          <div className="bg-surface border border-border-muted rounded-2xl p-6 shadow-2xs space-y-1">
            <h3 className="font-display text-lg font-bold text-primary">
              Phase {activePhase}: {currentPhaseInfo.name}
            </h3>
            <p className="font-sans text-xs text-ink/75 leading-relaxed">
              {currentPhaseInfo.description} (Requires 70% to pass)
            </p>
          </div>

          {/* Submit Result Banner if graded */}
          {currentResult && (
            <div
              className={`border rounded-2xl p-5 space-y-4 shadow-2xs ${
                currentResult.passed
                  ? "bg-primary/10 border-primary/30"
                  : "bg-red-50/80 border-red-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-display text-sm font-bold ${currentResult.passed ? "text-primary" : "text-red-700"}`}>
                  {currentResult.passed ? "Phase Passed!" : "Phase Not Passed"}
                </span>
                <span className="font-mono text-sm font-bold text-ink">
                  {currentResult.score_percent}% ({currentResult.correct_count}/{currentResult.total_questions} correct)
                </span>
              </div>
              <p className="font-sans text-xs text-ink/75">
                {currentResult.passed
                  ? currentResult.next_phase_unlocked
                    ? `Great job! Phase ${currentResult.next_phase_unlocked} is now unlocked.`
                    : "Congratulations! You have completed all 3 quiz phases."
                  : "Check the targeted micro-explanations below for your missed concepts and retry!"}
              </p>

              {/* TARGETED CONCEPT REMEDIATION SECTION */}
              {currentResult.failed_chunk_ids && currentResult.failed_chunk_ids.length > 0 && (
                <div className="pt-3 border-t border-border-muted/40 space-y-3">
                  <span className="text-xs font-mono font-bold text-red-800 uppercase flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Targeted Real-Time Remediation Available ({currentResult.failed_chunk_ids.length} concept gap{currentResult.failed_chunk_ids.length > 1 ? "s" : ""})
                  </span>

                  <div className="space-y-3">
                    {currentResult.failed_chunk_ids.map((chunkId) => {
                      const remData = remediations[chunkId];
                      const isLoadingThis = loadingRemediationChunk === chunkId;

                      // Find concept title from details
                      const matchingDetail = currentResult.details.find((d) => d.chunk_id === chunkId);
                      const conceptName = matchingDetail?.concept_title || matchingDetail?.concept_category || chunkId;

                      return (
                        <div key={chunkId} className="bg-surface border border-border-muted rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-display text-xs font-bold text-ink">
                              Concept Gap: {conceptName}
                            </span>
                            {!remData && (
                              <button
                                onClick={() => handleFetchRemediation(chunkId)}
                                disabled={isLoadingThis}
                                className="px-3 py-1.5 bg-primary hover:bg-[#1F3E23] text-surface text-xs font-sans font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              >
                                {isLoadingThis ? "Generating micro-explanation..." : "Remediate This Concept"}
                              </button>
                            )}
                          </div>

                          {/* Render Remediation Card if fetched */}
                          {remData && (
                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2 animate-in fade-in duration-200">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono font-bold text-primary uppercase">
                                  Fresh Micro-Explanation {remData.is_cached ? "(Cached)" : ""}
                                </span>
                                {remData.analogy && (
                                  <span className="text-[11px] font-sans text-ink/60 font-medium">
                                    Analogy: {remData.analogy}
                                  </span>
                                )}
                              </div>
                              <p className="font-sans text-xs text-ink/80 leading-relaxed">
                                {remData.re_explanation}
                              </p>
                              <div className="pt-2 flex justify-end">
                                <button
                                  onClick={() => handleRetryChunkQuestions(chunkId)}
                                  className="px-3 py-1 bg-surface border border-primary/30 text-primary hover:bg-primary hover:text-surface text-xs font-mono font-bold rounded-lg transition-all cursor-pointer"
                                >
                                  Retry Concept Questions
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PHASE RETRY BUTTON / MAX ATTEMPTS CAP BANNER */}
              {!currentResult.passed && (
                <div className="pt-3 border-t border-border-muted/40 space-y-3">
                  {(currentResult.attempts_count || 1) < 3 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-red-200/80 rounded-xl p-4 shadow-2xs">
                      <div className="space-y-0.5">
                        <h5 className="font-display text-xs font-bold text-red-900">
                          Retry Phase {activePhase} (Attempt {currentResult.attempts_count || 1} of 3)
                        </h5>
                        <p className="font-sans text-[11px] text-ink/70">
                          Clicking retry will generate 10 fresh, different questions for Phase {activePhase}.
                        </p>
                      </div>
                      <button
                        onClick={() => handleRetryPhase(activePhase)}
                        disabled={isRetryingPhase}
                        className="px-5 py-2.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isRetryingPhase ? "Generating Fresh Questions..." : `Retry Phase ${activePhase}`}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2 text-left">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="font-display text-xs font-bold text-amber-900">Maximum Attempts Reached (3 of 3)</span>
                      </div>
                      <p className="font-sans text-xs text-amber-900/80 leading-relaxed">
                        You've reached the 3-attempt limit for Phase {activePhase}. We recommend reviewing the storytelling explanation chunks again to reinforce your understanding before retrying.
                      </p>
                      <button
                        onClick={onBackToExplanation}
                        className="mt-1 px-4 py-1.5 bg-primary text-surface font-sans text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                      >
                        Review Explanation Chunks
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-sans text-red-700">
              {error}
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-5">
            {currentPhaseInfo.questions.map((q, qIdx) => {
              const selectedIdx = selectedAnswers[q.id];
              const detail = currentResult?.details.find((d) => d.question_id === q.id);

              return (
                <div
                  key={q.id}
                  className="bg-surface border border-border-muted rounded-2xl p-6 shadow-2xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="font-display text-sm font-bold text-ink leading-snug">
                        <span className="text-primary font-mono mr-1.5">{qIdx + 1}.</span>
                        {q.question}
                      </h4>
                      {q.concept_category && (
                        <span className="inline-block px-2 py-0.5 bg-background border border-border-muted text-ink/60 font-mono text-[10px] rounded-md">
                          Topic Tag: {q.concept_category}
                        </span>
                      )}
                    </div>

                    {detail && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold shrink-0 ${
                          detail.is_correct
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-red-100 text-red-700 border border-red-200"
                        }`}
                      >
                        {detail.is_correct ? "Correct" : "Incorrect"}
                      </span>
                    )}
                  </div>

                  {/* 4 Radio Option Cards */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = selectedIdx === optIdx;
                      let optionStyle = "border-border-muted hover:border-border-muted/80 bg-background";

                      if (detail) {
                        if (optIdx === detail.correct_index) {
                          optionStyle = "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30";
                        } else if (isSelected && !detail.is_correct) {
                          optionStyle = "border-red-300 bg-red-50 text-red-700";
                        }
                      } else if (isSelected) {
                        optionStyle = "border-primary bg-primary/5 ring-1 ring-primary/20";
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleSelectOption(q.id, optIdx)}
                          className={`p-3.5 rounded-xl border text-left text-xs font-sans transition-all flex items-start gap-3 cursor-pointer ${optionStyle}`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full border flex items-center justify-center font-mono text-[10px] font-bold shrink-0 mt-0.5 ${
                              isSelected
                                ? "bg-primary text-surface border-primary"
                                : "border-border-muted text-ink/60"
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="flex-1 text-ink/90 leading-relaxed">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Detailed Explanation feedback after submission */}
                  {detail && detail.explanation && (
                    <div className="bg-background border border-border-muted/60 rounded-xl p-3.5 text-xs font-sans space-y-1">
                      <span className="font-mono text-[11px] font-bold text-primary uppercase">Explanation:</span>
                      <p className="text-ink/80 leading-relaxed">{detail.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              disabled={isSubmitting}
              onClick={() => handleSubmitPhase(activePhase)}
              className="px-8 py-3 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Grading..." : `Submit Phase ${activePhase} Answers`}
            </button>
          </div>
        </div>
      )}

      {/* USER CONCEPT GAPS PROFILE BANNER */}
      {userGaps.length > 0 && (
        <div className="bg-surface border border-border-muted rounded-2xl p-6 shadow-2xs space-y-3 pt-6 border-t-2 border-t-primary/30">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary uppercase">
              Your Concept Gap Profile
            </span>
            <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[11px] font-mono font-bold rounded-full">
              {userGaps.length} Weak Area{userGaps.length > 1 ? "s" : ""} Tracked
            </span>
          </div>
          <p className="font-sans text-xs text-ink/75">
            Concepts you miss across different videos are automatically tracked here so you know exactly where to focus your revision.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {userGaps.map((gap, gIdx) => (
              <div key={gIdx} className="bg-background border border-border-muted rounded-xl p-3.5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <h5 className="font-display text-xs font-bold text-ink">{gap.concept_category}</h5>
                  <p className="font-sans text-[11px] text-ink/50">
                    Last missed: {new Date(gap.last_seen_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 font-mono text-xs font-bold rounded-lg">
                  {gap.miss_count} miss{gap.miss_count > 1 ? "es" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
