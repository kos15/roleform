"use client";

import { RouteError } from "@/components/route-error";

/**
 * Catches what the route groups' own boundaries can't: a crash in one of their
 * layouts (the header's own data, say). No chrome here — it is the chrome that
 * failed — so the page carries its own margins, like the 404.
 */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[1320px] px-[clamp(1.1rem,6vw,6rem)] py-[clamp(3rem,8vw,6rem)]">
      <RouteError {...props} homeHref="/" />
    </main>
  );
}
