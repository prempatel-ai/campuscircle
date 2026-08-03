import { Serwist, CacheFirst, StaleWhileRevalidate, NetworkOnly } from "serwist";
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// @ts-expect-error -- ServiceWorkerGlobalScope exists at SW runtime; main tsconfig uses DOM lib
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // ── SECURITY: Block all API routes from SW caching ──
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // Cache Google Fonts stylesheets
    {
      matcher: ({ url }) =>
        url.origin === "https://fonts.googleapis.com",
      handler: new CacheFirst({
        cacheName: "google-fonts-stylesheets",
      }),
    },
    // Cache Google Fonts webfont files
    {
      matcher: ({ url }) =>
        url.origin === "https://fonts.gstatic.com",
      handler: new CacheFirst({
        cacheName: "google-fonts-webfonts",
      }),
    },
    // Cache local static images
    {
      matcher: ({ url }) =>
        /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "static-images",
      }),
    },
    // Use defaultCache from @serwist/next for everything else
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
