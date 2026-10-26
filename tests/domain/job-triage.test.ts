import { it } from "vitest";
/**
 * F22.1 — the job triage's pure half.
 *
 * Everything here is PURE — job key, text
 * cleaning, keyword plan, triage tiers, tracker hints — so it needs no
 * mocking, no database and no network.
 */
import assert from "node:assert/strict";
import { jobKey } from "@/lib/domain/job-key";
import { cleanLine, cleanText, hasResidue } from "@/lib/domain/job-text";
import { statedMinYears, triageListing, type TriageInput } from "@/lib/domain/job-triage";
import { clampPostedWithin, planKeywords, type ProfileFacts } from "@/lib/domain/job-query";
import { statusCounts, trackerHints } from "@/lib/domain/job-tracker";
import { assessHealth } from "@/lib/domain/job-health";
import { boardPostingFits } from "@/lib/domain/board-filter";
it("legal suffix and location tail don't split one posting", () =>
  assert.equal(
    jobKey({ company: "Acme Pvt. Ltd.", title: "Senior React Developer (Remote)", id: "1" }),
    jobKey({ company: "ACME", title: "Senior React Developer - Pune", id: "2" }),
  ),
);
it("two anonymous listings never merge", () =>
  assert.notEqual(jobKey({ company: "", title: "SWE", id: "1" }), jobKey({ company: "", title: "SWE", id: "2" })),
);
it("entities and tags out of a title", () =>
  assert.equal(cleanLine("Intern - Fullstack &amp; AI <b>Innovation</b> "), "Intern - Fullstack & AI Innovation"),
);
it("residue detected", () => assert.equal(hasResidue("a &amp; b"), true));
it("blocks become lines", () => assert.equal(cleanText("<p>a</p><ul><li>x</li></ul>"), "a\n• x"));
it("'3+ years of experience'", () => assert.equal(statedMinYears("We need 3+ years of experience in React"), 3));
it("'Experience: 5-8 yrs'", () => assert.equal(statedMinYears("Experience: 5-8 yrs"), 5));
it("a bare '10 years' is not a requirement", () => assert.equal(statedMinYears("Founded 10 years ago"), null));
it("≤3 distinct title variants", () =>
  assert.deepEqual(planKeywords({ titles: ["A", "a", " B ", "C", "D"], skills: [] }), ["A", "B", "C"]),
);
it("skill-led when no titles", () =>
  assert.deepEqual(planKeywords({ titles: [], skills: ["React", "Go", "SQL", "X"] }), ["React Go SQL"]),
);
it("window clamps onto the offered set", () => {
  assert.equal(clampPostedWithin(99), 14);
  assert.equal(clampPostedWithin(0), 0);
});
const base: Omit<TriageInput, "title" | "location" | "workMode"> = {
  id: "1", source: "x", company: "C", text: "", skills: [], minYears: null, postedAt: null,
  repostCount: null, massPostingCount: null, order: 0,
};
const prof: ProfileFacts = { skills: ["React", "TypeScript"], titles: ["Frontend Engineer"], city: "bengaluru", remoteOnly: true, years: 5 };
it("on-site against remote-only is ruled out", () =>
  assert.equal(triageListing({ ...base, title: "Frontend Developer", location: "Bangalore", workMode: "onsite" }, prof).tier, "ruled_out"),
);
it("'Front-end Developer' lines up with 'Frontend Engineer'", () =>
  assert.equal(triageListing({ ...base, title: "Front-end Developer", location: "Anywhere", workMode: null }, prof).titleMatch, "Frontend Engineer"),
);
it("'Engineering Manager' does not", () =>
  assert.equal(triageListing({ ...base, title: "Engineering Manager", location: "Remote", workMode: null }, prof).titleMatch, null),
);
it("city alias passes (Bengaluru ↔ Bangalore)", () =>
  assert.equal(
    triageListing({ ...base, title: "Frontend Engineer", location: "Bangalore", workMode: "hybrid" }, { ...prof, remoteOnly: false }).location.verdict,
    "pass",
  ),
);
it("title + two skills + place + no gap → shortlist", () =>
  assert.equal(
    triageListing({ ...base, title: "Frontend Engineer", location: "Remote", workMode: "remote", skills: ["react", "typescript"] }, prof).tier,
    "shortlist",
  ),
);
it("four years short of the stated minimum → long shot", () =>
  assert.equal(
    triageListing({ ...base, title: "Frontend Engineer", location: "Remote", workMode: "remote", skills: ["react", "typescript"], minYears: 9 }, prof).tier,
    "long_shot",
  ),
);
const now = new Date("2026-10-14");
const job = { status: "applied" as const, postedAt: null, listingExpiresAt: new Date("2026-11-01") };
it("follow-up after ten quiet days", () =>
  assert.equal(trackerHints({ ...job, appliedAt: new Date("2026-09-30"), updatedAt: new Date("2026-09-30") }, now).length, 1),
);
it("no nudge inside ten days", () =>
  assert.equal(trackerHints({ ...job, appliedAt: new Date("2026-10-10"), updatedAt: new Date("2026-10-10") }, now).length, 0),
);
it("counts per status, zeros left out", () =>
  assert.deepEqual(statusCounts([{ status: "saved" }, { status: "saved" }, { status: "offer" }]), [
    { status: "saved", n: 2 },
    { status: "offer", n: 1 },
  ]),
);
it("every company blank → degraded", () =>
  assert.equal(assessHealth({ received: 5, dropped: 0, companies: ["", "", "", "", ""], titlesWithResidue: 0 }).state, "degraded"),
);
it("nothing parsed but records came back → degraded", () =>
  assert.equal(assessHealth({ received: 0, dropped: 4, companies: [], titlesWithResidue: 0 }).state, "degraded"),
);
it("nothing at all → empty, not broken", () =>
  assert.equal(assessHealth({ received: 0, dropped: 0, companies: [], titlesWithResidue: 0 }).state, "empty"),
);
const blr = { location: "Bengaluru, IN", remote: false };
const post = (title: string, location: string, workMode: "remote" | "hybrid" | "onsite" | null = null, countryCode: string | null = null) =>
  ({ title, location, workMode, countryCode });
it("title must cover the keyword", () => {
  assert.equal(boardPostingFits(post("Senior Software Engineer, Payments", "Bangalore"), "Software Engineer", blr), true);
  assert.equal(boardPostingFits(post("Engineering Manager", "Bangalore"), "Software Engineer", blr), false);
});
it("city alias and country both count", () => {
  assert.equal(boardPostingFits(post("Software Engineer", "Bangalore, Karnataka"), "Software Engineer", blr), true);
  assert.equal(boardPostingFits(post("Software Engineer", "Hyderabad, India"), "Software Engineer", blr), true);
  assert.equal(boardPostingFits(post("Software Engineer", "hyderabad", "onsite", "in"), "Software Engineer", blr), true);
});
it("another country is out", () =>
  assert.equal(boardPostingFits(post("Software Engineer", "San Francisco, CA"), "Software Engineer", blr), false),
);
it("remote only in your country or anywhere", () => {
  const remote = { ...blr, remote: true };
  assert.equal(boardPostingFits(post("Software Engineer", "Remote - India", "remote"), "Software Engineer", remote), true);
  assert.equal(boardPostingFits(post("Software Engineer", "Remote, Global"), "Software Engineer", remote), true);
  assert.equal(boardPostingFits(post("Software Engineer", "Remote - US", "remote"), "Software Engineer", remote), false);
  assert.equal(boardPostingFits(post("Software Engineer", "Bangalore", "onsite"), "Software Engineer", remote), false);
});
