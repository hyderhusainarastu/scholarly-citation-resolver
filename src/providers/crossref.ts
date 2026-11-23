import type { Candidate, Provider } from "../types.js";
import { blank, normDoi, normIsbn, parseJson, safeUrl, stripTags, yearOf } from "./util.js";

const FIELDS = "DOI,title,subtitle,author,issued,URL,ISBN";

export const crossref: Provider = {
  name: "crossref",
  requestUrl(query, cfg) {
    const p = new URLSearchParams({ "query.bibliographic": query, rows: String(cfg.rows), select: FIELDS });
    if (cfg.mailto) p.set("mailto", cfg.mailto);
    return `https://api.crossref.org/works?${p}`;
  },
  parse(body) {
    const items: any[] = parseJson(body).message?.items ?? [];
    const out: Candidate[] = [];
    for (const it of items) {
      const title = it.title?.[0];
      if (typeof title !== "string" || !title.trim()) continue;
      const c = blank("crossref");
      c.title = stripTags(title);
      c.doi = normDoi(it.DOI);
      c.id = c.doi;
      c.authors = (it.author ?? [])
        .map((a: any) => [a.given, a.family].filter(Boolean).join(" ") || a.name || "")
        .filter(Boolean);
      c.year = yearOf(it.issued?.["date-parts"]?.[0]?.[0]);
      c.isbns = (it.ISBN ?? []).map((s: string) => normIsbn(String(s)));
      c.url = safeUrl(it.URL) ?? (c.doi ? `https://doi.org/${c.doi}` : null);
      out.push(c);
    }
    return out;
  },
};
