import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AuthSplit } from "@/components/auth-split";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Create an account" };

/**
 * The routed sign-up. Paired with /sign-in so the "no account yet?" link inside
 * Clerk's card has somewhere in this app to go rather than the hosted portal.
 *
 * New accounts land on /analyze, which shows the "import your résumé first"
 * state until there is a profile — one destination that is right before and
 * after onboarding.
 */
export default async function SignUpPage({
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
    <AuthSplit kicker="Sign up" title="Your own words, retargeted.">
      <SignUp fallbackRedirectUrl="/analyze" signInUrl="/sign-in" />
    </AuthSplit>
  );
}
