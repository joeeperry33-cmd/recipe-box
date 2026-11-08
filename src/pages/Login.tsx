import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const redirect = location.origin + location.pathname;
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: "warn", text: error.message.includes("confirm") ? "Confirm your email first. Check your inbox for the link." : "That email and password don't match." });
    } else if (mode === "up") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirect } });
      if (error) setMsg({ kind: "warn", text: /rate limit/i.test(error.message) ? "Too many sign-ups right now. Please try again in an hour." : error.message });
      else if (!data.session) setMsg({ kind: "ok", text: "Check your email and tap the link to finish signing up." });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      setMsg(error ? { kind: "warn", text: /rate limit/i.test(error.message) ? "Too many emails sent right now. Please try again in an hour." : error.message } : { kind: "ok", text: "If that email has an account, a reset link is on its way." });
    }
    setBusy(false);
  }

  return (
    <main className="wrap login">
      <div className="brand big"><span className="tab-mark" aria-hidden="true" />Recipe Box</div>
      <p className="muted lede">Snap your paper recipes, plan the week, and shop from one list. Share favorites with friends.</p>
      <form className="form" onSubmit={submit}>
        <h2>{mode === "in" ? "Sign in" : mode === "up" ? "Create your recipe box" : "Reset your password"}</h2>
        {mode === "up" && (
          <div className="field"><label htmlFor="name">Your name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What friends will see" autoComplete="name" /></div>
        )}
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        {mode !== "reset" && (
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" type={showPw ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} />
            <label className="checkrow small"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show password</label></div>
        )}
        {msg && <div className={"notice" + (msg.kind === "warn" ? " warn" : "")}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}</button>
        <div className="btns">
          {mode !== "in" && <button type="button" className="btn ghost small" onClick={() => setMode("in")}>I have an account</button>}
          {mode !== "up" && <button type="button" className="btn ghost small" onClick={() => setMode("up")}>Create an account</button>}
          {mode === "in" && <button type="button" className="btn ghost small" onClick={() => setMode("reset")}>Forgot password?</button>}
        </div>
      </form>
    </main>
  );
}
