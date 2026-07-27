"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/feed");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="border-4 border-primary border-t-transparent animate-spin w-10 h-10 rounded-full" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-ink font-sans">
      <div className="text-center space-y-6 max-w-md w-full">
        {/* Brand */}
        <div className="space-y-2">
          <h1 className="font-display text-5xl font-bold tracking-tight text-primary">
            CampusCircle
          </h1>
          <p className="font-sans text-lg text-ink/75">
            The university-only anonymous community.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          <Link
            href="/login"
            className="block w-full py-3 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-center transition-all shadow-sm"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="block w-full py-3 border border-border-muted bg-surface hover:bg-background text-ink font-sans font-semibold rounded-xl text-center transition-all shadow-sm"
          >
            Sign Up
          </Link>
        </div>

        <div className="pt-6">
          <div className="font-mono text-xs text-accent bg-surface px-4 py-2 rounded-md border border-border-muted inline-block font-semibold">
            SECURE & VERIFIED VIA CAMPUS DOMAIN
          </div>
        </div>
      </div>
    </main>
  );
}
