"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";

/**
 * F26 — the rapid-prep error boundary.
 *
 * Without one, an exception anywhere in a drill reached the root and Next
 * replaced the whole app with "Application error: a client-side exception".
 * This keeps the failure inside the drill: the results header, the tab bar
 * and the mode switch stay on screen, and Try again re-renders the mode.
 *
 * The digest is Next's id for the server-side log line — safe to show, and
 * the one thing a bug report needs. No message text is rendered, since a
 * server error message can carry details we don't show users (N7).
 */
export default function RapidError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Name only — never the message, which may carry user content (N7).
    console.error("rapid prep:", error.name, error.digest ?? "");
  }, [error]);

  return (
    <div className="max-w-[760px] space-y-4">
      <ErrorRegion title="This drill hit a problem">
        Nothing you've already done is lost — decks, rounds and challenges are saved as you go. Try again, or
        switch to another mode above.
        {error.digest ? <span className="mt-1 block text-xs opacity-80">Reference: {error.digest}</span> : null}
      </ErrorRegion>
      <Button variant="secondary" size="sm" onClick={reset}>
        <RotateCcw className="lucide h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
