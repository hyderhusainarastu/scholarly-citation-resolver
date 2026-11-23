import type { Candidate, Provider } from "../types.js";
import { blank, normIsbn, parseJson, plainQuery, safeUrl, yearOf } from "./util.js";

export const googlebooks: Provider = {
  name: "googlebooks",
  requestUrl(query, cfg) {
    const p = new URLSearchParams({ q: plainQuery(query), maxResults: String(cfg.rows) });
    return `https://www.googleapis.com/books/v1/volumes?${p}`;
  },
  parse(body) {
    const items: any[] = parseJson(body).items ?? [];
    const out: Candidate[] = [];
    for (const it of items) {
      const v = it.volumeInfo;
      if (!v || typeof v.title !== "string" || !v.title.trim()) continue;
      const c = blank("googlebooks");
      c.title = v.title.trim();
      c.id = it.id ?? null;
      c.authors = v.authors ?? [];
      c.year = yearOf(v.publishedDate);
      c.isbns = (v.industryIdentifiers ?? [])
        .filter((i: any) => i.type === "ISBN_13" || i.type === "ISBN_10")
        .map((i: any) => normIsbn(String(i.identifier)));
      c.url = safeUrl(v.infoLink);
      out.push(c);
    }
    return out;
  },
};
