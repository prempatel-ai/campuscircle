"use client";

import React from "react";

interface ThreadProgressDotsProps {
  totalParts: number;
  currentPosition?: number; // 1-indexed, defaults to 1
  maxDots?: number; // defaults to 8
}

export const ThreadProgressDots: React.FC<ThreadProgressDotsProps> = ({
  totalParts,
  currentPosition = 1,
  maxDots = 8,
}) => {
  if (!totalParts || totalParts <= 1) return null;

  // Fallback for long threads > maxDots
  if (totalParts > maxDots) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
        {currentPosition} of {totalParts}
      </span>
    );
  }

  // Render N dots (filled solid up to currentPosition, hollow after)
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 shrink-0"
      title={`Part ${currentPosition} of ${totalParts}`}
      aria-label={`Thread part ${currentPosition} of ${totalParts}`}
    >
      {Array.from({ length: totalParts }, (_, idx) => {
        const pos = idx + 1;
        const isFilled = pos <= currentPosition;

        return (
          <span
            key={idx}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
              isFilled ? "bg-primary" : "bg-border-muted border border-primary/30"
            }`}
          />
        );
      })}
    </div>
  );
};
