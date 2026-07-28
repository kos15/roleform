/**
 * Canonical skill vocabulary + alias table (M3.4). PURE data.
 *
 * This table is what lets "JS", "Javascript" and "ECMAScript" all resolve to
 * one requirement instead of three, and it is the thing embeddings would only
 * replace if maintaining it became the bottleneck (specs D5) — candidate
 * generation only, never status assignment.
 *
 * Alias rules: lowercase, no punctuation-only variants (normalisation handles
 * those), and never an alias that would collapse two genuinely different
 * skills. "RTL" means React Testing Library here; if a posting means
 * right-to-left, the surrounding requirement text still reads correctly.
 */

export interface SkillDef {
  name: string;
  category:
    | "language"
    | "frontend"
    | "backend"
    | "data"
    | "cloud"
    | "devops"
    | "mobile"
    | "testing"
    | "design"
    | "practice"
    | "security"
    | "ai";
  aliases: string[];
}

export const SKILLS: SkillDef[] = [
  // languages
  { name: "JavaScript", category: "language", aliases: ["js", "ecmascript", "es6", "es2015", "vanilla js"] },
  { name: "TypeScript", category: "language", aliases: ["ts", "typescipt"] },
  { name: "Python", category: "language", aliases: ["py", "python3"] },
  { name: "Java", category: "language", aliases: ["core java", "java se"] },
  { name: "C#", category: "language", aliases: ["csharp", "c sharp", ".net c#"] },
  { name: "Go", category: "language", aliases: ["golang"] },
  { name: "Rust", category: "language", aliases: [] },
  { name: "Ruby", category: "language", aliases: [] },
  { name: "PHP", category: "language", aliases: [] },
  { name: "Kotlin", category: "language", aliases: [] },
  { name: "Swift", category: "language", aliases: [] },
  { name: "Scala", category: "language", aliases: [] },
  { name: "C++", category: "language", aliases: ["cpp", "c plus plus"] },
  { name: "SQL", category: "language", aliases: ["structured query language", "ansi sql"] },
  { name: "Bash", category: "language", aliases: ["shell scripting", "shell", "zsh scripting"] },

  // frontend
  { name: "React", category: "frontend", aliases: ["react.js", "reactjs", "react 18", "react 19"] },
  { name: "Next.js", category: "frontend", aliases: ["nextjs", "next js", "next 15", "app router"] },
  { name: "Angular", category: "frontend", aliases: ["angular 2+", "angularjs", "angular.io"] },
  { name: "Vue.js", category: "frontend", aliases: ["vue", "vuejs", "vue 3", "nuxt"] },
  { name: "Svelte", category: "frontend", aliases: ["sveltekit"] },
  { name: "HTML", category: "frontend", aliases: ["html5", "semantic html"] },
  { name: "CSS", category: "frontend", aliases: ["css3", "scss", "sass", "less"] },
  { name: "Tailwind CSS", category: "frontend", aliases: ["tailwind", "tailwindcss"] },
  { name: "Redux", category: "frontend", aliases: ["redux toolkit", "rtk"] },
  { name: "RxJS", category: "frontend", aliases: ["reactive extensions", "observables"] },
  { name: "Web Accessibility", category: "frontend", aliases: ["a11y", "wcag", "aria", "accessibility"] },
  { name: "Web Performance", category: "frontend", aliases: ["core web vitals", "lighthouse", "page speed"] },

  // backend
  { name: "Node.js", category: "backend", aliases: ["node", "nodejs"] },
  { name: "Express", category: "backend", aliases: ["express.js", "expressjs"] },
  { name: "NestJS", category: "backend", aliases: ["nest.js", "nest"] },
  { name: "Django", category: "backend", aliases: ["django rest framework", "drf"] },
  { name: "Flask", category: "backend", aliases: [] },
  { name: "FastAPI", category: "backend", aliases: ["fast api"] },
  { name: "Spring Boot", category: "backend", aliases: ["spring", "springboot"] },
  { name: "Ruby on Rails", category: "backend", aliases: ["rails", "ror"] },
  { name: "ASP.NET", category: "backend", aliases: [".net", "dotnet", ".net core", "asp.net core"] },
  { name: "REST APIs", category: "backend", aliases: ["rest", "restful", "restful apis", "http apis"] },
  { name: "GraphQL", category: "backend", aliases: ["apollo", "graph ql"] },
  { name: "gRPC", category: "backend", aliases: ["grpc", "protobuf", "protocol buffers"] },
  { name: "Microservices", category: "backend", aliases: ["microservice architecture", "service oriented architecture", "soa"] },
  { name: "Message Queues", category: "backend", aliases: ["rabbitmq", "sqs", "pub/sub", "event driven"] },
  { name: "Apache Kafka", category: "backend", aliases: ["kafka"] },
  { name: "WebSockets", category: "backend", aliases: ["websocket", "socket.io"] },

  // data
  { name: "PostgreSQL", category: "data", aliases: ["postgres", "psql", "pg"] },
  { name: "MySQL", category: "data", aliases: ["mariadb"] },
  { name: "MongoDB", category: "data", aliases: ["mongo", "nosql document store"] },
  { name: "Redis", category: "data", aliases: ["redis cache", "elasticache"] },
  { name: "Elasticsearch", category: "data", aliases: ["elastic", "opensearch", "elk"] },
  { name: "Data Modeling", category: "data", aliases: ["schema design", "database design", "normalisation", "normalization"] },
  { name: "ETL", category: "data", aliases: ["elt", "data pipelines", "data engineering"] },
  { name: "Apache Spark", category: "data", aliases: ["spark", "pyspark"] },
  { name: "dbt", category: "data", aliases: ["data build tool"] },
  { name: "Airflow", category: "data", aliases: ["apache airflow", "dags"] },
  { name: "Snowflake", category: "data", aliases: [] },
  { name: "BigQuery", category: "data", aliases: ["google bigquery", "bq"] },
  { name: "Pandas", category: "data", aliases: ["pandas dataframe"] },
  { name: "Data Visualization", category: "data", aliases: ["dataviz", "tableau", "power bi", "looker"] },

  // cloud + devops
  { name: "AWS", category: "cloud", aliases: ["amazon web services", "ec2", "s3", "lambda"] },
  { name: "Google Cloud", category: "cloud", aliases: ["gcp", "google cloud platform"] },
  { name: "Azure", category: "cloud", aliases: ["microsoft azure"] },
  { name: "Docker", category: "devops", aliases: ["containers", "containerisation", "containerization"] },
  { name: "Kubernetes", category: "devops", aliases: ["k8s", "eks", "gke", "aks"] },
  { name: "Terraform", category: "devops", aliases: ["infrastructure as code", "iac", "opentofu"] },
  { name: "CI/CD", category: "devops", aliases: ["continuous integration", "continuous delivery", "github actions", "jenkins", "gitlab ci", "circleci"] },
  { name: "Observability", category: "devops", aliases: ["monitoring", "datadog", "prometheus", "grafana", "opentelemetry", "otel"] },
  { name: "Linux", category: "devops", aliases: ["unix", "ubuntu", "debian"] },
  { name: "Nginx", category: "devops", aliases: ["reverse proxy", "load balancing"] },
  { name: "Serverless", category: "cloud", aliases: ["lambda functions", "cloud functions", "edge functions"] },

  // mobile
  { name: "React Native", category: "mobile", aliases: ["react-native", "rn"] },
  { name: "Flutter", category: "mobile", aliases: ["dart flutter"] },
  { name: "iOS Development", category: "mobile", aliases: ["ios", "swiftui", "uikit"] },
  { name: "Android Development", category: "mobile", aliases: ["android", "jetpack compose"] },

  // testing
  { name: "Unit Testing", category: "testing", aliases: ["jest", "vitest", "junit", "pytest", "xunit"] },
  { name: "React Testing Library", category: "testing", aliases: ["rtl", "testing library"] },
  { name: "End-to-End Testing", category: "testing", aliases: ["e2e", "cypress", "playwright", "selenium"] },
  { name: "Test-Driven Development", category: "testing", aliases: ["tdd"] },

  // security
  { name: "Authentication", category: "security", aliases: ["auth", "oauth", "oauth2", "openid connect", "oidc", "sso", "jwt"] },
  { name: "Application Security", category: "security", aliases: ["appsec", "owasp", "secure coding"] },
  { name: "Encryption", category: "security", aliases: ["tls", "ssl", "cryptography", "at-rest encryption"] },

  // ai
  { name: "Machine Learning", category: "ai", aliases: ["ml", "scikit-learn", "sklearn"] },
  { name: "Deep Learning", category: "ai", aliases: ["neural networks", "pytorch", "tensorflow"] },
  { name: "LLM Applications", category: "ai", aliases: ["llm", "large language models", "genai", "generative ai", "prompt engineering", "rag"] },
  { name: "NLP", category: "ai", aliases: ["natural language processing"] },
  { name: "Vector Databases", category: "ai", aliases: ["pinecone", "pgvector", "embeddings search"] },

  // design
  { name: "Figma", category: "design", aliases: ["figma design"] },
  { name: "Design Systems", category: "design", aliases: ["component library", "design tokens", "storybook"] },
  { name: "UX Research", category: "design", aliases: ["user research", "usability testing"] },

  // practice
  { name: "Agile", category: "practice", aliases: ["scrum", "kanban", "sprint planning", "agile methodologies"] },
  { name: "Git", category: "practice", aliases: ["github", "gitlab", "version control", "bitbucket"] },
  { name: "Code Review", category: "practice", aliases: ["peer review", "pull requests", "pr review"] },
  { name: "System Design", category: "practice", aliases: ["architecture", "distributed systems", "scalability"] },
  { name: "Technical Leadership", category: "practice", aliases: ["tech lead", "mentoring", "mentorship", "leading engineers"] },
  { name: "Stakeholder Management", category: "practice", aliases: ["stakeholder communication", "cross-functional collaboration"] },
  { name: "Product Thinking", category: "practice", aliases: ["product sense", "discovery", "roadmapping"] },
  { name: "Technical Writing", category: "practice", aliases: ["documentation", "docs", "rfcs"] },
  { name: "Incident Response", category: "practice", aliases: ["on-call", "oncall", "postmortems", "sre"] },
];

/** alias (normalised) → canonical name. Built once. */
const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const skill of SKILLS) {
    index.set(normaliseSkill(skill.name), skill.name);
    for (const alias of skill.aliases) index.set(normaliseSkill(alias), skill.name);
  }
  return index;
})();

export function normaliseSkill(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_/]+/g, " ")
    .replace(/[^a-z0-9+#. ]/g, "")
    .trim();
}

/** Canonical name, or null when the term isn't in the canon. Never guesses. */
export function canonicalSkill(raw: string): string | null {
  if (!raw.trim()) return null;
  return ALIAS_INDEX.get(normaliseSkill(raw)) ?? null;
}

/** Every canonical skill mentioned in a free-text span. */
export function skillsIn(text: string): string[] {
  const haystack = ` ${normaliseSkill(text)} `;
  const found = new Set<string>();
  for (const [alias, canonical] of ALIAS_INDEX) {
    if (alias.length < 2) continue;
    if (haystack.includes(` ${alias} `)) found.add(canonical);
  }
  return [...found];
}

export const ALIAS_COUNT = [...ALIAS_INDEX.keys()].length;
