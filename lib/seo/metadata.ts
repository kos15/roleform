import type { Metadata } from "next";
import { markdownUrl } from "./markdown";

/**
 * Per-page metadata with the pieces every public page needs: a canonical URL,
 * Open Graph / Twitter text that matches the title, and a pointer to the
 * page's Markdown mirror for agents.
 */
export function pageMetadata({
  title,
  description,
  path,
  markdown = true,
}: {
  title: string;
  description: string;
  path: string;
  markdown?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
      ...(markdown ? { types: { "text/markdown": markdownUrl(path) } } : {}),
    },
    openGraph: { title, description, url: path },
    twitter: { title, description },
  };
}
