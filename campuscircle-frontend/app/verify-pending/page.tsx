"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";

type VerifyStatus = "pending" | "verifying" | "success" | "error";

function VerifyPendingContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<VerifyStatus>(token ? "verifying" : "pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const performVerification = async () => {
      try {
        await apiRequest("/api/v1/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        setStatus("success");
      } catch (err) {
        setStatus("error");
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("This verification link is invalid or has expired.");
        }
      }
    };

    performVerification();
  }, [token]);

  // 1. Verifying State
  if (status === "verifying") {
    return (
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-2" />
        <h1 className="font-display text-2xl font-bold text-primary animate-pulse">Verifying Your Email...</h1>
        <p className="font-sans text-sm text-ink/70">
          Communicating with server. Please do not close this page.
        </p>
      </div>
    );
  }

  // 2. Success State
  if (status === "success") {
    return (
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold text-primary">Email Verified!</h1>
        <p className="font-sans text-base text-ink/80 leading-relaxed">
          Your account is now active. You are ready to log in and join the conversation.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-block w-full py-3 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-center transition-all shadow-sm"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // 3. Error State
  if (status === "error") {
    return (
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-2">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold text-red-700">Verification Failed</h1>
        <p className="font-sans text-base text-red-700/90 leading-relaxed font-semibold">
          {error}
        </p>
        <p className="font-sans text-sm text-ink/70">
          Please register again to receive a new link, or contact support if the issue persists.
        </p>
        <div className="pt-2 space-y-2">
          <Link
            href="/signup"
            className="inline-block w-full py-3 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-center transition-all shadow-sm"
          >
            Back to Signup
          </Link>
        </div>
      </div>
    );
  }

  // 4. Default Pending State (e.g. landed here without a token)
  return (
    <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l8-4a2 2 0 011.664 0l8 4A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-2.25-1.5a2 2 0 00-1 0l-2.25 1.5" />
        </svg>
      </div>
      <h1 className="font-display text-3xl font-bold text-primary">Verification Pending</h1>
      <p className="font-sans text-base text-ink/80 leading-relaxed">
        Please check your academic email inbox for the activation link we sent. Once you click that link, you'll be able to sign in.
      </p>
      <div className="pt-2">
        <Link
          href="/login"
          className="inline-block w-full py-3 border border-border-muted hover:bg-background text-ink font-sans font-semibold rounded-xl text-center transition-all"
        >
          Return to Login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPendingPage() {
  return (
    <main className="min-h-screen bg-background text-ink flex items-center justify-center p-6">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-2" />
            <h1 className="font-display text-2xl font-bold text-primary animate-pulse">Loading...</h1>
          </div>
        }
      >
        <VerifyPendingContent />
      </Suspense>
    </main>
  );
}
