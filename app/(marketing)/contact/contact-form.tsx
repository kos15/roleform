"use client";

import { useActionState } from "react";
import { sendContactMessage, type ContactState } from "@/app/actions/contact";
import { Button, ErrorRegion, Field, Input, Textarea } from "@/components/ui";

const INITIAL: ContactState = { status: "idle" };

export function ContactForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action, pending] = useActionState(sendContactMessage, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="rise-in">
        <div
          aria-hidden
          className="mb-3.5 grid h-11 w-11 place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-100)] text-lg text-[var(--color-sage-800)]"
        >
          ✓
        </div>
        <h3 className="mb-2">Filed — we&rsquo;ll reply to {state.email}</h3>
        {/* Two sentences, because they are two different facts. The receipt
            either reached that address or it did not, and telling someone to
            check an inbox we never sent to is the small lie this product
            doesn't tell. Either way the message itself is filed — that part
            is written before any mail is attempted. */}
        <p className="text-[0.95rem] leading-[1.65] text-[var(--color-text-muted)]">
          {state.receipted
            ? "A copy is already in your inbox. A reply usually follows within a working day, always from a person's address rather than no-reply."
            : "We couldn't put a copy in your inbox, but the message is filed and a person reads it — usually within a working day."}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <Field label="Your name">
          <Input name="name" defaultValue={defaultName} required maxLength={120} />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={defaultEmail}
            required
            maxLength={200}
          />
        </Field>
      </div>

      <Field label="Subject">
        <Input
          name="subject"
          required
          maxLength={200}
          placeholder="Billing, a bad rewrite, a course that shouldn't be in the catalog…"
        />
      </Field>

      <Field label="Message">
        <Textarea
          name="body"
          required
          minLength={20}
          maxLength={5000}
          className="min-h-[150px] leading-[1.6]"
          placeholder="If it's about a specific analysis, paste its link — it saves us a round trip."
        />
      </Field>

      {state.status === "error" && state.message ? (
        <ErrorRegion title="That didn't send">{state.message}</ErrorRegion>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" busy={pending} disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
        <span className="text-xs text-[var(--color-text-muted)]">
          We never attach your profile or résumés to a support thread.
        </span>
      </div>
    </form>
  );
}
