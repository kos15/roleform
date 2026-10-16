"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { SignOutButton } from "@clerk/nextjs";
import { updateAccountName } from "@/app/actions/account";
import { Button, ErrorRegion } from "@/components/ui";

/**
 * The name the account is missing (F33.1). Not dismissible — no close button,
 * Escape and outside clicks do nothing — because the point is that every
 * account ends up with one. Signing out is the only other way off it.
 */
export function NameRequiredDialog() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAccountName({ firstName: first, lastName: last });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overflow-auto bg-[color-mix(in_srgb,#101010_52%,transparent)] p-5 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog pop-in fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(30rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-2 text-[clamp(1.3rem,3.2vw,1.6rem)] leading-[1.18]">
            What should we call you?
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
            Your account needs a name before you carry on. It stays on your account and isn&rsquo;t
            printed on any résumé — the name on your résumé is edited in your profile.
          </Dialog.Description>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="field text-xs">
              <span>First name</span>
              <input
                className="input"
                value={first}
                maxLength={60}
                required
                autoFocus
                autoComplete="given-name"
                onChange={(e) => setFirst(e.target.value)}
              />
            </label>
            <label className="field text-xs">
              <span>Last name</span>
              <input
                className="input"
                value={last}
                maxLength={60}
                autoComplete="family-name"
                onChange={(e) => setLast(e.target.value)}
              />
            </label>
            {error ? <ErrorRegion title="That didn't save">{error}</ErrorRegion> : null}
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <Button type="submit" busy={pending} disabled={pending || !first.trim()}>
                Save and continue
              </Button>
              <SignOutButton>
                <Button type="button" variant="ghost">
                  Sign out
                </Button>
              </SignOutButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
