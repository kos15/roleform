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

/**
 * Sets `data-theme` before first paint.
 *
 * The theme lives on the html element, so React can't set it without a flash:
 * the server has no way to know the stored preference, and by the time an effect
 * runs the cream ground has already been painted. This runs synchronously in
 * head, ahead of the first paint, which is the only place it can run.
 *
 * No stored preference falls through to the OS setting rather than to light.
 */
const THEME_BOOTSTRAP = `(function(){try{
var t=localStorage.getItem("roleform-theme");
if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
document.documentElement.dataset.theme=t;
}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {/* The bootstrap script mutates data-theme before hydration, which React
          would otherwise report as a server/client mismatch on this element. */}
      <html
        lang="en"
        data-theme="light"
        suppressHydrationWarning
        className={`${caprasimo.variable} ${figtree.variable}`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
