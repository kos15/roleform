import type { Metadata } from "next";
import { Anton, Figtree } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

/**
 * Anton is the only display voice; Figtree carries body copy (CLAUDE.md §9).
 * Both are wired to the token names the DS classes read.
 */
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roleform",
  description:
    "Eleven tailored résumés, the questions you'll be asked, and the gaps to close — from your own experience. Nothing is invented.",
};

/**
 * Clerk's own screens (the sign-in modal, the routed pages, the user menu),
 * dressed in the house style. Clerk derives its hover and border shades from
 * the `variables` block, so those have to be literal colours — they are the
 * same values as the tokens in globals.css. Everything under `elements` is
 * plain CSS and reads the tokens directly.
 */
const clerkAppearance = {
  variables: {
    colorPrimary: "#4a0d0d",
    colorText: "#4a0d0d",
    colorTextSecondary: "#7a5647",
    colorBackground: "#fffbf4",
    colorInputBackground: "#f8f0e3",
    colorInputText: "#4a0d0d",
    borderRadius: "14px",
    fontFamily: "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: { boxShadow: "none", borderRadius: "30px" },
    cardBox: { boxShadow: "none", borderRadius: "30px" },
    headerTitle: { fontWeight: 800, fontSize: "24px" },
    formButtonPrimary: {
      minHeight: "50px",
      borderRadius: "999px",
      background: "var(--color-text)",
      color: "var(--color-accent-500)",
      fontWeight: 800,
      fontSize: "15px",
      boxShadow: "none",
      textTransform: "none" as const,
    },
    socialButtonsBlockButton: {
      minHeight: "50px",
      borderRadius: "999px",
      border: "1.5px solid var(--color-text)",
      fontWeight: 700,
    },
    formFieldInput: { minHeight: "50px", border: "1.5px solid var(--color-line)" },
    footerActionLink: { fontWeight: 800, color: "var(--color-text)" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={`${anton.variable} ${figtree.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
