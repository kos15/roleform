"use client";

import { useState, useTransition } from "react";
import { setFeature } from "@/app/actions/admin-controls";
import { ErrorRegion, Tag } from "@/components/ui";
import { FEATURES, type FeatureKey } from "@/lib/domain/features";

/**
 * Site-wide feature switches (F31).
 *
 * A switch writes the moment it is flipped — unlike a cap, there is no value
 * an admin "passes through" on the way to the one they want. Off means the
 * surface's pages 404, its nav links disappear and its actions refuse with a
 * sentence; nothing a member already made is deleted.
 *
 * Per plan is the caps' job (N22), not this one's.
 */
export function FeaturesPanel({ states }: { states: Record<FeatureKey, boolean> }) {
  const [on, setOn] = useState(states);
  const [busy, setBusy] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flip(key: FeatureKey) {
    const next = !on[key];
    setError(null);
    setBusy(key);
    setOn((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const result = await setFeature({ key, enabled: next });
      setBusy(null);
      if (!result.ok) {
        setOn((s) => ({ ...s, [key]: !next }));
        setError(result.error.message);
      }
    });
  }

  return (
    <section className="rise-in rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[clamp(1.125rem,3vw,1.5rem)]">
      <div className="mb-4 max-w-[62ch]">
        <h3 className="mb-1.5">Features</h3>
        <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          Open or close a whole surface for everyone. Switching one off hides its links, 404s its
          pages and refuses its actions with a plain sentence — nothing anyone has already made is
          deleted, and switching it back on brings it all back. To limit a feature by plan instead,
          change that plan&rsquo;s cap.
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <ErrorRegion title="That didn't switch">{error}</ErrorRegion>
        </div>
      ) : null}

      <div className="flex flex-col">
        {FEATURES.map((feature) => {
          const enabled = on[feature.key];
          return (
            <div
              key={feature.key}
              className="flex items-start justify-between gap-4 border-t border-[var(--color-line)] py-4 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-[0.95rem] font-semibold">{feature.label}</span>
                  <Tag tone={enabled ? "sage" : "accent"}>{enabled ? "On" : "Off"}</Tag>
                </div>
                <p className="text-xs leading-snug text-[var(--color-text-muted)]">{feature.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${feature.label} ${enabled ? "on" : "off"}`}
                disabled={busy === feature.key}
                onClick={() => flip(feature.key)}
                className="h-6 w-11 flex-none rounded-[var(--radius-pill)] p-0.5 transition-colors disabled:opacity-60"
                style={{ background: enabled ? "var(--color-sage-500)" : "var(--color-bg-sunken)" }}
              >
                <span
                  className="block h-5 w-5 rounded-[var(--radius-pill)] bg-[var(--color-bg)] transition-transform duration-200"
                  style={{ transform: enabled ? "translateX(20px)" : undefined }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
