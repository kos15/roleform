import type { Metadata, Viewport } from "next";
import { Anton, Figtree } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AgentTools } from "@/components/agent-tools";
import { PwaRegister } from "@/components/pwa-register";
import { INTRO_SCRIPT } from "@/components/landing-intro";
import { RoleformGuide } from "@/components/roleform-guide";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/seo/site";
import { ICON_VERSION } from "@/lib/seo/icons";

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

/**
 * Site-wide search and share metadata. Pages set their own title (joined by
 * the template), description and canonical; everything else inherits. The
 * values come from lib/seo/site so JSON-LD, llms.txt and these tags agree.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "Career",
  keywords: [
    "tailor resume to job description",
    "ATS friendly resume",
    "resume templates",
    "resume keywords",
    "AI resume builder",
    "interview questions from job description",
    "skill gap analysis",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  alternates: {
    canonical: "/",
    types: { "text/markdown": "/index.md", "text/plain": "/llms.txt" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  formatDetection: { telephone: false },
  // F29: installable on iPhone. iOS ignores the manifest's icons and reads
  // apple-touch-icon instead, and only a Home Screen app can receive pushes.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  // `?v=` busts the icon caches phones keep from the moment a site is added to
  // the Home Screen; bump ICON_VERSION whenever the mark changes. PNG and ICO
  // sit beside the SVG because launchers that fall back to a page's favicon
  // (Android shortcuts, older iOS) cannot use an SVG.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: `/icons/favicon-32.png?v=${ICON_VERSION}`, type: "image/png", sizes: "32x32" },
      { url: `/icons/icon-192.png?v=${ICON_VERSION}`, type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: `/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: "180x180", type: "image/png" }],
  },
  // Search Console / Bing Webmaster ownership, set per deployment.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

// viewport-fit=cover lets the installed app paint under the iPhone notch and
// home indicator; the bottom tab bar already pads by env(safe-area-inset-*).
export const viewport: Viewport = { themeColor: "#f8f0e3", viewportFit: "cover" };

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
      {/* The head script may set data-intro on <html> before hydration, so
          React is told not to expect the server's attributes there. */}
      <html lang="en" className={`${anton.variable} ${figtree.variable}`} suppressHydrationWarning>
        <head>
          {/* Decides the landing intro before first paint (landing-intro.tsx). */}
          <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        </head>
        <body>
          {children}
          <AgentTools />
          <PwaRegister />
          <RoleformGuide />
        </body>
      </html>
    </ClerkProvider>
  );
}
