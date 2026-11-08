import { useEffect, useRef, useState, type DragEvent } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { blobToBase64, photoToJpeg } from "../lib/images";
import { FILE_ACCEPT, readRecipeFile } from "../lib/files";
import { cleanAiRecipe, uid, type Recipe } from "../lib/recipes";
import RecipeForm, { type Draft } from "./RecipeForm";
import { go } from "../App";

const MAX_PHOTOS = 12; // pages per recipe; the photo reader accepts the same number

type Photo = { file: File; url: string };
const EMPTY: Draft = { title: "", category: "Main dish", tags: [], servings: null, prep_time: "", cook_time: "", ingredients: [], steps: [], notes: "", source: "", photo_paths: [], copied_from: null };

async function errorText(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") { try { const j = await ctx.json(); if (j?.error) return j.error; } catch { /* not json */ } }
  return "Something went wrong reading that. Check your connection and try again.";
}

type ReaderOut = { recipe?: Parameters<typeof cleanAiRecipe>[0]; error?: string };

/** The reader keeps working even if the phone drops the connection (screen lock, switching apps),
 *  and saves its result as a draft. So on a dropped connection, wait for that saved result. */
async function runReader(body: Record<string, unknown>, photoPaths: string[] = []): Promise<ReaderOut> {
  const draftId = crypto.randomUUID();
  const { data, error } = await supabase.functions.invoke("read-recipe", { body: { ...body, draft_id: draftId, photo_paths: photoPaths } });
  if (!error) { supabase.from("recipe_drafts").delete().eq("id", draftId).then(() => {}); return data as ReaderOut; }
  const isHttp = (error as { context?: Response })?.context && typeof (error as { context?: Response }).context?.json === "function"
    && (error as { name?: string }).name === "FunctionsHttpError";
  if (isHttp) { supabase.from("recipe_drafts").delete().eq("id", draftId).then(() => {}); return { error: await errorText(error) }; }
  const until = Date.now() + 170_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: d } = await supabase.from("recipe_drafts").select("status, recipe, error").eq("id", draftId).maybeSingle();
    if (d?.status === "done") { await supabase.from("recipe_drafts").delete().eq("id", draftId); return { recipe: d.recipe }; }
    if (d?.status === "error") { await supabase.from("recipe_drafts").delete().eq("id", draftId); return { error: d.error ?? "Something went wrong reading that. Try again." }; }
  }
  return { error: "The connection dropped while reading. If you come back to Add recipe in a minute, it may be waiting for you." };
}

/** Keeps the screen on while a read runs, so the phone doesn't sleep and cut the connection. */
function useScreenOn(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null; let done = false;
    const get = () => navigator.wakeLock.request("screen").then((l) => { if (done) l.release(); else lock = l; }).catch(() => {});
    const onVis = () => { if (document.visibilityState === "visible" && !done) get(); };
    get(); document.addEventListener("visibilitychange", onVis);
    return () => { done = true; lock?.release().catch(() => {}); document.removeEventListener("visibilitychange", onVis); };
  }, [on]);
}

type Waiting = { id: string; recipe: Parameters<typeof cleanAiRecipe>[0]; photo_paths: string[] };

export default function AddRecipe() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [url, setUrl] = useState(() => { try { const u = sessionStorage.getItem("sharedRecipeUrl") ?? ""; sessionStorage.removeItem("sharedRecipeUrl"); return u; } catch { return ""; } });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [over, setOver] = useState(false);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [where, setWhere] = useState<"photo" | "url" | "file" | "text">("photo");
  useScreenOn(!!busy);

  // Reads that finished after the app was closed or the connection dropped.
  useEffect(() => {
    supabase.from("recipe_drafts").select("id, status, recipe, photo_paths, created_at").order("created_at", { ascending: false }).then(({ data }) => {
      const old = Date.now() - 10 * 60_000;
      const rows = (data ?? []) as (Waiting & { status: string; created_at: string })[];
      // Clear failed and stuck reads; keep finished ones for the person to open.
      const stale = rows.filter((r) => r.status === "error" || (r.status === "working" && Date.parse(r.created_at) < old));
      if (stale.length) supabase.from("recipe_drafts").delete().in("id", stale.map((r) => r.id)).then(() => {});
      setWaiting(rows.filter((r) => r.status === "done" && r.recipe));
    });
  }, []);

  function openWaiting(w: Waiting) {
    supabase.from("recipe_drafts").delete().eq("id", w.id).then(() => {});
    setWaiting((x) => x.filter((y) => y.id !== w.id));
    setDraft({ ...cleanAiRecipe(w.recipe), photo_paths: w.photo_paths ?? [] });
  }

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addFiles(files: FileList | File[]) {
    setWhere("photo");
    const next = [...photos];
    for (const f of Array.from(files)) { if (f.type.startsWith("image/") && next.length < MAX_PHOTOS) next.push({ file: f, url: URL.createObjectURL(f) }); }
    if (Array.from(files).length + photos.length > MAX_PHOTOS) setErr(`A recipe can have up to ${MAX_PHOTOS} photos.`); else setErr("");
    setPhotos(next);
  }

  async function readUrl() {
    const link = url.trim().match(/https?:\/\/\S+/)?.[0] ?? (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url.trim()) ? "https://" + url.trim() : "");
    if (!link) { setErr("Paste the full web address of the recipe page, starting with https://"); return; }
    setWhere("url"); setErr(""); setBusy("Getting the recipe from that page… this takes about 20 seconds.");
    try {
      const out = await runReader({ url: link });
      if (!out.recipe) { setErr(out.error ?? "Something went wrong reading that page. Try again."); return; }
      setDraft({ ...cleanAiRecipe(out.recipe), photo_paths: [] }); setUrl("");
    } catch { setErr("Something went wrong reading that page. Try again."); }
    finally { setBusy(""); }
  }

  async function importFiles(list: FileList) {
    const files = Array.from(list);
    setWhere("file"); setErr("");
    const pics = files.filter((f) => f.type.startsWith("image/"));
    const others = files.filter((f) => !f.type.startsWith("image/"));
    if (pics.length && !others.length) { setWhere("photo"); addFiles(pics); return; }
    if (others.length > 1 || pics.length) { setErr("Import one file at a time (or only photos)."); return; }
    const f = others[0];
    setBusy(`Reading ${f.name}… this can take up to a minute.`);
    try {
      const got = await readRecipeFile(f);
      if (got.kind === "error") { setErr(got.error); return; }
      if (got.kind === "image") { setWhere("photo"); addFiles([f]); return; }
      if (got.kind === "text" && got.text.length < 30) { setErr("No recipe text was found in that file."); return; }
      const out = await runReader(got.kind === "pdf" ? { pdf: got.data } : { text: got.text });
      if (!out.recipe) { setErr(out.error ?? "Something went wrong reading that file. Try again."); return; }
      setDraft({ ...cleanAiRecipe(out.recipe), photo_paths: [] });
    } finally { setBusy(""); }
  }

  async function read(fromText: boolean) {
    setWhere(fromText ? "text" : "photo");
    setErr(""); setBusy(fromText ? "Reading the recipe…" : photos.length > 4 ? `Reading ${photos.length} pages… this can take a minute or two.` : "Reading your recipe… this takes about 20 seconds.");
    try {
      let images: { media_type: string; data: string }[] = [];
      let paths: string[] = [];
      if (!fromText) {
        // One photo at a time, so phones don't run out of memory with many pages.
        const jpgs: Blob[] = [];
        for (const p of photos) jpgs.push(await photoToJpeg(p.file));
        images = await Promise.all(jpgs.map(async (b) => ({ media_type: "image/jpeg", data: await blobToBase64(b) })));
        // Keep the original card photos with the recipe.
        const batch = uid();
        const ups = await Promise.all(jpgs.map((b, i) => supabase.storage.from("recipe-photos").upload(`${myId}/${batch}-${i}.jpg`, b, { contentType: "image/jpeg" })));
        paths = ups.filter((u) => !u.error).map((u) => u.data!.path);
      }
      setBusy(fromText ? "Reading the recipe…" : `Reading ${photos.length > 1 ? photos.length + " pages" : "your recipe"}… this can take up to a minute. The screen stays on until it's done.`);
      const out = await runReader(fromText ? { text } : { images }, paths);
      if (!out.recipe) { setErr(out.error ?? "Something went wrong reading that. Try again."); if (paths.length) supabase.storage.from("recipe-photos").remove(paths); return; }
      setDraft({ ...cleanAiRecipe(out.recipe), photo_paths: paths });
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
      {waiting.map((w) => (
        <div key={w.id} className="notice">
          <strong>{String(w.recipe?.title || "A recipe")}</strong> finished reading while you were away.{" "}
          <button className="btn small primary" onClick={() => openWaiting(w)}>Review and save</button>
        </div>
      ))}
      <div className={"drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <strong>Snap or upload your recipe</strong>
        <span className="muted" style={{ fontSize: ".92rem" }}>Handwritten cards and cookbook pages both work. Add up to {MAX_PHOTOS} photos if it continues on the back or more pages, in page order.</span>
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
        {busy && where === "photo" && <div className="status"><span className="spin" />{busy}</div>}
        {err && where === "photo" && <div className="notice warn">{err}</div>}
      </div>
      <form className="card share-cta" onSubmit={(e) => { e.preventDefault(); readUrl(); }}>
        <strong>Import from a website</strong>
        <span className="muted small">Paste the link to a recipe page. Ads and life stories are left out.</span>
        <div className="addrow" style={{ width: "100%" }}>
          <label className="sr" htmlFor="recipeUrl">Recipe web address</label>
          <input id="recipeUrl" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com/best-lasagna" />
          <button className="btn primary" disabled={!!busy || !url.trim()}>Import</button>
        </div>
        {busy && where === "url" && <div className="status"><span className="spin" />{busy}</div>}
        {err && where === "url" && <div className="notice warn">{err}</div>}
        <span className="muted small">Google Docs and Google Drive links work too, if the file is shared as "Anyone with the link".</span>
      </form>
      <div className="card share-cta">
        <strong>Import a file</strong>
        <span className="muted small">A PDF, Word document (.docx), text file or picture from your phone or computer. On a phone, Google Drive shows up in the file picker too.</span>
        <div className="btns"><label className={"btn primary" + (busy ? " disabled" : "")} htmlFor="docIn">Choose a file</label></div>
        <input id="docIn" className="sr" type="file" accept={FILE_ACCEPT} disabled={!!busy} onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ""; }} />
        {busy && where === "file" && <div className="status"><span className="spin" />{busy}</div>}
        {err && where === "file" && <div className="notice warn">{err}</div>}
      </div>
      <details className="paste">
        <summary>Paste a recipe someone texted or emailed you</summary>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="pasteText">Recipe text</label>
          <textarea id="pasteText" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole recipe here" /></div>
        <div className="btns" style={{ marginTop: 8 }}><button className="btn primary" disabled={!!busy || !text.trim()} onClick={() => read(true)}>Read this recipe</button></div>
        {busy && where === "text" && <div className="status"><span className="spin" />{busy}</div>}
        {err && where === "text" && <div className="notice warn">{err}</div>}
      </details>
      <div><button className="btn" onClick={() => setDraft({ ...EMPTY })}>Type it in by hand instead</button></div>
    </div>
  );
}
