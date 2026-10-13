"use client";

import { RouteError } from "@/components/route-error";

/** Signed-in screens: the header and tab bar stay, only the page is replaced. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/analyze" />;
}
