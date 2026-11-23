import { createHttp, isSafePublicUrl, type HttpClient } from "./http.js";
import { PROVIDERS } from "./providers/index.js";
import {
  ALL_PROVIDERS,
  type Candidate,
  type CitationForm,
  type ClassicalBackstop,
  type GuardChecks,
  type Provider,
  type ProviderName,
  type Rejection,
  type Resolution,
} from "./types.js";

/* ------------------------------------------------------------ text helpers */

const STOPWORDS = new Set(
  "a an the of on in and or to for is are was be as at by with from into its it this that all you not de la le et und der die das du un una el los las von van".split(" "),
);

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Significant lower-case words of a string: accents folded, stopwords and 1-letter tokens dropped. */
export function words(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Share of the candidate title's significant words that also occur in the
 * citation text. Measuring from the candidate side is deliberate: a citation
 * carries authors, venue and pages that are not in any title, but a wrong
 * match usually has title words the citation never mentions. A "Title:
 * Subtitle" candidate is also scored on its main title alone; the higher
 * score counts.
 */
export function titleOverlap(citation: string, candidateTitle: string): number {
  const have = new Set(words(citation));
  const score = (t: string) => {
    const w = [...new Set(words(t))];
    return w.length === 0 ? 0 : w.filter((x) => have.has(x)).length / w.length;
  };
  const main = candidateTitle.split(/\s*[:—]\s+/)[0];
  return Math.max(score(candidateTitle), main !== candidateTitle ? score(main) : 0);
}

export function citationYears(text: string): number[] {
  return [...text.matchAll(/(?<![\d.])((?:1[5-9]|20)\d{2})(?![\d])/g)].map((m) => Number(m[1]));
}

function familyName(display: string): string {
  const parts = fold(display).split(/[^\p{L}]+/u).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/* -------------------------------------------------------- form classification */

// Locus references of the "514a", "1094a1" or "64a-67b" kind. Four-digit
// numbers from 1500 up are excluded so that a year with a suffix ("1999a")
// is not mistaken for one.
const LOCUS = /(?<![\d.])(?:[1-9]\d{0,2}|1[0-4]\d{2})[a-e](?:[.,:]?\d{1,3})?(?:\s*[-–]\s*\d{0,4}[a-e]?\d{0,3})?(?![\p{L}\d])/u;
const ARXIV_ID = /\b(?:arxiv:?\s*)?\d{4}\.\d{4,5}(?:v\d+)?\b|\barxiv\b|\bbiorxiv\b|\bmedrxiv\b|\bssrn\b|\bpreprint\b/i;
const CHAPTER = /\bin:?\s+[^.]{3,120}?\(\s*eds?\.?\s*\)|\bin:?\s+[^.]{3,120}?,\s*eds?\.|\bchapter\s+\d+\b|\bpp?\.\s*\d+\s*[-–]\s*\d+.*\bin\b/i;
const ARTICLE =
  /["“][^"”]{4,}["”]|\b(?:journal|review|quarterly|proceedings|transactions|annals|letters|bulletin|nature|science)\b|\bvol(?:ume)?\.?\s*\d+|\b\d+\s*\(\d+\)\s*[:,]?\s*\d+|\bdoi:?\s*10\.|\b10\.\d{4,9}\//i;
const BOOK =
  /\b(?:press|publishers?|publishing|books|isbn|editions?|reprint|handbook|trans(?:lated|\.)|\d+(?:st|nd|rd|th)\s+ed\.?)\b|,\s*eds?\.,/i;

/** Classify a free-text citation from its own surface features. First match wins in the order below. */
export function classifyForm(text: string): CitationForm {
  if (LOCUS.test(text)) return "classical";
  if (ARXIV_ID.test(text)) return "preprint";
  if (CHAPTER.test(text)) return "chapter";
  if (ARTICLE.test(text)) return "article";
  if (BOOK.test(text)) return "book";
  return "unknown";
}

export const PROVIDER_ORDER: Record<CitationForm, ProviderName[]> = {
  article: ["crossref", "openalex", "semanticscholar", "arxiv", "openlibrary", "googlebooks"],
  preprint: ["arxiv", "semanticscholar", "openalex", "crossref"],
  book: ["openlibrary", "googlebooks", "openalex", "crossref"],
  chapter: ["crossref", "openalex", "googlebooks", "openlibrary"],
  classical: [],
  unknown: ["crossref", "openalex", "openlibrary", "googlebooks", "semanticscholar", "arxiv"],
};

/* ------------------------------------------------------------------- guard */

export interface GuardOptions {
  /** Minimum title overlap, 0..1. Default 0.8. */
  threshold?: number;
  /** Largest accepted gap in years between citation and record. Default 1. */
  yearTolerance?: number;
  /** Also reject a record whose authors share no family name with the citation. Default false. */
  requireAuthor?: boolean;
  /** Reject year conflicts for books too. Default false, because reprints carry later years. */
  strictBookYear?: boolean;
}

export function evaluate(
  citation: string,
  cand: Candidate,
  form: CitationForm,
  g: GuardOptions = {},
): { checks: GuardChecks; reason: Rejection["reason"] | null } {
  const threshold = g.threshold ?? 0.8;
  const tol = g.yearTolerance ?? 1;
  const years = citationYears(citation);
  const yearOk =
    cand.year === null || years.length === 0 ? null : years.some((y) => Math.abs(y - cand.year!) <= tol);
  const have = new Set(words(citation));
  const authorOk =
    cand.authors.length === 0 ? null : cand.authors.some((a) => {
      const f = familyName(a);
      return f.length > 1 && have.has(f);
    });
  const checks: GuardChecks = { title: titleOverlap(citation, cand.title), yearOk, authorOk };
  let reason: Rejection["reason"] | null = null;
  if (checks.title < threshold) reason = "title-overlap";
  else if (yearOk === false && (form !== "book" || g.strictBookYear)) reason = "year-mismatch";
  else if (authorOk === false && g.requireAuthor) reason = "author-mismatch";
  return { checks, reason };
}

/* ----------------------------------------------------------------- resolve */

export interface ResolveOptions extends GuardOptions {
  /** Restrict to, and order by, these providers. Default: the order for the detected form. */
  providers?: ProviderName[];
  /** false returns the first provider's top hit with no checks. For measurement only. Default true. */
  guard?: boolean;
  http?: HttpClient;
  mailto?: string;
  backstop?: ClassicalBackstop;
  /** Rows requested per provider. Default 5. */
  rows?: number;
  /** Provider implementations, mainly for tests. */
  registry?: Partial<Record<ProviderName, Provider>>;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sanitize(c: Candidate): Candidate {
  return c.pdfUrl && !isSafePublicUrl(c.pdfUrl) ? { ...c, pdfUrl: null } : c;
}

export async function resolveCitation(text: string, opts: ResolveOptions = {}): Promise<Resolution> {
  const query = cleanText(text);
  const form = classifyForm(query);
  const res: Resolution = { status: "unresolved", form, query, record: null, checks: null, rejected: [], errors: [], tried: [] };
  if (query.length < 6) return res;

  if (form === "classical") {
    const rec = opts.backstop ? await opts.backstop.resolve(query) : null;
    if (rec) return { ...res, status: "resolved", record: sanitize(rec) };
    return { ...res, status: "skipped" };
  }

  const names = opts.providers ?? PROVIDER_ORDER[form];
  const http = opts.http ?? createHttp({ mailto: opts.mailto });
  const rows = opts.rows ?? 5;
  const guardOn = opts.guard !== false;

  for (const name of names) {
    const provider = opts.registry?.[name] ?? PROVIDERS[name];
    if (!provider) continue;
    res.tried.push(name);
    let cands: Candidate[];
    try {
      cands = provider.parse(await http.getText(provider.requestUrl(query, { mailto: opts.mailto ?? http.mailto, rows })));
    } catch (err) {
      res.errors.push({ provider: name, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!guardOn) {
      if (cands.length > 0) {
        return { ...res, status: "resolved", record: sanitize(cands[0]) };
      }
      continue;
    }
    let best: { cand: Candidate; checks: GuardChecks; rank: number } | null = null;
    for (const cand of cands) {
      const { checks, reason } = evaluate(query, cand, form, opts);
      if (reason) {
        res.rejected.push({ provider: name, title: cand.title, doi: cand.doi, reason, checks });
        continue;
      }
      const rank = checks.title + (checks.authorOk ? 0.1 : 0) + (checks.yearOk ? 0.05 : 0);
      if (!best || rank > best.rank) best = { cand, checks, rank };
    }
    if (best) return { ...res, status: "resolved", record: sanitize(best.cand), checks: best.checks };
  }
  return res;
}

export { ALL_PROVIDERS };
