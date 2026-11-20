import { timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";
import { TERMS, levelLabel } from "@/lib/curriculum";
import { probeAiProviderKey, writeCbe, type Brief } from "@/lib/ai.server";
import { aiProviderStatus, canReplaceUnreadableAiCredentials, decryptAiCredentials, encryptAiCredentials, normalizeAiCredentials, updateAiProviderKeyRings, type AiProvider, type AiProviderCredentials } from "@/lib/ai-secrets.server";
import { AI_PROVIDERS, AI_PROVIDER_LABELS } from "@/lib/ai-provider-types";
import { effectiveCurriculumPrice, normalizeCurriculumPriceRule, type CurriculumPriceRule } from "@/lib/curriculum-pricing";
import { deskWindowMs, rollingDeskExpiry } from "@/lib/desk-access";
import { loadDarajaRuntime, type DarajaRuntime } from "@/lib/integration-vars.server";
import { loadTeacherWriterKey } from "@/lib/teacher-writer.server";
import { checkLessonCompleteness, checkSchemeCompleteness } from "@/lib/planning-quality";
import { balanceSteps, polishAssessment, polishExperiences, polishInquiry, polishLinks, polishNotes, polishOutcomes, polishQuestions } from "@/lib/cbe-quality";
import {
  BRANDING_TEXT_LIMIT,
  cleanBrandingText,
  cleanLogo,
  DEFAULT_FOOTER_TEXT,
  DEFAULT_HEADER_TEXT,
  expandBrandingTokens,
  brandingForExport,
  isBrandingMode,
  resolveBranding,
} from "@/lib/branding";
import type { AssessmentKind, AssessmentRecord, BrandingGrant, BrandingState, ReceiptInfo, SavedFilter } from "@/lib/cbe-types";
import { QUESTION_CHUNK, KJSEA_QUESTION_COUNT, allowedCounts, cbaLevel, clampQuestionCount, kjseaMarksAt, suggestTimeMinutes } from "@/lib/question-plan";
import {
  bookBanner,
  bookCoverLine,
  buildLessonRows,
  columnsOrDefault,
  parseLessonLine,
  sanitizeColumns,
  weekDateLabel,
} from "@/lib/scheme-format";
import type {
  DocKind,
  DocMeta,
  GenerationProvenance,
  GenInput,
  Json,
  LessonBody,
  LessonPlanPackBody,
  Me,
  NotesBody,
  PaymentRow,
  Profile,
  PublicSettings,
  QuestionType,
  RevisionBody,
  SchemeBody,
  SchemeWeek,
  CalendarEvent,
  CalendarEventKind,
  LessonProgress,
  ProgressSummary,
} from "@/lib/cbe-types";
import { expandStrandSelections, flattenTopicSelections } from "@/lib/curriculum-content";

type PaperTopicScope = { topic: string; subtopic: string; strand?: string };
type Raw = Record<string, unknown>;

function mapCalendarEvent(row: Raw): CalendarEvent {
  return {
    id: num(row.id),
    kind: String(row.kind ?? "term") as CalendarEventKind,
    title: String(row.title ?? ""),
    startsOn: String(row.starts_on ?? ""),
    endsOn: String(row.ends_on ?? ""),
    note: String(row.note ?? ""),
    completed: flag(row.completed),
  };
}

function flag(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function text(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keeps line breaks so a worked example can show step 1, step 2, step 3. */
function textBlock(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function list(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => text(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function blockList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => textBlock(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function waDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = `254${d.slice(1)}`;
  if (d.length === 9) d = `254${d}`;
  return d.slice(0, 15);
}

async function ensureSettings(sql: Sql): Promise<void> {
  await sql`insert into settings (id) values (1) on conflict (id) do nothing`;
  await sql.query(`alter table settings add column if not exists scheme_columns text not null default ''`);
  await sql.query(`alter table profiles add column if not exists scheme_columns text not null default ''`);
  await sql.query(`alter table profiles add column if not exists use_admin_columns boolean not null default true`);
  await sql.query(`alter table settings add column if not exists default_lessons int not null default 5`);
  await sql.query(`alter table settings add column if not exists default_minutes int not null default 40`);
  await sql.query(`alter table settings add column if not exists default_note_depth text not null default 'full'`);
  await sql.query(`alter table settings add column if not exists default_question_count int not null default 20`);
  await sql.query(`alter table settings add column if not exists default_question_types text not null default 'mcq,short,structured'`);
  await sql.query(`alter table settings add column if not exists ai_provider_credentials text not null default ''`);
  await sql.query(`alter table settings add column if not exists ai_preferred_provider text not null default 'manus'`);
  // Header/footer branding and the permission switches around it (migration 0012).
  await sql.query(`alter table settings add column if not exists header_text text not null default ''`);
  await sql.query(`alter table settings add column if not exists footer_text text not null default ''`);
  await sql.query(`alter table settings add column if not exists header_default_on boolean not null default true`);
  await sql.query(`alter table settings add column if not exists footer_default_on boolean not null default true`);
  await sql.query(`alter table settings add column if not exists school_logo text not null default ''`);
  await sql.query(`alter table settings add column if not exists teacher_may_edit_branding boolean not null default false`);
  await sql.query(`alter table settings add column if not exists teacher_may_hide_branding boolean not null default false`);
  await sql.query(`alter table settings add column if not exists desk_lock_minutes integer not null default 30`);
  await sql.query(`alter table settings add column if not exists admin_key_hash text not null default ''`);
  await sql.query(`alter table settings add column if not exists admin_key_updated_at timestamptz`);
  await sql.query(`alter table profiles add column if not exists header_mode text not null default 'default'`);
  await sql.query(`alter table profiles add column if not exists footer_mode text not null default 'default'`);
  await sql.query(`alter table profiles add column if not exists header_text text not null default ''`);
  await sql.query(`alter table profiles add column if not exists footer_text text not null default ''`);
  await sql.query(`alter table profiles add column if not exists branding_grant text not null default 'inherit'`);
  await sql.query(`alter table profiles add column if not exists school_logo text not null default ''`);
  await sql.query(`create table if not exists admin_access_grants (user_id text primary key, verified_at timestamptz not null default now(), expires_at timestamptz not null, device_hint text not null default '', sign_in_count int not null default 1, last_seen_at timestamptz not null default now())`);
  await sql.query(`create table if not exists admin_key_attempts (user_id text primary key, failed_attempts int not null default 0, window_started_at timestamptz not null default now(), locked_until timestamptz)`);
  await sql.query(`alter table payments add column if not exists receipt_no text`);
  await sql.query(`alter table payments add column if not exists receipt_issued_at timestamptz`);
  await sql.query(`alter table payments add column if not exists item_label text not null default ''`);
  await sql.query(`create table if not exists assessment_records (id serial primary key, user_id text not null, title text not null, grade text not null, stream text not null default '', subject text not null, term text not null, year int not null, assessment_kind text not null default 'written', total_marks int not null default 100, taught_on text not null default '', note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
  await sql.query(`create table if not exists assessment_scores (id serial primary key, record_id int not null references assessment_records (id) on delete cascade, roll_no text not null default '', learner_name text not null, marks int, note text not null default '', updated_at timestamptz not null default now(), unique (record_id, learner_name))`);
  await sql.query(`create table if not exists saved_filters (id serial primary key, user_id text not null, label text not null, level text not null default '', grade text not null default '', subject text not null default '', term text not null default '', year int, kind text not null default 'all', created_at timestamptz not null default now(), unique (user_id, label))`);
  await sql.query(`create table if not exists admin_bootstrap_claims (slot smallint primary key check (slot = 1), user_id text not null unique, claimed_at timestamptz not null default now())`);
  await sql.query(`create table if not exists admin_claim_attempts (user_id text primary key, failed_attempts int not null default 0, window_started_at timestamptz not null default now(), locked_until timestamptz)`);
  await sql.query(`create table if not exists admin_audit_log (id bigserial primary key, actor_id text not null, action text not null, target_id text not null default '', detail text not null default '', created_at timestamptz not null default now())`);
  await sql.query(`alter table payments add column if not exists verified boolean not null default false`);
  await sql.query(`alter table payments add column if not exists checkout_request_id text`);
  await sql.query(`alter table payments add column if not exists merchant_request_id text not null default ''`);
  await sql.query(`alter table payments add column if not exists result_code integer`);
  await sql.query(`alter table payments add column if not exists result_description text not null default ''`);
  await sql.query(`alter table payments add column if not exists paid_phone text not null default ''`);
  await sql.query(`alter table payments add column if not exists paid_amount int`);
  await sql.query(`alter table payments add column if not exists error_message text not null default ''`);
  let partyB = (process.env.DARAJA_PARTY_B ?? "").replace(/\D/g, "");
  try {
    const saved = await loadDarajaRuntime(sql);
    partyB = saved.partyB || saved.shortcode || partyB;
  } catch {
    // Integration table is applied with the migrations; ignore if this call races bootstrap.
  }
  if (partyB) {
    await sql.query(
      `update settings set till_number = $1, till_name = coalesce(nullif(till_name, ''), 'IAN TECH') where id = 1 and btrim(till_number) = ''`,
      [partyB],
    );
  }
  // Safety net for databases created before migration 0007 ran (the migration
  // is the source of truth; these keep an old row set usable either way).
  await sql.query(`alter table documents add column if not exists favorite boolean not null default false`);
  await sql.query(`create table if not exists lesson_progress (
    id serial primary key,
    user_id text not null,
    document_id int not null references documents (id) on delete cascade,
    week int not null,
    lesson int not null,
    taught boolean not null default false,
    reflection text not null default '',
    updated_at timestamptz not null default now(),
    unique (document_id, week, lesson)
  )`);
}

function mapSettings(row: Raw): PublicSettings {
  const mode = row.payment_mode === "approve" ? "approve" : "instant";
  const noteDepth = row.default_note_depth === "summary" ? "summary" as const : "full" as const;
  return {
    tillNumber: String(row.till_number ?? ""),
    tillName: String(row.till_name ?? "IAN TECH"),
    priceKes: num(row.price_kes, 50),
    whatsapp: String(row.whatsapp ?? "254723278526"),
    contactName: String(row.contact_name ?? "IAN TECH"),
    welcome: String(row.welcome ?? ""),
    freeForAll: flag(row.free_for_all),
    paymentMode: mode,
    schemeColumns: columnsOrDefault(row.scheme_columns),
    defaultLessons: Math.max(1, Math.min(6, num(row.default_lessons, 5))),
    defaultMinutes: num(row.default_minutes, 40) === 80 ? 80 : 40,
    defaultNoteDepth: noteDepth,
    defaultQuestionCount: clampQuestionCount(num(row.default_question_count, 45), noteDepth),
    defaultQuestionTypes: String(row.default_question_types ?? "mcq,short,structured").split(",").filter((type): type is QuestionType => ["mcq", "short", "structured", "true-false", "fill-blank", "practical"].includes(type)),
    headerText: String(row.header_text ?? ""),
    footerText: String(row.footer_text ?? ""),
    headerDefaultOn: row.header_default_on == null ? true : flag(row.header_default_on),
    footerDefaultOn: row.footer_default_on == null ? true : flag(row.footer_default_on),
    schoolLogo: cleanLogo(row.school_logo),
    teacherMayEditBranding: flag(row.teacher_may_edit_branding),
    teacherMayHideBranding: flag(row.teacher_may_hide_branding),
    deskLockMinutes: Math.max(5, Math.min(43_200, num(row.desk_lock_minutes, 43_200))),
  };
}

async function settingsRow(sql: Sql): Promise<Raw> {
  await ensureSettings(sql);
  const rows = await sql<Raw>`select * from settings where id = 1`;
  return rows[0] ?? {};
}

export async function publicDesk(sql: Sql): Promise<PublicSettings> {
  return mapSettings(await settingsRow(sql));
}

function mapProfile(row: Raw): Profile {
  return {
    userId: String(row.user_id ?? ""),
    role: row.role === "admin" ? "admin" : row.role === "deputy" ? "deputy" : "teacher",
    displayName: String(row.display_name ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    schoolName: String(row.school_name ?? ""),
    schemeColumns: sanitizeColumns(row.scheme_columns),
    useAdminColumns: row.use_admin_columns == null ? true : flag(row.use_admin_columns),
    headerMode: isBrandingMode(row.header_mode) ? row.header_mode : "default",
    footerMode: isBrandingMode(row.footer_mode) ? row.footer_mode : "default",
    headerText: String(row.header_text ?? ""),
    footerText: String(row.footer_text ?? ""),
    brandingGrant: row.branding_grant === "allowed" ? "allowed" : row.branding_grant === "blocked" ? "blocked" : "inherit",
    schoolLogo: cleanLogo(row.school_logo),
  };
}

async function ensureProfile(sql: Sql, userId: string): Promise<Profile> {
  await sql`
    insert into profiles (user_id, display_name, email)
    select ${userId}, coalesce(u."name", ''), coalesce(u."email", '')
    from "user" u
    where u."id" = ${userId}
    on conflict (user_id) do update set
      email = excluded.email,
      display_name = case
        when profiles.display_name = '' then excluded.display_name
        else profiles.display_name
      end
  `;
  const found = await sql<Raw>`select * from profiles where user_id = ${userId}`;
  if (!found[0]) {
    await sql`insert into profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
  }
  const rows = await sql<Raw>`select * from profiles where user_id = ${userId}`;
  return mapProfile(rows[0] ?? { user_id: userId });
}

async function downloadsFree(sql: Sql, profile: Profile, settings: PublicSettings): Promise<boolean> {
  if (profile.role === "admin" || profile.role === "deputy" || settings.freeForAll) return true;
  const teacher = await sql`
    select id from grants
    where kind = 'teacher' and teacher_user_id = ${profile.userId}
    limit 1
  `;
  if (teacher.length) return true;
  const school = profile.schoolName.trim();
  if (!school) return false;
  const schoolGrant = await sql`
    select id from grants
    where kind = 'school' and lower(btrim(school_name)) = lower(btrim(${school}))
    limit 1
  `;
  return schoolGrant.length > 0;
}

export async function loadMe(sql: Sql, userId: string): Promise<Me> {
  const profile = await ensureProfile(sql, userId);
  const settings = await publicDesk(sql);
  const free = await downloadsFree(sql, profile, settings);
  const counts = await sql<Raw>`
    select count(*) as n from documents
    where user_id = ${userId}
      and (created_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
  `;
  const row = await settingsRow(sql);
  return {
    profile,
    settings,
    downloadsFree: free,
    generatedToday: num(counts[0]?.n),
    dailyLimit: num(row.daily_gen_limit, 8),
    branding: resolveBranding(profile, settings),
  };
}

export async function saveProfile(
  sql: Sql,
  userId: string,
  input: { displayName: string; phone: string; schoolName: string },
): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  const displayName = text(input.displayName, 80);
  const phone = text(input.phone, 20);
  const schoolName = text(input.schoolName, 120);
  if (displayName.length < 2) return { ok: false, error: "Add the name that should appear on the cover." };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "Add a phone number teachers and the office can use." };
  if (schoolName.length < 2) return { ok: false, error: "Add the school name for the cover page." };
  await ensureProfile(sql, userId);
  await sql`
    update profiles
    set display_name = ${displayName}, phone = ${phone}, school_name = ${schoolName}
    where user_id = ${userId}
  `;
  const rows = await sql<Raw>`select * from profiles where user_id = ${userId}`;
  return { ok: true, profile: mapProfile(rows[0] ?? { user_id: userId }) };
}

export async function saveSchemeLayout(
  sql: Sql,
  userId: string,
  input: { useAdminColumns: boolean; schemeColumns: string[] },
): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  await ensureSettings(sql);
  await ensureProfile(sql, userId);
  const columns = JSON.stringify(sanitizeColumns(input.schemeColumns));
  await sql`
    update profiles
    set use_admin_columns = ${input.useAdminColumns},
        scheme_columns = ${input.useAdminColumns ? "" : columns}
    where user_id = ${userId}
  `;
  const rows = await sql<Raw>`select * from profiles where user_id = ${userId}`;
  return { ok: true, profile: mapProfile(rows[0] ?? { user_id: userId }) };
}

async function auditAdminAction(sql: Sql, actorId: string, action: string, targetId = "", detail = ""): Promise<void> {
  await sql`
    insert into admin_audit_log (actor_id, action, target_id, detail)
    values (${actorId}, ${text(action, 60)}, ${text(targetId, 100)}, ${text(detail, 240)})
  `;
}

export async function claimAdmin(
  sql: Sql,
  userId: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureProfile(sql, userId);
  await ensureSettings(sql);
  const expected = process.env.ADMIN_SETUP_SECRET?.trim() ?? "";
  if (expected.length !== 32 || Buffer.byteLength(expected, "utf8") !== 32) {
    return { ok: false, error: "Initial admin setup is unavailable. Configure ADMIN_SETUP_SECRET as exactly 32 random characters." };
  }
  const recent = await sql<Raw>`select locked_until from admin_claim_attempts where user_id = ${userId}`;
  const lockedUntil = recent[0]?.locked_until ? new Date(String(recent[0].locked_until)).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return { ok: false, error: "Too many setup attempts. Wait 15 minutes before trying again." };
  }
  const supplied = secret.trim();
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const secretOk = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  if (!secretOk) {
    await sql.query(
      `insert into admin_claim_attempts (user_id, failed_attempts, window_started_at, locked_until)
       values ($1, 1, now(), null)
       on conflict (user_id) do update set
         failed_attempts = case when admin_claim_attempts.window_started_at < now() - interval '15 minutes' then 1 else admin_claim_attempts.failed_attempts + 1 end,
         window_started_at = case when admin_claim_attempts.window_started_at < now() - interval '15 minutes' then now() else admin_claim_attempts.window_started_at end,
         locked_until = case when admin_claim_attempts.window_started_at < now() - interval '15 minutes' then null
                             when admin_claim_attempts.failed_attempts + 1 >= 5 then now() + interval '15 minutes'
                             else admin_claim_attempts.locked_until end`,
      [userId],
    );
    return { ok: false, error: "That setup credential is not valid. Repeated failures pause setup for 15 minutes." };
  }
  await sql`
    insert into admin_bootstrap_claims (slot, user_id)
    select 1, user_id from profiles where role = 'admin' order by created_at asc limit 1
    on conflict (slot) do nothing
  `;
  const claim = await sql<Raw>`
    insert into admin_bootstrap_claims (slot, user_id)
    select 1, ${userId}
    where not exists (select 1 from profiles where role = 'admin')
    on conflict (slot) do nothing
    returning slot
  `;
  if (!claim.length) return { ok: false, error: "Initial admin setup has already been claimed. Ask an existing administrator to manage access." };
  await sql`update settings set admin_key_hash = ${await hashDeskKey(expected)}, admin_pin = '', admin_key_updated_at = now() where id = 1`;
  await sql`update profiles set role = 'admin' where user_id = ${userId}`;
  await sql`delete from admin_claim_attempts where user_id = ${userId}`;
  await auditAdminAction(sql, userId, "admin.bootstrap", userId, "Initial administrator setup claimed");
  return { ok: true };
}

async function isAdmin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  return rows[0]?.role === "admin";
}

export async function isStaffUser(sql: Sql, userId: string): Promise<boolean> {
  return isStaff(sql, userId);
}

async function isStaff(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  return rows[0]?.role === "admin" || rows[0]?.role === "deputy";
}

async function storedAiCredentials(sql: Sql): Promise<AiProviderCredentials> {
  const row = await settingsRow(sql);
  const ciphertext = row.ai_provider_credentials;
  const credentials = decryptAiCredentials(ciphertext);
  if (typeof ciphertext === "string" && ciphertext && process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim() && !ciphertext.startsWith("v3.ai.")) {
    const upgraded = encryptAiCredentials(credentials);
    await sql`update settings set ai_provider_credentials = ${upgraded} where id = 1 and ai_provider_credentials = ${ciphertext}`;
  }
  return normalizeAiCredentials({ ...credentials, preferred: row.ai_preferred_provider || credentials.preferred });
}

export async function aiProviderStatusForOwner(sql: Sql, userId: string) {
  if (!(await isAdmin(sql, userId))) return { ok: false as const, error: "Only the owner can manage AI provider access." };
  try {
    return { ok: true as const, ...aiProviderStatus(await storedAiCredentials(sql)) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "AI provider settings could not be read." };
  }
}

export async function saveAiProviderSettings(
  sql: Sql,
  userId: string,
  input: { preferred: AiProvider; keys: Partial<Record<AiProvider, string[]>>; remove: Partial<Record<AiProvider, number[]>>; collaborativeReview: boolean; clear: AiProvider[] },
): Promise<{ ok: true; preferred: AiProvider; collaborativeReview: boolean; configured: Record<AiProvider, boolean>; keyCounts: Record<AiProvider, number> } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the owner can manage AI provider access." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  try {
    let current: AiProviderCredentials;
    let recoveredUnreadableKeys = false;
    try {
      current = await storedAiCredentials(sql);
    } catch (error) {
      if (!canReplaceUnreadableAiCredentials(error, input.keys)) throw error;
      // The owner explicitly submitted new keys. Unreadable ciphertext cannot be
      // salvaged, so replace that key ring rather than blocking all future saves.
      current = { preferred: input.preferred, collaborativeReview: true, keys: {} };
      recoveredUnreadableKeys = true;
    }
    const next: AiProviderCredentials = updateAiProviderKeyRings(
      { ...current, preferred: input.preferred, collaborativeReview: input.collaborativeReview },
      input,
    );
    for (const provider of AI_PROVIDERS) {
      for (const key of input.keys[provider] ?? []) {
        try {
          await probeAiProviderKey(provider, key);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "";
          const safe = /401|403/.test(detail)
            ? "The provider rejected this key."
            : /429|quota|rate limit/i.test(detail)
              ? "The free limit blocked the test. Wait and try again."
              : /CLOUDFLARE_ACCOUNT_ID/i.test(detail)
                ? "Add CLOUDFLARE_ACCOUNT_ID in the server environment before saving a Cloudflare key."
                : /400|404|model/i.test(detail)
                  ? "This key did not open a model for the writer you selected. Choose the matching writer (Grok, Gemini, Groq, and so on) and test again. A Gemini key will not pass a Grok test."
                  : "The provider did not pass the connection test.";
          return { ok: false, error: `${AI_PROVIDER_LABELS[provider]} was not saved. ${safe}` };
        }
      }
    }
    await sql`update settings set ai_provider_credentials = ${encryptAiCredentials(next)}, ai_preferred_provider = ${next.preferred} where id = 1`;
    const enabled = Object.entries(aiProviderStatus(next).configured).filter(([, configured]) => configured).map(([provider]) => provider).join(", ") || "AI unavailable";
    await auditAdminAction(sql, userId, recoveredUnreadableKeys ? "ai.providers.recover" : "ai.providers.update", "", `${recoveredUnreadableKeys ? "Unreadable key ring replaced; " : ""}Preferred ${next.preferred}; configured: ${enabled}`);
    return { ok: true, ...aiProviderStatus(next) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AI provider settings could not be saved." };
  }
}

export async function probeAiProviderKeyForOwner(
  sql: Sql,
  userId: string,
  input: { provider: AiProvider; apiKey?: string; savedIndex?: number },
): Promise<{ ok: true; provider: AiProvider; latencyMs: number } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the owner can test AI provider keys." };
  const gate = await requireDeskSession(sql, userId);
  if (!gate.ok) return gate;
  if (!AI_PROVIDERS.includes(input.provider)) return { ok: false, error: "Choose a supported AI provider." };
  let key = input.apiKey?.trim() ?? "";
  if (input.savedIndex !== undefined) {
    const credentials = await storedAiCredentials(sql);
    key = credentials.keys[input.provider]?.[input.savedIndex] ?? "";
  }
  if (!key) return { ok: false, error: "That key is not available. Save it first or enter a staged key." };
  try {
    const result = await probeAiProviderKey(input.provider, key);
    await auditAdminAction(sql, userId, "ai.provider.test", input.provider, `Connectivity test passed in ${result.latencyMs} ms`);
    return { ok: true, provider: input.provider, latencyMs: result.latencyMs };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const safeMessage = /CLOUDFLARE_ACCOUNT_ID/i.test(detail)
      ? "Cloudflare needs CLOUDFLARE_ACCOUNT_ID set in the server environment."
      : /(?:401|403)/.test(detail)
        ? "The provider rejected this key or its model permission (HTTP 401/403). Check the key, account and model access."
        : /429|quota|rate limit/i.test(detail)
          ? "The provider rate limit or free quota blocked the check. Wait, review its quota, then test again."
          : /400|404|model/i.test(detail)
            ? "The provider rejected the request or model. Verify that the current model is enabled for this account."
            : "The provider did not complete the check. Verify network access and the provider's current API/model availability.";
    await auditAdminAction(sql, userId, "ai.provider.test.failed", input.provider, safeMessage);
    return { ok: false, error: safeMessage };
  }
}

export async function listCurriculumPriceRulesForOwner(sql: Sql, userId: string) {
  if (!(await isAdmin(sql, userId))) return { ok: false as const, error: "Only the owner can view curriculum price rules." };
  const rows = await sql<Raw>`
    select grade, subject, price_kes,
      to_char(updated_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as updated_at
    from curriculum_price_rules order by grade_key, subject_key
  `;
  return { ok: true as const, rules: rows.map((row) => ({
    grade: String(row.grade), subject: String(row.subject), priceKes: num(row.price_kes), updatedAt: String(row.updated_at ?? ""),
  })) };
}

export async function saveCurriculumPriceRule(sql: Sql, userId: string, input: unknown) {
  if (!(await isAdmin(sql, userId))) return { ok: false as const, error: "Only the owner can set curriculum prices." };
  const gate = await requireDeskSession(sql, userId);
  if (!gate.ok) return gate;
  let rule: CurriculumPriceRule;
  try { rule = normalizeCurriculumPriceRule(input); }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Price rule is invalid." }; }
  const gradeKey = rule.grade.toLocaleLowerCase("en");
  const subjectKey = rule.subject.toLocaleLowerCase("en");
  await sql`
    insert into curriculum_price_rules (grade, subject, grade_key, subject_key, price_kes, updated_by)
    values (${rule.grade}, ${rule.subject}, ${gradeKey}, ${subjectKey}, ${rule.priceKes}, ${userId})
    on conflict (grade_key, subject_key) do update set
      grade = excluded.grade, subject = excluded.subject, price_kes = excluded.price_kes,
      updated_by = excluded.updated_by, updated_at = now()
  `;
  await auditAdminAction(sql, userId, "curriculum.price.update", `${rule.grade} ${rule.subject}`, `Price ${rule.priceKes === 0 ? "free" : `KES ${rule.priceKes}`} per document set`);
  return { ok: true as const };
}

export async function removeCurriculumPriceRule(sql: Sql, userId: string, input: unknown) {
  if (!(await isAdmin(sql, userId))) return { ok: false as const, error: "Only the owner can remove curriculum prices." };
  const gate = await requireDeskSession(sql, userId);
  if (!gate.ok) return gate;
  const raw = asRecord(input);
  let grade = "";
  let subject = "";
  try {
    const normalized = normalizeCurriculumPriceRule({ grade: raw.grade, subject: raw.subject, priceKes: 0 });
    grade = normalized.grade.toLocaleLowerCase("en");
    subject = normalized.subject.toLocaleLowerCase("en");
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Choose a valid rule." }; }
  const deleted = await sql`delete from curriculum_price_rules where grade_key = ${grade} and subject_key = ${subject} returning id`;
  if (!deleted.length) return { ok: false as const, error: "That price rule no longer exists." };
  await auditAdminAction(sql, userId, "curriculum.price.remove", `${grade} ${subject}`, "Price rule removed; the baseline site price applies again");
  return { ok: true as const };
}

async function packPaid(sql: Sql, userId: string, packId: string): Promise<boolean> {
  const rows = await sql`
    select id from payments
    where user_id = ${userId} and pack_id = ${packId} and status = 'paid'
    limit 1
  `;
  return rows.length > 0;
}

async function packPricing(sql: Sql, userId: string, packId: string, baselinePrice: number): Promise<{ priceKes: number; customRule: boolean }> {
  const rows = await sql<Raw>`
    select rule.price_kes from documents d
    left join curriculum_price_rules rule
      on rule.grade_key = lower(d.grade) and rule.subject_key = lower(d.subject)
    where d.user_id = ${userId} and d.pack_id = ${packId}
    order by d.id asc limit 1
  `;
  const customRule = rows[0]?.price_kes != null;
  const priceKes = effectiveCurriculumPrice(baselinePrice, customRule ? { priceKes: num(rows[0]?.price_kes) } : undefined);
  return { priceKes, customRule };
}

function metaFrom(row: Raw, unlocked: boolean): DocMeta {
  return {
    id: num(row.id),
    packId: String(row.pack_id ?? ""),
    kind: (String(row.kind ?? "scheme") as DocKind) || "scheme",
    title: String(row.title ?? ""),
    level: String(row.level ?? ""),
    grade: String(row.grade ?? ""),
    subject: String(row.subject ?? ""),
    strand: String(row.strand ?? ""),
    substrand: String(row.substrand ?? ""),
    term: String(row.term ?? ""),
    year: num(row.year),
    weekFrom: num(row.week_from),
    weekTo: num(row.week_to),
    lessonsPerWeek: num(row.lessons_per_week, 1),
    pathway: String(row.pathway ?? ""),
    schoolName: String(row.school_name ?? ""),
    teacherName: String(row.teacher_name ?? ""),
    phone: String(row.phone ?? ""),
    stream: String(row.stream ?? ""),
    startFrom: String(row.start_from ?? ""),
    endAt: String(row.end_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    unlocked,
    priceKes: effectiveCurriculumPrice(num(row.baseline_price, 50), row.rule_price_kes == null ? undefined : { priceKes: num(row.rule_price_kes) }),
    favorite: flag(row.favorite),
  };
}

export async function listDocuments(sql: Sql, userId: string): Promise<DocMeta[]> {
  const me = await loadMe(sql, userId);
  const rows = await sql<Raw>`
    select documents.id, documents.pack_id, documents.kind, documents.title, documents.level, documents.grade, documents.subject,
      documents.strand, documents.substrand, documents.term, documents.year, documents.favorite,
      documents.week_from, documents.week_to, documents.lessons_per_week, documents.pathway, documents.school_name,
      documents.teacher_name, documents.phone, documents.stream, documents.start_from, documents.end_at,
      coalesce(rule.price_kes, ${me.settings.priceKes}) as baseline_price, rule.price_kes as rule_price_kes,
      to_char(documents.created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at,
      exists (
        select 1 from payments p
        where p.user_id = documents.user_id
          and p.pack_id = documents.pack_id
          and p.status = 'paid'
      ) as paid
    from documents
    left join curriculum_price_rules rule
      on rule.grade_key = lower(documents.grade) and rule.subject_key = lower(documents.subject)
    where documents.user_id = ${userId}
    order by documents.id desc
    limit 100
  `;
  return rows.map((row) => {
    const priceKes = effectiveCurriculumPrice(num(row.baseline_price, me.settings.priceKes), row.rule_price_kes == null ? undefined : { priceKes: num(row.rule_price_kes) });
    return metaFrom(row, me.downloadsFree || priceKes <= 0 || flag(row.paid));
  });
}

function redactBody(kind: DocKind, body: unknown): { body: Json; lockedExtra: number } {
  if (kind === "scheme") {
    const scheme = body as SchemeBody;
    const weeks = scheme.weeks ?? [];
    const lessons = scheme.lessons ?? [];
    const firstWeek = weeks[0]?.week;
    const visible = firstWeek == null ? lessons.slice(0, 5) : lessons.filter((lesson) => lesson.week === firstWeek);
    return {
      body: asJson({
        ...scheme,
        weeks: weeks.slice(0, 1),
        lessons: visible,
        tocPhotos: [],
      }),
      lockedExtra: Math.max(0, weeks.length - 1),
    };
  }
  if (kind === "lesson") {
    const pack = body as LessonPlanPackBody;
    if (Array.isArray(pack.lessonPlans)) {
      const first = pack.lessonPlans[0];
      const visible = first ? [{
        ...first,
        body: {
          ...first.body,
          steps: (first.body.steps ?? []).slice(0, 1),
          rubric: [],
          support: "",
          extension: "",
          homework: "",
          reflection: "",
        },
      }] : [];
      return {
        body: asJson({ ...pack, lessonPlans: visible }),
        lockedExtra: Math.max(0, (pack.totalLessons ?? pack.lessonPlans.length) - 1),
      };
    }
    const lesson = body as LessonBody;
    return {
      body: asJson({
        ...lesson,
        steps: (lesson.steps ?? []).slice(0, 1),
        rubric: [],
        support: "",
        extension: "",
        homework: "",
        reflection: "",
      }),
      lockedExtra: Math.max(0, (lesson.steps ?? []).length - 1),
    };
  }
  if (kind === "notes") {
    const notes = body as NotesBody;
    return {
      body: asJson({ ...notes, sections: [], tryThis: [], answerKey: [], answerKeyNote: "", remember: (notes.remember ?? []).slice(0, 1) }),
      lockedExtra: (notes.sections ?? []).length,
    };
  }
  const paper = body as RevisionBody;
  const first = (paper.questions ?? []).slice(0, 1).map((q) => ({ ...q, answer: "", marking: "" }));
  return {
    body: asJson({ ...paper, questions: first }),
    lockedExtra: Math.max(0, (paper.questions ?? []).length - 1),
  };
}

export async function readDocument(sql: Sql, userId: string, id: number) {
  const me = await loadMe(sql, userId);
  const rows = await sql<Raw>`
    select documents.id, documents.pack_id, documents.kind, documents.title, documents.level, documents.grade, documents.subject,
      documents.strand, documents.substrand, documents.term, documents.year, documents.favorite,
      documents.week_from, documents.week_to, documents.lessons_per_week, documents.pathway, documents.school_name,
      documents.teacher_name, documents.phone, documents.stream, documents.start_from, documents.end_at, documents.body,
      coalesce(rule.price_kes, ${me.settings.priceKes}) as baseline_price, rule.price_kes as rule_price_kes,
      to_char(documents.created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at
    from documents
    left join curriculum_price_rules rule
      on rule.grade_key = lower(documents.grade) and rule.subject_key = lower(documents.subject)
    where documents.id = ${id} and documents.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, error: "That document is not on your desk." };
  const paid = await packPaid(sql, userId, String(row.pack_id));
  const priceKes = effectiveCurriculumPrice(num(row.baseline_price, me.settings.priceKes), row.rule_price_kes == null ? undefined : { priceKes: num(row.rule_price_kes) });
  const unlocked = me.downloadsFree || priceKes <= 0 || paid;
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(String(row.body ?? "{}"));
  } catch {
    parsed = {};
  }
  const view = unlocked ? { body: asJson(parsed), lockedExtra: 0 } : redactBody(row.kind as DocKind, parsed);
  const siblings = await sql<Raw>`
    select id, kind, title,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at
    from documents
    where user_id = ${userId} and pack_id = ${String(row.pack_id)}
    order by id asc
  `;
  return {
    ok: true as const,
    doc: {
      ...metaFrom(row, unlocked),
      body: view.body,
      redacted: !unlocked,
      lockedExtra: view.lockedExtra,
      // Resolved server-side from the desk policy and this teacher's grant, so
      // the download prints what the desk decided, not what the browser claims.
      branding: brandingForExport(me.branding),
    },
    siblings: siblings.map((s) => ({
      id: num(s.id),
      kind: String(s.kind),
      title: String(s.title),
      createdAt: String(s.created_at),
    })),
    settings: me.settings,
    downloadsFree: me.downloadsFree,
  };
}

export async function removeDocument(
  sql: Sql,
  userId: string,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql`delete from documents where id = ${id} and user_id = ${userId} returning id`;
  if (!rows.length) return { ok: false, error: "That document is not on your desk." };
  return { ok: true };
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

function asRecord(v: unknown): Raw {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

function provenanceOf(raw: unknown): GenerationProvenance | undefined {
  const value = asRecord(asRecord(raw).generationProvenance);
  const mode = value.mode;
  if (mode !== "ai" && mode !== "web-assisted-local" && mode !== "local-template" && mode !== "mixed") return undefined;
  const sources = Array.isArray(value.sources) ? value.sources.flatMap((item) => {
    const source = asRecord(item);
    const url = text(source.url, 600);
    try {
      if (new URL(url).protocol !== "https:") return [];
    } catch { return []; }
    return [{
      title: text(source.title, 180),
      url,
      license: text(source.license, 500),
      retrievedAt: text(source.retrievedAt, 40),
      retrieval: source.retrieval === "live" ? "live" as const : "catalogued-link" as const,
    }];
  }).slice(0, 12) : [];
  return {
    mode,
    label: text(value.label, 80) || (mode === "ai" ? "AI-written" : "Local template"),
    notice: text(value.notice, 1200),
    sources,
    ...(text(value.licenseNotice, 1200) ? { licenseNotice: text(value.licenseNotice, 1200) } : {}),
  };
}

function mergeProvenance(values: (GenerationProvenance | undefined)[]): GenerationProvenance | undefined {
  const items = values.filter((item): item is GenerationProvenance => Boolean(item));
  if (!items.length) return undefined;
  const modes = [...new Set(items.map((item) => item.mode))];
  const mode = modes.length === 1 ? modes[0]! : "mixed";
  const sources = [...new Map(items.flatMap((item) => item.sources).map((source) => [source.url, source])).values()].slice(0, 12);
  const licenseNotice = items.map((item) => item.licenseNotice).find(Boolean);
  return {
    mode,
    label: mode === "mixed" ? "Mixed AI and local-template content" : items[0]!.label,
    notice: mode === "mixed"
      ? "Some sections were AI-written and some were completed by a deterministic local template. Review every answer, fact, example and curriculum reference before use."
      : items[0]!.notice,
    sources,
    ...(licenseNotice ? { licenseNotice } : {}),
  };
}

function normalizeScheme(raw: unknown, input: GenInput, columns: string[]): SchemeBody {
  const rec = asRecord(raw);
  const span = input.weekTo - input.weekFrom + 1;
  const source = Array.isArray(rec.weeks) ? rec.weeks : [];
  const weeks: SchemeWeek[] = source.slice(0, span).map((item, index) => {
    const w = asRecord(item);
    return {
      week: input.weekFrom + index,
      focus: text(w.focus, 180) || `${input.substrand}, part ${index + 1}`,
      outcomes: list(w.outcomes, 4, 220),
      inquiry: list(w.inquiry, 3, 180),
      experiences: list(w.experiences, 4, 220),
      competencies: list(w.competencies, 3, 80),
      values: list(w.values, 3, 40),
      pcis: list(w.pcis, 2, 80),
      resources: list(w.resources, 4, 80),
      assessment: text(w.assessment, 220),
      lessonHints: list(w.lessonHints, input.lessonsPerWeek, 160),
      homework: text(w.homework, 180),
    };
  });
  while (weeks.length < span) {
    const index = weeks.length;
    weeks.push({
      week: input.weekFrom + index,
      focus: `${input.substrand}, part ${index + 1}`,
      outcomes: [],
      inquiry: [],
      experiences: [],
      competencies: [],
      values: [],
      pcis: [],
      resources: [],
      assessment: input.assessmentMethods.join(" / "),
      lessonHints: [],
      homework: "",
    });
  }
  const lines = Array.isArray(rec.lessonLines) ? rec.lessonLines : [];
  const seeds = lines.map((item) => {
    if (typeof item === "string") return parseLessonLine(text(item, 1600));
    const line = asRecord(item);
    const rawOutcomes = list(line.outcomes, 5, 320);
    return {
      strand: text(line.strand, 100),
      substrand: text(line.substrand, 180) || [text(line.topic, 100), text(line.focus, 140)].filter(Boolean).join(" — "),
      pagesFrom: text(line.pagesFrom, 5).replace(/\D/g, ""),
      pagesTo: text(line.pagesTo, 5).replace(/\D/g, ""),
      outcomes: rawOutcomes,
      experiences: list(line.experiences, 5, 300),
      inquiry: list(line.inquiry, 3, 220),
      resources: list(line.resources, 5, 160),
      assessment: text(line.assessment, 320),
    };
  }).filter((seed) => seed.substrand || seed.outcomes?.length);
  const textbooks = input.textbooks;
  const lessons = buildLessonRows(weeks, seeds, {
    strand: input.strand,
    substrand: input.substrand,
    substrands: input.substrands,
    grade: input.grade,
    subject: input.subject,
    lessonsPerWeek: input.lessonsPerWeek,
    lessonMinutes: input.lessonMinutes,
    reflectionMode: input.reflectionMode,
    assessmentMethods: input.assessmentMethods,
    textbooks,
    selectedTopics: input.selectedTopics,
    includeCompetencies: input.includeCompetencies,
    includeValues: input.includeValues,
    includePcis: input.includePcis,
    termStart: input.termStart,
    weekFrom: input.weekFrom,
    doubleLesson: input.doubleLesson,
  });
  if (!lessons.length) throw new Error("The scheme came back without lessons. Please try again.");
  const checked = lessons.map((lesson) => {
    const topic = lesson.substrand || input.substrand;
    const links = polishLinks(lesson);
    return {
      ...lesson,
      outcomes: polishOutcomes(lesson.outcomes, topic, lesson.minutes || input.lessonMinutes),
      experiences: polishExperiences(lesson.experiences, topic),
      inquiry: polishInquiry(lesson.inquiry, topic),
      assessment: polishAssessment(lesson.assessment, topic),
      competencies: links.competencies.length ? links.competencies : lesson.competencies,
      values: links.values.length ? links.values : lesson.values,
      pcis: links.pcis.length ? links.pcis : lesson.pcis,
    };
  });
  const safety = input.safetyNote
    ? "Safety: check the space, equipment and learner pairs before practical or games lessons. Stop an activity that is not safe."
    : "";
  return {
    overview:
      text(rec.overview, 500) ||
      `Scheme of work for ${input.grade} ${input.subject}, ${input.strand}: ${input.substrand}. ${input.lessonsPerWeek} lessons each week.`,
    csl: text(rec.csl, 300),
    weeks,
    lessons: checked,
    topicSelections: input.selectedTopics ?? [],
    columns,
    textbooks,
    bookLine: bookBanner(textbooks, input.subject),
    termStart: input.termStart,
    halfTermStart: input.halfTermStart ?? "",
    halfTermEnd: input.halfTermEnd ?? "",
    lessonMinutes: input.lessonMinutes,
    reflectionMode: input.reflectionMode,
    coverNote: input.coverNote,
    safetyNote: safety,
    showApproval: input.showApproval,
    tocPhotos: input.tocPhotos,
    learners: input.learners,
    boys: input.boys,
    girls: input.girls,
    hodName: input.hodName,
    preparedOn: input.preparedOn,
    doubleLesson: input.doubleLesson,
    homeworkDay: input.homeworkDay,
    room: input.room,
    generationProvenance: provenanceOf(raw),
  };
}

function normalizeLesson(raw: unknown, input: GenInput): LessonBody {
  const rec = asRecord(raw);
  const focus = flattenTopicSelections(input.selectedTopics ?? [])[0];
  const topicLabel = focus ? `${focus.topic} — ${focus.subtopic}` : input.substrand;
  const stepsIn = Array.isArray(rec.steps) ? rec.steps : [];
  const steps = stepsIn.slice(0, 6).map((item) => {
    const s = asRecord(item);
    return {
      phase: text(s.phase, 40) || "Lesson step",
      minutes: Math.max(1, Math.min(80, num(s.minutes, 10))),
      teacher: text(s.teacher, 600),
      learners: text(s.learners, 600),
    };
  });
  if (steps.length < 2) throw new Error("The lesson plan came back incomplete. Please try again.");
  const rubricIn = Array.isArray(rec.rubric) ? rec.rubric : [];
  const rawOutcomes = list(rec.outcomes, 6, 320);
  const ensureOutcome = (item: string) => item.toLowerCase().startsWith("by the end") ? item : `By the end of the lesson, the learner should be able to ${item.replace(/[.]?$/, ".")}`;
  const finalOutcomes = rawOutcomes.map(ensureOutcome);
  for (const item of [
    `explain the main ideas and vocabulary in ${topicLabel}`,
    `demonstrate the key skill or method in ${topicLabel} using an example or classroom task`,
    `apply ${topicLabel} in a new familiar context and explain the reasoning used`,
  ]) {
    if (finalOutcomes.length >= 3) break;
    finalOutcomes.push(ensureOutcome(item));
  }
  const topic = topicLabel;
  const minutes = input.lessonMinutes || 40;
  const outcomes = polishOutcomes(finalOutcomes, topic, minutes);
  const stepsBalanced = balanceSteps(steps, minutes);
  return {
    duration: text(rec.duration, 40) || `${minutes} minutes`,
    weekLabel: text(rec.weekLabel, 40) || `Week ${input.focusWeek ?? input.weekFrom}`,
    outcomes,
    inquiry: polishInquiry(list(rec.inquiry, 4, 240), topic),
    resources: list(rec.resources, 8, 160),
    steps: stepsBalanced,
    support: text(rec.support, 650) || `Sit with learners who are approaching expectations and repeat one step of ${topic} with a worked example.`,
    extension: text(rec.extension, 650) || `Learners who are exceeding expectations explain ${topic} to a partner or solve one harder case.`,
    assessment: polishAssessment(text(rec.assessment, 650), topic),
    rubric: rubricIn.slice(0, 4).map((item) => {
      const r = asRecord(item);
      return { level: text(r.level, 40), descriptor: text(r.descriptor, 360) };
    }),
    homework: text(rec.homework, 360) || `Find one example of ${topic} at home or in the school compound and write two sentences.`,
    reflection: text(rec.reflection, 420) || "Which outcome was secure, and which step needs another lesson?",
    priorKnowledge: text(rec.priorKnowledge, 400) || `Learners should already recognise the vocabulary that leads into ${topic}.`,
    successCriteria: list(rec.successCriteria, 4, 220).length
      ? list(rec.successCriteria, 4, 220)
      : outcomes.slice(0, 3).map((item) => item.replace(/^By the end of the lesson, the learner should be able to /i, "The learner can ")),
    ...polishLinks({
      competencies: list(rec.competencies, 4, 80).length ? list(rec.competencies, 4, 80) : input.includeCompetencies,
      values: list(rec.values, 4, 80).length ? list(rec.values, 4, 80) : input.includeValues,
      pcis: list(rec.pcis, 4, 80).length ? list(rec.pcis, 4, 80) : input.includePcis,
    }),
    generationProvenance: provenanceOf(raw),
  };
}

function normalizeNotes(raw: unknown, input: GenInput): NotesBody {
  const rec = asRecord(raw);
  const full = input.depth !== "summary";
  const vocab = Array.isArray(rec.vocabulary) ? rec.vocabulary : [];
  const sections = Array.isArray(rec.sections) ? rec.sections : [];
  const practice = blockList(rec.tryThis, full ? 24 : 4, full ? 700 : 420);
  const topic = flattenTopicSelections(input.selectedTopics ?? [])[0];
  const focus = topic ? `${topic.topic} — ${topic.subtopic}` : input.substrand || input.strand;
  const notes: NotesBody = {
    summary: textBlock(rec.summary, full ? 2400 : 800),
    objectives: list(rec.objectives, full ? 6 : 3, 220),
    prerequisite: textBlock(rec.prerequisite, 800),
    vocabulary: vocab.slice(0, full ? 16 : 6).map((item) => {
      const v = asRecord(item);
      return { term: text(v.term, 80), meaning: text(v.meaning, full ? 500 : 220) };
    }).filter((v) => v.term),
    sections: sections.slice(0, full ? 16 : 3).map((item) => {
      const s = asRecord(item);
      return {
        heading: text(s.heading, 160) || "Notes",
        paragraphs: blockList(s.paragraphs, full ? 10 : 2, full ? 1800 : 500),
        examples: blockList(s.examples, full ? 12 : 2, full ? 2000 : 500),
      };
    }),
    tryThis: practice,
    answerKey: blockList(rec.answerKey, full ? 24 : 4, full ? 1800 : 1000),
    answerKeyNote: text(rec.answerKeyNote, 600) || "Model solutions for the teacher. Check every figure, unit and example against the approved text before marking.",
    remember: list(rec.remember, full ? 12 : 4, 280),
    mistakes: blockList(rec.mistakes, full ? 10 : 2, 360),
  };
  const contents = (Array.isArray(rec.contents) ? rec.contents : []).slice(0, 16).map((item) => {
    const row = asRecord(item);
    const page = Number(row.page);
    return {
      strand: text(row.strand, 120) || input.strand,
      substrand: text(row.substrand, 160),
      page: Number.isFinite(page) && page > 0 ? Math.round(page) : 1,
    };
  }).filter((row) => row.substrand);
  const minimumSections = full ? 6 : 1;
  const minimumPractice = full ? 12 : 3;
  if (notes.summary.length < 40 || notes.sections.length < minimumSections) {
    throw new Error(`The generated notes for ${focus} are incomplete (${notes.sections.length} sections). Retry generation or contact the site owner.`);
  }
  if (full && (notes.vocabulary.filter((item) => item.term && item.meaning).length < 6 || practice.length < 12 || practice.length > 24 || (notes.answerKey?.length ?? 0) !== practice.length || (notes.mistakes?.length ?? 0) < 6)) {
    throw new Error(`Full notes for ${focus} must include vocabulary, twelve to twenty-four practice questions with matching answers, and common mistakes. Retry generation.`);
  }
  if (practice.length < minimumPractice || (notes.answerKey?.length ?? 0) !== practice.length || notes.sections.some((section) => section.paragraphs.length < (full ? 2 : 1) || section.examples.length < (full ? 5 : 1))) {
    throw new Error(`Notes for ${focus} are missing explanations, examples, practice, or matching answers. Retry generation.`);
  }
  const polished = polishNotes(notes, focus);
  return {
    ...notes,
    ...polished,
    contents,
    answerKey: polished.tryThis.map((_, index) => notes.answerKey?.[index] ?? ""),
    answerKeyNote: notes.answerKeyNote,
    generationProvenance: provenanceOf(raw),
  };
}

function normalizeRevision(raw: unknown, input: GenInput): RevisionBody {
  const rec = asRecord(raw);
  const provenance = provenanceOf(raw);
  const questionsIn = Array.isArray(rec.questions) ? rec.questions : [];
  const isKjsea = input.assessmentMode === "kjsea-format";
  const cap = isKjsea ? KJSEA_QUESTION_COUNT : clampQuestionCount(input.questionCount ?? 45, input.depth);
  const allowed = isKjsea ? ["mcq", "structured"] : input.questionTypes?.length ? input.questionTypes : ["short", "structured"];
  const questions = questionsIn.slice(0, cap).map((item, index) => {
    const q = asRecord(item);
    const candidate = text(q.type, 20).toLowerCase();
    const type = isKjsea ? (index < 20 ? "mcq" : "structured") : allowed.includes(candidate as QuestionType) ? candidate : (allowed[index % allowed.length] ?? "short");
    return {
      number: index + 1,
      type,
      marks: isKjsea ? kjseaMarksAt(index) : Math.max(1, Math.min(10, num(q.marks, 1))),
      prompt: text(q.prompt, fullPrompt(input.depth)),
      options: type === "mcq" ? list(q.options, 4, 240) : [],
      answer: text(q.answer, 800),
      marking: text(q.marking, 800),
    };
  }).filter((q) => q.prompt);
  if (isKjsea && questions.length !== KJSEA_QUESTION_COUNT) throw new Error("The KJSEA-format assessment was incomplete; retry generation or ask the owner to check resource settings.");
  if (isKjsea && questions.some((question) => !question.answer || !question.marking)) throw new Error("The KJSEA-format assessment is missing an answer or marking guidance; retry generation.");
  if (isKjsea && questions.slice(0, 20).some((question) => question.options.length !== 4)) throw new Error("The KJSEA-format multiple-choice section is incomplete; retry generation.");
  if (questions.length !== cap) throw new Error(`The writer returned ${questions.length} of ${cap} requested questions. The incomplete assessment was not saved; retry generation.`);
  if (questions.some((question) => !question.answer || !question.marking)) throw new Error("The assessment has a question without teacher answer criteria or marking guidance. Retry generation.");
  const normalized = polishQuestions(questions);
  const coverageGrades = [...new Set((input.selectedTopics ?? []).map((topic) => topic.sourceGrade || input.grade))];
  return {
    instructions: text(rec.instructions, 1000) || (isKjsea
      ? "School practice in the 2026 KJSEA Mathematics layout — not an official KNEC paper. Time: 2 hours. Section A: questions 1–20 (20 marks), one answer each. Section B: questions 21–40 (80 marks) in five tasks. Show all working."
      : "Answer all questions. Show working and units where needed. Read each instruction carefully and check your answers before handing in."),
    timeMinutes: isKjsea ? 120 : Math.max(20, Math.min(150, num(rec.timeMinutes, suggestTimeMinutes(normalized.reduce((sum, question) => sum + question.marks, 0), normalized.length)))),
    assessmentMode: input.assessmentMode,
    coverageGrades,
    totalMarks: normalized.reduce((sum, question) => sum + question.marks, 0),
    qualityNotice: input.kind === "exam" || isKjsea ? text(rec.qualityNotice, 1400) || (provenance?.mode === "ai"
      ? "AI-generated teacher-created practice; not an authentic KNEC past paper and not issued, approved, or endorsed by KNEC. Review against the current curriculum and school assessment plan before use."
      : "Locally structured teacher-editable practice template; not an authentic KNEC past paper or validated subject examination. Review and replace generic items against the current curriculum before use.") : undefined,
    generationProvenance: provenance,
    questions: normalized,
  };
}

function fullPrompt(depth: "full" | "summary"): number {
  return depth === "summary" ? 600 : 1800;
}

/** Kenyan classroom contexts, rotated so a long paper never reads the same twice. */
const BANK_CONTEXTS = [
  "a Primary class in Kisumu", "a JSS practical in Nakuru", "the school tuck shop",
  "a farm plot in Embu", "a market day in Kericho", "a matatu ride from Thika",
  "the school garden in Kitui", "a sports day in Eldoret", "a home in Kakamega",
];

/** The topic list a paper should spread itself over, taken from the teacher's own picks. */
function paperTopicScopes(fields: GenInput): PaperTopicScope[] {
  const flat = flattenTopicSelections(fields.selectedTopics ?? []);
  const rows = flat.length
    ? flat.map((row) => ({ topic: row.topic, subtopic: row.subtopic, strand: row.strand }))
    : [];
  const named = fields.substrands.length ? fields.substrands : [fields.substrand || fields.strand];
  const extra = named.map((name) => ({ topic: fields.strand || fields.subject, subtopic: name, strand: fields.strand }));
  return [...rows, ...extra];
}

/**
 * AI papers are written in bounded parts to preserve worked answers and marking
 * guides. Every requested question must come from AI or the paper is rejected;
 * every saved question is AI-authored; local deterministic question banks are not used.
 */
async function writtenQuestions(
  brief: Brief,
  fields: GenInput,
  credentials: AiProviderCredentials,
  writerKey?: string,
): Promise<RevisionBody> {
  const target = clampQuestionCount(fields.questionCount ?? 45, fields.depth);
  if (fields.kind === "exam" && fields.assessmentMode === "kjsea-format") {
    // The 2026-layout paper is one fixed 40-item structure; splitting it would
    // break the promise that Section A is 20 marks and Section B is 80.
    return normalizeRevision(await writeCbe(brief, credentials, writerKey), fields);
  }
  const size = Math.max(4, Math.min(QUESTION_CHUNK, fields.depth === "summary" ? 10 : QUESTION_CHUNK));
  const parts = Math.max(1, Math.ceil(target / size));
  const topics = paperTopicScopes(fields);
  const collected: unknown[] = [];
  let instructions = "";
  let timeMinutes = 0;
  let wroteNothing = true;

  for (let part = 1; part <= parts && collected.length < target; part += 1) {
    const want = Math.min(size, target - collected.length);
    const where = topics.length
      ? topics.map((row) => row.subtopic || row.topic).slice(0, 12).join(", ")
      : fields.substrand || fields.strand || fields.subject;
    const note = `Spread the items over these topics: ${where}. Set each item in a Kenyan situation - for example ${BANK_CONTEXTS[part % BANK_CONTEXTS.length]}.`;
    const chunkBrief: Brief = {
      ...brief,
      questionCount: want,
      chunk: { part, of: parts, fromNumber: collected.length + 1, note },
    };
    try {
      const raw = await writeCbe(chunkBrief, credentials, writerKey);
      const rec = asRecord(raw);
      if (!instructions) instructions = text(rec.instructions, 700);
      if (!timeMinutes) timeMinutes = num(rec.timeMinutes, 0);
      const rows = Array.isArray(rec.questions) ? rec.questions : [];
      if (!rows.length) throw new Error("a part came back empty");
      collected.push(...rows);
      wroteNothing = false;
    } catch (error) {
      throw new Error(`AI could not complete question set part ${part} of ${parts}: ${error instanceof Error ? error.message : "provider failed"}. No offline questions will be added.`);
    }
  }

  if (wroteNothing || collected.length !== target) {
    throw new Error(`AI wrote ${collected.length} of ${target} requested questions. The incomplete paper was not saved; retry generation.`);
  }

  return normalizeRevision({ instructions, timeMinutes, questions: collected }, fields);
}

async function writtenBody(brief: Brief, fields: GenInput, columns: string[], credentials: AiProviderCredentials, writerKey?: string) {
  if (fields.kind === "revision" || fields.kind === "exam") {
    return writtenQuestions(brief, fields, credentials, writerKey);
  }
  try {
    let raw = await writeCbe(brief, credentials, writerKey);
    if (fields.kind === "scheme") {
      try {
        return normalizeScheme(raw, fields, columns);
      } catch (err) {
        if (brief.compact) throw err;
        raw = await writeCbe({ ...brief, compact: true }, credentials, writerKey);
        return normalizeScheme(raw, fields, columns);
      }
    }
    if (fields.kind === "lesson") return normalizeLesson(raw, fields);
    if (fields.kind === "notes") return normalizeNotes(raw, fields);
    return normalizeRevision(raw, fields);
  } catch (error) {
    throw error instanceof Error ? error : new Error("AI generation failed. No offline starter was substituted.");
  }
}

function titleFor(kind: DocKind, input: GenInput): string {
  const base = `${input.grade} ${input.subject} — ${input.substrand}`;
  if (kind === "lesson") {
    const lesson = input.focusLesson ? `, lesson ${input.focusLesson}` : "";
    return `Lesson plan, week ${input.focusWeek ?? input.weekFrom}${lesson}: ${base}`;
  }
  if (kind === "notes") return input.depth === "summary" ? `Notes (summary): ${base}` : `Notes: ${base}`;
  if (kind === "exam") return input.assessmentMode === "kjsea-format" ? `KJSEA-format practice (not official): ${base}` : input.assessmentMode === "cumulative" ? `Cumulative exam (school-designed): ${base}` : `Exam paper: ${base}`;
  if (kind === "revision") return input.depth === "summary" ? `Revision (short): ${base}` : `Revision: ${base}`;
  return `Scheme: ${base}`;
}

async function assertQuota(sql: Sql, userId: string, profile: Profile): Promise<string | null> {
  if (profile.role === "admin" || profile.role === "deputy") return null;
  const row = await settingsRow(sql);
  const limit = num(row.daily_gen_limit, 8);
  const counts = await sql<Raw>`
    select count(*) as n from documents
    where user_id = ${userId}
      and (created_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
  `;
  if (num(counts[0]?.n) >= limit) {
    return `You have used today's ${limit} writings. Come back tomorrow, or ask IAN TECH to raise the limit.`;
  }
  return null;
}

export async function generateDocument(
  sql: Sql,
  userId: string,
  input: GenInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (input.generationJobId) {
    const existing = await sql<Raw>`
      select id from documents
      where user_id = ${userId} and generation_job_id = ${input.generationJobId}
      limit 1
    `;
    if (existing[0]) return { ok: true, id: num(existing[0].id) };
  }
  const profile = await ensureProfile(sql, userId);
  if (profile.role !== "admin") {
    if (profile.displayName.length < 2 || profile.schoolName.length < 2 || profile.phone.replace(/\D/g, "").length < 9) {
      return { ok: false, error: "Add your name, school and phone on your profile before writing. They go on the cover." };
    }
  }
  const writerKey = await loadTeacherWriterKey(sql, userId);
  if (!writerKey) {
    const quota = await assertQuota(sql, userId, profile);
    if (quota) return { ok: false, error: quota };
  }

  let fields = input;
  let packId: string = crypto.randomUUID();
  let excerpt = "";

  if (input.parentId) {
    const parents = await sql<Raw>`
      select * from documents where id = ${input.parentId} and user_id = ${userId}
    `;
    const parent = parents[0];
    if (!parent) return { ok: false, error: "Start from a scheme that is already on your desk." };
    if (input.kind === "scheme") return { ok: false, error: "Open New scheme to write another scheme." };
    packId = String(parent.pack_id);
    fields = {
      ...input,
      level: String(parent.level),
      grade: String(parent.grade),
      subject: String(parent.subject),
      strand: String(parent.strand),
      substrand: String(parent.substrand),
      term: String(parent.term),
      year: num(parent.year),
      weekFrom: num(parent.week_from),
      weekTo: num(parent.week_to),
      lessonsPerWeek: num(parent.lessons_per_week, 1),
      pathway: String(parent.pathway ?? ""),
      startFrom: String(parent.start_from ?? ""),
      endAt: String(parent.end_at ?? ""),
      stream: String(parent.stream ?? ""),
    };
    if (parent.kind === "scheme") {
      try {
        const body = JSON.parse(String(parent.body)) as SchemeBody;
        const weekNo = input.focusWeek ?? fields.weekFrom;
        const week = body.weeks?.find((w) => w.week === weekNo) ?? body.weeks?.[0];
        const lessonRows = (body.lessons ?? []).filter((lesson) => lesson.week === weekNo);
        const focusRow = input.focusLesson
          ? lessonRows.find((lesson) => lesson.lesson === input.focusLesson)
          : undefined;
        excerpt = JSON.stringify({
          week,
          lesson: focusRow ?? lessonRows[0] ?? null,
          books: bookCoverLine(body.textbooks ?? []),
        }).slice(0, 2500);
        if (!fields.textbooks.length && body.textbooks?.length) fields = { ...fields, textbooks: body.textbooks };
        if (!fields.assessmentMethods.length && lessonRows[0]?.assessment) {
          fields = { ...fields, assessmentMethods: lessonRows[0].assessment.split("/").map((part) => part.trim()).filter(Boolean).slice(0, 4) };
        }
        if (body.lessonMinutes === 80) fields = { ...fields, lessonMinutes: 80 };
        if (body.topicSelections?.length) fields = { ...fields, selectedTopics: body.topicSelections };
      } catch {
        excerpt = "";
      }
    }
  }

  const focus = fields.focusWeek ?? fields.weekFrom;
  if (fields.kind === "lesson" && (focus < fields.weekFrom || focus > fields.weekTo)) {
    return { ok: false, error: "Pick a week inside this scheme." };
  }
  if (fields.kind === "lesson" && fields.focusLesson && fields.focusLesson > fields.lessonsPerWeek) {
    return { ok: false, error: "That lesson number is higher than the lessons in the week." };
  }

  const settings = await publicDesk(sql);
  const columns = columnsOrDefault(
    fields.columns.length
      ? fields.columns
      : profile.useAdminColumns
        ? settings.schemeColumns
        : profile.schemeColumns.length
          ? profile.schemeColumns
          : settings.schemeColumns,
  );

  const schoolName = profile.schoolName || "IAN TECH";
  const teacherName = profile.displayName || "Teacher";
  const selectedTopics = expandStrandSelections(fields.selectedTopics ?? [], fields.subject, fields.grade, fields.term);
  fields = { ...fields, selectedTopics };
  const brief: Brief = {
    kind: fields.kind === "exam" ? "revision" : fields.kind,
    levelLabel: levelLabel(fields.level),
    grade: fields.grade,
    subject: fields.subject,
    strand: fields.strand,
    substrand: fields.substrand,
    substrands: fields.substrands,
    term: fields.term,
    year: fields.year,
    weekFrom: fields.weekFrom,
    weekTo: fields.weekTo,
    lessonsPerWeek: fields.lessonsPerWeek,
    pathway: fields.pathway,
    startFrom: fields.startFrom || `Start of ${fields.substrand}`,
    endAt: fields.endAt || `End of ${fields.substrand}`,
    stream: fields.stream,
    schoolName,
    focusWeek: focus,
    focusLesson: fields.focusLesson,
    questionCount: fields.questionCount,
    questionTypes: fields.questionTypes,
    questionDifficulty: fields.questionDifficulty,
    assessmentMode: fields.assessmentMode,
    paperRole: fields.kind === "exam" ? "exam" : fields.kind === "revision" ? "revision" : undefined,
    selectedTopics: fields.selectedTopics,
    teacherGuidance: fields.teacherGuidance,
    includeCompetencies: fields.includeCompetencies,
    includeValues: fields.includeValues,
    includePcis: fields.includePcis,
    schemeExcerpt: excerpt,
    depth: fields.depth,
    textbooks: bookCoverLine(fields.textbooks),
    assessmentMethods: fields.assessmentMethods,
    lessonMinutes: fields.lessonMinutes,
  };

  let body: SchemeBody | LessonBody | NotesBody | RevisionBody;
  try {
    body = await writtenBody(brief, fields, columns, await storedAiCredentials(sql), writerKey ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The writer failed. Please try again.";
    return { ok: false, error: message };
  }

  if (fields.kind === "exam" && "questions" in body) {
    const paper = body as RevisionBody;
    const coverageGrades = [...new Set((fields.selectedTopics ?? []).map((topic) => topic.sourceGrade || fields.grade))];
    body = {
      ...paper,
      assessmentMode: fields.assessmentMode ?? "practice",
      coverageGrades: paper.coverageGrades?.length ? paper.coverageGrades : coverageGrades,
      totalMarks: paper.totalMarks ?? paper.questions.reduce((sum, question) => sum + question.marks, 0),
      qualityNotice: paper.qualityNotice ?? "AI-generated teacher-created curriculum-aligned practice; not an authentic KNEC past paper and not issued, approved, or endorsed by KNEC. Review against the current curriculum and school assessment plan before use.",
    };
  }
  if (fields.kind === "scheme") body = { ...(body as SchemeBody), qualityReport: checkSchemeCompleteness(body as SchemeBody, fields) };
  if (fields.kind === "lesson") body = { ...(body as LessonBody), qualityReport: checkLessonCompleteness(body as LessonBody) };

  if (fields.kind === "scheme" && fields.rememberColumns && !profile.useAdminColumns) {
    await sql`
      update profiles set scheme_columns = ${JSON.stringify(columns)} where user_id = ${userId}
    `;
  } else if (fields.kind === "scheme" && fields.rememberColumns) {
    await sql`
      update profiles
      set use_admin_columns = false, scheme_columns = ${JSON.stringify(columns)}
      where user_id = ${userId}
    `;
  }

  const title = titleFor(fields.kind, fields);
  const inserted = await sql<Raw>`
    insert into documents (
      user_id, pack_id, kind, title, level, grade, subject, strand, substrand, term, year,
      week_from, week_to, lessons_per_week, pathway, school_name, teacher_name, phone, stream,
      start_from, end_at, body, generation_job_id
    ) values (
      ${userId}, ${packId}, ${fields.kind}, ${title}, ${fields.level}, ${fields.grade},
      ${fields.subject}, ${fields.strand}, ${fields.substrand}, ${fields.term}, ${fields.year},
      ${fields.weekFrom}, ${fields.weekTo}, ${fields.lessonsPerWeek}, ${fields.pathway},
      ${schoolName}, ${teacherName}, ${profile.phone}, ${fields.stream},
      ${brief.startFrom}, ${brief.endAt}, ${JSON.stringify(body)}, ${fields.generationJobId ?? null}
    )
    returning id
  `;
  return { ok: true, id: num(inserted[0]?.id) };
}

export async function generateLessonPlanPack(
  sql: Sql,
  userId: string,
  schemeId: number,
): Promise<{ ok: true; id: number; lessonCount: number } | { ok: false; error: string }> {
  const profile = await ensureProfile(sql, userId);
  if (profile.role !== "admin" && (profile.displayName.length < 2 || profile.schoolName.length < 2 || profile.phone.replace(/\D/g, "").length < 9)) {
    return { ok: false, error: "Add your name, school and phone on your profile before writing. They go on the cover." };
  }
  const lessonWriterKey = await loadTeacherWriterKey(sql, userId);
  if (!lessonWriterKey) {
    const quota = await assertQuota(sql, userId, profile);
    if (quota) return { ok: false, error: quota };
  }
  const rows = await sql<Raw>`select * from documents where id = ${schemeId} and user_id = ${userId} and kind = 'scheme' limit 1`;
  const parent = rows[0];
  if (!parent) return { ok: false, error: "Open a scheme on your own desk before writing a term lesson-plan pack." };

  let schemeBody: SchemeBody;
  try { schemeBody = JSON.parse(String(parent.body)) as SchemeBody; }
  catch { return { ok: false, error: "This scheme could not be read. Open it again and try once more." }; }

  const weekFrom = num(parent.week_from, 1);
  const weekTo = num(parent.week_to, weekFrom);
  const lessonsPerWeek = Math.max(1, Math.min(6, num(parent.lessons_per_week, 5)));
  const expected = Math.max(1, weekTo - weekFrom + 1) * lessonsPerWeek;
  if (expected > 96) return { ok: false, error: "This term has more than 96 scheduled lessons. Split the scheme into smaller packs." };
  const settings = await publicDesk(sql);
  const columns = columnsOrDefault(profile.useAdminColumns ? settings.schemeColumns : profile.schemeColumns.length ? profile.schemeColumns : settings.schemeColumns);
  const focusRows = [] as { week: number; lesson: number; strand: string; substrand: string; outcomes: string[]; inquiry: string[]; resources: string[]; experiences: string[]; competencies: string[]; values: string[]; pcis: string[]; assessment: string; homework: string; minutes: 40 | 80 }[];
  for (let weekNo = weekFrom; weekNo <= weekTo; weekNo += 1) {
    const weekly = schemeBody.weeks?.find((item) => item.week === weekNo);
    for (let lessonNo = 1; lessonNo <= lessonsPerWeek; lessonNo += 1) {
      const saved = schemeBody.lessons?.find((item) => item.week === weekNo && item.lesson === lessonNo);
      focusRows.push({
        week: weekNo,
        lesson: lessonNo,
        strand: saved?.strand || String(parent.strand),
        substrand: saved?.substrand || weekly?.lessonHints?.[lessonNo - 1] || weekly?.focus || String(parent.substrand),
        outcomes: saved?.outcomes?.length ? saved.outcomes : weekly?.outcomes ?? [],
        inquiry: saved?.inquiry?.length ? saved.inquiry : weekly?.inquiry ?? [],
        resources: saved?.resources?.length ? saved.resources : weekly?.resources ?? [],
        experiences: saved?.experiences?.length ? saved.experiences : weekly?.experiences ?? [],
        competencies: saved?.competencies?.length ? saved.competencies : weekly?.competencies ?? [],
        values: saved?.values?.length ? saved.values : weekly?.values ?? [],
        pcis: saved?.pcis?.length ? saved.pcis : weekly?.pcis ?? [],
        assessment: saved?.assessment || weekly?.assessment || "Use an oral check, observation and a short learner task aligned to the outcome.",
        homework: saved?.homework || weekly?.homework || "Practise one related example and bring questions to the next lesson.",
        minutes: saved?.minutes === 80 ? 80 : schemeBody.lessonMinutes === 80 ? 80 : 40,
      });
    }
  }

  const plans: LessonPlanPackBody["lessonPlans"] = [];
  for (const row of focusRows) {
    const input: GenInput = {
      kind: "lesson", level: String(parent.level), grade: String(parent.grade), subject: String(parent.subject),
      strand: row.strand, substrand: row.substrand, substrands: [], selectedTopics: schemeBody.topicSelections ?? [],
      term: String(parent.term), year: num(parent.year), weekFrom, weekTo, lessonsPerWeek,
      pathway: String(parent.pathway ?? ""), startFrom: String(parent.start_from ?? ""), endAt: String(parent.end_at ?? ""),
      stream: String(parent.stream ?? ""), focusWeek: row.week, focusLesson: row.lesson, depth: "full",
      includeCompetencies: row.competencies, includeValues: row.values, includePcis: row.pcis,
      columns, textbooks: schemeBody.textbooks ?? [], lessonMinutes: row.minutes, termStart: schemeBody.termStart ?? "",
      reflectionMode: schemeBody.reflectionMode ?? "blank", coverNote: "", assessmentMethods: [], showApproval: true,
      safetyNote: false, tocPhotos: [], rememberColumns: false, learners: 0, boys: 0, girls: 0,
      hodName: "", preparedOn: "", doubleLesson: 0, homeworkDay: schemeBody.homeworkDay ?? "", room: schemeBody.room ?? "",
    };
    const schemeExcerpt = JSON.stringify({ week: row.week, lesson: row.lesson, strand: row.strand, substrand: row.substrand, outcomes: row.outcomes, inquiry: row.inquiry, resources: row.resources, learningExperiences: row.experiences, assessment: row.assessment, homework: row.homework });
    const aiBrief: Brief = {
      kind: "lesson", levelLabel: levelLabel(input.level), grade: input.grade, subject: input.subject,
      strand: input.strand, substrand: input.substrand, substrands: [], term: input.term, year: input.year,
      weekFrom, weekTo, lessonsPerWeek, pathway: input.pathway, startFrom: input.startFrom, endAt: input.endAt,
      stream: input.stream, schoolName: profile.schoolName || "IAN TECH", focusWeek: row.week, focusLesson: row.lesson,
      selectedTopics: schemeBody.topicSelections ?? [], teacherGuidance: "Expand the supplied lesson focus into a complete, teachable plan. Preserve the teacher's chosen outcomes and scope; enrich activities, formative checks, differentiation, worked explanations and feedback without inventing KICD outcomes or book page references.",
      schemeExcerpt, depth: "full", textbooks: bookCoverLine(input.textbooks), assessmentMethods: [], lessonMinutes: row.minutes,
    };
    const rawLesson = await writeCbe(aiBrief, await storedAiCredentials(sql), lessonWriterKey ?? undefined);
    const lesson = normalizeLesson(rawLesson, input);
    lesson.weekLabel = `Week ${row.week} · Lesson ${row.lesson} · ${row.substrand}`;
    lesson.duration = `${row.minutes} minutes`;
    if (lesson.steps.reduce((sum, step) => sum + (step.minutes || 0), 0) !== row.minutes) {
      throw new Error(`AI lesson plan for week ${row.week}, lesson ${row.lesson} has invalid timing. No offline plan was substituted.`);
    }
    lesson.qualityReport = checkLessonCompleteness(lesson);
    plans.push({ week: row.week, lesson: row.lesson, body: lesson });
  }

  const report: LessonPlanPackBody["qualityReport"] = {
    source: "Ministry of Education, Guidelines for Implementation of Junior Secondary Education (2023), §4.8.",
    notice: "This pack expands the selected scheme into one plan for each scheduled lesson. Automated completeness is not official approval: the teacher and HOD must verify exact outcomes, pacing, learner needs and school requirements against current KICD designs.",
    checks: [
      { id: "count", label: "One plan exists for every scheduled lesson", passed: plans.length === expected, detail: `${plans.length} lesson plans generated for ${expected} scheduled lessons.` },
      { id: "outcomes", label: "Each plan carries lesson outcomes", passed: plans.every((plan) => plan.body.outcomes.length > 0), detail: "Outcomes are inherited from the selected scheme where available." },
      { id: "timing", label: "Every plan has time-balanced lesson steps", passed: plans.every((plan) => plan.body.qualityReport?.checks.find((item) => item.id === "sequencing")?.passed), detail: "Each lesson sequence is timed to its 40- or 80-minute allocation." },
      { id: "teacher-review", label: "Teacher/HOD curriculum review", passed: false, detail: "Review exact curriculum alignment, local resources, accessibility and school format before teaching." },
    ],
  };
  const pack: LessonPlanPackBody = {
    summary: `${plans.length} separate lesson plans across ${weekTo - weekFrom + 1} week(s), with ${lessonsPerWeek} scheduled lesson(s) per week. Each plan retains the selected scheme topic, outcomes, inquiry, resources, assessment and homework where provided.`,
    totalLessons: plans.length,
    lessonPlans: plans,
    qualityReport: report,
  };
  const title = `Term lesson-plan pack: ${parent.grade} ${parent.subject} — ${parent.substrand}`;
  const inserted = await sql<Raw>`
    insert into documents (
      user_id, pack_id, kind, title, level, grade, subject, strand, substrand, term, year,
      week_from, week_to, lessons_per_week, pathway, school_name, teacher_name, phone, stream,
      start_from, end_at, body
    ) values (
      ${userId}, ${String(parent.pack_id)}, 'lesson', ${title}, ${String(parent.level)}, ${String(parent.grade)},
      ${String(parent.subject)}, ${String(parent.strand)}, ${String(parent.substrand)}, ${String(parent.term)}, ${num(parent.year)},
      ${weekFrom}, ${weekTo}, ${lessonsPerWeek}, ${String(parent.pathway ?? "")}, ${profile.schoolName || "IAN TECH"},
      ${profile.displayName || "Teacher"}, ${profile.phone}, ${String(parent.stream ?? "")}, ${String(parent.start_from ?? "")},
      ${String(parent.end_at ?? "")}, ${JSON.stringify(pack)}
    ) returning id
  `;
  return { ok: true, id: num(inserted[0]?.id), lessonCount: plans.length };
}

function darajaTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}${part("month")}${part("day")}${part("hour")}${part("minute")}${part("second")}`;
}

function darajaPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  if (digits.length === 9) digits = `254${digits}`;
  if (!/^254\d{9}$/.test(digits)) throw new Error("Enter a valid Kenyan M-Pesa number, for example 0712345678.");
  return digits;
}

async function readDarajaJson<T extends Record<string, unknown>>(response: Response, operation: string): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    const rejected = response.status === 400 || response.status === 401;
    throw new Error(
      rejected
        ? "Safaricom rejected the Daraja key. On Vercel, check the production consumer key and secret, and that the Daraja app is approved for live payments."
        : `Safaricom returned an empty response while ${operation} (HTTP ${response.status}).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, " ").replace(/<[^>]*>/g, "").slice(0, 160);
    throw new Error(`Safaricom returned an invalid response while ${operation} (HTTP ${response.status}). ${preview}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Safaricom returned an unexpected response while ${operation} (HTTP ${response.status}).`);
  }
  return parsed as T;
}

async function requestDarajaToken(config: DarajaRuntime): Promise<{ host: string; token: string }> {
  const production = config.env === "production";
  const host = production ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const key = config.consumerKey;
  const secret = config.consumerSecret;
  if (!key || !secret) throw new Error("M-Pesa is not configured yet. Add the Daraja key and secret under School variables, or set them on the server.");
  const response = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  });
  const result = await readDarajaJson<{ access_token?: string; error?: string; error_description?: string }>(
    response,
    "authenticating with Daraja",
  );
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `Could not sign in to Safaricom (HTTP ${response.status}).`);
  }
  return { host, token: result.access_token };
}

function darajaShortcode(config: DarajaRuntime): string {
  return config.shortcode;
}

function darajaCallback(config: DarajaRuntime): string {
  if (config.callbackUrl.startsWith("https://")) return config.callbackUrl;
  const origin = (process.env.BETTER_AUTH_URL ?? "").trim().replace(/\/+$/, "");
  return origin.startsWith("https://") ? `${origin}/api/mpesa/callback` : "";
}

function darajaPartyB(config: DarajaRuntime, shortcode: string): string {
  return config.partyB || shortcode;
}

export async function startPackStk(
  sql: Sql,
  userId: string,
  packId: string,
  phoneRaw: string,
): Promise<{ ok: true; status: "pending"; message: string } | { ok: false; error: string }> {
  await ensureSettings(sql);
  const profile = await ensureProfile(sql, userId);
  const settings = await publicDesk(sql);
  if (await downloadsFree(sql, profile, settings)) {
    return { ok: true, status: "pending", message: "This account already downloads for free." };
  }
  const owned = await sql`select id from documents where user_id = ${userId} and pack_id = ${packId} limit 1`;
  if (!owned.length) return { ok: false, error: "That set is not on your desk." };
  const pricing = await packPricing(sql, userId, packId, settings.priceKes);
  if (pricing.priceKes <= 0) return { ok: true, status: "pending", message: "This learning-area set is free. No payment is needed." };
  if (await packPaid(sql, userId, packId)) return { ok: false, error: "This set is already paid for." };
  const config = await loadDarajaRuntime(sql);
  let phone = "";
  try {
    phone = darajaPhone(phoneRaw || profile.phone || config.defaultPhone || process.env.DEFAULT_PAYMENT_PHONE || "");
    await sql`update profiles set phone = ${phone} where user_id = ${userId}`;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Enter the M-Pesa number." };
  }
  const shortcode = darajaShortcode(config);
  const passkey = config.passkey;
  const callback = darajaCallback(config);
  if (!shortcode || !passkey || !callback.startsWith("https://")) {
    return { ok: false, error: "M-Pesa prompt is not switched on yet. Open School variables and set the Daraja shortcode, passkey and HTTPS callback." };
  }
  const active = await sql`
    update payments set status = 'revoked', error_message = 'The phone prompt expired before a PIN was entered. Send it again.'
    where user_id = ${userId} and pack_id = ${packId} and status = 'pending'
      and created_at < now() - interval '3 minutes'
  `;
  void active;
  const waiting = await sql`
    select id from payments
    where user_id = ${userId} and pack_id = ${packId} and status = 'pending' and checkout_request_id is not null
    order by id desc limit 1
  `;
  if (waiting.length) {
    return { ok: false, error: "A prompt is already waiting on that phone. Enter the PIN, or tap refresh after a minute." };
  }
  const till = darajaPartyB(config, shortcode);
  let paymentId = 0;
  try {
    const inserted = await sql<Raw>`
      insert into payments (
        user_id, pack_id, amount_kes, till_number, mpesa_code, phone, teacher_name, school_name, status
      ) values (
        ${userId}, ${packId}, ${pricing.priceKes}, ${till}, ${`INIT-${Date.now()}-${userId.slice(0, 6)}`},
        ${phone}, ${profile.displayName}, ${profile.schoolName}, 'pending'
      ) returning id
    `;
    paymentId = num(inserted[0]?.id);
    const { host, token } = await requestDarajaToken(config);
    const timestamp = darajaTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: config.transactionType || "CustomerBuyGoodsOnline",
      Amount: Math.max(1, Math.round(pricing.priceKes)),
      PartyA: phone,
      PartyB: till,
      PhoneNumber: phone,
      CallBackURL: callback,
      AccountReference: `IAN${packId}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 12),
      TransactionDesc: "IAN TECH Schemes",
    };
    const response = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await readDarajaJson<{
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
      CustomerMessage?: string;
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
    }>(response, "starting the M-Pesa prompt");
    if (!response.ok || result.ResponseCode !== "0" || !result.CheckoutRequestID) {
      throw new Error(
        result.errorMessage || result.CustomerMessage || result.ResponseDescription ||
        `Safaricom did not start the prompt (HTTP ${response.status}).`,
      );
    }
    await sql`
      update payments
      set checkout_request_id = ${result.CheckoutRequestID}, merchant_request_id = ${result.MerchantRequestID ?? ""}
      where id = ${paymentId}
    `;
    return {
      ok: true,
      status: "pending",
      message: "Check the phone. Enter the M-Pesa PIN on the Safaricom prompt. This page opens the files when Safaricom confirms.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "STK request failed";
    if (paymentId) {
      await sql`update payments set status = 'revoked', error_message = ${message} where id = ${paymentId}`;
    }
    return { ok: false, error: message };
  }
}

async function applyDarajaResult(
  sql: Sql,
  payment: Raw,
  resultCode: number,
  description: string,
  receipt: string,
  paidPhone: string,
  paidAmount: number,
): Promise<void> {
  const id = num(payment.id);
  if (payment.status === "revoked") return;
  const currentCode = String(payment.mpesa_code ?? "");
  const alreadyReal = payment.status === "paid" && !currentCode.startsWith("INIT-") && !currentCode.startsWith("STK");
  if (alreadyReal) return;
  const expectedPhone = String(payment.phone ?? "").replace(/\D/g, "");
  const amountOk = paidAmount < 0 || paidAmount === num(payment.amount_kes);
  const phoneOk = !paidPhone || paidPhone === expectedPhone;
  const code = receipt || (resultCode === 0 ? `STK${String(payment.checkout_request_id ?? id).replace(/\W/g, "").slice(-8)}` : "");
  if (resultCode === 0 && code && amountOk && phoneOk) {
    await sql`
      update payments set
        status = 'paid',
        verified = true,
        mpesa_code = ${code},
        paid_phone = ${paidPhone || expectedPhone},
        paid_amount = ${paidAmount < 0 ? num(payment.amount_kes) : paidAmount},
        result_code = 0,
        result_description = ${text(description, 300)}
      where id = ${id} and status in ('pending', 'paid')
    `;
    return;
  }
  if (resultCode === 0) return;
  await sql`
    update payments set
      status = 'revoked',
      result_code = ${resultCode},
      result_description = ${text(description, 300)},
      error_message = ${text(description || "M-Pesa did not confirm this payment.", 300)}
    where id = ${id} and status = 'pending'
  `;
}

export async function processDarajaCallback(sql: Sql, payload: unknown): Promise<void> {
  await ensureSettings(sql);
  const root = payload && typeof payload === "object" ? payload as Raw : {};
  const body = root.Body && typeof root.Body === "object" ? root.Body as Raw : {};
  const callback = body.stkCallback && typeof body.stkCallback === "object" ? body.stkCallback as Raw : {};
  const checkout = text(callback.CheckoutRequestID, 120);
  if (!checkout) return;
  const rows = await sql<Raw>`select * from payments where checkout_request_id = ${checkout} limit 1`;
  const payment = rows[0];
  if (!payment) return;
  const metadata = callback.CallbackMetadata && typeof callback.CallbackMetadata === "object" ? callback.CallbackMetadata as Raw : {};
  const items = Array.isArray(metadata.Item) ? metadata.Item as Raw[] : [];
  const values = Object.fromEntries(items.map((item) => [String(item.Name ?? ""), item.Value]));
  await applyDarajaResult(
    sql,
    payment,
    num(callback.ResultCode, -1),
    text(callback.ResultDesc, 300),
    text(values.MpesaReceiptNumber, 32).toUpperCase(),
    String(values.PhoneNumber ?? "").replace(/\D/g, ""),
    num(values.Amount, -1),
  );
}

export async function refreshPackPayment(
  sql: Sql,
  userId: string,
  packId: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  await ensureSettings(sql);
  if (await packPaid(sql, userId, packId)) return { ok: true, status: "paid" };
  const rows = await sql<Raw>`
    select * from payments
    where user_id = ${userId} and pack_id = ${packId} and status = 'pending' and checkout_request_id is not null
    order by id desc limit 1
  `;
  const payment = rows[0];
  if (!payment) return { ok: true, status: "waiting" };
  try {
    const config = await loadDarajaRuntime(sql);
    const { host, token } = await requestDarajaToken(config);
    const shortcode = darajaShortcode(config);
    const passkey = config.passkey;
    const timestamp = darajaTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const response = await fetch(`${host}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: String(payment.checkout_request_id),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await readDarajaJson<{ ResultCode?: string | number; ResultDesc?: string; ResponseDescription?: string }>(
      response,
      "checking the M-Pesa prompt",
    );
    const resultCode = num(result.ResultCode, -1);
    if (resultCode === 0 || (resultCode > 0 && resultCode !== 4999)) {
      await applyDarajaResult(sql, payment, resultCode, text(result.ResultDesc || result.ResponseDescription, 300), "", "", -1);
    }
  } catch {
    return { ok: true, status: "waiting" };
  }
  if (await packPaid(sql, userId, packId)) return { ok: true, status: "paid" };
  return { ok: true, status: "waiting" };
}

export async function payForPack(
  sql: Sql,
  userId: string,
  packId: string,
  mpesaCodeRaw: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const profile = await ensureProfile(sql, userId);
  const settings = await publicDesk(sql);
  if (await downloadsFree(sql, profile, settings)) {
    return { ok: true, status: "waived" };
  }
  const owned = await sql`
    select id from documents where user_id = ${userId} and pack_id = ${packId} limit 1
  `;
  if (!owned.length) return { ok: false, error: "That set is not on your desk." };
  if (await packPaid(sql, userId, packId)) return { ok: true, status: "paid" };
  const pricing = await packPricing(sql, userId, packId, settings.priceKes);
  if (pricing.priceKes <= 0) return { ok: true, status: "waived" };
  if (!settings.tillNumber.trim()) {
    return { ok: false, error: "The till number is not set yet. WhatsApp IAN TECH and ask for it." };
  }
  const code = mpesaCodeRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{10}$/.test(code)) {
    return { ok: false, error: "Enter the 10-character M-Pesa code from the confirmation SMS." };
  }
  if (/^(.)\1{9}$/.test(code) || code === "1234567890" || code === "ABCDEFGHIJ") {
    return { ok: false, error: "That code does not look like an M-Pesa confirmation." };
  }
  const status = settings.paymentMode === "approve" || pricing.customRule ? "pending" : "paid";
  try {
    await sql`
      insert into payments (
        user_id, pack_id, amount_kes, till_number, mpesa_code, phone, teacher_name, school_name, status
      ) values (
        ${userId}, ${packId}, ${pricing.priceKes}, ${settings.tillNumber}, ${code},
        ${profile.phone}, ${profile.displayName}, ${profile.schoolName}, ${status}
      )
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return { ok: false, error: "That M-Pesa code has already been used." };
    }
    throw err;
  }
  return { ok: true, status };
}

function mapPayment(row: Raw): PaymentRow {
  return {
    id: num(row.id),
    teacherName: String(row.teacher_name ?? ""),
    schoolName: String(row.school_name ?? ""),
    phone: String(row.phone ?? ""),
    amountKes: num(row.amount_kes),
    tillNumber: String(row.till_number ?? ""),
    mpesaCode: String(row.mpesa_code ?? ""),
    status: String(row.status ?? ""),
    packId: String(row.pack_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    verified: flag(row.verified),
    receiptNo: String(row.receipt_no ?? ""),
    itemLabel: String(row.item_label ?? ""),
    paidPhone: String(row.paid_phone ?? ""),
    paidAmount: row.paid_amount == null ? null : num(row.paid_amount),
    merchantRequestId: String(row.merchant_request_id ?? ""),
    checkoutRequestId: String(row.checkout_request_id ?? ""),
    resultCode: row.result_code == null ? null : num(row.result_code),
    resultDescription: String(row.result_description ?? ""),
    errorMessage: String(row.error_message ?? ""),
    receiptIssuedOn: String(row.receipt_issued_at ?? ""),
  };
}

export async function listMyPayments(sql: Sql, userId: string): Promise<PaymentRow[]> {
  await ensureSettings(sql);
  const rows = await sql<Raw>`
    select id, teacher_name, school_name, phone, amount_kes, till_number, mpesa_code, status, pack_id, verified,
      receipt_no, receipt_issued_at, item_label, paid_phone, paid_amount, merchant_request_id, checkout_request_id,
      result_code, result_description, error_message,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at
    from payments
    where user_id = ${userId}
    order by id desc
    limit 30
  `;
  return rows.map(mapPayment);
}

export async function adminOverview(sql: Sql, userId: string) {
  if (!(await isStaff(sql, userId))) {
    return { ok: false as const, error: "Only the admin desk can open this." };
  }
  const viewer = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  const viewerRole = viewer[0]?.role === "admin" ? "admin" as const : "deputy" as const;
  const row = await settingsRow(sql);
  const settings = {
    ...mapSettings(row),
    dailyGenLimit: num(row.daily_gen_limit, 8),
  };
  const teachers = await sql<Raw>`
    select user_id, role, display_name, email, phone, school_name,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as created_at
    from profiles
    order by created_at desc
    limit 300
  `;
  const grants = await sql<Raw>`
    select id, kind, teacher_user_id, school_name, note,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as created_at
    from grants
    order by id desc
    limit 200
  `;
  const payments = await sql<Raw>`
    select id, teacher_name, school_name, phone, amount_kes, till_number, mpesa_code, status, pack_id, verified,
      receipt_no, receipt_issued_at, item_label, paid_phone, paid_amount, merchant_request_id, checkout_request_id,
      result_code, result_description, error_message,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at
    from payments
    order by id desc
    limit 500
  `;
  const daily = await sql<Raw>`
    select to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as day,
      count(*) filter (where status = 'paid') as n,
      coalesce(sum(amount_kes) filter (where status = 'paid'), 0) as total
    from payments
    group by 1
    order by 1 desc
    limit 21
  `;
  const schools = await sql<Raw>`
    select coalesce(nullif(btrim(school_name), ''), 'School not set') as school,
      count(*) as n,
      coalesce(sum(case when status = 'paid' then amount_kes else 0 end), 0) as total
    from payments
    group by 1
    order by total desc
    limit 8
  `;
  const subjects = await sql<Raw>`
    select subject, count(*) as n from documents group by subject order by n desc limit 6
  `;
  const totals = await sql<Raw>`
    select
      count(*) filter (where status = 'paid') as paid_count,
      count(*) filter (where status = 'pending') as pending_count,
      coalesce(sum(amount_kes) filter (where status = 'paid'), 0) as paid_total
    from payments
  `;
  const docCount = await sql<Raw>`select count(*) as n from documents`;
  const audit = await sql<Raw>`
    select id, actor_id, action, target_id, detail,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at
    from admin_audit_log order by id desc limit 60
  `;
  return {
    ok: true as const,
    viewerRole,
    settings,
    teachers: teachers.map((t) => ({
      userId: String(t.user_id),
      role: String(t.role),
      displayName: String(t.display_name),
      email: String(t.email),
      phone: String(t.phone),
      schoolName: String(t.school_name),
      createdAt: String(t.created_at),
    })),
    grants: grants.map((g) => ({
      id: num(g.id),
      kind: String(g.kind),
      teacherUserId: String(g.teacher_user_id ?? ""),
      schoolName: String(g.school_name ?? ""),
      note: String(g.note ?? ""),
      createdAt: String(g.created_at),
    })),
    payments: payments.map(mapPayment),
    daily: daily.map((row) => ({
      day: String(row.day),
      count: num(row.n),
      total: num(row.total),
    })),
    schools: schools.map((s) => ({
      school: String(s.school),
      count: num(s.n),
      total: num(s.total),
    })),
    subjects: subjects.map((s) => ({ subject: String(s.subject), count: num(s.n) })),
    paidCount: num(totals[0]?.paid_count),
    pendingCount: num(totals[0]?.pending_count),
    paidTotal: num(totals[0]?.paid_total),
    teacherCount: teachers.length,
    documentCount: num(docCount[0]?.n),
    audit: audit.map((entry) => ({
      id: num(entry.id),
      actorId: String(entry.actor_id),
      action: String(entry.action),
      targetId: String(entry.target_id ?? ""),
      detail: String(entry.detail ?? ""),
      createdAt: String(entry.created_at),
    })),
  };
}

export async function saveSettings(
  sql: Sql,
  userId: string,
  input: {
    tillNumber: string;
    tillName: string;
    priceKes: number;
    whatsapp: string;
    contactName: string;
    welcome: string;
    freeForAll: boolean;
    paymentMode: "instant" | "approve";
    dailyGenLimit: number;
    schemeColumns: string[];
    defaultLessons: number;
    defaultMinutes: 40 | 80;
    defaultNoteDepth: "full" | "summary";
    defaultQuestionCount: number;
    defaultQuestionTypes: QuestionType[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the admin desk can change settings." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  const price = Math.max(0, Math.min(20000, Math.round(input.priceKes)));
  const limit = Math.max(1, Math.min(40, Math.round(input.dailyGenLimit)));
  const mode = input.paymentMode === "approve" ? "approve" : "instant";
  const whatsapp = waDigits(input.whatsapp) || "254723278526";
  await ensureSettings(sql);
  const lessonsDefault = Math.max(1, Math.min(6, Math.round(input.defaultLessons || 5)));
  const minutesDefault = input.defaultMinutes === 80 ? 80 : 40;
  const noteDepth = input.defaultNoteDepth === "summary" ? "summary" : "full";
  const questionChoices = allowedCounts(noteDepth);
  const questionCount = questionChoices.includes(Math.round(input.defaultQuestionCount))
    ? Math.round(input.defaultQuestionCount)
    : clampQuestionCount(input.defaultQuestionCount ?? 45, noteDepth);
  const allowedTypes: QuestionType[] = ["mcq", "short", "structured", "true-false", "fill-blank", "practical"];
  const questionTypes = [...new Set(input.defaultQuestionTypes.filter((type) => allowedTypes.includes(type)))];
  await sql`
    update settings set
      till_number = ${text(input.tillNumber, 20)},
      till_name = ${text(input.tillName, 60) || "IAN TECH"},
      price_kes = ${price},
      whatsapp = ${whatsapp},
      contact_name = ${text(input.contactName, 60) || "IAN TECH"},
      welcome = ${text(input.welcome, 400)},
      free_for_all = ${input.freeForAll},
      payment_mode = ${mode},
      daily_gen_limit = ${limit},
      scheme_columns = ${JSON.stringify(columnsOrDefault(input.schemeColumns))},
      default_lessons = ${lessonsDefault},
      default_minutes = ${minutesDefault},
      default_note_depth = ${noteDepth},
      default_question_count = ${questionCount},
      default_question_types = ${questionTypes.join(",") || "short"}
    where id = 1
  `;
  await auditAdminAction(sql, userId, "settings.update", "settings", `Updated desk and generation defaults; question depth ${noteDepth}, count ${questionCount}`);
  return { ok: true };
}

export async function setTeacherRole(
  sql: Sql,
  actorId: string,
  targetId: string,
  role: "admin" | "deputy" | "teacher",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, actorId))) return { ok: false, error: "Only an administrator can manage access." };
  { const gate = await requireDeskSession(sql, actorId); if (!gate.ok) return gate; }
  if (!targetId || targetId.length > 100) return { ok: false, error: "Choose a teacher account." };
  const target = await sql<Raw>`select role from profiles where user_id = ${targetId}`;
  if (!target[0]) return { ok: false, error: "That teacher account was not found." };
  const currentRole = target[0].role === "admin" ? "admin" : target[0].role === "deputy" ? "deputy" : "teacher";
  if (role === currentRole) return { ok: true };
  const owner = await sql<Raw>`select user_id from admin_bootstrap_claims where slot = 1`;
  if (owner[0] && String(owner[0].user_id) === targetId && role !== "admin") {
    return { ok: false, error: "The first administrator stays on the desk. Appoint a deputy instead." };
  }
  if (currentRole === "admin" && role !== "admin") {
    const admins = await sql<Raw>`select count(*) as n from profiles where role = 'admin'`;
    if (num(admins[0]?.n) <= 1) return { ok: false, error: "The last administrator cannot be removed. Promote another administrator first." };
  }
  await sql`update profiles set role = ${role} where user_id = ${targetId}`;
  await auditAdminAction(sql, actorId, "role.change", targetId, `${currentRole} → ${role}`);
  return { ok: true };
}

export async function changeAdminPin(
  sql: Sql,
  userId: string,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rotated = await rotateDeskKey(sql, userId, current, next);
  return rotated.ok ? { ok: true } : rotated;
}

export async function addGrant(
  sql: Sql,
  userId: string,
  input: { kind: "teacher" | "school"; teacherUserId: string; schoolName: string; note: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the admin desk can grant free downloads." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  if (input.kind === "teacher") {
    const id = input.teacherUserId.trim();
    if (!id) return { ok: false, error: "Choose a teacher." };
    const exists = await sql`select user_id from profiles where user_id = ${id}`;
    if (!exists.length) return { ok: false, error: "That teacher is not on the desk." };
    const dup = await sql`select id from grants where kind = 'teacher' and teacher_user_id = ${id}`;
    if (dup.length) return { ok: false, error: "That teacher already has free downloads." };
    await sql`
      insert into grants (kind, teacher_user_id, school_name, note, created_by)
      values ('teacher', ${id}, '', ${text(input.note, 140)}, ${userId})
    `;
    await auditAdminAction(sql, userId, "grant.teacher", id, "Granted free downloads to a teacher");
    return { ok: true };
  }
  const school = text(input.schoolName, 120);
  if (school.length < 2) return { ok: false, error: "Type the school name as teachers enter it." };
  const dup = await sql`
    select id from grants where kind = 'school' and lower(btrim(school_name)) = lower(btrim(${school}))
  `;
  if (dup.length) return { ok: false, error: "That school is already free." };
  await sql`
    insert into grants (kind, teacher_user_id, school_name, note, created_by)
    values ('school', null, ${school}, ${text(input.note, 140)}, ${userId})
  `;
  await auditAdminAction(sql, userId, "grant.school", school, "Granted free downloads to a school");
  return { ok: true };
}

export async function removeGrant(
  sql: Sql,
  userId: string,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the admin desk can change grants." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  const rows = await sql<Raw>`delete from grants where id = ${id} returning kind, teacher_user_id, school_name`;
  if (rows[0]) await auditAdminAction(sql, userId, "grant.remove", String(rows[0].teacher_user_id ?? rows[0].school_name ?? id), `Removed ${String(rows[0].kind)} grant`);
  return { ok: true };
}

export async function setPaymentStatus(
  sql: Sql,
  userId: string,
  id: number,
  status: "paid" | "revoked" | "pending",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isStaff(sql, userId))) return { ok: false, error: "Only the admin desk can change a payment." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  if (status === "paid") {
    await sql`update payments set status = 'paid', verified = true where id = ${id}`;
  } else if (status === "revoked") {
    await sql`update payments set status = 'revoked', verified = false where id = ${id}`;
  } else {
    await sql`update payments set status = 'pending', verified = false where id = ${id}`;
  }
  await auditAdminAction(sql, userId, "payment.review", String(id), `Payment status set to ${status}`);
  return { ok: true };
}

export async function clearStuckPayments(
  sql: Sql,
  userId: string,
): Promise<{ ok: true; cleared: number } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the admin desk can clear prompts." };
  { const gate = await requireDeskSession(sql, userId); if (!gate.ok) return gate; }
  const rows = await sql<Raw>`
    update payments
    set status = 'revoked', error_message = 'Cleared by the admin so the teacher can try again.'
    where status = 'pending'
    returning id
  `;
  await auditAdminAction(sql, userId, "payment.clear-stuck", "", `Cleared ${rows.length} unfinished prompt(s)`);
  return { ok: true, cleared: rows.length };
}

export async function diagnoseDesk(sql: Sql, userId: string): Promise<
  { ok: true; items: { problem: string; solution: string; fixed: boolean }[] }
  | { ok: false; error: string }
> {
  if (!(await isStaff(sql, userId))) return { ok: false, error: "Only the admin desk can run this check." };
  await ensureSettings(sql);
  const items: { problem: string; solution: string; fixed: boolean }[] = [];
  const settings = await settingsRow(sql);
  const config = await loadDarajaRuntime(sql);
  const till = String(settings.till_number ?? "").trim();
  const party = darajaPartyB(config, config.shortcode);
  if (!till && party) {
    await sql`update settings set till_number = ${party}, till_name = coalesce(nullif(till_name, ''), 'IAN TECH') where id = 1`;
    items.push({
      problem: "The till number on the desk was empty, so a teacher could not see where to pay.",
      solution: `The till is now ${party}.`,
      fixed: true,
    });
  } else if (!till) {
    items.push({
      problem: "The desk has no till number, so teachers cannot see where to pay.",
      solution: "Set the till number in Admin settings, or add the Daraja shortcode under School variables.",
      fixed: false,
    });
  }
  const expired = await sql<Raw>`
    update payments
    set status = 'revoked', error_message = 'Prompt expired. The check cleared it so the teacher can try again.'
    where status = 'pending' and created_at < now() - interval '3 minutes'
    returning id
  `;
  if (expired.length) {
    items.push({
      problem: `${expired.length} M-Pesa prompt(s) were still marked waiting after the phone prompt had expired.`,
      solution: "Those rows were closed. The teacher can tap Pay again.",
      fixed: true,
    });
  }
  try {
    await requestDarajaToken(config);
    items.push({
      problem: "M-Pesa sign-in was checked with Safaricom.",
      solution: `The live key was accepted. Prompts go to till ${party}.`,
      fixed: true,
    });
  } catch (error) {
    items.push({
      problem: error instanceof Error ? error.message : "Safaricom did not accept the Daraja key.",
      solution: "Add the Daraja consumer key and secret under School variables. Use approved production credentials for live payments.",
      fixed: false,
    });
  }
  if (!darajaCallback(config)) {
    items.push({
      problem: "No HTTPS callback is set, so Safaricom cannot report a payment back to this site.",
      solution: "Add the HTTPS callback under School variables, or set the public site address so /api/mpesa/callback can be reached.",
      fixed: false,
    });
  }
  const hostReady = Boolean(process.env.XAI_API_KEY?.trim());
  let savedKeys = 0;
  try {
    const stored = await storedAiCredentials(sql);
    savedKeys = Object.values(stored.keys).reduce((total, keys) => total + (keys?.length ?? 0), 0);
  } catch {
    savedKeys = 0;
  }
  if (!hostReady && savedKeys === 0) {
    items.push({
      problem: "No AI writer is ready. The site generator will still write documents.",
      solution: "Verify the desk key, then add a tested key under Writer keys. Until then, new documents are written by the site generator from the topics you select.",
      fixed: false,
    });
  } else if (!hostReady) {
    items.push({
      problem: "The site Grok key is missing. Saved admin keys are still used.",
      solution: `${savedKeys} saved key${savedKeys === 1 ? "" : "s"} will be tried in order. Test them under Writer keys if a document fails.`,
      fixed: true,
    });
  }
  const pending = await sql<Raw>`select count(*) as n from payments where status = 'pending'`;
  if (num(pending[0]?.n) > 0) {
    items.push({
      problem: `${num(pending[0]?.n)} payment(s) are still waiting. The teacher may not have entered the PIN yet.`,
      solution: "Ask the teacher to enter the PIN, then tap I have entered the PIN. If the prompt never arrived, clear unfinished prompts and send it again.",
      fixed: false,
    });
  }
  if (!items.length) {
    items.push({
      problem: "No fault was found.",
      solution: "Till, Safaricom sign-in and the writer key are in place. New payments will appear in the daily earnings list.",
      fixed: true,
    });
  }
  await auditAdminAction(sql, userId, "desk.diagnose", "", items.map((item) => item.problem).join(" | ").slice(0, 240));
  return { ok: true, items };
}

export async function listCalendarEvents(sql: Sql, userId: string): Promise<CalendarEvent[]> {
  const rows = await sql<Raw>`
    select id, kind, title, starts_on, ends_on, note, completed
    from academic_calendar_events
    where user_id = ${userId}
    order by starts_on asc, ends_on asc, id desc
  `;
  return rows.map(mapCalendarEvent);
}

export async function saveCalendarEvent(
  sql: Sql,
  userId: string,
  input: { id?: number; kind: CalendarEventKind; title: string; startsOn: string; endsOn: string; note: string; completed: boolean },
): Promise<{ ok: true; event: CalendarEvent } | { ok: false; error: string }> {
  const title = text(input.title, 100);
  if (title.length < 2) return { ok: false, error: "Give this date a short title." };
  if (input.endsOn < input.startsOn) return { ok: false, error: "The end date cannot come before the start date." };
  const rows = input.id
    ? await sql<Raw>`
        update academic_calendar_events
        set kind = ${input.kind}, title = ${title}, starts_on = ${input.startsOn}, ends_on = ${input.endsOn}, note = ${text(input.note, 240)}, completed = ${input.completed}
        where id = ${input.id} and user_id = ${userId}
        returning id, kind, title, starts_on, ends_on, note, completed
      `
    : await sql<Raw>`
        insert into academic_calendar_events (user_id, kind, title, starts_on, ends_on, note, completed)
        values (${userId}, ${input.kind}, ${title}, ${input.startsOn}, ${input.endsOn}, ${text(input.note, 240)}, ${input.completed})
        returning id, kind, title, starts_on, ends_on, note, completed
      `;
  if (!rows[0]) return { ok: false, error: "That calendar entry could not be found." };
  return { ok: true, event: mapCalendarEvent(rows[0]) };
}

export async function deleteCalendarEvent(sql: Sql, userId: string, id: number): Promise<{ ok: boolean }> {
  await sql`delete from academic_calendar_events where id = ${id} and user_id = ${userId}`;
  return { ok: true };
}

/* ── Favourites, duplicates and the teaching tracker ─────────────────────── */

export async function setFavorite(
  sql: Sql,
  userId: string,
  id: number,
  favorite: boolean,
): Promise<{ ok: true; favorite: boolean } | { ok: false; error: string }> {
  const rows = await sql<Raw>`
    update documents set favorite = ${favorite}
    where id = ${id} and user_id = ${userId}
    returning favorite
  `;
  if (!rows[0]) return { ok: false, error: "That document is not on your desk." };
  return { ok: true, favorite: flag(rows[0].favorite) };
}

/**
 * Copy a document — usually a whole scheme — into another term or year, or to a
 * different week range, without writing it again. The body is copied and, for a
 * scheme, the week numbers and date labels are shifted to the new range so the
 * copy is consistent on the cover and in the table.
 */
export async function duplicateDocument(
  sql: Sql,
  userId: string,
  id: number,
  options: { term?: string; year?: number; weekFrom?: number; weekTo?: number },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const rows = await sql<Raw>`select * from documents where id = ${id} and user_id = ${userId}`;
  const row = rows[0];
  if (!row) return { ok: false, error: "That document is not on your desk." };

  const term = TERMS.includes(String(options.term ?? "")) ? String(options.term) : String(row.term ?? "");
  const year = Number.isInteger(Number(options.year)) && Number(options.year) >= 2024 && Number(options.year) <= 2035
    ? Number(options.year)
    : num(row.year);
  const originalFrom = num(row.week_from, 1);
  const weekFrom = Number.isInteger(Number(options.weekFrom)) ? Number(options.weekFrom) : originalFrom;
  const weekTo = Number.isInteger(Number(options.weekTo)) ? Number(options.weekTo) : num(row.week_to, weekFrom);
  if (weekFrom < 1 || weekTo > 14 || weekTo < weekFrom) {
    return { ok: false, error: "Weeks should run from 1 to 14, and the end week cannot come first." };
  }
  if (weekTo - weekFrom + 1 > 13) return { ok: false, error: "One scheme can cover at most 13 weeks. Split the term." };

  let bodyText = String(row.body ?? "{}");
  if (row.kind === "scheme") {
    try {
      const body = JSON.parse(bodyText) as SchemeBody;
      const offset = weekFrom - originalFrom;
      if (offset !== 0) {
        body.weeks = (body.weeks ?? [])
          .map((week) => ({ ...week, week: week.week + offset }))
          .filter((week) => week.week >= weekFrom && week.week <= weekTo);
        body.lessons = (body.lessons ?? [])
          .map((lesson) => ({ ...lesson, week: lesson.week + offset }))
          .filter((lesson) => lesson.week >= weekFrom && lesson.week <= weekTo);
      }
      if (body.termStart) {
        body.lessons = (body.lessons ?? []).map((lesson) => ({
          ...lesson,
          dateLabel: weekDateLabel(body.termStart, lesson.week, weekFrom),
        }));
      }
      bodyText = JSON.stringify(body);
    } catch {
      // An unreadable body is still worth copying verbatim.
    }
  }

  const moved = term !== String(row.term ?? "") || year !== num(row.year);
  const baseTitle = String(row.title ?? "Untitled");
  const title = text(moved ? `${baseTitle} · ${term} ${year}` : `${baseTitle} (copy)`, 200);
  const packId = crypto.randomUUID();
  const inserted = await sql<Raw>`
    insert into documents (
      user_id, pack_id, kind, title, level, grade, subject, strand, substrand, term, year,
      week_from, week_to, lessons_per_week, pathway, school_name, teacher_name, phone, stream,
      start_from, end_at, body
    ) values (
      ${userId}, ${packId}, ${String(row.kind)}, ${title}, ${String(row.level ?? "")},
      ${String(row.grade ?? "")}, ${String(row.subject ?? "")}, ${String(row.strand ?? "")},
      ${String(row.substrand ?? "")}, ${term}, ${year}, ${weekFrom}, ${weekTo},
      ${num(row.lessons_per_week, 1)}, ${String(row.pathway ?? "")}, ${String(row.school_name ?? "")},
      ${String(row.teacher_name ?? "")}, ${String(row.phone ?? "")}, ${String(row.stream ?? "")},
      ${String(row.start_from ?? "")}, ${String(row.end_at ?? "")}, ${bodyText}
    )
    returning id
  `;
  return { ok: true, id: num(inserted[0]?.id) };
}

export async function listProgress(
  sql: Sql,
  userId: string,
  documentId: number,
): Promise<LessonProgress[]> {
  const rows = await sql<Raw>`
    select week, lesson, taught, reflection
    from lesson_progress
    where user_id = ${userId} and document_id = ${documentId}
    order by week asc, lesson asc
  `;
  return rows.map((row) => ({
    week: num(row.week),
    lesson: num(row.lesson),
    taught: flag(row.taught),
    reflection: String(row.reflection ?? ""),
  }));
}

export async function saveProgress(
  sql: Sql,
  userId: string,
  input: { documentId: number; week: number; lesson: number; taught: boolean; reflection: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const owns = await sql`
    select id from documents where id = ${input.documentId} and user_id = ${userId} limit 1
  `;
  if (!owns.length) return { ok: false, error: "That document is not on your desk." };
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 14) {
    return { ok: false, error: "That week is outside the scheme." };
  }
  if (!Number.isInteger(input.lesson) || input.lesson < 1 || input.lesson > 6) {
    return { ok: false, error: "That lesson is outside the scheme." };
  }
  await sql`
    insert into lesson_progress (user_id, document_id, week, lesson, taught, reflection, updated_at)
    values (${userId}, ${input.documentId}, ${input.week}, ${input.lesson}, ${input.taught}, ${text(input.reflection, 240)}, now())
    on conflict (document_id, week, lesson) do update set
      user_id = excluded.user_id,
      taught = excluded.taught,
      reflection = excluded.reflection,
      updated_at = now()
  `;
  return { ok: true };
}

/** Taught counts for every document on the desk — used by the library badges. */
export async function progressSummary(sql: Sql, userId: string): Promise<ProgressSummary[]> {
  const rows = await sql<Raw>`
    select d.id as document_id,
      (d.week_to - d.week_from + 1) * d.lessons_per_week as total,
      count(p.id) filter (where p.taught) as taught
    from documents d
    left join lesson_progress p on p.document_id = d.id and p.user_id = d.user_id
    where d.user_id = ${userId}
    group by d.id, d.week_from, d.week_to, d.lessons_per_week
    limit 500
  `;
  return rows.map((row) => ({
    documentId: num(row.document_id),
    taught: num(row.taught),
    total: Math.max(0, num(row.total)),
  }));
}


/* ══════════════════════════════════════════════════════════════════════════
 * HEADER AND FOOTER BRANDING
 *
 * Teachers asked to remove or rewrite the header and footer printed on every
 * download. That is a branding decision, so the desk owns both the default text
 * and the permission. The permission is evaluated here, from the stored settings
 * row and the stored profile — a browser cannot unlock editing by sending a
 * different flag, and a change made without permission is refused with the
 * sentence the teacher should see.
 * ══════════════════════════════════════════════════════════════════════════ */

export async function saveTeacherBranding(
  sql: Sql,
  userId: string,
  input: { headerMode: unknown; footerMode: unknown; headerText: unknown; footerText: unknown; schoolLogo: unknown },
): Promise<{ ok: true; branding: BrandingState } | { ok: false; error: string }> {
  await ensureSettings(sql);
  const profile = await ensureProfile(sql, userId);
  const settings = mapSettings(await settingsRow(sql));
  const current = resolveBranding(profile, settings);

  const headerMode = isBrandingMode(input.headerMode) ? input.headerMode : "default";
  const footerMode = isBrandingMode(input.footerMode) ? input.footerMode : "default";
  const wantsCustom = headerMode === "custom" || footerMode === "custom";
  const wantsOff = headerMode === "off" || footerMode === "off";

  if (wantsCustom && !current.canEdit) {
    return { ok: false, error: current.canRemove ? "You may hide the header and footer, but only the desk can rewrite the wording." : "The desk has not allowed you to rewrite the header or footer yet." };
  }
  if (wantsOff && !current.canRemove && !current.canEdit) {
    return { ok: false, error: current.permissionNote || "The desk requires the header and footer on downloaded documents." };
  }

  const logo = cleanLogo(input.schoolLogo);
  if (typeof input.schoolLogo === "string" && input.schoolLogo.trim() && !logo) {
    return { ok: false, error: "The logo must be a PNG, JPEG or WebP image under about 150 KB." };
  }

  const headerText = cleanBrandingText(input.headerText);
  const footerText = cleanBrandingText(input.footerText);
  await sql`
    update profiles
    set header_mode = ${headerMode},
        footer_mode = ${footerMode},
        header_text = ${wantsCustom ? headerText : ""},
        footer_text = ${wantsCustom ? footerText : ""},
        school_logo = ${logo || profile.schoolLogo}
    where user_id = ${userId}
  `;
  const rows = await sql<Raw>`select * from profiles where user_id = ${userId}`;
  return { ok: true, branding: resolveBranding(mapProfile(rows[0] ?? { user_id: userId }), settings) };
}

export async function adminSaveBranding(
  sql: Sql,
  userId: string,
  input: {
    headerText: unknown;
    footerText: unknown;
    headerDefaultOn: unknown;
    footerDefaultOn: unknown;
    teacherMayEditBranding: unknown;
    teacherMayHideBranding: unknown;
    schoolLogo: unknown;
  },
): Promise<{ ok: true; settings: PublicSettings } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only the admin desk can set branding." };
  const gate = await requireDeskSession(sql, userId);
  if (!gate.ok) return gate;

  const headerText = cleanBrandingText(input.headerText);
  const footerText = cleanBrandingText(input.footerText);
  const logo = cleanLogo(input.schoolLogo);
  await ensureSettings(sql);
  await sql`
    update settings set
      header_text = ${headerText},
      footer_text = ${footerText},
      header_default_on = ${input.headerDefaultOn === true},
      footer_default_on = ${input.footerDefaultOn === true},
      teacher_may_edit_branding = ${input.teacherMayEditBranding === true},
      teacher_may_hide_branding = ${input.teacherMayHideBranding === true},
      school_logo = ${logo}
    where id = 1
  `;
  await auditAdminAction(
    sql,
    userId,
    "branding.update",
    "settings",
    `Header ${headerText ? "set" : "cleared"} · footer ${footerText ? "set" : "cleared"} · teachers ${input.teacherMayEditBranding ? "may edit" : "may not edit"}/${input.teacherMayHideBranding ? "may hide" : "may not hide"}`,
  );
  const rows = await sql<Raw>`select * from settings where id = 1`;
  return { ok: true, settings: mapSettings(rows[0] ?? {}) };
}

/** One-teacher exception to the global branding policy. */
export async function setBrandingGrant(
  sql: Sql,
  actorId: string,
  targetId: string,
  grant: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, actorId))) return { ok: false, error: "Only an administrator can change branding permission." };
  const gate = await requireDeskSession(sql, actorId);
  if (!gate.ok) return gate;
  const value: BrandingGrant = grant === "allowed" ? "allowed" : grant === "blocked" ? "blocked" : "inherit";
  const id = text(targetId, 100);
  if (!id) return { ok: false, error: "Choose a teacher account." };
  const target = await sql`select user_id from profiles where user_id = ${id}`;
  if (!target.length) return { ok: false, error: "That teacher account was not found." };
  await sql`update profiles set branding_grant = ${value} where user_id = ${id}`;
  await auditAdminAction(sql, actorId, "branding.grant", id, `Branding permission set to ${value}`);
  return { ok: true };
}

/** The header/footer text an export should print for this teacher's document. */
export async function brandingForDocument(sql: Sql, userId: string): Promise<BrandingState> {
  const me = await loadMe(sql, userId);
  return me.branding;
}

/* ══════════════════════════════════════════════════════════════════════════
 * DESK ACCESS — hardened administrator sign-in
 *
 * Three changes from the old desk key handling:
 *   1. The key is stored as a salted scrypt hash, not plain text, and the shared
 *      starter value is gone — an unset desk has no key until one is claimed.
 *   2. Changing anything sensitive needs a step-up: the key was verified for this
 *      account within the last `desk_lock_minutes` (default 30). A stolen session
 *      cookie alone is not enough to move money or roles.
 *   3. Wrong keys are counted per account and lock the desk for 15 minutes after
 *      five attempts, with the countdown returned so the page can show it.
 * ══════════════════════════════════════════════════════════════════════════ */

const DESK_KEY_LOCK_AT = 5;
const DESK_KEY_WINDOW_MINUTES = 10;
const DESK_KEY_LOCK_MINUTES = 15;

async function hashDeskKey(secret: string): Promise<string> {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  return `s2$${salt}$${scryptSync(secret, salt, 32).toString("hex")}`;
}

async function deskKeyMatches(stored: string, secret: string): Promise<boolean> {
  if (!stored.startsWith("s2$")) return false;
  const [, salt, digest] = stored.split("$");
  if (!salt || !digest) return false;
  const { scryptSync, timingSafeEqual } = await import("node:crypto");
  const supplied = scryptSync(secret, salt, 32);
  const expected = Buffer.from(digest, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Is a desk key configured at all? (Never returns the key itself.) */
export async function deskKeyConfigured(sql: Sql): Promise<boolean> {
  await ensureSettings(sql);
  const row = await settingsRow(sql);
  return Boolean(String(row.admin_key_hash ?? "").trim() || String(row.admin_pin ?? "").trim());
}

export async function adminDeskStatus(sql: Sql, userId: string) {
  await ensureSettings(sql);
  const row = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  const role = String(row[0]?.role ?? "teacher");
  const staff = role === "admin" || role === "deputy";
  const settings = mapSettings(await settingsRow(sql));
  const attempts = await sql<Raw>`select failed_attempts, locked_until from admin_key_attempts where user_id = ${userId}`;
  const before = await sql<Raw>`select expires_at from admin_access_grants where user_id = ${userId}`;
  const currentExpiry = before[0]?.expires_at ? Date.parse(String(before[0].expires_at)) : 0;
  if (staff && currentExpiry > Date.now()) {
    const nextExpiry = rollingDeskExpiry(role).toISOString();
    await sql`update admin_access_grants set expires_at = ${nextExpiry}::timestamptz, last_seen_at = now() where user_id = ${userId} and expires_at > now()`;
  }
  const grant = await sql<Raw>`select verified_at, expires_at, sign_in_count, last_seen_at, device_hint from admin_access_grants where user_id = ${userId}`;
  const expiresAt = grant[0]?.expires_at ? new Date(String(grant[0].expires_at)).toISOString() : "";
  const lockedUntil = attempts[0]?.locked_until ? new Date(String(attempts[0].locked_until)).toISOString() : "";
  return {
    ok: true as const,
    role,
    staff,
    keySet: await deskKeyConfigured(sql),
    verified: staff && Boolean(expiresAt) && Date.parse(expiresAt) > Date.now(),
    expiresAt,
    lockedUntil,
    failedAttempts: num(attempts[0]?.failed_attempts),
    signIns: num(grant[0]?.sign_in_count),
    lastSeen: String(grant[0]?.last_seen_at ?? ""),
    deviceHint: String(grant[0]?.device_hint ?? ""),
    graceMinutes: staff ? deskWindowMs(role) / 60_000 : settings.deskLockMinutes,
    keyUpdatedAt: String((await settingsRow(sql)).admin_key_updated_at ?? ""),
  };
}

/**
 * Verify the desk key for this account and open a short step-up window.
 * Deputies may verify to review payments; only administrators get a window that
 * unlocks settings, roles and grants.
 */
export async function verifyDeskKey(
  sql: Sql,
  userId: string,
  secret: string,
  deviceHint = "",
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string; lockedUntil?: string }> {
  if (!(await isStaff(sql, userId))) return { ok: false, error: "That account is not on the admin desk." };
  await ensureSettings(sql);
  const row = await settingsRow(sql);
  const storedHash = String(row.admin_key_hash ?? "").trim();
  const legacy = String(row.admin_pin ?? "").trim();
  const supplied = String(secret ?? "").trim();
  if (!supplied) return { ok: false, error: "Type the desk key." };
  if (!storedHash && !legacy) {
    return { ok: false, error: "No desk key is set on this deployment yet. Use the initial setup credential on the Admin page to claim the desk." };
  }

  const lockRow = await sql<Raw>`select locked_until from admin_key_attempts where user_id = ${userId}`;
  const lockedUntil = lockRow[0]?.locked_until ? new Date(String(lockRow[0].locked_until)).toISOString() : "";
  if (lockedUntil && Date.parse(lockedUntil) > Date.now()) {
    return { ok: false, error: "Too many wrong desk keys. The desk is paused until the countdown ends.", lockedUntil };
  }

  const matches = storedHash ? await deskKeyMatches(storedHash, supplied) : timingSafeEqual(Buffer.from(supplied), Buffer.from(legacy));
  if (!matches) {
    await sql.query(
      `insert into admin_key_attempts (user_id, failed_attempts, window_started_at, locked_until)
       values ($1, 1, now(), null)
       on conflict (user_id) do update set
         failed_attempts = case when admin_key_attempts.window_started_at < now() - interval '${DESK_KEY_WINDOW_MINUTES} minutes' then 1 else admin_key_attempts.failed_attempts + 1 end,
         window_started_at = case when admin_key_attempts.window_started_at < now() - interval '${DESK_KEY_WINDOW_MINUTES} minutes' then now() else admin_key_attempts.window_started_at end,
         locked_until = case when admin_key_attempts.window_started_at < now() - interval '${DESK_KEY_WINDOW_MINUTES} minutes' then null
                           when admin_key_attempts.failed_attempts + 1 >= ${DESK_KEY_LOCK_AT} then now() + interval '${DESK_KEY_LOCK_MINUTES} minutes'
                           else admin_key_attempts.locked_until end`,
      [userId],
    );
    const after = await sql<Raw>`select failed_attempts, locked_until from admin_key_attempts where user_id = ${userId}`;
    const left = Math.max(0, DESK_KEY_LOCK_AT - num(after[0]?.failed_attempts));
    const stillLocked = after[0]?.locked_until ? new Date(String(after[0].locked_until)).toISOString() : "";
    return {
      ok: false,
      error: stillLocked
        ? `That is not the desk key, and it has now been locked after ${DESK_KEY_LOCK_AT} attempts. Try again in 15 minutes.`
        : `That is not the desk key. ${left} attempt${left === 1 ? "" : "s"} left before a 15 minute pause.`,
      lockedUntil: stillLocked || undefined,
    };
  }

  // First successful verification against a legacy plain-text key rehashes it,
  // so an existing deployment upgrades itself without a support call.
  if (!storedHash && legacy) {
    const fresh = await hashDeskKey(supplied);
    await sql`update settings set admin_key_hash = ${fresh}, admin_key_updated_at = now() where id = 1`;
    await auditAdminAction(sql, userId, "admin.key.hashed", "settings", "Desk key re-stored as a hash on first verified sign-in");
  }
  await sql`delete from admin_key_attempts where user_id = ${userId}`;

  const roleRow = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  const role = String(roleRow[0]?.role ?? "teacher");
  const window = deskWindowMs(role);
  const expiresAt = rollingDeskExpiry(role).toISOString();
  await sql`
    insert into admin_access_grants (user_id, verified_at, expires_at, device_hint, sign_in_count, last_seen_at)
    values (${userId}, now(), ${expiresAt}::timestamptz, ${text(deviceHint, 80)}, 1, now())
    on conflict (user_id) do update set
      verified_at = now(), expires_at = ${expiresAt}::timestamptz,
      device_hint = ${text(deviceHint, 80)},
      sign_in_count = admin_access_grants.sign_in_count + 1,
      last_seen_at = now()
  `;
  await auditAdminAction(sql, userId, "admin.access", userId, `Desk key verified; window ${window} minutes`);
  return { ok: true, expiresAt };
}

export async function revokeDeskAccess(
  sql: Sql,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isStaff(sql, userId))) return { ok: false, error: "That account is not on the admin desk." };
  await sql`delete from admin_access_grants where user_id = ${userId}`;
  await auditAdminAction(sql, userId, "admin.access.revoke", userId, "Desk session closed by the administrator");
  return { ok: true };
}

/** Gate used by every privileged desk mutation. */
async function requireDeskSession(sql: Sql, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql<Raw>`select expires_at from admin_access_grants where user_id = ${userId}`;
  const expiresAt = rows[0]?.expires_at ? Date.parse(String(rows[0].expires_at)) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    return { ok: false, error: "Confirm the desk key again before changing the desk." };
  }
  const roleRows = await sql<Raw>`select role from profiles where user_id = ${userId}`;
  const role = String(roleRows[0]?.role ?? "teacher");
  const nextExpiry = rollingDeskExpiry(role).toISOString();
  await sql`update admin_access_grants set expires_at = ${nextExpiry}::timestamptz, last_seen_at = now() where user_id = ${userId} and expires_at > now()`;
  return { ok: true };
}

/** Replace the desk key. Requires a live verified window and a strong new key. */
export async function rotateDeskKey(
  sql: Sql,
  userId: string,
  current: unknown,
  next: unknown,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (!(await isAdmin(sql, userId))) return { ok: false, error: "Only an administrator can change the desk key." };
  const verified = await verifyDeskKey(sql, userId, text(current, 64), "key rotation");
  if (!verified.ok) return { ok: false, error: verified.error };
  const fresh = String(next ?? "").trim();
  if (fresh.length < 10 || fresh.length > 64) return { ok: false, error: "A desk key needs 10 to 64 characters. Make it a phrase, not a date." };
  if (!/[0-9]/.test(fresh) || !/[A-Za-z]/.test(fresh)) return { ok: false, error: "A desk key must mix letters and numbers." };
  if (fresh.toLowerCase().includes("iantech") || fresh.toLowerCase() === "password") {
    return { ok: false, error: "The desk key cannot be the default product word. Choose something only the desk knows." };
  }
  const hashed = await hashDeskKey(fresh);
  await sql`update settings set admin_key_hash = ${hashed}, admin_pin = '', admin_key_updated_at = now() where id = 1`;
  await auditAdminAction(sql, userId, "admin.key.rotate", "settings", "Desk key replaced and hashed");
  return { ok: true, message: "Desk key changed. Give the new key to a deputy in person, never over WhatsApp." };
}

/* ══════════════════════════════════════════════════════════════════════════
 * RECEIPTS — a numbered office receipt for every till payment
 *
 * The old download repeated the M-Pesa code and nothing else, which the school
 * office could not file. A receipt now carries its own number, issued once per
 * payment and stable across every download of the same payment.
 * ══════════════════════════════════════════════════════════════════════════ */

export function receiptNumber(id: number, createdAt: string): string {
  const year = /^\d{4}/.test(createdAt) ? createdAt.slice(0, 4) : String(new Date().getFullYear());
  return `IAN/${year}/${String(id).padStart(6, "0")}`;
}

/** What one payment bought, in words the office recognises. */
async function packItems(sql: Sql, packId: string): Promise<{ label: string; items: string[] }> {
  const rows = await sql<Raw>`
    select kind, title, grade, subject, term from documents where pack_id = ${packId} order by id asc
  `;
  if (!rows.length) return { label: "Document pack", items: [] };
  const first = rows[0];
  const label = `${String(first.grade ?? "")} ${String(first.subject ?? "")} · ${String(first.term ?? "")}`.trim() || "Document pack";
  const KIND: Record<string, string> = { scheme: "Scheme of work", lesson: "Lesson plans", notes: "Lesson notes", revision: "Revision paper", exam: "Examination paper" };
  const items = rows.map((row) => `${KIND[String(row.kind)] ?? "Document"} — ${String(row.title ?? "").trim() || "untitled"}`);
  return { label, items };
}

export async function buildReceipt(
  sql: Sql,
  userId: string,
  paymentId: number,
  asAdmin = false,
): Promise<{ ok: true; receipt: ReceiptInfo } | { ok: false; error: string }> {
  await ensureSettings(sql);
  const settings = mapSettings(await settingsRow(sql));
  const owner = await sql<Raw>`select display_name, phone, school_name from profiles where user_id = ${userId}`;
  const rows = await sql<Raw>`
    select id, user_id, teacher_name, school_name, phone, amount_kes, till_number, mpesa_code, status, pack_id, verified,
      receipt_no, item_label, paid_phone, merchant_request_id, checkout_request_id,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as created_at,
      to_char(created_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as created_day
    from payments
    where id = ${paymentId} and (${asAdmin ? "true" : "false"} or user_id = ${userId})
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: "That payment is not on your desk." };
  if (!asAdmin && String(row.user_id ?? "") !== userId) return { ok: false, error: "That payment belongs to another account." };

  let receiptNo = String(row.receipt_no ?? "");
  let issuedOn = "";
  if (!receiptNo) {
    receiptNo = receiptNumber(num(row.id), String(row.created_day ?? ""));
    await sql`update payments set receipt_no = ${receiptNo}, receipt_issued_at = now() where id = ${num(row.id)}`;
  }
  let itemLabel = String(row.item_label ?? "");
  const pack = await packItems(sql, String(row.pack_id ?? ""));
  if (!itemLabel) {
    itemLabel = pack.label;
    await sql`update payments set item_label = ${itemLabel} where id = ${num(row.id)} and item_label = ''`;
  }
  issuedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return {
    ok: true,
    receipt: {
      receiptNo,
      issuedOn,
      amountKes: num(row.amount_kes),
      tillNumber: String(row.till_number ?? settings.tillNumber),
      tillName: String(settings.tillName),
      mpesaCode: String(row.mpesa_code ?? ""),
      status: String(row.status ?? ""),
      verified: flag(row.verified),
      paidBy: String(row.teacher_name ?? owner[0]?.display_name ?? ""),
      school: String(row.school_name ?? owner[0]?.school_name ?? ""),
      phone: String(row.paid_phone || row.phone || owner[0]?.phone || ""),
      contactName: settings.contactName,
      contactPhone: settings.whatsapp,
      whatsapp: settings.whatsapp,
      itemLabel,
      items: pack.items,
      merchantRequestId: String(row.merchant_request_id ?? ""),
      checkoutRequestId: String(row.checkout_request_id ?? ""),
    },
  };
}

/** Every receipt a teacher (or the desk) can hand to the office. */
export async function listReceipts(sql: Sql, userId: string, asAdmin = false): Promise<ReceiptInfo[]> {
  await ensureSettings(sql);
  const rows = await sql<Raw>`
    select id from payments
    where ${asAdmin ? "true" : "false"} or user_id = ${userId}
    order by id desc
    limit 200
  `;
  const out: ReceiptInfo[] = [];
  for (const row of rows) {
    const built = await buildReceipt(sql, userId, num(row.id), asAdmin);
    if (built.ok) out.push(built.receipt);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ASSESSMENT RECORDS — the marks book
 *
 * Competency-based assessment is a requirement, not a nice-to-have: a teacher
 * must record each learner's score per assessment and convert it to
 * Exceeding / Meeting / Approaching / Below for the report slip. Until now the
 * app could write the paper but not keep the record.
 * ══════════════════════════════════════════════════════════════════════════ */

const ASSESSMENT_KINDS: AssessmentKind[] = ["written", "oral", "practical", "project", "observation", "midterm", "endterm"];

function cleanMarks(raw: unknown, total: number): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(total, Math.round(n));
}

export async function listAssessments(sql: Sql, userId: string): Promise<AssessmentRecord[]> {
  const rows = await sql<Raw>`
    select id, title, grade, stream, subject, term, year, assessment_kind, total_marks, taught_on, note,
      to_char(updated_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD') as updated_at
    from assessment_records where user_id = ${userId} order by id desc limit 120
  `;
  const scores = await sql<Raw>`
    select s.record_id, s.roll_no, s.learner_name, s.marks, s.note
    from assessment_scores s join assessment_records r on r.id = s.record_id
    where r.user_id = ${userId}
    order by nullif(s.roll_no, '')::int nulls last, s.learner_name
  `;
  return rows.map((row) => ({
    id: num(row.id),
    title: String(row.title ?? ""),
    grade: String(row.grade ?? ""),
    stream: String(row.stream ?? ""),
    subject: String(row.subject ?? ""),
    term: String(row.term ?? ""),
    year: num(row.year),
    assessmentKind: (ASSESSMENT_KINDS.includes(String(row.assessment_kind) as AssessmentKind) ? String(row.assessment_kind) : "written") as AssessmentKind,
    totalMarks: num(row.total_marks, 100),
    taughtOn: String(row.taught_on ?? ""),
    note: String(row.note ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    learners: scores
      .filter((score) => num(score.record_id) === num(row.id))
      .map((score) => ({
        rollNo: String(score.roll_no ?? ""),
        learnerName: String(score.learner_name ?? ""),
        marks: score.marks == null ? null : num(score.marks),
        note: String(score.note ?? ""),
      })),
  }));
}

export async function saveAssessment(
  sql: Sql,
  userId: string,
  input: {
    id?: number;
    title: string;
    grade: string;
    stream: string;
    subject: string;
    term: string;
    year: number;
    assessmentKind: string;
    totalMarks: number;
    taughtOn: string;
    note: string;
    learners: { rollNo: string; learnerName: string; marks: unknown; note: string }[];
  },
): Promise<{ ok: true; record: AssessmentRecord } | { ok: false; error: string }> {
  const title = text(input.title, 90);
  if (title.length < 2) return { ok: false, error: "Name the assessment, e.g. “End of Term 2 assessment”." };
  const grade = text(input.grade, 20);
  if (!grade) return { ok: false, error: "Choose the grade." };
  const subject = text(input.subject, 60);
  if (!subject) return { ok: false, error: "Choose the learning area." };
  const total = Math.max(1, Math.min(200, Math.round(Number(input.totalMarks) || 100)));
  const kind = ASSESSMENT_KINDS.includes(input.assessmentKind as AssessmentKind) ? (input.assessmentKind as AssessmentKind) : "written";
  const learners = (Array.isArray(input.learners) ? input.learners : []).slice(0, 120);
  const clean = learners
    .map((row) => ({
      rollNo: text(row.rollNo, 12),
      learnerName: text(row.learnerName, 60),
      marks: cleanMarks(row.marks, total),
      note: text(row.note, 120),
    }))
    .filter((row) => row.learnerName.length > 1);

  const id = Number(input.id) > 0 ? Math.round(Number(input.id)) : 0;
  if (id) {
    const mine = await sql`update assessment_records set title = ${title}, grade = ${grade}, stream = ${text(input.stream, 20)}, subject = ${subject}, term = ${text(input.term, 12)}, year = ${Math.round(Number(input.year) || new Date().getFullYear())}, assessment_kind = ${kind}, total_marks = ${total}, taught_on = ${text(input.taughtOn, 12)}, note = ${text(input.note, 200)}, updated_at = now() where id = ${id} and user_id = ${userId} returning id`;
    if (!mine.length) return { ok: false, error: "That assessment record is not on your desk." };
  } else {
    const inserted = await sql<Raw>`
      insert into assessment_records (user_id, title, grade, stream, subject, term, year, assessment_kind, total_marks, taught_on, note)
      values (${userId}, ${title}, ${grade}, ${text(input.stream, 20)}, ${subject}, ${text(input.term, 12)}, ${Math.round(Number(input.year) || new Date().getFullYear())}, ${kind}, ${total}, ${text(input.taughtOn, 12)}, ${text(input.note, 200)})
      returning id
    `;
    if (!inserted.length) return { ok: false, error: "Could not open the assessment record." };
  }
  const record = id || num((await sql<Raw>`select id from assessment_records where user_id = ${userId} and title = ${title} and grade = ${grade} order by id desc limit 1`)[0]?.id);

  await sql`delete from assessment_scores where record_id = ${record}`;
  for (const learner of clean) {
    await sql`
      insert into assessment_scores (record_id, roll_no, learner_name, marks, note)
      values (${record}, ${learner.rollNo}, ${learner.learnerName}, ${learner.marks}, ${learner.note})
      on conflict (record_id, learner_name) do update set marks = excluded.marks, note = excluded.note, roll_no = excluded.roll_no
    `;
  }
  const list = await listAssessments(sql, userId);
  return { ok: true, record: list.find((entry) => entry.id === record) ?? list[0]! };
}

export async function removeAssessment(
  sql: Sql,
  userId: string,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql`delete from assessment_records where id = ${id} and user_id = ${userId} returning id`;
  if (!rows.length) return { ok: false, error: "That assessment record is not on your desk." };
  return { ok: true };
}

export type AssessmentSummaryRow = {
  subject: string;
  records: number;
  learners: number;
  assessed: number;
  average: number;
  top: number;
  levels: { exceeding: number; meeting: number; approaching: number; below: number };
};

/** Per-learning-area analysis of everything recorded — what an HOD asks to see. */
export async function assessmentSummary(sql: Sql, userId: string, filter: { grade?: string; term?: string; year?: number }): Promise<AssessmentSummaryRow[]> {
  const records = await listAssessments(sql, userId);
  const grade = text(filter.grade, 20);
  const term = text(filter.term, 12);
  const year = Number(filter.year) || 0;
  const bySubject = new Map<string, AssessmentSummaryRow & { percentages: number[] }>();
  for (const record of records) {
    if (grade && record.grade !== grade) continue;
    if (term && record.term !== term) continue;
    if (year && record.year !== year) continue;
    const row = bySubject.get(record.subject) ?? {
      subject: record.subject,
      records: 0,
      learners: 0,
      assessed: 0,
      average: 0,
      top: 0,
      levels: { exceeding: 0, meeting: 0, approaching: 0, below: 0 },
      percentages: [] as number[],
    };
    row.records += 1;
    row.learners += record.learners.length;
    for (const learner of record.learners) {
      if (learner.marks == null) continue;
      const percent = (learner.marks / Math.max(1, record.totalMarks)) * 100;
      row.assessed += 1;
      row.percentages.push(percent);
      row.levels[cbaLevel(percent).key] += 1;
      row.top = Math.max(row.top, Math.round(percent));
    }
    bySubject.set(record.subject, row);
  }
  return [...bySubject.values()]
    .map(({ percentages, ...row }) => ({
      ...row,
      average: percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : 0,
    }))
    .sort((a, b) => b.records - a.records || a.subject.localeCompare(b.subject));
}

/* ══════════════════════════════════════════════════════════════════════════
 * SAVED FILTERS — the library searches a teacher repeats every term
 * ══════════════════════════════════════════════════════════════════════════ */

export async function listSavedFilters(sql: Sql, userId: string): Promise<SavedFilter[]> {
  const rows = await sql<Raw>`
    select id, label, level, grade, subject, term, year, kind from saved_filters
    where user_id = ${userId} order by label asc limit 40
  `;
  return rows.map((row) => ({
    id: num(row.id),
    label: String(row.label ?? ""),
    level: String(row.level ?? ""),
    grade: String(row.grade ?? ""),
    subject: String(row.subject ?? ""),
    term: String(row.term ?? ""),
    year: row.year == null ? null : num(row.year),
    kind: String(row.kind ?? "all"),
  }));
}

export async function saveSavedFilter(
  sql: Sql,
  userId: string,
  input: { label: string; level: string; grade: string; subject: string; term: string; year: number | null; kind: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const label = text(input.label, 60);
  if (label.length < 2) return { ok: false, error: "Give the saved search a short name." };
  await sql`
    insert into saved_filters (user_id, label, level, grade, subject, term, year, kind)
    values (${userId}, ${label}, ${text(input.level, 20)}, ${text(input.grade, 20)}, ${text(input.subject, 60)}, ${text(input.term, 12)}, ${input.year ? Math.round(Number(input.year)) : null}, ${text(input.kind, 20)})
    on conflict (user_id, label) do update set
      level = excluded.level, grade = excluded.grade, subject = excluded.subject,
      term = excluded.term, year = excluded.year, kind = excluded.kind
  `;
  return { ok: true };
}

export async function removeSavedFilter(sql: Sql, userId: string, id: number): Promise<{ ok: true }> {
  await sql`delete from saved_filters where id = ${id} and user_id = ${userId}`;
  return { ok: true };
}

/** Header/footer tokens filled in for one document, for the preview strip. */
export function previewBranding(state: BrandingState, values: Parameters<typeof expandBrandingTokens>[1]): { header: string; footer: string } {
  return {
    header: expandBrandingTokens(state.headerMode === "off" ? "" : state.headerMode === "custom" ? state.headerText || DEFAULT_HEADER_TEXT : state.effectiveHeaderText, values),
    footer: expandBrandingTokens(state.footerMode === "off" ? "" : state.footerMode === "custom" ? state.footerText || DEFAULT_FOOTER_TEXT : state.effectiveFooterText, values),
  };
}

export const BRANDING_LIMIT = BRANDING_TEXT_LIMIT;
