import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtQty, ingText, type Ingredient } from "../lib/recipes";
import { useStore } from "../lib/store";
import { APP_NAME, rememberPending } from "../lib/links";
import { go } from "../App";

type Shared = {
  title: string; category: string; tags: string[]; servings: number | null; prep_time: string; cook_time: string;
  ingredients: Ingredient[]; steps: string[]; notes: string; source: string; recipe_id: string; shared_by: string;
};

// Chrome and Android offer an install prompt; iPhone needs Share > Add to Home Screen.
type InstallEvent = Event & { prompt: () => Promise<void> };
let installEvent: InstallEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e as InstallEvent; });
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const installed = () => window.matchMedia("(display-mode: standalone)").matches;

export default function SharedRecipe({ token, onSignIn }: { token: string; onSignIn?: () => void }) {
  const s = useStore();
  const signedIn = !!s.session;
  const [r, setR] = useState<Shared | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [canInstall, setCanInstall] = useState(!!installEvent);

  useEffect(() => {
    supabase.rpc("get_shared_recipe", { link_token: token }).then(({ data }) => setR((data as Shared) ?? null));
    const on = () => setCanInstall(true);
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, [token]);

  if (r === undefined) return <div className="section"><p className="muted">Opening the recipe…</p></div>;
  if (r === null) return (
    <div className="section"><div className="notice warn">This recipe link doesn't work any more. The person who sent it may have deleted the recipe.</div>
      {signedIn ? <a className="btn" href="#/">Go to my recipes</a> : <button className="btn primary" onClick={onSignIn}>Sign in or create an account</button>}</div>
  );

  const already = signedIn && s.recipes.find((x) => x.id === r.recipe_id || (x.copied_from === r.recipe_id && x.owner_id === s.session!.user.id));
  async function save() {
    setSaving(true);
    const { recipe_id, shared_by, ...fields } = r!;
    const { data, error } = await supabase.from("recipes").insert({ ...fields, source: fields.source || shared_by, copied_from: recipe_id }).select().single();
    setSaving(false);
    if (error || !data) { s.toast("Couldn't save. Try again."); return; }
    s.upsertRecipeLocal(data); s.toast("Saved to your recipe box"); go("r/" + data.id);
  }

  return (
    <div className="section">
      <div className="notice">{r.shared_by} shared this recipe with you.</div>
      <div className="card share-cta no-print">
        {signedIn ? (
          already ? <a className="btn primary" href={"#/r/" + already.id}>Open it in my recipe box</a>
            : <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save to my recipe box"}</button>
        ) : (
          <>
            <strong>Keep this recipe</strong>
            <span className="muted small">{APP_NAME} is free. Make an account to save this recipe, snap your own paper recipes, and build shopping lists.</span>
            <button className="btn primary" onClick={() => { rememberPending(token); onSignIn?.(); }}>Save it: sign in or create an account</button>
          </>
        )}
        {!installed() && (canInstall && installEvent ? (
          <button className="btn" onClick={async () => { await installEvent!.prompt(); installEvent = null; setCanInstall(false); }}>Install the app</button>
        ) : (
          <span className="muted small">{isIos ? "To install the app on iPhone: tap the Share button in Safari, then “Add to Home Screen”." : "To install the app: open your browser menu and choose “Install app” or “Add to Home screen”."}</span>
        ))}
      </div>
      <article className="detail">
        <div className="head">
          <div className="label accent" style={{ margin: 0 }}>{r.category}</div>
          <h2>{r.title}</h2>
          <div className="meta">
            {r.prep_time && <span>Prep {r.prep_time}</span>}
            {r.cook_time && <span>Cook {r.cook_time}</span>}
            {r.servings ? <span>Serves {fmtQty(Number(r.servings))}</span> : null}
            {r.source && <span>From {r.source}</span>}
          </div>
        </div>
        <div className="body2">
          <section className="ings"><span className="label">Ingredients</span>
            <ul>{(r.ingredients || []).map((g, i) => <li key={i}><span>{ingText(g)}</span></li>)}</ul></section>
          <section className="steps"><span className="label">Directions</span>
            <ol>{(r.steps || []).map((st, i) => <li key={i}><span>{st}</span></li>)}</ol></section>
        </div>
        {r.notes && <div className="notes"><span className="label">Notes</span><p style={{ margin: 0 }}>{r.notes}</p></div>}
      </article>
    </div>
  );
}
