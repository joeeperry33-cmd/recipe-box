// Friend invites and phone notifications.
//   GET                          -> { publicKey } for turning on notifications
//   POST { action: "invite", email }            -> friend request (app users) or an email invite (everyone else)
//   POST { action: "alert", kind, to, recipe_id? } -> phone notification about something the caller just did
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SITE = "https://www.reciperolodex.app";
const INVITES_PER_DAY = 10;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Keys for phone notifications, made once and kept in the database. */
async function keys(): Promise<{ public_key: string; private_key: string }> {
  const { data } = await admin.rpc("get_push_keys");
  if (data?.[0]) return data[0];
  const k = webpush.generateVAPIDKeys();
  await admin.rpc("save_push_keys", { pub: k.publicKey, priv: k.privateKey });
  const { data: again } = await admin.rpc("get_push_keys");
  return again[0];
}

async function notify(userId: string, msg: { title: string; body: string; url: string }) {
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return 0;
  const k = await keys();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg),
        { vapidDetails: { subject: SITE, publicKey: k.public_key, privateKey: k.private_key }, TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); // phone turned them off
      else console.error("push failed", code, (e as Error).message);
    }
  }));
  return sent;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ publicKey: (await keys()).public_key });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "Sign in first." }, 401);
  const me = who.user.id;
  const { data: myProfile } = await admin.from("profiles").select("display_name, email").eq("id", me).single();
  const myName = myProfile?.display_name || myProfile?.email || "A friend";

  let body: { action?: string; email?: string; kind?: string; to?: string; recipe_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  if (body.action === "invite") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: "That doesn't look like an email address." }, 400);
    // Run the friend request as the caller, so the usual rules apply.
    const asMe = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: result, error } = await asMe.rpc("send_friend_request", { friend_email: email });
    if (error) { console.error(error); return json({ error: "Couldn't send that. Try again." }, 500); }
    if (result === "sent") {
      const { data: them } = await admin.from("profiles").select("id").ilike("email", email).single();
      if (them) await notify(them.id, { title: "New friend request", body: `${myName} wants to share recipes with you.`, url: "/#/friends" });
      return json({ result });
    }
    if (result !== "not_found") return json({ result });

    // Not in the app yet: email them an invite. Capped per person per day.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from("invite_log").select("id", { count: "exact", head: true }).eq("from_user", me).gte("created_at", since);
    if ((count ?? 0) >= INVITES_PER_DAY) return json({ error: `You've sent ${INVITES_PER_DAY} email invites today. Try again tomorrow.` }, 429);
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: SITE + "/",
      data: { display_name: email.split("@")[0], invited_by: myName, needs_password: true },
    });
    if (invErr || !inv?.user) {
      console.error("invite", invErr?.status, invErr?.message);
      const limited = invErr?.status === 429 || /rate limit/i.test(invErr?.message ?? "");
      return json({ error: limited ? "Too many emails went out this hour. Try again in an hour, or use \"Email them a heads-up\" to send it from your own email." : "Couldn't email an invite to that address." }, limited ? 429 : 502);
    }
    await admin.from("invite_log").insert({ from_user: me, email });
    // Their account now exists (the sign-up trigger made a profile), so the friend request can wait for them.
    await admin.from("friendships").insert({ requester: me, addressee: inv.user.id });
    return json({ result: "invited" });
  }

  if (body.action === "alert") {
    const to = body.to ?? "";
    const recent = new Date(Date.now() - 10 * 60_000).toISOString();
    if (body.kind === "recipe_request") {
      const { data } = await admin.from("recipe_requests").select("note").eq("from_user", me).eq("to_user", to).eq("status", "open").gte("created_at", recent).limit(1).maybeSingle();
      if (!data) return json({ sent: 0 });
      return json({ sent: await notify(to, { title: `${myName} asked for a recipe`, body: data.note, url: "/#/friends" }) });
    }
    if (body.kind === "recipe_sent") {
      const { data } = await admin.from("recipe_shares").select("recipes(title)").eq("shared_by", me).eq("shared_with", to).eq("recipe_id", body.recipe_id ?? "").gte("created_at", recent).maybeSingle();
      if (!data) return json({ sent: 0 });
      const title = (data as { recipes?: { title?: string } }).recipes?.title || "a recipe";
      return json({ sent: await notify(to, { title: `${myName} shared a recipe`, body: title, url: "/#/r/" + body.recipe_id }) });
    }
    if (body.kind === "friend_accepted") {
      const { data } = await admin.from("friendships").select("id").eq("requester", to).eq("addressee", me).eq("status", "accepted").limit(1).maybeSingle();
      if (!data) return json({ sent: 0 });
      return json({ sent: await notify(to, { title: "Friend request accepted", body: `${myName} and you can now share recipes.`, url: "/#/friends" }) });
    }
    return json({ error: "Unknown alert" }, 400);
  }
  if (body.action === "test") return json({ sent: await notify(me, { title: "Notifications are on", body: "You'll hear about friend requests and shared recipes here.", url: "/#/friends" }) });
  return json({ error: "Unknown action" }, 400);
});
