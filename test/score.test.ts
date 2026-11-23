import { describe, expect, it } from "vitest";
import { isLabelled, outcome, summarize, type GoldItem } from "../eval/score.js";
import type { Candidate, Resolution } from "../src/types.js";

const cand = (o: Partial<Candidate>): Candidate => ({
  provider: "crossref", id: null, title: "", authors: [], year: null, doi: null, isbns: [], arxivId: null, url: null, pdfUrl: null, ...o,
});
const res = (record: Candidate | null, status: Resolution["status"] = record ? "resolved" : "unresolved"): Resolution => ({
  status, form: "article", query: "q", record, checks: null, rejected: [], errors: [], tried: [],
});
const art: GoldItem = { id: "a", form: "article", query: "q", title: "T", firstAuthor: "X", year: 2000, expect: { doi: "10.1/abc" } };
const book: GoldItem = { id: "b", form: "book", query: "q", title: "Quiet Harbors", firstAuthor: "Halloran", year: 1987, expect: { isbn: "9780000000002" } };
const absent: GoldItem = { id: "n", form: "absent", query: "q", title: null, firstAuthor: null, year: null, expect: null };

describe("eval scoring", () => {
  it("matches by DOI, arXiv id or ISBN", () => {
    expect(isLabelled(cand({ doi: "10.1/abc" }), art)).toBe(true);
    expect(isLabelled(cand({ doi: "10.1/other" }), art)).toBe(false);
    const pre: GoldItem = { ...art, expect: { arxiv: "1901.00001" } };
    expect(isLabelled(cand({ doi: "10.48550/arxiv.1901.00001" }), pre)).toBe(true);
    expect(isLabelled(cand({ isbns: ["9780000000002"] }), book)).toBe(true);
  });
  it("accepts another edition of a book only when title and first author match", () => {
    expect(isLabelled(cand({ title: "Quiet Harbors", authors: ["Wren Halloran"], isbns: ["1"] }), book)).toBe(true);
    expect(isLabelled(cand({ title: "Quiet Harbors", authors: ["Someone Else"], isbns: ["1"] }), book)).toBe(false);
    expect(isLabelled(cand({ title: "Quiet Harbors Revisited and Other Essays", authors: ["Wren Halloran"] }), book)).toBe(false);
  });
  it("classifies outcomes", () => {
    expect(outcome(art, res(cand({ doi: "10.1/abc" })))).toBe("correct");
    expect(outcome(art, res(cand({ doi: "10.1/x" })))).toBe("wrong");
    expect(outcome(art, res(null))).toBe("missed");
    expect(outcome(absent, res(cand({ doi: "10.1/x" })))).toBe("false-accept");
    expect(outcome(absent, res(null))).toBe("true-reject");
  });
  it("computes precision and recall", () => {
    const s = summarize(["correct", "correct", "wrong", "missed", "false-accept", "true-reject"]);
    expect(s).toMatchObject({ labelled: 4, correct: 2, wrong: 1, missed: 1, falseAccepts: 1 });
    expect(s.precision).toBeCloseTo(0.5);
    expect(s.recall).toBeCloseTo(0.5);
    expect(summarize([]).precision).toBeNull();
  });
});

describe("gold set", () => {
  it("has at least 40 labelled public items and unique ids", async () => {
    const { readFileSync } = await import("node:fs");
    const gold: GoldItem[] = JSON.parse(readFileSync(new URL("../eval/gold.json", import.meta.url), "utf8"));
    expect(gold.filter((g) => g.expect).length).toBeGreaterThanOrEqual(40);
    expect(new Set(gold.map((g) => g.id)).size).toBe(gold.length);
  });
});
