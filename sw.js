/* ─────────────────────────────────────────────────────────────
   dmico life os — service worker (nudge v1)
   Minimal by design: it exists to receive the one gentle evening push
   and route a tap back into the hub. No offline caching in v1 (the hub
   is a live, Supabase-backed cockpit; a stale cache would mislead).
   ───────────────────────────────────────────────────────────── */

const SW_VERSION = "dmico-nudge-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// One gentle push → one notification. On Android this also badges the installed
// app icon automatically (the badge clears when the notification is opened/cleared).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "DMICO";
  const options = {
    body: data.body || "Something's waiting in your hub.",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: data.tag || "dmico-nudge",
    renotify: true,
    data: { url: data.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses an open hub tab (navigating it to the deep
// link) or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    (async () => {
      const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if ("focus" in c) {
          try { if (c.navigate) await c.navigate(target); } catch (e) {}
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })()
  );
});
