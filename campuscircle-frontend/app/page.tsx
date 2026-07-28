"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LandingHero } from "@/components/LandingHero";
import { LandingShowcase } from "@/components/LandingShowcase";
import { LandingHowItWorks } from "@/components/LandingHowItWorks";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [thesisVisible, setThesisVisible] = useState(true);
  const thesisRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/feed");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setThesisVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );

    if (thesisRef.current) {
      observer.observe(thesisRef.current);
    }

    return () => observer.disconnect();
  }, []);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-ink font-sans flex flex-col selection:bg-primary/20 selection:text-primary">
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-8 space-y-12 md:space-y-16">
        {/* Type-Led Hero Section */}
        <LandingHero />

        {/* Realistic Product Interface Showcase */}
        <LandingShowcase />

        {/* Sequential Mechanism Explanation Section */}
        <LandingHowItWorks />

        {/* Product Thesis Section: Why Anonymous-but-Not-Chaotic */}
        <section
          ref={thesisRef}
          className={`w-full py-10 md:py-14 border-t border-border-muted/50 space-y-4 transition-opacity duration-300 ease-out ${
            thesisVisible ? "opacity-100" : "opacity-90"
          }`}
        >
          <span className="font-mono text-xs font-bold text-accent uppercase tracking-wider">
            PRODUCT THESIS
          </span>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-primary tracking-tight max-w-xl">
            Anonymity grounded in accountability.
          </h2>
          <div className="space-y-4 max-w-2xl font-sans text-sm sm:text-base text-ink/80 leading-relaxed pt-2">
            <p>
              Unmoderated anonymous networks often devolve into noise because identity is transient and unverified. CampusCircle addresses this structural vulnerability by pairing single-domain email authentication with persistent pseudonymous handles.
            </p>
            <p>
              Because every user is an authenticated campus member operating under a consistent avatar, discussions remain candid without losing constructive tone or accountability. Students gain a reliable venue for honest dialogue while maintaining complete peer-level privacy.
            </p>
          </div>
        </section>

        {/* Quiet Closing Section */}
        <section className="w-full py-12 border-t border-border-muted/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1 max-w-md">
            <h3 className="font-display text-xl font-bold text-primary">
              Join your campus network.
            </h3>
            <p className="font-sans text-xs sm:text-sm text-ink/65">
              Verify your university email address to access your campus feed.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/signup"
              className="px-6 py-3 bg-primary hover:bg-[#1F3E23] text-surface font-sans font-bold text-xs rounded-xl shadow-sm hover:-translate-y-[1px] hover:shadow-md transition-all duration-150"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 bg-surface border border-border-muted hover:border-primary/40 text-ink font-sans font-semibold text-xs rounded-xl shadow-2xs hover:-translate-y-[1px] hover:shadow-md transition-all duration-150"
            >
              Log In
            </Link>
          </div>
        </section>
      </main>

      {/* Minimal Editorial Footer */}
      <footer className="w-full border-t border-border-muted/50 bg-surface/30 mt-20 py-8 px-4 sm:px-6 md:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-primary text-base">CampusCircle</span>
            <span className="font-mono text-ink/30">/</span>
            <span className="font-mono text-ink/50">Verified University Networks</span>
          </div>

          <div className="flex items-center gap-6 font-sans font-medium text-ink/70">
            <Link href="/login" className="hover:text-primary transition-colors">
              Log In
            </Link>
            <Link href="/signup" className="hover:text-primary transition-colors">
              Sign Up
            </Link>
            <a
              href="mailto:rolexhere03@gmail.com?subject=CampusCircle%20Inquiry"
              className="hover:text-primary transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
