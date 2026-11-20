import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { CopyPlus, Star } from "lucide-react";
import { useDesk } from "@/components/shell";
import { AiUsageNotice } from "@/components/ai-usage-notice";
import { DocView } from "@/components/doc-view";
import { buttonClass, fieldClass, Panel } from "@/components/bits";
import { deleteDocument, duplicateDocument, generateLessonPlanPack, getDocument, refreshPackPayment, setFavorite, startPackStk } from "@/lib/cbe.functions";
import { generateDocumentQueued } from "@/lib/generation-queue";
import { TERMS } from "@/lib/curriculum";
import { downloadDocument, type ExportDoc } from "@/lib/export-docs";
import { waLink } from "@/lib/contact";

export const Route = createFileRoute("/library/$id")({ component: DocPage });

type Loaded = Awaited<ReturnType<typeof getDocument>>;

function DocPage() {
  return <DocBody />;
}

function DocBody() {
  const { id } = Route.useParams();
  const { me } = useDesk();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [stkSent, setStkSent] = useState(false);
  const [autoSent, setAutoSent] = useState(false);
  const [busy, setBusy] = useState("");
  const [queueProgress, setQueueProgress] = useState("");
  const [week, setWeek] = useState(1);
  const [lessonNo, setLessonNo] = useState(1);
  const [questions, setQuestions] = useState(20);
  const [depth, setDepth] = useState<"full" | "summary">("full");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTerm, setCopyTerm] = useState("Term 2");
  const [copyYear, setCopyYear] = useState(new Date().getFullYear());

  async function load() {
    const result = await getDocument({ data: Number(id) });
    setData(result);
    if (result.ok) {
      setWeek(result.doc.weekFrom);
      setCopyTerm(result.doc.term === "Term 1" ? "Term 2" : result.doc.term === "Term 2" ? "Term 3" : "Term 1");
      setCopyYear(result.doc.term === "Term 3" ? result.doc.year + 1 : result.doc.year);
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not open this file."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (autoSent || stkSent || !data || !data.ok || !data.doc.redacted) return;
    const saved = me?.profile.phone?.trim();
    if (!saved) return;
    setAutoSent(true);
    setStkSent(true);
    void startPackStk({ data: { packId: data.doc.packId, phone: saved } }).then((result) => {
      if (!result.ok) {
        setStkSent(false);
        toast.error(result.error);
        return;
      }
      toast.success("M-Pesa prompt sent to the phone on your profile. Enter the PIN on the Safaricom screen.");
    }).catch(() => setStkSent(false));
  }, [autoSent, stkSent, data, me]);

  useEffect(() => {
    if (!stkSent) return;
    const timer = window.setInterval(() => {
      const packId = data && data.ok ? data.doc.packId : "";
      if (!packId) return;
      void refreshPackPayment({ data: { packId } }).then(async (result) => {
        if (!result.ok || result.status !== "paid") return;
        toast.success("Safaricom confirmed the payment. The files are open.");
        setStkSent(false);
        const next = await getDocument({ data: Number(id) });
        setData(next);
      }).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [stkSent, id, data]);

  if (error) return <p className="text-clay">{error}</p>;
  if (!data || !me) return <div className="h-40 animate-pulse rounded-xl bg-ink/10" />;
  if (!data.ok) return <p className="text-clay">{data.error}</p>;

  const doc = data.doc;
  const priceKes = doc.priceKes;
  const tillNumber = data.settings.tillNumber;
  const contactName = data.settings.contactName;
  const weeks: number[] = [];
  for (let n = doc.weekFrom; n <= doc.weekTo; n += 1) weeks.push(n);

  async function pay() {
    setBusy("pay");
    try {
      const result = await startPackStk({ data: { packId: doc.packId, phone: phone || me?.profile.phone || "" } });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(result.message);
        setStkSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start M-Pesa.");
    }
    setBusy("");
  }

  async function refreshPay() {
    setBusy("refresh");
    try {
      const result = await refreshPackPayment({ data: { packId: doc.packId } });
      await load();
      if (result.ok && result.status === "paid") toast.success("Payment confirmed. You can download.");
      else toast("Still waiting for Safaricom. Enter the PIN if the prompt is on the phone.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check the payment.");
    }
    setBusy("");
  }

  async function more(kind: "lesson" | "notes" | "revision") {
    setBusy(kind);
    setQueueProgress("Waiting for the project worker…");
    try {
      const result = await generateDocumentQueued({
          kind,
          parentId: doc.id,
          level: doc.level,
          grade: doc.grade,
          subject: doc.subject,
          strand: doc.strand,
          substrand: doc.substrand,
          term: doc.term,
          year: doc.year,
          weekFrom: doc.weekFrom,
          weekTo: doc.weekTo,
          lessonsPerWeek: doc.lessonsPerWeek,
          pathway: doc.pathway,
          startFrom: doc.startFrom,
          endAt: doc.endAt,
          stream: doc.stream,
          focusWeek: week,
          focusLesson: lessonNo,
          questionCount: questions,
          depth,
          substrands: [],
          columns: [],
          textbooks: [],
          lessonMinutes: 40,
          termStart: "",
          reflectionMode: "blank",
          coverNote: "",
          assessmentMethods: [],
          showApproval: true,
          safetyNote: false,
          tocPhotos: [],
          rememberColumns: false,
          learners: 0,
          boys: 0,
          girls: 0,
          hodName: "",
          preparedOn: "",
          doubleLesson: 0,
          homeworkDay: "",
          room: "",
        }, (state) => setQueueProgress(state === "queued" ? "Queued — waiting for Grok…" : state === "processing" ? "Grok is writing this resource…" : "Saving your finished resource…"));
      if (!result.ok) {
        toast.error(result.error);
        setBusy("");
        return;
      }
      toast.success("Saved with this set.");
      await router.navigate({ to: "/library/$id", params: { id: String(result.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The writer failed.");
      setBusy("");
    }
  }

  async function createTermLessonPack() {
    setBusy("lesson-pack");
    try {
      const result = await generateLessonPlanPack({ data: doc.id });
      if (!result.ok) {
        toast.error(result.error);
        setBusy("");
        return;
      }
      toast.success(`${result.lessonCount} separate lesson plans saved for this term.`);
      await router.navigate({ to: "/library/$id", params: { id: String(result.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The term lesson-plan pack could not be generated.");
      setBusy("");
    }
  }

  async function save(format: "pdf" | "docx" | "both", copy: "learner" | "teacher" = "teacher") {
    if (doc.redacted) {
      toast.error("Pay the till before downloading.");
      return;
    }
    const key = copy === "learner" ? `${format}-learner` : format;
    setBusy(key);
    try {
      const file: ExportDoc = {
        kind: doc.kind,
        title: doc.title,
        grade: doc.grade,
        subject: doc.subject,
        strand: doc.strand,
        substrand: doc.substrand,
        term: doc.term,
        year: doc.year,
        weekFrom: doc.weekFrom,
        weekTo: doc.weekTo,
        lessonsPerWeek: doc.lessonsPerWeek,
        pathway: doc.pathway,
        schoolName: doc.schoolName,
        teacherName: doc.teacherName,
        phone: doc.phone,
        stream: doc.stream,
        startFrom: doc.startFrom,
        endAt: doc.endAt,
        level: doc.level,
        body: doc.body,
        branding: doc.branding,
        copy,
      };
      await downloadDocument(file, format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the file.");
    }
    setBusy("");
  }

  async function remove() {
    const result = await deleteDocument({ data: doc.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await router.navigate({ to: "/library" });
  }

  async function toggleFavorite() {
    const next = !doc.favorite;
    setData((current) =>
      current && current.ok ? { ...current, doc: { ...current.doc, favorite: next } } : current,
    );
    const result = await setFavorite({ data: { id: doc.id, favorite: next } });
    if (!result.ok) {
      toast.error(result.error);
      await load();
      return;
    }
    toast.success(next ? "Starred. It sits at the top of the library." : "Star removed.");
  }

  async function copyToTerm() {
    setBusy("copy");
    try {
      const result = await duplicateDocument({ data: { id: doc.id, term: copyTerm, year: copyYear } });
      if (!result.ok) {
        toast.error(result.error);
        setBusy("");
        return;
      }
      toast.success(`Copied to ${copyTerm} ${copyYear}.`);
      await router.navigate({ to: "/library/$id", params: { id: String(result.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy this file.");
    }
    setBusy("");
  }

  const chat = waLink(data.settings.whatsapp, `Hello ${data.settings.contactName}, I need help unlocking a scheme.`);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass(doc.favorite ? "ink" : "ghost")}
          onClick={() => void toggleFavorite()}
          aria-pressed={doc.favorite}
          title={doc.favorite ? "Remove the star" : "Star this file"}
        >
          <Star className={`size-4 ${doc.favorite ? "fill-gold text-gold" : ""}`} aria-hidden="true" />
          {doc.favorite ? "Starred" : "Star"}
        </button>
        {doc.kind === "revision" || doc.kind === "exam" ? (
          <>
            <button type="button" className={buttonClass("leaf")} disabled={!!busy || doc.redacted} onClick={() => save("pdf", "learner")}>
              {busy === "pdf-learner" ? "Preparing learner PDF…" : "Learner PDF"}
            </button>
            <button type="button" className={buttonClass("ink")} disabled={!!busy || doc.redacted} onClick={() => save("pdf", "teacher")}>
              {busy === "pdf-teacher" ? "Preparing teacher PDF…" : "Teacher PDF"}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={!!busy || doc.redacted} onClick={() => save("docx", "teacher")}>
              {busy === "docx" ? "Preparing Word…" : "Word with marking"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={buttonClass("leaf")} disabled={!!busy || doc.redacted} onClick={() => save("pdf")}>
              {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button type="button" className={buttonClass("ink")} disabled={!!busy || doc.redacted} onClick={() => save("docx")}>
              {busy === "docx" ? "Preparing Word…" : "Download Word"}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={!!busy || doc.redacted} onClick={() => save("both")}>
              {busy === "both" ? "Zipping…" : "PDF and Word"}
            </button>
          </>
        )}
        <button type="button" className={buttonClass("ghost")} onClick={() => window.print()}>
          Print
        </button>
        {doc.kind === "scheme" ? (
          <a
            className={buttonClass("ghost")}
            href={waLink(
              data.settings.whatsapp,
              `Scheme: ${doc.title}\n${doc.schoolName}\n${doc.grade} ${doc.subject}\n${doc.term} ${doc.year}\nWeeks ${doc.weekFrom}–${doc.weekTo}, ${doc.lessonsPerWeek} lessons a week.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp the cover
          </a>
        ) : null}
        {doc.kind === "scheme" ? (
          <Link to="/generate" search={{ from: String(doc.id) }} className={buttonClass("ghost")}>
            Remix
          </Link>
        ) : null}
        <button type="button" className={buttonClass("ghost")} onClick={() => setCopyOpen((open) => !open)}>
          <CopyPlus className="size-4" aria-hidden="true" />
          Copy to another term
        </button>
      </div>

      {copyOpen ? (
        <Panel className="no-print space-y-3">
          <h2 className="font-display text-2xl">Copy this {doc.kind} into another term</h2>
          <p className="text-sm text-ink/80">
            The weeks, strand and books come with it, so next term starts from this file instead of a blank desk.
            The copy is a separate file: changing one does not change the other.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-semibold">
              Term
              <select className={`${fieldClass} mt-1`} value={copyTerm} onChange={(event) => setCopyTerm(event.target.value)}>
                {TERMS.map((term) => (
                  <option key={term}>{term}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Year
              <input
                className={`${fieldClass} mt-1 max-w-28`}
                type="number"
                min={2024}
                max={2035}
                value={copyYear}
                onChange={(event) => setCopyYear(Number(event.target.value))}
              />
            </label>
            <button type="button" className={buttonClass("leaf")} disabled={busy === "copy"} onClick={() => void copyToTerm()}>
              {busy === "copy" ? "Copying…" : `Copy to ${copyTerm} ${copyYear}`}
            </button>
          </div>
        </Panel>
      ) : null}

      {doc.redacted ? (
        <Panel className="no-print">
          <h2 className="font-display text-2xl">Pay to download this set</h2>
          <p className="mt-1 text-sm text-ink/80">
            Safaricom sends a prompt to your phone. Amount <span className="font-semibold">KES {priceKes}</span>
            {tillNumber ? <> · till <span className="font-semibold">{tillNumber}</span></> : null}.
            The PIN is typed only on the Safaricom screen, never on this site. One confirmed payment unlocks this set.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>Enter the M-Pesa number that should pay.</li>
            <li>Tap Pay with M-Pesa and wait for the prompt.</li>
            <li>Enter your PIN on the phone.</li>
            <li>This page unlocks the files when Safaricom confirms.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className={`${fieldClass} max-w-xs`} value={phone || me.profile.phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" maxLength={15} />
            <button type="button" className={buttonClass("clay")} disabled={busy === "pay"} onClick={pay}>
              {busy === "pay" ? "Sending prompt…" : `Pay KES ${priceKes} with M-Pesa`}
            </button>
            {stkSent ? <p className="basis-full text-sm text-leaf">The prompt is on the phone. This page checks Safaricom every few seconds. An old prompt expires after 3 minutes so you can send another.</p> : null}
            {tillNumber ? (
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() => void navigator.clipboard.writeText(tillNumber).then(() => toast.success(`Till ${tillNumber} copied.`))}
              >
                Copy till {tillNumber}
              </button>
            ) : null}
            <button type="button" className={buttonClass("ghost")} disabled={busy === "refresh"} onClick={() => void refreshPay()}>
              {busy === "refresh" ? "Checking…" : "I have entered the PIN"}
            </button>
            <a className={buttonClass("ghost")} href={chat} target="_blank" rel="noreferrer">
              WhatsApp {contactName}
            </a>
            <a
              className={buttonClass("ghost")}
              href={waLink(
                data.settings.whatsapp,
                `Hello ${contactName}, I need help with the M-Pesa prompt for ${doc.title}. School: ${doc.schoolName}. Teacher: ${doc.teacherName}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp that I have paid
            </a>
          </div>
        </Panel>
      ) : null}

      <Panel className="no-print space-y-3 border-2 border-leaf">
        <h2 className="font-display text-2xl">Find the lesson, the notes and the questions here</h2>
        <p className="text-sm text-ink/80">
          They are not on a different site. Stay on this file, choose the week and lesson, then press one button. The new file opens in this same set and is listed under Library.
        </p>
        <AiUsageNotice />
        {busy && queueProgress ? <p role="status" className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold text-leaf">{queueProgress}</p> : null}
        {doc.kind === "scheme" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass("leaf")} disabled={!!busy} onClick={() => more("lesson")}>
              {busy === "lesson" ? "Writing…" : "1. Lesson plan"}
            </button>
            <button type="button" className={buttonClass("leaf")} disabled={!!busy} onClick={() => void createTermLessonPack()}>
              {busy === "lesson-pack" ? "Planning the term…" : `Whole-term pack · ${(doc.weekTo - doc.weekFrom + 1) * doc.lessonsPerWeek} lesson plans`}
            </button>
            <button type="button" className={buttonClass("ink")} disabled={!!busy} onClick={() => more("notes")}>
              {busy === "notes" ? "Writing…" : "2. Notes"}
            </button>
            <button type="button" className={buttonClass("clay")} disabled={!!busy} onClick={() => more("revision")}>
              {busy === "revision" ? "Writing…" : "3. Questions"}
            </button>
            <Link to="/create" className={buttonClass("ghost")}>Or write them without this scheme</Link>
          </div>
        ) : (
          <p className="text-sm">This file is the {doc.kind}. The scheme it belongs to is in the list below, or open Library and filter by type.</p>
        )}
      </Panel>

      <DocView doc={doc} />

      <Panel className="no-print space-y-3">
        <h2 className="font-display text-2xl">Also in this set</h2>
        <ul className="space-y-1 text-sm">
          {data.siblings.map((item) => (
            <li key={item.id}>
              <Link to="/library/$id" params={{ id: String(item.id) }} className="font-semibold text-leaf">
                {item.title}
              </Link>
              <span className="text-ink/60"> · {item.kind} · {item.createdAt}</span>
            </li>
          ))}
        </ul>
        {doc.kind === "scheme" ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-semibold">
              Lesson week
              <select className={`${fieldClass} mt-1`} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
                {weeks.map((n) => (
                  <option key={n} value={n}>Week {n}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Lesson in that week
              <select className={`${fieldClass} mt-1`} value={lessonNo} onChange={(e) => setLessonNo(Number(e.target.value))}>
                {Array.from({ length: doc.lessonsPerWeek }, (_, index) => (
                  <option key={index + 1} value={index + 1}>Lesson {index + 1}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Notes and paper
              <select className={`${fieldClass} mt-1`} value={depth} onChange={(e) => {
                const next = e.target.value === "summary" ? "summary" : "full";
                setDepth(next);
                setQuestions(next === "summary" ? 8 : 20);
              }}>
                <option value="full">Full notes and a long paper</option>
                <option value="summary">Short summary only</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Questions
              <select className={`${fieldClass} mt-1`} value={questions} onChange={(e) => setQuestions(Number(e.target.value))}>
                {(depth === "summary" ? [5, 8, 10, 12] : [10, 15, 20, 25, 30]).map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
            <button type="button" className={buttonClass("leaf")} disabled={!!busy} onClick={() => more("lesson")}>
              {busy === "lesson" ? "Writing the lesson…" : "Write lesson plan"}
            </button>
            <button type="button" className={buttonClass("ink")} disabled={!!busy} onClick={() => more("notes")}>
              {busy === "notes" ? "Writing notes…" : "Write notes"}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={!!busy} onClick={() => more("revision")}>
              {busy === "revision" ? "Setting the paper…" : "Write revision"}
            </button>
          </div>
        ) : null}
        {confirmDelete ? (
          <div className="flex gap-2">
            <button type="button" className={buttonClass("clay")} onClick={remove}>Delete this file</button>
            <button type="button" className={buttonClass("ghost")} onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        ) : (
          <button type="button" className="text-sm font-semibold text-clay" onClick={() => setConfirmDelete(true)}>
            Remove from my library
          </button>
        )}
      </Panel>
    </div>
  );
}
