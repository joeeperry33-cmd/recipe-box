import { supabase } from "./supabase";

export const APP_NAME = "Recipe Box";
export const linkUrl = (token: string) => `${location.origin}/#/s/${token}`;

/** Returns the share link for one of your recipes, making it the first time. */
export async function recipeLink(recipeId: string): Promise<string | null> {
  const { data: found } = await supabase.from("recipe_links").select("token").eq("recipe_id", recipeId).limit(1).maybeSingle();
  if (found) return linkUrl(found.token);
  const { data, error } = await supabase.from("recipe_links").insert({ recipe_id: recipeId }).select("token").single();
  return error || !data ? null : linkUrl(data.token);
}

/** Opens the person's own email app with a ready-to-send message. Nothing is sent until they press Send. */
export function openEmail(subject: string, body: string, to = "") {
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const shareEmailBody = (title: string, url: string, from: string) =>
  `Hi!\n\n${from ? from + " shared" : "Here's"} a recipe with you: ${title}\n\nOpen it here:\n${url}\n\n` +
  `You can read it right away. To keep it, make a free ${APP_NAME} account and add the app to your phone's home screen. It reads paper recipes from photos and builds shopping lists too.`;

const PENDING = "pendingShareLink";
export const rememberPending = (token: string) => { try { localStorage.setItem(PENDING, token); } catch { /* private mode */ } };
export const takePending = () => { try { const t = localStorage.getItem(PENDING); localStorage.removeItem(PENDING); return t; } catch { return null; } };

/** Where people ask for help, such as a higher daily limit. Set to an email address to show a link. */
export const SUPPORT_EMAIL = "";
export const DAILY_AI_LIMIT = 40;
export const limitNote = `Need more than ${DAILY_AI_LIMIT} a day? Contact support${SUPPORT_EMAIL ? " at " + SUPPORT_EMAIL : ""} to have your limit raised.`;
/** Adds the support note to the daily-limit error from the AI functions. */
export const withLimitNote = (msg: string) => (/today/i.test(msg) && /\b40\b/.test(msg) ? `${msg} ${limitNote}` : msg);
