import { OnboardingFlow } from "./onboarding-flow";

export default function OnboardingPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-3">Import your résumé</h1>
      <p className="mb-2 max-w-xl text-[var(--color-text-muted)]">
        We read it once and keep the facts. Every posting after this is a lens over the same
        experience.
      </p>
      {/* The product's law, stated where the user first hands over their document. */}
      <p className="mb-8 max-w-xl text-accent-body">
        We retarget this résumé against each posting. <strong>Nothing is invented</strong> —
        bullets are reordered, reworded and re-weighted.
      </p>
      <OnboardingFlow />
    </div>
  );
}
