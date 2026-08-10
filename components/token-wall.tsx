"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import { CheckoutButton } from "@/components/checkout-button";
import { formatCount, type TokenWall } from "@/lib/domain/tokens";

/**
 * The token wall (F19).
 *
 * One dialog with three exits, and the free one is listed first. Every number
 * on it comes from the `TokenWall` the server returned with the refusal, so the
 * dialog cannot describe a different wall than the one that actually stopped
 * the run.
 *
 * **It takes none of the exits for you.** Nothing here upgrades a plan, buys a
 * pack, or quietly downgrades the run to fit — the pricing page publishes that
 * refusal and this is where it is kept. The most an unattended click does is
 * open the provider's own window.
 *
 * Three views, because the dialog outlives the refusal that opened it:
 *   blocked — the refusal, with the exits
 *   queued  — the posting was parked; says exactly what will and won't happen
 *   ready   — tokens arrived; offers to run the thing that was refused
 */
export type WallView = "blocked" | "queued" | "ready";

export function TokenWallDialog({
  wall,
  onClose,
  onQueue,
  onResume,
  resumeLabel = "Run it now",
}: {
  wall: TokenWall;
  onClose: () => void;
  /** Present only when this wall can be parked (an analysis, not a draft). */
  onQueue?: () => Promise<void> | void;
  /** Re-attempt the refused work once tokens have arrived. */
  onResume?: () => Promise<void> | void;
  resumeLabel?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<WallView>("blocked");
  const [credited, setCredited] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function queue() {
    if (!onQueue) return;
    setBusy(true);
    setError(null);
    try {
      await onQueue();
      setView("queued");
    } catch {
      setError("We couldn't park that posting. Nothing was charged.");
    } finally {
      setBusy(false);
    }
  }

  // The webhook credits the account, not this handler — so all we can honestly
  // do on the provider's callback is refresh and say the payment went through.
  function purchased(message: string) {
    setCredited(message);
    setView("ready");
    router.refresh();
  }

  return (
    <Dialog.Root open onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overflow-auto bg-[color-mix(in_srgb,#101010_52%,transparent)] p-5 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog pop-in fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(38.75rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          aria-describedby={undefined}
        >
          {view === "blocked" ? (
            <Blocked
              wall={wall}
              busy={busy}
              error={error}
              onQueue={onQueue ? queue : undefined}
              onPurchased={purchased}
              onClose={onClose}
            />
          ) : view === "queued" ? (
            <Queued wall={wall} onClose={onClose} onUnqueue={() => setView("blocked")} />
          ) : (
            <Ready
              wall={wall}
              message={credited}
              resumeLabel={resumeLabel}
              onResume={onResume}
              onClose={onClose}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* --------------------------------------------------------------- 1. blocked */

function Blocked({
  wall,
  busy,
  error,
  onQueue,
  onPurchased,
  onClose,
}: {
  wall: TokenWall;
  busy: boolean;
  error: string | null;
  onQueue?: () => void;
  onPurchased: (message: string) => void;
  onClose: () => void;
}) {
  const { balance } = wall;
  // The bar shows three quantities against one total: what has gone, what is
  // left, and the piece that isn't there. The last one is hatched rather than
  // coloured, because it is the only segment that is not a real balance.
  const total = balance.total + wall.shortfall || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none rounded-[var(--radius-pill)] bg-[var(--color-accent-500)]"
          style={{ animation: "breathe 1.6s ease-in-out infinite" }}
        />
        <span className="eyebrow text-[var(--color-accent-700)]">Token wall</span>
        <Tag tone="accent" className="ml-auto">
          {formatCount(wall.shortfall)} short
        </Tag>
      </div>

      <Dialog.Title className="mb-2 text-[clamp(1.3rem,3.2vw,1.7rem)] leading-[1.18]">
        {wall.kind === "answer" ? "A drafted answer needs " : "This run needs "}
        about {formatCount(wall.estimate)} tokens. You have {formatCount(balance.left)}.
      </Dialog.Title>

      <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
        {wall.planName} gives you {formatCount(balance.allowance)} tokens a cycle
        {balance.topups > 0 ? `, plus ${formatCount(balance.topups)} unspent from a top-up` : ""},
        and you have drawn {formatCount(balance.used)}. We stop before the first stage rather than
        half-run an analysis and bill you for it.
      </p>

      <div
        className="mb-2 flex h-[11px] overflow-hidden rounded-[var(--radius-pill)]"
        style={{ background: "var(--color-bg-sunken)" }}
      >
        <span style={{ width: pct(balance.used), background: "var(--color-sage-500)" }} />
        <span style={{ width: pct(balance.left), background: "var(--color-sage-200)" }} />
        <span
          style={{
            width: pct(wall.shortfall),
            background:
              "repeating-linear-gradient(135deg, var(--color-accent-400) 0 5px, var(--color-accent-200) 5px 10px)",
          }}
        />
      </div>
      <div className="mb-4 flex flex-wrap justify-between gap-2.5 text-xs text-[var(--color-text-muted)]">
        <span>
          {formatCount(balance.used)} of {formatCount(balance.total)} used
        </span>
        <span>Resets {wall.resetDate}</span>
      </div>

      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] px-4 py-3.5">
        <div className="eyebrow mb-2.5">Where the {formatCount(wall.estimate)} would go</div>
        {wall.kind === "answer" ? (
          <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
            One mid-tier call against the bullets this question already cites. The framework and the
            source bullets are free, and stay on the screen at any balance.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {wall.stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-3 text-[0.8125rem]">
                <span className="min-w-0 flex-1">{s.stage}</span>
                <span className="h-[5px] w-20 flex-none overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-bg-sunken)]">
                  <span
                    className="block h-full rounded-[var(--radius-pill)]"
                    style={{
                      width: `${Math.round((s.estimate / 8400) * 100)}%`,
                      background: "var(--color-sage-600)",
                    }}
                  />
                </span>
                <span className="w-14 text-right tabular-nums text-[var(--color-text-muted)]">
                  {formatCount(s.estimate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <ErrorRegion title="That didn't work">{error}</ErrorRegion> : null}

      <div className="flex flex-col gap-2.5">
        {/* The free exit, first and always. */}
        <Exit
          title={onQueue ? "Wait for the reset" : "Come back after the reset"}
          body={
            onQueue
              ? `Your cycle turns over on ${wall.resetDate}, ${wall.resetIn}. Park this posting and it waits for you — we keep the text, so you don't have to find it again. Nothing starts on its own and nothing is charged.`
              : `Your cycle turns over on ${wall.resetDate}, ${wall.resetIn}. The question, its framework and the bullets to answer from stay on the screen until then.`
          }
          action={
            onQueue ? (
              <Button variant="secondary" onClick={onQueue} disabled={busy} busy={busy}>
                {busy ? "Parking…" : "Park it"}
              </Button>
            ) : null
          }
        />

        {wall.topups.map((t) => (
          <Exit
            key={t.id}
            tone="sage"
            title={`Top up once — ${t.price}`}
            body={t.note}
            action={
              <CheckoutButton
                purchase={{ kind: "topup", id: t.id }}
                label={`Add ${t.name}`}
                description={`Roleform — ${t.name}`}
                variant="secondary"
                onPurchased={() => onPurchased(`${t.name} added`)}
              />
            }
          />
        ))}

        {wall.upgrade ? (
          <Exit
            tone="accent"
            title={`Move to ${wall.upgrade.name} — ${wall.upgrade.price} a month`}
            body={wall.upgrade.note}
            action={
              <CheckoutButton
                purchase={{ kind: "plan", id: wall.upgrade.id }}
                label={`Go ${wall.upgrade.name}`}
                description={`Roleform — ${wall.upgrade.name}, one month`}
                onPurchased={() => onPurchased(`You are on ${wall.upgrade!.name}`)}
              />
            }
          />
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Nothing upgrades itself, and we will not part-run an analysis to fit the balance. If none of
        these is right, the reset costs nothing.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Dialog.Close asChild>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </Dialog.Close>
        <a href="/pricing" className="no-underline">
          <Button variant="ghost">Compare plans</Button>
        </a>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 2. queued */

function Queued({
  wall,
  onClose,
  onUnqueue,
}: {
  wall: TokenWall;
  onClose: () => void;
  onUnqueue: () => void;
}) {
  return (
    <>
      <div className="mb-3.5 flex items-center gap-3.5">
        <span className="pop-in grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-100)] text-lg text-[var(--color-sage-800)]">
          ✓
        </span>
        <div>
          <Dialog.Title className="mb-0.5 text-[1.45rem]">
            Parked until {wall.resetDate}
          </Dialog.Title>
          <p className="text-xs text-[var(--color-text-muted)]">{wall.resetIn} · nothing charged</p>
        </div>
      </div>

      {/* The honest version. We have no worker and no scheduler (CLAUDE.md §8),
          so promising an email would be promising a thing that cannot happen. */}
      <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
        The posting is stored against your account. It does <strong>not</strong> start itself — when
        your allowance refills on {wall.resetDate} it will be waiting on the analyse screen with a
        button, and one click runs it. We would rather say that than promise you an email from a
        scheduler we do not run.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onClose}>Back to the posting</Button>
        <Button variant="ghost" onClick={onUnqueue}>
          Actually, show me the other options
        </Button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- 3. ready */

function Ready({
  wall,
  message,
  resumeLabel,
  onResume,
  onClose,
}: {
  wall: TokenWall;
  message: string | null;
  resumeLabel: string;
  onResume?: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-3.5 flex items-center gap-3.5">
        <span className="pop-in grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-100)] text-lg text-[var(--color-sage-800)]">
          ✓
        </span>
        <div>
          <Dialog.Title className="mb-0.5 text-[1.45rem]">
            {message ?? "Payment went through"}
          </Dialog.Title>
          <p className="text-xs text-[var(--color-text-muted)]">
            Your balance updates as soon as the provider confirms it
          </p>
        </div>
      </div>

      {/* Deliberately not claiming the tokens are already there: the webhook
          credits the account, and it usually lands within seconds, but this
          screen cannot see it happen and should not pretend it can. */}
      <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
        The credit is applied by the payment provider&rsquo;s confirmation, not by this window — so
        if the balance in the header hasn&rsquo;t moved yet, give it a moment and reload. Your
        allowance still resets on {wall.resetDate}; anything you bought outlives that.
      </p>

      <div className="flex flex-wrap gap-2">
        {onResume ? <Button onClick={() => void onResume()}>{resumeLabel}</Button> : null}
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ shared */

function Exit({
  title,
  body,
  action,
  tone = "plain",
}: {
  title: string;
  body: string;
  action: React.ReactNode;
  tone?: "plain" | "sage" | "accent";
}) {
  const skin =
    tone === "accent"
      ? { background: "var(--color-accent-100)", borderColor: "var(--color-accent-300)" }
      : tone === "sage"
        ? { background: "var(--color-sage-100)", borderColor: "var(--color-sage-200)" }
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
