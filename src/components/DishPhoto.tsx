import { useState } from "react";
import { supabase } from "../lib/supabase";
import { photoToJpeg } from "../lib/images";
import { uid } from "../lib/recipes";

export const dishUrl = (path?: string | null) => (path ? supabase.storage.from("dish-photos").getPublicUrl(path).data.publicUrl : "");

/** The finished-dish picture at the top of a recipe. The owner can add, change or remove it. */
export default function DishPhoto({ recipeId, path, canEdit, userId, title, onChange }: {
  recipeId: string; path?: string | null; canEdit: boolean; userId?: string; title: string; onChange?: (path: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputId = "dish-" + recipeId;

  async function pick(f: File) {
    setBusy(true); setErr("");
    try {
      const jpg = await photoToJpeg(f, 1400, 0.82);
      const name = `${userId}/${recipeId}-${uid()}.jpg`;
      const up = await supabase.storage.from("dish-photos").upload(name, jpg, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("recipes").update({ dish_photo: name }).eq("id", recipeId);
      if (error) throw error;
      // The old picture is no longer shown here (a friend's saved copy may still use it).
      if (path?.startsWith(userId + "/")) supabase.storage.from("dish-photos").remove([path]).then(() => {});
      onChange?.(name);
    } catch { setErr("Couldn't add that photo. Try another one."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("recipes").update({ dish_photo: null }).eq("id", recipeId);
    setBusy(false);
    if (error) { setErr("Couldn't remove it. Try again."); return; }
    if (path?.startsWith(userId + "/")) supabase.storage.from("dish-photos").remove([path]).then(() => {});
    onChange?.(null);
  }

  const input = canEdit && <input id={inputId} className="sr" type="file" accept="image/*" disabled={busy}
    onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />;

  if (!path) return canEdit ? (
    <div className="dish empty no-print">
      <label htmlFor={inputId} className={"dish-add" + (busy ? " disabled" : "")}>
        <span aria-hidden="true" className="dish-icon">📷</span>
        <span><strong>{busy ? "Adding photo…" : "Add a photo of the dish"}</strong><br /><span className="muted small">Show what it looks like when it's made</span></span>
      </label>
      {input}
      {err && <div className="notice warn">{err}</div>}
    </div>
  ) : null;

  return (
    <figure className="dish">
      <img src={dishUrl(path)} alt={`${title}, finished dish`} loading="lazy" />
      {canEdit && (
        <figcaption className="no-print">
          <label htmlFor={inputId} className={"btn small" + (busy ? " disabled" : "")}>{busy ? "Saving…" : "Change photo"}</label>
          <button className="btn small" disabled={busy} onClick={remove}>Remove</button>
          {input}
        </figcaption>
      )}
      {err && <div className="notice warn">{err}</div>}
    </figure>
  );
}
