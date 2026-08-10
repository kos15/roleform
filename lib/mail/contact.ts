import "server-only";
import type { Mail } from "@/lib/mail/send";
import { SUPPORT_EMAIL } from "@/lib/mail/addresses";

/**
 * The two messages the contact form sends (F16).
 *
 * **Exempt from `organic`, for the reason export templates are** (CLAUDE.md
 * §9): an email is not a Roleform surface. It renders in someone else's client,
 * where our tokens do not exist and half our CSS would be stripped. So the
 * markup here is deliberately close to plain — a system font stack, one hairline
 * rule, no brand colour — and every message carries a real `text` part rather
 * than an HTML-only body that reads as a blank in a plain-text client.
 *
 * Every interpolation of user input goes through `escape`. A subject line is
 * attacker-controlled text on a public form; unescaped, it is an injection into
 * whatever renders the mail.
 */

export interface ContactMail {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  /** Present when the sender was signed in — an opaque subject, never an address. */
  clerkUserId: string | null;
}

/** The message to us. Reply-To is the sender, so hitting reply just works. */
export function notification(message: ContactMail, appUrl: string | null): Mail {
  const rows: [string, string][] = [
    ["From", `${message.name} <${message.email}>`],
    ["Account", message.clerkUserId ?? "signed out"],
    ["Reference", message.id],
  ];

  // Blank lines are structure here, so only the one optional line is dropped —
  // filtering every empty string would run the subject into the body.
  const text = [
    `${message.name} <${message.email}> wrote:`,
    "",
    message.subject,
    "",
    message.body,
    "",
    "—",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(appUrl ? [`Inbox: ${appUrl}/admin?panel=inbox`] : []),
  ].join("\n");

  const html = shell(`
    <p style="margin:0 0 4px"><strong>${escape(message.subject)}</strong></p>
    <p style="margin:0 0 20px;font-size:13px;color:#555">
      ${escape(message.name)} &lt;${escape(message.email)}&gt;
    </p>
    ${quote(message.body)}
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
    <table style="font-size:12px;color:#555;border-collapse:collapse">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:2px 12px 2px 0">${escape(label)}</td><td>${escape(value)}</td></tr>`,
        )
        .join("")}
    </table>
    ${
      appUrl
        ? `<p style="margin:16px 0 0;font-size:12px"><a href="${escape(appUrl)}/admin?panel=inbox">Open the support inbox</a></p>`
        : ""
    }
  `);

  return {
    // No `to`: this one goes to CONTACT_TO, which only lib/mail/config.ts knows.
    // Prefixed so a filter can find these, and carrying the sender's own
    // subject rather than a generic one — an inbox of "New contact message" is
    // an inbox you have to open every row of.
    subject: `[Roleform] ${message.subject}`,
    text,
    html,
    replyTo: `${message.name} <${message.email}>`,
  };
}

/**
 * The receipt to the sender.
 *
 * It quotes their message back, because the one thing a receipt has to prove is
 * that we received the words they actually typed. It promises a reply from a
 * person within a working day — the same promise the page makes, which is why
 * Reply-To points at the support address and not at no-reply.
 */
export function receipt(message: ContactMail): Mail {
  const text = [
    `Hi ${message.name},`,
    "",
    "We have your message and a person will reply, usually within a working day.",
    "There is no ticket queue and no bot — two of us read these.",
    "",
    "What you sent:",
    "",
    message.subject,
    "",
    message.body,
    "",
    "—",
    `Reference: ${message.id}`,
    `Replying to this email reaches us at ${SUPPORT_EMAIL}.`,
  ].join("\n");

  const html = shell(`
    <p style="margin:0 0 12px">Hi ${escape(message.name)},</p>
    <p style="margin:0 0 12px">
      We have your message and a person will reply, usually within a working day.
      There is no ticket queue and no bot — two of us read these.
    </p>
    <p style="margin:24px 0 8px;font-size:13px;color:#555">What you sent</p>
    <p style="margin:0 0 8px"><strong>${escape(message.subject)}</strong></p>
    ${quote(message.body)}
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />
    <p style="margin:0;font-size:12px;color:#555">
      Reference: ${escape(message.id)}<br />
      Replying to this email reaches us at ${escape(SUPPORT_EMAIL)}.
    </p>
  `);

  return {
    to: [message.email],
    subject: `We have your message — ${message.subject}`,
    text,
    html,
    replyTo: SUPPORT_EMAIL,
  };
}

/* --------------------------------------------------------------- rendering */

function shell(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#201e1d;max-width:620px">${inner}</div>`;
}

/** The sender's own words, kept as they typed them — newlines included. */
function quote(body: string): string {
  return `<div style="border-left:3px solid #ddd;padding-left:14px;white-space:pre-wrap">${escape(body)}</div>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
