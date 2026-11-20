import type { Sql } from "@/lib/db";

export type DarajaRuntime = {
  env: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  partyB: string;
  transactionType: string;
  callbackUrl: string;
  defaultPhone: string;
};

export type IntegrationPublic = {
  canEdit: boolean;
  grokReady: boolean;
  databaseBackend: "neon" | "pglite";
  databaseUrlSaved: boolean;
  darajaEnv: "sandbox" | "production";
  consumerKeyLast4: string;
  consumerSecretLast4: string;
  passkeyLast4: string;
  shortcode: string;
  partyB: string;
  transactionType: string;
  callbackUrl: string;
  defaultPhone: string;
  schoolCode: string;
  nemisCode: string;
  county: string;
  subCounty: string;
  motto: string;
};

export type IntegrationInput = {
  darajaEnv?: string;
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  shortcode?: string;
  partyB?: string;
  transactionType?: string;
  callbackUrl?: string;
  defaultPhone?: string;
  schoolCode?: string;
  nemisCode?: string;
  county?: string;
  subCounty?: string;
  motto?: string;
  databaseUrl?: string;
  clearDatabaseUrl?: boolean;
};

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function last4(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  return clean.slice(-4);
}

function envOr(saved: string, envName: string): string {
  return saved.trim() || (process.env[envName] ?? "").trim();
}

async function ensureRow(sql: Sql): Promise<void> {
  await sql`
    insert into integration_settings (id) values (1)
    on conflict (id) do nothing
  `;
}

async function canEdit(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ role: string }>`select role from profiles where user_id = ${userId}`;
  if (rows[0]?.role === "admin") return true;
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

type Row = {
  daraja_env: string;
  daraja_consumer_key: string;
  daraja_consumer_secret: string;
  daraja_passkey: string;
  daraja_shortcode: string;
  daraja_party_b: string;
  daraja_transaction_type: string;
  daraja_callback_url: string;
  default_payment_phone: string;
  school_code: string;
  nemis_code: string;
  county: string;
  sub_county: string;
  motto: string;
  database_url_note: string;
};

async function readRow(sql: Sql): Promise<Row> {
  await ensureRow(sql);
  const rows = await sql<Row>`select * from integration_settings where id = 1`;
  return rows[0] ?? {
    daraja_env: "sandbox",
    daraja_consumer_key: "",
    daraja_consumer_secret: "",
    daraja_passkey: "",
    daraja_shortcode: "",
    daraja_party_b: "",
    daraja_transaction_type: "CustomerBuyGoodsOnline",
    daraja_callback_url: "",
    default_payment_phone: "",
    school_code: "",
    nemis_code: "",
    county: "",
    sub_county: "",
    motto: "",
    database_url_note: "",
  };
}

export async function loadDarajaRuntime(sql: Sql): Promise<DarajaRuntime> {
  const row = await readRow(sql);
  const envName = envOr(row.daraja_env, "DARAJA_ENV").toLowerCase();
  const callbackSaved = envOr(row.daraja_callback_url, "DARAJA_CALLBACK_URL");
  const origin = (process.env.BETTER_AUTH_URL ?? "").trim().replace(/\/+$/, "");
  const callbackUrl = callbackSaved.startsWith("https://")
    ? callbackSaved
    : origin.startsWith("https://")
      ? `${origin}/api/mpesa/callback`
      : "";
  return {
    env: envName === "production" ? "production" : "sandbox",
    consumerKey: envOr(row.daraja_consumer_key, "DARAJA_CONSUMER_KEY"),
    consumerSecret: envOr(row.daraja_consumer_secret, "DARAJA_CONSUMER_SECRET"),
    passkey: envOr(row.daraja_passkey, "DARAJA_PASSKEY"),
    shortcode: envOr(row.daraja_shortcode, "DARAJA_SHORTCODE"),
    partyB: envOr(row.daraja_party_b, "DARAJA_PARTY_B").replace(/\D/g, ""),
    transactionType: envOr(row.daraja_transaction_type, "DARAJA_TRANSACTION_TYPE") || "CustomerBuyGoodsOnline",
    callbackUrl,
    defaultPhone: envOr(row.default_payment_phone, "DEFAULT_PAYMENT_PHONE"),
  };
}

export async function integrationStatus(sql: Sql, userId: string, backend: "neon" | "pglite"): Promise<IntegrationPublic> {
  const row = await readRow(sql);
  const runtime = await loadDarajaRuntime(sql);
  return {
    canEdit: await canEdit(sql, userId),
    grokReady: Boolean(process.env.XAI_API_KEY?.trim()),
    databaseBackend: backend,
    databaseUrlSaved: Boolean(row.database_url_note?.trim()),
    darajaEnv: runtime.env,
    consumerKeyLast4: last4(runtime.consumerKey),
    consumerSecretLast4: last4(runtime.consumerSecret),
    passkeyLast4: last4(runtime.passkey),
    shortcode: runtime.shortcode,
    partyB: runtime.partyB,
    transactionType: runtime.transactionType,
    callbackUrl: runtime.callbackUrl,
    defaultPhone: runtime.defaultPhone,
    schoolCode: row.school_code ?? "",
    nemisCode: row.nemis_code ?? "",
    county: row.county ?? "",
    subCounty: row.sub_county ?? "",
    motto: row.motto ?? "",
  };
}

export async function saveIntegration(
  sql: Sql,
  userId: string,
  input: IntegrationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canEdit(sql, userId))) {
    return { ok: false, error: "Only the school owner can change these variables." };
  }
  const current = await readRow(sql);
  const keepSecret = (next: string | undefined, previous: string) => {
    const value = clip(next, 256);
    if (!value || value.includes("•")) return previous;
    return value;
  };
  const env = clip(input.darajaEnv, 20).toLowerCase() === "production" ? "production" : "sandbox";
  const callback = clip(input.callbackUrl, 300);
  if (callback && !callback.startsWith("https://")) {
    return { ok: false, error: "The Daraja callback must be an https:// address on this site." };
  }
  const databaseNote = input.clearDatabaseUrl
    ? ""
    : clip(input.databaseUrl, 500) || current.database_url_note;
  if (databaseNote && !input.clearDatabaseUrl && clip(input.databaseUrl, 500)) {
    if (!/^postgres(ql)?:\/\//i.test(databaseNote)) {
      return { ok: false, error: "A database URL must start with postgresql://. Leave it blank to keep the host database." };
    }
  }
  await sql`
    update integration_settings set
      daraja_env = ${env},
      daraja_consumer_key = ${keepSecret(input.consumerKey, current.daraja_consumer_key)},
      daraja_consumer_secret = ${keepSecret(input.consumerSecret, current.daraja_consumer_secret)},
      daraja_passkey = ${keepSecret(input.passkey, current.daraja_passkey)},
      daraja_shortcode = ${clip(input.shortcode, 20)},
      daraja_party_b = ${clip(input.partyB, 20).replace(/\D/g, "")},
      daraja_transaction_type = ${clip(input.transactionType, 40) || "CustomerBuyGoodsOnline"},
      daraja_callback_url = ${callback},
      default_payment_phone = ${clip(input.defaultPhone, 20)},
      school_code = ${clip(input.schoolCode, 40)},
      nemis_code = ${clip(input.nemisCode, 40)},
      county = ${clip(input.county, 60)},
      sub_county = ${clip(input.subCounty, 60)},
      motto = ${clip(input.motto, 160)},
      database_url_note = ${databaseNote},
      updated_at = now()
    where id = 1
  `;
  return { ok: true };
}
