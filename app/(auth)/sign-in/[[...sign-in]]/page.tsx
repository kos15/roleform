import type { Metadata } from "next";
import { AuthSplit } from "@/components/auth-split";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in · Roleform" };

/**
 * The routed sign-in, alongside the modal the marketing header opens.
 *
 * It exists because three paths need a URL rather than a modal: Clerk's own
 * bounce out of `auth.protect()` (NEXT_PUBLIC_CLERK_SIGN_IN_URL), the checkout
 * button sending a signed-out visitor back to /pricing afterwards, and any link
 * anyone shares. A modal cannot carry a return address.
 *
 * Catch-all segment because Clerk routes its own sub-steps (factor two,
 * verification, SSO callback) under this path.
 *
 * `fallbackRedirectUrl` is where a session with nowhere else to go lands.
 * /analyze rather than /onboarding: it holds the "import your résumé first"
 * state for a new account and the working screen for everyone else, so one
 * destination is correct for both.
 */
export default function SignInPage() {
  return (
    <AuthSplit kicker="Sign in" title="Your own words, retargeted.">
      <SignIn fallbackRedirectUrl="/analyze" signUpUrl="/sign-up" />
    </AuthSplit>
  );
}
