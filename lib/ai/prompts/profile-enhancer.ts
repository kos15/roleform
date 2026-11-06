import type { ProfileEnhancerInput } from "../agents/profile-enhancer";

export function dynamicContext(i: ProfileEnhancerInput): string {
  return `Profile entries:\n${i.fields.map((f) => `<field path="${f.path}">${f.text}</field>`).join("\n")}`;
}
