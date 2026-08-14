import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Create an account · Roleform" };

/**
 * The routed sign-up. Paired with /sign-in so the "no account yet?" link inside
 * Clerk's card has somewhere in this app to go rather than the hosted portal.
 *
 * New accounts land on /analyze, which shows the "import your résumé first"
 * state until there is a profile — one destination that is right before and
 * after onboarding.
 */
export default function SignUpPage() {
  return <SignUp fallbackRedirectUrl="/analyze" signInUrl="/sign-in" />;
}
