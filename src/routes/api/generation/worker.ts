import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization") ?? "";
  if (!secret || !provided.startsWith("Bearer ")) return false;
  const actual = Buffer.from(provided.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const Route = createFileRoute("/api/generation/worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) {
          return Response.json({ ok: false, error: "Worker authorization failed." }, { status: 401, headers: { "cache-control": "no-store" } });
        }
        try {
          const [{ getSql }, { processNextGenerationJob }] = await Promise.all([
            import("@/lib/db"),
            import("@/lib/generation-queue.server"),
          ]);
          const job = await processNextGenerationJob(await getSql());
          return Response.json({ ok: true, job }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Generation worker failed.";
          return Response.json({ ok: false, error: message.slice(0, 300) }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
