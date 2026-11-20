import { jsPDF } from "jspdf";
import { toast } from "sonner";
import type { PaymentRow, ReceiptInfo } from "@/lib/cbe-types";
import { IAN_NAME, IAN_PHONE_DISPLAY, waLink } from "@/lib/contact";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * A receipt that spells the amount out cannot be quietly altered after it is
 * handed over, which is why Kenyan receipts carry this line.
 */
export function amountInWords(value: number, currency = "Kenya shillings"): string {
  const amount = Math.abs(Number(value) || 0);
  const cents = Math.round((amount % 1) * 100);
  const whole = Math.floor(amount);
  const belowThousand = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
      n %= 100;
      if (n) parts.push("and");
    }
    if (n >= 20) {
      const rest = n % 10;
      parts.push(rest ? `${TENS[Math.floor(n / 10)]}-${ONES[rest]}` : TENS[Math.floor(n / 10)]!);
    } else if (n > 0) {
      parts.push(ONES[n]!);
    }
    return parts.filter(Boolean).join(" ") || "zero";
  };
  const words: string[] = [];
  let left = whole;
  for (const [size, name] of [[1000000000, "billion"], [1000000, "million"], [1000, "thousand"]] as [number, string][]) {
    if (left >= size) {
      words.push(`${belowThousand(Math.floor(left / size))} ${name}`);
      left %= size;
    }
  }
  if (left || !words.length) words.push(belowThousand(left));
  // The comma keeps "five hundred, and fifty cents" from reading as "five
  // hundred and fifty cents".
  const tail = cents ? `, and ${belowThousand(cents)} cents` : "";
  const text = `${currency} ${words.filter(Boolean).join(" ")}${tail} only`.replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type ReceiptDoc = {
  header: { brand: string; title: string; receiptNo: string; issuedOn: string };
  party: { paidBy: string; school: string; phone: string; contactName: string; contactPhone: string };
  amounts: { amountKes: number; formatted: string; currency: string; inWords: string };
  itemLines: string[];
  paymentMethod: { tillNumber: string; tillName: string; mpesaCode: string; merchantRequestId: string; checkoutRequestId: string };
  footer: string[];
  status: { text: string; watermark: string };
  verificationCode: string;
};

export type PaymentRowLike = Partial<PaymentRow> & {
  id?: number | string;
  teacherName?: string;
  schoolName?: string;
  phone?: string;
  amountKes?: number;
  tillNumber?: string;
  mpesaCode?: string;
  status?: string;
  packId?: string;
  createdAt?: string;
  verified?: boolean;
  receiptNo?: string;
  itemLabel?: string;
  paidPhone?: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  receiptIssuedOn?: string;
};

const INK: [number, number, number] = [28, 49, 68];
const LEAF: [number, number, number] = [31, 107, 69];
const PALE: [number, number, number] = [244, 239, 228];
const LINE: [number, number, number] = [215, 224, 218];
const MARGIN = 14;

function value(value: unknown, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function statusText(status: string): "PAID" | "AWAITING PIN" | "CANCELLED" {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "verified" || normalized === "complete") return "PAID";
  if (normalized === "revoked" || normalized === "cancelled" || normalized === "canceled" || normalized === "failed") return "CANCELLED";
  return "AWAITING PIN";
}

function money(amount: number): string {
  return `KES ${Math.max(0, Number(amount) || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
}

function safeReceiptNo(info: ReceiptInfo): string {
  return value(info.receiptNo, `IAN-${new Date().getFullYear()}-000000`);
}

function verificationCode(info: ReceiptInfo): string {
  const source = `${safeReceiptNo(info)}${info.mpesaCode || ""}${info.checkoutRequestId || ""}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return `IAN-${hash.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

export function buildReceiptDocument(info: ReceiptInfo): ReceiptDoc {
  const status = statusText(info.status);
  return {
    header: { brand: "IAN TECH SCHEMES", title: "PAYMENT RECEIPT", receiptNo: safeReceiptNo(info), issuedOn: value(info.issuedOn) },
    party: {
      paidBy: value(info.paidBy), school: value(info.school), phone: value(info.phone),
      contactName: value(info.contactName, IAN_NAME), contactPhone: value(info.contactPhone, IAN_PHONE_DISPLAY),
    },
    amounts: { amountKes: Number(info.amountKes) || 0, formatted: money(info.amountKes), currency: "KES", inWords: amountInWords(Number(info.amountKes)) },
    itemLines: [value(info.itemLabel, "Teaching resources"), ...(info.items ?? []).filter(Boolean)],
    paymentMethod: {
      tillNumber: value(info.tillNumber), tillName: value(info.tillName), mpesaCode: value(info.mpesaCode),
      merchantRequestId: value(info.merchantRequestId), checkoutRequestId: value(info.checkoutRequestId),
    },
    footer: [
      `Covers: ${value(info.itemLabel, "IAN TECH teaching resources")}.`,
      "Documents are unlocked immediately after payment is confirmed.",
      `Support on WhatsApp: ${value(info.whatsapp, info.contactPhone || IAN_PHONE_DISPLAY)} (${waLink(info.whatsapp || info.contactPhone || IAN_PHONE_DISPLAY)})`,
      "This receipt is issued by IAN TECH and is not an official KRA or M-Pesa document.",
    ],
    status: { text: status, watermark: status },
    verificationCode: verificationCode(info),
  };
}

function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    toast.error("This download needs a browser window.");
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function drawBrand(pdf: jsPDF, width: number, colour: boolean): void {
  pdf.setFillColor(...(colour ? INK : [55, 55, 55] as [number, number, number]));
  pdf.rect(0, 0, width, 32, "F");
  pdf.setFillColor(...(colour ? LEAF : [90, 90, 90] as [number, number, number]));
  pdf.rect(0, 29, width, 3, "F");
  pdf.setDrawColor(...PALE);
  pdf.setLineWidth(0.35);
  pdf.line(14, 22, 42, 22);
  pdf.circle(47, 13, 2.5, "S");
  pdf.line(50, 13, 55, 9);
  pdf.setTextColor(...PALE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("IAN TECH SCHEMES", 14, 13);
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.text("KENYA CBE TEACHING RESOURCES", 14, 19);
}

function field(pdf: jsPDF, label: string, text: string, x: number, y: number, width?: number): void {
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8); pdf.setTextColor(90, 105, 105); pdf.text(label.toUpperCase(), x, y);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...INK);
  const lines = pdf.splitTextToSize(text, width ?? 70) as string[];
  pdf.text(lines, x, y + 4.5);
}

function drawReceiptPage(pdf: jsPDF, info: ReceiptInfo, format: "a4" | "a5", colour: boolean, includeItems: boolean, continuation = false): number {
  const doc = buildReceiptDocument(info);
  const width = pdf.internal.pageSize.getWidth(); const height = pdf.internal.pageSize.getHeight(); const printable = width - MARGIN * 2;
  drawBrand(pdf, width, colour);
  pdf.setTextColor(...INK); pdf.setFont("helvetica", "bold"); pdf.setFontSize(format === "a5" ? 13 : 16);
  pdf.text(continuation ? `Receipt ${doc.header.receiptNo} continued` : doc.header.title, MARGIN, 43);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(90, 105, 105);
  pdf.text(`RECEIPT NO. ${doc.header.receiptNo}`, width - MARGIN, 39, { align: "right" });
  pdf.text(`ISSUED ${doc.header.issuedOn}`, width - MARGIN, 44, { align: "right" });
  const statusFill: [number, number, number] = doc.status.text === "PAID" ? LEAF : doc.status.text === "CANCELLED" ? [157, 67, 54] : [191, 132, 34];
  pdf.setFillColor(...statusFill);
  pdf.roundedRect(width - MARGIN - 43, 48, 43, 9, 2, 2, "F"); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text(doc.status.text, width - MARGIN - 21.5, 54, { align: "center" });
  let y = 67;
  pdf.setTextColor(...INK); field(pdf, "Received from", doc.party.paidBy, MARGIN, y, printable * 0.46); field(pdf, "School", doc.party.school, MARGIN + printable * 0.5, y, printable * 0.5); y += 16;
  field(pdf, "Phone", doc.party.phone, MARGIN, y, printable * 0.46); field(pdf, "Issued by", `${doc.party.contactName} · ${doc.party.contactPhone}`, MARGIN + printable * 0.5, y, printable * 0.5); y += 17;
  pdf.setDrawColor(...LINE); pdf.setLineWidth(0.25); pdf.line(MARGIN, y - 6, width - MARGIN, y - 6);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(90, 105, 105); pdf.text("ITEMISED RESOURCE", MARGIN, y); pdf.text("AMOUNT", width - MARGIN, y, { align: "right" }); y += 6;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...INK);
  if (includeItems) {
    doc.itemLines.forEach((line, index) => { const wrapped = pdf.splitTextToSize(`${index === 0 ? "" : "✓  "}${line}`, printable - 24) as string[]; pdf.text(wrapped, MARGIN + (index === 0 ? 0 : 5), y); pdf.text(index === 0 ? doc.amounts.formatted : "", width - MARGIN, y, { align: "right" }); y += wrapped.length * 4.2 + 3; });
  }
  pdf.setDrawColor(...LINE); pdf.line(MARGIN, y, width - MARGIN, y); y += 7;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(90, 105, 105); pdf.text("TOTAL PAID", MARGIN, y); pdf.setFontSize(13); pdf.setTextColor(...INK); pdf.text(doc.amounts.formatted, width - MARGIN, y, { align: "right" }); y += 10;
  pdf.setFontSize(6.6); pdf.setTextColor(90, 105, 105);
  const inWords = pdf.splitTextToSize(`IN WORDS: ${doc.amounts.inWords}`, printable) as string[];
  pdf.text(inWords, MARGIN, y); y += inWords.length * 3.1 + 2;
  pdf.setFontSize(7); pdf.setTextColor(90, 105, 105); pdf.text("PAYMENT DETAILS", MARGIN, y); y += 5;
  const details = [["Till", `${doc.paymentMethod.tillName} · ${doc.paymentMethod.tillNumber}`], ["M-Pesa code", doc.paymentMethod.mpesaCode], ["Merchant request ID", doc.paymentMethod.merchantRequestId], ["Checkout request ID", doc.paymentMethod.checkoutRequestId], ["Verification code", doc.verificationCode]];
  pdf.setFontSize(8.2); details.forEach(([label, text]) => { pdf.setFont("helvetica", "bold"); pdf.setTextColor(90, 105, 105); pdf.text(label.toUpperCase(), MARGIN, y); pdf.setFont("helvetica", "normal"); pdf.setTextColor(...INK); pdf.text(text, MARGIN + 39, y); y += 5; });
  y += 3; pdf.setDrawColor(...LINE); pdf.line(MARGIN, y, width - MARGIN, y); y += 8;
  pdf.setFontSize(8); pdf.setTextColor(...INK); pdf.text("AUTHORISED CONTACT", MARGIN, y); pdf.line(MARGIN + 38, y + 1, width - MARGIN, y + 1); pdf.setFont("helvetica", "bold"); pdf.text(doc.party.contactName, MARGIN + 40, y - 1); y += 9;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.7); pdf.setTextColor(90, 105, 105);
  for (const line of doc.footer) { const wrapped = pdf.splitTextToSize(line, printable) as string[]; if (y < height - 17) { pdf.text(wrapped, MARGIN, y); y += wrapped.length * 3.3 + 1.2; } }
  pdf.setFontSize(6.5); pdf.text(`IAN TECH SCHEMES · ${doc.verificationCode} · Page ${pdf.getNumberOfPages()}`, MARGIN, height - 8);
  return y;
}

function makePdf(info: ReceiptInfo, format: "a4" | "a5", colour: boolean): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format });
  const height = pdf.internal.pageSize.getHeight();
  const doc = buildReceiptDocument(info);
  const maxItems = format === "a5" ? 6 : 13;
  if (doc.itemLines.length <= maxItems) drawReceiptPage(pdf, info, format, colour, true);
  else { drawReceiptPage(pdf, info, format, colour, true); pdf.addPage(); drawReceiptPage(pdf, info, format, colour, false, true); }
  void height;
  return pdf;
}

export function receiptFileName(info: ReceiptInfo, format: "a4" | "a5"): string {
  const safe = safeReceiptNo(info).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "IAN-receipt";
  return `${safe}-receipt.pdf`;
}

export function downloadReceiptPdf(info: ReceiptInfo, opts: { format?: "a4" | "a5"; colour?: boolean } = {}): void {
  const format = opts.format ?? "a4"; makePdf(info, format, opts.colour !== false).save(receiptFileName(info, format));
}

export function receiptFromPayment(payment: PaymentRowLike, settings: { tillName?: string; contactName?: string; whatsapp?: string } = {}): ReceiptInfo {
  return {
    receiptNo: value(payment.receiptNo, `IAN-${String(payment.id ?? payment.mpesaCode ?? "payment")}`), issuedOn: value(payment.receiptIssuedOn, value(payment.createdAt, nairobiStamp())), amountKes: Number(payment.amountKes) || 0,
    tillNumber: value(payment.tillNumber), tillName: value(settings.tillName, IAN_NAME), mpesaCode: value(payment.mpesaCode), status: value(payment.status, "pending"), verified: Boolean(payment.verified), paidBy: value(payment.teacherName, "Teacher"), school: value(payment.schoolName), phone: value(payment.paidPhone, value(payment.phone)), contactName: value(settings.contactName, IAN_NAME), contactPhone: IAN_PHONE_DISPLAY, whatsapp: value(settings.whatsapp, IAN_PHONE_DISPLAY), itemLabel: value(payment.itemLabel, value(payment.packId, "Teaching resources")), items: [], merchantRequestId: value(payment.merchantRequestId), checkoutRequestId: value(payment.checkoutRequestId),
  };
}

export function downloadReceipt(info: ReceiptInfo | PaymentRowLike, contactName?: string, _legacy?: unknown): void {
  const receipt = typeof (info as Partial<ReceiptInfo>).receiptNo === "string" && Boolean((info as Partial<ReceiptInfo>).receiptNo?.trim())
    ? info as ReceiptInfo
    : receiptFromPayment(info as PaymentRowLike, { contactName });
  downloadReceiptPdf(receipt, { format: "a4" });
}

export function receiptText(info: ReceiptInfo): string {
  const doc = buildReceiptDocument(info);
  return ["IAN TECH SCHEMES", `Receipt ${doc.header.receiptNo}`, `Status: ${doc.status.text}`, `Date: ${doc.header.issuedOn}`, `Received from: ${doc.party.paidBy}`, `School: ${doc.party.school}`, `Amount paid: ${doc.amounts.formatted}`, `In words: ${doc.amounts.inWords}`, `M-Pesa code: ${doc.paymentMethod.mpesaCode}`, `Item: ${doc.itemLines[0]}`, `Support WhatsApp: ${value(info.whatsapp, info.contactPhone || IAN_PHONE_DISPLAY)}`].join("\n");
}

export function receiptSummaryLine(info: ReceiptInfo): string {
  const doc = buildReceiptDocument(info);
  return `${doc.header.receiptNo} · ${doc.amounts.formatted} · ${doc.itemLines[0]} · ${doc.status.text}`;
}

export async function copyReceipt(info: ReceiptInfo): Promise<void> {
  try { if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(receiptText(info)); toast.success("Receipt copied."); } catch { toast.error("Could not copy the receipt. Please try again."); }
}

function canvasWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] { return text.split(/\s+/).reduce<string[]>((lines, word) => { const current = lines[lines.length - 1] || ""; const next = current ? `${current} ${word}` : word; if (ctx.measureText(next).width > maxWidth && current) lines.push(word); else if (lines.length) lines[lines.length - 1] = next; else lines.push(next); return lines; }, []); }

export async function receiptImage(info: ReceiptInfo): Promise<void> {
  if (typeof document === "undefined") { toast.error("Receipt image needs a browser window."); return; }
  const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1400; const ctx = canvas.getContext("2d");
  if (!ctx) { toast.error("This browser cannot create a receipt image."); return; }
  const doc = buildReceiptDocument(info); ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#1c3144"; ctx.fillRect(0, 0, 900, 190); ctx.fillStyle = "#1f6b45"; ctx.fillRect(0, 178, 900, 12); ctx.fillStyle = "#f4efe4"; ctx.font = "bold 40px Arial"; ctx.fillText(doc.header.brand, 54, 80); ctx.font = "22px Arial"; ctx.fillText(doc.header.title, 54, 125);
  let y = 250; const write = (label: string, text: string, bold = false) => { ctx.fillStyle = "#5a6969"; ctx.font = "bold 18px Arial"; ctx.fillText(label.toUpperCase(), 54, y); y += 28; ctx.fillStyle = "#1c3144"; ctx.font = `${bold ? "bold " : ""}25px Arial`; canvasWrap(ctx, text, 790).forEach((line) => { ctx.fillText(line, 54, y); y += 33; }); y += 18; };
  write("Receipt", `${doc.header.receiptNo} · ${doc.status.text}`, true); write("Received from", `${doc.party.paidBy} · ${doc.party.school}`); write("Amount paid", doc.amounts.formatted, true); write("In words", doc.amounts.inWords); write("M-Pesa code", doc.paymentMethod.mpesaCode); write("Item", doc.itemLines.join(" · ")); write("Verification", doc.verificationCode); ctx.strokeStyle = "#d7e0da"; ctx.beginPath(); ctx.moveTo(54, y); ctx.lineTo(846, y); ctx.stroke(); y += 45; ctx.fillStyle = "#5a6969"; ctx.font = "20px Arial"; canvasWrap(ctx, "Documents are unlocked immediately after payment is confirmed. Support on WhatsApp: " + value(info.whatsapp, IAN_PHONE_DISPLAY), 790).forEach((line) => { ctx.fillText(line, 54, y); y += 29; }); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (blob) saveBlob(blob, `${safeReceiptNo(info).replace(/[^A-Za-z0-9_-]+/g, "-")}-receipt.png`); else toast.error("Could not create the receipt image.");
}

export function printReceipt(info: ReceiptInfo): void {
  if (typeof window === "undefined") { toast.error("Printing needs a browser window."); return; }
  const win = window.open("", "_blank", "noopener,noreferrer"); if (!win) { toast.error("Printing was blocked. Allow pop-ups for this site, then try again."); return; }
  const doc = buildReceiptDocument(info); const rows = doc.itemLines.map((item, i) => `<tr><td>${i ? "✓ " : ""}${escapeHtml(item)}</td><td>${i ? "" : escapeHtml(doc.amounts.formatted)}</td></tr>`).join("");
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(doc.header.receiptNo)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#1c3144;margin:0}header{background:#1c3144;color:#f4efe4;padding:18px 22px;border-bottom:4px solid #1f6b45}h1{font-size:20px;margin:0}h2{font-size:16px;margin:22px 0 8px}p{margin:5px 0;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}table{border-collapse:collapse;width:100%;font-size:11px}td{border-bottom:1px solid #d7e0da;padding:8px 2px}td:last-child{text-align:right;font-weight:bold}.total{font-size:18px;text-align:right;margin:14px 0}.foot{color:#5a6969;font-size:9px;margin-top:28px;line-height:1.5}@media print{button{display:none}}</style></head><body><header><h1>IAN TECH SCHEMES</h1><p>PAYMENT RECEIPT · ${escapeHtml(doc.header.receiptNo)}</p></header><p><b>STATUS:</b> ${doc.status.text} · <b>ISSUED:</b> ${escapeHtml(doc.header.issuedOn)}</p><div class="grid"><p><b>RECEIVED FROM</b><br>${escapeHtml(doc.party.paidBy)}<br>${escapeHtml(doc.party.school)}<br>${escapeHtml(doc.party.phone)}</p><p><b>ISSUED BY</b><br>${escapeHtml(doc.party.contactName)}<br>${escapeHtml(doc.party.contactPhone)}</p></div><h2>ITEMISED RESOURCE</h2><table>${rows}</table><div class="total">TOTAL PAID: ${escapeHtml(doc.amounts.formatted)}</div><p><b>IN WORDS:</b> ${escapeHtml(doc.amounts.inWords)}</p><p><b>PAYMENT:</b> Till ${escapeHtml(doc.paymentMethod.tillNumber)} · M-Pesa ${escapeHtml(doc.paymentMethod.mpesaCode)} · Verification ${escapeHtml(doc.verificationCode)}</p><p class="foot">${doc.footer.map(escapeHtml).join("<br>")}</p><script>window.onload=function(){window.print()}</script></body></html>`); win.document.close();
}

function escapeHtml(text: string): string { return text.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char)); }

export async function downloadAllReceiptsPdf(infos: ReceiptInfo[]): Promise<void> {
  if (!infos.length) { toast.error("There are no receipts to download."); return; }
  const selected = infos.slice(0, 30); const pdf = makePdf(selected[0], "a4", true);
  for (const info of selected.slice(1)) { pdf.addPage(); drawReceiptPage(pdf, info, "a4", true, true); }
  if (infos.length > 30) { pdf.addPage(); const width = pdf.internal.pageSize.getWidth(); pdf.setTextColor(...INK); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("RECEIPTS NOT INCLUDED", MARGIN, 30); pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`The first 30 receipts were included. ${infos.length - 30} receipt(s) were skipped.`, MARGIN, 40); infos.slice(30).forEach((info, index) => pdf.text(`${index + 31}. ${safeReceiptNo(info)}`, MARGIN, 52 + index * 5)); }
  pdf.save("IAN-receipts-pack.pdf");
}

export function nairobiStamp(): string { return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(",", ""); }
