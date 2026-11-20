import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { buttonClass } from "@/components/bits";
import { IAN_NAME, IAN_PHONE_DISPLAY, waLink } from "@/lib/contact";

type HealthCheck = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

type HealthReport = {
  ok: boolean;
  app: string;
  time: string;
  environment: string;
  commit: string | null;
  node: string;
  checks: HealthCheck[];
  database: { backend: string; ready: boolean; applied: string[]; pending: string[]; error: string | null };
  auth: { configured: boolean; emailPassword: boolean; secretSource: string };
};

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

const TONE: Record<HealthCheck["status"], { ring: string; text: string; label: string }> = {
  ok: { ring: "border-leaf/40 bg-leaf/10", text: "text-leaf", label: "OK" },
  warn: { ring: "border-gold/50 bg-gold/10", text: "text-gold", label: "Check" },
  fail: { ring: "border-clay/50 bg-clay/10", text: "text-clay", label: "Broken" },
};

function Icon({ status }: { status: HealthCheck["status"] }) {
  if (status === "ok") return <CheckCircle2 className="size-5 text-leaf" aria-hidden="true" />;
  if (status === "warn") return <AlertTriangle className="size-5 text-gold" aria-hidden="true" />;
  return <XCircle className="size-5 text-clay" aria-hidden="true" />;
}

function StatusPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/health", { headers: { accept: "application/json" } });
      const body = (await response.json()) as HealthReport;
      setReport(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The health check did not answer.");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chat = waLink("254723278526", "Hello IAN TECH, my deployment shows a problem on the status page.");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <Link to="/" className="font-display text-2xl text-ink">
        IAN TECH <span className="text-leaf">Schemes</span>
      </Link>
      <h1 className="mt-4 font-display text-4xl leading-tight">Deployment status</h1>
      <p className="mt-2 max-w-2xl text-ink/80">
        What this build can see about itself: the database it is talking to, whether the schema is up to date,
        the sign-in settings, and the writer. Useful when a Vercel deployment misbehaves.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass("leaf")} onClick={() => void load()} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          {busy ? "Checking…" : "Run the check again"}
        </button>
        <a className={buttonClass("ghost")} href="/api/health" target="_blank" rel="noreferrer">
          Raw JSON
        </a>
        <a className={buttonClass("ghost")} href={chat} target="_blank" rel="noreferrer">
          WhatsApp {IAN_NAME}
        </a>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-clay bg-card px-4 py-3 text-sm text-clay">
          {error}. The server did not answer — open the Vercel deployment logs.
        </p>
      ) : null}

      {!report && !error ? <div className="mt-6 h-40 animate-pulse rounded-xl bg-ink/10" /> : null}

      {report ? (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="text-sm text-ink/70">Environment</p>
              <p className="font-display text-2xl capitalize">{report.environment}</p>
              <p className="text-sm text-ink/70">{report.commit ? `Commit ${report.commit}` : "No commit recorded"}</p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="text-sm text-ink/70">Database</p>
              <p className="font-display text-2xl">{report.database.backend === "neon" ? "Postgres" : "PGLite"}</p>
              <p className="text-sm text-ink/70">
                {report.database.applied.length} migration{report.database.applied.length === 1 ? "" : "s"} applied
              </p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="text-sm text-ink/70">Runtime</p>
              <p className="font-display text-2xl">Node {report.node}</p>
              <p className="text-sm text-ink/70">
                {report.auth.configured ? "Sign-in on" : "Sign-in off"} · secret from {report.auth.secretSource}
              </p>
            </div>
          </section>

          <ul className="mt-5 space-y-2">
            {report.checks.map((check) => {
              const tone = TONE[check.status];
              return (
                <li key={check.id} className={`rounded-xl border px-4 py-3 ${tone.ring}`}>
                  <div className="flex items-start gap-3">
                    <Icon status={check.status} />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {check.label} <span className={`text-xs font-bold uppercase ${tone.text}`}>{tone.label}</span>
                      </p>
                      <p className="text-sm text-ink/80">{check.detail}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-sm text-ink/70">
            Checked {new Date(report.time).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} Nairobi.
            Still stuck? Call {IAN_PHONE_DISPLAY}.
          </p>
        </>
      ) : null}
    </main>
  );
}
