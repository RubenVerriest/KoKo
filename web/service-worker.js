"use strict";

const CACHE_NAME = "kosmische-koerier-v8";
const APP_SHELL = [
  "",
  "index.html",
  "styles.css",
  "game.js",
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
        APP_SHELL.map((file) => new URL(file, self.registration.scope)),
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
              name.startsWith("kosmische-koerier-")
              || name === "koko-pwa-v1"
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
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cachedPage = await cache.match(request);
        if (cachedPage) {
          return cachedPage;
        }
        const fallback = await cache.match(
          new URL("index.html", self.registration.scope),
        );
        if (fallback) {
          return fallback;
        }
        throw error;
      }
    }

    const cachedResponse = await cache.match(request);
    const networkResponse = fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch((error) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      throw error;
    });
    return cachedResponse || networkResponse;
  })());
});
