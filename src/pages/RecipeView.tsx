import { useEffect, useRef, useState } from "react";
import { fmtQty, normUnit, recipeText, uid, unitFor, type Recipe } from "../lib/recipes";
import { supabase } from "../lib/supabase";
import { nameOf, useStore } from "../lib/store";
import { go } from "../App";
import { Heart, Stars } from "../components/Marks";

function useWakeLock(on: boolean, onFail: (msg: string) => void) {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    const get = async () => {
      if (!("wakeLock" in navigator)) { onFail("This browser can't keep the screen on."); return; }
      try { const l = await navigator.wakeLock.request("screen"); if (cancelled) l.release(); else lock.current = l; }
      catch { onFail("Your phone didn't allow keeping the screen on. Turn off Low Power Mode and try again."); }
    };
    get();
    // The browser drops the lock when the app goes to the background; take it back on return.
    const vis = () => { if (document.visibilityState === "visible" && (!lock.current || lock.current.released)) get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", vis); lock.current?.release().catch(() => {}); lock.current = null; };
  }, [on, onFail]);
}

export default function RecipeView({ id }: { id: string }) {
  const s = useStore();
  const myId = s.session!.user.id;
  const r = s.recipeMap.get(id);
  const [awake, setAwake] = useState(false);
  const [big, setBig] = useState(false);
  const [serv, setServ] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const failRef = useRef((m: string) => { s.toast(m); setAwake(false); });
  useWakeLock(awake, failRef.current);

  useEffect(() => {
    if (!r || r.owner_id !== myId || !r.photo_paths?.length) { setPhotos([]); return; }
    supabase.storage.from("recipe-photos").createSignedUrls(r.photo_paths, 3600).then(({ data }) => setPhotos((data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[]));
  }, [r, myId]);

  if (!r) return <div className="section"><p className="muted">{s.loading ? "Loading recipe…" : "This recipe isn't in your box any more."}</p><a className="btn" href="#/">Back to recipes</a></div>;

  const mine = r.owner_id === myId;
  const base = Number(r.servings) || 0;
  const servings = serv ?? base;
  const mult = base ? servings / base : 1;
  const planned = s.plan.some((e) => e.recipe_id === r.id);
  const friends = s.friendships.filter((f) => f.status === "accepted").map((f) => (f.requester === myId ? f.addressee : f.requester));
  const sharedWith = new Set(s.shares.filter((x) => x.recipe_id === r.id).map((x) => x.shared_with));

  function togglePlan() {
    if (planned) { s.setPlan(s.plan.filter((e) => e.recipe_id !== r!.id)); s.toast("Removed from meal plan"); }
    else { s.setPlan([...s.plan, { id: uid(), recipe_id: r!.id, day: "Anytime", servings: base || null }]); s.toast("Added to meal plan"); }
  }
  async function del() {
    const { error } = await supabase.from("recipes").delete().eq("id", r!.id);
    if (error) { s.toast("Couldn't delete. Try again."); return; }
    if (r!.photo_paths?.length) await supabase.storage.from("recipe-photos").remove(r!.photo_paths);
    s.setPlan(s.plan.filter((e) => e.recipe_id !== r!.id));
    s.removeRecipeLocal(r!.id); s.toast("Recipe deleted"); go("");
  }
  async function copyToMine() {
    const { id: _i, owner_id: _o, created_at: _c, updated_at: _u, ...rest } = r!;
    const { data, error } = await supabase.from("recipes").insert({ ...rest, photo_paths: [], copied_from: r!.id }).select().single();
    if (error || !data) { s.toast("Couldn't save a copy. Try again."); return; }
    s.upsertRecipeLocal(data as Recipe); s.toast("Saved to your recipe box"); go("r/" + data.id);
  }
  async function toggleShare(friendId: string) {
    if (sharedWith.has(friendId)) {
      const { error } = await supabase.from("recipe_shares").delete().match({ recipe_id: r!.id, shared_with: friendId });
      if (!error) { s.toast("Stopped sharing"); s.reload(); }
    } else {
      const { error } = await supabase.from("recipe_shares").insert({ recipe_id: r!.id, shared_with: friendId });
      if (error) s.toast("Couldn't share. Try again."); else { s.toast("Shared with " + nameOf(s.people.get(friendId))); s.reload(); }
    }
  }
  async function copyText() {
    const text = recipeText(r!);
    try { await navigator.clipboard.writeText(text); s.toast("Recipe copied. Paste it into a text or email."); }
    catch { s.toast("Couldn't copy on this device."); }
  }
  async function shareSheet() {
    const text = recipeText(r!);
    if (navigator.share) { try { await navigator.share({ title: r!.title, text }); } catch { /* closed */ } }
    else copyText();
  }

  return (
    <div className="section">
      <div className="no-print"><a className="btn ghost small" href="#/">← All recipes</a></div>
      <article className={"detail" + (big ? " cook" : "")}>
        <div className="head">
          <div className="label accent" style={{ margin: 0 }}>{r.category}</div>
          <h2>{r.title}</h2>
          <div className="meta">
            {r.prep_time && <span>Prep {r.prep_time}</span>}
            {r.cook_time && <span>Cook {r.cook_time}</span>}
            {base > 0 && <span>Serves {base}</span>}
            {r.source && <span>From {r.source}</span>}
            {!mine && <span>Shared by {nameOf(s.people.get(r.owner_id))}</span>}
          </div>
          <div className="markrow no-print"><Stars recipeId={r.id} title={r.title} /><Heart recipeId={r.id} title={r.title} withText /></div>
          {r.tags?.length > 0 && <div className="chips">{r.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
        </div>
        <div className="toolbar no-print">
          <label className="switch"><input type="checkbox" checked={awake} onChange={(e) => { setAwake(e.target.checked); if (e.target.checked) s.toast("Screen will stay on while this recipe is open."); }} /> Keep screen on</label>
          <label className="switch"><input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} /> Big text</label>
          <button className={"btn" + (planned ? " inplan" : "")} onClick={togglePlan}>{planned ? "✓ In meal plan" : "+ Add to meal plan"}</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
          {mine && <button className="btn" onClick={() => setSharing((v) => !v)} aria-expanded={sharing}>Share with friends</button>}
          <button className="btn" onClick={shareSheet}>Send as text</button>
          {!mine && <button className="btn primary" onClick={copyToMine}>Save a copy to my box</button>}
          {mine && <a className="btn" href={"#/edit/" + r.id}>Edit</a>}
          {mine && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}
        </div>
        {confirmDel && (
          <div className="pad no-print"><div className="confirm">
            <span>Delete “{r.title}”? Friends you shared it with lose it too.</span>
            <button className="btn small danger" onClick={del}>Yes, delete</button>
            <button className="btn small" onClick={() => setConfirmDel(false)}>Keep it</button>
          </div></div>
        )}
        {sharing && mine && (
          <div className="pad no-print"><div className="sharebox">
            {friends.length === 0 ? (
              <p style={{ margin: 0 }}>Add a friend first, then you can share recipes with them. <a href="#/friends">Add friends</a></p>
            ) : (
              <>
                <span className="label" style={{ margin: 0 }}>Share this recipe with</span>
                {friends.map((f) => (
                  <label key={f} className="checkrow"><input type="checkbox" checked={sharedWith.has(f) || !!s.me?.share_box} disabled={!!s.me?.share_box} onChange={() => toggleShare(f)} /> {nameOf(s.people.get(f))}</label>
                ))}
                {s.me?.share_box && <p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>Your friends already see your whole recipe box. You can change that on the Friends page.</p>}
              </>
            )}
          </div></div>
        )}
        <div className="body2">
          <section className="ings">
            <span className="label">Ingredients</span>
            {base > 0 && (
              <div className="no-print" style={{ marginBottom: 10 }}>
                <div className="servings">
                  <button onClick={() => setServ(Math.max(1, servings - 1))} aria-label="Fewer servings">−</button>
                  <output>{fmtQty(servings)} serving{servings === 1 ? "" : "s"}</output>
                  <button onClick={() => setServ(servings + 1)} aria-label="More servings">+</button>
                </div>
              </div>
            )}
            <ul>
              {(r.ingredients || []).map((g, i) => {
                const q = g.qty != null ? g.qty * mult : null;
                const done = ticked.has(i);
                return (
                  <li key={i} className={done ? "done" : ""}>
                    <label>
                      <input type="checkbox" checked={done} onChange={() => setTicked((t) => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                      <span><span className="qty">{[fmtQty(q), unitFor(normUnit(g.unit), q)].filter(Boolean).join(" ")}</span> {g.item}{g.note && <span className="muted">, {g.note}</span>}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="steps">
            <span className="label">Directions</span>
            <ol>{(r.steps || []).map((st, i) => <li key={i}><span>{st}</span></li>)}</ol>
          </section>
        </div>
        {r.notes && <div className="notes"><span className="label">Notes</span><p style={{ margin: 0 }}>{r.notes}</p></div>}
        {photos.length > 0 && (
          <div className="notes no-print"><span className="label">Original card</span>
            <div className="thumbs left">{photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Original photo ${i + 1}`} /></a>)}</div>
          </div>
        )}
      </article>
    </div>
  );
}
