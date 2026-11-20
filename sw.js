const CACHE = "gold-signal-pro-v02";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/style.css", "/app.js", "/manifest.json"]))));
self.addEventListener("fetch", event => {
  if (event.request.url.includes("/api/")) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});