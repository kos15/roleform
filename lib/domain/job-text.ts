/**
 * Provider text → display text (F22.1, R28). PURE.
 *
 * Boards hand back titles like "Intern - Fullstack &amp; AI " and snippets
 * wrapped in `<strong>`. Every listing passes through here before it is
 * stored, so the page never renders markup it didn't write and the health
 * check can tell a board that has started returning junk from one that is
 * merely terse. Rendering is always React-escaped as well; this is about
 * legibility, not safety.
 */

function numericEntity(cp: number): string {
  return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec: string) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex: string) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Tags out, block breaks kept as newlines, entities decoded, whitespace tidied. */
export function cleanText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A single line: for titles, companies and locations. */
export function cleanLine(text: string): string {
  return cleanText(text).replace(/\s+/g, " ").trim();
}

/** True when a string still carries markup or entity residue after a provider sent it. */
export function hasResidue(text: string): boolean {
  return /&(amp|lt|gt|quot|nbsp|#\d+);|<\/?[a-z][^>]*>/i.test(text);
}
