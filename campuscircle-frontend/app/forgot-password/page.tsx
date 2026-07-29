"use client";

import React, { useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiRequest<{ message: string }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <main className="min-h-screen bg-background text-ink flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-primary">Check Your Inbox</h1>
          <p className="font-sans text-sm text-ink/80 leading-relaxed">
            If an account with <span className="font-semibold text-primary">{email}</span> exists in our system, password reset instructions have been sent.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block w-full py-3 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-center transition-all shadow-sm text-sm"
            >
              Return to Login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm">
        {/* Title */}
        <div className="space-y-2 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">Reset Password</h1>
          <p className="font-sans text-sm text-ink/70">
            Enter your academic email address and we'll send you instructions to reset your password.
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
            <p className="text-sm font-sans text-red-700 font-semibold">{error}</p>
          </div>
        )}

        {/* Request Reset Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
              Academic Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-base text-ink"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 mt-2 bg-primary hover:bg-primary/95 disabled:opacity-50 text-surface font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-surface/50 border-t-surface rounded-full animate-spin" />
                Sending Link...
              </>
            ) : (
              "Send Reset Link"
            )}
          </button>
        </form>

        {/* Back to Login Link */}
        <div className="text-center text-sm font-sans text-ink/75 pt-2">
          Remember your password?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
