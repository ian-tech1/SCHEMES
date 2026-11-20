import { createFileRoute } from "@tanstack/react-router";

/** Safaricom posts the STK result here. No login. The PIN never comes to this site. */
export const Route = createFileRoute("/api/mpesa/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json();
          const { getSql } = await import("@/lib/db");
          const { processDarajaCallback } = await import("@/lib/cbe.server");
          await processDarajaCallback(await getSql(), payload);
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        } catch (error) {
          console.error("[daraja] callback failed", error);
          return Response.json({ ResultCode: 1, ResultDesc: "Callback processing failed" }, { status: 500 });
        }
      },
    },
  },
});
