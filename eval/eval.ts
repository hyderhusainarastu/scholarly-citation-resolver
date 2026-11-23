/**
 * Replays the gold set against recorded provider responses (offline), or
 * records them from the live services with --live --record.
 *
 *   node dist/eval/eval.js                 replay, print a table
 *   node dist/eval/eval.js --json          replay, print JSON
 *   node dist/eval/eval.js --live --record fetch live and save responses
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttp } from "../src/http.js";
import { resolveCitation } from "../src/resolve.js";
import { outcome, summarize, type GoldItem, type Outcome } from "./score.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eval");
const fixtureDir = join(root, "fixtures");
const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const record = args.has("--record");

const key = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 16);

function replayFetch(): typeof fetch {
  return (async (input: any) => {
    const url = String(input);
    const file = join(fixtureDir, `${key(url)}.json`);
    if (!existsSync(file)) return new Response("no recorded response", { status: 404 });
    const rec = JSON.parse(readFileSync(file, "utf8"));
    return new Response(rec.body, { status: rec.status });
  }) as typeof fetch;
}

function recordingFetch(): typeof fetch {
  mkdirSync(fixtureDir, { recursive: true });
  return (async (input: any, init: any) => {
    const url = String(input);
    const res = await fetch(url, init);
    const body = await res.text();
    writeFileSync(join(fixtureDir, `${key(url)}.json`), JSON.stringify({ url, status: res.status, body }) + "\n");
    return new Response(body, { status: res.status });
  }) as typeof fetch;
}

const gold: GoldItem[] = JSON.parse(readFileSync(join(root, "gold.json"), "utf8"));
const http = live
  ? createHttp({ fetch: record ? recordingFetch() : fetch, minIntervalMs: 1000, timeoutMs: 20000 })
  : createHttp({ fetch: replayFetch(), sleep: async () => {}, minIntervalMs: 0, maxRetries: 0 });

const rows: { id: string; form: string; guardOn: Outcome; guardOff: Outcome; rejected: number }[] = [];
for (const g of gold) {
  const on = await resolveCitation(g.query, { http });
  const off = await resolveCitation(g.query, { http, guard: false });
  rows.push({ id: g.id, form: g.form, guardOn: outcome(g, on), guardOff: outcome(g, off), rejected: on.rejected.length });
}

const on = summarize(rows.map((r) => r.guardOn));
const off = summarize(rows.map((r) => r.guardOff));
const mode = live ? (record ? "live (recorded)" : "live") : "replay";

if (args.has("--json")) {
  console.log(JSON.stringify({ mode, guardOn: on, guardOff: off, rows }, null, 2));
} else {
  const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
  console.log(`mode: ${mode}   items: ${gold.length}   labelled: ${on.labelled}`);
  console.log("guard   correct wrong missed false-accept true-reject precision recall");
  for (const [name, s] of [["on ", on], ["off", off]] as const) {
    console.log(`${name}     ${String(s.correct).padStart(7)} ${String(s.wrong).padStart(5)} ${String(s.missed).padStart(6)} ${String(s.falseAccepts).padStart(12)} ${String(s.trueRejects).padStart(11)} ${pct(s.precision).padStart(9)} ${pct(s.recall).padStart(6)}`);
  }
  for (const r of rows.filter((x) => x.guardOn !== "correct" && x.guardOn !== "true-reject")) {
    console.log(`  guard-on ${r.guardOn}: ${r.id} (${r.form})`);
  }
}
