import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { buttonClass, fieldClass, Field } from "@/components/bits";
import { updateProfile } from "@/lib/cbe.functions";
import { IAN_NAME, IAN_PHONE_DISPLAY, waLink } from "@/lib/contact";

/** Google and X are the host sign-in methods on this desk. */
const grokOAuthEnabled = true;

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="font-display text-4xl">You are already in.</h1>
        <Link to="/desk" className={buttonClass("leaf")}>
          Go to your desk
        </Link>
      </main>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!authEnabled) {
      setError("Sign-in is not switched on yet.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters in the password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "up") {
        if (name.trim().length < 2) {
          setError("Add the name that should appear on the cover.");
          setBusy(false);
          return;
        }
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
          callbackURL: "/desk",
        });
        if (result.error) {
          setError(result.error.message || "Could not create the account.");
          setBusy(false);
          return;
        }
        if (phone.trim() || school.trim()) {
          await updateProfile({
            data: { displayName: name.trim(), phone: phone.trim(), schoolName: school.trim() },
          }).catch(() => undefined);
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: "/desk",
        });
        if (result.error) {
          setError(result.error.message || "Those details did not match an account.");
          setBusy(false);
          return;
        }
      }
      await router.invalidate();
      await router.navigate({ to: "/desk" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="font-display text-2xl text-ink">
        IAN TECH <span className="text-leaf">Schemes</span>
      </Link>
      <h1 className="mt-4 font-display text-4xl leading-tight">
        {mode === "up" ? "Create your teacher account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-ink/75">
        The welcome page is open to everyone. Sign in here to write schemes, notes and revision.
        School admin: sign in with your desk key, then open the Admin desk. The key is never printed on this page - if your school has not set one yet, ask the desk owner for it. Deputies are appointed from the desk. Help: {IAN_NAME}, {IAN_PHONE_DISPLAY}.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={buttonClass(mode === "up" ? "leaf" : "ghost")} onClick={() => setMode("up")}>
          New teacher
        </button>
        <button type="button" className={buttonClass(mode === "in" ? "leaf" : "ghost")} onClick={() => setMode("in")}>
          I have an account
        </button>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === "up" ? (
          <>
            <Field label="Your name">
              <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label="School">
              <input className={fieldClass} value={school} onChange={(e) => setSchool(e.target.value)} autoComplete="organization" />
            </Field>
            <Field label="Phone">
              <input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
            </Field>
          </>
        ) : null}
        <Field label="Email">
          <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Password">
          <input className={fieldClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={8} />
        </Field>
        {error ? <p className="rounded-xl border border-clay bg-card px-3 py-2 text-sm text-clay">{error}</p> : null}
        <button type="submit" className={`${buttonClass("leaf")} w-full`} disabled={busy || isPending}>
          {busy ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {authEnabled && grokOAuthEnabled
          ? GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                className={`${buttonClass("ghost")} w-full`}
                onClick={() => signIn(provider.providerId, { callbackURL: "/desk" })}
              >
                Continue with {provider.label}
              </button>
            ))
          : null}
      </div>
      <a className="mt-4 text-sm font-semibold text-leaf" href={waLink("254723278526")} target="_blank" rel="noreferrer">
        WhatsApp {IAN_NAME}
      </a>
    </main>
  );
}
