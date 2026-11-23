# scholarly-citation-resolver

Resolve a messy free-text citation to verified metadata (title, authors, year, DOI, ISBN, arXiv id) from six open scholarly sources, and refuse to return a match that does not fit. For researchers, editors and anyone who needs bibliographic facts that came from a lookup instead of from memory.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Zero runtime dependencies. TypeScript, Node 20 or newer. Providers: Crossref, OpenAlex, Open Library, Google Books, Semantic Scholar, arXiv.

## Works with

| Surface | How (prompt / native skill / CLI / hook / MCP) | Status |
|---|---|---|
| Command line | CLI (`cite-resolve`) | tested 2026-11-23, Node 24.22.3 |
| Node / TypeScript projects | library (`resolveCitation`) | tested 2026-11-23, Node 24.22.3 (unit tests, offline) |
| Claude Code | CLI called from the shell, rules in `AGENTS.md` and `CLAUDE.md` | not tested |
| Codex | CLI called from the shell, rules in `AGENTS.md` | not tested |
| Gemini CLI | CLI called from the shell, rules in `GEMINI.md` | not tested |
| Cursor | CLI called from the shell, rules in `AGENTS.md` | not tested |
| Copilot | pointer to `AGENTS.md` | not tested |

No chat-prompt version is shipped: this is a CLI and a library. A chat assistant can use it only through a shell or code tool.

## Quick start

Not published to npm yet. From a clone:

```sh
git clone https://github.com/hyderhusainarastu/scholarly-citation-resolver
cd scholarly-citation-resolver
npm install
npm run build
npm test            # offline, all network calls stubbed
node dist/src/cli.js "Turing, A. M. (1950). Computing machinery and intelligence. Mind, 59(236), 433-460."
```

Options: `--json`, `--providers crossref,openalex`, `--mailto you@example.org`, `--threshold 0.8`, `--require-author`, `--timeout 10000`. Exit codes: 0 resolved, 1 not resolved, 2 usage error.

As a library:

```ts
import { resolveCitation } from "scholarly-citation-resolver";

const r = await resolveCitation("Turing, A. M. (1950). Computing machinery and intelligence. Mind 59(236).", {
  mailto: "you@example.org", // optional, used for provider polite pools
});
if (r.status === "resolved") console.log(r.record!.doi);
else console.log(r.status, r.rejected); // never guess
```

## Example

Real run, 2026-11-23:

```
$ cite-resolve "Turing, A. M. (1950). Computing machinery and intelligence. Mind, 59(236), 433-460."
resolved (article) via crossref, title overlap 1.00
  title:   I.—COMPUTING MACHINERY AND INTELLIGENCE
  authors: A. M. TURING
  year:    1950
  doi:     10.1093/mind/lix.236.433
  url:     https://doi.org/10.1093/mind/lix.236.433
$ echo $?
0

$ cite-resolve '"Quantum Marmalade Dynamics in Baroque Orchards." Journal of Unlikely Studies 12(3), 2011'
unresolved (article): 5 candidate(s) rejected by the guard, closest: "Introduction" (title-overlap)
$ echo $?
1
```

The second citation is invented. Crossref returned five unrelated records and the guard refused all of them.

## How it works

1. **Classify the form** from the text: article, book, chapter, preprint, or classical locus (for example `Republic 514a`).
2. **Pick the provider order for that form.** Articles go Crossref first, books Open Library first, preprints arXiv first. Providers are reordered, never dropped.
3. **Check every candidate** before accepting it:
   - *Title overlap*: the share of the candidate's title words found in your citation must reach the threshold (default 0.8). A `Title: Subtitle` candidate is also scored on its main title.
   - *Year agreement*: a year in the citation must be within one year of the record. Books are exempt by default because reprints carry later years.
   - *Author agreement*: reported for every record; it rejects only with `--require-author`.
4. **Return the first provider's best passing candidate**, with the near-misses it refused listed in `rejected`. If none passes, the result is `unresolved`.
5. **Classical loci** (Stephanus or Bekker style references) are never sent to a provider. The result is `skipped`, unless you supply a `ClassicalBackstop` that maps loci to your own records. No data ships with the library.

Network behaviour (`src/http.ts`): a generic User-Agent (plus your `mailto` if given), a minimum gap per host, retry with exponential backoff on 429, 5xx and network errors (honouring `Retry-After`), and no retry on other 4xx. Any `pdfUrl` in a record is dropped unless it is https on port 443 with a public host: loopback, private, link-local and local-network names and addresses are refused, including decimal and hex IPv4 spellings. `hostResolvesPublic` adds a DNS check you can run before fetching a document.

## Measured results

`eval/gold.json` holds 47 items: 18 journal articles, 7 arXiv preprints and 16 books, all public classics and well-known papers, each labelled with the expected DOI, arXiv id or ISBN; 3 classical loci; and 3 invented citations that should never resolve. 41 items carry a label. The recorded provider responses are in `eval/fixtures/`, so the run is offline and repeatable.

Recorded from the live services on 2026-11-23 with the default settings (threshold 0.8, no tuning against the gold set):

| Guard | Correct | Wrong | Missed | False accepts (of 3 invented) | Precision | Recall |
|---|---|---|---|---|---|---|
| on | 36 | 2 | 3 | 0 | 94.7% | 87.8% |
| off (first provider's top hit) | 30 | 11 | 0 | 3 | 68.2% | 73.2% |

Precision is correct / (correct + wrong + false accepts). Recall is correct / 41 labelled items. A book counts as correct on an ISBN match or, because one work has many ISBNs, when the title and the first author's family name match. The labels are public record but were written by hand; they are not independently audited.

With the guard on, the two wrong results are books for which Crossref and OpenAlex returned a book review whose title quotes the book's title, and the three misses are one article and two books. Reproduce with `npm run eval`; refresh the recordings with `npm run eval:live` (live services change, so numbers will move).

## How it differs

- [citation.js](https://citation.js.org/) parses and formats citation data between formats (BibTeX, CSL JSON, RIS, DOI input). It does not search for free text or judge whether a match is right.
- [Zotero translators](https://github.com/zotero/translators) extract metadata by scraping a web page or reading an identifier. They need a page or an identifier to start from.
- This tool starts from free text with no identifier, queries the open indexes, and rejects candidates that disagree with the text. It does not format output and does not scrape.

## Limits

- The guard compares words, not meaning. A review, a translation or a later edition whose title repeats the cited title can pass (two such results appear in the measured run above). Check the `record` against what you cited.
- Author checking is off by default, so a same-title record by another author passes unless you use `--require-author`.
- Wrong or missing years in your citation cause rejections of correct records, and a citation with no year gets no year check.
- Coverage is whatever the six sources hold. Pre-DOI scholarship and non-English titles are patchy (the measured run missed one 1905 German-language paper), and book matches depend on Open Library and Google Books catalogue quality.
- Classical locus citations are not resolved without a backstop you provide.
- The SSRF check is syntactic. A public host name that later resolves to a private address is only caught if you run `hostResolvesPublic` immediately before fetching, and even then DNS can change between check and fetch.
- Free provider APIs rate-limit and change. Semantic Scholar often answers 429 without a key; the tool retries and then moves on to the next provider.
- Test fixtures under `test/` are synthetic. The gold-set recordings are real responses from 2026-11-23.
- Not yet on npm.

## Related

- [scholarly-metadata-resolution-pattern](https://github.com/hyderhusainarastu/scholarly-metadata-resolution-pattern): the written pattern this repo implements.
- [hallucinated-citation-checker](https://github.com/hyderhusainarastu/hallucinated-citation-checker): flags citations that may be invented.

## Keywords

citation resolver, free-text citation, DOI lookup, Crossref, OpenAlex, Open Library, Google Books, Semantic Scholar, arXiv, bibliography, citation parser, bibliographic metadata, wrong-match guard, TypeScript, Node.js, CLI

---
Part of palimnote-tools - more at https://github.com/hyderhusainarastu
