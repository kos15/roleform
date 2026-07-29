import * as React from "react";
import { cn } from "@/lib/utils";
import type { AtsRating } from "@/lib/domain/types";

/**
 * Thin wrappers over the DS classes in globals.css (CLAUDE.md §9).
 *
 * These add no colours, radii or shadows of their own — every value comes from
 * an organic token (N9). If a component here needs a new visual, the token goes
 * in globals.css first.
 */

export function Button({
  variant = "primary",
  size,
  busy,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm";
  /** Server-side work is under way. Drives the breathe animation, nothing else. */
  busy?: boolean;
}) {
  return (
    <button
      data-busy={busy ? "true" : undefined}
      aria-busy={busy || undefined}
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
      {...props}
    />
  );
}

/**
 * A placeholder with the shape of the thing that is coming.
 *
 * Used by the route-level loading boundaries. Deliberately shaped like the real
 * layout rather than a generic spinner — the page stops moving when the content
 * lands, instead of being replaced by something a different size.
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden style={style} className={cn("skeleton", className)} />;
}

export function Card({ className, flat, ...props }: React.HTMLAttributes<HTMLDivElement> & { flat?: boolean }) {
  return <div className={cn("card", flat && "card-flat", className)} {...props} />;
}

export function Tag({
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "accent" | "sage" | "warn" | "muted";
}) {
  return (
    <span
      className={cn("tag", tone !== "default" && `tag-${tone}`, className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input", className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.isValidElement<{ id?: string }>(children)
        ? React.cloneElement(children, { id })
        : children}
    </div>
  );
}

/** F2: errors render inline, never as a toast. */
export function ErrorRegion({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="error-region" role="alert">
      <strong className="block font-semibold">{title}</strong>
      {children ? <span className="text-sm">{children}</span> : null}
    </div>
  );
}

/**
 * The ATS badge (N5). Takes a rating that was COMPUTED — this component has no
 * opinion and no way to express one.
 */
export function AtsBadge({ rating }: { rating: AtsRating }) {
  const tone = rating === "High" ? "sage" : rating === "Medium" ? "warn" : "muted";
  return (
    <Tag tone={tone} title="How reliably applicant tracking systems parse this layout">
      ATS {rating}
    </Tag>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2>{children}</h2>
      {sub ? <p className="mt-1 text-[var(--color-text-muted)]">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card flat className="text-center">
      <h3 className="mb-2">{title}</h3>
      {children ? <p className="text-[var(--color-text-muted)]">{children}</p> : null}
    </Card>
  );
}
