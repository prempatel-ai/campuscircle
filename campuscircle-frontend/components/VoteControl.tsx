"use client";

import React, { useState, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";

interface VoteControlProps {
  targetId: string;
  targetType: "post" | "comment";
  initialScore: number;
  initialUserVote?: number | null;
  orientation?: "horizontal" | "vertical";
}

interface VoteResponse {
  target_id: string;
  target_type: string;
  new_score: number;
  user_vote: number | null;
}

export const VoteControl: React.FC<VoteControlProps> = ({
  targetId,
  targetType,
  initialScore,
  initialUserVote = null,
  orientation = "horizontal",
}) => {
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<number | null>(initialUserVote);
  const [isVoting, setIsVoting] = useState(false);

  // Sync with initial props if they change
  useEffect(() => {
    setScore(initialScore);
    setUserVote(initialUserVote);
  }, [initialScore, initialUserVote]);

  const [activeAnim, setActiveAnim] = useState<1 | -1 | null>(null);

  const handleVote = async (value: 1 | -1) => {
    if (isVoting) return;

    setActiveAnim(value);
    setTimeout(() => setActiveAnim(null), 200);

    // 1. Calculate optimistic state
    const previousScore = score;
    const previousVote = userVote;

    let nextVote: number | null = null;
    let scoreChange = 0;

    if (userVote === value) {
      // Toggle off (unvote)
      nextVote = null;
      scoreChange = -value;
    } else if (userVote === -value) {
      // Switch vote
      nextVote = value;
      scoreChange = 2 * value;
    } else {
      // New vote
      nextVote = value;
      scoreChange = value;
    }

    // 2. Apply optimistic update
    setScore(previousScore + scoreChange);
    setUserVote(nextVote);
    setIsVoting(true);

    try {
      const response = await apiRequest<VoteResponse>("/api/v1/votes", {
        method: "POST",
        body: JSON.stringify({
          target_id: targetId,
          target_type: targetType,
          value: value,
        }),
      });

      // Update with server reality
      setScore(response.new_score);
      setUserVote(response.user_vote);
    } catch (err) {
      console.error("Failed to cast vote, reverting optimistic state:", err);
      setScore(previousScore);
      setUserVote(previousVote);
    } finally {
      setIsVoting(false);
    }
  };

  const isUpvoted = userVote === 1;
  const isDownvoted = userVote === -1;

  const flexDir = orientation === "vertical" ? "flex-col items-center" : "flex-row items-center";

  return (
    <div
      className={`inline-flex ${flexDir} bg-background rounded-full border border-border-muted/30 select-none p-1`}
    >
      {/* Upvote Button */}
      <button
        onClick={() => handleVote(1)}
        disabled={isVoting}
        className={`p-1 rounded-full transition-colors cursor-pointer focus:outline-none ${
          isUpvoted
            ? "text-accent bg-accent/10"
            : "text-ink/55 hover:text-accent hover:bg-background"
        }`}
        aria-label="Upvote"
      >
        <svg
          className={`w-4 h-4 transition-transform ${activeAnim === 1 ? "animate-pop" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Score */}
      <span
        className={`font-mono text-xs font-bold px-2 text-center min-w-[20px] transition-colors ${
          isUpvoted ? "text-accent" : isDownvoted ? "text-red-500" : "text-ink/75"
        }`}
      >
        {Math.max(0, score)}
      </span>

      {/* Downvote Button */}
      <button
        onClick={() => handleVote(-1)}
        disabled={isVoting}
        className={`p-1 rounded-full transition-colors cursor-pointer focus:outline-none ${
          isDownvoted
            ? "text-red-500 bg-red-50"
            : "text-ink/55 hover:text-red-500 hover:bg-background"
        }`}
        aria-label="Downvote"
      >
        <svg
          className={`w-4 h-4 transition-transform ${activeAnim === -1 ? "animate-pop" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
};
