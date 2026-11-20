import type { Sql } from "@/lib/db";
import { decryptAiCredentials, encryptAiCredentials } from "@/lib/ai-secrets.server";
import { probeAiProviderKey } from "@/lib/ai.server";

type Raw = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** The teacher's own xAI key, if they chose to save one. Never returned to the browser. */
export async function loadTeacherWriterKey(sql: Sql, userId: string): Promise<string | null> {
  try {
    const rows = await sql<Raw>`select ciphertext from teacher_writer_keys where user_id = ${userId} limit 1`;
    const stored = rows[0]?.ciphertext;
    if (typeof stored !== "string" || !stored) return null;
    const key = decryptAiCredentials(stored).keys.grok?.[0]?.trim() ?? "";
    return key || null;
  } catch {
    return null;
  }
}

export async function writerDesk(sql: Sql, userId: string): Promise<{
  active: boolean;
  hint: string;
  usedToday: number;
  limit: number | null;
}> {
  const keyRows = await sql<Raw>`select hint from teacher_writer_keys where user_id = ${userId} limit 1`;
  const profile = await sql<Raw>`select role from profiles where user_id = ${userId} limit 1`;
  const settings = await sql<Raw>`select daily_gen_limit from settings where id = 1 limit 1`;
  const counts = await sql<Raw>`
    select count(*) as n from documents
    where user_id = ${userId}
      and (created_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
  `;
  const role = String(profile[0]?.role ?? "");
  const unlimited = role === "admin" || role === "deputy";
  return {
    active: Boolean(keyRows[0]),
    hint: String(keyRows[0]?.hint ?? ""),
    usedToday: num(counts[0]?.n),
    limit: unlimited ? null : num(settings[0]?.daily_gen_limit, 8),
  };
}

export async function saveTeacherWriterKey(
  sql: Sql,
  userId: string,
  apiKey: string,
): Promise<{ ok: true; hint: string } | { ok: false; error: string }> {
  const key = apiKey.trim();
  if (!/^xai-[A-Za-z0-9_-]{16,180}$/.test(key)) {
    return { ok: false, error: "Paste the key from your own xAI account. It should start with xai-." };
  }
  try {
    await probeAiProviderKey("grok", key);
  } catch {
    return { ok: false, error: "That key did not answer. Open your xAI account, copy a fresh key, and try again. Nothing was saved." };
  }
  const hint = `····${key.slice(-4)}`;
  let ciphertext: string;
  try {
    ciphertext = encryptAiCredentials({ preferred: "grok", collaborativeReview: false, keys: { grok: [key] } });
  } catch {
    return { ok: false, error: "Personal keys cannot be stored until the site owner finishes server setup. Use the shared school allowance for now." };
  }
  await sql`
    insert into teacher_writer_keys (user_id, ciphertext, hint, updated_at)
    values (${userId}, ${ciphertext}, ${hint}, now())
    on conflict (user_id) do update
      set ciphertext = excluded.ciphertext, hint = excluded.hint, updated_at = now()
  `;
  return { ok: true, hint };
}

export async function clearTeacherWriterKey(sql: Sql, userId: string): Promise<{ ok: true }> {
  await sql`delete from teacher_writer_keys where user_id = ${userId}`;
  return { ok: true };
}
