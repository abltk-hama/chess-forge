const CACHE = "chess-forge-v1";
const ROOT = new URL("./", self.location.href).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const manifestUrl = new URL(".vite/manifest.json", ROOT);
      const manifest = await fetch(manifestUrl).then((response) =>
        response.json(),
      );
      const buildFiles = Object.values(manifest).flatMap((entry) => [
        entry.file,
        ...(entry.css ?? []),
        ...(entry.assets ?? []),
      ]);
      const discoveredScripts = (
        await Promise.all(
          buildFiles
            .filter((file) => file.endsWith(".js"))
            .map(async (file) => {
              const scriptUrl = new URL(file, ROOT);
              const source = await fetch(scriptUrl).then((response) =>
                response.text(),
              );
              return [...source.matchAll(/ai\.worker-[A-Za-z0-9_-]+\.js/g)].map(
                ([name]) => new URL(name, scriptUrl).href,
              );
            }),
        )
      ).flat();
      await cache.addAll([
        ROOT,
        manifestUrl.href,
        new URL("manifest.webmanifest", ROOT).href,
        new URL("app-icon.svg", ROOT).href,
        ...new Set(buildFiles.map((file) => new URL(file, ROOT).href)),
        ...new Set(discoveredScripts),
      ]);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(ROOT, copy));
          return response;
        })
        .catch(() => caches.match(ROOT)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
