/**
 * The addresses the product prints (F16).
 *
 * Not server-only on purpose: these are published addresses, the opposite of a
 * secret, and the contact page renders them. Reading them from the environment
 * rather than hard-coding them is what lets one deployment route support to a
 * shared inbox and another to a person, without a code change.
 *
 * The fallbacks are the three aliases on `koustubh.org`, which Cloudflare Email
 * Routing forwards to a person. They are defaults rather than constants because
 * another deployment will own another domain — but they are real addresses
 * here, which the previous `roleform.app` fallbacks were not. A published
 * address that bounces is worse than no address at all.
 *
 * Inbound and outbound are separate systems on purpose: Cloudflare receives
 * (these three), Resend sends (lib/mail/config.ts). `CONTACT_TO` decides where
 * the form's mail goes; these three decide only what the page invites you to
 * write to by hand.
 */

const from = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const SUPPORT_EMAIL = from(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, "hello@koustubh.org");
export const PRIVACY_EMAIL = from(process.env.NEXT_PUBLIC_PRIVACY_EMAIL, "privacy@koustubh.org");
export const CATALOG_EMAIL = from(process.env.NEXT_PUBLIC_CATALOG_EMAIL, "catalog@koustubh.org");
