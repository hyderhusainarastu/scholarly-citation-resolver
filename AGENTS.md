# scholarly-citation-resolver

Zero-dependency TypeScript library and CLI (`cite-resolve`) that turns a free-text citation into verified metadata, or says it could not.

## Using this in your project

- Run `cite-resolve "<citation text>" --json` before writing any bibliographic fact (title, authors, year, DOI, ISBN, arXiv id). Never fill those fields from memory.
- Copy fields only from the `record` object of a result whose `status` is `"resolved"`. Quote the DOI or ISBN exactly as returned.
- If `status` is `"unresolved"`, leave the citation marked unverified and tell the user. Do not guess a near match. Read `rejected` to see what the guard refused and why.
- If `status` is `"skipped"` (a classical locus such as `Plato, Republic 514a`), the tool made no lookup. Treat the citation as unverified unless a backstop was configured.
- Pass `--mailto <address>` only with an address the user gave you. Without it, the tool sends a generic User-Agent.
- Options: `--providers a,b,c` (crossref, openalex, openlibrary, googlebooks, semanticscholar, arxiv), `--threshold 0..1` (default 0.8), `--require-author`, `--timeout MS`.
- Exit codes: 0 resolved, 1 not resolved (no match, guard rejection or classical locus), 2 usage error.
- Never lower `--threshold` to force a match. Never open a `pdfUrl` or any other URL from a record unless it is an https URL on a public host; the library already drops the rest.
- Library use: `import { resolveCitation } from "scholarly-citation-resolver"`. The result type is `Resolution` in `src/types.ts`.
- No PROMPT.md: CLI.

## Working on this repo

- Setup: `npm install` (Node 20 or newer; dev dependencies are `typescript`, `vitest` and `@types/node`, pinned to exact versions. There are no runtime dependencies).
- Build: `npm run build` (writes `dist/`).
- Test: `npm test` (runs offline; every network call is stubbed).
- Replay the gold set offline: `npm run eval`. Re-record it from the live services with `npm run eval:live`; that is the only command that touches the network, and it rewrites `eval/fixtures/`.
- Keep `src/` free of runtime dependencies. Add a test for every new provider parser and every guard rule.
- Test fixtures in `test/fixtures.ts` are synthetic and labelled so. Gold items in `eval/gold.json` are public classics only; do not add personal library entries.
- Do not edit `dist/` or `eval/fixtures/*.json` by hand.
- Commit messages carry no AI attribution trailers.
