#!/usr/bin/env node
import { ALL_PROVIDERS, type ProviderName, type Resolution } from "./types.js";
import { createHttp } from "./http.js";
import { resolveCitation } from "./resolve.js";

const HELP = `cite-resolve - resolve a free-text citation to verified metadata

Usage: cite-resolve "<citation text>" [options]

Options:
  --json               print the full resolution as JSON
  --providers a,b,c    only these providers, in this order
                       (${ALL_PROVIDERS.join(", ")})
  --mailto ADDRESS     contact address for provider polite pools and the User-Agent
  --threshold N        title-overlap threshold, 0..1 (default 0.8)
  --require-author     also reject records that share no author family name
  --timeout MS         per-request timeout (default 10000)
  -h, --help           show this help

Exit codes: 0 resolved, 1 not resolved (no match, rejected, or classical locus),
2 usage error.
`;

interface Parsed {
  text?: string;
  json: boolean;
  providers?: ProviderName[];
  mailto?: string;
  threshold?: number;
  requireAuthor: boolean;
  timeout: number;
  help: boolean;
}

export function parseArgs(argv: string[]): Parsed {
  const p: Parsed = { json: false, requireAuthor: false, timeout: 10000, help: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "-h" || a === "--help") p.help = true;
    else if (a === "--json") p.json = true;
    else if (a === "--require-author") p.requireAuthor = true;
    else if (a === "--mailto") p.mailto = val();
    else if (a === "--timeout") p.timeout = Number(val());
    else if (a === "--threshold") {
      p.threshold = Number(val());
      if (!(p.threshold >= 0 && p.threshold <= 1)) throw new Error("--threshold must be between 0 and 1");
    } else if (a === "--providers") {
      const names = val().split(",").map((s) => s.trim()).filter(Boolean);
      const bad = names.filter((n) => !(ALL_PROVIDERS as readonly string[]).includes(n));
      if (bad.length || names.length === 0) throw new Error(`unknown provider: ${bad.join(", ") || "(empty)"}`);
      p.providers = names as ProviderName[];
    } else if (a.startsWith("-") && a !== "-") throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  if (!Number.isFinite(p.timeout) || p.timeout <= 0) throw new Error("--timeout must be a positive number");
  if (rest.length > 1) throw new Error("quote the citation so it is a single argument");
  p.text = rest[0];
  return p;
}

export function format(r: Resolution): string {
  if (r.status === "skipped") {
    return `skipped (${r.form}): classical locus citations are not looked up; no match was attempted`;
  }
  if (r.status === "unresolved" || !r.record) {
    const why = r.rejected.length
      ? `${r.rejected.length} candidate(s) rejected by the guard, closest: "${r.rejected[0].title}" (${r.rejected[0].reason})`
      : r.errors.length
        ? `provider errors: ${r.errors.map((e) => `${e.provider}: ${e.message}`).join("; ")}`
        : "no candidate found";
    return `unresolved (${r.form}): ${why}`;
  }
  const c = r.record;
  const lines = [`resolved (${r.form}) via ${c.provider}${r.checks ? `, title overlap ${r.checks.title.toFixed(2)}` : ""}`, `  title:   ${c.title}`];
  if (c.authors.length) lines.push(`  authors: ${c.authors.join(", ")}`);
  if (c.year) lines.push(`  year:    ${c.year}`);
  if (c.doi) lines.push(`  doi:     ${c.doi}`);
  if (c.isbns.length) lines.push(`  isbn:    ${c.isbns[0]}`);
  if (c.arxivId) lines.push(`  arxiv:   ${c.arxivId}`);
  if (c.url) lines.push(`  url:     ${c.url}`);
  if (c.pdfUrl) lines.push(`  pdf:     ${c.pdfUrl}`);
  return lines.join("\n");
}

export async function main(argv: string[], out: (s: string) => void = console.log, err: (s: string) => void = console.error): Promise<number> {
  let p: Parsed;
  try {
    p = parseArgs(argv);
  } catch (e) {
    err(`cite-resolve: ${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  if (p.help) {
    out(HELP);
    return 0;
  }
  if (!p.text || !p.text.trim()) {
    err(`cite-resolve: missing citation text\n\n${HELP}`);
    return 2;
  }
  const http = createHttp({ mailto: p.mailto, timeoutMs: p.timeout });
  const r = await resolveCitation(p.text, { http, providers: p.providers, mailto: p.mailto, threshold: p.threshold, requireAuthor: p.requireAuthor });
  out(p.json ? JSON.stringify(r, null, 2) : format(r));
  return r.status === "resolved" ? 0 : 1;
}

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === self) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
