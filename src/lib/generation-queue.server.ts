import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import type { GenInput } from "@/lib/cbe-types";
import { generateDocument } from "@/lib/cbe.server";

type QueueRow = Record<string, unknown>;
export type GenerationJobState = "queued" | "processing" | "completed" | "failed";
export type GenerationJobView = {
  ok: true;
  job: {
    id: string;
    status: GenerationJobState;
    attempts: number;
    documentId: number | null;
    error: string;
    createdAt: string;
    updatedAt: string;
  };
};
export type GenerationJobResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function asView(row: QueueRow): GenerationJobView {
  return {
    ok: true,
    job: {
      id: String(row.id ?? ""),
      status: String(row.status ?? "queued") as GenerationJobState,
      attempts: number(row.attempts),
      documentId: row.document_id == null ? null : number(row.document_id),
      error: String(row.error_message ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
    },
  };
}

export async function enqueueDocumentGeneration(
  sql: Sql,
  userId: string,
  input: GenInput,
): Promise<GenerationJobResult> {
  const pending = await sql<QueueRow>`
    select count(*) as count
    from generation_jobs
    where user_id = ${userId} and status in ('queued', 'processing')
  `;
  if (number(pending[0]?.count) >= 3) {
    return { ok: false, error: "You already have three writings queued or running. Let one finish before adding another." };
  }
  const id = randomUUID();
  await sql`
    insert into generation_jobs (id, user_id, input)
    values (${id}, ${userId}, ${JSON.stringify(input)}::jsonb)
  `;
  return { ok: true, jobId: id };
}

export async function readGenerationJob(
  sql: Sql,
  userId: string,
  jobId: string,
): Promise<GenerationJobView | { ok: false; error: string }> {
  const rows = await sql<QueueRow>`
    select id, status, attempts, document_id, error_message, created_at, updated_at
    from generation_jobs where id = ${jobId} and user_id = ${userId} limit 1
  `;
  return rows[0] ? asView(rows[0]) : { ok: false, error: "That writing job was not found on your account." };
}

async function claimJob(sql: Sql, jobId?: string, userId?: string): Promise<QueueRow | null> {
  const rows = await sql.query<QueueRow>(
    `with candidate as (
       select id
       from generation_jobs
       where available_at <= now()
         and (status = 'queued' or (status = 'processing' and lease_expires_at < now()))
         and ($1::text is null or id = $1)
         and ($2::text is null or user_id = $2)
       order by created_at asc
       for update skip locked
       limit 1
     ), available_slot as (
       select slot_id from generation_worker_slots
       where job_id is null or lease_expires_at < now()
       order by slot_id
       for update skip locked
       limit 1
     ), reserved_slot as (
       update generation_worker_slots as slot
       set job_id = candidate.id, lease_expires_at = now() + interval '4 minutes'
       from candidate, available_slot
       where slot.slot_id = available_slot.slot_id
       returning slot.slot_id, slot.job_id
     ), claimed as (
       update generation_jobs as job
       set status = 'processing', attempts = job.attempts + 1,
           worker_slot = reserved_slot.slot_id,
           lease_expires_at = now() + interval '4 minutes',
           error_message = '', updated_at = now()
       from reserved_slot
       where job.id = reserved_slot.job_id
       returning job.id, job.user_id, job.input, job.attempts, job.max_attempts, job.worker_slot
     )
     select * from claimed`,
    [jobId ?? null, userId ?? null],
  );
  return rows[0] ?? null;
}

async function failOrRetry(sql: Sql, row: QueueRow, message: string): Promise<void> {
  const attempts = number(row.attempts);
  const maxAttempts = number(row.max_attempts, 3);
  if (attempts < maxAttempts) {
    const delaySeconds = Math.min(60, 5 * 2 ** Math.max(0, attempts - 1));
    await sql`
      update generation_jobs
      set status = 'queued', available_at = now() + (${delaySeconds} * interval '1 second'),
          lease_expires_at = null, worker_slot = null,
          error_message = ${message.slice(0, 500)}, updated_at = now()
      where id = ${String(row.id)} and status = 'processing' and attempts = ${attempts}
    `;
    return;
  }
  await sql`
    update generation_jobs
    set status = 'failed', lease_expires_at = null, worker_slot = null,
        error_message = ${message.slice(0, 500)}, updated_at = now()
    where id = ${String(row.id)} and status = 'processing' and attempts = ${attempts}
  `;
}

async function releaseWorkerSlot(sql: Sql, row: QueueRow): Promise<void> {
  if (row.worker_slot == null) return;
  await sql`
    update generation_worker_slots
    set job_id = null, lease_expires_at = null
    where slot_id = ${number(row.worker_slot)} and job_id = ${String(row.id)}
  `;
}

async function executeClaimedJob(sql: Sql, row: QueueRow): Promise<GenerationJobView | null> {
  const id = String(row.id ?? "");
  const userId = String(row.user_id ?? "");
  const attempts = number(row.attempts);
  try {
    const input = (typeof row.input === "string" ? JSON.parse(row.input) : row.input) as GenInput;
    const result = await generateDocument(sql, userId, { ...input, generationJobId: id });
    if (!result.ok) {
      await sql`
        update generation_jobs
        set status = 'failed', lease_expires_at = null, worker_slot = null,
            error_message = ${result.error.slice(0, 500)}, updated_at = now()
        where id = ${id} and status = 'processing' and attempts = ${attempts}
      `;
    } else {
      await sql`
        update generation_jobs
        set status = 'completed', document_id = ${result.id}, lease_expires_at = null,
            worker_slot = null, error_message = '', updated_at = now()
        where id = ${id} and status = 'processing' and attempts = ${attempts}
      `;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The writing worker stopped unexpectedly.";
    await failOrRetry(sql, row, message);
  }
  await releaseWorkerSlot(sql, row).catch(() => undefined);
  const rows = await sql<QueueRow>`
    select id, status, attempts, document_id, error_message, created_at, updated_at
    from generation_jobs where id = ${id} limit 1
  `;
  return rows[0] ? asView(rows[0]) : null;
}

/** Runs one requested job, scoped to its signed-in owner. */
export async function processOwnGenerationJob(
  sql: Sql,
  userId: string,
  jobId: string,
): Promise<GenerationJobView | { ok: false; error: string }> {
  const row = await claimJob(sql, jobId, userId);
  if (row) return (await executeClaimedJob(sql, row)) ?? { ok: false, error: "The writing job could not be read." };
  return readGenerationJob(sql, userId, jobId);
}

/** Claims and runs the next eligible job; used by the protected scheduled worker. */
export async function processNextGenerationJob(sql: Sql): Promise<GenerationJobView | null> {
  const row = await claimJob(sql);
  return row ? executeClaimedJob(sql, row) : null;
}
