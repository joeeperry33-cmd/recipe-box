import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { nameOf, useStore } from "../lib/store";

const RESULT: Record<string, string> = {
  sent: "Friend request sent.",
  accepted: "They'd already asked you, so you're now friends.",
  exists: "You're already friends, or a request is waiting.",
  self: "That's your own email.",
  not_found: "Nobody with that email has a Recipe Box yet. Send them the app's web address so they can sign up, then add them here.",
};

export default function Friends() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState(s.me?.display_name ?? "");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [askWho, setAskWho] = useState("");
  const [askWhat, setAskWhat] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});

  const incoming = s.friendships.filter((f) => f.status === "pending" && f.addressee === myId);
  const outgoing = s.friendships.filter((f) => f.status === "pending" && f.requester === myId);
  const friends = s.friendships.filter((f) => f.status === "accepted");
  const other = (f: { requester: string; addressee: string }) => (f.requester === myId ? f.addressee : f.requester);
  const friendIds = friends.map(other);

  const myRecipes = s.recipes.filter((r) => r.owner_id === myId).sort((a, b) => a.title.localeCompare(b.title));
  const asksForMe = s.requests.filter((q) => q.to_user === myId && q.status === "open");
  const myAsks = s.requests.filter((q) => q.from_user === myId);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const to = askWho || friendIds[0];
    if (!to || !askWhat.trim()) return;
    const { error } = await supabase.from("recipe_requests").insert({ to_user: to, note: askWhat.trim().slice(0, 300) });
    if (error) { s.toast("Couldn't send that. Try again."); return; }
    setAskWhat(""); s.toast("Asked " + nameOf(s.people.get(to))); s.reload();
  }
  async function answer(id: string, from: string, recipeId: string | null) {
    if (recipeId) {
      const { error: shErr } = await supabase.from("recipe_shares").upsert({ recipe_id: recipeId, shared_with: from, shared_by: myId }, { ignoreDuplicates: true });
      if (shErr) { s.toast("Couldn't share that recipe. Try again."); return; }
    }
    const { error } = await supabase.from("recipe_requests").update({ status: recipeId ? "sent" : "declined", recipe_id: recipeId, answered_at: new Date().toISOString() }).eq("id", id);
    if (error) { s.toast("Couldn't save. Try again."); return; }
    s.toast(recipeId ? "Recipe sent to " + nameOf(s.people.get(from)) : "Told them you don't have it"); s.reload();
  }
  async function dropRequest(id: string) { await supabase.from("recipe_requests").delete().eq("id", id); s.reload(); }

  async function invite(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const { data, error } = await supabase.rpc("send_friend_request", { friend_email: email });
    if (error) { setMsg("Couldn't send that. Try again."); return; }
    setMsg(RESULT[data as string] ?? "Done."); if (data === "sent" || data === "accepted") { setEmail(""); s.reload(); }
  }
  async function accept(id: string) { await supabase.from("friendships").update({ status: "accepted" }).eq("id", id); s.toast("You're now friends"); s.reload(); }
  async function remove(id: string, toast: string) { await supabase.from("friendships").delete().eq("id", id); s.toast(toast); s.reload(); }
  async function setShareBox(v: boolean) {
    const { data, error } = await supabase.from("profiles").update({ share_box: v }).eq("id", myId).select().single();
    if (error || !data) { s.toast("Couldn't save. Try again."); return; }
    s.setMe(data); s.toast(v ? "Friends can now see all your recipes" : "Friends now see only recipes you share");
  }
  async function saveName(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", myId).select().single();
    if (!error && data) { s.setMe(data); s.toast("Name saved"); }
  }
  async function savePw(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    s.toast(error ? "Couldn't change the password: " + error.message : "Password changed"); if (!error) setPw("");
  }

  return (
    <div className="section">
      <h2>Friends</h2>
      <form className="form" onSubmit={invite}>
        <div className="field"><label htmlFor="fEmail">Add a friend by email</label>
          <div className="addrow"><input id="fEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" /><button className="btn primary">Send request</button></div></div>
        {msg && <div className="notice">{msg}</div>}
      </form>

      {incoming.length > 0 && (
        <div className="day"><span className="label" style={{ margin: 0 }}>Waiting for you</span>
          {incoming.map((f) => (
            <div className="pentry" key={f.id}><span className="t">{nameOf(s.people.get(f.requester))} <span className="muted small">{s.people.get(f.requester)?.email}</span></span>
              <button className="btn small primary" onClick={() => accept(f.id)}>Accept</button>
              <button className="btn small" onClick={() => remove(f.id, "Request declined")}>Decline</button></div>
          ))}
        </div>
      )}

      {asksForMe.length > 0 && (
        <div className="day"><span className="label" style={{ margin: 0 }}>Recipe requests for you</span>
          {asksForMe.map((q) => (
            <div className="request" key={q.id}>
              <div><b>{nameOf(s.people.get(q.from_user))}</b> is asking for: “{q.note}”</div>
              {myRecipes.length > 0 ? (
                <div className="addrow">
                  <label className="sr" htmlFor={"pick-" + q.id}>Recipe to send</label>
                  <select id={"pick-" + q.id} value={pick[q.id] ?? ""} onChange={(e) => setPick({ ...pick, [q.id]: e.target.value })}>
                    <option value="">Choose one of your recipes…</option>
                    {myRecipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                  <button className="btn small primary" disabled={!pick[q.id]} onClick={() => answer(q.id, q.from_user, pick[q.id])}>Send it</button>
                </div>
              ) : null}
              <div className="btns">
                <a className="btn small" href="#/add">Add it to my box first</a>
                <button className="btn small ghost" onClick={() => answer(q.id, q.from_user, null)}>I don't have it</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friendIds.length > 0 && (
        <form className="day" onSubmit={ask}>
          <span className="label" style={{ margin: 0 }}>Ask a friend for a recipe</span>
          <div className="addrow">
            {friendIds.length > 1 && (<>
              <label className="sr" htmlFor="askWho">Friend</label>
              <select id="askWho" value={askWho || friendIds[0]} onChange={(e) => setAskWho(e.target.value)}>
                {friendIds.map((f) => <option key={f} value={f}>{nameOf(s.people.get(f))}</option>)}
              </select>
            </>)}
            <label className="sr" htmlFor="askWhat">Which recipe</label>
            <input id="askWhat" value={askWhat} maxLength={300} onChange={(e) => setAskWhat(e.target.value)}
              placeholder={friendIds.length === 1 ? `Ask ${nameOf(s.people.get(friendIds[0]))}, like “your lasagna”` : "Which recipe? Like “your lasagna”"} />
            <button className="btn primary" disabled={!askWhat.trim()}>Ask</button>
          </div>
          {myAsks.length > 0 && myAsks.map((q) => (
            <div className="pentry" key={q.id}>
              <span className="t">“{q.note}” <span className="muted small">from {nameOf(s.people.get(q.to_user))}: {q.status === "open" ? "waiting" : q.status === "declined" ? "they don't have it" : "sent!"}</span></span>
              {q.status === "sent" && q.recipe_id && s.recipeMap.has(q.recipe_id) && <a className="btn small primary" href={"#/r/" + q.recipe_id}>Open</a>}
              <button type="button" className="iconbtn" onClick={() => dropRequest(q.id)}>{q.status === "open" ? "Cancel" : "Clear"}</button>
            </div>
          ))}
        </form>
      )}

      <div className="day"><span className="label" style={{ margin: 0 }}>Your friends</span>
        {friends.length === 0 && <p className="muted" style={{ margin: 0 }}>No friends yet. Add someone above.</p>}
        {friends.map((f) => { const p = s.people.get(other(f)); return (
          <div className="pentry" key={f.id}><span className="t">{nameOf(p)} <span className="muted small">{p?.email}</span></span>
            <button className="iconbtn" onClick={() => remove(f.id, "Friend removed")}>Remove</button></div>
        ); })}
        {outgoing.map((f) => (
          <div className="pentry" key={f.id}><span className="t">{s.people.get(f.addressee)?.email ?? "Pending"} <span className="muted small">request sent</span></span>
            <button className="iconbtn" onClick={() => remove(f.id, "Request cancelled")}>Cancel</button></div>
        ))}
      </div>

      <div className="day">
        <label className="checkrow strong"><input type="checkbox" checked={!!s.me?.share_box} onChange={(e) => setShareBox(e.target.checked)} /> Let my friends see my whole recipe box</label>
        <p className="muted small" style={{ margin: 0 }}>When this is off, friends only see the recipes you share with them one at a time.</p>
      </div>

      <h2 style={{ marginTop: 12 }}>Your account</h2>
      <form className="form" onSubmit={saveName}>
        <div className="field"><label htmlFor="dn">Your name (what friends see)</label><div className="addrow"><input id="dn" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn">Save</button></div></div>
      </form>
      <form className="form" onSubmit={savePw}>
        <div className="field"><label htmlFor="npw">New password</label><div className="addrow"><input id="npw" type={showPw ? "text" : "password"} minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /><button className="btn">Change password</button></div>
          <label className="checkrow small"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show password</label></div>
      </form>
      <p className="muted small" style={{ margin: 0 }}>Signed in as {s.session!.user.email}</p>
      <div><button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    </div>
  );
}
