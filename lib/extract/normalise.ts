/**
 * Pure text clean-up for extracted documents. No I/O, no imports — the same
 * functions run on every format, so a PDF and a DOCX of one résumé reach the
 * model looking alike.
 *
 * Nothing here changes a word. It only removes what extraction leaves behind
 * (ligatures, soft hyphens, control bytes, runs of blank lines) so the model
 * spends its tokens on the résumé rather than on noise.
 */

/** Hard ceiling on what reaches the model. A long CV is ~15k characters. */
export const MAX_RESUME_CHARS = 40_000;

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

export function cleanExtractedText(raw: string): string {
  return (
    raw
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
      // soft hyphen, zero-width chars, BOM
      .replace(/[­​-‍⁠﻿]/g, "")
      // control bytes except tab and newline
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // bullets glyphs → a plain marker the model reads as "new bullet"
      .replace(/^[ \t]*[•●▪■◦‣∙·][ \t]*/gm, "- ")
      .replace(/[ \t ]+/g, " ")
      .replace(/ +\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Trims to the ceiling on a line boundary, so no bullet is cut mid-word. */
export function clampForModel(text: string, max = MAX_RESUME_CHARS): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const cut = text.lastIndexOf("\n", max);
  return { text: text.slice(0, cut > max * 0.8 ? cut : max), clipped: true };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  bull: "•",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** HTML → text with block structure kept as line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|head|svg|noscript)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|ul|ol|table)>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  );
}

/** OpenDocument content.xml → text. */
export function odfXmlToText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<text:tab\s*\/>/g, "\t")
      .replace(/<text:line-break\s*\/>/g, "\n")
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n?: string) => " ".repeat(n ? Number(n) : 1))
      .replace(/<text:list-item[^>]*>/g, "- ")
      .replace(/<\/text:(p|h)>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/**
 * RTF → text. A small state machine, not a full parser: it keeps the body text,
 * honours paragraph/line/tab controls and hex/unicode escapes, and drops the
 * destinations that hold no visible text (font tables, pictures, metadata).
 */
export function rtfToText(rtf: string): string {
  const SKIP_DESTINATIONS = new Set([
    // Headers and footers are kept: résumés often put the name and contact
    // details there.
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "listtable", "listoverridetable",
    "rsidtbl", "generator", "xmlnstbl", "themedata", "colorschememapping", "latentstyles",
    "datastore", "fldinst",
  ]);
  const out: string[] = [];
  // stack of "skip this group" flags
  const stack: boolean[] = [];
  let skip = false;
  let ucSkip = 1;
  let pendingSkip = 0;
  let i = 0;

  while (i < rtf.length) {
    const ch = rtf[i]!;
    if (ch === "{") {
      stack.push(skip);
      i++;
      continue;
    }
    if (ch === "}") {
      skip = stack.pop() ?? false;
      i++;
      continue;
    }
    if (ch === "\\") {
      const next = rtf[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (!skip) out.push(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        if (pendingSkip > 0) pendingSkip--;
        else if (!skip) out.push(cp1252(parseInt(hex, 16)));
        i += 4;
        continue;
      }
      if (next === "*") {
        skip = true;
        i += 2;
        continue;
      }
      if (next === "~") {
        if (!skip) out.push(" ");
        i += 2;
        continue;
      }
      if (next === "-" || next === "_") {
        i += 2;
        continue;
      }
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 40));
      if (!m) {
        i++;
        continue;
      }
      const word = m[1]!;
      const arg = m[2] !== undefined ? Number(m[2]) : null;
      i += m[0].length;
      if (SKIP_DESTINATIONS.has(word)) {
        skip = true;
        continue;
      }
      if (skip) continue;
      if (word === "par" || word === "line" || word === "row") out.push("\n");
      else if (word === "tab" || word === "cell") out.push("\t");
      else if (word === "bullet") out.push("•");
      else if (word === "emdash") out.push("—");
      else if (word === "endash") out.push("–");
      else if (word === "uc" && arg !== null) ucSkip = arg;
      else if (word === "u" && arg !== null) {
        out.push(String.fromCharCode(arg < 0 ? arg + 65536 : arg));
        pendingSkip = ucSkip;
      }
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (pendingSkip > 0) {
      pendingSkip--;
    } else if (!skip) {
      out.push(ch);
    }
    i++;
  }
  return out.join("");
}

const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ",
  0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“",
  0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

function cp1252(code: number): string {
  if (!Number.isFinite(code)) return "";
  return CP1252[code] ?? String.fromCharCode(code);
}
