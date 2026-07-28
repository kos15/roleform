import type { Metadata } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

/**
 * Caprasimo is the only display voice; Figtree carries body copy (CLAUDE.md §9).
 * Both are wired to the token names the DS classes read.
 */
const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caprasimo",
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
    "Six tailored résumés, the questions you'll be asked, and the gaps to close — from your own experience. Nothing is invented.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${caprasimo.variable} ${figtree.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
