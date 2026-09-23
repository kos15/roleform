"use client";

import { useState, useTransition } from "react";
import { retryContactDelivery, setContactHandled } from "@/app/actions/admin";
import { Button, ErrorRegion, Tag } from "@/components/ui";
import type { InboxMessage } from "@/lib/admin/inbox";

/**
 * The support inbox (F16).
 *
 * Contact messages are stored before they are mailed, so this is the read path
 * that still works when the provider is down or nobody has configured one. Two
 * facts per row, and they are genuinely different: whether the mail to us got
 * out, and whether a person has answered it. A row can be delivered and
 * unanswered, or undelivered and answered by someone who read it here.
 *
 * The list is a Server Component's data; only the two writes are actions, and
 * both re-check the admin role on the server (app/actions/admin.ts) — the link
 * to this panel is a URL anyone can type.
 */
export function InboxPanel({
  messages,
  mailConfigured,
}: {
  messages: InboxMessage[];
  mailConfigured: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(messages[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function act(id: string, run: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await run();
      setBusyId(null);
      if (!result.ok) setError(result.error?.message ?? "That didn't go through.");
    });
  }

  return (
    <section className="rise-in mb-6 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] p-[clamp(1.125rem,3vw,1.5rem)]">
      <div className="mb-4 max-w-[62ch]">
        <h3 className="mb-1.5">Support inbox</h3>
        <p className="text-[0.85rem] leading-relaxed text-[var(--color-text-muted)]">
          Every message the contact form has taken, filed before it was mailed. A row marked{" "}
          <em>not delivered</em> reached nobody&rsquo;s inbox — it is here and nowhere else, and
          the resend button is how it gets out.
        </p>
      </div>

      {!mailConfigured ? (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-sunken)] px-4 py-3 text-[0.82rem] leading-relaxed text-[var(--color-text-muted)]">
          Outbound mail isn&rsquo;t configured on this deployment, so nothing here was emailed and
          senders were told as much. Set <code>RESEND_API_KEY</code>, <code>CONTACT_FROM</code> and{" "}
          <code>CONTACT_TO</code>, then resend anything still waiting.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4">
          <ErrorRegion title="That didn't go through">{error}</ErrorRegion>
        </div>
      ) : null}

      {messages.length === 0 ? (
        <p className="text-[0.9rem] text-[var(--color-text-muted)]">
          Nothing yet. Messages from the contact page land here the moment they are filed.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)]">
          {messages.map((message) => {
            const open = message.id === openId;
            const busy = pending && busyId === message.id;
            return (
              <div
                key={message.id}
                className="border-b border-l-[3px] border-[var(--color-line)] last:border-b-0"
                style={{
                  borderLeftColor: message.handled
                    ? "transparent"
                    : "var(--color-accent-300)",
                  background: open ? "var(--color-accent-100)" : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : message.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="min-w-0 flex-1 basis-52">
                    <span className="flex flex-wrap items-center gap-[7px]">
                      <span className="text-[0.9rem] font-semibold">{message.subject}</span>
                      {message.handled ? <Tag tone="muted">Answered</Tag> : null}
                      <DeliveryTag message={message} />
                    </span>
                    <span className="block truncate text-xs text-[var(--color-text-muted)]">
                      {message.name} · {message.email}
                    </span>
                  </span>

                  <span className="flex-none text-xs tabular-nums text-[var(--color-text-muted)]">
                    {message.received}
                  </span>
                </button>

                {open ? (
                  <div className="px-4 pb-4">
                    {/* The sender's own words, kept as they typed them. */}
                    <p className="mb-3 whitespace-pre-wrap border-l-[3px] border-[var(--color-line)] pl-3.5 text-[0.88rem] leading-[1.65]">
                      {message.body}
                    </p>

                    <dl className="mb-3.5 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-[var(--color-text-muted)]">
                      <div className="flex gap-1.5">
                        <dt>Account</dt>
                        <dd className="font-medium">{message.clerkUserId ?? "signed out"}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Receipt to sender</dt>
                        <dd className="font-medium">{describe(message.receipt)}</dd>
                      </div>
                      {message.handledAt ? (
                        <div className="flex gap-1.5">
                          <dt>Answered</dt>
                          <dd className="font-medium">{message.handledAt}</dd>
                        </div>
                      ) : null}
                      {message.deliveryError ? (
                        <div className="flex gap-1.5 basis-full">
                          <dt>Provider said</dt>
                          <dd className="font-medium">{message.deliveryError}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                        className="btn btn-primary btn-sm no-underline"
                      >
                        Reply
                      </a>
                      <Button
                        variant="secondary"
                        size="sm"
                        busy={busy}
                        disabled={busy}
                        onClick={() =>
                          act(message.id, () => setContactHandled(message.id, !message.handled))
                        }
                      >
                        {message.handled ? "Mark unanswered" : "Mark answered"}
                      </Button>
                      {message.notification === "sent" ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          busy={busy}
                          disabled={busy}
                          onClick={() => act(message.id, () => retryContactDelivery(message.id))}
                        >
                          Send to us again
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Delivery of the mail to US — the one whose failure hides a message. */
function DeliveryTag({ message }: { message: InboxMessage }) {
  if (message.notification === "sent") return null;
  return (
    <Tag tone={message.notification === "failed" ? "warn" : "muted"}>
      {message.notification === "failed" ? "Not delivered" : "Not emailed"}
    </Tag>
  );
}

function describe(status: InboxMessage["receipt"]): string {
  switch (status) {
    case "sent":
      return "delivered";
    case "failed":
      return "refused by the provider";
    case "disabled":
      return "mail was switched off";
    default:
      return "not attempted";
  }
}
