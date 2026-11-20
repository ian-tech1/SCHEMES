import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { getCurriculumPriceRules, removeCurriculumPriceRule, saveCurriculumPriceRule } from "@/lib/cbe.functions";
import { LEVELS, subjectsFor } from "@/lib/curriculum";
import type { CurriculumPriceRule } from "@/lib/curriculum-pricing";

type ListedRule = CurriculumPriceRule & { updatedAt: string };

export function CurriculumPricingAdmin({ verified, baselinePriceKes }: { verified: boolean; baselinePriceKes: number }) {
  const [grade, setGrade] = useState("Grade 9");
  const [subject, setSubject] = useState("Mathematics");
  const [priceKes, setPriceKes] = useState(baselinePriceKes);
  const [rules, setRules] = useState<ListedRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const grades = useMemo(() => LEVELS.flatMap((level) => level.grades), []);
  const subjectOptions = useMemo(() => [...new Set(LEVELS.flatMap((level) => level.grades.flatMap((item) => subjectsFor(level.id, item))))].sort(), []);

  async function load() {
    const result = await getCurriculumPriceRules();
    if (!result.ok) { setError(result.error); return; }
    setError("");
    setRules(result.rules as ListedRule[]);
  }
  useEffect(() => { void load().catch(() => setError("Could not read price rules.")); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveCurriculumPriceRule({ data: { grade, subject, priceKes } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(priceKes === 0 ? "This learning area is free." : `Price set to KES ${priceKes} per document set.`);
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not save the price rule."); }
    finally { setBusy(false); }
  }

  async function remove(rule: ListedRule) {
    setBusy(true);
    try {
      const result = await removeCurriculumPriceRule({ data: { grade: rule.grade, subject: rule.subject } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Price rule removed; the baseline desk price applies again.");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not remove the price rule."); }
    finally { setBusy(false); }
  }

  return <div id="curriculum-prices">
    <Panel className="space-y-4">
      <div>
        <h2 className="font-display text-2xl">AI curriculum-pack prices</h2>
        <p className="mt-1 text-sm text-ink/75">Set one KES price for each grade and learning area. KES 0 makes that site's AI-generated document sets free. The rule affects teachers' generated notes, schemes, lessons and practice papers for that grade/area; without a rule, the desk's baseline price applies.</p>
        <p className="mt-2 rounded-lg bg-gold/15 p-3 text-sm">Official KICD curriculum files stay linked directly to KICD and are not sold or republished here. These prices apply only to original documents generated and stored by this site.</p>
      </div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => void save(event)}>
        <Field label="Grade"><select className={fieldClass} value={grade} onChange={(event) => setGrade(event.target.value)}>{grades.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Learning area" hint="Use the canonical subject name shown on the curriculum page."><input className={fieldClass} list="curriculum-price-subjects" value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={80} /><datalist id="curriculum-price-subjects">{subjectOptions.map((item) => <option key={item} value={item} />)}</datalist></Field>
        <Field label="Price in KES" hint="Enter 0 for free."><input className={fieldClass} type="number" min={0} max={20000} step={1} value={priceKes} onChange={(event) => setPriceKes(Number(event.target.value))} required /></Field>
        <button type="submit" className={`${buttonClass("leaf")} self-end`} disabled={busy || !verified} title={verified ? undefined : "Verify the desk key before changing prices."}>{busy ? "Saving…" : "Save price rule"}</button>
      </form>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-ink text-paper"><tr><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Learning area</th><th className="px-3 py-2">Price / set</th><th className="px-3 py-2">Actions</th></tr></thead>
          <tbody>{rules.length ? rules.map((rule) => <tr key={`${rule.grade}-${rule.subject}`} className="border-t border-line bg-card"><td className="px-3 py-2">{rule.grade}</td><td className="px-3 py-2">{rule.subject}</td><td className="px-3 py-2 font-semibold">{rule.priceKes === 0 ? "Free" : `KES ${rule.priceKes}`}</td><td className="px-3 py-2"><div className="flex gap-3"><button type="button" className="font-semibold text-leaf underline" disabled={busy} onClick={() => { setGrade(rule.grade); setSubject(rule.subject); setPriceKes(rule.priceKes); }}>Edit</button><button type="button" className="font-semibold text-clay underline" disabled={busy || !verified} onClick={() => void remove(rule)}>Remove</button></div></td></tr>) : <tr><td className="px-3 py-3 text-ink/65" colSpan={4}>No per-learning-area rules yet; the baseline price is used.</td></tr>}</tbody>
        </table>
      </div>
    </Panel>
  </div>;
}
