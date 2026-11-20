import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { AI_PROVIDERS, MAX_API_KEYS_PER_PROVIDER } from "./ai-provider-types.ts";
import {
  aiProviderStatus,
  canReplaceUnreadableAiCredentials,
  decryptAiCredentials,
  encryptAiCredentials,
  hasReplacementAiKeys,
  normalizeAiCredentials,
  updateAiProviderKeyRings,
} from "./ai-secrets.server.ts";

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const original = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { run(); }
  finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function legacyV1Envelope(value: unknown, secret: string): string {
  const key = createHash("sha256").update(`ian-tech-ai-provider-settings:v1:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

const AUTH_SECRET = "test-auth-secret-with-more-than-32-characters";
const AI_SECRET = "a".repeat(64);

test("legacy v2 key rings round-trip when using the stable auth-secret fallback", () => {
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: undefined }, () => {
    const credentials = {
      preferred: "manus" as const,
      collaborativeReview: true,
      keys: { manus: ["manus-private-token"], gemini: ["gemini-private-token-1", "gemini-private-token-2"] },
    };
    const ciphertext = encryptAiCredentials(credentials);
    assert.match(ciphertext, /^v2\./);
    assert.equal(ciphertext.includes("private-token"), false);
    assert.deepEqual(decryptAiCredentials(ciphertext), credentials);
  });
});

test("dedicated stable encryption key creates v3 ciphertext and round-trips", () => {
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: AI_SECRET }, () => {
    const credentials = { preferred: "groq" as const, keys: { groq: ["groq-private-token"] } };
    const ciphertext = encryptAiCredentials(credentials);
    assert.match(ciphertext, /^v3\.ai\./);
    assert.equal(ciphertext.includes("groq-private-token"), false);
    assert.deepEqual(decryptAiCredentials(ciphertext), normalizeAiCredentials(credentials));
  });
});

test("legacy v1/v2 credentials can be read after setting the dedicated key and migrated to v3", () => {
  const credentials = normalizeAiCredentials({ preferred: "gemini", keys: { gemini: ["legacy-gemini-key"] } });
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: undefined }, () => {
    const oldV2 = encryptAiCredentials(credentials);
    assert.deepEqual(decryptAiCredentials(legacyV1Envelope(credentials, AUTH_SECRET)), credentials);
    withEnvironment({ AI_CREDENTIALS_ENCRYPTION_KEY: AI_SECRET }, () => {
      assert.deepEqual(decryptAiCredentials(oldV2), credentials);
      const upgraded = encryptAiCredentials(decryptAiCredentials(oldV2));
      assert.match(upgraded, /^v3\.ai\./);
      assert.deepEqual(decryptAiCredentials(upgraded), credentials);
    });
  });
});

test("legacy single-key credentials migrate to one-element key rings", () => {
  assert.deepEqual(normalizeAiCredentials({ preferred: "gemini", gemini: "legacy-gemini-key" }), {
    preferred: "gemini",
    collaborativeReview: true,
    keys: { gemini: ["legacy-gemini-key"] },
  });
});

test("normalization deduplicates keys and caps each provider", () => {
  const keys = ["key-1", "key-2", "key-3", "key-4", "key-5", "key-6", "key-1"];
  const credentials = normalizeAiCredentials({ preferred: "groq", keys: { groq: keys } });
  assert.deepEqual(credentials.keys.groq, ["key-1", "key-2", "key-3", "key-4", "key-5", "key-6"]);
  assert.equal(credentials.keys.groq?.length, 6);
  assert.ok(6 <= MAX_API_KEYS_PER_PROVIDER);
});

test("key-ring changes remove selected entries and append replacement keys in order", () => {
  const current = normalizeAiCredentials({ preferred: "gemini", keys: { gemini: ["first", "backup"] } });
  const updated = updateAiProviderKeyRings(current, { remove: { gemini: [0] }, keys: { gemini: ["replacement"] } });
  assert.deepEqual(updated.keys.gemini, ["backup", "replacement"]);
  const cleared = updateAiProviderKeyRings(updated, { clear: ["gemini"] });
  assert.equal(cleared.keys.gemini, undefined);
});

test("only nonblank supplied API keys qualify as an explicit replacement", () => {
  assert.equal(hasReplacementAiKeys({ groq: ["  ", ""] }), false);
  assert.equal(hasReplacementAiKeys({ groq: ["new-groq-key"] }), true);
  assert.equal(hasReplacementAiKeys(null), false);
  assert.equal(canReplaceUnreadableAiCredentials(new Error("Stored AI provider credentials cannot be decrypted."), { groq: ["new-groq-key"] }), true);
  assert.equal(canReplaceUnreadableAiCredentials(new Error("Database connection failed."), { groq: ["new-groq-key"] }), false);
  assert.equal(canReplaceUnreadableAiCredentials(new Error("Stored AI provider credentials cannot be decrypted."), { groq: [""] }), false);
});

test("credentials cannot be decrypted with a different legacy application secret", () => {
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: undefined }, () => {
    const ciphertext = encryptAiCredentials({ preferred: "claude", keys: { claude: ["private"] } });
    process.env.BETTER_AUTH_SECRET = "a-different-auth-secret-long-enough-for-tests";
    assert.throws(() => decryptAiCredentials(ciphertext), /cannot be decrypted/);
  });
});

test("v3 credentials cannot be decrypted with a different dedicated encryption key", () => {
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: AI_SECRET }, () => {
    const ciphertext = encryptAiCredentials({ preferred: "claude", keys: { claude: ["private"] } });
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = "b".repeat(64);
    assert.throws(() => decryptAiCredentials(ciphertext), /cannot be decrypted/);
  });
});

test("invalid dedicated key formats fail with actionable setup guidance", () => {
  withEnvironment({ BETTER_AUTH_SECRET: AUTH_SECRET, AI_CREDENTIALS_ENCRYPTION_KEY: "too-short" }, () => {
    assert.throws(() => encryptAiCredentials({ preferred: "manus", keys: {} }), /64 hexadecimal characters/);
  });
});

test("provider status exposes counts only and never secret values", () => {
  const credentials = normalizeAiCredentials({ preferred: "grok", keys: { grok: ["private-key-1", "private-key-2"] } });
  const status = aiProviderStatus(credentials);
  assert.equal(status.preferred, "grok");
  assert.equal(status.configured.grok, true);
  assert.equal(status.keyCounts.grok, 2);
  assert.equal(status.keyCounts.manus, 0);
  assert.deepEqual(Object.keys(status.configured), [...AI_PROVIDERS]);
  assert.equal(JSON.stringify(status).includes("private-key"), false);
});
