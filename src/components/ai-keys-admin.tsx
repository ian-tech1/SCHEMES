import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, Field, buttonClass, fieldClass } from "@/components/bits";
import { getAiProviderStatus, probeAiProviderKey, saveAiProviderSettings } from "@/lib/cbe.functions";
import { AI_PROVIDERS, AI_PROVIDER_FREE_NOTES, AI_PROVIDER_LABELS, AI_PROVIDER_SIGNUP_URLS, MAX_API_KEYS_PER_PROVIDER, type AiProvider } from "@/lib/ai-provider-types";

type Status = {
  preferred: AiProvider;
  keyCounts: Record<AiProvider, number>;
};

export function AiKeysAdmin({ verified }: { verified: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [preferred, setPreferred] = useState<AiProvider>("grok");
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const shown = AI_PROVIDERS.filter((item) => !filter.trim() || AI_PROVIDER_LABELS[item].toLowerCase().includes(filter.trim().toLowerCase()));

  async function load() {
    const result = await getAiProviderStatus();
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setStatus({ preferred: result.preferred, keyCounts: result.keyCounts });
    setPreferred(result.preferred);
    setNote("");
  }

  useEffect(() => { void load().catch(() => setNote("Writer keys could not be loaded.")); }, []);

  async function testDraft() {
    const keys = draft.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 8);
    if (!keys.length) {
      toast.error("Paste at least one full key before testing.");
      return;
    }
    setBusy("test");
    let passed = 0;
    for (const apiKey of keys) {
      try {
        const result = await probeAiProviderKey({ data: { provider, apiKey } });
        if (result.ok) passed += 1;
        else toast.error(result.error);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The test did not finish.");
      }
    }
    if (passed) toast.success(`${passed} of ${keys.length} ${AI_PROVIDER_LABELS[provider]} key${keys.length === 1 ? "" : "s"} answered.`);
    setBusy("");
  }

  async function saveDraft() {
    const keys = draft.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 8);
    if (!keys.length) {
      toast.error("Paste at least one full key before saving.");
      return;
    }
    setBusy("save");
    try {
      const result = await saveAiProviderSettings({ data: { preferred, keys: { [provider]: keys }, remove: {}, clear: [], collaborativeReview: false } });
      if (!result.ok) toast.error(result.error);
      else {
        setDraft("");
        toast.success(`${keys.length} ${AI_PROVIDER_LABELS[provider]} key${keys.length === 1 ? "" : "s"} tested and saved.`);
        await load();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The key could not be saved.");
    }
    setBusy("");
  }

  async function savePreferred() {
    setBusy("preferred");
    try {
      const result = await saveAiProviderSettings({ data: { preferred, keys: {}, remove: {}, clear: [], collaborativeReview: false } });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Writer order saved.");
        await load();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The order could not be saved.");
    }
    setBusy("");
  }

  async function removeLast(target: AiProvider) {
    const count = status?.keyCounts[target] ?? 0;
    if (count < 1) return;
    setBusy(`remove-${target}`);
    try {
      const result = await saveAiProviderSettings({ data: { preferred, keys: {}, remove: { [target]: [count - 1] }, clear: [], collaborativeReview: false } });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("The newest key was removed.");
        await load();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The key could not be removed.");
    }
    setBusy("");
  }

  const locked = !verified || Boolean(busy);

  return (
    <Panel className="space-y-4">
      <div>
        <h2 className="font-display text-2xl">Writer keys</h2>
        <p className="mt-1 text-sm text-ink/75">The site tries its own Grok key first, then the keys you save here. If every AI key fails, the site generator still writes a downloadable document from the topics you selected. Paste one key, or several keys (one per line). Each key is tested before it is stored. You can keep {MAX_API_KEYS_PER_PROVIDER} keys for each writer.</p>
      </div>
      {note ? <p className="rounded-lg bg-gold/15 p-3 text-sm">{note}</p> : null}
      <Field label="Search writers">
        <input className={fieldClass} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Type Gemini, Groq, DeepSeek…" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Try this writer first after the site Grok key">
          <select className={fieldClass} value={preferred} disabled={locked} onChange={(event) => setPreferred(event.target.value as AiProvider)}>
            {shown.map((item) => <option key={item} value={item}>{AI_PROVIDER_LABELS[item]}</option>)}
          </select>
        </Field>
        <button type="button" className={`${buttonClass("ink")} self-end`} disabled={locked} onClick={() => void savePreferred()}>{busy === "preferred" ? "Saving…" : "Save order"}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Writer">
          <select className={fieldClass} value={provider} disabled={locked} onChange={(event) => setProvider(event.target.value as AiProvider)}>
            {shown.map((item) => <option key={item} value={item}>{AI_PROVIDER_LABELS[item]} · {status?.keyCounts[item] ?? 0} saved</option>)}
          </select>
        </Field>
        <Field label="New API key or keys" hint={AI_PROVIDER_FREE_NOTES[provider]}>
          <textarea className={fieldClass} rows={3} autoComplete="off" value={draft} disabled={locked} onChange={(event) => setDraft(event.target.value)} placeholder="Paste one key, or one key per line" />
        </Field>
      </div>
      <p className="text-sm"><a className="font-semibold text-leaf underline" href={AI_PROVIDER_SIGNUP_URLS[provider]} target="_blank" rel="noreferrer">Open the {AI_PROVIDER_LABELS[provider]} key page</a></p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("ghost")} disabled={locked} onClick={() => void testDraft()}>{busy === "test" ? "Testing…" : "Test key"}</button>
        <button type="button" className={buttonClass("leaf")} disabled={locked} onClick={() => void saveDraft()}>{busy === "save" ? "Testing and saving…" : "Test and save key"}</button>
        <button type="button" className={buttonClass("ghost")} disabled={locked || (status?.keyCounts[provider] ?? 0) < 1} onClick={() => void removeLast(provider)}>Remove newest {AI_PROVIDER_LABELS[provider]} key</button>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {shown.map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2"><span className="font-semibold">{AI_PROVIDER_LABELS[item]}</span> · {status?.keyCounts[item] ?? 0} of {MAX_API_KEYS_PER_PROVIDER}</li>)}
      </ul>
      <p className="text-xs text-ink/65">Cloudflare also needs CLOUDFLARE_ACCOUNT_ID in the server environment. A free-tier key can still run out of quota; the next saved key is tried automatically. If every key fails, the site generator still writes the document. Do not paste a key you do not control.</p>
    </Panel>
  );
}
