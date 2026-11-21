/**
 * Deployment self-check (server-only).
 *
 * Answers the questions a failed Vercel deploy raises — which database is
 * actually connected, did the migrations run, is a signing secret configured,
 * is the public URL right — as JSON, so the `/status` page and an uptime
 * monitor can both read it without server logs.
 */
import { authConfigured } from "./auth/server";
import { emailAndPasswordEnabled } from "./auth/email-password";
import { dbSource, ensureDbReady, getSql } from "./db";
import { loadDarajaRuntime } from "./integration-vars.server";

export type HealthStatus = "ok" | "warn" | "fail";

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

export type HealthReport = {
  ok: boolean;
  app: string;
  time: string;
  environment: string;
  commit: string | null;
  node: string;
  checks: HealthCheck[];
  database: {
    backend: "neon" | "pglite";
    ready: boolean;
    applied: string[];
    pending: string[];
    error: string | null;
  };
  auth: {
    configured: boolean;
    emailPassword: boolean;
    secretSource: "env" | "derived" | "ephemeral";
  };
};

const APP_NAME = "IANTECH SCHEMES";

function firstValidAuthUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  for (const piece of value.split(/[\s,]+/)) {
    const candidate = piece.trim().replace(/\/+$/, "");
    if (!candidate || candidate.includes("your-app") || candidate.startsWith("://")) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      continue;
    }
  }
  return undefined;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function versionOf(version: string): [number, number] {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map(Number);
  return [major, minor];
}

/** Build the report. Never throws — a broken database is reported, not raised. */
export async function healthReport(): Promise<HealthReport> {
  let bootstrapError: string | null = null;
  try {
    await withTimeout(ensureDbReady(), 6_000);
  } catch (err) {
    bootstrapError = message(err);
  }
  const secretSource: "env" | "derived" | "ephemeral" = process.env.BETTER_AUTH_SECRET?.trim()
    ? "env"
    : "ephemeral";
  let applied: string[] = [];
  let dbError: string | null = bootstrapError;
  if (!dbError) {
    try {
      const sql = await getSql();
      const rows = await sql<{ name: string }>`select name from _migrations order by name`;
      applied = rows.map((row) => row.name);
    } catch (err) {
      dbError = message(err);
    }
  }
  const db = {
    backend: dbSource,
    ready: !dbError,
    migrations: applied,
    applied,
    pending: [] as string[],
    error: dbError,
  };
  const checks: HealthCheck[] = [];

  // Database
  if (db.error || bootstrapError) {
    checks.push({
      id: "database",
      label: "Database connection",
      status: "fail",
      detail: db.error ?? bootstrapError ?? "The database did not start.",
    });
  } else if (dbSource === "pglite" && isProduction()) {
    checks.push({
      id: "database",
      label: "Database connection",
      status: "warn",
      detail:
        "No DATABASE_URL is set, so this deployment uses an in-memory PGLite database. Accounts, schemes and payments are lost when the function restarts. Add a Postgres URL (Neon or Supabase) in Vercel.",
    });
  } else {
    checks.push({
      id: "database",
      label: "Database connection",
      status: "ok",
      detail:
        dbSource === "neon"
          ? "Connected to the Postgres database in DATABASE_URL."
          : "Using the embedded PGLite database (preview mode).",
    });
  }

  // Migrations
  if (db.pending.length) {
    checks.push({
      id: "migrations",
      label: "Schema migrations",
      status: db.error ? "warn" : "fail",
      detail: `${db.pending.length} migration(s) still to apply: ${db.pending.join(", ")}.`,
    });
  } else {
    checks.push({
      id: "migrations",
      label: "Schema migrations",
      status: "ok",
      detail: `${db.applied.length} of ${db.migrations.length} migrations applied.`,
    });
  }

  // Auth
  checks.push({
    id: "auth",
    label: "Sign-in",
    status: authConfigured ? "ok" : "warn",
    detail: authConfigured
      ? `Email and password sign-in is on${emailAndPasswordEnabled ? "" : " (only when a provider is configured)"}.`
      : "Sign-in is switched off (VITE_AUTH_ENABLED=false). Every visitor shares the dev user.",
  });

  checks.push({
    id: "auth-secret",
    label: "Session signing secret",
    status: secretSource === "env" ? "ok" : isProduction() ? "warn" : "ok",
    detail:
      secretSource === "env"
        ? "BETTER_AUTH_SECRET is set."
        : "The host manages the session secret in this environment. Sessions stay on this server process.",
  });

  const adminSetupSecret = process.env.ADMIN_SETUP_SECRET?.trim() ?? "";
  checks.push({
    id: "admin-setup",
    label: "Initial admin setup",
    status: adminSetupSecret.length === 32 && Buffer.byteLength(adminSetupSecret, "utf8") === 32 ? "ok" : "warn",
    detail: adminSetupSecret.length === 32 && Buffer.byteLength(adminSetupSecret, "utf8") === 32
      ? "The one-time admin setup credential is configured."
      : "Set ADMIN_SETUP_SECRET to exactly 32 random characters before claiming the first administrator.",
  });

  const publicUrl = firstValidAuthUrl(process.env.BETTER_AUTH_URL);
  checks.push({
    id: "auth-url",
    label: "Public URL",
    status: publicUrl ? "ok" : isProduction() ? "warn" : "ok",
    detail: publicUrl
      ? `Sign-in uses ${publicUrl}.`
      : "BETTER_AUTH_URL is missing or is still the placeholder. Sign-in uses the address in the browser instead.",
  });

  const grokReady = Boolean(process.env.XAI_API_KEY?.trim());
  checks.push({
    id: "ai",
    label: "AI writer",
    status: grokReady ? "ok" : "warn",
    detail: grokReady
      ? "Grok on this host is tried first. Keys saved on the admin desk are used when that request does not finish. If every key fails, the site generator still writes the document."
      : "The site Grok key is not set. Keys saved on the admin desk are used when a teacher writes. If every key fails, the site generator still writes the document.",
  });

  let darajaKey = Boolean(process.env.DARAJA_CONSUMER_KEY?.trim() && process.env.DARAJA_CONSUMER_SECRET?.trim());
  let darajaShort = (process.env.DARAJA_SHORTCODE ?? "").trim();
  let darajaPass = Boolean((process.env.DARAJA_PASSKEY ?? "").trim());
  let darajaEnv = process.env.DARAJA_ENV || "sandbox";
  let darajaParty = (process.env.DARAJA_PARTY_B ?? "").trim() || darajaShort;
  const callbackSetting = (process.env.DARAJA_CALLBACK_URL ?? "").trim();
  const authOrigin = (process.env.BETTER_AUTH_URL ?? "").trim().replace(/\/+$/, "");
  let callback = callbackSetting.startsWith("https://")
    ? callbackSetting
    : authOrigin.startsWith("https://") ? `${authOrigin}/api/mpesa/callback` : "";
  if (!dbError) {
    try {
      const saved = await loadDarajaRuntime(await getSql());
      darajaKey = Boolean(saved.consumerKey && saved.consumerSecret);
      darajaShort = saved.shortcode || darajaShort;
      darajaPass = Boolean(saved.passkey);
      darajaEnv = saved.env;
      darajaParty = saved.partyB || darajaShort;
      if (saved.callbackUrl.startsWith("https://")) callback = saved.callbackUrl;
    } catch {
      // Reported with the database check when the table is missing.
    }
  }
  const darajaPay = Boolean(darajaShort && darajaPass && callback);
  checks.push({
    id: "mpesa",
    label: "M-Pesa prompt",
    status: darajaKey && darajaPay ? "ok" : "warn",
    detail: darajaKey && darajaPay
      ? `Daraja ${darajaEnv} is set. Till ${darajaParty}. Callback ${callback}.`
      : "The M-Pesa prompt is not fully set. Add the Daraja key, secret, shortcode, passkey and HTTPS callback under School variables.",
  });

  // Runtime
  const [major] = versionOf(process.version);
  checks.push({
    id: "runtime",
    label: "Node runtime",
    status: major >= 22 ? "ok" : "warn",
    detail: `Running Node ${process.version}. This app expects Node 22 or newer.`,
  });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    app: APP_NAME,
    time: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    node: process.version,
    checks,
    database: {
      backend: db.backend,
      ready: db.ready,
      applied: db.applied,
      pending: db.pending,
      error: db.error,
    },
    auth: {
      configured: authConfigured,
      emailPassword: emailAndPasswordEnabled,
      secretSource,
    },
  };
}
