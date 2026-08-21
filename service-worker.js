const CACHE_NAME = "deep-srs-v7";
const ASSETS = [
  "./",
  "index.html",
  "app.js",
  "srs.js",
  "style.css",
  "questions.json",
  "flows.json",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
const NETWORK_FIRST = ["questions.json", "flows.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) =>
          fetch(url, { cache: "reload" }).then((resp) => cache.put(url, resp))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // questions.json / flows.json grow over time as new subjects are added (see
  // notes_ingest/). Network-first so an online phone always sees new content
  // without needing a CACHE_NAME bump on every update; falls back to cache
  // when offline.
  if (NETWORK_FIRST.some((f) => event.request.url.endsWith(f))) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
