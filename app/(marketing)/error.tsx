"use client";

import { RouteError } from "@/components/route-error";

/** Public pages: the marketing header stays, only the page is replaced. */
export default function MarketingError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} homeHref="/" />;
}
