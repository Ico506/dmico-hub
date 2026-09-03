/* ─────────────────────────────────────────────────────────────
   dmico life os service worker (nudge v2)
   Two jobs: receive the one gentle evening push and route a tap back
   into the hub, and make sure a deploy actually reaches the browser.

   No offline caching, deliberately: the hub is a live, Supabase-backed
   cockpit and a stale cache would mislead. v1 said that and then left
   the browser's own HTTP cache free to serve month-old JavaScript
   anyway, which is exactly what happened on 3 Sep 2026 (the "fixed"
   bucket had shipped days earlier and never arrived). v2 closes it.
   ───────────────────────────────────────────────────────────── */

const SW_VERSION = "dmico-nudge-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Deploys must arrive. Same-origin HTML, JS and CSS are fetched network-first with
// cache bypassed, so a push to Pages is visible on the next reload rather than whenever
// the browser feels like revalidating. index.html carries ?v= tokens as the first line
// of defence; this is the safety net for when a token bump is forgotten.
//
// The fallback is a normal fetch, which may be served from the HTTP cache. That is the
// old behaviour, so a flaky network degrades to what it did before instead of a blank
// page. There is still no offline story here, and there was never meant to be.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const isPage  = req.mode === "navigate";
  const isAsset = /\.(?:js|css|html)$/i.test(url.pathname);
  if (!isPage && !isAsset) return;

  event.respondWith(
    fetch(req, { cache: "no-store" }).catch(() => fetch(req))
  );
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
