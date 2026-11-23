import { titleOverlap } from "../src/resolve.js";
import type { Candidate, Resolution } from "../src/types.js";

export interface GoldItem {
  id: string;
  form: "article" | "preprint" | "book" | "classical" | "absent";
  query: string;
  title: string | null;
  firstAuthor: string | null;
  year: number | null;
  expect: { doi?: string; arxiv?: string; isbn?: string } | null;
}

export type Outcome = "correct" | "wrong" | "missed" | "true-reject" | "false-accept";

/**
 * Did the resolver return the labelled work? An identifier match always
 * counts. For a book, any edition of the work counts: the title must match
 * the gold title and the first author's family name must appear among the
 * record's authors, because one work has many ISBNs.
 */
export function isLabelled(rec: Candidate, g: GoldItem): boolean {
  const e = g.expect;
  if (!e) return false;
  if (e.doi && rec.doi === e.doi.toLowerCase()) return true;
  if (e.arxiv && (rec.arxivId === e.arxiv || rec.doi === `10.48550/arxiv.${e.arxiv}`)) return true;
  if (e.isbn) {
    if (rec.isbns.includes(e.isbn)) return true;
    const fam = (g.firstAuthor ?? "").toLowerCase();
    const authorHit = rec.authors.some((a) => a.toLowerCase().split(/\s+/).includes(fam));
    return authorHit && titleOverlap(g.title ?? "", rec.title) >= 0.8 && titleOverlap(rec.title, g.title ?? "") >= 0.8;
  }
  return false;
}

export function outcome(g: GoldItem, r: Resolution): Outcome {
  const resolved = r.status === "resolved" && r.record !== null;
  if (!g.expect) return resolved ? "false-accept" : "true-reject";
  if (!resolved) return "missed";
  return isLabelled(r.record!, g) ? "correct" : "wrong";
}

export interface Summary {
  items: number;
  labelled: number;
  correct: number;
  wrong: number;
  missed: number;
  falseAccepts: number;
  trueRejects: number;
  /** correct / (correct + wrong + falseAccepts); null when nothing was returned. */
  precision: number | null;
  /** correct / labelled */
  recall: number | null;
}

export function summarize(outcomes: Outcome[]): Summary {
  const n = (o: Outcome) => outcomes.filter((x) => x === o).length;
  const correct = n("correct"), wrong = n("wrong"), missed = n("missed"), fa = n("false-accept");
  const labelled = correct + wrong + missed;
  const returned = correct + wrong + fa;
  return {
    items: outcomes.length,
    labelled,
    correct,
    wrong,
    missed,
    falseAccepts: fa,
    trueRejects: n("true-reject"),
    precision: returned ? correct / returned : null,
    recall: labelled ? correct / labelled : null,
  };
}
