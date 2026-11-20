import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { ColumnPicker } from "@/components/column-picker";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { listMyPayments, listReceipts, saveSchemeLayout, saveTeacherBranding, updateProfile, getWriterDesk, saveWriterKey, clearWriterKey } from "@/lib/cbe.functions";
import { DEFAULT_SCHEME_COLUMNS, columnsOrDefault } from "@/lib/scheme-format";
import type { BrandingMode, PaymentRow, ReceiptInfo } from "@/lib/cbe-types";
import { BRANDING_TEXT_LIMIT, BRANDING_TOKENS, expandBrandingTokens } from "@/lib/branding";
import { copyReceipt, downloadAllReceiptsPdf, downloadReceiptPdf, printReceipt, receiptFromPayment, receiptImage } from "@/lib/receipt";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => value || "—";

function ProfilePage() {
  return <AppShell><ProfileBody /></AppShell>;
}

function ProfileBody() {
  const { me, refresh } = useDesk();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [useAdmin, setUseAdmin] = useState(true);
  const [columns, setColumns] = useState<string[]>(DEFAULT_SCHEME_COLUMNS);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptInfo[]>([]);
  const [branding, setBranding] = useState(me?.branding ?? null);
  const [headerMode, setHeaderMode] = useState<BrandingMode>(me?.branding.headerMode ?? "default");
  const [footerMode, setFooterMode] = useState<BrandingMode>(me?.branding.footerMode ?? "default");
  const [headerText, setHeaderText] = useState(me?.branding.headerText ?? "");
  const [footerText, setFooterText] = useState(me?.branding.footerText ?? "");
  const [schoolLogo, setSchoolLogo] = useState(me?.branding.logoDataUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [writerKey, setWriterKey] = useState("");
  const [writerBusy, setWriterBusy] = useState(false);
  const [writer, setWriter] = useState<{ active: boolean; hint: string; usedToday: number; limit: number | null } | null>(null);

  useEffect(() => {
    if (!me) return;
    setName(me.profile.displayName);
    setPhone(me.profile.phone);
    setSchool(me.profile.schoolName);
    setUseAdmin(me.profile.useAdminColumns);
    setColumns(me.profile.useAdminColumns ? columnsOrDefault(me.settings.schemeColumns) : columnsOrDefault(me.profile.schemeColumns));
    setBranding(me.branding);
    setHeaderMode(me.branding.headerMode);
    setFooterMode(me.branding.footerMode);
    setHeaderText(me.branding.headerText);
    setFooterText(me.branding.footerText);
    setSchoolLogo(me.branding.logoDataUrl);
  }, [me]);

  useEffect(() => {
    let active = true;
    async function loadReceipts() {
      const paymentRows = await listMyPayments().catch(() => [] as PaymentRow[]);
      if (!active) return;
      setPayments(paymentRows);
      try {
        const next = await listReceipts({ data: {} });
        if (active) setReceipts(next);
      } catch {
        if (active && me) setReceipts(paymentRows.map((payment) => receiptFromPayment(payment, { tillName: me.settings.tillName, contactName: me.settings.contactName, whatsapp: me.settings.whatsapp })));
      }
    }
    void loadReceipts();
    void getWriterDesk().then(setWriter).catch(() => setWriter(null));
    return () => { active = false; };
  }, [me]);

  if (!me) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await updateProfile({ data: { displayName: name, phone, schoolName: school } });
      if (!result.ok) toast.error(result.error);
      else { toast.success("Profile saved."); await refresh(); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "The profile could not be saved."); }
    setBusy(false);
  }

  async function saveBranding() {
    setBrandingBusy(true);
    try {
      const result = await saveTeacherBranding({ data: { headerMode, footerMode, headerText, footerText, schoolLogo } });
      if (!result.ok) toast.error(result.error);
      else { setBranding(result.branding); setHeaderMode(result.branding.headerMode); setFooterMode(result.branding.footerMode); setHeaderText(result.branding.headerText); setFooterText(result.branding.footerText); setSchoolLogo(result.branding.logoDataUrl); toast.success("Saved. Your documents will print like this."); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "The document settings could not be saved."); }
    setBrandingBusy(false);
  }

  function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { toast.error("Choose a PNG, JPEG or WebP image for your school logo."); return; }
    if (file.size > 150 * 1024) { toast.error("That logo is too large. Choose an image under about 150 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setSchoolLogo(reader.result);
      else toast.error("The logo could not be read. Please try another image.");
    };
    reader.onerror = () => toast.error("The logo could not be read. Please try another image.");
    reader.readAsDataURL(file);
  }

  const previewValues = { schoolName: school || me.profile.schoolName, teacherName: name || me.profile.displayName, grade: "Grade 5", subject: "Learning area", term: "Term 1", year: new Date().getFullYear() };
  const resolvedHeader = headerMode === "off" ? "" : expandBrandingTokens(headerMode === "custom" ? headerText : branding?.effectiveHeaderText ?? me.settings.headerText, previewValues);
  const resolvedFooter = footerMode === "off" ? "" : expandBrandingTokens(footerMode === "custom" ? footerText : branding?.effectiveFooterText ?? me.settings.footerText, previewValues);
  const paidReceipts = receipts.filter((receipt) => receipt.status.toLowerCase() === "paid" || receipt.verified);
  const receiptForPaymentCount = payments.filter((payment) => payment.status.toLowerCase() === "pending").length;

  return (
    <div className="space-y-5">
      <div><h1 className="font-display text-4xl">Your profile</h1><p className="mt-1 text-ink/75">Keep your teacher details, document style, and receipts ready in one place.</p></div>

      <Panel className="space-y-4">
        <div><h2 className="font-display text-2xl" aria-level={2}>My details</h2><p className="mt-1 text-sm text-ink/75">These details appear on your account and help us reach you when a payment needs attention.</p></div>
        <p className="text-sm text-ink/75">Email on this account: {me.profile.email || "added when you sign in"}.</p>
        <form onSubmit={save} className="grid max-w-xl gap-3">
          <Field label="Name on the cover"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="School"><input className={fieldClass} value={school} onChange={(e) => setSchool(e.target.value)} required /></Field>
          <Field label="Phone" hint={phone.replace(/\D/g, "").length >= 9 ? "This can receive the M-Pesa prompt." : "Use 07… or +254… so the prompt can reach the phone."}><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></Field>
          <button type="submit" className={buttonClass("leaf")} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
      </Panel>

      <Panel className="space-y-3">
        <div>
          <h2 className="font-display text-2xl">Your own Grok allowance</h2>
          <p className="mt-1 text-sm text-ink/75">Signing up here does not open a Grok account for you. If you want writing to use your own free xAI allowance instead of the shared school key, create an xAI account yourself and paste the key. It stays on the server and is used only when you write. Remove it any time.</p>
        </div>
        <p className="text-sm text-ink/75">{!writer ? "Checking today's allowance…" : writer.active ? `Personal key saved (${writer.hint}). Today's writings are not counted against the shared school allowance.` : writer.limit == null ? "This account has no daily cap on the shared school key." : `Shared school key: ${writer.usedToday} of ${writer.limit} writings used today.`}</p>
        <label className="block text-sm font-semibold">xAI API key
          <input className={`${fieldClass} mt-1`} type="password" autoComplete="off" value={writerKey} onChange={(event) => setWriterKey(event.target.value)} placeholder="xai-…" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("leaf")} disabled={writerBusy || writerKey.trim().length < 20} onClick={() => {
            setWriterBusy(true);
            void saveWriterKey({ data: { apiKey: writerKey } }).then(async (result) => {
              if (!result.ok) toast.error(result.error);
              else {
                setWriterKey("");
                toast.success("Personal key saved. Your next documents use your own Grok allowance.");
                setWriter(await getWriterDesk());
              }
            }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "The key could not be saved.")).finally(() => setWriterBusy(false));
          }}>{writerBusy ? "Checking key…" : "Save my key"}</button>
          {writer?.active ? <button type="button" className={buttonClass("ghost")} disabled={writerBusy} onClick={() => {
            setWriterBusy(true);
            void clearWriterKey().then(async () => {
              toast.success("Personal key removed. Writing uses the shared school allowance again.");
              setWriter(await getWriterDesk());
            }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "The key could not be removed.")).finally(() => setWriterBusy(false));
          }}>Remove personal key</button> : null}
        </div>
      </Panel>

      <Panel className="space-y-4">
        <div><h2 className="font-display text-2xl" aria-level={2}>Writing defaults</h2><p className="mt-1 text-sm text-ink/75">Choose the table columns you normally want, while keeping the desk’s sensible defaults when you prefer.</p></div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={useAdmin} onChange={(e) => setUseAdmin(e.target.checked)} />Use the admin’s default table</label>
        <ColumnPicker value={useAdmin ? columnsOrDefault(me.settings.schemeColumns) : columns} onChange={setColumns} disabled={useAdmin} />
        <button type="button" className={buttonClass("ink")} onClick={() => { void saveSchemeLayout({ data: { useAdminColumns: useAdmin, schemeColumns: columns } }).then(async (result) => { if (!result.ok) toast.error(result.error); else { toast.success("Scheme table saved."); await refresh(); } }); }}>Save my table</button>
      </Panel>

      <Panel className="space-y-4">
        <div><h2 className="font-display text-2xl" aria-level={2}>Document header and footer</h2><p className="mt-1 text-sm text-ink/75">Choose how the small lines on your downloaded documents should look, if the desk has given you permission.</p></div>
        {branding?.permissionNote ? <p className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink/75">{branding.permissionNote}</p> : null}
        <BrandingChoice label="Header" mode={headerMode} setMode={setHeaderMode} canEdit={branding?.canEdit ?? false} canRemove={branding?.canRemove ?? false} />
        {headerMode === "custom" && branding?.canEdit ? <Field label="Your header wording" hint={`${headerText.length}/${BRANDING_TEXT_LIMIT} characters`}><input className={fieldClass} maxLength={BRANDING_TEXT_LIMIT} value={headerText} onChange={(e) => setHeaderText(e.target.value)} /></Field> : null}
        <BrandingChoice label="Footer" mode={footerMode} setMode={setFooterMode} canEdit={branding?.canEdit ?? false} canRemove={branding?.canRemove ?? false} />
        {footerMode === "custom" && branding?.canEdit ? <Field label="Your footer wording" hint={`${footerText.length}/${BRANDING_TEXT_LIMIT} characters`}><input className={fieldClass} maxLength={BRANDING_TEXT_LIMIT} value={footerText} onChange={(e) => setFooterText(e.target.value)} /></Field> : null}
        <p className="text-sm text-ink/70">Live tokens: {BRANDING_TOKENS.map(({ token }) => token).join(", ")}. They are filled in when the document is printed.</p>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="School logo" hint="PNG, JPEG or WebP under about 150 KB"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} className={fieldClass} /></Field>{schoolLogo ? <div className="flex items-end gap-2"><img src={schoolLogo} alt="School logo preview" className="h-16 w-24 rounded-lg border border-line bg-paper object-contain p-1" /><button type="button" className={buttonClass("ghost")} onClick={() => setSchoolLogo("")}>Remove logo</button></div> : null}</div>
        <div className="rounded-xl border border-line bg-paper p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Page preview</p><div className="space-y-5 rounded-lg border border-line bg-card p-4 text-center text-sm text-ink">{resolvedHeader ? <p className="border-b border-line pb-3">{resolvedHeader}</p> : <p className="text-ink/50">No header line</p>}{schoolLogo ? <img src={schoolLogo} alt="" className="mx-auto h-10 max-w-28 object-contain" /> : null}{resolvedFooter ? <p className="border-t border-line pt-3 text-ink/75">{resolvedFooter}</p> : <p className="text-ink/50">No footer line</p>}</div></div>
        <button type="button" className={buttonClass("leaf")} onClick={() => void saveBranding()} disabled={brandingBusy}>{brandingBusy ? "Saving…" : "Save document settings"}</button>
      </Panel>

      <Panel className="space-y-4">
        <div><h2 className="font-display text-2xl" aria-level={2}>My receipts</h2><p className="mt-1 text-sm text-ink/75">Download, print, or share a clear record for every payment made on your teaching resources.</p></div>
        <p className="text-sm text-ink/75">Paid {money(paidReceipts.reduce((sum, receipt) => sum + receipt.amountKes, 0))}. {receiptForPaymentCount} still waiting for a PIN.</p>
        <button type="button" className={buttonClass("ink")} disabled={!paidReceipts.length} title={!paidReceipts.length ? "A receipt pack is available after a payment is verified." : undefined} onClick={() => void downloadAllReceiptsPdf(paidReceipts)}>Download all receipts (one PDF)</button>
        {!paidReceipts.length && receiptForPaymentCount ? <p className="text-sm text-ink/70">Your receipt is issued once the payment is verified.</p> : null}
        {!receipts.length ? <p className="text-sm text-ink/70">No receipts yet.</p> : null}
        <ul className="space-y-3 text-sm">{receipts.map((receipt) => <li key={`${receipt.receiptNo}-${receipt.checkoutRequestId}`} className="space-y-2 rounded-xl bg-paper p-3"><div className="flex flex-wrap items-start justify-between gap-2"><span><strong>{receipt.receiptNo}</strong><br />{receipt.itemLabel} · {money(receipt.amountKes)}<br />{dateLabel(receipt.issuedOn)} · {receipt.status}{receipt.verified ? " · checked" : ""}</span><span className="flex flex-wrap gap-2"><button type="button" className="font-semibold text-leaf" onClick={() => downloadReceiptPdf(receipt)}>PDF</button><button type="button" className="font-semibold text-leaf" onClick={() => downloadReceiptPdf(receipt, { format: "a5" })}>A5</button><button type="button" className="font-semibold text-leaf" onClick={() => printReceipt(receipt)}>Print</button><button type="button" className="font-semibold text-leaf" onClick={() => void copyReceipt(receipt)}>Share as text</button><button type="button" className="font-semibold text-leaf" onClick={() => void receiptImage(receipt)}>WhatsApp image</button></span></div></li>)}</ul>
      </Panel>

      <Panel className="space-y-3"><div><h2 className="font-display text-2xl" aria-level={2}>Other</h2><p className="mt-1 text-sm text-ink/75">Your account controls and desk links stay available in the top bar, including WhatsApp, theme, and sign out.</p></div><p className="text-sm text-ink/70">For help with access or branding permission, contact the desk through WhatsApp.</p></Panel>
    </div>
  );
}

function BrandingChoice({ label, mode, setMode, canEdit, canRemove }: { label: string; mode: BrandingMode; setMode: (mode: BrandingMode) => void; canEdit: boolean; canRemove: boolean }) {
  const options: { value: BrandingMode; label: string; disabled: boolean }[] = [{ value: "default", label: "Keep the standard line", disabled: false }, { value: "custom", label: "Use my own wording", disabled: !canEdit }, { value: "off", label: "Remove it", disabled: !canRemove }];
  return <fieldset className="space-y-2"><legend className="text-sm font-semibold">{label}</legend><div className="grid gap-2 sm:grid-cols-3">{options.map((option) => <label key={option.value} className={`flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm ${option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><input type="radio" name={label} value={option.value} checked={mode === option.value} disabled={option.disabled} onChange={() => setMode(option.value)} />{option.label}</label>)}</div></fieldset>;
}
