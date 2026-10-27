/* ClockTime service worker: offline app shell for the clock and kiosk, plus push notifications. */
const VERSION = "v1";
const STATIC_CACHE = `clocktime-static-${VERSION}`;
const PAGE_CACHE = `clocktime-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const CACHEABLE_PAGES = [/^\/me(\/.*)?$/, /^\/kiosk(\/.*)?$/];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((c) => c.add(OFFLINE_URL))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Sent on sign-out so a shared phone doesn't keep someone else's pages.
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const cacheable = CACHEABLE_PAGES.some((re) => re.test(url.pathname));
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable && res.ok && !res.redirected)
            caches.open(PAGE_CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(
          async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error(),
        ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ClockTime", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ClockTime", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/me" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/me";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(target).then((w) => w && w.focus());
      return self.clients.openWindow(target);
    }),
  );
});
