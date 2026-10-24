/**
 * Curator guidance, not a gate: widely known YouTube creators per taxonomy root.
 *
 * `pnpm check:catalog` WARNS when a video's `author` is not listed for its
 * skill's root. A new name is fine — add it here after looking at the channel.
 * Names are written as YouTube's oEmbed `author_name` reports them. Keys are the
 * exact root names in `lib/catalog/taxonomy.ts`.
 */
export const KNOWN_CREATORS: Record<string, string[]> = {
  JavaScript: ["Fireship", "Web Dev Simplified", "Traversy Media", "freeCodeCamp.org", "Academind", "Net Ninja"],
  HTML: ["Kevin Powell", "Fireship", "Web Dev Simplified", "Traversy Media", "freeCodeCamp.org"],
  Python: ["Corey Schafer", "freeCodeCamp.org", "Tech With Tim", "mCoding", "ArjanCodes"],
  Java: ["freeCodeCamp.org", "Amigoscode", "Programming with Mosh", "Telusko"],
  "C#": ["freeCodeCamp.org", "Nick Chapsas", "Tim Corey", "Programming with Mosh"],
  Go: ["freeCodeCamp.org", "Anthony GG", "TechWorld with Nana", "Fireship"],
  Rust: ["Let's Get Rusty", "Fireship", "freeCodeCamp.org", "Jon Gjengset"],
  SQL: ["freeCodeCamp.org", "Programming with Mosh", "Alex The Analyst", "Fireship"],
  "REST APIs": ["freeCodeCamp.org", "Hussein Nasser", "ByteByteGo", "Traversy Media"],
  MongoDB: ["MongoDB", "freeCodeCamp.org", "Traversy Media", "Fireship"],
  Redis: ["Redis", "Hussein Nasser", "freeCodeCamp.org", "Fireship"],
  AWS: ["freeCodeCamp.org", "TechWorld with Nana", "Be A Better Dev", "Amazon Web Services"],
  "Google Cloud": ["freeCodeCamp.org", "Google Cloud Tech", "TechWorld with Nana"],
  Azure: ["freeCodeCamp.org", "John Savill's Technical Training", "TechWorld with Nana"],
  Linux: ["NetworkChuck", "freeCodeCamp.org", "Learn Linux TV", "The Linux Foundation"],
  Terraform: ["TechWorld with Nana", "freeCodeCamp.org", "HashiCorp", "Travis Media"],
  Observability: ["TechWorld with Nana", "Grafana", "freeCodeCamp.org", "Hussein Nasser"],
  "System Design": ["ByteByteGo", "Hussein Nasser", "freeCodeCamp.org", "Gaurav Sen", "Fireship"],
  Git: ["freeCodeCamp.org", "Fireship", "Traversy Media", "Academind", "The Coding Train"],
  "Unit Testing": ["Fireship", "freeCodeCamp.org", "Web Dev Simplified", "Academind"],
  "LLM Applications": ["Fireship", "freeCodeCamp.org", "Andrej Karpathy", "AI Jason"],
  Flutter: ["Flutter", "freeCodeCamp.org", "Fireship", "Academind"],
  Kotlin: ["freeCodeCamp.org", "Philipp Lackner", "Android Developers"],
  Swift: ["freeCodeCamp.org", "Sean Allen", "Paul Hudson", "CodeWithChris"],
  "Application Security": ["freeCodeCamp.org", "NetworkChuck", "Fireship", "LiveOverflow"],
  Authentication: ["Fireship", "freeCodeCamp.org", "Web Dev Simplified", "Hussein Nasser"],
  Agile: ["Atlassian", "freeCodeCamp.org", "Scrum.org"],
};
