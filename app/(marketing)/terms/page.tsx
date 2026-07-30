import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = {
  title: "Terms · Roleform",
  description: DOCS.terms.intro,
};

export default function TermsPage() {
  return <DocPage doc={DOCS.terms} />;
}
