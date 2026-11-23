import { isSafePublicUrl } from "../http.js";
import type { Candidate, ProviderName } from "../types.js";

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function normDoi(d: string | null | undefined): string | null {
  if (!d) return null;
  const v = d.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i, "").toLowerCase();
  return v || null;
}

export function normIsbn(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

export function yearOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string") {
    const m = /^(\d{4})/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

export function safeUrl(u: string | null | undefined): string | null {
  return u && isSafePublicUrl(u) ? u : null;
}

export function blank(provider: ProviderName): Candidate {
  return { provider, id: null, title: "", authors: [], year: null, doi: null, isbns: [], arxivId: null, url: null, pdfUrl: null };
}

export function parseJson(body: string): Record<string, any> {
  const v = JSON.parse(body);
  if (v === null || typeof v !== "object") throw new Error("response is not a JSON object");
  return v;
}

/** Collapse a citation to plain search words: drop punctuation noise, keep letters, digits, spaces. */
export function plainQuery(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
