"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from "lucide-react";
import { Button, Input, Tag, Textarea } from "@/components/ui";
import { updateProfile } from "@/app/actions/onboarding";
import { profileStrength } from "@/lib/domain/profile-strength";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/**
 * F11 — the profile.
 *
 * One screen over the whole corpus, because the corpus is one thing: every
 * section here is something a tailored résumé is allowed to draw on, and
 * nothing else is. The AI layer never writes to any of it (N3) — that is what
 * makes the fabrication guard meaningful, since the source of truth is a
 * document this person typed.
 *
 * The recurring element is the evidence label. Every bullet and every skill
 * says how often it has actually been cited by a draft, counted from
 * `tailored_bullets`. It is the most useful thing this page can tell someone:
 * a bullet at zero is either badly written or about work nobody is hiring for,
 * and either way it is the next thing to fix.
 */

const LEVELS = ["Basic", "Working", "Deep"] as const;
type Level = (typeof LEVELS)[number];

interface Props {
  initial: StoredResume;
  /** "work.0.highlights.1" → times cited by a draft. */
  evidenceByPath: Record<string, number>;
  /** Skills recent postings asked for that this profile doesn't list. */
  suggestions: string[];
  bulletCount: number;
  sourceFilename: string | null;
  updatedAt: string;
  /** The token meter (F19), rendered server-side and slotted in at the top. */
  tokenPanel: React.ReactNode;
}

export function ProfileEditor({
  initial,
  evidenceByPath,
  suggestions,
  bulletCount,
  sourceFilename,
  updatedAt,
  tokenPanel,
}: Props) {
  const [resume, setResume] = useState<StoredResume>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openRole, setOpenRole] = useState<number | null>(0);
  const [newSkill, setNewSkill] = useState("");
  // Open by default. Collapsed is for someone who has read their skills and is
  // here for something else — it is not the state you should have to leave.
  const [skillsOpen, setSkillsOpen] = useState(true);
  const firstRender = useRef(true);

  // Autosave. The explicit Save button below forces the same call rather than
  // being a second mechanism — two ways to persist one document is how you get
  // two versions of it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("saving");
    const timer = setTimeout(() => void save(resume), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  async function save(next: StoredResume) {
    const result = await updateProfile(next);
    setStatus(result.ok ? "saved" : "error");
  }

  const patch = (fn: (r: StoredResume) => StoredResume) => setResume((r) => fn(r));

  /* ------------------------------------------------------------ derived */

  const bulletTexts = useMemo(
    () => [
      ...resume.work.flatMap((w) => w.highlights),
      ...resume.projects.flatMap((p) => p.highlights),
      ...resume.volunteer.flatMap((v) => v.highlights),
    ],
    [resume],
  );

  const provenBullets = useMemo(
    () => Object.values(evidenceByPath).filter((n) => n > 0).length,
    [evidenceByPath],
  );

  const strength = useMemo(
    () =>
      profileStrength({
        bulletTexts,
        bulletsUsedAsEvidence: provenBullets,
        summary: resume.basics.summary,
        skillsWithLevel: resume.skills.filter((s) => s.level.trim().length > 0).length,
        skillCount: resume.skills.length,
        roleCount: resume.work.length,
        hasLinks: Boolean(resume.basics.url) || resume.basics.profiles.length > 0,
      }),
    [bulletTexts, provenBullets, resume],
  );

  const skillYears = resume.x_roleform?.skillYears ?? {};
  const preferences = resume.x_roleform?.preferences ?? {
    targetTitles: "",
    workMode: "",
    noticePeriod: "",
    expectedRange: "",
  };

  function setExtension(fn: (ext: NonNullable<StoredResume["x_roleform"]>) => NonNullable<StoredResume["x_roleform"]>) {
    patch((r) => ({
      ...r,
      x_roleform: fn(
        r.x_roleform ?? {
          schemaVersion: 1,
          bulletIds: {},
          sensitivity: { hidePhone: false, hideAddress: true },
        },
      ),
    }));
  }

  /* -------------------------------------------------------------- render */

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-[min(300px,100%)] flex-1 basis-[560px] flex-col gap-4">
        {tokenPanel}

        <IdentitySection
          resume={resume}
          patch={patch}
          sourceFilename={sourceFilename}
          updatedAt={updatedAt}
          bulletCount={bulletCount}
        />

        <Section title="Summary" sub="Rewritten per posting — this is the version we start from.">
          <Textarea
            aria-label="Professional summary"
            className="min-h-[120px] leading-[1.62]"
            value={resume.basics.summary}
            onChange={(e) =>
              patch((r) => ({ ...r, basics: { ...r.basics, summary: e.target.value } }))
            }
          />
          <div className="mt-2 text-xs text-[var(--color-text-muted)]">
            {resume.basics.summary.length} characters · aim for 200–400
          </div>
        </Section>

        <Section
          title="Skills"
          badge={`${resume.skills.length} skill${resume.skills.length === 1 ? "" : "s"}`}
          collapsed={!skillsOpen}
          onToggle={() => setSkillsOpen((o) => !o)}
          aside="Proficiency bounds what a draft is allowed to claim"
        >
          {/* Collapsed: the same list as one scannable row. The colour is the
              evidence, not the level — a skill nothing backs reads muted here
              for the same reason its row says so when open. */}
          {!skillsOpen ? (
            <div className="rise-in flex flex-wrap gap-1.5">
              {resume.skills.map((skill, si) => {
                const evidenced = skillEvidence(skill.name, resume, evidenceByPath).evidencing > 0;
                return (
                  <span
                    key={`${skill.name}-${si}`}
                    className="rounded-[var(--radius-pill)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1 text-xs"
                    style={{
                      color: evidenced ? "var(--color-sage-700)" : "var(--color-text-muted)",
                    }}
                  >
                    {skill.name}
                  </span>
                );
              })}
              {resume.skills.length === 0 ? (
                <Empty>Nothing here yet.</Empty>
              ) : null}
            </div>
          ) : null}

          {skillsOpen ? (
          <>
          <div className="flex flex-col gap-2">
            {resume.skills.map((skill, si) => (
              <div
                key={`${skill.name}-${si}`}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <div className="text-[0.9rem] font-semibold">{skill.name}</div>
                  <SkillEvidence name={skill.name} resume={resume} evidence={evidenceByPath} />
                </div>

                <div className="seg flex-none">
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-selected={normaliseLevel(skill.level) === level}
                      onClick={() =>
                        patch((r) => ({
                          ...r,
                          skills: r.skills.map((s, j) =>
                            j === si ? { ...s, level } : s,
                          ),
                        }))
                      }
                      className="text-xs"
                    >
                      {level}
                    </button>
                  ))}
                </div>

                <div className="flex flex-none items-center gap-1.5">
                  <span className="field-inline w-[56px]">
                    <Input
                      aria-label={`Years of ${skill.name}`}
                      inputMode="numeric"
                      className="input-inline px-2 py-1.5 text-center text-[0.8rem]"
                      value={skillYears[skill.name] ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setExtension((ext) => ({
                          ...ext,
                          skillYears: {
                            ...(ext.skillYears ?? {}),
                            [skill.name]: Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : 0,
                          },
                        }));
                      }}
                    />
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">yrs</span>
                </div>

                <button
                  type="button"
                  title={`Remove ${skill.name}`}
                  aria-label={`Remove ${skill.name}`}
                  onClick={() =>
                    patch((r) => ({ ...r, skills: r.skills.filter((_, j) => j !== si) }))
                  }
                  className="ml-auto grid h-7 w-7 flex-none place-items-center rounded-[var(--radius-pill)] border border-[var(--color-line)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-800)]"
                >
                  <X className="lucide h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
            <div className="eyebrow mb-2.5">Suggested from your recent analyses</div>
            {suggestions.length === 0 ? (
              <p className="text-[0.8rem] leading-snug text-[var(--color-sage-700)]">
                Every gap from your recent analyses is already on your profile. Add evidence to a
                bullet next — a skill on its own is a claim, not proof.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {suggestions
                .filter((name) => !resume.skills.some((s) => s.name === name))
                .map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => patch((r) => addSkill(r, name))}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-dashed border-[var(--color-accent-400)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-accent-700)] transition-colors hover:bg-[var(--color-accent-100)]"
                  >
                    <Plus className="lucide h-3 w-3" />
                    {name}
                  </button>
                ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newSkill.trim();
                  if (!name) return;
                  patch((r) => addSkill(r, name));
                  setNewSkill("");
                }}
              >
                <Input
                  aria-label="Add a skill"
                  placeholder="Add your own…"
                  className="w-[170px] px-3 py-1.5 text-xs"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                />
              </form>
            </div>
          </div>
          </>
          ) : null}
        </Section>

        <Section
          title="Experience"
          aside={`${bulletCount} bullets in the corpus`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                patch((r) => ({
                  ...r,
                  work: [
                    ...r.work,
                    {
                      name: "",
                      position: "",
                      location: "",
                      // A blank date fails the YYYY-MM guard on save, so a new
                      // role starts at this month rather than at "": the row is
                      // saveable the moment it exists, and the member edits a
                      // wrong date rather than hunting an invalid one.
                      startDate: thisMonth(),
                      endDate: null,
                      summary: "",
                      highlights: [],
                    },
                  ],
                }));
                setOpenRole(resume.work.length);
              }}
            >
              <Plus className="lucide h-4 w-4" /> Add a role
            </Button>
          }
        >
          <div className="flex flex-col gap-2.5">
            {resume.work.map((work, wi) => {
              const open = openRole === wi;
              return (
                <div
                  key={wi}
                  className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)]"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenRole(open ? null : wi)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.95rem] font-semibold">{work.position}</span>
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {[work.name, work.location, period(work.startDate, work.endDate)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronDown
                      className="lucide h-4 w-4 flex-none text-[var(--color-text-muted)] transition-transform duration-200"
                      style={{ transform: open ? "rotate(180deg)" : undefined }}
                    />
                  </button>

                  {open ? (
                    <div className="rise-in px-4 pb-4">
                      <div className="mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
                        <Labelled label="Title">
                          <Input
                            value={work.position}
                            onChange={(e) => patchWork(patch, wi, { position: e.target.value })}
                          />
                        </Labelled>
                        <Labelled label="Company">
                          <Input
                            value={work.name}
                            onChange={(e) => patchWork(patch, wi, { name: e.target.value })}
                          />
                        </Labelled>
                        <Labelled label="Started">
                          {/* Guarded for the same reason as the education
                              dates: this autosaves per keystroke, and "20" on
                              the way to "2021" is not a date the schema
                              accepts. */}
                          <DateInput
                            value={work.startDate}
                            onCommit={(next) =>
                              patchWork(patch, wi, { startDate: next ?? thisMonth() })
                            }
                          />
                        </Labelled>
                        <Labelled label="Ended">
                          <DateInput
                            value={work.endDate}
                            onCommit={(next) => patchWork(patch, wi, { endDate: next })}
                          />
                        </Labelled>
                        <Labelled label="Location">
                          <Input
                            value={work.location}
                            onChange={(e) => patchWork(patch, wi, { location: e.target.value })}
                          />
                        </Labelled>
                      </div>

                      <div className="eyebrow mb-2">Bullets</div>
                      <div className="flex flex-col gap-2.5">
                        {work.highlights.map((highlight, hi) => (
                          <div key={hi} className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <Textarea
                                aria-label={`Bullet ${hi + 1}`}
                                rows={2}
                                className="text-[0.85rem] leading-[1.6]"
                                value={highlight}
                                onChange={(e) =>
                                  patchHighlights(patch, wi, (hs) =>
                                    hs.map((h, j) => (j === hi ? e.target.value : h)),
                                  )
                                }
                              />
                              <EvidenceLabel
                                count={evidenceByPath[`work.${wi}.highlights.${hi}`] ?? 0}
                              />
                            </div>
                            <div className="flex flex-none flex-col gap-1">
                              <IconButton
                                label="Move bullet up"
                                disabled={hi === 0}
                                onClick={() =>
                                  patchHighlights(patch, wi, (hs) => swap(hs, hi, hi - 1))
                                }
                              >
                                <ArrowUp className="lucide h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton
                                label="Move bullet down"
                                disabled={hi === work.highlights.length - 1}
                                onClick={() =>
                                  patchHighlights(patch, wi, (hs) => swap(hs, hi, hi + 1))
                                }
                              >
                                <ArrowDown className="lucide h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton
                                label="Remove bullet"
                                onClick={() =>
                                  patchHighlights(patch, wi, (hs) =>
                                    hs.filter((_, j) => j !== hi),
                                  )
                                }
                              >
                                <X className="lucide h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() => patchHighlights(patch, wi, (hs) => [...hs, ""])}
                      >
                        <Plus className="lucide h-4 w-4" /> Add a bullet
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>

        {/* items-start so a card with nothing in it stays the height of its
            content instead of stretching to match a full neighbour. */}
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {/* Education and certifications are editable here, as in the design.
              They were read-only cards, which made the corpus's own rule —
              everything a draft can say has to exist here first — impossible to
              act on for two of the sections it applies to. */}
          <Section title="Education" compact>
            <div className="flex flex-col gap-3">
              {resume.education.map((edu, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                      Entry {i + 1}
                    </span>
                    <IconButton
                      label="Remove this education entry"
                      onClick={() =>
                        patch((r) => ({
                          ...r,
                          education: r.education.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      <X className="lucide h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <Labelled label="Degree">
                    <Input
                      placeholder="B.E."
                      value={edu.studyType}
                      onChange={(e) => patchEducation(patch, i, { studyType: e.target.value })}
                    />
                  </Labelled>
                  <Labelled label="Field of study">
                    <Input
                      placeholder="Computer Science"
                      value={edu.area}
                      onChange={(e) => patchEducation(patch, i, { area: e.target.value })}
                    />
                  </Labelled>
                  <Labelled label="Institution">
                    <Input
                      value={edu.institution}
                      onChange={(e) => patchEducation(patch, i, { institution: e.target.value })}
                    />
                  </Labelled>
                  <Labelled label="Graduated">
                    <DateInput
                      value={edu.endDate}
                      onCommit={(next) => patchEducation(patch, i, { endDate: next })}
                    />
                  </Labelled>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() =>
                patch((r) => ({
                  ...r,
                  education: [
                    ...r.education,
                    {
                      institution: "",
                      area: "",
                      studyType: "",
                      startDate: null,
                      endDate: null,
                      score: "",
                      courses: [],
                    },
                  ],
                }))
              }
            >
              <Plus className="lucide h-4 w-4" /> Add education
            </Button>
          </Section>

          <Section title="Certifications" compact>
            <div className="flex flex-col gap-3">
              {resume.certificates.map((cert, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                      Entry {i + 1}
                    </span>
                    <IconButton
                      label="Remove this certification"
                      onClick={() =>
                        patch((r) => ({
                          ...r,
                          certificates: r.certificates.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      <X className="lucide h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <Labelled label="Name">
                    <Input
                      value={cert.name}
                      onChange={(e) => patchCertificate(patch, i, { name: e.target.value })}
                    />
                  </Labelled>
                  <Labelled label="Issuer">
                    <Input
                      value={cert.issuer}
                      onChange={(e) => patchCertificate(patch, i, { issuer: e.target.value })}
                    />
                  </Labelled>
                  <Labelled label="Issued">
                    <DateInput
                      value={cert.date}
                      onCommit={(next) => patchCertificate(patch, i, { date: next })}
                    />
                  </Labelled>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() =>
                patch((r) => ({
                  ...r,
                  certificates: [
                    ...r.certificates,
                    { name: "", issuer: "", date: null, url: "" },
                  ],
                }))
              }
            >
              <Plus className="lucide h-4 w-4" /> Add a certification
            </Button>
          </Section>

          <Section title="Languages" compact>
            {resume.languages.length === 0 ? (
              <Empty>Nothing here yet.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {resume.languages.map((lang, i) => (
                  <div
                    key={i}
                    className="flex justify-between gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-2.5 text-[0.85rem]"
                  >
                    <span className="font-semibold">{lang.language}</span>
                    <span className="text-[var(--color-text-muted)]">{lang.fluency || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="What you're looking for"
            compact
            sub="Recorded for you. Nothing in the pipeline reads this yet, so it won't change a draft."
          >
            <div className="flex flex-col gap-3">
              <Labelled label="Target titles">
                <Input
                  value={preferences.targetTitles}
                  onChange={(e) =>
                    setExtension((ext) => ({
                      ...ext,
                      preferences: { ...preferences, targetTitles: e.target.value },
                    }))
                  }
                />
              </Labelled>
              <Labelled label="Work mode">
                <Input
                  value={preferences.workMode}
                  onChange={(e) =>
                    setExtension((ext) => ({
                      ...ext,
                      preferences: { ...preferences, workMode: e.target.value },
                    }))
                  }
                />
              </Labelled>
              <Labelled label="Notice period">
                <Input
                  value={preferences.noticePeriod}
                  onChange={(e) =>
                    setExtension((ext) => ({
                      ...ext,
                      preferences: { ...preferences, noticePeriod: e.target.value },
                    }))
                  }
                />
              </Labelled>
              <Labelled label="Expected range">
                <Input
                  value={preferences.expectedRange}
                  onChange={(e) =>
                    setExtension((ext) => ({
                      ...ext,
                      preferences: { ...preferences, expectedRange: e.target.value },
                    }))
                  }
                />
              </Labelled>
            </div>
          </Section>
        </div>
      </div>

      {/* ------------------------------------------------------------ aside */}

      <aside className="flex min-w-[min(262px,100%)] max-w-[330px] flex-1 basis-[280px] flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-5 text-center">
          <StrengthRing score={strength.score} />
          <p className="text-left text-[0.8rem] leading-relaxed text-[var(--color-text-muted)]">
            Strength is how much of a posting we can actually evidence — not how full the form
            looks. Numbers in bullets move it most.
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] p-[1.125rem]">
          <div className="eyebrow mb-3">What&rsquo;s helping, what&rsquo;s missing</div>
          <div className="flex flex-col gap-2.5">
            {strength.checks.map((check) => (
              <div key={check.label} className="flex items-start gap-2.5 text-[0.8rem] leading-snug">
                <span
                  aria-hidden
                  className="mt-px grid h-[18px] w-[18px] flex-none place-items-center rounded-[var(--radius-pill)] text-[10px] font-bold"
                  style={{
                    background: check.done
                      ? "var(--color-sage-100)"
                      : "var(--color-accent-100)",
                    color: check.done ? "var(--color-sage-800)" : "var(--color-accent-800)",
                  }}
                >
                  {check.done ? "✓" : "—"}
                </span>
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]"
          aria-live="polite"
        >
          <Button
            busy={status === "saving"}
            onClick={() => {
              setStatus("saving");
              void save(resume);
            }}
          >
            Save profile
          </Button>
          <Link href="/analyze" className="btn btn-ghost no-underline">
            New analysis
          </Link>
          <span className="w-full text-xs">
            {status === "saving" && "Saving…"}
            {status === "saved" && "All changes saved"}
            {status === "idle" && "Changes save as you type"}
            {status === "error" && (
              <span className="text-[var(--color-danger-700)]">That change didn&rsquo;t save</span>
            )}
          </span>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------- sections */

function IdentitySection({
  resume,
  patch,
  sourceFilename,
  updatedAt,
  bulletCount,
}: {
  resume: StoredResume;
  patch: (fn: (r: StoredResume) => StoredResume) => void;
  sourceFilename: string | null;
  updatedAt: string;
  bulletCount: number;
}) {
  const basics = resume.basics;
  const github = basics.profiles.find((p) => /github/i.test(p.network));
  const linkedin = basics.profiles.find((p) => /linkedin/i.test(p.network));

  const setBasics = (next: Partial<typeof basics>) =>
    patch((r) => ({ ...r, basics: { ...r.basics, ...next } }));

  const setNetwork = (network: string, url: string) =>
    patch((r) => {
      const rest = r.basics.profiles.filter((p) => !new RegExp(network, "i").test(p.network));
      const next = url.trim()
        ? [...rest, { network, username: url.split("/").filter(Boolean).pop() ?? "", url }]
        : rest;
      return { ...r, basics: { ...r.basics, profiles: next } };
    });

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] p-[clamp(1.125rem,3vw,1.5rem)]">
      {/* The design's identity row is avatar + text; ours carries a third
          element, and without a basis on the text it was the text that gave way
          — 130px of column beside a button that won't shrink. It wraps now. */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <span className="grid h-[60px] w-[60px] flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--color-sage-600)] display text-[1.375rem] text-[var(--color-bg)]">
          {initialsOf(basics.name)}
        </span>
        <div className="min-w-[min(15rem,100%)] flex-1">
          <h3 className="mb-1">Identity &amp; contact</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            {sourceFilename ? `Parsed from ${sourceFilename}` : "Entered by hand"} · {bulletCount}{" "}
            bullets · last saved {relativeTime(updatedAt)}
          </p>
        </div>
        <Link href="/onboarding" className="btn btn-secondary btn-sm ml-auto no-underline">
          Replace résumé
        </Link>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        <Labelled label="Full name">
          <Input value={basics.name} onChange={(e) => setBasics({ name: e.target.value })} />
        </Labelled>
        <Labelled label="Headline">
          <Input
            placeholder="Senior Frontend Engineer"
            value={basics.label}
            onChange={(e) => setBasics({ label: e.target.value })}
          />
        </Labelled>
        <Labelled label="City">
          <Input
            value={basics.location.city}
            onChange={(e) =>
              patch((r) => ({
                ...r,
                basics: { ...r.basics, location: { ...r.basics.location, city: e.target.value } },
              }))
            }
          />
        </Labelled>
        <Labelled label="Region or country">
          <Input
            value={basics.location.region}
            onChange={(e) =>
              patch((r) => ({
                ...r,
                basics: { ...r.basics, location: { ...r.basics.location, region: e.target.value } },
              }))
            }
          />
        </Labelled>
        <Labelled label="Email">
          <Input value={basics.email} onChange={(e) => setBasics({ email: e.target.value })} />
        </Labelled>
        <Labelled label="Phone">
          <Input value={basics.phone} onChange={(e) => setBasics({ phone: e.target.value })} />
        </Labelled>
        <Labelled label="GitHub">
          <Input
            placeholder="github.com/you"
            value={github?.url ?? ""}
            onChange={(e) => setNetwork("GitHub", e.target.value)}
          />
        </Labelled>
        <Labelled label="LinkedIn">
          <Input
            placeholder="linkedin.com/in/you"
            value={linkedin?.url ?? ""}
            onChange={(e) => setNetwork("LinkedIn", e.target.value)}
          />
        </Labelled>
        <Labelled label="Website or portfolio">
          <Input
            placeholder="yoursite.com"
            value={basics.url}
            onChange={(e) => setBasics({ url: e.target.value })}
          />
        </Labelled>
      </div>
    </section>
  );
}

function Section({
  title,
  sub,
  aside,
  action,
  badge,
  collapsed,
  onToggle,
  compact,
  children,
}: {
  title: string;
  sub?: string;
  aside?: string;
  /** A control that belongs to the whole section, e.g. "Add a role". */
  action?: React.ReactNode;
  /** A count beside the heading. Only meaningful on a collapsible section. */
  badge?: string;
  /** Present ⇒ the heading is a disclosure button. */
  collapsed?: boolean;
  onToggle?: () => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const heading = onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex items-center gap-2.5 text-left"
    >
      <h3>{title}</h3>
      {badge ? <Tag tone="muted">{badge}</Tag> : null}
      <ChevronDown
        className="lucide h-4 w-4 flex-none text-[var(--color-text-muted)] transition-transform duration-200"
        style={{ transform: collapsed ? undefined : "rotate(180deg)" }}
      />
    </button>
  ) : (
    <h3>{title}</h3>
  );

  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-raised)] ${
        compact ? "p-[clamp(1.125rem,3vw,1.375rem)]" : "p-[clamp(1.125rem,3vw,1.5rem)]"
      }`}
    >
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2.5">
        {heading}
        {aside ? (
          <span className="text-xs text-[var(--color-text-muted)]">{aside}</span>
        ) : null}
        {action}
      </div>
      {sub ? <p className="-mt-2 mb-3 text-xs text-[var(--color-text-muted)]">{sub}</p> : null}
      {children}
    </section>
  );
}

function StrengthRing({ score }: { score: number }) {
  const CIRCUMFERENCE = 264; // 2πr for r = 42
  return (
    <div className="relative mx-auto mb-3.5 h-[132px] w-[132px]">
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
        <circle cx="66" cy="66" r="42" fill="none" stroke="var(--color-bg-sunken)" strokeWidth="11" />
        <circle
          cx="66"
          cy="66"
          r="42"
          fill="none"
          stroke="var(--color-sage-600)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${((score / 100) * CIRCUMFERENCE).toFixed(0)} ${CIRCUMFERENCE}`}
          transform="rotate(-90 66 66)"
          style={{ transition: "stroke-dasharray 600ms var(--ease-out-quint)" }}
        />
      </svg>
      {/* The caption has to fit the hole, not the box: the ring's inner
          diameter is ~73px, and at 10.5px "profile strength" runs wider than
          that and clips against the stroke. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display text-[1.75rem] leading-none">
          {score}
        </span>
        <span className="max-w-[72px] text-center text-[9px] leading-tight text-[var(--color-text-muted)]">
          profile strength
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function EvidenceLabel({ count }: { count: number }) {
  return (
    <div
      className="mt-1 text-[11.5px]"
      style={{ color: count > 0 ? "var(--color-sage-700)" : "var(--color-text-muted)" }}
    >
      {count > 0 ? `Used as evidence ${count}×` : "Not yet used as evidence"}
    </div>
  );
}

/**
 * A skill's evidence is its bullets' evidence. A skill named on the profile
 * with no cited bullet behind it is a claim, and the label says so rather than
 * counting the skill row itself — which would only measure that you typed it.
 *
 * Reported as a count of BULLETS, not a sum of their uses. Adding the per-
 * bullet numbers up would count one analysis once for every bullet it cited,
 * and produce a figure that sounds like a tally of postings but isn't one.
 */
function skillEvidence(
  name: string,
  resume: StoredResume,
  evidence: Record<string, number>,
): { evidencing: number; mentioning: number; label: string } {
  const needle = name.toLowerCase();
  let evidencing = 0;
  let mentioning = 0;

  const scan = (highlights: string[], prefix: string) =>
    highlights.forEach((h, hi) => {
      if (!h.toLowerCase().includes(needle)) return;
      mentioning += 1;
      if ((evidence[`${prefix}.highlights.${hi}`] ?? 0) > 0) evidencing += 1;
    });

  resume.work.forEach((w, wi) => scan(w.highlights, `work.${wi}`));
  resume.projects.forEach((p, pi) => scan(p.highlights, `projects.${pi}`));

  return {
    evidencing,
    mentioning,
    label:
      evidencing > 0
        ? `${evidencing} of your bullets evidence this`
        : mentioning > 0
          ? `Named in ${mentioning} bullet${mentioning === 1 ? "" : "s"}, none used yet`
          : "No bullet mentions this yet",
  };
}

function SkillEvidence({
  name,
  resume,
  evidence,
}: {
  name: string;
  resume: StoredResume;
  evidence: Record<string, number>;
}) {
  const { evidencing, label } = skillEvidence(name, resume, evidence);
  return (
    <div
      className="text-[11.5px]"
      style={{ color: evidencing > 0 ? "var(--color-sage-700)" : "var(--color-text-muted)" }}
    >
      {label}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-[var(--radius-pill)] border border-[var(--color-line)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-800)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * A YYYY / YYYY-MM field that can be typed in.
 *
 * The stored schema accepts only those two shapes, and the editor autosaves on
 * every keystroke — so a field bound straight to the document rejects the save
 * at "2", "20" and "201" on the way to "2017", and reports it as a save error.
 * This holds what was typed, and commits only when it is a date. Empty commits
 * null, because "not stated" is a real answer.
 */
function DateInput({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (next: string | null) => void;
}) {
  const [raw, setRaw] = useState(value ?? "");
  const committed = useRef(value ?? "");

  // The document can change under us (a save round trip, a sibling removed).
  // Only follow it when it disagrees with what we last sent.
  useEffect(() => {
    const next = value ?? "";
    if (next !== committed.current) {
      committed.current = next;
      setRaw(next);
    }
  }, [value]);

  const valid = raw === "" || /^\d{4}(-\d{2})?$/.test(raw);

  return (
    <>
      <Input
        placeholder="2017 or 2017-06"
        inputMode="numeric"
        aria-invalid={valid ? undefined : true}
        value={raw}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          if (next === "" || /^\d{4}(-\d{2})?$/.test(next)) {
            committed.current = next;
            onCommit(next === "" ? null : next);
          }
        }}
      />
      {valid ? null : (
        <span className="text-[11.5px] text-[var(--color-text-muted)]">
          Year, or year and month — 2017 or 2017-06. Not saved until it is one of those.
        </span>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.8rem] text-[var(--color-text-muted)]">{children}</p>;
}

/* --------------------------------------------------------------- helpers */

function normaliseLevel(level: string): Level | null {
  const l = level.trim().toLowerCase();
  if (l.startsWith("deep") || l.startsWith("expert") || l.startsWith("advanc")) return "Deep";
  if (l.startsWith("work") || l.startsWith("inter") || l.startsWith("prof")) return "Working";
  if (l.length > 0) return "Basic";
  return null;
}

function addSkill(resume: StoredResume, name: string): StoredResume {
  if (resume.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return resume;
  return { ...resume, skills: [...resume.skills, { name, level: "Basic", keywords: [] }] };
}

function patchWork(
  patch: (fn: (r: StoredResume) => StoredResume) => void,
  wi: number,
  next: Partial<StoredResume["work"][number]>,
) {
  patch((r) => ({ ...r, work: r.work.map((w, i) => (i === wi ? { ...w, ...next } : w)) }));
}

function patchEducation(
  patch: (fn: (r: StoredResume) => StoredResume) => void,
  i: number,
  next: Partial<StoredResume["education"][number]>,
) {
  patch((r) => ({
    ...r,
    education: r.education.map((e, j) => (j === i ? { ...e, ...next } : e)),
  }));
}

function patchCertificate(
  patch: (fn: (r: StoredResume) => StoredResume) => void,
  i: number,
  next: Partial<StoredResume["certificates"][number]>,
) {
  patch((r) => ({
    ...r,
    certificates: r.certificates.map((c, j) => (j === i ? { ...c, ...next } : c)),
  }));
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function patchHighlights(
  patch: (fn: (r: StoredResume) => StoredResume) => void,
  wi: number,
  fn: (highlights: string[]) => string[],
) {
  patch((r) => ({
    ...r,
    work: r.work.map((w, i) => (i === wi ? { ...w, highlights: fn(w.highlights) } : w)),
  }));
}

function swap<T>(items: T[], a: number, b: number): T[] {
  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function period(start: string, end: string | null): string {
  if (!start) return "";
  return `${start} – ${end ?? "present"}`;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
