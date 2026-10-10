"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { TokenWallDialog } from "@/components/token-wall";
import { PortfolioSite } from "@/components/portfolio-site";
import { buildPortfolio } from "@/app/actions/portfolio";
import { PORTFOLIO_BRIEF } from "@/lib/content/portfolio-brief";
import { PORTFOLIO_STYLES, type PortfolioChoices } from "@/lib/ai/schemas/portfolio";
import { STYLE_LABEL, buildCuratedPrompt, type PortfolioMaterials } from "@/lib/domain/portfolio";
import type { PortfolioPhotos, SiteData } from "@/lib/domain/portfolio-site";
import { SITE_FONTS_HREF } from "@/lib/render/portfolio/template";
import { exportPortfolioHtml } from "@/lib/render/portfolio/export";
import { formatCount, type TokenWall } from "@/lib/domain/tokens";

interface Site {
  html: string;
  builtFor: string;
  createdAt: string;
}

/**
 * F28 — the portfolio studio (design: "22 Portfolio studio").
 *
 *   1. Pick a look — nine cards, each the member's real page in that look.
 *   2. Add photos — portrait and one image per project. They stay in this
 *      browser: shown in the preview, named in the prompt, never uploaded
 *      (the optional profile-photo copy goes to Clerk, on the member's tick).
 *   3. A few answers — read by both the prompt and the build.
 *   4. Get the page — copy the curated prompt (free) or build here (one trial).
 */

const INK = "var(--color-text)";
const MUTED = "var(--color-text-muted)";
const RAISED = "var(--color-bg-raised)";
const MARIGOLD = "var(--color-accent)";
const DESK = 1280;
const PHONE = 390;

const ICON = {
  desk: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  copy: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
};

const STAGES = [
  "Writing the page in the {look} look…",
  "Checking every link against your profile…",
  "Checking every figure against your profile…",
  "Embedding your photos and finishing up…",
];
/** A healthy build's length, for the progress bar only (the call itself may run to four minutes). */
const BUILD_SECONDS = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const PHOTOS_KEY = "rf-pf-photos";

export function PortfolioStudio({
  analysisId,
  materials,
  site: siteData,
  estimate,
  initialChoices,
  built: initialBuilt,
  builtLook: initialBuiltLook,
  building,
}: {
  analysisId: string;
  materials: PortfolioMaterials;
  site: SiteData;
  estimate: number;
  initialChoices: PortfolioChoices;
  built: Site | null;
  builtLook: PortfolioChoices["style"] | null;
  building: boolean;
}) {
  const [choices, setChoices] = useState<PortfolioChoices>(
    materials.target ? initialChoices : { ...initialChoices, focus: "broad" },
  );
  const [built, setBuilt] = useState<Site | null>(initialBuilt);
  const [builtLook, setBuiltLook] = useState(initialBuiltLook);
  const [photos, setPhotosState] = useState<PortfolioPhotos>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(false);
  const [device, setDevice] = useState<"desk" | "phone" | null>(null);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<string>("portrait");
  const portraitFile = useRef<Blob | null>(null);
  const { user } = useUser();

  // Photos stay in this browser (design: localStorage "rf-pf-photos") so the page file can embed them later.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PHOTOS_KEY) ?? "{}") as unknown;
      if (saved && typeof saved === "object") {
        const ok = Object.fromEntries(
          Object.entries(saved as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === "string" && e[1].startsWith("data:image/"),
          ),
        );
        setPhotosState(ok);
      }
    } catch {
      /* private window or cleared storage: start empty */
    }
  }, []);
  const setPhotos = (next: (p: PortfolioPhotos) => PortfolioPhotos) =>
    setPhotosState((p) => {
      const v = next(p);
      try {
        localStorage.setItem(PHOTOS_KEY, JSON.stringify(v));
      } catch {
        /* over quota: the photos still work for this visit */
      }
      return v;
    });

  const set = <K extends keyof PortfolioChoices>(key: K, value: PortfolioChoices[K]) =>
    setChoices((c) => ({ ...c, [key]: value }));

  /* ------------------------------------------------------------ geometry */
  const [pickW, pickRef] = useWidth<HTMLDivElement>();
  const [prevW, prevRef] = useWidth<HTMLDivElement>();
  const winW = useWindowWidth();
  const mobile = winW > 0 && winW < 900;
  const cols = pickW ? (pickW >= 980 ? 3 : pickW >= 600 ? 2 : 1) : mobile ? 1 : 3;
  const cardW = pickW ? (pickW - 20 * (cols - 1)) / cols : 0;
  const maxOff = PORTFOLIO_STYLES.length - cols;
  const off = Math.max(0, Math.min(offset, maxOff));
  const shown = PORTFOLIO_STYLES.slice(off, off + cols);
  const range = cols === 1 ? `${off + 1} of ${PORTFOLIO_STYLES.length}` : `${off + 1}–${off + cols} of ${PORTFOLIO_STYLES.length}`;
  const dev = device ?? (mobile ? "phone" : "desk");
  const reduce = useReducedMotion();

  /* ------------------------------------------------------------- content */
  const projects = siteData.projects[choices.focus];
  const look = STYLE_LABEL[choices.style];
  const hasPortrait = Boolean(photos.portrait);
  const shotCount = projects.filter((p) => photos[p.id]).length;
  const assets = useMemo(
    () => ({ portrait: hasPortrait, shots: projects.filter((p) => photos[p.id]).map((p) => p.name) }),
    [hasPortrait, projects, photos],
  );
  const prompt = useMemo(
    () => buildCuratedPrompt(PORTFOLIO_BRIEF, materials, choices, assets),
    [materials, choices, assets],
  );
  const siteProps = {
    focus: choices.focus,
    showEmail: choices.showEmail && Boolean(materials.email),
    showPhone: choices.showPhone && Boolean(materials.phone),
    showLinks: choices.showLinks && materials.links.length > 0,
    photos,
  };

  useEffect(() => {
    setElapsed(0);
    if (!pending) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  /* -------------------------------------------------------------- photos */
  const open = useCallback((slot: string) => {
    slotRef.current = slot;
    fileRef.current?.click();
  }, []);

  async function read(file: File, slot: string) {
    setPhotoErr(null);
    if (!file.type.startsWith("image/")) return setPhotoErr("That file isn’t an image. Use a JPG, PNG or WebP.");
    if (file.size > MAX_BYTES) return setPhotoErr("That image is over 15 MB. Try a smaller copy of it.");
    try {
      const url = await downscale(file, slot === "portrait" ? 900 : 1600);
      if (slot === "portrait") portraitFile.current = file;
      setPhotos((p) => ({ ...p, [slot]: url }));
      if (slot === "portrait" && avatar) void syncAvatar(file);
    } catch {
      setPhotoErr("We couldn’t read that image. Try another file.");
    }
  }

  function remove(slot: string) {
    setPhotos((p) => {
      const next = { ...p };
      delete next[slot];
      return next;
    });
    if (slot === "portrait") {
      portraitFile.current = null;
      setAvatar(false);
    }
  }

  async function syncAvatar(file: Blob) {
    if (!user) return;
    try {
      await user.setProfileImage({ file });
    } catch {
      setPhotoErr("We couldn't update your Roleform profile photo. Your page still uses the portrait.");
      setAvatar(false);
    }
  }

  const slot = (name: string) => ({
    onClick: () => open(name),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(name);
      }
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (drag !== name) setDrag(name);
    },
    onDragLeave: () => setDrag(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDrag(null);
      const f = e.dataTransfer?.files?.[0];
      if (f) void read(f, name);
    },
  });
  const slotBorder = (name: string, has: boolean) =>
    drag === name
      ? `${name === "portrait" ? "2.5px" : "2px"} solid var(--color-accent-600)`
      : `${name === "portrait" ? "2.5px" : "2px"} ${has ? "solid transparent" : "dashed var(--color-line-strong)"}`;

  /* --------------------------------------------------------------- paths */
  async function copy() {
    setCopyErr(null);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setPromptOpen(true);
      setCopyErr("Your browser blocked copying. Select the text and copy it instead.");
    }
  }

  function build() {
    if (!confirmed || pending || building) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await buildPortfolio(analysisId, choices);
        if (result.ok) {
          setBuilt({ html: result.value.html, builtFor: "this posting", createdAt: new Date().toISOString() });
          setBuiltLook(choices.style);
        } else if (result.error.code === "token_wall" && result.error.wall) {
          setWall(result.error.wall);
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("The connection dropped before the build finished. If it completed, reload to see it; your build is only used by a page you receive.");
      }
    });
  }

  const roles = materials.roles.length;
  const projectCount = materials.projects.length;
  const buildDis = !confirmed || building;
  const frac = Math.min(0.96, elapsed / BUILD_SECONDS);
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(frac * STAGES.length))]!.replace("{look}", look.name);
  const buildW = `${Math.round(8 + frac * 92)}%`;

  /* ---------------------------------------------------------------- view */
  return (
    <section style={{ marginTop: "clamp(36px,4cqi,56px)" }} className="[container-type:inline-size]">
      {/* The looks' own type: loaded once, used only inside the previews. */}
      <link rel="stylesheet" href={SITE_FONTS_HREF} precedence="default" />
      <input
        type="file"
        accept="image/*"
        ref={fileRef}
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f, slotRef.current);
          e.target.value = "";
        }}
      />

      <div style={{ maxWidth: 780, marginBottom: "clamp(28px,3.4cqi,44px)" }}>
        <Link
          href={`/analysis/${analysisId}/resumes`}
          className="hover-tint"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 0", marginBottom: 12, fontSize: 14, fontWeight: 700, color: INK, textDecoration: "none" }}
        >
          <Svg d="m12 19-7-7 7-7M19 12H5" size={16} />
          Résumés
        </Link>
        <p style={eyebrow}>Portfolio site</p>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, textTransform: "uppercase", fontSize: "clamp(40px,4.8cqi,68px)", lineHeight: 0.95, margin: "0 0 12px" }}>
          Turn this profile into a portfolio site
        </h2>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: MUTED, textWrap: "pretty" }}>
          A one-page site recruiters can scan in a minute. It uses a short excerpt of your profile —{" "}
          {[`${roles} role${roles === 1 ? "" : "s"}`, projectCount ? `${projectCount} project${projectCount === 1 ? "" : "s"}` : "", "your skills"]
            .filter(Boolean)
            .join(", ")}{" "}
          — and nothing you didn&rsquo;t write.
        </p>
      </div>

      {/* 1 — Pick a look */}
      <div data-help="pf-looks">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Step n={1} />
            <div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Pick a look</h3>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: MUTED }}>Each card is your real page. Hover one to scroll through it.</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{range}</span>
            <RoundBtn label="Previous looks" disabled={off <= 0} onClick={() => setOffset(Math.max(0, off - 1))} d="m15 18-6-6 6-6" />
            <RoundBtn label="More looks" disabled={off >= maxOff} onClick={() => setOffset(Math.min(maxOff, off + 1))} d="m9 18 6-6-6-6" />
          </div>
        </div>
        <div ref={pickRef} role="radiogroup" aria-label="Portfolio look" style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 20 }}>
          {shown.map((id) => {
            const lk = STYLE_LABEL[id];
            const on = choices.style === id;
            const hot = hover === id;
            const zoom = (cardW || 400) / DESK;
            const pick = () => set("style", id);
            return (
              <div
                key={id}
                role="radio"
                aria-checked={on}
                aria-label={lk.name}
                tabIndex={0}
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick();
                  }
                }}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14, cursor: "pointer", borderRadius: 24 }}
              >
                <div
                  style={{
                    position: "relative",
                    height: 280,
                    borderRadius: 22,
                    overflow: "hidden",
                    background: lk.ground,
                    boxShadow: on
                      ? `0 0 0 3px var(--color-bg), 0 0 0 6px ${INK}`
                      : hot
                        ? "0 0 0 1.5px rgb(74 13 13 / .2), 0 20px 40px -24px rgb(74 13 13 / .4)"
                        : "0 0 0 1.5px rgb(74 13 13 / .12)",
                    transform: hot && !reduce ? "translateY(-3px)" : "none",
                    transition: "box-shadow .2s,transform .25s cubic-bezier(.22,1,.36,1)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      pointerEvents: "none",
                      transform: hot && !reduce ? "translateY(calc(-100% + 280px))" : "translateY(0)",
                      transition: hot ? "transform 7s cubic-bezier(.45,0,.55,1)" : "transform .8s cubic-bezier(.22,1,.36,1)",
                    }}
                  >
                    <div style={{ zoom, width: DESK }}>
                      <PortfolioSite data={siteData} theme={id} vw={DESK} {...siteProps} />
                    </div>
                  </div>
                  {on ? (
                    <span style={{ ...badge, left: 14, top: 14, gap: 6, background: INK, color: MARIGOLD }}>
                      <Svg d={ICON.check} size={14} stroke={3} />
                      Selected
                    </span>
                  ) : null}
                  {lk.rec ? <span style={{ ...badge, right: 14, top: 14, background: MARIGOLD, color: INK }}>Recommended</span> : null}
                  {lk.fresh ? (
                    <span style={{ ...badge, left: 14, bottom: 14, height: 28, padding: "0 11px", gap: 6, fontSize: 12.5, background: RAISED, color: INK, boxShadow: "0 0 0 1.5px var(--color-line-strong)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
                      </svg>
                      Animated
                    </span>
                  ) : null}
                </div>
                <div style={{ padding: "0 4px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 10px" }}>
                    <h4 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{lk.name}</h4>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>{lk.best}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: MUTED, textWrap: "pretty" }}>{lk.blurb}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", flexDirection: "row-reverse", alignItems: "flex-start", gap: "clamp(24px,3cqi,40px)", marginTop: "clamp(40px,4.4cqi,60px)" }}>
        {/* Live preview */}
        <div data-help="pf-preview" style={{ flex: "999 1 540px", minWidth: 0, position: mobile ? "static" : "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <p style={{ ...eyebrow, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-sage-600)" }} />
              Live preview · {look.name}
            </p>
            <div role="tablist" aria-label="Preview size" style={{ display: "inline-flex", gap: 4, padding: 4, border: `1.5px solid ${INK}`, borderRadius: 999 }}>
              {(["desk", "phone"] as const).map((dv) => (
                <button
                  key={dv}
                  type="button"
                  role="tab"
                  aria-selected={dev === dv}
                  onClick={() => setDevice(dv)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 36, padding: "0 14px", border: 0, borderRadius: 999, fontWeight: 700, fontSize: 13.5, background: dev === dv ? INK : "transparent", color: dev === dv ? MARIGOLD : INK, transition: "background-color .14s" }}
                >
                  <Svg d={ICON[dv]} size={15} />
                  {dv === "desk" ? "Desktop" : "Phone"}
                </button>
              ))}
            </div>
          </div>
          {dev === "desk" ? (
            <div style={{ borderRadius: 20, overflow: "hidden", background: RAISED, border: "1.5px solid var(--color-line)", boxShadow: "0 30px 60px -30px rgb(74 13 13 / .45)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, height: 44, padding: "0 16px", background: "var(--color-bg-sunken)", borderBottom: "1.5px solid rgb(74 13 13 / .1)" }}>
                <span aria-hidden="true" style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--color-on-ink-muted)" }} />
                  ))}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
                  <span style={{ maxWidth: "100%", display: "inline-flex", alignItems: "center", gap: 8, height: 28, padding: "0 14px", borderRadius: 999, background: RAISED, fontSize: 12.5, fontWeight: 600, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Svg d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4" size={12} stroke={2.4} />
                    index.html — {siteData.name}
                  </span>
                </span>
                <span aria-hidden="true" style={{ width: 45 }} />
              </div>
              <div ref={prevRef} style={{ height: "min(72vh,680px)", overflowY: "auto", overflowX: "hidden", background: look.ground }}>
                <div style={{ zoom: prevW ? prevW / DESK : 0.6, width: DESK }}>
                  <PortfolioSite data={siteData} theme={choices.style} vw={DESK} hints onPick={open} {...siteProps} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
              <div style={{ width: "min(100%,364px)", height: "min(78vh,740px)", padding: 12, borderRadius: 54, background: "#2B1410", boxShadow: "0 30px 60px -30px rgb(74 13 13 / .55)" }}>
                <div ref={prevRef} style={{ height: "100%", borderRadius: 42, overflowY: "auto", overflowX: "hidden", background: look.ground }}>
                  <div style={{ zoom: prevW ? prevW / PHONE : 0.86, width: PHONE }}>
                    <PortfolioSite data={siteData} theme={choices.style} vw={PHONE} hints onPick={open} {...siteProps} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: MUTED }}>
            The preview is your profile as it stands. Dashed spots are empty photo slots — click one to fill it.
          </p>
        </div>

        <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 2 — Photos */}
          <div data-help="pf-photos" style={panel}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Step n={2} />
              <div>
                <h3 style={panelTitle}>Add your photos</h3>
                <p style={panelNote}>{look.where}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                role="button"
                tabIndex={0}
                aria-label={hasPortrait ? "Replace your portrait" : "Add your portrait"}
                {...slot("portrait")}
                style={{ position: "relative", flex: "none", width: 104, height: 104, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center", cursor: "pointer", background: "var(--color-bg-sunken)", border: slotBorder("portrait", hasPortrait), transition: "border-color .15s" }}
              >
                {hasPortrait ? (
                  <span role="img" aria-label="Your portrait" style={{ position: "absolute", inset: 0, background: "center/cover no-repeat", backgroundImage: `url("${photos.portrait}")` }} />
                ) : (
                  <Svg d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" size={28} stroke={2} color={MUTED} />
                )}
              </div>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>Your portrait</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                    {hasPortrait
                      ? "Looks good. Drop another on the circle to replace it."
                      : "Head and shoulders, good light, plain background. JPG, PNG or WebP — or drop it on the circle."}
                  </p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button type="button" onClick={() => open("portrait")} className="hover-tint" style={{ ...outline, minHeight: 38, padding: "0 15px", fontSize: 13.5 }}>
                    <Svg d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5" size={15} />
                    {hasPortrait ? "Replace" : "Upload a photo"}
                  </button>
                  {hasPortrait ? (
                    <button type="button" onClick={() => remove("portrait")} className="hover-tint" style={{ ...ghost, minHeight: 38, padding: "0 14px", fontSize: 13.5 }}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, opacity: hasPortrait ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={avatar}
                disabled={!hasPortrait}
                onChange={(e) => {
                  setAvatar(e.target.checked);
                  if (e.target.checked && portraitFile.current) void syncAvatar(portraitFile.current);
                }}
                style={{ width: 18, height: 18, margin: 0, accentColor: INK }}
              />
              Also use it as my Roleform profile photo
            </label>
            <div style={{ height: 1, background: "var(--color-line)" }} />
            <div>
              <p style={{ ...eyebrow, margin: "0 0 12px" }}>
                Project images · {shotCount} of {projects.length} added
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {projects.map((p) => {
                  const has = Boolean(photos[p.id]);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${has ? "Replace" : "Add"} image for ${p.name}`}
                        {...slot(p.id)}
                        style={{ position: "relative", flex: "none", width: 112, height: 70, borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", cursor: "pointer", background: "var(--color-bg-tint)", border: slotBorder(p.id, has), transition: "border-color .15s" }}
                      >
                        {has ? (
                          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "center/cover no-repeat", backgroundImage: `url("${photos[p.id]}")` }} />
                        ) : (
                          <Svg d="M16 5h6M19 2v6M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" size={22} stroke={2} color={MUTED} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{p.name}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.45, color: MUTED }}>
                          {has ? "Added · click or drop to replace" : "Drop a screenshot here, or click to add"}
                        </p>
                      </div>
                      {has ? (
                        <button
                          type="button"
                          aria-label={`Remove image for ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(p.id);
                          }}
                          className="hover-tint"
                          style={{ flex: "none", width: 40, height: 40, borderRadius: "50%", border: 0, background: "transparent", display: "grid", placeItems: "center", color: INK }}
                        >
                          <Svg d="M18 6 6 18M6 6l12 12" size={16} stroke={2.4} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            {photoErr ? <Alert>{photoErr}</Alert> : null}
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
              Your own photos and screenshots only — blur anything confidential. They&rsquo;re embedded in your page file and used for nothing else, and we never generate or retouch a portrait.
            </p>
          </div>

          {/* 3 — Answers */}
          <div data-help="pf-details" style={panel}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Step n={3} />
              <div>
                <h3 style={panelTitle}>A few answers</h3>
                <p style={panelNote}>Both the prompt and the build read these, so they can&rsquo;t disagree about you.</p>
              </div>
            </div>
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800 }}>Who is it for?</p>
              <div role="radiogroup" aria-label="Who is it for?" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(
                  [
                    ["this_role", materials.target?.title ? `This role: ${materials.target.title}` : "This role"],
                    ["broad", "A broader range of roles"],
                  ] as const
                ).map(([value, label]) => {
                  const on = choices.focus === value;
                  const disabled = value === "this_role" && !materials.target;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => set("focus", value)}
                      style={{ minHeight: 42, padding: "0 16px", borderRadius: 999, border: `1.5px solid ${INK}`, fontWeight: 700, fontSize: 14, textAlign: "left", background: on ? INK : "transparent", color: on ? MARIGOLD : INK, opacity: disabled ? 0.5 : 1 }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label style={fieldLabel}>
              What should it emphasise? (optional)
              <input value={choices.emphasis} onChange={(e) => set("emphasis", e.target.value)} maxLength={400} placeholder="e.g. my data platform work and mentoring" className="pf-input" style={inputStyle} />
            </label>
            <label style={fieldLabel}>
              Leave anything out? (optional)
              <input value={choices.avoid} onChange={(e) => set("avoid", e.target.value)} maxLength={400} placeholder="Confidential clients, an old role…" className="pf-input" style={inputStyle} />
            </label>
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800 }}>Contact on the page</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(
                  [
                    ["showEmail", "Email", Boolean(materials.email)],
                    ["showPhone", "Phone", Boolean(materials.phone)],
                    ["showLinks", "Links", materials.links.length > 0],
                  ] as const
                ).map(([key, label, available]) => {
                  const on = choices[key] && available;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      disabled={!available}
                      onClick={() => set(key, !choices[key])}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 40, padding: "0 15px", borderRadius: 999, border: `1.5px solid ${INK}`, fontWeight: 700, fontSize: 14, background: on ? INK : "transparent", color: on ? MARIGOLD : INK, opacity: available ? 1 : 0.5 }}
                    >
                      <Svg d={on ? ICON.check : ICON.plus} size={14} stroke={2.6} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label style={fieldLabel}>
              Project details your résumé doesn&rsquo;t have (optional)
              <textarea
                rows={3}
                value={choices.projectNotes}
                onChange={(e) => set("projectNotes", e.target.value)}
                maxLength={1200}
                placeholder="Your role, what you built, outcomes you can stand behind, repo or demo links"
                className="pf-input"
                style={{ ...inputStyle, height: "auto", padding: "12px 16px", fontWeight: 500, lineHeight: 1.6, resize: "vertical" }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
              The build rewrites the copy from these answers. Any figure or link on the page must still come from your profile or these notes.
            </p>
          </div>

          {/* 4 — Get the page */}
          <div data-help="pf-get" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 4px" }}>
              <Step n={4} />
              <h3 style={panelTitle}>Get your page</h3>
            </div>
            <div style={{ ...panel, gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Copy the prompt</h4>
                <span style={{ ...pill, background: "var(--color-accent-2)" }}>Free</span>
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>
                Paste it into any AI chat tool and attach your photos. It asks a few questions, then writes your index.html. Copy it as often as you like.
              </p>
              {promptOpen ? (
                <textarea
                  readOnly
                  rows={10}
                  value={prompt}
                  aria-label="Curated portfolio prompt"
                  style={{ width: "100%", borderRadius: 14, border: "1.5px solid var(--color-line)", background: "var(--color-bg-sunken)", padding: "12px 14px", fontFamily: "ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace", fontSize: 12.5, lineHeight: 1.55, color: INK, resize: "vertical", outline: "none" }}
                />
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" onClick={() => void copy()} className="pf-solid" style={{ ...solid, minHeight: 42, padding: "0 18px", fontSize: 14 }}>
                  <Svg d={copied ? ICON.check : ICON.copy} size={15} />
                  {copied ? "Copied" : "Copy prompt"}
                </button>
                <button type="button" onClick={() => download("portfolio-prompt.txt", prompt, "text/plain")} className="hover-tint" style={{ ...outline, minHeight: 42, padding: "0 16px", fontSize: 14 }}>
                  <Svg d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" size={15} />
                  Download .txt
                </button>
                <button type="button" onClick={() => setPromptOpen((o) => !o)} className="hover-tint" style={{ ...ghost, minHeight: 42, padding: "0 14px", fontSize: 14 }}>
                  {promptOpen ? "Hide the prompt" : "Read it first"}
                </button>
              </div>
              {copyErr ? <Alert>{copyErr}</Alert> : null}
            </div>

            <div style={{ position: "relative", isolation: "isolate" }}>
              <div aria-hidden="true" className="pf-glow" />
              <div style={{ ...panel, position: "relative", gap: 12, outline: "1.5px solid var(--color-accent-400)", outlineOffset: -1.5 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Build it here</h4>
                  <span style={{ ...pill, background: MARIGOLD }}>One trial per account</span>
                </div>
                {built ? (
                  <>
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>
                      Your build is done — made for {built.builtFor}
                      {builtLook ? ` in the ${STYLE_LABEL[builtLook].name} look` : ""}, {new Date(built.createdAt).toLocaleDateString("en-GB")}. The trial is used; the curated prompt is how you make more versions.
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          download(
                            "index.html",
                            exportPortfolioHtml(siteData, { theme: builtLook ?? choices.style, ...siteProps }),
                            "text/html",
                          )
                        } className="pf-solid" style={{ ...solid, minHeight: 44, padding: "0 22px", fontSize: 15 }}>
                        <Svg d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5" size={16} />
                        Download index.html
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: MUTED }}>
                      Open the file in any browser, or upload it to a free host such as GitHub Pages or Netlify. Read it through before you share it — it&rsquo;s your name on it.
                    </p>
                  </>
                ) : pending ? (
                  <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                      Writing and checking your page — usually 1–2 minutes. {elapsed >= 3 ? `${elapsed}s` : ""}
                    </p>
                    <div style={{ height: 10, borderRadius: 999, background: "var(--color-chip)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 999, background: MARIGOLD, width: buildW, transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: MUTED }}>{stage}</p>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>
                      {building
                        ? "Your portfolio is already being built in another tab. Reload in a minute to see it."
                        : `We write the page for you in the ${look.name} look, check every link and figure against your profile, and give you the file. Costs about ${formatCount(estimate)} tokens — most of a full analysis — and you get one build, so check the answers above first.`}
                    </p>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>
                      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ flex: "none", width: 18, height: 18, margin: "1px 0 0", accentColor: INK }} />
                      I&rsquo;ve checked my answers. Use my one build now.
                    </label>
                    <div>
                      <button
                        type="button"
                        onClick={build}
                        aria-disabled={buildDis}
                        style={{ ...solid, minHeight: 44, padding: "0 22px", fontSize: 15, opacity: buildDis ? 0.45 : 1, cursor: buildDis ? "not-allowed" : "pointer" }}
                      >
                        <Svg d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" size={16} />
                        Build my portfolio
                      </button>
                    </div>
                  </>
                )}
                {error ? <Alert>{error}</Alert> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {wall ? (
        <TokenWallDialog
          wall={wall}
          onClose={() => setWall(null)}
          onResume={() => {
            setWall(null);
            build();
          }}
          resumeLabel="Try again"
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ parts */

const eyebrow: CSSProperties = { margin: "0 0 10px", fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED };
const panel: CSSProperties = { background: RAISED, borderRadius: 24, padding: 22, display: "flex", flexDirection: "column", gap: 18 };
const panelTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3 };
const panelNote: CSSProperties = { margin: "4px 0 0", fontSize: 14, lineHeight: 1.55, color: MUTED, textWrap: "pretty" };
const badge: CSSProperties = { position: "absolute", display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 999, fontSize: 13, fontWeight: 800 };
const pill: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: INK };
const solid: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, border: 0, background: INK, color: MARIGOLD, fontWeight: 800, whiteSpace: "nowrap" };
const outline: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, border: `1.5px solid ${INK}`, background: "transparent", color: INK, fontWeight: 700, whiteSpace: "nowrap" };
const ghost: CSSProperties = { borderRadius: 999, border: 0, background: "transparent", color: INK, fontWeight: 700 };
const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 800 };
const inputStyle: CSSProperties = { height: 48, borderRadius: 14, border: "1.5px solid var(--color-line)", background: "var(--color-bg)", padding: "0 16px", fontSize: 15, fontWeight: 600, color: INK, outline: "none" };

function Step({ n }: { n: number }) {
  return (
    <span style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", background: MARIGOLD, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15 }}>{n}</span>
  );
}

function Svg({ d, size, stroke = 2.25, color = "currentColor" }: { d: string; size: number; stroke?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function RoundBtn({ label, disabled, onClick, d }: { label: string; disabled: boolean; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hover-tint"
      style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${INK}`, background: "transparent", display: "grid", placeItems: "center", color: INK, opacity: disabled ? 0.35 : 1 }}
    >
      <Svg d={d} size={18} stroke={2.4} />
    </button>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ background: "var(--color-danger-200)", borderRadius: 18, padding: "12px 16px", fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function useWindowWidth(): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(q.matches);
    const on = () => setR(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return r;
}

function useWidth<T extends HTMLElement>(): [number, (el: T | null) => void] {
  const [w, setW] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    obs.current?.disconnect();
    if (!el) return;
    obs.current = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    obs.current.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
  }, []);
  return [w, ref];
}

/** Shrink a photo before it lives in memory and in the page file. */
async function downscale(file: File, max: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
