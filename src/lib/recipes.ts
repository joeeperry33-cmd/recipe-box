export const CATEGORIES = ["Breakfast", "Main dish", "Side dish", "Soup & salad", "Appetizer & snack", "Bread & baking", "Dessert", "Drink", "Sauce & dressing", "Other"];
export const AISLES = ["Produce", "Meat & seafood", "Dairy & eggs", "Bakery", "Pantry", "Spices & seasonings", "Canned & jarred", "Frozen", "Baking", "Drinks", "Other"];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Anytime"];

export type Ingredient = { qty: number | null; unit: string; item: string; note: string; aisle: string };
export type Recipe = {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  tags: string[];
  servings: number | null;
  prep_time: string;
  cook_time: string;
  ingredients: Ingredient[];
  steps: string[];
  notes: string;
  source: string;
  photo_paths: string[];
  copied_from: string | null;
  created_at?: string;
  updated_at?: string;
};
export type PlanEntry = { id: string; recipe_id: string; day: string; servings: number | null };
export type ListItem = {
  key: string; name: string; unit: string; qty: number | null; amount?: string;
  aisle: string; from: string[]; have: boolean; got: boolean; manual?: boolean;
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const UNITS = new Set(["cup", "cups", "c", "tbsp", "tablespoon", "tablespoons", "tbs", "tsp", "teaspoon", "teaspoons", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "g", "gram", "grams", "kg", "ml", "l", "liter", "liters", "pinch", "dash", "clove", "cloves", "can", "cans", "package", "packages", "pkg", "stick", "sticks", "slice", "slices", "quart", "quarts", "qt", "pint", "pints", "pt", "gallon", "bunch", "head", "jar", "bottle", "sprig", "sprigs", "box", "bag"]);
const UNIT_NORM: Record<string, string> = { c: "cup", cups: "cup", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", teaspoon: "tsp", teaspoons: "tsp", ounce: "oz", ounces: "oz", lbs: "lb", pound: "lb", pounds: "lb", gram: "g", grams: "g", liter: "l", liters: "l", cloves: "clove", cans: "can", packages: "package", pkg: "package", sticks: "stick", slices: "slice", quarts: "quart", qt: "quart", pints: "pint", pt: "pint", sprigs: "sprig" };
const COUNTABLE = new Set(["cup", "clove", "can", "package", "stick", "slice", "quart", "pint", "sprig", "bunch", "head", "jar", "bottle", "box", "bag"]);

export const normUnit = (u: string) => { const x = (u || "").toLowerCase().replace(/\.$/, ""); return UNIT_NORM[x] || x; };
export const unitFor = (unit: string, q: number | null) => (unit && q != null && q > 1 && COUNTABLE.has(unit) ? unit + "s" : unit);

const AISLE_WORDS: [string, RegExp][] = [
  ["Frozen", /\bfrozen\b/i],
  ["Canned & jarred", /\b(canned|can of|broth|stock|tomato sauce|tomato paste|beans|soup)\b/i],
  ["Spices & seasonings", /\b(salt|black pepper|cinnamon|nutmeg|paprika|cumin|oregano|thyme|chili powder|spice|seasoning|bay lea|vanilla|extract)/i],
  ["Baking", /\b(flour|sugar|baking soda|baking powder|yeast|cocoa|chocolate chip|shortening|cornstarch|molasses)/i],
  ["Meat & seafood", /\b(chicken|beef|pork|bacon|sausage|turkey|ham|lamb|steak|shrimp|salmon|fish|tuna)/i],
  ["Dairy & eggs", /\b(milk|butter|cheese|cream|yogurt|eggs?|buttermilk|parmesan|cheddar|mozzarella)\b/i],
  ["Produce", /\b(onion|garlic|tomato|potato|carrot|celery|bell pepper|lettuce|spinach|kale|apple|banana|lemon|lime|orange|berr|parsley|cilantro|basil|mint|ginger|mushroom|zucchini|squash|cucumber|avocado|cabbage|broccoli|cauliflower|scallion|shallot|leek|grape|peach|pear)/i],
  ["Bakery", /\b(bread|buns?|rolls?|tortillas?|bagels?|pita)\b/i],
  ["Pantry", /\b(rice|pasta|noodle|oil|vinegar|honey|syrup|oats|bread crumb|cracker|nuts?|peanut|soy sauce|ketchup|mustard|mayo|cereal)/i],
  ["Drinks", /\b(juice|soda|wine|beer|coffee|tea)\b/i],
];
export const guessAisle = (item: string) => AISLE_WORDS.find(([, re]) => re.test(item))?.[0] ?? "Other";

const FRAC: [number, string][] = [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"]];
const VULGAR: Record<string, string> = { "⅛": "1/8", "¼": "1/4", "⅓": "1/3", "⅜": "3/8", "½": "1/2", "⅝": "5/8", "⅔": "2/3", "¾": "3/4", "⅞": "7/8" };

export function fmtQty(q: number | null | undefined): string {
  if (q == null || isNaN(q) || q <= 0) return "";
  const whole = Math.floor(q + 1e-6), rest = q - whole;
  if (rest < 0.04) return String(whole);
  for (const [v, s] of FRAC) if (Math.abs(rest - v) < 0.04) return (whole ? whole + " " : "") + s;
  return String(Math.round(q * 100) / 100);
}

export function parseQty(s: string): number | null {
  s = s.trim().replace(/[⅛¼⅓⅜½⅝⅔¾⅞]/g, (m) => " " + VULGAR[m]).trim();
  let t = 0, ok = false;
  for (const part of s.split(/\s+/)) {
    if (/^\d+\/\d+$/.test(part)) { const [a, b] = part.split("/").map(Number); if (b) { t += a / b; ok = true; } }
    else if (/^\d*\.?\d+$/.test(part)) { t += Number(part); ok = true; }
  }
  return ok ? t : null;
}

export function ingText(g: Ingredient, mult = 1): string {
  const q = g.qty != null ? g.qty * mult : null;
  return [fmtQty(q), unitFor(normUnit(g.unit), q), g.item].filter(Boolean).join(" ") + (g.note ? ", " + g.note : "");
}

export function parseIngLine(line: string, prev: Ingredient[] = []): Ingredient | null {
  line = line.replace(/^[-•*\s]+/, "").trim();
  if (!line) return null;
  let note = "";
  const ci = line.indexOf(",");
  if (ci > 0) { note = line.slice(ci + 1).trim(); line = line.slice(0, ci).trim(); }
  const m = line.match(/^((?:\d+\s+)?\d+\/\d+|\d*\.?\d+(?:\s+\d+\/\d+)?|\d*\s*[⅛¼⅓⅜½⅝⅔¾⅞])\s*(.*)$/);
  let qty: number | null = null, rest = line;
  if (m) { qty = parseQty(m[1]); rest = m[2]; }
  let unit = "";
  const um = rest.match(/^([a-zA-Z]+\.?)\s+(.*)$/);
  if (um && qty != null && UNITS.has(um[1].toLowerCase().replace(/\.$/, ""))) { unit = normUnit(um[1]); rest = um[2]; }
  rest = rest.replace(/^of\s+/i, "");
  const old = prev.find((p) => p.item.toLowerCase() === rest.toLowerCase());
  return { qty, unit, item: rest, note, aisle: old?.aisle || guessAisle(rest) };
}

// Stores in the US sell by ounces and pounds, so metric amounts are converted for the shopping list.
// Weights are added up in ounces and metric liquids in milliliters, then shown in the unit a store would use.
const TO_OZ: Record<string, number> = { g: 1 / 28.3495, kg: 1000 / 28.3495, oz: 1, lb: 16 };
const TO_ML: Record<string, number> = { ml: 1, l: 1000 };
// Rounds up to a store-friendly step, ignoring tiny overshoots from unit conversion (227 g is 8 oz, not 8.5).
const up = (x: number, step: number) => Math.max(step, Math.ceil(x / step - 0.05) * step);

/** Turns a recipe amount into the unit used to add it up on the shopping list. */
export function listUnit(unit: string, qty: number | null): { unit: string; qty: number | null } {
  if (unit in TO_OZ) return { unit: "oz", qty: qty == null ? null : qty * TO_OZ[unit] };
  if (unit in TO_ML) return { unit: "ml", qty: qty == null ? null : qty * TO_ML[unit] };
  return { unit, qty };
}

/** Shows an added-up amount the way it's sold: ounces up to a pound, then pounds; metric liquids as tsp, tbsp or fl oz. */
export function storeAmount(unit: string, qty: number | null): { unit: string; qty: number | null } {
  if (qty == null) return { unit: unit === "ml" ? "fl oz" : unit, qty };
  if (unit === "oz") { const oz = up(qty, qty < 1 ? 0.25 : 0.5); return oz >= 16 ? { unit: "lb", qty: up(qty / 16, 0.25) } : { unit: "oz", qty: oz }; }
  if (unit === "ml") {
    if (qty < 15) return { unit: "tsp", qty: up(qty / 4.929, 0.25) };
    if (qty < 60) return { unit: "tbsp", qty: up(qty / 14.787, 0.5) };
    return { unit: "fl oz", qty: up(qty / 29.574, 1) };
  }
  return { unit, qty: Math.round(qty * 100) / 100 };
}

/** Merges the ingredients of every planned meal into one list, keeping what the cook already ticked or edited. */
export function buildList(entries: PlanEntry[], recipes: Map<string, Recipe>, old: ListItem[]): ListItem[] {
  const prev = new Map(old.map((i) => [i.key, i]));
  const merged = new Map<string, ListItem & { hasQty: boolean }>();
  for (const e of entries) {
    const r = recipes.get(e.recipe_id);
    if (!r) continue;
    const base = Number(r.servings) || 0;
    const mult = base && e.servings ? e.servings / base : 1;
    for (const g of r.ingredients || []) {
      const name = (g.item || "").trim();
      if (!name) continue;
      const conv = listUnit(normUnit(g.unit), g.qty);
      const unit = conv.unit;
      const key = (name.toLowerCase().replace(/(es|s)$/, "") + "|" + unit).replace(/[^a-z0-9|]+/g, "-");
      const cur = merged.get(key) ?? { key, name, unit, qty: 0, hasQty: false, aisle: g.aisle || guessAisle(name), from: [], have: false, got: false };
      if (conv.qty != null) { cur.qty = (cur.qty ?? 0) + conv.qty * mult; cur.hasQty = true; }
      if (!cur.from.includes(r.title)) cur.from.push(r.title);
      merged.set(key, cur);
    }
  }
  const items: ListItem[] = [...merged.values()].map(({ hasQty, ...i }) => {
    const o = prev.get(i.key);
    const shown = storeAmount(i.unit, hasQty ? i.qty : null);
    return { ...i, unit: shown.unit, qty: shown.qty, have: o?.have ?? false, got: o?.got ?? false };
  });
  for (const o of old) if (o.manual) items.push(o);
  return items;
}

export const amountText = (i: ListItem) => i.amount ?? [fmtQty(i.qty), unitFor(i.unit, i.qty)].filter(Boolean).join(" ");

export function listText(items: ListItem[]): string {
  const need = items.filter((i) => !i.have && !i.got);
  return AISLES.map((a) => {
    const xs = need.filter((i) => (i.aisle || "Other") === a);
    return xs.length ? a + "\n" + xs.map((i) => "☐ " + [amountText(i), i.name].filter(Boolean).join(" ")).join("\n") : "";
  }).filter(Boolean).join("\n\n");
}

export function recipeText(r: Recipe): string {
  return [
    r.title,
    [r.category, r.servings ? "Serves " + r.servings : "", r.prep_time ? "Prep " + r.prep_time : "", r.cook_time ? "Cook " + r.cook_time : ""].filter(Boolean).join(" · "),
    "", "INGREDIENTS", ...(r.ingredients || []).map((g) => "• " + ingText(g)),
    "", "DIRECTIONS", ...(r.steps || []).map((s, i) => `${i + 1}. ${s}`),
    ...(r.notes ? ["", "NOTES", r.notes] : []),
  ].join("\n");
}

export function cleanAiRecipe(d: Record<string, unknown>): Omit<Recipe, "id" | "owner_id"> {
  const ings = Array.isArray(d.ingredients) ? (d.ingredients as Record<string, unknown>[]) : [];
  return {
    title: String(d.title || "Untitled recipe").slice(0, 160),
    category: CATEGORIES.includes(String(d.category)) ? String(d.category) : "Other",
    tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 6) : [],
    servings: Number(d.servings) || null,
    prep_time: String(d.prep_time || ""),
    cook_time: String(d.cook_time || ""),
    ingredients: ings.map((g) => ({
      qty: g.qty == null || isNaN(Number(g.qty)) ? null : Number(g.qty),
      unit: normUnit(String(g.unit || "")),
      item: String(g.item || "").trim(),
      note: String(g.note || ""),
      aisle: AISLES.includes(String(g.aisle)) ? String(g.aisle) : guessAisle(String(g.item || "")),
    })).filter((g) => g.item),
    steps: Array.isArray(d.steps) ? d.steps.map(String).filter(Boolean) : [],
    notes: String(d.notes || ""),
    source: String(d.source || ""),
    photo_paths: [],
    copied_from: null,
  };
}
