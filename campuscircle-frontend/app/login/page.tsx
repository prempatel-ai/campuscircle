"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If already authenticated, redirect directly to feed page
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/feed");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiRequest<{
        access_token: string;
        refresh_token: string;
        token_type: string;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      // Login using AuthContext which handles token storage and state updates
      login(response.access_token, response.refresh_token);
      router.push("/feed");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm">
        {/* Title */}
        <div className="space-y-2 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">Log In</h1>
          <p className="font-sans text-sm text-ink/70">
            Sign in to access your university feeds.
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
          </div>

          {/* Password */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-sans text-primary hover:underline font-medium">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-base text-ink"
            />
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
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Signup Link */}
        <div className="text-center text-sm font-sans text-ink/75 pt-2">
          Don't have an account?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  );
}
