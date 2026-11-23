import { describe, expect, it } from "vitest";
import { PROVIDER_ORDER, classifyForm } from "../src/resolve.js";

describe("classifyForm", () => {
  const cases: [string, string][] = [
    ["Marlowe, I. (1998). Tidal harmonics of the northern basin. Journal of Imaginary Oceans 12(3): 101-120.", "article"],
    ['Okafor, T. "Notes on a Quiet Estuary", 2004', "article"],
    ["Halloran, Wren. A Field Guide to Imaginary Lighthouses. Harbor Press, 1987.", "book"],
    ["Halloran W. Lighthouses, 2nd ed.", "book"],
    ["Anand P., Weber J. Sparse lattices for toy routing. arXiv:1901.00001", "preprint"],
    ["Anand and Weber, Sparse lattices, 1901.00001v2", "preprint"],
    ["Okafor, T. Estuary notes. In: Essays on Water (ed.) A. Rossi, pp. 40-61", "chapter"],
    ["Plato, Republic 514a-517c", "classical"],
    ["Aristotle, Nicomachean Ethics 1094a1-5", "classical"],
    ["Plato, Phaedo 64a", "classical"],
    ["Some title with nothing else", "unknown"],
  ];
  for (const [text, want] of cases) {
    it(`${want}: ${text.slice(0, 50)}`, () => expect(classifyForm(text)).toBe(want));
  }
  it("does not read a lettered year as a locus", () => {
    expect(classifyForm("Smith (1999a) Quiet Harbors, Harbor Press")).toBe("book");
  });
  it("orders providers by form", () => {
    expect(PROVIDER_ORDER.book[0]).toBe("openlibrary");
    expect(PROVIDER_ORDER.article[0]).toBe("crossref");
    expect(PROVIDER_ORDER.preprint[0]).toBe("arxiv");
    expect(PROVIDER_ORDER.classical).toEqual([]);
  });
});
