import { supabase } from "./supabase";
import { isInstalled, isIos } from "./install";

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (isIos && !isInstalled()) return "needs-install"; // iPhones only allow notifications for apps on the home screen
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

const toBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Asks for permission and saves this device so friends' actions can reach it. */
export async function turnOnPush(): Promise<string | null> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications weren't allowed. You can allow them in your phone's settings for this app.";
  const reg = await navigator.serviceWorker.ready;
  const { data, error } = await supabase.functions.invoke("friends", { method: "GET" });
  if (error || !data?.publicKey) return "Couldn't turn on notifications. Try again.";
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.publicKey) });
  const j = sub.toJSON();
  const { error: e2 } = await supabase.from("push_subscriptions").upsert({ endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
  if (e2) return "Couldn't save notifications for this phone. Try again.";
  supabase.functions.invoke("friends", { body: { action: "test" } });
  return null;
}

export async function turnOffPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
}

/** Lets a friend know about something you just did. Best effort: never blocks the app. */
export function alertFriend(kind: "recipe_request" | "recipe_sent" | "friend_accepted", to: string, recipeId?: string) {
  supabase.functions.invoke("friends", { body: { action: "alert", kind, to, recipe_id: recipeId } }).catch(() => {});
}
