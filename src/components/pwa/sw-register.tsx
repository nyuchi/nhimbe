"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // When a new SW is found, watch for it to reach `installed`. If a
        // controller already exists, an old SW is serving stale
        // _next/static/ hashes — reload once so the new one takes over and
        // users stop seeing 404s for evicted assets after a deploy.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[mukoko:pwa] Service worker registration failed:", err);
      });
  }, []);

  return null;
}
