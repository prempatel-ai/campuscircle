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
      const dismissedTime = localStorage.getItem("pwa-install-dismissed-time");
      let isRecentlyDismissed = dismissed === "true";
      if (dismissedTime && !isRecentlyDismissed) {
        const elapsed = Date.now() - parseInt(dismissedTime, 10);
        // Cooldown for 14 days if user closed banner
        if (elapsed < 14 * 24 * 60 * 60 * 1000) {
          isRecentlyDismissed = true;
        }
      }
      setBannerDismissed(isRecentlyDismissed);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (variant === "banner") {
        const dismissed = localStorage.getItem("pwa-install-dismissed");
        const dismissedTime = localStorage.getItem("pwa-install-dismissed-time");
        let isRecentlyDismissed = dismissed === "true";
        if (dismissedTime && !isRecentlyDismissed) {
          const elapsed = Date.now() - parseInt(dismissedTime, 10);
          if (elapsed < 14 * 24 * 60 * 60 * 1000) {
            isRecentlyDismissed = true;
          }
        }
        if (!isRecentlyDismissed) {
          setBannerDismissed(false);
        }
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
      localStorage.setItem("pwa-install-dismissed", "true");
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "true");
    localStorage.setItem("pwa-install-dismissed-time", Date.now().toString());
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

  // ── Dismissible banner variant (Top-Right discreet overlay) ──
  if (bannerDismissed) return null;

  return (
    <div className="fixed top-16 right-4 sm:right-6 z-40 w-full max-w-sm animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="bg-surface border border-border-muted rounded-2xl shadow-xl p-3.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-surface"
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
          <p className="font-sans text-[11px] text-ink/60 leading-snug truncate">
            Add to home screen for quick access
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1 bg-primary text-surface text-xs font-sans font-bold rounded-lg hover:bg-[#1F3E23] transition-all cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={handleDismissBanner}
            className="p-1 text-ink/40 hover:text-ink transition-all cursor-pointer"
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
