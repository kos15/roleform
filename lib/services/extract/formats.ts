/**
 * Upload formats and limits. No `server-only`: the drop zones read these too,
 * so the picker, the copy and the server check can't drift apart.
 */

/**
 * 4 MB, not 5: Vercel caps a function's request body at 4.5 MB, and an upload
 * over that never reached our own check — it failed in the platform with no
 * message the user could act on.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** What the file pickers accept. */
export const ACCEPT_ATTR = [
  ".pdf", ".docx", ".doc", ".odt", ".rtf", ".txt", ".md", ".markdown", ".html", ".htm",
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/html",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

/** For copy: the formats in the order a person thinks of them. */
export const ACCEPTED_LABEL = "PDF, Word (DOCX/DOC), ODT, RTF, TXT, Markdown, HTML or a photo (JPG/PNG/WEBP)";

/** The short form for a drop zone's subline. */
export const ACCEPTED_SHORT = "PDF, Word, ODT, RTF, TXT, Markdown, HTML or a photo";

/** The JD drop zone: documents only — a posting photo has no OCR pass (yet). */
export const ACCEPT_DOCUMENT_ATTR = ACCEPT_ATTR.split(",")
  .filter((t) => !t.startsWith("image/") && ![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(t))
  .join(",");

export const ACCEPTED_DOCUMENT_SHORT = "PDF, Word, ODT, RTF, TXT, Markdown or HTML";
