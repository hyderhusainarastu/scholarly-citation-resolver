import { lookup as dnsLookup } from "node:dns/promises";

export const DEFAULT_USER_AGENT =
  "cite-resolve/0.1 (+https://github.com/hyderhusainarastu/scholarly-citation-resolver)";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpOptions {
  fetch?: typeof fetch;
  /** Contact address. Sent in the User-Agent and used by providers that have a polite pool. */
  mailto?: string;
  userAgent?: string;
  /** Retries after the first attempt, for 429, 5xx and network errors. Default 3. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Minimum gap between two requests to the same host. Default 300 ms. */
  minIntervalMs?: number;
  /** Per-host override of minIntervalMs. */
  hostIntervalMs?: Record<string, number>;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface HttpClient {
  getText(url: string, init?: { signal?: AbortSignal }): Promise<string>;
  readonly mailto: string | undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isNaN(when) ? null : Math.max(0, when - Date.now());
}

/** A small fetch wrapper: identifying User-Agent, per-host spacing, retry with backoff. */
export function createHttp(opts: HttpOptions = {}): HttpClient {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const maxRetries = opts.maxRetries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const cap = opts.maxDelayMs ?? 8000;
  const gap = opts.minIntervalMs ?? 300;
  const ua = opts.mailto
    ? `${opts.userAgent ?? DEFAULT_USER_AGENT} mailto:${opts.mailto}`
    : (opts.userAgent ?? DEFAULT_USER_AGENT);
  const nextSlot = new Map<string, number>();

  async function waitForHost(host: string): Promise<void> {
    const interval = opts.hostIntervalMs?.[host] ?? gap;
    const t = now();
    const slot = Math.max(t, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + interval);
    if (slot > t) await sleep(slot - t);
  }

  return {
    mailto: opts.mailto,
    async getText(url, init) {
      const host = new URL(url).host;
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await waitForHost(host);
        let wait = Math.min(cap, base * 2 ** attempt);
        try {
          const signal = init?.signal ?? (opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined);
          const res = await doFetch(url, { headers: { "User-Agent": ua, Accept: "*/*" }, signal });
          if (res.ok) return await res.text();
          if (res.status !== 429 && res.status < 500) {
            throw new HttpError(`HTTP ${res.status} from ${host}`, res.status);
          }
          lastError = new HttpError(`HTTP ${res.status} from ${host}`, res.status);
          wait = Math.min(cap, retryAfterMs(res) ?? wait);
        } catch (err) {
          if (err instanceof HttpError && err.status !== null && err.status !== 429 && err.status < 500) throw err;
          if (init?.signal?.aborted) throw err;
          lastError = err;
        }
        if (attempt < maxRetries) await sleep(wait);
      }
      throw lastError instanceof Error ? lastError : new HttpError(String(lastError), null);
    },
  };
}

/* ---------------------------------------------------------------- SSRF guard */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

function ipv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Private(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "::" ||
    h === "::1" ||
    h.startsWith("::ffff:") ||
    h.startsWith("64:ff9b:") ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^fe[89ab][0-9a-f]:/.test(h) ||
    h.startsWith("2001:db8:")
  );
}

/**
 * Syntactic check that a URL is safe to fetch as a public document: https
 * only, port 443, no credentials, and a host that is not loopback, private,
 * link-local, a bare label or a local-network suffix. The URL parser
 * normalizes decimal, octal and hex IPv4 spellings before the check.
 * It does not resolve DNS; see {@link hostResolvesPublic}.
 */
export function checkPublicHttpsUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https is allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL" };
  if (url.port && url.port !== "443") return { ok: false, reason: "non-default port" };
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, reason: "empty host" };
  if (host.includes(":")) {
    if (ipv6Private(host)) return { ok: false, reason: "private or loopback IPv6 address" };
    return { ok: true, url };
  }
  if (ipv4Private(host)) return { ok: false, reason: "private or loopback IPv4 address" };
  if (/^[\d.]+$/.test(host) && !/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return { ok: false, reason: "numeric host that is not a public IPv4 address" };
  if (!host.includes(".")) return { ok: false, reason: "single-label host" };
  if (/\.(localhost|local|internal|lan|home|corp|intranet|home\.arpa)$/.test(host) || host === "localhost") {
    return { ok: false, reason: "local-network host name" };
  }
  return { ok: true, url };
}

export function isSafePublicUrl(raw: string): boolean {
  return checkPublicHttpsUrl(raw).ok;
}

type Lookup = (host: string) => Promise<{ address: string }[]>;

/**
 * Resolve the host and confirm every address is public. Call this right
 * before fetching a document URL to narrow the DNS-rebinding gap; it cannot
 * close it entirely, because the address can change between check and fetch.
 */
export async function hostResolvesPublic(
  raw: string,
  lookup: Lookup = (h) => dnsLookup(h, { all: true }),
): Promise<boolean> {
  const check = checkPublicHttpsUrl(raw);
  if (!check.ok) return false;
  try {
    const addrs = await lookup(check.url.hostname.replace(/^\[|\]$/g, ""));
    return addrs.length > 0 && addrs.every((a) => (a.address.includes(":") ? !ipv6Private(a.address) : !ipv4Private(a.address)));
  } catch {
    return false;
  }
}
