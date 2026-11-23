import { describe, expect, it } from "vitest";
import { createHttp } from "../src/http.js";
import { evaluate, resolveCitation, titleOverlap } from "../src/resolve.js";
import type { Candidate } from "../src/types.js";
import { crossrefBody, googlebooksBody, openalexBody, openlibraryBody, stubFetch } from "./fixtures.js";

const fast = (fn: typeof fetch) => createHttp({ fetch: fn, sleep: async () => {}, minIntervalMs: 0, maxRetries: 1 });
const TIDES = "Marlowe, I., Okafor, T. (1998) Tidal Harmonics of the Northern Basin. Journal of Imaginary Oceans 12(3)";

describe("title-overlap guard", () => {
  it("scores the candidate's own words, so extra words in the candidate lower it", () => {
    expect(titleOverlap(TIDES, "Tidal Harmonics of the Northern Basin")).toBe(1);
    expect(titleOverlap(TIDES, "Tidal Harmonics of the Southern Delta Region")).toBeLessThan(0.8);
  });
  it("scores a 'Title: Subtitle' candidate on its main title too", () => {
    expect(titleOverlap("Halloran, Field Guide to Imaginary Lighthouses", "Field Guide to Imaginary Lighthouses: Revised Anniversary Edition")).toBe(1);
  });
  it("rejects a near-miss and accepts the true record ranked below it", async () => {
    const { fn } = stubFetch({ "api.crossref.org": crossrefBody });
    const r = await resolveCitation(TIDES, { http: fast(fn), providers: ["crossref"] });
    expect(r.status).toBe("resolved");
    expect(r.record?.doi).toBe("10.5555/example.tides");
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ reason: "title-overlap", doi: "10.5555/example.near-miss" });
  });
  it("with the guard off, takes the near-miss at rank one", async () => {
    const { fn } = stubFetch({ "api.crossref.org": crossrefBody });
    const r = await resolveCitation(TIDES, { http: fast(fn), providers: ["crossref"], guard: false });
    expect(r.record?.doi).toBe("10.5555/example.near-miss");
  });
  it("stays unresolved when only near-misses exist", async () => {
    const onlyMiss = JSON.stringify({ message: { items: JSON.parse(crossrefBody).message.items.slice(0, 1) } });
    const { fn } = stubFetch({ "api.crossref.org": onlyMiss });
    const r = await resolveCitation(TIDES, { http: fast(fn), providers: ["crossref"] });
    expect(r.status).toBe("unresolved");
    expect(r.record).toBeNull();
    expect(r.rejected).toHaveLength(1);
  });
  it("honours a configurable threshold", async () => {
    const onlyMiss = JSON.stringify({ message: { items: JSON.parse(crossrefBody).message.items.slice(0, 1) } });
    const { fn } = stubFetch({ "api.crossref.org": onlyMiss });
    const r = await resolveCitation(TIDES, { http: fast(fn), providers: ["crossref"], threshold: 0.3 });
    expect(r.status).toBe("resolved");
  });
});

describe("author and year agreement", () => {
  const cand: Candidate = {
    provider: "crossref", id: null, title: "Tidal Harmonics of the Northern Basin", authors: ["Ines Marlowe"],
    year: 1998, doi: null, isbns: [], arxivId: null, url: null, pdfUrl: null,
  };
  it("rejects a year conflict beyond the tolerance", () => {
    expect(evaluate("Marlowe 2010 Tidal Harmonics of the Northern Basin", cand, "article").reason).toBe("year-mismatch");
    expect(evaluate("Marlowe 1999 Tidal Harmonics of the Northern Basin", cand, "article").reason).toBeNull();
  });
  it("does not reject a book for a reprint year by default", () => {
    expect(evaluate("Marlowe 2010 Tidal Harmonics of the Northern Basin Press", cand, "book").reason).toBeNull();
    expect(evaluate("Marlowe 2010 Tidal Harmonics of the Northern Basin Press", cand, "book", { strictBookYear: true }).reason).toBe("year-mismatch");
  });
  it("treats a missing year as unknown, not a conflict", () => {
    const e = evaluate("Tidal Harmonics of the Northern Basin", cand, "article");
    expect(e.checks.yearOk).toBeNull();
    expect(e.reason).toBeNull();
  });
  it("checks author family names only when asked", () => {
    const text = "Rossi 1998 Tidal Harmonics of the Northern Basin";
    expect(evaluate(text, cand, "article").checks.authorOk).toBe(false);
    expect(evaluate(text, cand, "article").reason).toBeNull();
    expect(evaluate(text, cand, "article", { requireAuthor: true }).reason).toBe("author-mismatch");
    expect(evaluate("Marlowe 1998 Tidal Harmonics of the Northern Basin", cand, "article", { requireAuthor: true }).reason).toBeNull();
  });
});

describe("provider order and failure handling", () => {
  it("tries book catalogues first for a book citation", async () => {
    const { fn, calls } = stubFetch({ "openlibrary.org": openlibraryBody });
    const r = await resolveCitation("Halloran, Wren. A Field Guide to Imaginary Lighthouses. Harbor Press, 1987.", { http: fast(fn) });
    expect(r.form).toBe("book");
    expect(r.tried).toEqual(["openlibrary"]);
    expect(calls).toHaveLength(1);
    expect(r.record?.isbns).toContain("9780000000002");
  });
  it("falls through to the next provider when one fails, and records the error", async () => {
    const { fn } = stubFetch({
      "openlibrary.org": () => new Response("boom", { status: 500 }),
      "googleapis.com": googlebooksBody,
    });
    const r = await resolveCitation("Halloran, Wren. A Field Guide to Imaginary Lighthouses. Harbor Press, 1987.", { http: fast(fn) });
    expect(r.record?.provider).toBe("googlebooks");
    expect(r.errors.map((e) => e.provider)).toEqual(["openlibrary"]);
  });
  it("honours an explicit provider list and order", async () => {
    const { fn } = stubFetch({ "api.openalex.org": openalexBody });
    const r = await resolveCitation(TIDES, { http: fast(fn), providers: ["openalex"] });
    expect(r.tried).toEqual(["openalex"]);
    expect(r.record?.pdfUrl).toBe("https://repo.example.org/tides.pdf");
  });
  it("makes no network call for a classical locus, and returns skipped", async () => {
    const { fn, calls } = stubFetch({});
    const r = await resolveCitation("Plato, Republic 514a-517c", { http: fast(fn) });
    expect(r.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
  it("uses a supplied backstop for a classical locus", async () => {
    const rec: Candidate = {
      provider: "crossref", id: "local:1", title: "Republic", authors: [], year: null, doi: null, isbns: [],
      arxivId: null, url: null, pdfUrl: "http://10.0.0.1/x.pdf",
    };
    const r = await resolveCitation("Plato, Republic 514a-517c", { backstop: { resolve: () => rec } });
    expect(r.status).toBe("resolved");
    expect(r.record?.pdfUrl).toBeNull();
  });
  it("ignores citations too short to search", async () => {
    const r = await resolveCitation("  hi ");
    expect(r.status).toBe("unresolved");
    expect(r.tried).toEqual([]);
  });
});
