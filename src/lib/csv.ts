/**
 * Small CSV writer for the admin desk (payments, teachers) and the library.
 *
 * Excel opens a UTF-8 CSV without a BOM as garbled text, so the file starts with
 * one. Values are quoted only when they need it, and a leading `=`, `+`, `-` or
 * `@` is prefixed with an apostrophe so a phone number or a teacher-supplied
 * title cannot run as a spreadsheet formula.
 */
export type CsvValue = string | number | boolean | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** `IAN-TECH-payments-2026-11-12.csv` */
export function stampedFilename(prefix: string): string {
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  return `IAN-TECH-${prefix}-${stamp}.csv`;
}
