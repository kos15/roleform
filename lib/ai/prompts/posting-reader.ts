import type { PostingReaderInput } from "../agents/posting-reader";

export function staticContext(): string {
  return "Extract the requirements from this posting.";
}

export function dynamicContext(i: PostingReaderInput): string {
  return `<posting>\n${i.text}\n</posting>`;
}
