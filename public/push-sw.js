// Phone notifications (loaded by the app's service worker).
self.addEventListener("push", (event) => {
  let msg = { title: "Recipe Box", body: "", url: "/" };
  try { msg = { ...msg, ...event.data.json() }; } catch { /* plain text */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: msg.url }, tag: msg.url,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
