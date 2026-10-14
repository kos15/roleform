"use client";

import { useEffect, useState } from "react";
import { Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui";
import { INSTALL_READY } from "@/components/pwa-register";
import { IOS_PUSH_MIN, iosVersion, isIos, isStandalone } from "@/lib/push/client";

/**
 * "Install Roleform" (F29). Four honest states:
 *
 *   - Already installed → renders nothing.
 *   - Chrome/Edge/Samsung with a parked install prompt → one button.
 *   - Android without a prompt (dismissed before, or not offered yet) → where
 *     the browser menu keeps "Install app".
 *   - iPhone/iPad → the two taps, because Apple offers no button a page can
 *     press. Said plainly, since on iPhone this is also the only way
 *     notifications can work at all — and only from iOS/iPadOS 16.4.
 *
 * Anything else (desktop Firefox, a webview) renders nothing rather than
 * instructions that would not work there.
 */
export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"none" | "prompt" | "ios" | "android">("none");

  useEffect(() => {
    const decide = () => {
      if (isStandalone()) return setMode("none");
      if (window.__roleformInstall) return setMode("prompt");
      if (isIos()) return setMode("ios");
      if (/Android/.test(navigator.userAgent)) return setMode("android");
      setMode("none");
    };
    decide();
    window.addEventListener(INSTALL_READY, decide);
    return () => window.removeEventListener(INSTALL_READY, decide);
  }, []);

  if (mode === "none") return null;

  if (mode === "prompt") {
    return (
      <div className={compact ? "" : "rounded-[var(--radius-lg)] bg-[var(--color-accent-100)] p-5"}>
        {compact ? null : (
          <p className="mb-3 text-sm leading-normal">
            Install Roleform on this device: it opens like an app, from your home screen, and can
            remind you before each round.
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const prompt = window.__roleformInstall;
            if (!prompt) return;
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            window.__roleformInstall = null;
            setMode("none");
          }}
        >
          <Download className="lucide h-4 w-4" aria-hidden /> Install app
        </Button>
      </div>
    );
  }

  if (mode === "android") {
    return (
      <div className="rounded-[var(--radius-lg)] bg-[var(--color-accent-100)] p-5 text-sm leading-normal">
        <strong className="mb-1.5 block">Install Roleform on this phone</strong>
        <p>
          Open the browser menu <EllipsisVertical className="lucide inline h-4 w-4 align-[-3px]" aria-label="menu" /> and
          choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>). Then open Roleform from its icon.
        </p>
      </div>
    );
  }

  const version = iosVersion();
  const tooOld = version !== null && version < IOS_PUSH_MIN;
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-accent-100)] p-5 text-sm leading-normal">
      <strong className="mb-1.5 block">Add Roleform to your Home Screen</strong>
      <p className="mb-2">
        On iPhone and iPad, reminders only reach apps on the Home Screen — Apple&rsquo;s rule, not ours — and only
        on iOS/iPadOS 16.4 or later.
        {tooOld ? " This device is on an older version: update it first in Settings → General → Software Update." : null}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Tap <Share className="lucide inline h-4 w-4 align-[-3px]" aria-label="Share" /> in Safari&rsquo;s toolbar.
        </li>
        <li>
          Choose <SquarePlus className="lucide inline h-4 w-4 align-[-3px]" aria-hidden /> <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Open Roleform <strong>from the new icon</strong> (not the Safari tab), then tap{" "}
          <strong>Turn on notifications</strong> there.
        </li>
      </ol>
    </div>
  );
}
