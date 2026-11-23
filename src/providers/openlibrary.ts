import type { Candidate, Provider } from "../types.js";
import { blank, normIsbn, parseJson, plainQuery, yearOf } from "./util.js";

const FIELDS = "key,title,subtitle,author_name,first_publish_year,isbn";

export const openlibrary: Provider = {
  name: "openlibrary",
  requestUrl(query, cfg) {
    // Its full-text search often returns nothing when a bare year is mixed
    // with author words, so years are dropped from the query.
    const q = plainQuery(query).replace(/\b(?:1[5-9]|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
    const p = new URLSearchParams({ q, limit: String(cfg.rows), fields: FIELDS });
    return `https://openlibrary.org/search.json?${p}`;
  },
  parse(body) {
    const docs: any[] = parseJson(body).docs ?? [];
    const out: Candidate[] = [];
    for (const d of docs) {
      if (typeof d.title !== "string" || !d.title.trim()) continue;
      const c = blank("openlibrary");
      c.title = d.title.trim();
      c.id = d.key ?? null;
      c.authors = d.author_name ?? [];
      c.year = yearOf(d.first_publish_year);
      c.isbns = (d.isbn ?? []).slice(0, 20).map((s: string) => normIsbn(String(s)));
      c.url = typeof d.key === "string" && d.key.startsWith("/") ? `https://openlibrary.org${d.key}` : null;
      out.push(c);
    }
    return out;
  },
};
