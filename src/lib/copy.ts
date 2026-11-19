import { supabase } from "./supabase";
import { uid, type Recipe } from "./recipes";

/** Your own saved copy of someone else's recipe, if you already have one. */
export const myCopyOf = (recipes: Recipe[], originalId: string, myId: string) =>
  recipes.find((x) => x.owner_id === myId && x.copied_from === originalId);

/** Who to credit: keep the recipe's own source if it has one, otherwise the friend who shared it. */
export const creditFor = (source: string | null | undefined, sharedBy: string) => (source || "").trim() || sharedBy;

/**
 * Save a copy of a friend's recipe into your own box.
 * The dish photo is copied into your own folder, so it stays even if your friend changes or removes theirs.
 * The original card scans stay private to the person who added them, so they aren't copied.
 */
export async function saveCopy(fields: Partial<Recipe> & { title: string }, originalId: string, sharedBy: string, myId: string): Promise<Recipe | null> {
  const { id: _i, owner_id: _o, created_at: _c, updated_at: _u, copied_from: _f, photo_paths: _p, dish_photo, ...rest } = fields;
  const { data, error } = await supabase.from("recipes")
    .insert({ ...rest, source: creditFor(rest.source, sharedBy), photo_paths: [], dish_photo: null, copied_from: originalId })
    .select().single();
  if (error || !data) return null;
  const copy = data as Recipe;
  if (dish_photo) {
    const photo = await copyDishPhoto(dish_photo, `${myId}/${copy.id}-${uid()}.jpg`);
    if (photo) {
      const { error: e2 } = await supabase.from("recipes").update({ dish_photo: photo }).eq("id", copy.id);
      if (!e2) copy.dish_photo = photo;
    }
  }
  return copy;
}

async function copyDishPhoto(from: string, to: string): Promise<string | null> {
  try {
    const url = supabase.storage.from("dish-photos").getPublicUrl(from).data.publicUrl;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const up = await supabase.storage.from("dish-photos").upload(to, blob, { contentType: "image/jpeg" });
    return up.error ? null : to;
  } catch { return null; }
}
