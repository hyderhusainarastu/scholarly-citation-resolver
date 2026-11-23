import type { Candidate, Provider } from "../types.js";
import { blank, normDoi, parseJson, safeUrl, yearOf } from "./util.js";

const FIELDS = "title,authors,year,externalIds,openAccessPdf,url";

export const semanticscholar: Provider = {
  name: "semanticscholar",
  requestUrl(query, cfg) {
    const p = new URLSearchParams({ query, limit: String(cfg.rows), fields: FIELDS });
    return `https://api.semanticscholar.org/graph/v1/paper/search?${p}`;
  },
  parse(body) {
    const items: any[] = parseJson(body).data ?? [];
    const out: Candidate[] = [];
    for (const p of items) {
      if (typeof p.title !== "string" || !p.title.trim()) continue;
      const c = blank("semanticscholar");
      c.title = p.title.trim();
      c.id = p.paperId ?? null;
      c.authors = (p.authors ?? []).map((a: any) => a.name).filter(Boolean);
      c.year = yearOf(p.year);
      c.doi = normDoi(p.externalIds?.DOI);
      c.arxivId = p.externalIds?.ArXiv ? String(p.externalIds.ArXiv).replace(/v\d+$/, "") : null;
      c.url = safeUrl(p.url);
      c.pdfUrl = safeUrl(p.openAccessPdf?.url);
      out.push(c);
    }
    return out;
  },
};
