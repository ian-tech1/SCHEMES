import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AI_PROVIDERS, MAX_API_KEYS_PER_PROVIDER, type AiKeyRing, type AiProvider } from "./ai-provider-types.ts";

export type { AiProvider } from "@/lib/ai-provider-types";
export type AiProviderCredentials = {
  preferred: AiProvider;
  collaborativeReview?: boolean;
  keys: AiKeyRing;
};
export type AiProviderKeyChanges = {
  keys?: Partial<Record<AiProvider, string[]>>;
  remove?: Partial<Record<AiProvider, number[]>>;
  clear?: AiProvider[];
};

function legacyEncryptionKey(version = "v2"): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be configured before AI credentials can be saved or read.");
  }
  return createHash("sha256").update(`ian-tech-ai-provider-settings:${version === "v1" ? "v1" : "v2"}:${secret}`).digest();
}

function dedicatedEncryptionKey(): Buffer {
  const secret = process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY is not configured for these saved credentials.");
  if (!/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY must be exactly 64 hexadecimal characters; generate it with openssl rand -hex 32.");
  }
  return Buffer.from(secret, "hex");
}

function unreadableCredentialsError(): Error {
  return new Error(
    "Stored AI provider credentials cannot be decrypted. Keep the same BETTER_AUTH_SECRET and AI_CREDENTIALS_ENCRYPTION_KEY in Vercel. Restore the previous secret, or enter replacement keys in Admin and save; old keys cannot be recovered without their original encryption secret.",
  );
}

function keyArray(value: unknown): string[] {
  const input = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of input) {
    if (typeof candidate !== "string") continue;
    const key = candidate.trim().slice(0, 4096);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= MAX_API_KEYS_PER_PROVIDER) break;
  }
  return result;
}

export function normalizeAiCredentials(value: unknown): AiProviderCredentials {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const preferred = AI_PROVIDERS.includes(record.preferred as AiProvider) ? record.preferred as AiProvider : "grok";
  const storedKeys = record.keys && typeof record.keys === "object" ? record.keys as Record<string, unknown> : {};
  const keys: AiKeyRing = {};
  for (const provider of AI_PROVIDERS) {
    // The legacy v1/v2 payload stored one credential at the provider name.
    const normalized = keyArray(storedKeys[provider] ?? record[provider]);
    if (normalized.length) keys[provider] = normalized;
  }
  return { preferred, collaborativeReview: record.collaborativeReview !== false, keys };
}

export function hasReplacementAiKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const keys = value as Record<string, unknown>;
  return AI_PROVIDERS.some((provider) => keyArray(keys[provider]).length > 0);
}

export function canReplaceUnreadableAiCredentials(error: unknown, replacementKeys: unknown): boolean {
  return error instanceof Error
    && /Stored AI provider credentials cannot be decrypted/i.test(error.message)
    && hasReplacementAiKeys(replacementKeys);
}

export function updateAiProviderKeyRings(credentials: AiProviderCredentials, changes: AiProviderKeyChanges): AiProviderCredentials {
  const keys: AiKeyRing = { ...credentials.keys };
  for (const provider of AI_PROVIDERS) {
    if (changes.clear?.includes(provider)) {
      delete keys[provider];
      continue;
    }
    const removed = new Set((changes.remove?.[provider] ?? []).filter((index) => Number.isInteger(index) && index >= 0 && index < MAX_API_KEYS_PER_PROVIDER));
    const retained = (keys[provider] ?? []).filter((_, index) => !removed.has(index));
    const added = keyArray(changes.keys?.[provider] ?? []);
    const merged = keyArray([...retained, ...added]);
    if (merged.length) keys[provider] = merged;
    else delete keys[provider];
  }
  return { ...credentials, keys };
}

export function encryptAiCredentials(value: AiProviderCredentials | Record<string, unknown>): string {
  const useDedicatedKey = Boolean(process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim());
  const key = useDedicatedKey ? dedicatedEncryptionKey() : legacyEncryptionKey("v2");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(normalizeAiCredentials(value)), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")];
  return useDedicatedKey ? ["v3", "ai", ...envelope].join(".") : ["v2", ...envelope].join(".");
}

export function decryptAiCredentials(value: unknown): AiProviderCredentials {
  if (typeof value !== "string" || !value.trim()) return normalizeAiCredentials({ preferred: "grok" });
  const parts = value.split(".");
  try {
    let key: Buffer;
    let ivText: string | undefined;
    let tagText: string | undefined;
    let dataText: string | undefined;
    if (parts[0] === "v3" && parts[1] === "ai" && parts.length === 5) {
      key = dedicatedEncryptionKey();
      [, , ivText, tagText, dataText] = parts;
    } else if ((parts[0] === "v2" || parts[0] === "v1") && parts.length === 4) {
      key = legacyEncryptionKey(parts[0]);
      [, ivText, tagText, dataText] = parts;
    } else {
      throw unreadableCredentialsError();
    }
    if (!ivText || !tagText || !dataText) throw unreadableCredentialsError();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const cleartext = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
    return normalizeAiCredentials(JSON.parse(cleartext));
  } catch {
    throw unreadableCredentialsError();
  }
}

export function aiProviderStatus(credentials: AiProviderCredentials) {
  const keyCounts = Object.fromEntries(AI_PROVIDERS.map((provider) => [provider, credentials.keys[provider]?.length ?? 0])) as Record<AiProvider, number>;
  return {
    preferred: credentials.preferred,
    collaborativeReview: credentials.collaborativeReview !== false,
    configured: Object.fromEntries(AI_PROVIDERS.map((provider) => [provider, keyCounts[provider] > 0])) as Record<AiProvider, boolean>,
    keyCounts,
  };
}
