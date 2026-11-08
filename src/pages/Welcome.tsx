import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";

/** Someone who opened an email invite: they're signed in but have no password yet. */
export default function Welcome() {
  const s = useStore();
  const meta = s.session!.user.user_metadata as { invited_by?: string; display_name?: string };
  const [name, setName] = useState(s.me?.display_name || meta.display_name || "");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { needs_password: false, display_name: name.trim() } });
    if (error) { setBusy(false); setErr(error.message); return; }
    if (name.trim()) await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", s.session!.user.id);
    await s.reload(); setBusy(false); location.hash = "#/friends";
  }

  return (
    <main className="wrap"><div className="section">
      <h2>Welcome to Recipe Box</h2>
      <p className="muted">{meta.invited_by ? `${meta.invited_by} invited you to share recipes. ` : ""}Pick your name and a password so you can sign in again later.</p>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="wName">Your name (what friends see)</label><input id="wName" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field"><label htmlFor="wPw">Password</label>
          <input id="wPw" type={showPw ? "text" : "password"} minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <label className="checkrow small"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show password</label></div>
        {err && <div className="notice warn">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div></main>
  );
}
