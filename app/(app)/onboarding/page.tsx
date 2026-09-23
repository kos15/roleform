import { auth } from "@clerk/nextjs/server";
import { hasProfile } from "@/lib/db/queries/profile";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * Import, or replace.
 *
 * The same screen serves both, because the work is identical — but it used to
 * say "Import your résumé" to someone who arrived from Profile's **Replace
 * résumé** button, which reads as though the corpus they already have is about
 * to be joined rather than swapped. The heading now says which one is
 * happening, and says plainly when the existing profile changes.
 */
export default async function OnboardingPage() {
  const { userId } = await auth();
  const replacing = userId ? await hasProfile(userId) : false;

  return (
    <div className="max-w-[1000px]">
      <p className="eyebrow mb-3.5">Your résumé</p>
      <h1 className="mb-5">{replacing ? "Replace your résumé" : "Import your résumé"}</h1>
      <p className="mb-3 max-w-[58ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
        {replacing
          ? "Your current profile stays exactly as it is until you confirm the review screen. Past analyses are never rewritten — each one kept the wording it was built from."
          : "We read it once and keep the facts. Every posting after this is a lens over the same experience."}
      </p>
      {/* The product's law, stated where the user first hands over their document. */}
      <p className="mb-[clamp(1.75rem,4vw,2.75rem)] max-w-[58ch] text-[17px] leading-relaxed">
        We retarget this résumé against each posting.{" "}
        <strong className="rounded-[6px] bg-[var(--color-accent-500)] px-1.5 py-px">
          Nothing is invented
        </strong>{" "}
        —
        bullets are reordered, reworded and re-weighted.
      </p>
      <OnboardingFlow />
    </div>
  );
}
