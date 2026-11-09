import { useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { photoToJpeg } from "../lib/images";
import { uid, type Recipe } from "../lib/recipes";
import { useStore } from "../lib/store";

export type Meal = {
  id: string; user_id: string; recipe_id: string | null; title: string; category: string;
  photo: string | null; comment: string; shared: boolean; made_on: string; created_at: string;
};
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/** "I made this": log a meal with an optional photo and comment, shared to friends or kept private. */
export default function MadeIt({ recipe, onDone, onCancel }: { recipe?: Recipe; onDone: (m: Meal) => void; onCancel: () => void }) {
  const s = useStore();
  const myId = s.session!.user.id;
  const rs = [...s.recipes].sort((a, b) => a.title.localeCompare(b.title));
  const [pick, setPick] = useState(recipe?.id ?? "");
  const [comment, setComment] = useState("");
  const [shared, setShared] = useState(true);
  const [day, setDay] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const r = recipe ?? s.recipeMap.get(pick);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!r) { setErr("Pick the recipe you made."); return; }
    setBusy(true); setErr("");
    try {
      let photo: string | null = null;
      if (file) {
        const jpg = await photoToJpeg(file, 1400, 0.82);
        const path = `${myId}/meal-${uid()}.jpg`;
        const up = await supabase.storage.from("dish-photos").upload(path, jpg, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        photo = path;
      }
      const { data, error } = await supabase.from("meals_made").insert({
        recipe_id: r.id, title: r.title, category: r.category, photo, comment: comment.trim().slice(0, 500), shared, made_on: day,
      }).select().single();
      if (error || !data) throw error;
      // First photo of one of your own recipes also becomes its dish photo.
      if (photo && r.owner_id === myId && !r.dish_photo) {
        const { error: e2 } = await supabase.from("recipes").update({ dish_photo: photo }).eq("id", r.id);
        if (!e2) s.upsertRecipeLocal({ ...r, dish_photo: photo });
      }
      s.toast(shared ? "Posted to your friends' feed" : "Added to your cooking log");
      onDone(data as Meal);
    } catch { setErr("Couldn't post that. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <form className="card made-it" onSubmit={submit}>
      <strong>I made this!</strong>
      {!recipe && (
        <div className="field"><label htmlFor="madeR" className="small">Which recipe?</label>
          <select id="madeR" value={pick} onChange={(e) => setPick(e.target.value)} required>
            <option value="">Choose a recipe…</option>
            {rs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></div>
      )}
      {preview ? (
        <figure className="dish"><img src={preview} alt="Your meal" />
          <figcaption><button type="button" className="btn small" onClick={() => { URL.revokeObjectURL(preview); setPreview(""); setFile(null); }}>Remove photo</button></figcaption></figure>
      ) : (
        <div className="btns">
          <label className="btn" htmlFor="madeCam">📷 Take a photo</label>
          <label className="btn" htmlFor="madePick">Choose a photo</label>
        </div>
      )}
      <input id="madeCam" className="sr" type="file" accept="image/*" capture="environment" onChange={onFile} />
      <input id="madePick" className="sr" type="file" accept="image/*" onChange={onFile} />
      <div className="field"><label htmlFor="madeC" className="small">Comment (optional)</label>
        <textarea id="madeC" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How did it turn out? Any changes you made?" /></div>
      <div className="addrow">
        <label className="small" htmlFor="madeD">Made on</label>
        <input id="madeD" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} style={{ maxWidth: 180 }} />
      </div>
      <label className="checkrow small"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with my friends in the feed</label>
      {err && <div className="notice warn">{err}</div>}
      <div className="btns">
        <button className="btn primary" disabled={busy}>{busy ? "Posting…" : shared ? "Post" : "Save to my log"}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
