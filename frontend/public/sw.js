/* Task(AI)Do service worker: makes the app installable and lets the shell open offline.
 * - Page navigations: network first, falling back to the cached app shell when offline.
 * - /assets/* (content-hashed by Vite): cache first, since they never change.
 * - API calls (a different origin) are never cached.
 * Also shows push notifications for reminders and due alerts. */
const VERSION = "v3";
const SHELL = `taskaido-shell-${VERSION}`;
const ASSETS = `taskaido-assets-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png"];
const MAX_ASSETS = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("taskaido-") && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, fonts, avatars: straight to network

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", { cacheName: SHELL }).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req, { cacheName: ASSETS }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy).then(() => trim(ASSETS, MAX_ASSETS)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons, manifest, favicon: cache, refreshed in the background.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(req, { cacheName: SHELL }).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});

// ---------- Push notifications ----------

function formatDue(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Task(AI)Do", body: event.data ? event.data.text() : "" };
  }
  const meta = [data.due && `Due ${formatDue(data.due)}`, data.priority && `${data.priority} priority`].filter(Boolean).join(" · ");
  const body = [meta, data.body].filter(Boolean).join("\n");
  // Also tell any open app window, which shows an in-app toast.
  const notifyWindows = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ type: "push", title: data.title || "Task(AI)Do", body, url: data.url || "/tasks" })));
  event.waitUntil(Promise.all([notifyWindows,
    self.registration.showNotification(data.title || "Task(AI)Do", {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      timestamp: Date.now(),
      vibrate: [120, 60, 120],
      data: { url: data.url || "/tasks" },
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/tasks", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          if ("navigate" in w) w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
