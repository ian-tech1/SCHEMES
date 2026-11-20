const CACHE_PREFIX = "ian-tech-static-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const STATIC_ASSET = /\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|ico)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/__grok/manifest")) return;
  if (!STATIC_ASSET.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      event.waitUntil(
        fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") return cache.put(request, response.clone());
            return undefined;
          })
          .catch(() => undefined),
      );
      return cached;
    }

    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  })());
});
