import "server-only";
import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Raw text extraction. The LLM does the structuring (F1) — this layer only
 * gets characters out of a file, and refuses clearly when it cannot.
 *
 * MIME is sniffed from the bytes, never trusted from the extension (specs §11).
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ExtractedKind = "pdf" | "docx" | "txt";

export interface Extracted {
  kind: ExtractedKind;
  mime: string;
  text: string;
}

const ACCEPTED = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
} as const satisfies Record<string, ExtractedKind>;

export async function extractText(
  buffer: Buffer,
  declaredFilename: string,
): Promise<Result<Extracted>> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return err(appError("invalid_input", "That file is over the 5 MB limit."));
  }
  if (buffer.byteLength === 0) {
    return err(appError("invalid_input", "That file is empty."));
  }

  const sniffed = await fileTypeFromBuffer(buffer);
  // file-type cannot sniff plain text — it has no magic bytes. Fall back to a
  // decodability check rather than trusting the extension.
  const mime = sniffed?.mime ?? (looksLikeText(buffer) ? "text/plain" : "application/octet-stream");

  const kind = (ACCEPTED as Record<string, ExtractedKind | undefined>)[mime];
  if (!kind) {
    return err(
      appError(
        "invalid_input",
        "That file type isn't supported. Upload a PDF, DOCX, or plain text file.",
        `sniffed:${mime} name:${extensionOf(declaredFilename)}`,
      ),
    );
  }

  if (kind === "txt") {
    return ok({ kind, mime, text: buffer.toString("utf8").trim() });
  }

  if (kind === "docx") {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = value.trim();
      if (!text) return err(appError("extraction_failed", "We couldn't read any text from that document."));
      return ok({ kind, mime, text });
    } catch (e) {
      return err(
        appError(
          "extraction_failed",
          "We couldn't read that Word document. Try re-saving it as .docx.",
          errCode(e),
        ),
      );
    }
  }

  return extractPdf(buffer, mime);
}

async function extractPdf(buffer: Buffer, mime: string): Promise<Result<Extracted>> {
  // Imported lazily: unpdf pulls in a sizeable worker we don't want in every
  // route's bundle.
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");

  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await unpdfExtract(doc, { mergePages: true });
    const trimmed = (Array.isArray(text) ? text.join("\n") : text).trim();

    // F1 acceptance: an image-only PDF is told, never handed silent garbage.
    if (trimmed.length < 40) {
      return err(
        appError(
          "no_text_layer",
          "This PDF has no text layer — it's an image of a document. Upload a text version, or paste the text instead.",
        ),
      );
    }
    return ok({ kind: "pdf", mime, text: trimmed });
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
    return err(appError("extraction_failed", "We couldn't read that PDF.", errCode(e)));
  }
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024);
  for (const byte of sample) {
    if (byte === 0) return false; // NUL — binary
  }
  return true;
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

/** N7: log a shape, never the document. */
function errCode(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}
