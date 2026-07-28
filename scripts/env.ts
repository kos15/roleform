/**
 * Loads .env.local for scripts, if present.
 *
 * Node 20 has no --env-file-if-exists, and a missing file must not be an error:
 * the pure checks (coverage, round-trip, samples) run with no environment at
 * all, which is part of why they're the cheap ones to run.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
