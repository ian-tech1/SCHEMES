import type { Brief } from "./ai.server.ts";
import { designFor } from "./kicd.ts";

export type ResearchSource = {
  title: string;
  url: string;
  license: string;
  retrievedAt: string;
  retrieval: "live" | "catalogued-link";
  excerpt?: string;
};

const IDENTIFIED_AGENT = "IANTechSchemesResearch/1.1 (https://ian-tech-schemes.vercel.app/)";
const KICD_HOSTS = new Set(["kicd.ac.ke", "www.kicd.ac.ke"]);
const WIKIPEDIA_HOST = "en.wikipedia.org";
const GRADE_PAGES: Record<string, string> = {
  "Grade 7": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-seven-designs/",
  "Grade 8": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/",
  "Grade 9": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-nine-designs/",
};
const KICD_INDEX = "https://kicd.ac.ke/cbc-materials/curriculum-designs/";
const KEC_PORTAL = "https://lms.kec.ac.ke/";
const HOST_REQUEST_GAP_MS = 350;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const hostQueues = new Map<string, Promise<void>>();
const hostNextAllowedAt = new Map<string, number>();
const hostRetryAfterUntil = new Map<string, number>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const found = cache.get(key);
  if (found && found.expiresAt > Date.now()) return Promise.resolve(found.value as T);
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const run = load().then((value) => {
    if (cache.size > 256) cache.delete(cache.keys().next().value as string);
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

function cleanQueryPart(value: string): string {
  const cleaned = Array.from(value.normalize("NFKC"), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || "<>\"'`{}[]\\".includes(character) ? " " : character;
  }).join("");
  return cleaned.replace(/\s+/g, " ").trim();
}

export function researchQuery(brief: Brief): string {
  const topics = (brief.selectedTopics ?? []).flatMap((row) => [row.topic, ...row.subtopics.map((child) => child.title)]);
  return [...new Set([brief.subject, brief.strand, brief.substrand, ...topics].map(cleanQueryPart).filter(Boolean))]
    .join(" ").slice(0, 200);
}

function articleTitleCandidates(brief: Brief): string[] {
  const selected = (brief.selectedTopics ?? []).flatMap((row) => [...row.subtopics.map((child) => child.title), row.topic]);
  return [...new Set([...selected, brief.substrand, ...brief.substrands, brief.strand, brief.subject]
    .map(cleanQueryPart).filter((value) => value.length >= 3 && value.length <= 100))].slice(0, 2);
}

export function robotsAllows(robotsText: string, pathname: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null;
  let hasRules = false;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      hasRules = true;
      if (value) current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const wildcardRules = groups.filter((group) => group.agents.includes("*")).flatMap((group) => group.rules);
  const matching = wildcardRules.filter((rule) => pathname.startsWith(rule.path));
  if (!matching.length) return true;
  matching.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching[0]!.allow;
}

function retryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  const requested = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Date.parse(header) - Date.now();
  if (!Number.isFinite(requested)) return DEFAULT_RETRY_AFTER_MS;
  return Math.max(1_000, Math.min(MAX_RETRY_AFTER_MS, requested));
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function onHostQueue<T>(host: string, task: () => Promise<T>): Promise<T | null> {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  hostQueues.set(host, current);
  await previous.catch(() => undefined);
  try {
    if ((hostRetryAfterUntil.get(host) ?? 0) > Date.now()) return null;
    const delay = Math.max(0, (hostNextAllowedAt.get(host) ?? 0) - Date.now());
    if (delay) await pause(delay);
    if ((hostRetryAfterUntil.get(host) ?? 0) > Date.now()) return null;
    return await task();
  } finally {
    hostNextAllowedAt.set(host, Date.now() + HOST_REQUEST_GAP_MS);
    release();
    if (hostQueues.get(host) === current) hostQueues.delete(host);
  }
}

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = limit - size;
      if (remaining <= 0) { await reader.cancel(); break; }
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
      if (value.byteLength > remaining) { await reader.cancel(); break; }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

type SafeFetchResult = { response: Response; text: string };
type FetchAttemptResult = SafeFetchResult | { redirect: string } | null;

async function safeFetch(url: string, accept: string, maxBytes: number, timeoutMs = 4_500, allowRobotsCheckedRedirects = false): Promise<SafeFetchResult | null> {
  try {
    let currentUrl = new URL(url);
    if (currentUrl.protocol !== "https:" || currentUrl.username || currentUrl.password) return null;
    for (let redirectCount = 0; redirectCount <= 2; redirectCount++) {
      const queued = await onHostQueue(currentUrl.hostname, async (): Promise<FetchAttemptResult> => {
        const response = await fetch(currentUrl.href, {
          method: "GET",
          headers: { Accept: accept, "User-Agent": IDENTIFIED_AGENT, "Api-User-Agent": IDENTIFIED_AGENT },
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 429 || response.status === 503) {
          hostRetryAfterUntil.set(currentUrl.hostname, Date.now() + retryAfterMs(response.headers.get("retry-after")));
          await response.body?.cancel().catch(() => undefined);
          return null;
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          await response.body?.cancel().catch(() => undefined);
          return location ? { redirect: location } : null;
        }
        if (!response.ok) return null;
        const finalUrl = new URL(response.url || currentUrl.href);
        if (finalUrl.protocol !== "https:" || finalUrl.host !== currentUrl.host) return null;
        if (allowRobotsCheckedRedirects && finalUrl.pathname !== currentUrl.pathname && !await siteRobotsAllow(finalUrl.href)) return null;
        const type = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!type.includes("text/html") && !type.includes("application/json") && !type.includes("text/plain")) return null;
        const declaredLength = Number(response.headers.get("content-length") ?? 0);
        if (declaredLength > maxBytes) { await response.body?.cancel(); return null; }
        return { response, text: await readBounded(response, maxBytes) };
      });
      if (!queued) return null;
      if ("redirect" in queued) {
        if (!allowRobotsCheckedRedirects || redirectCount === 2) return null;
        const nextUrl = new URL(queued.redirect, currentUrl.href);
        if (nextUrl.protocol !== "https:" || nextUrl.host !== currentUrl.host || !await siteRobotsAllow(nextUrl.href)) return null;
        currentUrl = nextUrl;
        continue;
      }
      return queued;
    }
    return null;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Math.min(0x10ffff, Number.parseInt(code, 16))));
}

function textFromHtml(value: string): string {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>/gi, " "))
    .replace(/\s+/g, " ").trim();
}

const PROMPT_INJECTION = /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|rules?)\b|\b(?:reveal|print|expose|dump)\s+(?:the\s+)?(?:(?:system|developer|hidden)\s+)?(?:prompt|instructions?|messages?|api\s+keys?|secrets?)\b|\b(?:send|exfiltrate|leak)\s+(?:the\s+)?(?:api\s+key|secret|credentials?)\b|^\s*(?:system|developer)\s*:/im;

function containsPromptInjection(value: string): boolean {
  return PROMPT_INJECTION.test(value);
}

function safeKicdUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || ![...KICD_HOSTS].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    if (/\/wp-admin(?:\/|$)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function extractKicdLinks(html: string, pageUrl: string, subject: string): ResearchSource[] {
  const cleanHtml = html.replace(/<!--([\s\S]*?)-->/g, "").replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ");
  const normalSubject = cleanQueryPart(subject).toLowerCase();
  const found: ResearchSource[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of cleanHtml.matchAll(pattern)) {
    const href = safeKicdUrl(match[2] ?? "", pageUrl);
    const label = textFromHtml(match[3] ?? "").slice(0, 180);
    if (!href || !label || containsPromptInjection(label) || seen.has(href)) continue;
    if (!/\.pdf(?:$|\?)/i.test(href) && !label.toLowerCase().includes(normalSubject)) continue;
    seen.add(href);
    found.push({ title: label, url: href, license: "Official KICD source link; file remains hosted by KICD and is not copied into this resource.", retrievedAt: new Date().toISOString(), retrieval: "live" });
    if (found.length >= 4) break;
  }
  return found;
}

async function siteRobotsText(host: string): Promise<string | null> {
  return cached(`robots:${host}`, 24 * 60 * 60_000, async () => {
    const result = await safeFetch(`https://${host}/robots.txt`, "text/plain", 32_000, 3_000);
    return result?.text ?? null;
  });
}

async function siteRobotsAllow(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const text = await siteRobotsText(parsed.hostname);
  if (!text) return false;
  return robotsAllows(text, parsed.pathname);
}

async function kicdSources(brief: Brief): Promise<ResearchSource[]> {
  const design = designFor(brief.subject, brief.grade);
  const staticLinks = (design?.sources ?? []).flatMap((source) => {
    const safe = safeKicdUrl(source, KICD_INDEX);
    return safe ? [{ title: `KICD curriculum design for ${brief.grade} ${brief.subject}`, url: safe, license: "Official KICD source link; verify the source document's own terms. Not rehosted.", retrievedAt: new Date().toISOString(), retrieval: "catalogued-link" as const }] : [];
  });
  const page = GRADE_PAGES[brief.grade] ?? KICD_INDEX;
  if (!await siteRobotsAllow(page)) return staticLinks.slice(0, 3);
  const result = await cached(`kicd:${page}`, 12 * 60 * 60_000, async () => safeFetch(page, "text/html", 300_000));
  const html = (result as { text?: string } | null)?.text;
  const parsed = html ? extractKicdLinks(html, page, brief.subject) : [];
  const refs = [
    ...(html ? [{ title: `KICD curriculum designs · ${brief.grade} source page`, url: page, license: "Official source page; follow KICD's current use terms. The site links to, but does not copy, curriculum files.", retrievedAt: new Date().toISOString(), retrieval: "live" as const }] : []),
    ...parsed,
    ...staticLinks,
  ];
  return [...new Map(refs.map((source) => [source.url, source])).values()].slice(0, 5);
}

function kenyaEducationCloudSource(): ResearchSource {
  return {
    title: "Kenya Education Cloud · public digital-learning and OER portal",
    url: KEC_PORTAL,
    license: "Portal catalogue link only; individual resources may have separate licences, permissions, login rules, or terms. No course content is fetched or copied.",
    retrievedAt: new Date().toISOString(),
    retrieval: "catalogued-link",
  };
}

function wikipediaArticleUrl(title: string): string {
  const slug = encodeURIComponent(title.replace(/\s+/g, "_").trim());
  return `https://${WIKIPEDIA_HOST}/wiki/${slug}`;
}

export function extractWikipediaArticle(html: string, pageUrl: string): ResearchSource | null {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:" || url.hostname !== WIKIPEDIA_HOST || !url.pathname.startsWith("/wiki/")) return null;
    const cleanHtml = html.replace(/<!--([\s\S]*?)-->/g, "").replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ");
    const headingMatch = cleanHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const title = textFromHtml(headingMatch?.[1] ?? "").replace(/\s*[-–|]\s*Wikipedia\s*$/i, "").slice(0, 180);
    const main = cleanHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? cleanHtml;
    const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => textFromHtml(match[1] ?? ""))
      .filter((paragraph) => paragraph.length > 40)
      .slice(0, 4);
    const excerpt = paragraphs.join(" ").slice(0, 900);
    if (!title || excerpt.length < 80 || containsPromptInjection(title) || containsPromptInjection(excerpt)) return null;
    return {
      title,
      url: url.href,
      license: "Wikipedia article text is generally CC BY-SA 4.0; attribute Wikipedia contributors, link this page and the licence, and check the page footer for additional notices.",
      retrievedAt: new Date().toISOString(),
      retrieval: "live",
      excerpt,
    };
  } catch { return null; }
}

async function wikipediaSources(brief: Brief): Promise<ResearchSource[]> {
  const result: ResearchSource[] = [];
  for (const topic of articleTitleCandidates(brief)) {
    const url = wikipediaArticleUrl(topic);
    if (!await siteRobotsAllow(url)) break;
    const source = await cached(`wikipedia:${topic.toLowerCase()}`, 12 * 60 * 60_000, async () => {
      const response = await safeFetch(url, "text/html", 300_000, 4_500, true);
      if (!response) return null;
      return extractWikipediaArticle(response.text, response.response.url || url);
    });
    if (source) result.push(source as ResearchSource);
  }
  return result;
}

/**
 * Retrieve a small allowlist of public sources. Reads only robots-allowed pages,
 * uses one identified and paced request stream per host, caches results, and
 * stops after rate limits. This is not an unrestricted crawler and never uses
 * proxies, browser impersonation, CAPTCHA workarounds, robots bypasses, or login.
 * Search inputs include curriculum topics only, never school or learner data.
 */
export async function collectPublicResearch(brief: Brief): Promise<ResearchSource[]> {
  try {
    const sources = [
      ...await kicdSources(brief),
      kenyaEducationCloudSource(),
      ...await wikipediaSources(brief),
    ];
    return [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 8);
  } catch {
    return [];
  }
}

export function clearResearchCacheForTests(): void {
  cache.clear();
  inFlight.clear();
  hostQueues.clear();
  hostNextAllowedAt.clear();
  hostRetryAfterUntil.clear();
}

export { IDENTIFIED_AGENT as RESEARCH_USER_AGENT };
