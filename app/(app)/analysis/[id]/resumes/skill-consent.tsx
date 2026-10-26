"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorRegion, Tag } from "@/components/ui";
import { rebuildWithConfirmedSkills } from "@/app/actions/analysis";
import type { UnlistedSkill } from "@/lib/domain/skill-consent";

/**
 * Skills the posting names that the profile never listed — offered, never
 * added. The drafts above were built only from what the profile states, so a
 * skill the member has but never wrote down is missing from every one of them.
 *
 * Nothing is ticked by default. Each box is the member's own claim, and the
 * copy says plainly what a tick means: it goes on the profile, the drafts are
 * rebuilt with it, and they should expect an interviewer to ask about it.
 */
export function SkillConsent({ analysisId, skills }: { analysisId: string; skills: UnlistedSkill[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rebuild() {
    setBusy(true);
    setError(null);
    try {
      const result = await rebuildWithConfirmedSkills(analysisId, picked);
      if (!result.ok) {
        setError(result.error.message);
        setBusy(false);
        return;
      }
      // The run's own screen picks up the rebuild: matching and rewriting run
      // again, everything else is kept.
      router.push(`/analysis/${analysisId}`);
    } catch {
      setError("We couldn’t reach Roleform. Check your connection and try again.");
      setBusy(false);
    }
  }

  const toggle = (name: string, on: boolean) =>
    setPicked((cur) => (on ? [...cur, name] : cur.filter((n) => n !== name)));

  return (
    <Card flat className="mb-9">
      <p className="eyebrow mb-2">Missing from your drafts</p>
      <h3 className="mb-2">This posting names {skills.length === 1 ? "a skill" : "skills"} your profile doesn&rsquo;t list</h3>
      <p className="mb-5 max-w-[68ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
        We only write what your profile says, so these are left out of every draft. If you have one
        and never wrote it down, tick it: it is added to your profile&rsquo;s Skills section and the
        drafts are rebuilt with it. Leave the rest — the Learning tab shows how to close them.
      </p>

      <fieldset disabled={busy}>
        <legend className="sr-only">Skills you can back up</legend>
        <ul className="mb-5 flex flex-wrap gap-2.5">
          {skills.map((s) => {
            const on = picked.includes(s.skillName);
            return (
              <li key={s.skillName}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-text)] px-3.5 py-1.5 text-[15px] font-semibold has-[:checked]:bg-[var(--color-accent-200)]">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggle(s.skillName, e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-text)]"
                  />
                  {s.skillName}
                  {s.necessity === "required" ? <Tag tone="ink">Required</Tag> : null}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <p className="note mb-4 text-sm">
        Tick only what you can back up in an interview. We list the skill and may name it in your
        summary; we never invent a job, a project or a number for it. Your match counts it as
        listed but not yet shown in a bullet. Rebuilding rewrites the drafts and is billed like that
        stage of a run; Prep and Learning stay as they are.
      </p>

      {error ? (
        <div className="mb-4">
          <ErrorRegion title="Couldn't rebuild">{error}</ErrorRegion>
        </div>
      ) : null}

      <Button onClick={rebuild} busy={busy} disabled={busy || picked.length === 0}>
        {picked.length === 0
          ? "Tick the skills you have"
          : `Add ${picked.length} to my profile and rebuild`}
      </Button>
    </Card>
  );
}
