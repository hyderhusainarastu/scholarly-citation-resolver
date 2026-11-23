import type { Candidate, Provider } from "../types.js";
import { blank, normDoi, parseJson, safeUrl, yearOf } from "./util.js";

const FIELDS = "id,doi,title,display_name,publication_year,authorships,best_oa_location,primary_location";

export const openalex: Provider = {
  name: "openalex",
  requestUrl(query, cfg) {
    const p = new URLSearchParams({ search: query, per_page: String(cfg.rows), select: FIELDS });
    if (cfg.mailto) p.set("mailto", cfg.mailto);
    return `https://api.openalex.org/works?${p}`;
  },
  parse(body) {
    const items: any[] = parseJson(body).results ?? [];
    const out: Candidate[] = [];
    for (const w of items) {
      const title = w.title ?? w.display_name;
      if (typeof title !== "string" || !title.trim()) continue;
      const c = blank("openalex");
      c.title = title.trim();
      c.id = w.id ?? null;
      c.doi = normDoi(w.doi);
      c.authors = (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean);
      c.year = yearOf(w.publication_year);
      c.url = safeUrl(w.primary_location?.landing_page_url) ?? (c.doi ? `https://doi.org/${c.doi}` : null);
      c.pdfUrl = safeUrl(w.best_oa_location?.pdf_url);
      out.push(c);
    }
    return out;
  },
};
