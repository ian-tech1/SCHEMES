import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

async function handle(request: Request): Promise<Response> {
  try {
    return await auth.handler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});