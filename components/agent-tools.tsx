"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * WebMCP: the site's key actions, declared as tools an in-browser AI agent can
 * call instead of reverse-engineering the UI.
 *
 * WebMCP is an emerging standard (navigator.modelContext); where the browser
 * doesn't implement it this component does nothing at all. Every tool here is
 * read-only or navigational — nothing submits, pays or changes an account on
 * an agent's say-so. Actions that need a person (sign-in, checkout, saving a
 * profile) are reached by navigating there, and the person completes them.
 *
 * Tool output is the same Markdown the /<path>.md mirrors serve
 * (lib/seo/markdown.ts), so an agent reads one consistent description.
 */

type ToolResult = { content: { type: "text"; text: string }[] };

interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

interface ModelContext {
  registerTool?: (tool: AgentTool) => unknown;
  unregisterTool?: (name: string) => void;
  provideContext?: (context: { tools: AgentTool[] }) => void;
}

const MIRRORED = /^\/(?:|pricing|templates|guides(?:\/[a-z0-9-]+)?|how-it-works|privacy|terms|support|contact)$/;

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

async function fetchText(path: string): Promise<string> {
  const response = await fetch(path, { headers: { Accept: "text/markdown, text/plain" } });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.text();
}

export function AgentTools() {
  const router = useRouter();

  useEffect(() => {
    const mc = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!mc) return;

    const tools: AgentTool[] = [
      {
        name: "get_roleform_overview",
        description:
          "What Roleform is, who it is for, what it returns for a job description, pricing in brief, and links to every public page. Call this first.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => text(await fetchText("/llms.txt")),
      },
      {
        name: "read_roleform_page",
        description:
          "Read any public Roleform page as Markdown: '/', '/pricing', '/templates', '/guides', '/guides/<slug>', '/how-it-works', '/privacy', '/terms', '/support', '/contact'.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Page path, e.g. /pricing" } },
          required: ["path"],
        },
        annotations: { readOnlyHint: true },
        execute: async (input) => {
          const path = String(input.path ?? "/").replace(/\/+$/, "") || "/";
          if (!MIRRORED.test(path)) return text(`No public page at ${path}. See /llms.txt for the list.`);
          return text(await fetchText(path === "/" ? "/index.md" : `${path}.md`));
        },
      },
      {
        name: "get_roleform_pricing",
        description: "Roleform's plans (Free, Pro, Ultra) with prices in INR, every usage cap, and top-ups.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => text(await fetchText("/pricing.md")),
      },
      {
        name: "list_resume_templates",
        description:
          "All Roleform résumé templates with their computed ATS rating (High / Medium / Low) and the structural reason for it.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => text(await fetchText("/templates.md")),
      },
      {
        name: "start_resume_tailoring",
        description:
          "Open the screen where the user pastes a job description to tailor their résumé. Signed-out users are taken to sign-in first; the user completes that step themselves.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          router.push("/analyze");
          return text("Opened /analyze. If the user is signed out they will see sign-in first.");
        },
      },
      {
        name: "open_roleform_page",
        description: "Navigate the browser to a Roleform page, e.g. /pricing, /templates, /guides, /contact, /sign-up.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Path beginning with /" } },
          required: ["path"],
        },
        execute: async (input) => {
          const path = String(input.path ?? "/");
          if (!path.startsWith("/") || path.startsWith("//")) return text("Path must start with a single /.");
          router.push(path);
          return text(`Opened ${path}.`);
        },
      },
    ];

    if (mc.registerTool) {
      for (const tool of tools) {
        try {
          mc.registerTool(tool);
        } catch {
          // Already registered by a previous mount — harmless.
        }
      }
      return () => {
        for (const tool of tools) {
          try {
            mc.unregisterTool?.(tool.name);
          } catch {
            // Nothing to undo.
          }
        }
      };
    }
    mc.provideContext?.({ tools });
    return undefined;
  }, [router]);

  return null;
}
