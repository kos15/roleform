/*
 * F26 — runs a Python submission's tests in the browser.
 *
 * Pyodide (CPython compiled to WebAssembly, MPL-2.0), loaded from jsDelivr the
 * first time someone runs Python. The code never leaves the browser for this
 * step, and a Web Worker means an infinite loop freezes this thread only —
 * the page terminates the worker on a timeout and starts a fresh one.
 *
 * In:  { id, code, entry, cases: [args[]] }
 * Out: { id, ok: true, results: [{ ok, value }] } | { id, ok: false, error }
 */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let ready = null;

const HARNESS = `
import json
__out = []
for __a in json.loads(__cases):
    try:
        __out.append({"ok": True, "value": json.dumps(__entry(*__a))})
    except Exception as __e:
        __out.append({"ok": False, "value": (type(__e).__name__ + ": " + str(__e))[:200]})
json.dumps(__out)
`;

self.onmessage = async (event) => {
  const { id, code, entry, cases } = event.data;
  try {
    ready = ready || loadPyodide({ indexURL: PYODIDE });
    const py = await ready;
    const ns = py.globals.get("dict")();
    try {
      py.runPython(code, { globals: ns });
      const fn = ns.get(entry);
      if (!fn) throw new Error("Function " + entry + " is not defined");
      ns.set("__entry", fn);
      ns.set("__cases", JSON.stringify(cases));
      const out = py.runPython(HARNESS, { globals: ns });
      self.postMessage({ id, ok: true, results: JSON.parse(out) });
    } finally {
      ns.destroy();
    }
  } catch (error) {
    const message = String((error && error.message) || error);
    // A Python traceback's last line is the useful one.
    const last = message.trim().split("\n").pop();
    self.postMessage({ id, ok: false, error: last.slice(0, 300) });
  }
};
