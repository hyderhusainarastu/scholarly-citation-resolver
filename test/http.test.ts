import { describe, expect, it } from "vitest";
import { HttpError, checkPublicHttpsUrl, createHttp, hostResolvesPublic, isSafePublicUrl } from "../src/http.js";

function seq(...responses: (Response | Error)[]) {
  const calls: { url: string; headers: any }[] = [];
  const fn = (async (url: any, init: any) => {
    calls.push({ url: String(url), headers: init?.headers });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const noWait = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
};

describe("retry and backoff", () => {
  it("retries 503 with exponential delays, then succeeds", async () => {
    const { fn, calls } = seq(new Response("", { status: 503 }), new Response("", { status: 503 }), new Response("ok"));
    const w = noWait();
    const http = createHttp({ fetch: fn, sleep: w.sleep, minIntervalMs: 0, baseDelayMs: 100 });
    expect(await http.getText("https://api.example.org/x")).toBe("ok");
    expect(calls).toHaveLength(3);
    expect(w.waits).toEqual([100, 200]);
  });
  it("honours Retry-After on 429", async () => {
    const { fn } = seq(new Response("", { status: 429, headers: { "retry-after": "2" } }), new Response("ok"));
    const w = noWait();
    const http = createHttp({ fetch: fn, sleep: w.sleep, minIntervalMs: 0 });
    await http.getText("https://api.example.org/x");
    expect(w.waits).toEqual([2000]);
  });
  it("retries network errors", async () => {
    const { fn, calls } = seq(new TypeError("fetch failed"), new Response("ok"));
    const http = createHttp({ fetch: fn, sleep: async () => {}, minIntervalMs: 0 });
    expect(await http.getText("https://api.example.org/x")).toBe("ok");
    expect(calls).toHaveLength(2);
  });
  it("does not retry a 404", async () => {
    const { fn, calls } = seq(new Response("", { status: 404 }));
    const http = createHttp({ fetch: fn, sleep: async () => {}, minIntervalMs: 0 });
    await expect(http.getText("https://api.example.org/x")).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });
  it("gives up after maxRetries and throws the last error", async () => {
    const { fn, calls } = seq(new Response("", { status: 500 }));
    const http = createHttp({ fetch: fn, sleep: async () => {}, minIntervalMs: 0, maxRetries: 2 });
    await expect(http.getText("https://api.example.org/x")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(3);
  });
  it("caps the backoff delay", async () => {
    const { fn } = seq(new Response("", { status: 500 }));
    const w = noWait();
    const http = createHttp({ fetch: fn, sleep: w.sleep, minIntervalMs: 0, maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 1500 });
    await http.getText("https://api.example.org/x").catch(() => {});
    expect(w.waits).toEqual([1000, 1500, 1500]);
  });
});

describe("headers and rate limit", () => {
  it("sends a generic User-Agent, adding the mailto when given", async () => {
    const a = seq(new Response("ok"));
    await createHttp({ fetch: a.fn, minIntervalMs: 0 }).getText("https://api.example.org/x");
    expect(a.calls[0].headers["User-Agent"]).toMatch(/^cite-resolve\//);
    const b = seq(new Response("ok"));
    await createHttp({ fetch: b.fn, minIntervalMs: 0, mailto: "me@example.org" }).getText("https://api.example.org/x");
    expect(b.calls[0].headers["User-Agent"]).toContain("mailto:me@example.org");
  });
  it("spaces requests to one host and leaves other hosts alone", async () => {
    let t = 1000;
    const w = noWait();
    const { fn } = seq(new Response("ok"));
    const http = createHttp({ fetch: fn, sleep: w.sleep, now: () => t, minIntervalMs: 500 });
    await http.getText("https://a.example.org/1");
    await http.getText("https://a.example.org/2");
    await http.getText("https://b.example.org/1");
    expect(w.waits).toEqual([500]);
    t += 5000;
    await http.getText("https://a.example.org/3");
    expect(w.waits).toEqual([500]);
  });
});

describe("public https URL guard", () => {
  const bad = [
    "http://repo.example.org/a.pdf",
    "ftp://repo.example.org/a.pdf",
    "file:///etc/passwd",
    "https://localhost/a.pdf",
    "https://printer.local/a.pdf",
    "https://db.internal/a.pdf",
    "https://intranet/a.pdf",
    "https://127.0.0.1/a.pdf",
    "https://127.1/a.pdf",
    "https://2130706433/a.pdf",
    "https://0x7f000001/a.pdf",
    "https://10.1.2.3/a.pdf",
    "https://172.16.0.1/a.pdf",
    "https://172.31.255.255/a.pdf",
    "https://192.168.1.1/a.pdf",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/a.pdf",
    "https://0.0.0.0/a.pdf",
    "https://[::1]/a.pdf",
    "https://[fd00::1]/a.pdf",
    "https://[fe80::1]/a.pdf",
    "https://[::ffff:127.0.0.1]/a.pdf",
    "https://user:pw@repo.example.org/a.pdf",
    "https://repo.example.org:8443/a.pdf",
    "not a url",
  ];
  for (const u of bad) it(`refuses ${u}`, () => expect(isSafePublicUrl(u)).toBe(false));
  const good = ["https://repo.example.org/a.pdf", "https://arxiv.org/pdf/1901.00001", "https://8.8.8.8/a.pdf", "https://172.32.0.1/a.pdf"];
  for (const u of good) it(`allows ${u}`, () => expect(checkPublicHttpsUrl(u).ok).toBe(true));
  it("reports a reason", () => {
    expect(checkPublicHttpsUrl("http://repo.example.org/")).toEqual({ ok: false, reason: "only https is allowed" });
  });
  it("checks resolved addresses when asked", async () => {
    const pub = async () => [{ address: "93.184.216.34" }];
    const priv = async () => [{ address: "93.184.216.34" }, { address: "10.0.0.5" }];
    const boom = async () => { throw new Error("ENOTFOUND"); };
    expect(await hostResolvesPublic("https://repo.example.org/a.pdf", pub)).toBe(true);
    expect(await hostResolvesPublic("https://repo.example.org/a.pdf", priv)).toBe(false);
    expect(await hostResolvesPublic("https://repo.example.org/a.pdf", boom)).toBe(false);
    expect(await hostResolvesPublic("http://repo.example.org/a.pdf", pub)).toBe(false);
  });
});
