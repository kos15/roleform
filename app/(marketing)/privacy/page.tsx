import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { DOCS } from "@/lib/content/docs";

export const metadata: Metadata = {
  title: "Privacy · Roleform",
  description: DOCS.privacy.intro,
};

export default function PrivacyPage() {
  return <DocPage doc={DOCS.privacy} />;
}
