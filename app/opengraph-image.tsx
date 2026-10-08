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
            <rect x="10" y="2.5" width="18" height="22" rx="3" fill="#ff9dc0" transform="rotate(9 19 13.5)" />
            <path d="M7 7H17L22 12V26A3 3 0 0 1 19 29H7A3 3 0 0 1 4 26V10A3 3 0 0 1 7 7Z" fill="#f9b130" />
            <path d="M17 7V10.5A1.5 1.5 0 0 0 18.5 12H22Z" fill="#e8971a" />
            <path d="M8 13.5h5M8 18h9M8 22.5h5" stroke="#4a0d0d" strokeWidth="2" strokeLinecap="round" />
            <circle cx="23.5" cy="23.5" r="6.5" fill="#4a0d0d" stroke="#f8f0e3" strokeWidth="1.8" />
            <path d="M20.9 23.6l1.8 1.8 3.5-3.7" fill="none" stroke="#f9b130" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
