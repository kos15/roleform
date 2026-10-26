/**
 * Curator guidance, not a gate: widely known YouTube creators per taxonomy root.
 *
 * `pnpm check:catalog` WARNS when a video's `author` is not listed for its
 * skill's root. A new name is fine — add it here after looking at the channel.
 * Names are written as YouTube's oEmbed `author_name` reports them. Keys are the
 * exact root names in `lib/catalog/taxonomy.ts`.
 */
export const KNOWN_CREATORS: Record<string, string[]> = {
  JavaScript: ["Fireship", "Web Dev Simplified", "Traversy Media", "freeCodeCamp.org", "Academind", "Net Ninja", "ByteGrad", "Syntax", "Cosden Solutions", "JavaScript Mastery", "Frontend Master", "Beyond Fireship", "Chrome for Developers"],
  Ruby: ["freeCodeCamp.org", "Fireship", "GoRails"],
  PHP: ["freeCodeCamp.org", "Fireship", "Traversy Media", "Laravel"],
  Scala: ["Telusko", "Fireship", "Rock the JVM"],
  "C++": ["freeCodeCamp.org", "Fireship", "The Cherno", "Bro Code"],
  HTML: ["Kevin Powell", "Fireship", "Web Dev Simplified", "Traversy Media", "freeCodeCamp.org", "JavaScript Mastery"],
  Python: ["Fireship", "Corey Schafer", "freeCodeCamp.org", "Tech With Tim", "mCoding", "ArjanCodes", "Programming with Mosh", "Telusko", "Andrej Karpathy", "Keith Galli"],
  Java: ["Fireship", "freeCodeCamp.org", "Amigoscode", "Programming with Mosh", "Telusko"],
  "C#": ["Fireship", "freeCodeCamp.org", "Nick Chapsas", "Tim Corey", "Programming with Mosh", "Julio Casal"],
  Go: ["freeCodeCamp.org", "Anthony GG", "TechWorld with Nana", "Fireship"],
  Rust: ["Let's Get Rusty", "Fireship", "freeCodeCamp.org", "Jon Gjengset", "Traversy Media"],
  SQL: ["freeCodeCamp.org", "Programming with Mosh", "Alex The Analyst", "Fireship", "NeuralNine", "coder2j", "Google Cloud Tech", "The Data and AI Guy", "techTFQ", "codebasics", "Jie Jenn", "Tom Bailey"],
  "REST APIs": ["freeCodeCamp.org", "Fireship", "Hussein Nasser", "ByteByteGo", "Traversy Media"],
  MongoDB: ["MongoDB", "freeCodeCamp.org", "Traversy Media", "Fireship"],
  Elasticsearch: ["Official Elastic Community", "IBM Technology", "freeCodeCamp.org"],
  Redis: ["Redis", "Hussein Nasser", "freeCodeCamp.org", "Fireship"],
  AWS: ["freeCodeCamp.org", "TechWorld with Nana", "Be A Better Dev", "Amazon Web Services", "Digital Cloud Training"],
  "Google Cloud": ["freeCodeCamp.org", "Google Cloud Tech", "TechWorld with Nana"],
  Azure: ["freeCodeCamp.org", "John Savill's Technical Training", "TechWorld with Nana"],
  Linux: ["Fireship", "TechWorld with Nana", "NetworkChuck", "freeCodeCamp.org", "Learn Linux TV", "The Linux Foundation"],
  Terraform: ["Fireship", "TechWorld with Nana", "freeCodeCamp.org", "HashiCorp", "Travis Media"],
  Observability: ["TechWorld with Nana", "Grafana", "freeCodeCamp.org", "Hussein Nasser", "Tech Tutorials with Piyush", "PagerDuty Inc."],
  "System Design": ["ByteByteGo", "Hussein Nasser", "freeCodeCamp.org", "Gaurav Sen", "Fireship", "TechWorld with Nana"],
  Git: ["freeCodeCamp.org", "Fireship", "Traversy Media", "Academind", "The Coding Train", "TechWorld with Nana"],
  "Unit Testing": ["Fireship", "freeCodeCamp.org", "Web Dev Simplified", "Academind", "RoadsideCoder", "Programming with Mosh", "Amigoscode"],
  "LLM Applications": ["Fireship", "freeCodeCamp.org", "Andrej Karpathy", "AI Jason"],
  Flutter: ["Flutter", "freeCodeCamp.org", "Fireship", "Academind"],
  Kotlin: ["Fireship", "freeCodeCamp.org", "Philipp Lackner", "Android Developers"],
  Swift: ["Fireship", "freeCodeCamp.org", "Sean Allen", "Paul Hudson", "CodeWithChris"],
  "Application Security": ["freeCodeCamp.org", "NetworkChuck", "Fireship", "LiveOverflow"],
  Authentication: ["Fireship", "freeCodeCamp.org", "Web Dev Simplified", "Hussein Nasser", "OktaDev"],
  "Data Visualization": ["Corey Schafer", "freeCodeCamp.org", "NeuralNine"],
  "UX Research": ["NNgroup", "Kevin Liang | Zero to UX"],
  Figma: ["freeCodeCamp.org", "Kevin Stratvert"],
  "Technical Leadership": ["LeadDev", "GOTO Conferences", "Aced (formerly Exponent)"],
  "Stakeholder Management": ["Augmented", "AltexSoft", "NNgroup"],
  "Product Thinking": ["The Product Engineers Podcast", "EO", "Product Driven"],
  Agile: ["Atlassian", "freeCodeCamp.org", "Scrum.org", "David McLachlan"],
};
