import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = {
  title: "How it works · Roleform",
  description: DOCS["how-it-works"].intro,
};

export default function HowItWorksPage() {
  return <DocPage doc={DOCS["how-it-works"]} />;
}
