import type { Candidate, Provider } from "../types.js";
import { blank, normDoi, plainQuery, safeUrl, yearOf } from "./util.js";

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "arxiv", "preprint"]);

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1].replace(/\s+/g, " ").trim()) : null;
}

export const arxiv: Provider = {
  name: "arxiv",
  requestUrl(query, cfg) {
    // The API takes a field query. Use the longest distinct words, all required.
    const words = [...new Set(plainQuery(query).toLowerCase().split(" "))]
      .filter((w) => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w))
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    const search = (words.length ? words : [plainQuery(query)]).map((w) => `all:${w}`).join(" AND ");
    const p = new URLSearchParams({ search_query: search, max_results: String(cfg.rows) });
    return `https://export.arxiv.org/api/query?${p}`;
  },
  parse(body) {
    if (!/<feed[\s>]/.test(body)) throw new Error("response is not an Atom feed");
    const out: Candidate[] = [];
    for (const m of body.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      const title = tag(e, "title");
      const idUrl = tag(e, "id");
      if (!title || !idUrl) continue;
      const c = blank("arxiv");
      c.title = title;
      const id = /abs\/(.+)$/.exec(idUrl)?.[1]?.replace(/v\d+$/, "") ?? null;
      c.arxivId = id;
      c.id = id;
      c.authors = [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => decode(a[1].trim()));
      c.year = yearOf(tag(e, "published"));
      c.doi = normDoi(tag(e, "arxiv:doi"));
      c.url = id ? `https://arxiv.org/abs/${id}` : null;
      const pdf = /<link[^>]*title="pdf"[^>]*href="([^"]+)"/.exec(e) ?? /<link[^>]*href="([^"]+)"[^>]*title="pdf"/.exec(e);
      c.pdfUrl = safeUrl(pdf?.[1].replace(/^http:/, "https:"));
      out.push(c);
    }
    return out;
  },
};
