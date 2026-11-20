import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/health — deployment self-check.
 *
 * 200 when every check passes or only warns; 503 when something is broken
 * (database unreachable, migrations failed). Safe to point an uptime monitor
 * at, and it is what the `/status` page reads.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { healthReport } = await import("@/lib/health.server");
        const report = await healthReport();
        return Response.json(report, {
          status: report.ok ? 200 : 503,
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
