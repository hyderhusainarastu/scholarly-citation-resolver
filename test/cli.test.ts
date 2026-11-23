import { afterEach, describe, expect, it, vi } from "vitest";
import { format, main, parseArgs } from "../src/cli.js";
import { crossrefBody, stubFetch } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

describe("cite-resolve CLI", () => {
  it("parses options", () => {
    const p = parseArgs(["a citation", "--json", "--providers", "crossref,arxiv", "--mailto", "me@example.org", "--threshold", "0.7"]);
    expect(p).toMatchObject({ text: "a citation", json: true, providers: ["crossref", "arxiv"], mailto: "me@example.org", threshold: 0.7 });
  });
  it("rejects bad input with exit code 2", async () => {
    const err: string[] = [];
    expect(await main([], () => {}, (s) => err.push(s))).toBe(2);
    expect(await main(["x", "--providers", "nope"], () => {}, (s) => err.push(s))).toBe(2);
    expect(await main(["x", "--threshold", "2"], () => {}, (s) => err.push(s))).toBe(2);
    expect(await main(["one", "two"], () => {}, (s) => err.push(s))).toBe(2);
    expect(err.join("\n")).toContain("unknown provider: nope");
  });
  it("prints help and exits 0", async () => {
    const out: string[] = [];
    expect(await main(["--help"], (s) => out.push(s))).toBe(0);
    expect(out[0]).toContain("Exit codes");
  });
  it("resolves, prints JSON and exits 0", async () => {
    const { fn } = stubFetch({ "api.crossref.org": crossrefBody });
    vi.stubGlobal("fetch", fn);
    const out: string[] = [];
    const code = await main(
      ["Marlowe, Okafor (1998) Tidal Harmonics of the Northern Basin. Journal of Imaginary Oceans 12(3)", "--providers", "crossref", "--json"],
      (s) => out.push(s),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out[0]);
    expect(parsed.status).toBe("resolved");
    expect(parsed.record.doi).toBe("10.5555/example.tides");
  });
  it("exits 1 and explains when the guard rejects everything", async () => {
    const { fn } = stubFetch({ "api.crossref.org": crossrefBody });
    vi.stubGlobal("fetch", fn);
    const out: string[] = [];
    const code = await main(["Marlowe (2020) Quantum Marmalade in Baroque Orchards. Journal of Unlikely Studies 3(1)", "--providers", "crossref"], (s) => out.push(s));
    expect(code).toBe(1);
    expect(out[0]).toMatch(/^unresolved \(article\): 2 candidate\(s\) rejected/);
  });
  it("formats a skipped classical citation", () => {
    expect(format({ status: "skipped", form: "classical", query: "q", record: null, checks: null, rejected: [], errors: [], tried: [] })).toMatch(/^skipped/);
  });
});
