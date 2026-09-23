import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = pageMetadata({
  title: "How Roleform tailors your resume: the four-stage pipeline",
  description:
    "Roleform reads the posting, matches it against your own words, rewrites your résumé and prepares interview questions — and states what each stage refuses to do.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return <DocPage doc={DOCS["how-it-works"]} />;
}
