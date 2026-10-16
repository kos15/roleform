import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AuthSplit } from "@/components/auth-split";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in" };

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
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  // Already signed in: Clerk's card would render an empty "you're signed in"
  // state and sit there. Send them where they were going instead — same-site
  // paths only, so this is not an open redirect.
  const { userId } = await auth();
  if (userId) {
    const { redirect_url } = await searchParams;
    redirect(redirect_url && /^\/(?!\/)/.test(redirect_url) ? redirect_url : "/analyze");
  }

  return (
    <AuthSplit kicker="Sign in" title="Your own words, retargeted.">
      <SignIn fallbackRedirectUrl="/analyze" signUpUrl="/sign-up" />
    </AuthSplit>
  );
}
