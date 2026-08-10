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
 * Sets `data-theme` and `data-palette` before first paint.
 *
 * Both live on the html element, so React can't set them without a flash: the
 * server has no way to know the stored preference, and by the time an effect
 * runs the ground has already been painted — in the wrong palette, which is a
 * far louder flash than the wrong mode. This runs synchronously in head, ahead
 * of the first paint, which is the only place it can run.
 *
 * No stored theme falls through to the OS setting rather than to light. No
 * stored palette falls through to Ember, because there is no OS signal for it
 * and Ember is the house palette (lib/design/palettes.ts).
 */
const APPEARANCE_BOOTSTRAP = `(function(){var d=document.documentElement;try{
var t=localStorage.getItem("roleform-theme");
if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
var p=localStorage.getItem("roleform-palette");
if(["ember","ink","harbour","orchard","dusk","pine"].indexOf(p)<0)p="ember";
d.dataset.theme=t;d.dataset.palette=p;
}catch(e){d.dataset.theme="light";d.dataset.palette="ember"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {/* The bootstrap script mutates data-theme and data-palette before
          hydration, which React would otherwise report as a server/client
          mismatch on this element. */}
      <html
        lang="en"
        data-theme="light"
        data-palette="ember"
        suppressHydrationWarning
        className={`${caprasimo.variable} ${figtree.variable}`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
