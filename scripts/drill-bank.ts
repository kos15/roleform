/**
 * F26 — the DSA bank, checked by running it.
 *
 * Not a test suite (CLAUDE.md §11): a one-shot check run whenever the bank
 * changes. Every bank test must parse against its problem's signature, and
 * every JavaScript and Python reference solution must pass every test — a
 * bank problem whose own answer fails its own tests would grade a correct
 * user as wrong.
 *
 * JavaScript runs through the same QuickJS sandbox the app uses. Python runs
 * through the local `python3` when present (the app runs it in Pyodide, the
 * same CPython), and is skipped with a notice when not.
 *
 *   pnpm check:drill
 */
import { spawnSync } from "node:child_process";
import { BANK } from "../lib/drill/bank";
import { runJsCases } from "../lib/drill/sandbox";
import { CODE_LANGUAGES, parseTestCase, sameValue, snake, starterCode } from "../lib/domain/drill";

async function main() {
  let failures = 0;
  const hasPython = spawnSync("python3", ["--version"]).status === 0;
  if (!hasPython) console.log("python3 not found — Python solutions skipped.\n");

  for (const p of BANK) {
    const cases = p.tests.map((t) => parseTestCase(t, p.signature));
    const bad = cases.findIndex((c) => c === null);
    if (bad >= 0) {
      console.log(`✗ ${p.slug}: test ${bad + 1} does not fit the signature`);
      failures++;
      continue;
    }
    const parsed = cases.filter((c): c is NonNullable<typeof c> => c !== null);

    for (const lang of CODE_LANGUAGES) {
      if (!starterCode(p.signature, lang).includes(lang === "python" ? snake(p.signature.functionName) : p.signature.functionName)) {
        console.log(`✗ ${p.slug}: ${lang} starter does not name the function`);
        failures++;
      }
    }

    const js = await runJsCases(p.solutions.javascript, p.signature.functionName, parsed);
    const jsFailed = js.filter((r) => !r.passed);
    if (jsFailed.length) {
      failures++;
      console.log(`✗ ${p.slug} [js]: ${jsFailed.map((r) => `${r.input} → ${r.actual} (want ${r.expected})`).join("; ")}`);
    }

    let pyLine = "py skipped";
    if (hasPython) {
      const harness = `${p.solutions.python}\nimport json, sys\ncases = json.loads(sys.stdin.read())\nprint(json.dumps([${snake(p.signature.functionName)}(*c) for c in cases]))`;
      const out = spawnSync("python3", ["-I", "-c", harness], {
        input: JSON.stringify(parsed.map((c) => c.args)),
        encoding: "utf8",
      });
      if (out.status !== 0) {
        failures++;
        pyLine = "py ERROR";
        console.log(`✗ ${p.slug} [py]: ${out.stderr.trim().split("\n").pop()}`);
      } else {
        const results = JSON.parse(out.stdout) as unknown[];
        const pyFailed = results.filter((r, i) => !sameValue(r, parsed[i].expected)).length;
        if (pyFailed) {
          failures++;
          console.log(`✗ ${p.slug} [py]: ${pyFailed} failing`);
        }
        pyLine = `py ${results.length - pyFailed}/${results.length}`;
      }
    }

    console.log(`${jsFailed.length ? "✗" : "✓"} ${p.slug.padEnd(22)} js ${js.length - jsFailed.length}/${js.length} · ${pyLine}`);
  }

  console.log(`\n${BANK.length} problems, ${failures} failure${failures === 1 ? "" : "s"}.`);
  process.exit(failures ? 1 : 0);
}

void main();
