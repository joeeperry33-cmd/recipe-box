import { useEffect, useRef, useState, type DragEvent } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { blobToBase64, photoToJpeg } from "../lib/images";
import { cleanAiRecipe, uid, type Recipe } from "../lib/recipes";
import RecipeForm, { type Draft } from "./RecipeForm";
import { go } from "../App";

type Photo = { file: File; url: string };
const EMPTY: Draft = { title: "", category: "Main dish", tags: [], servings: null, prep_time: "", cook_time: "", ingredients: [], steps: [], notes: "", source: "", photo_paths: [], copied_from: null };

async function errorText(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") { try { const j = await ctx.json(); if (j?.error) return j.error; } catch { /* not json */ } }
  return "Something went wrong reading that. Check your connection and try again.";
}

export default function AddRecipe() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [over, setOver] = useState(false);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addFiles(files: FileList | File[]) {
    const next = [...photos];
    for (const f of Array.from(files)) { if (f.type.startsWith("image/") && next.length < 4) next.push({ file: f, url: URL.createObjectURL(f) }); }
    setPhotos(next); setErr("");
  }

  async function read(fromText: boolean) {
    setErr(""); setBusy(fromText ? "Reading the recipe…" : "Reading your recipe… this takes about 20 seconds.");
    try {
      let images: { media_type: string; data: string }[] = [];
      let paths: string[] = [];
      if (!fromText) {
        const jpgs = await Promise.all(photos.map((p) => photoToJpeg(p.file)));
        images = await Promise.all(jpgs.map(async (b) => ({ media_type: "image/jpeg", data: await blobToBase64(b) })));
        // Keep the original card photos with the recipe.
        const batch = uid();
        const ups = await Promise.all(jpgs.map((b, i) => supabase.storage.from("recipe-photos").upload(`${myId}/${batch}-${i}.jpg`, b, { contentType: "image/jpeg" })));
        paths = ups.filter((u) => !u.error).map((u) => u.data!.path);
      }
      const { data, error } = await supabase.functions.invoke("read-recipe", { body: fromText ? { text } : { images } });
      if (error) { setErr(await errorText(error)); if (paths.length) supabase.storage.from("recipe-photos").remove(paths); return; }
      setDraft({ ...cleanAiRecipe(data.recipe), photo_paths: paths });
    } catch {
      setErr("That photo couldn't be opened. Try a different photo.");
    } finally { setBusy(""); }
  }

  async function save(d: Draft) {
    const { id: _i, ...fields } = d;
    const { data, error } = await supabase.from("recipes").insert(fields).select().single();
    if (error || !data) { s.toast("Couldn't save. Try again."); return; }
    s.upsertRecipeLocal(data as Recipe); s.toast("Saved to your recipe box"); go("r/" + data.id);
  }

  if (draft) return (
    <div className="section">
      {draft.title && <div className="notice">Check what was read and fix anything that looks off, then save.</div>}
      <RecipeForm draft={draft} heading={draft.title ? "Review recipe" : "New recipe"} saveLabel="Save to recipe box" onSave={save}
        onCancel={() => { if (draft.photo_paths.length) supabase.storage.from("recipe-photos").remove(draft.photo_paths); setDraft(null); }} />
    </div>
  );

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); };
  return (
    <div className="section">
      <h2>Add a recipe</h2>
      <div className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <strong>Snap or upload your recipe</strong>
        <span className="muted" style={{ fontSize: ".92rem" }}>Handwritten cards and cookbook pages both work. Add up to 4 photos if it continues on the back or another page.</span>
        <div className="btns center">
          <label className="btn primary" htmlFor="camIn">Take a photo</label>
          <label className="btn" htmlFor="fileIn">Choose photos</label>
        </div>
        <input id="camIn" className="sr" type="file" accept="image/*" capture="environment" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <input id="fileIn" className="sr" type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        {photos.length > 0 && (
          <div className="thumbs">
            {photos.map((p, i) => (
              <figure key={p.url}><img src={p.url} alt={`Photo ${i + 1}`} />
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => { URL.revokeObjectURL(p.url); setPhotos(photos.filter((_, j) => j !== i)); }}>×</button></figure>
            ))}
          </div>
        )}
        {photos.length > 0 && !busy && <button className="btn primary" onClick={() => read(false)}>Read {photos.length > 1 ? "these photos" : "this photo"}</button>}
        {busy && <div className="status"><span className="spin" />{busy}</div>}
        {err && <div className="notice warn">{err}</div>}
      </div>
      <details className="paste">
        <summary>Paste a recipe someone texted or emailed you</summary>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="pasteText">Recipe text</label>
          <textarea id="pasteText" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole recipe here" /></div>
        <div className="btns" style={{ marginTop: 8 }}><button className="btn primary" disabled={!!busy || !text.trim()} onClick={() => read(true)}>Read this recipe</button></div>
      </details>
      <div><button className="btn" onClick={() => setDraft({ ...EMPTY })}>Type it in by hand instead</button></div>
    </div>
  );
}
