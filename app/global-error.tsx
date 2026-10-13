"use client";

import "./globals.css";
import { RouteError } from "@/components/route-error";

/**
 * The last boundary: the root layout itself threw, so there is no <html> to
 * render into and this supplies its own. Without it the visitor gets Next's
 * bare "Application error" line and no way forward.
 */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto w-full max-w-[1320px] px-[clamp(1.1rem,6vw,6rem)] py-[clamp(3rem,8vw,6rem)]">
          <RouteError {...props} homeHref="/" />
        </main>
      </body>
    </html>
  );
}
