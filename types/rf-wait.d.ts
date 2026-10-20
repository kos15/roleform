import type * as React from "react";

/** `<rf-wait>` — see components/rf-wait/rf-wait.js. Every attribute is a string. */
type RfWaitAttributes = {
  open?: string;
  kind?: "galaxy" | "papers" | "blobs" | "dots";
  tone?: "dark";
  eyebrow?: string;
  lines?: string;
  stage?: string;
  state?: "working" | "done" | "error";
  sub?: string;
  still?: string;
  long?: string;
  done?: string;
  error?: string;
  run?: string;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "rf-wait": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & RfWaitAttributes;
    }
  }
}
