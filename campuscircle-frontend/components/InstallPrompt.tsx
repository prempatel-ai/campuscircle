"use client";

import React, { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const InstallPrompt: React.FC<{ variant: "dropdown" | "banner" }> = ({
  variant,
}) => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone
    ) {
      setIsInstalled(true);
      return;
    }

    // Check if banner was dismissed
    if (variant === "banner") {
      const dismissed = localStorage.getItem("pwa-install-dismissed");
      setBannerDismissed(dismissed === "true");
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (variant === "banner") {
        setBannerDismissed(false);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [variant]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  // Nothing to show
  if (isInstalled || !deferredPrompt) return null;

  // ── Dropdown menu item variant ──
  if (variant === "dropdown") {
    return (
      <button
        onClick={handleInstall}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-sans font-semibold text-ink/80 hover:bg-background hover:text-primary transition-colors text-left cursor-pointer"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Install App
      </button>
    );
  }

  // ── Dismissible banner variant ──
  if (bannerDismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom fade-in duration-300">
      <div className="bg-surface border border-border-muted rounded-2xl shadow-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-surface"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-sans text-xs font-bold text-ink">
            Install CampusCircle
          </p>
          <p className="font-sans text-[11px] text-ink/60 leading-snug">
            Add to your home screen for quick access
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-primary text-surface text-xs font-sans font-bold rounded-lg hover:bg-[#1F3E23] transition-all cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={handleDismissBanner}
            className="p-1.5 text-ink/40 hover:text-ink transition-all cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
