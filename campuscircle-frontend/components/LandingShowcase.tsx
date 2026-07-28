"use client";

import React, { useState, useEffect, useRef } from "react";
import { AnonAvatar } from "./AnonAvatar";
import { ThreadProgressDots } from "./ThreadProgressDots";

export const LandingShowcase: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "cs" | "housing" | "advice">("general");
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`w-full my-8 md:my-16 space-y-4 transition-all duration-300 ease-out ${
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-xs font-bold text-accent uppercase tracking-wider">
          EXAMPLE INTERFACE
        </span>
        <span className="font-mono text-xs text-ink/40">
          ILLUSTRATIVE MOCKUP
        </span>
      </div>

      {/* Frame Container - Floating Showcase Framing Treatment */}
      <div className="w-full bg-surface border border-border-muted/80 rounded-2xl md:rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.09)] overflow-hidden flex flex-col">
        {/* Mock App Header */}
        <div className="bg-surface border-b border-border-muted/60 px-4 md:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-lg text-primary">CampusCircle</span>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
              yourcampus.edu
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-background border border-border-muted rounded-xl px-3 py-1.5 text-xs text-ink/40 w-48">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search posts...</span>
            </div>
            <AnonAvatar username="campus_member" size={28} shape="circle" />
          </div>
        </div>

        {/* Mock Interactive Community Tabs */}
        <div className="bg-background/50 border-b border-border-muted/40 px-4 md:px-6 py-2.5 flex items-center gap-2 overflow-x-auto text-xs font-sans font-semibold">
          <button
            onClick={() => setActiveTab("general")}
            className={`px-3.5 py-1.5 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === "general"
                ? "bg-primary text-surface font-bold shadow-2xs"
                : "bg-surface border border-border-muted text-ink/70 hover:border-primary/40 hover:text-primary"
            }`}
          >
            # General Feed
          </button>
          <button
            onClick={() => setActiveTab("cs")}
            className={`px-3.5 py-1.5 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === "cs"
                ? "bg-primary text-surface font-bold shadow-2xs"
                : "bg-surface border border-border-muted text-ink/70 hover:border-primary/40 hover:text-primary"
            }`}
          >
            # Computer Science
          </button>
          <button
            onClick={() => setActiveTab("housing")}
            className={`px-3.5 py-1.5 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === "housing"
                ? "bg-primary text-surface font-bold shadow-2xs"
                : "bg-surface border border-border-muted text-ink/70 hover:border-primary/40 hover:text-primary"
            }`}
          >
            # Housing & Sublets
          </button>
          <button
            onClick={() => setActiveTab("advice")}
            className={`px-3.5 py-1.5 rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === "advice"
                ? "bg-primary text-surface font-bold shadow-2xs"
                : "bg-surface border border-border-muted text-ink/70 hover:border-primary/40 hover:text-primary"
            }`}
          >
            # Course Advice
          </button>
        </div>

        {/* Mock Feed Content (Updates dynamically based on active mock tab) */}
        <div className="p-4 md:p-6 space-y-4 bg-background/30 transition-all duration-200">
          {activeTab === "cs" || activeTab === "general" ? (
            <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AnonAvatar username="quantum_tree_89" size={32} shape="circle" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-accent">@quantum_tree_89</span>
                      <ThreadProgressDots totalParts={3} currentPosition={1} />
                    </div>
                    <span className="text-[10px] text-ink/40">14m ago</span>
                  </div>
                </div>
              </div>
              <h4 className="font-display font-bold text-base text-ink">
                CS301 Midterm Prep: Linear Algebra & Optimization Breakdown
              </h4>
              <p className="font-sans text-xs text-ink/75 leading-relaxed">
                Synthesizing the core proof techniques for singular value decomposition and gradient descent convergence bounds for anyone preparing for Thursday&apos;s exam...
              </p>
              <div className="flex items-center gap-4 pt-1 text-xs text-ink/60 font-semibold border-t border-border-muted/40">
                <span className="flex items-center gap-1 text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                  ▲ 42
                </span>
                <span>18 comments</span>
                <span className="ml-auto text-[11px] font-mono text-ink/40"># Computer Science</span>
              </div>
            </div>
          ) : null}

          {activeTab === "general" || activeTab === "advice" ? (
            <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AnonAvatar username="night_owl_404" size={32} shape="circle" />
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-semibold text-accent">@night_owl_404</span>
                    <span className="text-[10px] text-ink/40">1h ago</span>
                  </div>
                </div>
              </div>
              <h4 className="font-display font-bold text-base text-ink">
                Best quiet study spots on campus with reliable outlet access?
              </h4>
              <p className="font-sans text-xs text-ink/75 leading-relaxed">
                The main library 3rd floor gets packed after 6pm. Looking for secluded spots with fast campus Wi-Fi for late night writing.
              </p>
              <div className="flex items-center gap-4 pt-1 text-xs text-ink/60 font-semibold border-t border-border-muted/40">
                <span className="flex items-center gap-1 text-ink/70">
                  ▲ 19
                </span>
                <span>24 comments</span>
                <span className="ml-auto text-[11px] font-mono text-ink/40"># General Feed</span>
              </div>
            </div>
          ) : null}

          {activeTab === "housing" ? (
            <div className="bg-surface border border-border-muted rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AnonAvatar username="campus_dweller" size={32} shape="circle" />
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-semibold text-accent">@campus_dweller</span>
                    <span className="text-[10px] text-ink/40">3h ago</span>
                  </div>
                </div>
              </div>
              <h4 className="font-display font-bold text-base text-ink">
                Spring Sublet Available: 1 BR in 2BR Apartment near North Campus
              </h4>
              <p className="font-sans text-xs text-ink/75 leading-relaxed">
                Furnished room available for spring semester. Walking distance to engineering quad, utilities included. DM or reply for details.
              </p>
              <div className="flex items-center gap-4 pt-1 text-xs text-ink/60 font-semibold border-t border-border-muted/40">
                <span className="flex items-center gap-1 text-ink/70">
                  ▲ 8
                </span>
                <span>7 comments</span>
                <span className="ml-auto text-[11px] font-mono text-ink/40"># Housing & Sublets</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
