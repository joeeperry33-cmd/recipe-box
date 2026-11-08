// Reads a recipe from photos (or pasted text) with Claude and returns structured JSON.
// Needs the ANTHROPIC_API_KEY secret. Only signed-in users can call it, up to DAILY_LIMIT times a day.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_LIMIT = 40; // photo reads per person per day

const CATEGORIES = ["Breakfast", "Main dish", "Side dish", "Soup & salad", "Appetizer & snack", "Bread & baking", "Dessert", "Drink", "Sauce & dressing", "Other"];
const AISLES = ["Produce", "Meat & seafood", "Dairy & eggs", "Bakery", "Pantry", "Spices & seasonings", "Canned & jarred", "Frozen", "Baking", "Drinks", "Other"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "reason", "title", "category", "tags", "servings", "prep_time", "cook_time", "ingredients", "steps", "notes", "source"],
  properties: {
    found: { type: "boolean", description: "false if the input holds no recipe" },
    reason: { type: "string", description: "when found is false, a short reason; otherwise empty" },
    title: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    tags: { type: "array", items: { type: "string" }, description: "up to 5 short lowercase tags: main ingredient, cuisine, method, diet, occasion" },
    servings: { type: ["number", "null"] },
    prep_time: { type: "string" },
    cook_time: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["qty", "unit", "item", "note", "aisle"],
        properties: {
          qty: { type: ["number", "null"], description: "decimal amount; 1 1/2 -> 1.5; low end of a range; null if none" },
          unit: { type: "string", description: "cup, tbsp, tsp, oz, lb, g, ml, clove, can, package, stick, pinch... or empty" },
          item: { type: "string", description: "ingredient name only, e.g. all-purpose flour" },
          note: { type: "string", description: "prep such as chopped or softened, or empty" },
          aisle: { type: "string", enum: AISLES },
        },
      },
    },
    steps: { type: "array", items: { type: "string" }, description: "one entry per step, without numbering" },
    notes: { type: "string", description: "tips, oven temperature not in a step, anything else written" },
    source: { type: "string", description: "whose recipe it is, if written; otherwise empty" },
  },
};

const PROMPT = `Transcribe this recipe for a home cook's recipe app. Keep the cook's wording and amounts; fix only obvious spelling. Handwriting may be messy, so read carefully. Several images are pages or sides of one recipe. Pick the single best category, and assign each ingredient the grocery aisle where it is usually found.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type ImageIn = { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "");
  if (!apiKey) return json({ error: "The photo reader isn't set up yet (missing API key)." }, 503);

  // Only real signed-in people (not the public app key) may spend AI credits.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "Sign in to read recipes." }, 401);
  const { data: allowed, error: limitErr } = await admin.rpc("bump_ai_usage", { uid: who.user.id, max_per_day: DAILY_LIMIT });
  if (limitErr) { console.error(limitErr); return json({ error: "Something went wrong. Try again." }, 500); }
  if (!allowed) return json({ error: `You've read ${DAILY_LIMIT} recipes today. Try again tomorrow, or type this one in by hand.` }, 429);

  let body: { images?: ImageIn[]; text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const images = (body.images ?? []).slice(0, 4);
  const text = (body.text ?? "").slice(0, 20000);
  if (!images.length && !text.trim()) return json({ error: "Send a photo or some recipe text." }, 400);

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map((im): Anthropic.ContentBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: im.media_type, data: im.data },
    })),
    { type: "text", text: text.trim() ? `${PROMPT}\n\nRecipe text:\n${text}` : PROMPT },
  ];

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") return json({ error: "That photo couldn't be read as a recipe." }, 422);
    const out = response.content.find((b) => b.type === "text");
    if (!out || out.type !== "text") return json({ error: "No recipe came back. Try again." }, 502);
    const recipe = JSON.parse(out.text);
    if (!recipe.found) return json({ error: recipe.reason || "No recipe found in that." }, 422);
    return json({ recipe });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many requests right now. Wait a minute and try again." }, 429);
    if (e instanceof Anthropic.APIError) console.error("Claude API error", e.status, e.message, "key starts with", apiKey.slice(0, 10), "length", apiKey.length);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "The photo reader's API key isn't valid." }, 503);
    if (e instanceof Anthropic.BadRequestError) return json({ error: "That photo couldn't be read. Try a JPEG or PNG." }, 400);
    console.error(e);
    return json({ error: "Something went wrong reading that. Try again." }, 502);
  }
});
