import { useState, type FormEvent } from "react";
import { CATEGORIES, ingText, parseIngLine, parseQty, type Recipe } from "../lib/recipes";

export type Draft = Omit<Recipe, "id" | "owner_id"> & { id?: string };

export default function RecipeForm({ draft, heading, saveLabel, onSave, onCancel }: {
  draft: Draft; heading: string; saveLabel: string; onSave: (d: Draft) => Promise<void>; onCancel: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [category, setCategory] = useState(draft.category || "Main dish");
  const [servings, setServings] = useState(draft.servings ? String(draft.servings) : "");
  const [prep, setPrep] = useState(draft.prep_time);
  const [cook, setCook] = useState(draft.cook_time);
  const [tags, setTags] = useState((draft.tags || []).join(", "));
  const [ings, setIngs] = useState((draft.ingredients || []).map((g) => ingText(g)).join("\n"));
  const [steps, setSteps] = useState((draft.steps || []).join("\n"));
  const [notes, setNotes] = useState(draft.notes);
  const [source, setSource] = useState(draft.source);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        ...draft,
        title: title.trim() || "Untitled recipe",
        category,
        servings: parseQty(servings) || null,
        prep_time: prep.trim(), cook_time: cook.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        ingredients: ings.split("\n").map((l) => parseIngLine(l, draft.ingredients)).filter((g): g is NonNullable<typeof g> => !!g),
        steps: steps.split("\n").map((x) => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean),
        notes: notes.trim(), source: source.trim(),
      });
    } finally { setBusy(false); }
  }
  const rows = (s: string) => Math.max(6, s.split("\n").length + 1);

  return (
    <form className="form" onSubmit={submit}>
      <h2>{heading}</h2>
      <div className="field"><label htmlFor="fTitle">Recipe name</label><input id="fTitle" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="row3">
        <div className="field"><label htmlFor="fCat">Category</label>
          <select id="fCat" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="fServ">Servings</label><input id="fServ" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} /></div>
        <div className="field"><label htmlFor="fPrep">Prep time</label><input id="fPrep" value={prep} onChange={(e) => setPrep(e.target.value)} /></div>
        <div className="field"><label htmlFor="fCook">Cook time</label><input id="fCook" value={cook} onChange={(e) => setCook(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="fTags">Tags <span className="muted">(comma separated)</span></label><input id="fTags" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
      <div className="field"><label htmlFor="fIngs">Ingredients <span className="muted">(one per line, like “2 cups flour, sifted”)</span></label>
        <textarea id="fIngs" rows={rows(ings)} value={ings} onChange={(e) => setIngs(e.target.value)} /></div>
      <div className="field"><label htmlFor="fSteps">Directions <span className="muted">(one step per line)</span></label>
        <textarea id="fSteps" rows={rows(steps)} value={steps} onChange={(e) => setSteps(e.target.value)} /></div>
      <div className="field"><label htmlFor="fNotes">Notes</label><textarea id="fNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="field"><label htmlFor="fSource">Where it came from <span className="muted">(Grandma, a cookbook…)</span></label><input id="fSource" value={source} onChange={(e) => setSource(e.target.value)} /></div>
      <div className="btns">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : saveLabel}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
