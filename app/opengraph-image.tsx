import { ImageResponse } from "next/og";

/**
 * The social/share card, drawn at request time so it can never go stale.
 * Literal colours: this renders to a PNG outside the stylesheet, so the
 * tokens (N9) cannot reach it — the values are the same ones.
 */
export const alt = "Roleform — one résumé in, eleven tailored out. Nothing invented.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(180deg, #f8f0e3 0%, #f7ecd6 55%, #f8e4b4 100%)",
          color: "#4a0d0d",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <path d="M2.5 16C9 8.6 23 8.6 29.5 16C23 23.4 9 23.4 2.5 16Z" fill="#f9b130" />
            <path d="M16 2.5C23.4 9 23.4 23 16 29.5C8.6 23 8.6 9 16 2.5Z" fill="#ff9dc0" />
            <circle cx="16" cy="16" r="4.6" fill="#f8f0e3" />
            <circle cx="16" cy="16" r="2" fill="#4a0d0d" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 1 }}>ROLEFORM.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2 }}>
            ONE RÉSUMÉ IN.
          </div>
          <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2 }}>
            ELEVEN TAILORED OUT.
          </div>
          <div style={{ fontSize: 32, marginTop: 28, color: "#7a5647", maxWidth: 900 }}>
            Tailor your resume to any job description — ATS-rated templates, interview questions and skill gaps. Nothing invented.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["ATS-rated templates", "Interview prep", "Skill gaps"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                background: t === "Interview prep" ? "#ff9dc0" : "#f9b130",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
