import { it } from "vitest";
/**
 * YouTube oEmbed liveness and the catalog's pure shape rules. No network: `fetch` is injected.
 */
import assert from "node:assert/strict";
import { checkVideo, checkCourseLink } from "@/lib/catalog/liveness";
import { catalogProblems } from "@/lib/catalog/problems";
import type { CourseDef } from "@/lib/catalog/courses";


const reply = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const boom = (async () => {
  throw new Error("network");
}) as unknown as typeof fetch;

const VIDEO = "https://www.youtube.com/watch?v=abc123";

  it("200 is live and carries author_name", async () => {
    assert.deepEqual(await checkVideo(VIDEO, reply(200, { author_name: "Fireship" })), {
      liveness: "live",
      authorName: "Fireship",
    });
  });
  it("404 and 400 are dead", async () => {
    assert.equal((await checkVideo(VIDEO, reply(404))).liveness, "dead");
    assert.equal((await checkVideo(VIDEO, reply(400))).liveness, "dead");
  });
  it("401/403 are live (embedding disabled), no author", async () => {
    assert.deepEqual(await checkVideo(VIDEO, reply(403)), { liveness: "live", authorName: null });
    assert.deepEqual(await checkVideo(VIDEO, reply(401)), { liveness: "live", authorName: null });
  });
  it("a thrown error, 429 and 5xx are blocked", async () => {
    assert.equal((await checkVideo(VIDEO, boom)).liveness, "blocked");
    assert.equal((await checkVideo(VIDEO, reply(429))).liveness, "blocked");
    assert.equal((await checkVideo(VIDEO, reply(503))).liveness, "blocked");
  });
  it("the oEmbed request is the documented endpoint with the URL encoded", async () => {
    let seen = "";
    const spy = (async (input: unknown) => {
      seen = String(input);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await checkVideo(VIDEO, spy);
    assert.equal(
      seen,
      `https://www.youtube.com/oembed?url=${encodeURIComponent(VIDEO)}&format=json`,
    );
  });
  it("youtu.be and playlist URLs route to oEmbed", async () => {
    for (const url of ["https://youtu.be/abc123", "https://www.youtube.com/playlist?list=PL123"]) {
      let seen = "";
      const spy = (async (input: unknown) => {
        seen = String(input);
        return new Response(JSON.stringify({ author_name: "X" }), { status: 200 });
      }) as unknown as typeof fetch;
      const out = await checkCourseLink({ url, type: "video" }, spy);
      assert.ok(seen.startsWith("https://www.youtube.com/oembed?"), url);
      assert.deepEqual(out, { liveness: "live", authorName: "X" });
    }
  });

  const base = {
    provider: "P",
    priceLabel: "Free",
    lengthLabel: "x",
    lengthMinutes: 1,
    level: "beginner",
    mark: "PP",
    isFree: true,
  } as const;
  const def = (o: Partial<CourseDef> & Pick<CourseDef, "title" | "url">): CourseDef =>
    ({ ...base, skills: ["React"], ...o }) as CourseDef;
  const full: CourseDef[] = [
    def({ title: "w", url: "https://www.youtube.com/watch?v=1", type: "video" }),
    def({ title: "r", url: "https://react.dev/learn", type: "doc", docKind: "official" }),
  ];

  it("a complete catalog has no problems", () => {
    assert.deepEqual(catalogProblems(full, ["React"]), []);
  });
  it("a /shorts/ URL is a problem naming the URL", () => {
    const bad = [...full, def({ title: "s", url: "https://www.youtube.com/shorts/zzz", type: "video" })];
    const out = catalogProblems(bad, ["React"]);
    assert.equal(out.length, 1);
    assert.ok(out[0].includes("/shorts/zzz"));
  });
  it("a doc without docKind is a problem naming the URL", () => {
    const bad = [...full, def({ title: "d", url: "https://x.dev/docs", type: "doc" })];
    const out = catalogProblems(bad, ["React"]);
    assert.equal(out.length, 1);
    assert.ok(out[0].includes("https://x.dev/docs"));
  });
  it("a skill with no Read entry is a problem naming the skill and lane", () => {
    const out = catalogProblems([full[0]], ["React"]);
    assert.equal(out.length, 1);
    assert.ok(out[0].includes("React") && out[0].includes("read"));
  });
  it("a duplicate URL is a problem", () => {
    const out = catalogProblems([...full, full[0]], ["React"]);
    assert.equal(out.length, 1);
    assert.ok(out[0].includes("https://www.youtube.com/watch?v=1"));
  });
  it("lane coverage counts skills[0] only", () => {
    const out = catalogProblems(
      [def({ title: "w", url: "https://youtu.be/1", type: "video", skills: ["Redux", "React"] }), full[1]],
      ["React"],
    );
    assert.ok(out.some((p) => p.includes("React") && p.includes("watch")));
  });
  it("type falls back to typeOf when absent", () => {
    const out = catalogProblems([def({ title: "w", url: "https://youtu.be/1" }), full[1]], ["React"]);
    assert.deepEqual(out, []);
  });

  it("the same YouTube video spelled four ways is one duplicate each", () => {
    const spellings = [
      "https://www.youtube.com/watch?v=abc123",
      "https://youtu.be/abc123",
      "https://m.youtube.com/watch?v=abc123&t=30s",
      "https://youtube.com/watch?feature=share&v=abc123",
    ];
    const out = catalogProblems(
      spellings.map((url) => def({ title: "v", url, type: "video" })).concat(full[1]),
      ["React"],
    );
    assert.equal(out.filter((p) => p.startsWith("Duplicate")).length, 3);
  });
  it("playlist ids dedupe; non-YouTube compares host case and trailing slash", () => {
    const pl = catalogProblems(
      [
        def({ title: "a", url: "https://www.youtube.com/playlist?list=PL1", type: "video" }),
        def({ title: "b", url: "https://youtube.com/playlist?list=PL1&x=1", type: "video" }),
        full[1],
      ],
      ["React"],
    );
    assert.equal(pl.filter((p) => p.startsWith("Duplicate")).length, 1);
    const web = catalogProblems(
      [full[0], full[1], def({ title: "r2", url: "https://REACT.dev/learn/", type: "doc", docKind: "official" })],
      ["React"],
    );
    assert.equal(web.filter((p) => p.startsWith("Duplicate")).length, 1);
  });
  it("YouTube channel URLs are problems naming the URL", () => {
    for (const path of ["/@fireship", "/channel/UC1", "/c/Fireship", "/user/fireship"]) {
      const url = `https://www.youtube.com${path}`;
      const out = catalogProblems([...full, def({ title: "c", url, type: "video" })], ["React"]);
      assert.equal(out.length, 1, path);
      assert.ok(out[0].includes(url));
    }
  });
  it("a non-YouTube host is not routed to checkVideo", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await checkCourseLink({ url: "https://notyoutube.invalid/watch?v=1", type: "video" }, spy).catch(() => {});
    assert.equal(called, false);
  });
