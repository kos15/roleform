import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What Roleform stores, what it never does with your résumé (no training, no selling), who can see what, and how one-click deletion works.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <DocPage doc={DOCS.privacy} />;
}
