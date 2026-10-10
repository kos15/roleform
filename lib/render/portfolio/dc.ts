/**
 * F28 — a small interpreter for the design's template language, so the
 * portfolio looks render from ./template.ts exactly as the design draws them.
 * PURE: string in, string out.
 *
 * Supported, and all the template uses:
 *   <sc-if value="{{ path }}">…</sc-if>          render children when truthy
 *   <sc-for list="{{ path }}" as="x">…</sc-for>  repeat children per item
 *   attr="{{ path }}" / attr="a {{ path }} b"    interpolation (escaped)
 *   onClick="{{ path }}"                          → data-pick="<slot>" when interactive
 *   ref=…, hint-*=…                               dropped
 *
 * The template itself is trusted (it is ours); every interpolated value is
 * the member's profile text and is escaped.
 */

type Scope = Record<string, unknown>;

interface El {
  tag: string;
  attrs: Array<[string, string | null]>;
  kids: Node[];
}
type Node = string | El;

const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source", "path"]);

function parse(src: string): Node[] {
  const root: El = { tag: "#root", attrs: [], kids: [] };
  const stack: El[] = [root];
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) stack[stack.length - 1]!.kids.push(src.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[1]!.toLowerCase();
    if (m[0][1] === "/") {
      // Close the nearest matching element.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Array<[string, string | null]> = [];
    for (const a of m[2]!.matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) attrs.push([a[1]!, a[2] ?? null]);
    const el: El = { tag, attrs, kids: [] };
    stack[stack.length - 1]!.kids.push(el);
    // `<path …></path>` closes itself in the template; a later `</path>` is a no-op.
    if (!m[3] && !VOID.has(tag)) stack.push(el);
  }
  if (last < src.length) root.kids.push(src.slice(last));
  return root.kids;
}

const cache = new Map<string, Node[]>();

function lookup(scope: Scope, path: string): unknown {
  let v: unknown = scope;
  for (const k of path.split(".")) {
    if (v == null) return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ONE = /^\{\{\s*([\w.]+)\s*\}\}$/;
const ANY = /\{\{\s*([\w.]+)\s*\}\}/g;

function interp(raw: string, scope: Scope): string {
  return raw.replace(ANY, (_, p: string) => {
    const v = lookup(scope, p);
    return v == null ? "" : escapeHtml(String(v));
  });
}

function render(nodes: Node[], scope: Scope, interactive: boolean, out: string[]): void {
  for (const n of nodes) {
    if (typeof n === "string") {
      out.push(interp(n, scope));
      continue;
    }
    const attr = (name: string) => n.attrs.find(([k]) => k === name)?.[1] ?? "";
    if (n.tag === "sc-if") {
      const m = ONE.exec(attr("value"));
      if (m && lookup(scope, m[1]!)) render(n.kids, scope, interactive, out);
      continue;
    }
    if (n.tag === "sc-for") {
      const m = ONE.exec(attr("list"));
      const list = m ? lookup(scope, m[1]!) : null;
      const as = attr("as");
      if (Array.isArray(list)) for (const item of list) render(n.kids, { ...scope, [as]: item }, interactive, out);
      continue;
    }
    out.push("<", n.tag);
    for (const [k, v] of n.attrs) {
      if (k === "ref" || k.startsWith("hint-")) continue;
      if (v == null) {
        out.push(" ", k);
        continue;
      }
      if (k === "onClick") {
        const m = ONE.exec(v);
        const slot = m ? lookup(scope, m[1]!) : null;
        if (interactive && typeof slot === "string") out.push(` data-pick="${escapeHtml(slot)}"`);
        continue;
      }
      const whole = ONE.exec(v);
      if (whole) {
        const val = lookup(scope, whole[1]!);
        if (val === true) out.push(" ", k);
        else if (val === false || val == null) continue;
        else out.push(" ", k, '="', escapeHtml(String(val)), '"');
        continue;
      }
      out.push(" ", k, '="', interp(v, scope), '"');
    }
    out.push(">");
    if (VOID.has(n.tag) && n.tag !== "path") continue;
    render(n.kids, scope, interactive, out);
    out.push("</", n.tag, ">");
  }
}

/** Render a template against its values. `interactive` adds `data-pick` hooks for photo slots. */
export function renderDc(template: string, scope: Scope, interactive = false): string {
  let nodes = cache.get(template);
  if (!nodes) {
    nodes = parse(template);
    cache.set(template, nodes);
  }
  const out: string[] = [];
  render(nodes, scope, interactive, out);
  return out.join("");
}
