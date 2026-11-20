import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { probeAiProviderKey, writeCbe, type Brief } from "./ai.server.ts";

const originalFetch = globalThis.fetch;
process.env.DISABLE_PUBLIC_RESEARCH = "true";
const brief: Brief = {
  kind: "notes",
  levelLabel: "Primary",
  grade: "Grade 4",
  subject: "English",
  strand: "Reading",
  substrand: "Comprehension",
  substrands: [],
  term: "Term 2",
  year: 2026,
  weekFrom: 1,
  weekTo: 1,
  lessonsPerWeek: 1,
  pathway: "",
  startFrom: "",
  endAt: "",
  stream: "",
  schoolName: "Example School",
  depth: "summary",
  textbooks: "",
  assessmentMethods: [],
  lessonMinutes: 40,
};

function completeSummary(label: string) {
  return {
    summary: `${label}: learners read a short passage and explain its main idea.`,
    vocabulary: [
      { term: "passage", meaning: "a short piece of writing" },
      { term: "main idea", meaning: "the most important point" },
      { term: "detail", meaning: "a fact that supports an idea" },
      { term: "infer", meaning: "work out a meaning from clues" },
    ],
    sections: [
      { heading: "Finding a main idea", paragraphs: ["Read the whole passage once to understand its subject.", "Read again and ask which idea is repeated or explained by most sentences."], examples: ["If three sentences describe a seed growing, plant growth is probably the main idea."] },
      { heading: "Using details", paragraphs: ["A detail gives evidence for a main idea.", "Point to the sentence that supports your answer and explain how it connects."], examples: ["A sentence about roots taking in water supports the idea that plants need water."] },
    ],
    tryThis: ["Name the main idea in a short paragraph.", "Underline one supporting detail.", "Explain an inference using one clue."],
    answerKey: ["The answer should name the paragraph's central point.", "Any accurate sentence supporting that point.", "Accept a reasonable inference linked to a clue."],
    remember: ["Read for the whole message.", "Use details as evidence.", "Explain your inference."],
  };
}

function response(label: string) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(completeSummary(label)) } }] });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.DISABLE_PUBLIC_RESEARCH = "true";
  delete process.env.XAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
});

test("only the host Grok key writes, even when other provider keys are saved", async () => {
  process.env.XAI_API_KEY = "host-grok-key";
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push(String(input));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer host-grok-key");
    return response("Grok wrote the chapter");
  };

  const result = await writeCbe(brief, {
    preferred: "manus",
    keys: { manus: ["project-manus-key"], gemini: ["gemini-test-key"], grok: ["pasted-grok-key"] },
    collaborativeReview: true,
  }) as { summary: string; generationProvenance: { label: string } };

  assert.match(result.summary, /^Grok wrote the chapter/);
  assert.match(result.generationProvenance.label, /Written by Grok/);
  assert.deepEqual(seen, ["https://api.x.ai/v1/chat/completions"]);
});

test("host Grok is retried once after a temporary failure", async () => {
  process.env.XAI_API_KEY = "host-grok-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return response("Grok retry worked");
  };

  const result = await writeCbe(brief, { preferred: "claude", keys: { claude: ["unused"] }, collaborativeReview: false }) as { summary: string };
  assert.match(result.summary, /^Grok retry worked/);
  assert.equal(calls, 2);
});

test("a saved key writes when the site Grok key is missing", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push(new Headers(init?.headers).get("authorization") ?? String(input));
    return response("Backup writer finished the chapter");
  };
  const result = await writeCbe(brief, { preferred: "groq", keys: { groq: ["backup-groq-key"] }, collaborativeReview: false }) as { summary: string; generationProvenance: { label: string } };
  assert.match(result.summary, /^Backup writer finished the chapter/);
  assert.match(result.generationProvenance.label, /GroqCloud/);
  assert.deepEqual(seen, ["Bearer backup-groq-key"]);
});

test("a failed site Grok key falls through to the next saved key", async () => {
  process.env.XAI_API_KEY = "host-grok-key";
  const seen: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization");
    seen.push(auth ?? "");
    if (auth === "Bearer host-grok-key") return new Response("unauthorized", { status: 401 });
    return response("Backup writer finished the chapter");
  };
  const result = await writeCbe(brief, { preferred: "groq", keys: { groq: ["backup-groq-key"] }, collaborativeReview: false }) as { summary: string };
  assert.match(result.summary, /^Backup writer finished the chapter/);
  assert.deepEqual(seen, ["Bearer host-grok-key", "Bearer backup-groq-key"]);
});

test("API-key probe sends one minimal JSON request and returns latency, not the key", async () => {
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /generativelanguage\.googleapis\.com/);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "probe-gemini-key-123");
    const body = JSON.parse(String(init?.body));
    assert.match(body.contents[0].parts[0].text, /ok.:true/i);
    assert.ok(body.contents[0].parts[0].text.length < 250, "the probe should stay much smaller than a curriculum-writing request");
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  const result = await probeAiProviderKey("gemini", "probe-gemini-key-123");
  assert.equal(typeof result.latencyMs, "number");
  assert.equal("key" in result, false);
});

test("API-key probe reports rejected credentials without including key material", async () => {
  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  await assert.rejects(probeAiProviderKey("gemini", "do-not-echo-this-key"), (error: unknown) => {
    assert.match(error instanceof Error ? error.message : "", /401/);
    assert.doesNotMatch(error instanceof Error ? error.message : "", /do-not-echo-this-key/);
    return true;
  });
});
