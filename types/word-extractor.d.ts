// word-extractor ships no types. Only the surface lib/extract/text.ts uses.
declare module "word-extractor" {
  interface WordDocument {
    getBody(options?: { filterUnicode?: boolean }): string;
    getHeaders(options?: { filterUnicode?: boolean; includeFooters?: boolean }): string;
    getTextboxes?(options?: { includeHeadersAndFooters?: boolean; includeBody?: boolean }): string;
  }
  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }
}
