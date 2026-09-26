/* Minimal offline shell for Add to Home Screen. */
const CACHE = 'mikaela-math-rush-v4'
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/audio/music/rush-loop.m4a',
  '/audio/sfx/tap.ogg',
  '/audio/sfx/correct.ogg',
  '/audio/sfx/miss.ogg',
  '/audio/sfx/streak-small.ogg',
  '/audio/sfx/streak-big.ogg',
  '/audio/sfx/boss-start.ogg',
  '/audio/sfx/milestone.ogg',
  '/audio/sfx/victory.ogg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          if (res.ok && new URL(event.request.url).origin === self.location.origin) {
            caches.open(CACHE).then((cache) => cache.put(event.request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
