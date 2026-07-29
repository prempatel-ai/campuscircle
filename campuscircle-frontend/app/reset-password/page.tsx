"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing or invalid password reset token.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Invalid reset token.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: token,
          new_password: newPassword,
        }),
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to reset password. The link may have expired.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-2">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold text-primary">Password Reset!</h1>
        <p className="font-sans text-base text-ink/80 leading-relaxed">
          Your password has been successfully updated and all existing sessions have been signed out for your security.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-block w-full py-3 bg-primary hover:bg-primary/95 text-surface font-sans font-semibold rounded-xl text-center transition-all shadow-sm text-sm"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface border border-border-muted rounded-2xl p-8 space-y-6 shadow-sm">
      {/* Title */}
      <div className="space-y-2 text-center">
        <h1 className="font-display text-3xl font-bold text-primary">Set New Password</h1>
        <p className="font-sans text-sm text-ink/70">
          Enter your new password below.
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
          <p className="text-sm font-sans text-red-700 font-semibold">{error}</p>
        </div>
      )}

      {/* Reset Password Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="new-password" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-base text-ink"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-password" className="block text-xs font-mono text-accent font-bold uppercase tracking-wider">
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-base text-ink"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !token}
          className="w-full py-3 mt-2 bg-primary hover:bg-primary/95 disabled:opacity-50 text-surface font-sans font-semibold rounded-xl text-center transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 text-sm"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-surface/50 border-t-surface rounded-full animate-spin" />
              Resetting Password...
            </>
          ) : (
            "Update Password"
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
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
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
