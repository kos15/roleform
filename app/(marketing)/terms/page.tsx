import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description:
    "The short, readable Roleform terms: what you are responsible for, what we are responsible for, fair use and cancellation.",
  path: "/terms",
});

export default function TermsPage() {
  return <DocPage doc={DOCS.terms} />;
}
