import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../src/providers/index.js";
import { arxivBody, crossrefBody, googlebooksBody, openalexBody, openlibraryBody, semanticscholarBody } from "./fixtures.js";

const cfg = { rows: 5, mailto: "me@example.org" };

describe("provider request URLs", () => {
  it("builds https URLs on the documented hosts", () => {
    const hosts = Object.fromEntries(
      Object.values(PROVIDERS).map((p) => [p.name, new URL(p.requestUrl("Marlowe 1998 Tidal Harmonics", cfg)).host]),
    );
    expect(hosts).toEqual({
      crossref: "api.crossref.org",
      openalex: "api.openalex.org",
      openlibrary: "openlibrary.org",
      googlebooks: "www.googleapis.com",
      semanticscholar: "api.semanticscholar.org",
      arxiv: "export.arxiv.org",
    });
  });
  it("passes mailto to the polite pools only", () => {
    expect(PROVIDERS.crossref.requestUrl("x y z", cfg)).toContain("mailto=me%40example.org");
    expect(PROVIDERS.openalex.requestUrl("x y z", cfg)).toContain("mailto=me%40example.org");
    expect(PROVIDERS.googlebooks.requestUrl("x y z", cfg)).not.toContain("example.org");
  });
  it("drops bare years from the Open Library query", () => {
    const u = new URL(PROVIDERS.openlibrary.requestUrl("Halloran, W. (1987) Imaginary Lighthouses", cfg));
    expect(u.searchParams.get("q")).toBe("Halloran W Imaginary Lighthouses");
  });
  it("builds an arXiv field query from the longest words", () => {
    const u = new URL(PROVIDERS.arxiv.requestUrl("Anand and Weber 2019 Sparse Lattices for Toy Routing", cfg));
    expect(u.searchParams.get("search_query")).toContain("all:lattices AND");
  });
});

describe("provider parsing (synthetic fixtures)", () => {
  it("crossref: strips markup, normalizes DOI, skips untitled items", () => {
    const c = PROVIDERS.crossref.parse(crossrefBody);
    expect(c).toHaveLength(2);
    expect(c[1]).toMatchObject({
      provider: "crossref",
      title: "Tidal Harmonics of the Northern Basin",
      doi: "10.5555/example.tides",
      authors: ["Ines Marlowe", "Tomas Okafor"],
      year: 1998,
      isbns: ["9780000000002"],
    });
  });
  it("openalex: reads display_name fallback and drops an unsafe PDF URL", () => {
    const c = PROVIDERS.openalex.parse(openalexBody);
    expect(c[0]).toMatchObject({ doi: "10.5555/example.tides", year: 1998, pdfUrl: "https://repo.example.org/tides.pdf" });
    expect(c[1].title).toBe("Unsafe Link Study");
    expect(c[1].pdfUrl).toBeNull();
  });
  it("openlibrary: normalizes ISBNs, skips untitled docs", () => {
    const c = PROVIDERS.openlibrary.parse(openlibraryBody);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ year: 1987, isbns: ["0000000000", "9780000000002"], url: "https://openlibrary.org/works/OL1W" });
  });
  it("googlebooks: keeps ISBN identifiers only", () => {
    const c = PROVIDERS.googlebooks.parse(googlebooksBody);
    expect(c[0]).toMatchObject({ year: 1991, isbns: ["0000000000", "9780000000002"] });
  });
  it("semanticscholar: strips arXiv version", () => {
    const c = PROVIDERS.semanticscholar.parse(semanticscholarBody);
    expect(c[0]).toMatchObject({ arxivId: "1901.00001", doi: "10.5555/toy.routing", year: 2019 });
  });
  it("arxiv: parses Atom, decodes entities, upgrades the PDF link to https", () => {
    const c = PROVIDERS.arxiv.parse(arxivBody);
    expect(c[0]).toMatchObject({
      arxivId: "1901.00001",
      title: "Sparse Lattices for Toy Routing & Friends",
      authors: ["Priya Anand", "Jonas Weber"],
      year: 2019,
      doi: "10.5555/toy.routing",
      pdfUrl: "https://arxiv.org/pdf/1901.00001v2",
    });
  });
  it("throws on malformed bodies instead of returning garbage", () => {
    expect(() => PROVIDERS.crossref.parse("<html>oops</html>")).toThrow();
    expect(() => PROVIDERS.arxiv.parse("{}")).toThrow();
  });
});
