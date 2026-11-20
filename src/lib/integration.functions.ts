import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { IntegrationInput } from "@/lib/integration-vars.server";

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

export const getIntegrationSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { dbSource, getSql } = await import("@/lib/db");
    const { integrationStatus } = await import("@/lib/integration-vars.server");
    return integrationStatus(await getSql(), context.userId, dbSource);
  });

export const saveIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown): IntegrationInput => {
    const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return {
      darajaEnv: clip(raw.darajaEnv, 20),
      consumerKey: clip(raw.consumerKey, 256),
      consumerSecret: clip(raw.consumerSecret, 256),
      passkey: clip(raw.passkey, 256),
      shortcode: clip(raw.shortcode, 20),
      partyB: clip(raw.partyB, 20),
      transactionType: clip(raw.transactionType, 40),
      callbackUrl: clip(raw.callbackUrl, 300),
      defaultPhone: clip(raw.defaultPhone, 20),
      schoolCode: clip(raw.schoolCode, 40),
      nemisCode: clip(raw.nemisCode, 40),
      county: clip(raw.county, 60),
      subCounty: clip(raw.subCounty, 60),
      motto: clip(raw.motto, 160),
      databaseUrl: clip(raw.databaseUrl, 500),
      clearDatabaseUrl: raw.clearDatabaseUrl === true,
    };
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { saveIntegration } = await import("@/lib/integration-vars.server");
    return saveIntegration(await getSql(), context.userId, data);
  });
