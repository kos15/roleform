import "server-only";
import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import { cleanExtractedText, htmlToText, odfXmlToText, rtfToText } from "./normalise";
import { ACCEPTED_LABEL, MAX_UPLOAD_BYTES } from "./formats";

export { ACCEPT_ATTR, ACCEPTED_LABEL, MAX_UPLOAD_BYTES } from "./formats";

/**
 * Raw text extraction. The LLM does the structuring (F1) — this layer only
 * gets characters out of a file, and refuses clearly when it cannot.
 *
 * MIME is sniffed from the bytes, never trusted from the extension (specs §11).
 * The extension is consulted only to pick between formats that have no magic
 * bytes at all (plain text, Markdown, HTML, RTF saved without a header) — it
 * never upgrades a binary to "text".
 *
 * Scans and photos have no text to extract here. They come back with
 * `needsOcr: true` and an empty `text`; the onboarding flow transcribes them
 * with a vision call (lib/ai/transcribe.ts). Callers that cannot do that —
 * the JD upload — refuse them with `requireText`.
 */

export type ExtractedKind =
  | "pdf"
  | "docx"
  | "doc"
  | "odt"
  | "rtf"
  | "txt"
  | "md"
  | "html"
  | "png"
  | "jpg"
  | "webp"
  | "gif";

export interface Extracted {
  kind: ExtractedKind;
  mime: string;
  /** Cleaned text. Empty when `needsOcr`. */
  text: string;
  /** A scan or a photo: the text is in the pixels and needs a vision pass. */
  needsOcr: boolean;
}

const BINARY: Record<string, ExtractedKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/x-cfb": "doc",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_OF: Record<ExtractedKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Known formats we can't read, with the fix the user can make. */
const UNSUPPORTED_HINT: Record<string, string> = {
  "image/heic": "HEIC photos can't be read yet. Export it as JPG or PNG and upload that.",
  "image/heif": "HEIC photos can't be read yet. Export it as JPG or PNG and upload that.",
  "image/tiff": "TIFF scans can't be read yet. Save it as PDF, JPG or PNG.",
  "application/zip": "That's a zip or an Apple Pages file. Export it as PDF or DOCX and upload that.",
  "application/x-apple-pages": "Pages files can't be read directly. Use File → Export To → PDF or Word.",
};

export async function extractText(
  buffer: Buffer,
  declaredFilename: string,
): Promise<Result<Extracted>> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return err(appError("invalid_input", "That file is over the 4 MB limit."));
  }
  if (buffer.byteLength === 0) {
    return err(appError("invalid_input", "That file is empty."));
  }

  const ext = extensionOf(declaredFilename);
  // A byte-order mark means text, whatever a sniffer makes of the next bytes:
  // UTF-16's FF FE is also an MP3 frame header, and file-type says "audio".
  const sniffed = hasBom(buffer) ? undefined : await fileTypeFromBuffer(buffer);
  let kind: ExtractedKind | undefined = sniffed ? BINARY[sniffed.mime] : undefined;

  if (!sniffed) {
    // No magic bytes. Only text-shaped content gets here; the extension picks
    // which text format, and anything undecodable is refused.
    const decoded = decodeText(buffer);
    if (decoded === null) return unsupported(sniffed, ext);
    kind = /^\s*\{\\rtf/.test(decoded)
      ? "rtf"
      : ext === "html" || ext === "htm" || /^\s*<(!doctype html|html)/i.test(decoded)
        ? "html"
        : ext === "md" || ext === "markdown"
          ? "md"
          : "txt";
    return finish(kind, toText(kind, decoded));
  }

  if (!kind) return unsupported(sniffed, ext);

  switch (kind) {
    case "png":
    case "jpg":
    case "webp":
    case "gif":
      return ok({ kind, mime: MIME_OF[kind], text: "", needsOcr: true });
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "doc":
      return extractDoc(buffer);
    case "odt":
      return extractOdt(buffer);
    case "rtf":
      return finish("rtf", rtfToText(buffer.toString("latin1")));
    default:
      return unsupported(sniffed, ext);
  }
}

/** For callers that cannot run a vision pass (the JD upload). */
export function requireText(extracted: Extracted): Result<Extracted> {
  if (!extracted.needsOcr) return ok(extracted);
  return err(
    appError(
      "no_text_layer",
      "That file is an image, so there's no text to read. Paste the posting text instead.",
    ),
  );
}

function finish(kind: ExtractedKind, raw: string): Result<Extracted> {
  const text = cleanExtractedText(raw);
  if (text.length < 40) {
    return err(appError("extraction_failed", "We couldn't find enough text in that file to work with."));
  }
  return ok({ kind, mime: MIME_OF[kind], text, needsOcr: false });
}

function toText(kind: ExtractedKind, decoded: string): string {
  if (kind === "html") return htmlToText(decoded);
  if (kind === "rtf") return rtfToText(decoded);
  return decoded;
}

async function extractDocx(buffer: Buffer): Promise<Result<Extracted>> {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return finish("docx", value);
  } catch (e) {
    return err(
      appError("extraction_failed", "We couldn't read that Word document. Try saving it again as .docx or PDF.", errCode(e)),
    );
  }
}

async function extractDoc(buffer: Buffer): Promise<Result<Extracted>> {
  try {
    // Lazy: only legacy .doc uploads pay for loading the OLE reader.
    const { default: WordExtractor } = await import("word-extractor");
    const doc = await new WordExtractor().extract(buffer);
    const parts = [doc.getHeaders({ includeFooters: true }), doc.getBody(), doc.getTextboxes?.({ includeHeadersAndFooters: false, includeBody: true })];
    return finish("doc", parts.filter(Boolean).join("\n"));
  } catch (e) {
    return err(
      appError(
        "extraction_failed",
        "We couldn't read that file as a Word .doc. Save it as .docx or PDF and try again.",
        errCode(e),
      ),
    );
  }
}

async function extractOdt(buffer: Buffer): Promise<Result<Extracted>> {
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    // Only content.xml is inflated, and only if its declared size is sane — a
    // crafted archive can't make us inflate gigabytes.
    const files = unzipSync(new Uint8Array(buffer), {
      filter: (f) => f.name === "content.xml" && f.originalSize < 20 * 1024 * 1024,
    });
    const xml = files["content.xml"];
    if (!xml) return err(appError("extraction_failed", "That OpenDocument file has no readable text."));
    return finish("odt", odfXmlToText(strFromU8(xml)));
  } catch (e) {
    return err(appError("extraction_failed", "We couldn't read that .odt file. Save it as PDF or DOCX.", errCode(e)));
  }
}

async function extractPdf(buffer: Buffer): Promise<Result<Extracted>> {
  // Imported lazily: unpdf pulls in a sizeable worker we don't want in every
  // route's bundle.
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");

  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await unpdfExtract(doc, { mergePages: true });
    const cleaned = cleanExtractedText(Array.isArray(text) ? text.join("\n") : text);

    // F1 acceptance: an image-only PDF is never handed on as silent garbage.
    // It now goes to the vision pass instead of being refused.
    if (cleaned.length < 40) return ok({ kind: "pdf", mime: MIME_OF.pdf, text: "", needsOcr: true });
    return ok({ kind: "pdf", mime: MIME_OF.pdf, text: cleaned, needsOcr: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/password|encrypt/i.test(message)) {
      return err(
        appError(
          "encrypted_pdf",
          "This PDF is password-protected. Remove the protection and upload it again.",
        ),
      );
    }
    return err(appError("extraction_failed", "We couldn't read that PDF. Try exporting it again, or upload a DOCX.", errCode(e)));
  }
}

function unsupported(sniffed: { mime: string } | undefined, ext: string): Result<Extracted> {
  const mime = sniffed?.mime ?? "application/octet-stream";
  const hint = UNSUPPORTED_HINT[mime] ?? (ext === "pages" ? UNSUPPORTED_HINT["application/x-apple-pages"] : undefined);
  return err(
    appError(
      "invalid_input",
      hint ?? `That file type isn't supported. Upload a ${ACCEPTED_LABEL}.`,
      `sniffed:${mime} name:${ext}`,
    ),
  );
}

/**
 * Decodes a buffer with no magic bytes as text, or returns null if it is
 * binary. Handles the UTF-16 files Windows Notepad writes, which the old
 * NUL-byte check rejected as binary.
 */
function decodeText(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2, 2 + ((buffer.byteLength - 2) & ~1));
    const swapped = Buffer.from(body);
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const sample = buffer.subarray(0, 4096);
  for (const byte of sample) {
    if (byte === 0) return null; // NUL — binary
  }
  const utf8 = buffer.toString("utf8");
  // Many replacement characters means it was Latin-1/CP1252, not UTF-8.
  const bad = (utf8.match(/�/g) ?? []).length;
  return bad > 3 ? buffer.toString("latin1") : utf8;
}

function hasBom(buffer: Buffer): boolean {
  return (
    (buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer[0] === 0xfe && buffer[1] === 0xff) ||
    (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf)
  );
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

/** N7: log a shape, never the document. */
function errCode(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}
