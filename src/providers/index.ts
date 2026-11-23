import type { Provider, ProviderName } from "../types.js";
import { arxiv } from "./arxiv.js";
import { crossref } from "./crossref.js";
import { googlebooks } from "./googlebooks.js";
import { openalex } from "./openalex.js";
import { openlibrary } from "./openlibrary.js";
import { semanticscholar } from "./semanticscholar.js";

export const PROVIDERS: Record<ProviderName, Provider> = {
  crossref,
  openalex,
  openlibrary,
  googlebooks,
  semanticscholar,
  arxiv,
};

export { arxiv, crossref, googlebooks, openalex, openlibrary, semanticscholar };
