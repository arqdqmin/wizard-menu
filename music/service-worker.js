const CACHE_NAME = "twcoffee-music-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "admin.html",
  "app.js",
  "admin.js",
  "manifest.json",
  "playlist.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
