import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { PalettePicker } from "./palette-picker";

export const metadata: Metadata = {
  title: "Appearance · Roleform",
  description:
    "Six palettes, each a ground and two voices. Every colour in the product is derived from them.",
};

/**
 * Appearance (F18).
 *
 * Public on purpose, in the marketing group rather than behind the app shell:
 * the palette is a browser preference, not account state, and someone reading
 * the privacy page in the dark should be able to fix the contrast without
 * signing in first.
 */
export default function AppearancePage() {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-6 py-12">
      <PageIntro kicker="Appearance" title="Pick the palette you'll be reading in">
        Six palettes, each a ground and two voices. Every colour in the product — the mark, the
        coverage buckets, the meters, the buttons, every state — is derived from those, so nothing
        can drift out of step. It applies the moment you choose it, and it lives in this browser
        rather than on your account.
      </PageIntro>

      <PalettePicker />
    </div>
  );
}
