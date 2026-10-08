import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten";
import { sameValue, type CaseResult } from "@/lib/domain/drill";

/**
 * F26 — the JavaScript sandbox.
 *
 * QuickJS compiled to WebAssembly (quickjs-emscripten, MIT). Code here runs
 * inside a separate interpreter with its own heap: no `require`, no `process`,
 * no network, no filesystem — nothing from the host is ever passed in except
 * JSON strings. Memory, stack and wall-clock time are capped per test, so an
 * infinite loop or a runaway allocation fails that test and nothing else.
 *
 * Two callers, both server-side:
 *   - "Run tests" on a JavaScript submission (the user's code)
 *   - checking a generated challenge's own tests against its reference
 *     solution BEFORE a user ever sees them (lib/ai/drill.ts) — a test the
 *     model got wrong is dropped, not shown.
 *
 * No `server-only` import: the check script runs this from Node too.
 */

const MEMORY_BYTES = 32 * 1024 * 1024;
const STACK_BYTES = 512 * 1024;
const PER_TEST_MS = 1_000;
const MAX_SHOWN = 200;

let module: Promise<QuickJSWASMModule> | null = null;

/** Loaded once per instance; callers that need sync access await this first. */
export function loadSandbox(): Promise<QuickJSWASMModule> {
  module ??= getQuickJS();
  return module;
}

export interface SandboxCase {
  args: unknown[];
  expected: unknown;
}

/**
 * Runs `functionName` from `code` against each case. Synchronous once the
 * module is loaded, which is what lets a `runStructured` verify call it.
 */
export function runJsCasesSync(
  quickjs: QuickJSWASMModule,
  code: string,
  functionName: string,
  cases: SandboxCase[],
): CaseResult[] {
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(MEMORY_BYTES);
  runtime.setMaxStackSize(STACK_BYTES);
  const vm = runtime.newContext();

  try {
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + PER_TEST_MS));
    const defined = vm.evalCode(`${code}\n;globalThis.__fn = typeof ${functionName} === "function" ? ${functionName} : undefined;`);
    if (defined.error) {
      const message = errorText(vm.dump(defined.error));
      defined.error.dispose();
      return cases.map((c) => fail(c, message));
    }
    defined.value.dispose();

    return cases.map((c) => {
      runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + PER_TEST_MS));
      const call = vm.evalCode(
        `(() => { if (typeof __fn !== "function") throw new Error("Function ${functionName} is not defined"); ` +
          `const r = __fn(...JSON.parse(${JSON.stringify(JSON.stringify(c.args))})); ` +
          `return JSON.stringify(r === undefined ? null : r); })()`,
      );
      if (call.error) {
        const message = errorText(vm.dump(call.error));
        call.error.dispose();
        return fail(c, message);
      }
      const raw: unknown = vm.dump(call.value);
      call.value.dispose();
      let actual: unknown = null;
      try {
        actual = typeof raw === "string" ? JSON.parse(raw) : null;
      } catch {
        actual = null;
      }
      return {
        passed: sameValue(actual, c.expected),
        input: shown(c.args),
        expected: shown(c.expected),
        actual: typeof raw === "string" ? raw.slice(0, MAX_SHOWN) : "null",
      };
    });
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

export async function runJsCases(
  code: string,
  functionName: string,
  cases: SandboxCase[],
): Promise<CaseResult[]> {
  return runJsCasesSync(await loadSandbox(), code, functionName, cases);
}

function fail(c: SandboxCase, message: string): CaseResult {
  return { passed: false, input: shown(c.args), expected: shown(c.expected), actual: message };
}

function shown(v: unknown): string {
  const s = JSON.stringify(v);
  return s.length > MAX_SHOWN ? `${s.slice(0, MAX_SHOWN - 1)}…` : s;
}

function errorText(dumped: unknown): string {
  if (dumped && typeof dumped === "object") {
    const e = dumped as { name?: unknown; message?: unknown };
    const name = typeof e.name === "string" ? e.name : "Error";
    const message = typeof e.message === "string" ? e.message : "";
    if (/interrupted/i.test(message) || name === "InternalError") {
      return message.includes("interrupted") ? "Timed out (1s per test)" : `${name}: ${message}`.slice(0, MAX_SHOWN);
    }
    return `${name}: ${message}`.slice(0, MAX_SHOWN);
  }
  return String(dumped).slice(0, MAX_SHOWN);
}
