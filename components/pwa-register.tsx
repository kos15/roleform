"use client";

import { useEffect } from "react";

/** Chrome/Edge/Samsung's deferred install prompt. Not in the DOM typings. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __roleformInstall?: InstallPromptEvent | null;
  }
}

export const INSTALL_READY = "roleform:install-ready";

/**
 * Registers the service worker (public/sw.js) once the page has loaded, on
 * every surface — installability and the offline page are not a signed-in
 * feature. Production only: in dev the worker's static cache would serve
 * yesterday's chunks to a hot-reloading page.
 *
 * Also catches `beforeinstallprompt`, which fires once, early, on whatever page
 * the visitor landed on — so it has to be caught here and parked for the
 * Install button (components/install-app.tsx) to use later.
 */
export function PwaRegister() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.__roleformInstall = event as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    const onInstalled = () => {
      window.__roleformInstall = null;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // An unregistered worker costs installability and nothing else.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
