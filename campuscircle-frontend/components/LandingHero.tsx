"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export const LandingHero: React.FC = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="w-full pt-4 pb-8 md:pt-6 md:pb-10 flex flex-col items-start justify-center space-y-6 md:space-y-8">
      {/* Navigation Header */}
      <header className="w-full flex items-center justify-between pb-4 md:pb-5 border-b border-border-muted/50">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold tracking-tight text-primary">
            CampusCircle
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-sans font-medium text-ink/80 hover:text-primary transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl shadow-2xs hover:-translate-y-[1px] hover:shadow-md transition-all duration-150"
          >
            Sign Up
          </Link>
        </div>
      </header>

      {/* Main Display Headline & Factual Prose (Staggered Settle-In Motion) */}
      <div className="space-y-4 md:space-y-5 max-w-4xl">
        <h1
          className={`font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[4.75rem] font-bold text-primary tracking-tight leading-[1.01] transition-all duration-300 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          An anonymous discussion network for verified university campuses.
        </h1>
        <p
          style={{ transitionDelay: "100ms" }}
          className={`font-sans text-base sm:text-lg text-ink/70 max-w-2xl leading-relaxed font-normal transition-all duration-300 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          Access requires a verified campus email address. All discussions stay strictly isolated within your institution, allowing students to converse candidly without revealing real-world identities.
        </p>
      </div>

      {/* Understated Call to Actions (No Micro-Copy Badges or Embellishments) */}
      <div
        style={{ transitionDelay: "200ms" }}
        className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto transition-all duration-300 ease-out ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <Link
          href="/signup"
          className="inline-flex items-center justify-center px-7 py-3.5 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-sm rounded-xl shadow-md hover:-translate-y-[1px] hover:shadow-lg transition-all duration-150 text-center"
        >
          Sign Up
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-7 py-3.5 bg-surface border border-border-muted hover:border-primary/40 text-ink font-sans font-semibold text-sm rounded-xl shadow-2xs hover:-translate-y-[1px] hover:shadow-md transition-all duration-150 text-center"
        >
          Log In
        </Link>
      </div>
    </section>
  );
};
