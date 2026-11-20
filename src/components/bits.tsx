import type { ReactNode } from "react";

export function buttonClass(kind: "leaf" | "ink" | "clay" | "ghost" = "leaf") {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-base font-semibold transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50";
  if (kind === "ink") return `${base} bg-ink text-paper`;
  if (kind === "clay") return `${base} bg-clay text-paper`;
  if (kind === "ghost") return `${base} border border-line bg-card text-ink`;
  return `${base} bg-leaf text-paper`;
}

export const fieldClass =
  "w-full rounded-xl border border-line bg-card px-3 py-3 text-base font-normal text-ink";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      {children}
      {hint ? <span className="text-sm font-normal text-ink/70">{hint}</span> : null}
    </label>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
}
