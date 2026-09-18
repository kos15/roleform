"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button, Tag } from "@/components/ui";
import { CheckoutButton } from "@/components/checkout-button";
import type { CapWall } from "@/lib/domain/quotas";

/**
 * The cap wall (F23, PAY-4/PAY-5).
 *
 * The mirror of `TokenWallDialog` for the four count-based cyclical caps —
 * analyses, answers, roadmaps, job searches. Same rule: every number on it
 * comes from the `CapWall` the server returned with the refusal, so the
 * dialog cannot describe a different wall than the one that actually stopped
 * the action, and it takes none of the exits for you.
 *
 * Simpler than the token wall on purpose — there is no balance bar and no
 * per-stage breakdown, because a count-based cap has nothing to itemise. Two
 * exits: wait for the reset (free, always first), or move up a plan (absent
 * at the top, or on a per-analysis/per-gap cap that has no cycle to reset).
 */
export function CapWallDialog({ wall, onClose }: { wall: CapWall; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overflow-auto bg-[color-mix(in_srgb,#101010_52%,transparent)] p-5 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog pop-in fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(34rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          aria-describedby={undefined}
        >
          <div className="mb-3.5 flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-[var(--radius-pill)] bg-[var(--color-accent-500)]"
              style={{ animation: "breathe 1.6s ease-in-out infinite" }}
            />
            <span className="eyebrow text-[var(--color-accent-700)]">{wall.label}</span>
            <Tag tone="accent" className="ml-auto">
              {wall.used} of {wall.cap === 0 ? "0" : wall.cap}
            </Tag>
          </div>

          <Dialog.Title className="mb-2 text-[clamp(1.3rem,3.2vw,1.6rem)] leading-[1.18]">
            {wall.cap === 0
              ? `${wall.label} are off on your plan.`
              : `You've used all ${wall.cap} ${wall.label.toLowerCase()} ${wall.period === "cycle" ? "this cycle" : "here"}.`}
          </Dialog.Title>

          <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {wall.period === "cycle" && wall.resetDate
              ? `Your cycle resets on ${wall.resetDate}, ${wall.resetIn}. Everything you've already built or saved stays readable at any cap.`
              : "Everything you've already built or saved stays readable at any cap."}
          </p>

          <div className="flex flex-col gap-2.5">
            {wall.period === "cycle" && wall.resetDate ? (
              <Exit
                title="Wait for the reset"
                body={`Nothing starts on its own and nothing is charged — the allowance simply refills on ${wall.resetDate}.`}
              />
            ) : null}

            {wall.upgrade ? (
              <Exit
                tone="accent"
                title={`Move to ${wall.upgrade.name} — ${wall.upgrade.price} a month`}
                body={`${wall.upgrade.cap} ${wall.label.toLowerCase()} a cycle instead of ${wall.cap}.`}
                action={
                  <CheckoutButton
                    purchase={{ kind: "plan", id: wall.upgrade.id }}
                    label={`Go ${wall.upgrade.name}`}
                    description={`Roleform — ${wall.upgrade.name}, one month`}
                    onPurchased={onClose}
                  />
                }
              />
            ) : null}

            {wall.admins.length > 0 ? (
              <Exit
                title="Ask an admin"
                body={`${listNames(wall.admins)} can raise this cap for your account.`}
              />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" onClick={onClose}>
                Not now
              </Button>
            </Dialog.Close>
            <a href="/pricing" className="no-underline">
              <Button variant="ghost">Compare plans</Button>
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function Exit({
  title,
  body,
  action,
  tone = "plain",
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "plain" | "accent";
}) {
  const skin =
    tone === "accent"
      ? { background: "var(--color-accent-100)", borderColor: "var(--color-accent-300)" }
      : { background: "var(--color-bg-raised)", borderColor: "var(--color-line)" };

  return (
    <div
      className="flex flex-wrap items-center gap-3.5 rounded-[var(--radius-lg)] border p-4"
      style={skin}
    >
      <div className="min-w-0 flex-[1_1_14rem]">
        <div className="mb-0.5 font-[family-name:var(--font-heading)] text-[1.05rem]">{title}</div>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{body}</p>
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}
