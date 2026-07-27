"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AnonAvatar } from "@/components/AnonAvatar";
import { apiRequest, ApiError } from "@/lib/api";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await apiRequest<{ user_id: string; message: string }>("/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          password: password,
        }),
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
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 19v-8.93a2 2 0 01.89-1.664l8-4a2 2 0 011.664 0l8 4A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-2.25-1.5a2 2 0 00-1 0l-2.25 1.5"
              />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-bold text-primary">Verify Your Email</h1>
          <p className="font-sans text-base text-ink/85 leading-relaxed">
            We've sent a verification link to <span className="font-semibold text-primary">{email}</span>. 
            Please check your inbox (and spam folder) and click the link to activate your account.
          </p>
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-block w-full py-3 bg-primary hover:bg-primary/90 text-surface font-sans font-semibold rounded-xl text-center transition-colors"
            >
              Proceed to Login
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
          <h1 className="font-display text-3xl font-bold text-primary">Create Account</h1>
          <p className="font-sans text-sm text-ink/70">
            Join your university's anonymous community.
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.93 1.93a1 1 0 101.414 1.414L10 11.414l1.93 1.93a1 1 0 001.414-1.414L11.414 10l1.93-1.93a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-sans text-red-700 font-semibold">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Live Username + Avatar Preview Group */}
          <div className="space-y-2">
            <label htmlFor="username" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
              Username
            </label>
            <div className="flex gap-3 items-center">
              <AnonAvatar username={username || "anon"} size={48} shape="square" />
              <div className="flex-1">
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  placeholder="e.g. owl_chemist"
                  className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-mono text-base text-ink"
                />
              </div>
            </div>
            <p className="text-[11px] text-ink/50 font-sans">
              Only alphanumeric characters and underscores allowed.
            </p>
          </div>

          {/* Email */}
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
            <p className="text-[11px] text-ink/50 font-sans">
              Must be a valid email from a supported university domain.
            </p>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-base text-ink"
            />
            <p className="text-[11px] text-ink/50 font-sans">
              Must be at least 8 characters long.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 mt-2 bg-primary hover:bg-primary/95 disabled:opacity-50 text-surface font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-surface/50 border-t-surface rounded-full animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="text-center text-sm font-sans text-ink/75 pt-2">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
