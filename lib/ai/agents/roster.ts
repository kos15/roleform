import "server-only";
import { profileReader } from "./profile-reader";
import { documentTranscriber } from "./document-transcriber";
import { postingReader } from "./posting-reader";
import { bulletTailor } from "./bullet-tailor";
import { summaryTailor } from "./summary-tailor";

/**
 * Every agent, by name (agent design §6.2). The eval harness and the docs read
 * this; production code imports the agent it calls directly.
 */
export const AGENTS = {
  [profileReader.name]: profileReader,
  [documentTranscriber.name]: documentTranscriber,
  [postingReader.name]: postingReader,
  [bulletTailor.name]: bulletTailor,
  [summaryTailor.name]: summaryTailor,
} as const;
