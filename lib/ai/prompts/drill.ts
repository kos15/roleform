import type { DrillTopic } from "@/lib/domain/drill";

/**
 * Shared prompt pieces for the four drill agents (F26). What goes in is a role
 * line and a numbered topic list — never the posting's text, never a résumé
 * bullet: a model never shown the candidate's history has nothing about them
 * to embellish (§3).
 */
export interface DrillRole {
  title: string;
  seniority: string | null;
}

export function roleLine(role: DrillRole): string {
  return `Role: ${role.title}${role.seniority ? ` · Seniority: ${role.seniority}` : ""}`;
}

export function topicBlock(topics: DrillTopic[]): string {
  return [
    "<topics>",
    ...topics.map(
      (t, i) =>
        `${i + 1}. ${t.label} (${t.necessity}${t.status === "absent" ? ", candidate has not shown this" : t.status === "partial" ? ", partly shown" : ""})`,
    ),
    "</topics>",
  ].join("\n");
}

export function enumOf(topics: DrillTopic[]): [string, ...string[]] {
  const labels = topics.map((t) => t.label);
  return [labels[0], ...labels.slice(1)];
}
