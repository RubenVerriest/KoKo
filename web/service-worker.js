"use strict";

const CACHE_NAME = "koko-pwa-v1";
const APP_SHELL = [
  "",
  "index.html",
  "styles.css",
  "game.js",
  "pwa-bootstrap.js",
  "manifest.json",
  "privacy.html",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(
        APP_SHELL.map((file) =>
          new Request(
            new URL(file, self.registration.scope),
            { cache: "reload" },
          )
        ),
      ))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) =>
            (
              name.startsWith("koko-pwa-")
              || name.startsWith("kosmische-koerier-")
            )
            && name !== CACHE_NAME
          )
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      if (request.mode === "navigate") {
        const fallback = await cache.match(
          new URL("index.html", self.registration.scope),
        );
        if (fallback) {
          return fallback;
        }
      }
      throw error;
    }
  })());
});
