import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { buttonClass, fieldClass, Field, Panel } from "@/components/bits";
import { getIntegrationSettings, saveIntegrationSettings } from "@/lib/integration.functions";
import type { IntegrationPublic } from "@/lib/integration-vars.server";

export const Route = createFileRoute("/variables")({ component: VariablesPage });

function VariablesPage() {
  return (
    <AppShell>
      <VariablesBody />
    </AppShell>
  );
}

function VariablesBody() {
  const [status, setStatus] = useState<IntegrationPublic | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    darajaEnv: "sandbox",
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    shortcode: "",
    partyB: "",
    transactionType: "CustomerBuyGoodsOnline",
    callbackUrl: "",
    defaultPhone: "",
    schoolCode: "",
    nemisCode: "",
    county: "",
    subCounty: "",
    motto: "",
    databaseUrl: "",
    clearDatabaseUrl: false,
  });

  useEffect(() => {
    getIntegrationSettings()
      .then((next) => {
        setStatus(next);
        setForm((current) => ({
          ...current,
          darajaEnv: next.darajaEnv,
          shortcode: next.shortcode,
          partyB: next.partyB,
          transactionType: next.transactionType,
          callbackUrl: next.callbackUrl,
          defaultPhone: next.defaultPhone,
          schoolCode: next.schoolCode,
          nemisCode: next.nemisCode,
          county: next.county,
          subCounty: next.subCounty,
          motto: next.motto,
        }));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "School variables could not be opened."));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const result = await saveIntegrationSettings({ data: form });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved("Saved. Daraja prompts on this site now use these values. The database address, if you stored one, is kept hidden and is not used to open a second database.");
      setForm((current) => ({ ...current, consumerKey: "", consumerSecret: "", passkey: "", databaseUrl: "", clearDatabaseUrl: false }));
      const next = await getIntegrationSettings();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      <div>
        <p className="text-sm font-semibold tracking-wide text-leaf">School variables</p>
        <h1 className="font-display text-4xl">Keys and school details, saved on this site</h1>
        <p className="mt-2 max-w-3xl text-ink/80">
          Grok on this site writes the schemes and notes. You do not paste a writer key here. Daraja, the school identity, and an optional database note are saved below.
        </p>
      </div>
      <Panel>
        <h2 className="font-display text-2xl">What is already on</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>Grok: {status?.grokReady ? "ready on this host. New schemes try Grok first." : "not available on this host yet. Structured drafts still save."}</li>
          <li>Database in use: {status?.databaseBackend === "neon" ? "the host Postgres database." : "the built-in preview database. It keeps your work while this session is open."}</li>
          <li>Stored database URL: {status?.databaseUrlSaved ? "one is saved and hidden. It is a record only." : "none. The site keeps using the host database."}</li>
          <li>Daraja key: {status?.consumerKeyLast4 ? `saved, ending ${status.consumerKeyLast4}.` : "not saved yet."}</li>
        </ul>
      </Panel>
      {error ? <p className="rounded-xl border border-clay bg-card px-4 py-3 text-sm text-clay">{error}</p> : null}
      {saved ? <p className="rounded-xl border border-leaf bg-card px-4 py-3 text-sm text-leaf">{saved}</p> : null}
      <Panel>
        <h2 className="font-display text-2xl">Daraja / M-Pesa</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Environment">
            <select className={fieldClass} value={form.darajaEnv} onChange={(event) => set("darajaEnv", event.target.value)}>
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>
          <Field label="Transaction type">
            <input className={fieldClass} value={form.transactionType} onChange={(event) => set("transactionType", event.target.value)} />
          </Field>
          <Field label="Consumer key" hint={status?.consumerKeyLast4 ? `Saved key ends ${status.consumerKeyLast4}. Leave blank to keep it.` : "From the Daraja portal."}>
            <input className={fieldClass} type="password" autoComplete="off" value={form.consumerKey} onChange={(event) => set("consumerKey", event.target.value)} />
          </Field>
          <Field label="Consumer secret" hint={status?.consumerSecretLast4 ? `Saved secret ends ${status.consumerSecretLast4}.` : ""}>
            <input className={fieldClass} type="password" autoComplete="off" value={form.consumerSecret} onChange={(event) => set("consumerSecret", event.target.value)} />
          </Field>
          <Field label="Passkey" hint={status?.passkeyLast4 ? `Saved passkey ends ${status.passkeyLast4}.` : ""}>
            <input className={fieldClass} type="password" autoComplete="off" value={form.passkey} onChange={(event) => set("passkey", event.target.value)} />
          </Field>
          <Field label="Shortcode">
            <input className={fieldClass} value={form.shortcode} onChange={(event) => set("shortcode", event.target.value)} />
          </Field>
          <Field label="Party B / till">
            <input className={fieldClass} value={form.partyB} onChange={(event) => set("partyB", event.target.value)} />
          </Field>
          <Field label="Default payment phone">
            <input className={fieldClass} value={form.defaultPhone} onChange={(event) => set("defaultPhone", event.target.value)} placeholder="2547…" />
          </Field>
          <Field label="HTTPS callback" hint="Must start with https:// and point at this site's /api/mpesa/callback.">
            <input className={fieldClass} value={form.callbackUrl} onChange={(event) => set("callbackUrl", event.target.value)} placeholder="https://your-site/api/mpesa/callback" />
          </Field>
        </div>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">School identity</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="School code"><input className={fieldClass} value={form.schoolCode} onChange={(event) => set("schoolCode", event.target.value)} /></Field>
          <Field label="NEMIS code"><input className={fieldClass} value={form.nemisCode} onChange={(event) => set("nemisCode", event.target.value)} /></Field>
          <Field label="County"><input className={fieldClass} value={form.county} onChange={(event) => set("county", event.target.value)} /></Field>
          <Field label="Sub-county"><input className={fieldClass} value={form.subCounty} onChange={(event) => set("subCounty", event.target.value)} /></Field>
          <Field label="Motto"><input className={fieldClass} value={form.motto} onChange={(event) => set("motto", event.target.value)} /></Field>
        </div>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Database URL</h2>
        <p className="mt-2 text-sm text-ink/75">
          The live database is already connected by the host. A URL saved here is stored for your records and is never used to open another connection. That avoids pointing the school site at an untrusted server.
        </p>
        <div className="mt-4 grid gap-3">
          <Field label="Database URL (record only)" hint="postgresql://… — hidden after you save.">
            <input className={fieldClass} type="password" autoComplete="off" value={form.databaseUrl} onChange={(event) => set("databaseUrl", event.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.clearDatabaseUrl} onChange={(event) => set("clearDatabaseUrl", event.target.checked)} />
            Clear the stored database URL
          </label>
        </div>
      </Panel>
      <button type="submit" className={buttonClass("leaf")} disabled={busy || status?.canEdit === false}>
        {busy ? "Saving…" : "Save variables"}
      </button>
      {status && !status.canEdit ? <p className="text-sm text-ink/70">Only the school owner can change these. Ask the admin desk to save them.</p> : null}
    </form>
  );
}
