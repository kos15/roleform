"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceDefaults } from "@/app/actions/admin";
import { Button, ErrorRegion } from "@/components/ui";
import { clampCap, displayCap, QUOTAS, type QuotaKey } from "@/lib/domain/quotas";

/**
 * Workspace defaults (F15) — what the design's second header control opens.
 *
 * The same stepper as the per-member panel, on purpose: these are the same
 * four numbers, and an admin who has learned one control should not have to
 * learn a second. What differs is the sentence under the heading, because the
 * two mean genuinely different things and the panel has to say which one you
 * are holding.
 *
 * Nothing saves on a click of + or −, for the reason the member panel gives:
 * a value that writes as you scrub it means a number you were only passing
 * through becomes the workspace's answer for the next person who signs up.
 */
export function WorkspaceDefaultsPanel({ defaults }: { defaults: Record<QuotaKey, number> }) {
  const [draft, setDraft] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = QUOTAS.some((q) => draft[q.key] !== defaults[q.key]);

  function nudge(key: QuotaKey, delta: number) {
    setSaved(false);
    setError(null);
    setDraft((d) => ({ ...d, [key]: clampCap(key, d[key] + delta) }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateWorkspaceDefaults(draft);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section className="rise-in mb-6 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.125rem,3vw,1.5rem)]">
      <div className="mb-4 max-w-[62ch]">
        <h3 className="mb-1.5">Workspace defaults</h3>
        <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          What a new account starts with. Changing these moves nobody who is already here —
          existing members keep the caps on their own row, and the list below is where you move
          one of those, next to the usage you are moving the line across.
        </p>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {QUOTAS.map((quota) => (
          <div
            key={quota.key}
            className="border-t border-[var(--color-line)] pt-4"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-[0.9rem] font-semibold">{quota.label}</div>
                <p className="text-xs leading-snug text-[var(--color-text-muted)]">
                  {quota.description}
                </p>
              </div>

              <div className="flex flex-none items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-line)] bg-[var(--color-bg)] p-[3px]">
                <StepButton
                  label={`Lower the default ${quota.label}`}
                  disabled={draft[quota.key] <= quota.min}
                  onClick={() => nudge(quota.key, -quota.step)}
                >
                  −
                </StepButton>
                <span className="min-w-[38px] text-center text-sm font-bold tabular-nums">
                  {displayCap(quota.key, draft[quota.key])}
                </span>
                <StepButton
                  label={`Raise the default ${quota.label}`}
                  disabled={draft[quota.key] >= quota.max}
                  onClick={() => nudge(quota.key, quota.step)}
                >
                  +
                </StepButton>
              </div>
            </div>
            <div className="text-[11.5px] text-[var(--color-text-muted)]">{quota.unit}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorRegion title="Those defaults didn't save">{error}</ErrorRegion>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={save} busy={pending} disabled={pending || (!dirty && !saved)}>
          {saved && !dirty ? "Saved" : "Save defaults"}
        </Button>
        {dirty ? (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(defaults);
              setError(null);
            }}
          >
            Revert
          </Button>
        ) : null}
        <span className="min-w-[180px] flex-1 text-xs text-[var(--color-text-muted)]">
          Applies to the next account provisioned, not to anyone already in the list.
        </span>
      </div>
    </section>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[26px] w-[26px] place-items-center rounded-[var(--radius-pill)] text-base leading-none transition-colors hover:bg-[var(--color-accent-100)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
