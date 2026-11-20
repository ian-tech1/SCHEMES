import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

const BLOCKED = [
  "jailbreak",
  "prompt injection",
  "ignore previous",
  "metasploit",
  "hashcat",
  "hydra",
  "sql injection",
  "credential stuffing",
  "bypass captcha",
  "exploit",
  "payload",
  "reverse shell",
  "privilege escalation",
];

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

export const polishStudioDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return {
      title: clip(raw.title, 120),
      text: clip(raw.text, 8000),
    };
  })
  .handler(async ({ data }) => {
    const lowered = `${data.title}\n${data.text}`.toLowerCase();
    if (BLOCKED.some((word) => lowered.includes(word))) {
      return {
        ok: false as const,
        error: "This desk edits school documents only. It will not write attack, cracking, or jailbreak material.",
      };
    }
    if (data.text.length < 40) return { ok: false as const, error: "Write a little more before asking Grok to edit it." };
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) return { ok: false as const, error: "Grok is not available on this host yet. You can still download the draft." };
    const model = process.env.XAI_MODEL?.trim() || "grok-4.5";
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "You edit Kenyan Competency Based Education teacher documents. Improve clarity, specific learning outcomes, and assessment language. Keep the teacher's facts, school and grade. Do not invent KICD or KNEC endorsement. Do not add hacking, jailbreaks, exploits, scraping, or attacks. Return plain text only.",
          },
          { role: "user", content: `${data.title}\n\n${data.text}` },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) return { ok: false as const, error: `Grok could not edit this draft (${response.status}). The original is still yours to download.` };
    const body = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "Grok returned an empty edit. Download the original draft." };
    return { ok: true as const, text };
  });
