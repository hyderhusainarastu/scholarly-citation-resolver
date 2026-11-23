/** Shared types for the resolver. */

export type CitationForm = "article" | "book" | "chapter" | "preprint" | "classical" | "unknown";

export type ProviderName =
  | "crossref"
  | "openalex"
  | "openlibrary"
  | "googlebooks"
  | "semanticscholar"
  | "arxiv";

export const ALL_PROVIDERS: readonly ProviderName[] = [
  "crossref",
  "openalex",
  "openlibrary",
  "googlebooks",
  "semanticscholar",
  "arxiv",
];

/** One normalized metadata record, whichever provider produced it. */
export interface Candidate {
  provider: ProviderName;
  /** Provider-native identifier (DOI, work id, volume id, arXiv id), if any. */
  id: string | null;
  title: string;
  /** Display names in citation order, e.g. "Ada Lovelace". */
  authors: string[];
  year: number | null;
  /** Lower-case DOI without a resolver prefix. */
  doi: string | null;
  /** ISBNs with hyphens and spaces removed. */
  isbns: string[];
  /** arXiv identifier without version, e.g. "1706.03762". */
  arxivId: string | null;
  url: string | null;
  /** Only ever set to a URL that passed the public-https check. */
  pdfUrl: string | null;
}

export interface ProviderRequestConfig {
  mailto?: string;
  rows: number;
}

/** A metadata source: builds one request URL and parses the response body. */
export interface Provider {
  readonly name: ProviderName;
  requestUrl(query: string, cfg: ProviderRequestConfig): string;
  /** Parse the raw response text into candidates, best-ranked first. Throws on malformed bodies. */
  parse(body: string): Candidate[];
}

/**
 * Optional hook for classical-locus citations (for example a Stephanus or
 * Bekker page reference). The library ships no data: supply your own lookup.
 */
export interface ClassicalBackstop {
  resolve(text: string): Candidate | null | Promise<Candidate | null>;
}

export interface GuardChecks {
  /** Share of the candidate's title words found in the citation text, 0..1. */
  title: number;
  /** null when the citation or the candidate has no year. */
  yearOk: boolean | null;
  /** null when the candidate lists no authors. */
  authorOk: boolean | null;
}

export interface Rejection {
  provider: ProviderName;
  title: string;
  doi: string | null;
  reason: "title-overlap" | "year-mismatch" | "author-mismatch";
  checks: GuardChecks;
}

export interface Resolution {
  status: "resolved" | "unresolved" | "skipped";
  form: CitationForm;
  query: string;
  record: Candidate | null;
  /** Guard checks for the accepted record (null when none or the guard is off). */
  checks: GuardChecks | null;
  /** Near-misses the guard refused, in the order they were seen. */
  rejected: Rejection[];
  /** Providers that failed (network error, bad body); they never abort the run. */
  errors: { provider: ProviderName; message: string }[];
  tried: ProviderName[];
}
