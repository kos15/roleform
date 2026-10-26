import type { BulletTailorInput } from "../agents/bullet-tailor";

export function staticContext(i: BulletTailorInput): string {
  return `Role being applied for: ${i.jobTitle}`;
}

export function dynamicContext(i: BulletTailorInput): string {
  return [
    `<requirement necessity="${i.requirement.necessity}">`,
    i.requirement.text,
    `</requirement>`,
    ``,
    `<bullet id="${i.bullet.id}">`,
    i.bullet.text,
    `</bullet>`,
  ].join("\n");
}
