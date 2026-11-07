import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import type { Recipe } from "../lib/recipes";
import RecipeForm from "./RecipeForm";
import { go } from "../App";

export default function RecipeEdit({ id }: { id: string }) {
  const s = useStore();
  const r = s.recipeMap.get(id);
  if (!r) return <div className="section"><p className="muted">Loading…</p></div>;
  if (r.owner_id !== s.session!.user.id) return <div className="section"><p>Only the person who added this recipe can edit it. Save a copy to your box to make changes.</p></div>;

  return (
    <div className="section">
      <RecipeForm draft={r} heading="Edit recipe" saveLabel="Save changes" onCancel={() => go("r/" + id)}
        onSave={async (d) => {
          const { id: _i, ...fields } = d;
          const { data, error } = await supabase.from("recipes").update({ ...fields, owner_id: r.owner_id, updated_at: new Date().toISOString() }).eq("id", id).select().single();
          if (error || !data) { s.toast("Couldn't save. Try again."); return; }
          s.upsertRecipeLocal(data as Recipe); s.toast("Saved"); go("r/" + id);
        }} />
    </div>
  );
}
