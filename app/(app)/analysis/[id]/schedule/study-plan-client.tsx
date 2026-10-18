"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bell, CalendarPlus, Check, ChevronDown, ChevronUp } from "lucide-react";
import { saveStudyPlan, tickStudySession } from "@/app/actions/study";
import { savePushSubscription } from "@/app/actions/push";
import { useAuth } from "@clerk/nextjs";
import { pushState, registration, rememberDevice, subscribe, type PushState } from "@/lib/push/client";
import {
  ALERT_LABEL,
  DAY_SET_LABEL,
  MAX_DAYS_AHEAD,
  PERSONAS,
  PERSONA_LABEL,
  PERSONA_NOTE,
  STUDY_ALERTS,
  WINDOW_MAX_MIN,
  WINDOW_MIN_MIN,
  WINDOW_STEP_MIN,
  addDays,
  alertLeadMin,
  buildIcs,
  buildSchedule,
  dayLabel,
  fitTips,
  formatClock,
  formatDuration,
  localDate,
  localMinutes,
  nextDaySet,
  orderedTopics,
  personaWindows,
  priorityLabel,
  sittingAlertCopy,
  shortDay,
  sittings,
  type StudyDay,
  type StudySession,
  type StudySettings,
  type StudyTick,
  type StudyTopic,
  type StudyWindow,
} from "@/lib/domain/study-plan";

/**
 * F30 — the study plan (design: "23 Study plan"). Every change re-solves
 * locally at once and is saved a moment later, which also rewrites the
 * plan's pending alerts on the server.
 */

const SAVE_DELAY_MS = 700;

/** Topic colours by the engine's own order (design SP_COLORS). */
const TONES = ["bg-[var(--color-accent-500)]", "bg-[var(--color-sage-500)]", "bg-[var(--color-accent-200)]", "bg-[var(--color-sage-300)]"];
const tone = (i: number) => TONES[i % TONES.length]!;

const CARD = "flex flex-col gap-3.5 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-[22px] py-5";
const RULE = "border-t border-[var(--color-hover)]";
const HOVER_INK = "hover:bg-[var(--color-text)] hover:text-[var(--color-accent-500)]";

const weekdayLong = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const longDay = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export function StudyPlanClient({
  analysisId,
  company,
  title,
  topics,
  uncovered,
  initialSettings,
  initialTicks,
  nextRoundOn,
  serverToday,
  pushReady,
}: {
  analysisId: string;
  company: string | null;
  title: string | null;
  topics: StudyTopic[];
  uncovered: number;
  initialSettings: StudySettings;
  initialTicks: StudyTick[];
  nextRoundOn: string | null;
  serverToday: string;
  pushReady: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [ticks, setTicks] = useState(initialTicks);
  const [today, setToday] = useState(serverToday);
  const [nowMin, setNowMin] = useState<number | undefined>(undefined);
  const [tz, setTz] = useState("UTC");
  const [push, setPush] = useState<PushState | null>(null);
  const { userId } = useAuth();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ when: string; title: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = useRef(false);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const now = new Date();
    setTz(zone);
    setToday(localDate(now, zone));
    setNowMin(localMinutes(now, zone));
    void pushState().then(setPush);
  }, []);

  // Save shortly after the last change; the first render is not a change.
  useEffect(() => {
    if (!dirty.current) return;
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      const res = await saveStudyPlan(analysisId, { settings, timeZone: tz });
      setSaveState(res.ok ? "saved" : "error");
      setError(res.ok ? null : res.error.message);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [settings, tz, analysisId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const change = (next: StudySettings | ((s: StudySettings) => StudySettings)) => {
    dirty.current = true;
    setSettings(next);
  };

  const input = useMemo(
    () => ({ topics, settings, ticks, today, nowMin, fallbackInterviewOn: nextRoundOn }),
    [topics, settings, ticks, today, nowMin, nextRoundOn],
  );
  const plan = useMemo(() => buildSchedule(input), [input]);
  const tips = useMemo(() => fitTips(input, plan), [input, plan]);
  const lead = alertLeadMin(settings.alert);

  /* ------------------------------------------------------------ actions */

  const setWindow = (id: string, patch: (w: StudyWindow) => Partial<StudyWindow>) =>
    change((s) => ({ ...s, windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch(w) } : w)) }));

  const moveTopic = (id: string, by: -1 | 1) =>
    change((s) => {
      const ids = orderedTopics(topics, s.topicOrder).map((t) => t.id);
      const i = ids.indexOf(id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ids.length) return s;
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      return { ...s, topicOrder: ids };
    });

  const toggleTopic = (id: string) =>
    change((s) => ({
      ...s,
      topicsOff: s.topicsOff.includes(id) ? s.topicsOff.filter((x) => x !== id) : [...s.topicsOff, id],
    }));

  const tick = (s: StudySession) => {
    const done = !s.done;
    // Mirrors tickStudySession, so the plan answers before the server does.
    setTicks((prev) => {
      const isToday = (t: StudyTick) => t.stepId === s.stepId && t.doneOn === today;
      if (done) {
        const upToMin = Math.max(s.to, ...prev.filter(isToday).map((t) => t.upToMin));
        return [...prev.filter((t) => !isToday(t)), { stepId: s.stepId, doneOn: today, upToMin }];
      }
      const kept = prev.filter((t) => t.stepId !== s.stepId || t.upToMin <= s.from);
      return s.from > 0 && !kept.some(isToday) ? [...kept, { stepId: s.stepId, doneOn: today, upToMin: s.from }] : kept;
    });
    start(async () => {
      const res = await tickStudySession(analysisId, { stepId: s.stepId, from: s.from, to: s.to, done, timeZone: tz });
      if (!res.ok) setError(res.error.message);
    });
  };

  const allowAlerts = () =>
    start(async () => {
      const sub = await subscribe();
      if (sub) {
        const saved = await savePushSubscription(sub);
        if (!saved.ok) setError(saved.error.message);
        else if (userId && sub.endpoint) rememberDevice(userId, sub.endpoint);
      }
      setPush(await pushState());
    });

  const exportIcs = () => {
    const interview = ["Interview", [title, company].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
    const ics = buildIcs(plan, settings.alert, tz, new Date(), "Roleform study plan", interview);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "roleform-study-plan.ics";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => (URL.revokeObjectURL(url), a.remove()), 800);
  };

  // The alert the first sitting will get, worded exactly as the sender words it.
  const first = sittings(plan)[0] ?? null;
  const nt = first ? sittingAlertCopy(first, today) : { title: "Nothing scheduled yet", body: "Your first session will show here." };
  const ntWhen = lead ? `in ${lead} min` : "now";

  const testAlert = async () => {
    setToast({ when: ntWhen, ...nt });
    if (push === "on") {
      const reg = await registration();
      await reg?.showNotification(`Roleform · ${nt.title}`, { body: nt.body }).catch(() => undefined);
    }
  };

  /* -------------------------------------------------------------- copy */

  const sessionCount = plan.days.reduce((n, d) => n + d.sessions.length, 0);
  const fitted = plan.neededMin - plan.overflowMin;
  const interviewDay = shortDay(plan.interviewOn);
  const lastStudy = [...plan.days].reverse().find((d) => d.kind === "study");
  const verdict =
    plan.daysAway < 1
      ? { tone: "bg-[var(--color-sage-200)]", kicker: "Interview day", title: "Pick a date after today", line: "The plan works back from your interview, so it needs a day that hasn’t happened yet." }
      : plan.neededMin === 0 && plan.topics.some((t) => t.on)
        ? { tone: "bg-[var(--color-accent-500)]", kicker: `Interview ${interviewDay}`, title: "Every session done", line: "Nothing left to study for this posting. Keep your answers warm on the Prep tab." }
        : plan.neededMin === 0
          ? { tone: "bg-[var(--color-sage-200)]", kicker: `Interview ${interviewDay}`, title: "Nothing to study", line: "Every topic is switched off. Turn one back on to build a plan." }
          : plan.overflowMin === 0
            ? {
                tone: "bg-[var(--color-accent-500)]",
                kicker: `On track for ${interviewDay}`,
                title: plan.freeDays ? `Done ${plan.freeDays.count} day${plan.freeDays.count === 1 ? "" : "s"} early` : "Fits, just in time",
                line: `${sessionCount} sessions · ${formatDuration(plan.neededMin)} of study · last one on ${lastStudy ? shortDay(lastStudy.date) : interviewDay}.`,
              }
            : {
                tone: "bg-[var(--color-sage-500)]",
                kicker: `Interview ${interviewDay}`,
                title: `${formatDuration(plan.overflowMin)} short`,
                line: `Your slots hold ${formatDuration(fitted)} of the ${formatDuration(plan.neededMin)} this plan needs. Pick a fix and the plan rebuilds.`,
              };
  const fitPct = plan.neededMin ? Math.round((fitted / plan.neededMin) * 100) : 100;

  const permission = (() => {
    if (!pushReady || push === "unconfigured") return { label: "Alerts aren’t set up yet", can: false, on: false };
    switch (push) {
      case "on":
        return { label: "Notifications on", can: false, on: true };
      case "denied":
        return { label: "Blocked in browser settings", can: false, on: false };
      case "ios-update":
        return { label: "Needs iOS 16.4 or later", can: false, on: false };
      case "off":
        return { label: "Allow notifications", can: true, on: false };
      default:
        return { label: "Install the app for alerts", can: false, on: false };
    }
  })();
  const alertNote = lead
    ? `We’ll ping you ${lead} minutes before every session, enough time to wrap up and sit down.`
    : "No reminders. Sessions still go into your calendar.";

  const daysAway = plan.daysAway < 1 ? "Must be after today" : plan.daysAway === 1 ? "Tomorrow" : `${plan.daysAway} days away`;
  const dayMeta = (date: string, tail: string) =>
    `${["Today", "Tomorrow"].includes(dayLabel(date, today)) ? longDay(date) : weekdayLong(date)} · ${tail}`;

  /* ------------------------------------------------------------ render */

  return (
    <section aria-labelledby="study-heading" className="mt-[clamp(36px,4vw,56px)]">
      <div className="mb-[clamp(24px,3vw,36px)] flex flex-wrap items-end justify-between gap-[18px]">
        <div className="max-w-[780px]">
          <h2 id="study-heading" className="m-0 mb-2.5 text-[clamp(2.5rem,4.8vw,4.25rem)] leading-[0.95]">
            Your study plan
          </h2>
          <p className="more-copy m-0 max-w-[64ch] text-base leading-[1.6] text-[var(--color-text-muted)] [text-wrap:pretty]">
            Your gaps, fitted into your week, most important first.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button type="button" onClick={exportIcs} disabled={plan.daysAway < 1} className={`btn btn-secondary min-h-12 ${HOVER_INK}`}>
            <CalendarPlus className="lucide h-[18px] w-[18px]" />
            Add to my calendar
          </button>
          <span role="status" className="min-h-[18px] text-[13px] font-semibold text-[var(--color-text-muted)]">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-sm)] bg-[var(--color-danger-100)] px-4 py-3 text-sm font-semibold text-[var(--color-danger-700)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-[clamp(20px,2.6vw,32px)]">
        {/* ---------------------------------------------------- controls */}
        <div className="grid min-w-0 flex-[1_1_320px] items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))] lg:max-w-[max(460px,calc(100%-520px))]">
          <div className={CARD}>
            <p className="eyebrow m-0">1 · Interview day</p>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
              <input
                type="date"
                aria-label="Interview date"
                value={plan.interviewOn}
                min={addDays(today, 1)}
                max={addDays(today, MAX_DAYS_AHEAD)}
                onChange={(e) => e.target.value && change((s) => ({ ...s, interviewOn: e.target.value }))}
                className="h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[var(--color-text)] bg-white px-3.5 text-base font-bold"
              />
              <span className="text-[15px] font-bold text-[var(--color-text-muted)]">{daysAway}</span>
            </div>
            {plan.interviewGuessed ? (
              <p className="m-0 text-sm text-[var(--color-text-muted)]">A placeholder two weeks out — set your real interview day.</p>
            ) : settings.interviewOn === null && nextRoundOn ? (
              <p className="m-0 text-sm text-[var(--color-text-muted)]">Taken from your next interview round.</p>
            ) : null}
            <div className={`flex items-center gap-3.5 pt-3 ${RULE}`}>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[15px] font-extrabold">Keep the day before for revision</p>
                <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45] text-[var(--color-text-muted)]">
                  No new topics, just notes and a run through your answers.
                </p>
              </div>
              <Switch on={settings.keepRevisionDay} label="Keep the day before for revision" onToggle={() => change((s) => ({ ...s, keepRevisionDay: !s.keepRevisionDay }))} />
            </div>
          </div>

          <div className={`${CARD} gap-3 pb-2`}>
            <p className="eyebrow m-0">2 · Your day</p>
            <Segmented
              label="What your day looks like"
              options={PERSONAS.map((p) => ({ id: p, label: PERSONA_LABEL[p] }))}
              value={settings.persona}
              onPick={(p) => change((s) => ({ ...s, persona: p, windows: personaWindows(p) }))}
            />
            <p className="m-0 text-sm leading-normal text-[var(--color-text-muted)]">{PERSONA_NOTE[settings.persona]} Tap the days to change them.</p>
            <div>
              {settings.windows.map((w) => (
                <div key={w.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2.5 py-3 ${RULE}`}>
                  <Switch on={w.on} label={w.label} onToggle={() => setWindow(w.id, (x) => ({ on: !x.on }))} />
                  <div className={`min-w-0 flex-[1_1_110px] ${w.on ? "" : "opacity-50"}`}>
                    <p className="m-0 text-[15px] font-extrabold">{w.label}</p>
                    <button
                      type="button"
                      title="Change which days"
                      onClick={() => setWindow(w.id, (x) => ({ days: nextDaySet(x.days) }))}
                      className="mt-0.5 text-[13px] font-bold text-[var(--color-text-muted)] underline decoration-dotted underline-offset-[3px]"
                    >
                      {DAY_SET_LABEL[w.days]}
                    </button>
                  </div>
                  <div className={`flex items-center gap-2 ${w.on ? "" : "opacity-50"}`}>
                    <input
                      type="time"
                      aria-label={`${w.label} start time`}
                      value={w.at}
                      onChange={(e) => e.target.value && setWindow(w.id, () => ({ at: e.target.value }))}
                      className="h-11 rounded-[12px] border-[1.5px] border-[var(--color-line-strong)] bg-white px-2 text-sm font-bold"
                    />
                    <div className="flex h-11 items-center overflow-hidden rounded-[12px] border-[1.5px] border-[var(--color-line-strong)] bg-white">
                      <button
                        type="button"
                        aria-label="Shorter"
                        onClick={() => setWindow(w.id, (x) => ({ durMin: Math.max(WINDOW_MIN_MIN, x.durMin - WINDOW_STEP_MIN) }))}
                        className="h-full w-[34px] text-lg font-extrabold"
                      >
                        −
                      </button>
                      <span className="min-w-[50px] text-center text-sm font-extrabold">{formatDuration(w.durMin)}</span>
                      <button
                        type="button"
                        aria-label="Longer"
                        onClick={() => setWindow(w.id, (x) => ({ durMin: Math.min(WINDOW_MAX_MIN, x.durMin + WINDOW_STEP_MIN) }))}
                        className="h-full w-[34px] text-lg font-extrabold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD} gap-1.5 pb-2`}>
            <p className="eyebrow m-0">3 · Topics, most important first</p>
            <p className="more-copy m-0 mb-1.5 text-sm leading-normal text-[var(--color-text-muted)]">
              Move a topic up to study it sooner; switch one off to skip it.
            </p>
            <div>
              {plan.topics.map((t, i) => (
                <div key={t.id} className={`flex items-center gap-3 py-2.5 ${RULE}`}>
                  <span className={`display grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[17px] ${tone(t.tone)} ${t.on ? "" : "opacity-45"}`}>
                    {t.rank ?? "–"}
                  </span>
                  <div className={`min-w-0 flex-1 ${t.on ? "" : "opacity-45"}`}>
                    <p className={`m-0 text-[15px] font-extrabold leading-[1.3] ${t.on ? "" : "line-through"}`}>{t.name}</p>
                    <p className="m-0 mt-0.5 text-[13px] text-[var(--color-text-muted)]">
                      {priorityLabel(t.severity)} · {formatDuration(t.totalMin)}
                      {t.steps > 1 ? ` · ${t.steps} steps` : ""}
                    </p>
                  </div>
                  <div className="flex flex-none gap-0.5">
                    <button
                      type="button"
                      aria-label={`Move ${t.name} up`}
                      onClick={() => moveTopic(t.id, -1)}
                      className={`grid h-11 w-[34px] place-items-center rounded-[10px] hover:bg-[var(--color-bg-tint)] ${i === 0 ? "opacity-25" : ""}`}
                    >
                      <ChevronUp className="lucide h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${t.name} down`}
                      onClick={() => moveTopic(t.id, 1)}
                      className={`grid h-11 w-[34px] place-items-center rounded-[10px] hover:bg-[var(--color-bg-tint)] ${i === plan.topics.length - 1 ? "opacity-25" : ""}`}
                    >
                      <ChevronDown className="lucide h-[18px] w-[18px]" />
                    </button>
                  </div>
                  <Switch on={t.on} label={`Include ${t.name}`} onToggle={() => toggleTopic(t.id)} />
                </div>
              ))}
            </div>
            {uncovered > 0 ? (
              <p className={`m-0 py-3 text-[13px] leading-normal text-[var(--color-text-muted)] ${RULE}`}>
                {uncovered} more gap{uncovered === 1 ? " has" : "s have"} no vetted course yet, so {uncovered === 1 ? "it stays" : "they stay"} on the Learning tab.
              </p>
            ) : null}
          </div>

          <div className={CARD}>
            <p className="eyebrow m-0">4 · Remind me before each session</p>
            <Segmented
              label="Alert before each session"
              options={STUDY_ALERTS.map((a) => ({ id: a, label: ALERT_LABEL[a] }))}
              value={settings.alert}
              onPick={(a) => change((s) => ({ ...s, alert: a }))}
            />
            <p className="m-0 text-sm leading-normal text-[var(--color-text-muted)]">{alertNote}</p>
            <AlertCard when={ntWhen} title={nt.title} body={nt.body} />
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={allowAlerts}
                disabled={!permission.can || pending}
                className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] px-[18px] text-sm font-extrabold ${
                  permission.can
                    ? "bg-[var(--color-text)] text-[var(--color-accent-500)]"
                    : permission.on
                      ? "bg-[var(--color-accent-500)]"
                      : "bg-[var(--color-chip)] text-[var(--color-text-muted)]"
                }`}
              >
                <Bell className="lucide h-4 w-4" />
                {permission.label}
              </button>
              <button type="button" onClick={() => void testAlert()} className={`btn btn-secondary btn-sm min-h-11 ${HOVER_INK}`}>
                Preview an alert
              </button>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------- schedule */}
        <div className="flex min-w-0 flex-[2_1_460px] flex-col gap-4">
          <div className={`rounded-[26px] p-[clamp(20px,2.6vw,30px)] ${verdict.tone}`}>
            <p className="m-0 mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.12em]">{verdict.kicker}</p>
            <h3 className="display m-0 mb-2.5 text-[clamp(2rem,3.6vw,3rem)] uppercase leading-[0.95]">{verdict.title}</h3>
            <p className="m-0 max-w-[58ch] text-base leading-[1.55]">{verdict.line}</p>
            <div
              role="img"
              aria-label={`${formatDuration(fitted)} of ${formatDuration(plan.neededMin)} fits before the interview`}
              className="mt-[18px] h-2.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-line)]"
            >
              <div className="h-full rounded-[var(--radius-pill)] bg-[var(--color-text)] transition-[width] duration-[400ms]" style={{ width: `${fitPct}%` }} />
            </div>
            {tips.length > 0 ? (
              <div className="mt-[18px] flex flex-col gap-2">
                {tips.map((tp) => (
                  <div key={tp.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[16px] bg-[var(--color-bg-raised)]/80 py-2.5 pl-4 pr-2.5">
                    <span className="min-w-0 flex-[1_1_220px] text-[15px] font-bold leading-[1.4]">{tp.label}</span>
                    <span
                      className={`flex h-7 items-center rounded-[var(--radius-pill)] px-[11px] text-[12.5px] font-extrabold ${
                        tp.fitsAll ? "bg-[var(--color-text)] text-[var(--color-accent-500)]" : "bg-[var(--color-line)]"
                      }`}
                    >
                      {tp.fitsAll ? "Closes the gap" : `+${formatDuration(tp.gainMin)}`}
                    </span>
                    <button type="button" onClick={() => change(tp.settings)} className="btn btn-primary btn-sm min-h-11">
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {plan.days
            .filter((d) => d.kind === "study")
            .map((d) => (
              <DayCard key={d.date} label={dayLabel(d.date, today)} meta={dayMeta(d.date, formatDuration(d.sessions.reduce((n, s) => n + s.durMin, 0)))}>
                {d.sessions.map((s) => (
                  <SessionRow key={s.key} s={s} lead={lead} onTick={() => tick(s)} />
                ))}
              </DayCard>
            ))}

          {plan.freeDays ? (
            <DayCard
              variant="free"
              label={
                plan.freeDays.count === 1
                  ? shortDay(plan.freeDays.from)
                  : `${shortDay(plan.freeDays.from)} – ${shortDay(plan.freeDays.to)}`
              }
              meta={plan.freeDays.count === 1 ? "Free day" : `${plan.freeDays.count} free days`}
              note="Nothing scheduled, you’re ahead. Rest, or run a Rapid prep round to stay sharp."
            />
          ) : null}

          {plan.days
            .filter((d): d is StudyDay => d.kind === "revision")
            .map((d) => (
              <DayCard
                key="revision"
                variant="revision"
                label={dayLabel(d.date, today)}
                meta={dayMeta(d.date, "Revision day")}
                note={d.revision.length ? "No new topics. Consolidate what you have, then stop early." : "None of your slots fall on this day. Keep it light anyway."}
              >
                {d.revision.map((r) => (
                  <div key={r.key} className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3 ${RULE}`}>
                    <span aria-hidden className="h-[30px] w-[30px] flex-none rounded-full border-2 border-dashed border-[var(--color-line-strong)]" />
                    <div className="flex-[0_0_56px]">
                      <p className="m-0 text-[15px] font-extrabold">{formatClock(r.startMin)}</p>
                      <p className="m-0 text-[12.5px] text-[var(--color-text-muted)]">{formatDuration(r.durMin)}</p>
                    </div>
                    <div className="min-w-0 flex-[1_1_220px]">
                      <p className="m-0 text-[15.5px] font-bold leading-[1.35]">{r.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="flex h-[26px] items-center rounded-[var(--radius-pill)] bg-[var(--color-text)] px-2.5 text-xs font-extrabold text-[var(--color-accent-500)]">
                          Revision
                        </span>
                        <span className="text-[13px] text-[var(--color-text-muted)]">Start at {r.entry}</span>
                      </div>
                    </div>
                    <AlertTime startMin={r.startMin} lead={lead} />
                  </div>
                ))}
              </DayCard>
            ))}

          {plan.daysAway >= 1 ? (
            <DayCard
              variant="interview"
              label={plan.daysAway === 1 ? "Tomorrow" : dayLabel(plan.interviewOn, today)}
              meta="Interview day"
              note="Nothing to study. Your interview-day reminders take it from here."
            />
          ) : null}
        </div>
      </div>

      {toast ? (
        <div role="status" className="fixed right-[18px] top-[18px] z-[80] w-[min(360px,calc(100%-36px))] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)]">
          <AlertCard {...toast} />
        </div>
      ) : null}
    </section>
  );
}

function DayCard({
  label,
  meta,
  note,
  variant = "study",
  children,
}: {
  label: string;
  meta: string;
  note?: string;
  variant?: "study" | "free" | "revision" | "interview";
  children?: React.ReactNode;
}) {
  const style = {
    study: "bg-[var(--color-bg-raised)]",
    free: "border-[1.5px] border-dashed border-[var(--color-line-strong)]",
    revision: "bg-[var(--color-accent-200)]",
    interview: "bg-[var(--color-text)] text-[var(--color-bg)]",
  }[variant];
  const sub = variant === "interview" ? "text-[var(--color-accent-500)]" : "text-[var(--color-text-muted)]";
  return (
    <div className={`rounded-[22px] px-[clamp(16px,2.2vw,24px)] pb-1.5 pt-[18px] ${style}`}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="display m-0 text-[26px] uppercase leading-none">{label}</h3>
        <span className={`text-[13.5px] font-bold ${sub}`}>{meta}</span>
      </div>
      {note ? <p className={`m-0 mb-3 text-[15px] leading-[1.55] ${sub}`}>{note}</p> : null}
      {children}
    </div>
  );
}

function SessionRow({ s, lead, onTick }: { s: StudySession; lead: number | null; onTick: () => void }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3 ${RULE}`}>
      <button
        type="button"
        onClick={onTick}
        aria-pressed={s.done}
        aria-label={s.done ? "Mark as not done" : "Mark as done"}
        className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-full ${
          s.done ? "bg-[var(--color-text)] text-[var(--color-accent-500)]" : "border-2 border-[var(--color-line-strong)]"
        }`}
      >
        {s.done ? <Check className="lucide h-4 w-4" strokeWidth={3} /> : null}
      </button>
      <div className="flex-[0_0_56px]">
        <p className="m-0 text-[15px] font-extrabold">{formatClock(s.startMin)}</p>
        <p className="m-0 text-[12.5px] text-[var(--color-text-muted)]">{formatDuration(s.durMin)}</p>
      </div>
      <div className="min-w-0 flex-[1_1_220px]">
        <p className={`m-0 text-[15.5px] font-bold leading-[1.35] ${s.done ? "line-through opacity-60" : ""}`}>{s.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`flex h-[26px] items-center rounded-[var(--radius-pill)] px-2.5 text-xs font-extrabold ${tone(s.topicTone)}`}>{s.topicName}</span>
          {s.parts > 1 ? (
            <span className="flex h-[26px] items-center rounded-[var(--radius-pill)] bg-[var(--color-chip)] px-2.5 text-xs font-bold text-[var(--color-text-muted)]">
              Part {s.part} of {s.parts}
            </span>
          ) : null}
          {s.entry ? <span className="text-[13px] text-[var(--color-text-muted)]">Start at {s.entry}</span> : null}
        </div>
      </div>
      <AlertTime startMin={s.startMin} lead={lead} />
    </div>
  );
}

function AlertTime({ startMin, lead }: { startMin: number; lead: number | null }) {
  return (
    <span title="Alert time" className="flex items-center gap-[5px] text-[13px] font-bold text-[var(--color-text-muted)]">
      <Bell className="lucide h-3.5 w-3.5" />
      {lead ? formatClock(startMin - lead) : "No alert"}
    </span>
  );
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[30px] w-12 flex-none rounded-[var(--radius-pill)] transition-colors ${on ? "bg-[var(--color-text)]" : "bg-[var(--color-line)]"}`}
    >
      <span
        className={`absolute left-[5px] top-[5px] h-5 w-5 rounded-full transition-transform ${
          on ? "translate-x-[18px] bg-[var(--color-accent-500)]" : "bg-[var(--color-bg-raised)]"
        }`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 self-start rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-text)] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onPick(o.id)}
          className={`h-[38px] rounded-[var(--radius-pill)] px-4 text-sm font-bold ${
            o.id === value ? "bg-[var(--color-text)] text-[var(--color-accent-500)]" : "hover:bg-[var(--color-hover)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AlertCard({ when, title, body }: { when: string; title: string; body: string }) {
  return (
    <div aria-label="Alert preview" className="flex gap-3 rounded-[var(--radius-md)] bg-white px-4 py-3.5 shadow-[var(--shadow-md)]">
      <span aria-hidden className="display grid h-10 w-10 flex-none place-items-center rounded-[11px] bg-[var(--color-text)] text-[21px] text-[var(--color-accent-500)]">
        R
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-[12.5px] font-bold text-[var(--color-text-muted)]">
          <span>Roleform</span>
          <span>{when}</span>
        </div>
        <p className="m-0 mt-0.5 text-[15px] font-extrabold leading-[1.35]">{title}</p>
        <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45] text-[var(--color-text-muted)]">{body}</p>
      </div>
    </div>
  );
}
