"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAccountName } from "@/app/actions/account";
import { Button, ErrorRegion } from "@/components/ui";

/**
 * The account's name (F33): what the header says "Hi" to. Separate from the
 * name on the résumé on purpose — one is how we address you, the other is
 * what a stranger reads at the top of your document. Saving a résumé name
 * fills this one only when it is blank.
 */
export function AccountName({ firstName, lastName }: { firstName: string; lastName: string }) {
  const router = useRouter();
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const missing = !firstName.trim();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAccountName({ firstName: first, lastName: last });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section
      id="your-name"
      className={`mb-8 max-w-3xl scroll-mt-24 rounded-[var(--radius-lg)] p-[clamp(1rem,3vw,1.375rem)] ${
        missing ? "bg-[var(--color-accent-100)]" : "bg-[var(--color-bg-raised)]"
      }`}
    >
      <h3 className="mb-1">{missing ? "What should we call you?" : "Your name"}</h3>
      <p className="mb-3.5 text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
        {missing
          ? "Your account doesn't have a name yet, so we can't greet you properly. Add one — it stays on your account and isn't printed on any résumé."
          : "How Roleform addresses you. The name on your résumé is edited in the profile below."}
      </p>
      <form
        className="flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field min-w-[min(180px,100%)] flex-1 text-xs">
          <span>First name</span>
          <input
            className="input"
            value={first}
            maxLength={60}
            autoComplete="given-name"
            onChange={(e) => setFirst(e.target.value)}
          />
        </label>
        <label className="field min-w-[min(180px,100%)] flex-1 text-xs">
          <span>Last name</span>
          <input
            className="input"
            value={last}
            maxLength={60}
            autoComplete="family-name"
            onChange={(e) => setLast(e.target.value)}
          />
        </label>
        <Button type="submit" busy={pending} disabled={pending || !first.trim()}>
          {saved ? "Saved" : "Save name"}
        </Button>
      </form>
      {error ? (
        <div className="mt-3">
          <ErrorRegion title="That didn't save">{error}</ErrorRegion>
        </div>
      ) : null}
    </section>
  );
}
